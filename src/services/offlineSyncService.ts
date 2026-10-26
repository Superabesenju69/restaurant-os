/**
 * offlineSyncService.ts
 *
 * Built-in Offline-First Sync Engine for Restaurant OS POS.
 * Works out-of-the-box on both Android Native (APK) and Web (Vercel) using
 * AsyncStorage local caching + persistent FIFO mutation queue with smart deduplication.
 * Also coordinates with PowerSync when EXPO_PUBLIC_POWERSYNC_URL is configured.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../utils/supabase';

export type CacheBucketKey =
    | 'menu_catalog'
    | 'settings_catalog'
    | 'orders_list'
    | 'active_cash_shift'
    | 'pos_users';

export type OfflineMutationPayload =
    | {
          type: 'UPSERT_ORDER';
          order: Record<string, any>;
          lineItems: Array<Record<string, any>>;
      }
    | {
          type: 'CREATE_KITCHEN_TICKET';
          ticket: Record<string, any>;
          ticketItems: Array<Record<string, any>>;
      }
    | {
          type: 'COMPLETE_CHECKOUT';
          orderId: string;
          orderSnapshot?: Record<string, any>;
          lineItemsSnapshot?: Array<Record<string, any>>;
          totalAmount: number;
          taxAmount: number;
          tableId: string | null;
          payments: Array<Record<string, any>>;
          ticketData?: {
              ticket: Record<string, any>;
              ticketItems: Array<Record<string, any>>;
          } | null;
      }
    | {
          type: 'VOID_ORDER';
          orderId: string;
          tableId?: string | null;
      }
    | {
          type: 'UPDATE_TABLE_STATUS';
          tableId: string;
          status: string;
          reservedBy?: string | null;
          reservedAt?: string | null;
      }
    | {
          type: 'ADJUST_STOCK';
          itemId: string;
          delta: number;
      }
    | {
          type: 'CASH_SHIFT_OP';
          op: 'open' | 'close' | 'adjustment';
          payload: Record<string, any>;
      };

export interface OfflineMutationRecord {
    id: string;
    tenantId: string;
    createdAt: string;
    mutation: OfflineMutationPayload;
}

/**
 * Generates an RFC4122 v4 compliant UUID on the client so orders, line items,
 * kitchen tickets, and cash shifts can be created with zero network latency.
 */
export function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Determines whether an error returned by Supabase/fetch is a network connectivity failure.
 */
export function isNetworkError(err: any): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return true;
    }
    if (!err) return false;
    const msg = String(err.message || err.details || err || '').toLowerCase();
    return (
        msg.includes('failed to fetch') ||
        msg.includes('network request failed') ||
        msg.includes('networkerror') ||
        msg.includes('load failed') ||
        msg.includes('offline') ||
        msg.includes('timeout') ||
        msg.includes('aborted') ||
        msg.includes('econnrefused') ||
        msg.includes('enotfound')
    );
}

/**
 * Quick connectivity check across Web and React Native.
 */
export async function checkOnlineStatus(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return false;
    }
    try {
        const { error } = await supabase
            .from('restaurant_settings')
            .select('id')
            .limit(1);
        if (error && isNetworkError(error)) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

function getCacheStorageKey(tenantId: string, key: CacheBucketKey): string {
    return `@offline_cache:${tenantId}:${key}`;
}

function getQueueStorageKey(tenantId: string): string {
    return `@offline_mutation_queue:${tenantId}`;
}

function getOrderSeqStorageKey(tenantId: string): string {
    return `@offline_order_seq:${tenantId}`;
}

/**
 * Save a JSON-serializable snapshot to AsyncStorage scoped by tenantId.
 */
export async function saveLocalCache<T>(
    tenantId: string | null | undefined,
    key: CacheBucketKey,
    data: T
): Promise<void> {
    if (!tenantId) return;
    try {
        await AsyncStorage.setItem(
            getCacheStorageKey(tenantId, key),
            JSON.stringify({
                updatedAt: Date.now(),
                data,
            })
        );
    } catch (e) {
        console.warn(`[OfflineCache] Failed to save ${key}:`, e);
    }
}

/**
 * Load a cached snapshot from AsyncStorage scoped by tenantId.
 */
export async function loadLocalCache<T>(
    tenantId: string | null | undefined,
    key: CacheBucketKey
): Promise<T | null> {
    if (!tenantId) return null;
    try {
        const raw = await AsyncStorage.getItem(getCacheStorageKey(tenantId, key));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return (parsed?.data as T) ?? null;
    } catch (e) {
        console.warn(`[OfflineCache] Failed to load ${key}:`, e);
        return null;
    }
}

/**
 * Generates or increments a sequential order number locally so offline orders
 * receive human-friendly order numbers (e.g. "1042") immediately.
 */
export async function getNextLocalOrderNumber(
    tenantId: string | null | undefined,
    knownOrders: Array<{ order_number?: string | number | null }> = []
): Promise<string> {
    const safeTenant = tenantId || 'default';
    const storageKey = getOrderSeqStorageKey(safeTenant);
    let highestKnown = 100;

    for (const o of knownOrders) {
        const parsed = parseInt(String(o?.order_number || ''), 10);
        if (!isNaN(parsed) && parsed > highestKnown) {
            highestKnown = parsed;
        }
    }

    try {
        const savedRaw = await AsyncStorage.getItem(storageKey);
        const savedNum = savedRaw ? parseInt(savedRaw, 10) : 0;
        const nextNum = Math.max(highestKnown, isNaN(savedNum) ? 0 : savedNum) + 1;
        await AsyncStorage.setItem(storageKey, String(nextNum));
        return String(nextNum);
    } catch {
        return String(highestKnown + 1);
    }
}

/**
 * Update the local order sequence tracker whenever server order numbers arrive.
 */
export async function syncLocalOrderSequence(
    tenantId: string | null | undefined,
    serverOrderNumber: string | number | null | undefined
): Promise<void> {
    if (!tenantId || !serverOrderNumber) return;
    const parsed = parseInt(String(serverOrderNumber), 10);
    if (isNaN(parsed)) return;
    try {
        const storageKey = getOrderSeqStorageKey(tenantId);
        const savedRaw = await AsyncStorage.getItem(storageKey);
        const savedNum = savedRaw ? parseInt(savedRaw, 10) : 0;
        if (parsed > (isNaN(savedNum) ? 0 : savedNum)) {
            await AsyncStorage.setItem(storageKey, String(parsed));
        }
    } catch {
        // Ignore storage errors
    }
}

/**
 * Retrieve all pending offline mutations for a tenant.
 */
export async function getOfflineQueue(
    tenantId: string | null | undefined
): Promise<OfflineMutationRecord[]> {
    if (!tenantId) return [];
    try {
        const raw = await AsyncStorage.getItem(getQueueStorageKey(tenantId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Enqueue a mutation for background synchronization when offline.
 * Deduplicates consecutive `UPSERT_ORDER` and `UPDATE_TABLE_STATUS` operations
 * on the same entity so rapid cart edits only store the latest state.
 */
export async function enqueueOfflineMutation(
    tenantId: string | null | undefined,
    mutation: OfflineMutationPayload
): Promise<number> {
    if (!tenantId) return 0;
    try {
        const queue = await getOfflineQueue(tenantId);

        if (mutation.type === 'UPSERT_ORDER') {
            const existingIdx = queue.findIndex(
                (item) =>
                    item.mutation.type === 'UPSERT_ORDER' &&
                    item.mutation.order?.id === mutation.order?.id
            );
            if (existingIdx !== -1) {
                queue[existingIdx] = {
                    ...queue[existingIdx],
                    createdAt: new Date().toISOString(),
                    mutation,
                };
                await AsyncStorage.setItem(getQueueStorageKey(tenantId), JSON.stringify(queue));
                return queue.length;
            }
        } else if (mutation.type === 'UPDATE_TABLE_STATUS') {
            const existingIdx = queue.findIndex(
                (item) =>
                    item.mutation.type === 'UPDATE_TABLE_STATUS' &&
                    item.mutation.tableId === mutation.tableId
            );
            if (existingIdx !== -1) {
                queue[existingIdx] = {
                    ...queue[existingIdx],
                    createdAt: new Date().toISOString(),
                    mutation,
                };
                await AsyncStorage.setItem(getQueueStorageKey(tenantId), JSON.stringify(queue));
                return queue.length;
            }
        }

        const record: OfflineMutationRecord = {
            id: generateUUID(),
            tenantId,
            createdAt: new Date().toISOString(),
            mutation,
        };
        queue.push(record);
        await AsyncStorage.setItem(getQueueStorageKey(tenantId), JSON.stringify(queue));
        return queue.length;
    } catch (e) {
        console.warn('[OfflineQueue] Failed to enqueue mutation:', e);
        return 0;
    }
}

/**
 * Execute a single queued mutation against Supabase idempotently.
 */
async function executeQueuedMutation(record: OfflineMutationRecord): Promise<void> {
    const { mutation, tenantId } = record;

    switch (mutation.type) {
        case 'UPSERT_ORDER': {
            const { order, lineItems } = mutation;
            const { error: orderErr } = await supabase
                .from('orders')
                .upsert({ ...order, tenant_id: order.tenant_id || tenantId }, { onConflict: 'id' });
            if (orderErr && isNetworkError(orderErr)) throw orderErr;

            // Replace order_line_items for this order
            const { error: delErr } = await supabase
                .from('order_line_items')
                .delete()
                .eq('order_id', order.id);
            if (delErr && isNetworkError(delErr)) throw delErr;

            if (lineItems && lineItems.length > 0) {
                const { error: insErr } = await supabase
                    .from('order_line_items')
                    .insert(lineItems);
                if (insErr && isNetworkError(insErr)) throw insErr;
            }
            break;
        }

        case 'CREATE_KITCHEN_TICKET': {
            const { ticket, ticketItems } = mutation;
            const { error: tErr } = await supabase
                .from('kitchen_tickets')
                .upsert(ticket, { onConflict: 'id' });
            if (tErr && isNetworkError(tErr)) throw tErr;

            if (ticketItems && ticketItems.length > 0) {
                const { error: tiErr } = await supabase
                    .from('kitchen_ticket_items')
                    .upsert(ticketItems, { onConflict: 'id' });
                if (tiErr && isNetworkError(tiErr)) throw tiErr;
            }
            break;
        }

        case 'COMPLETE_CHECKOUT': {
            const {
                orderId,
                orderSnapshot,
                lineItemsSnapshot,
                totalAmount,
                taxAmount,
                tableId,
                payments,
                ticketData,
            } = mutation;

            // Ensure the order and its line items exist in Supabase first (if created offline)
            if (orderSnapshot) {
                const { error: upErr } = await supabase
                    .from('orders')
                    .upsert(
                        {
                            ...orderSnapshot,
                            status: 'completed',
                            total_amount: totalAmount,
                            tax_amount: taxAmount,
                            tenant_id: orderSnapshot.tenant_id || tenantId,
                        },
                        { onConflict: 'id' }
                    );
                if (upErr && isNetworkError(upErr)) throw upErr;
            }

            if (lineItemsSnapshot && lineItemsSnapshot.length > 0) {
                await supabase.from('order_line_items').delete().eq('order_id', orderId);
                const { error: liErr } = await supabase
                    .from('order_line_items')
                    .insert(lineItemsSnapshot);
                if (liErr && isNetworkError(liErr)) throw liErr;
            }

            // Try atomic RPC first, fall back to individual statements
            const { error: rpcErr } = await supabase.rpc('complete_order_checkout', {
                p_order_id: orderId,
                p_tenant_id: tenantId,
                p_total_amount: totalAmount,
                p_tax_amount: taxAmount,
                p_table_id: tableId,
                p_payments: payments,
            });

            if (rpcErr) {
                if (isNetworkError(rpcErr)) throw rpcErr;

                // Fallback to step-by-step update if RPC is not deployed yet
                const { error: ordUpdErr } = await supabase
                    .from('orders')
                    .update({
                        status: 'completed',
                        total_amount: totalAmount,
                        tax_amount: taxAmount,
                    })
                    .eq('id', orderId);
                if (ordUpdErr && isNetworkError(ordUpdErr)) throw ordUpdErr;

                if (payments && payments.length > 0) {
                    const { error: payErr } = await supabase
                        .from('payments')
                        .upsert(payments, { onConflict: 'id' });
                    if (payErr && isNetworkError(payErr)) throw payErr;
                }

                if (tableId) {
                    await supabase
                        .from('tables')
                        .update({ status: 'available' })
                        .eq('id', tableId);
                }
            }

            if (ticketData?.ticket) {
                await supabase
                    .from('kitchen_tickets')
                    .upsert(ticketData.ticket, { onConflict: 'id' });
                if (ticketData.ticketItems && ticketData.ticketItems.length > 0) {
                    await supabase
                        .from('kitchen_ticket_items')
                        .upsert(ticketData.ticketItems, { onConflict: 'id' });
                }
            }
            break;
        }

        case 'VOID_ORDER': {
            const { orderId, tableId } = mutation;
            const { error: vErr } = await supabase
                .from('orders')
                .update({ status: 'voided' })
                .eq('id', orderId);
            if (vErr && isNetworkError(vErr)) throw vErr;

            await supabase
                .from('kitchen_tickets')
                .update({ status: 'voided' })
                .eq('order_id', orderId);

            if (tableId) {
                await supabase
                    .from('tables')
                    .update({ status: 'available' })
                    .eq('id', tableId);
            }
            break;
        }

        case 'UPDATE_TABLE_STATUS': {
            const { tableId, status, reservedBy, reservedAt } = mutation;
            const { error: tblErr } = await supabase
                .from('tables')
                .update({
                    status,
                    reserved_by: status === 'reserved' ? reservedBy || null : null,
                    reserved_at: status === 'reserved' ? reservedAt || null : null,
                })
                .eq('id', tableId);
            if (tblErr && isNetworkError(tblErr)) throw tblErr;
            break;
        }

        case 'ADJUST_STOCK': {
            const { itemId, delta } = mutation;
            const { error: rpcError } = await supabase.rpc('adjust_item_stock', {
                p_item_id: itemId,
                p_delta: delta,
            });
            if (rpcError) {
                if (isNetworkError(rpcError)) throw rpcError;
                const { data: currentItem } = await supabase
                    .from('items')
                    .select('stock_level, track_inventory')
                    .eq('id', itemId)
                    .single();
                if (currentItem?.track_inventory) {
                    const nextStock = Math.max(0, (currentItem.stock_level ?? 0) + delta);
                    await supabase
                        .from('items')
                        .update({ stock_level: nextStock })
                        .eq('id', itemId);
                }
            }
            break;
        }

        case 'CASH_SHIFT_OP': {
            const { op, payload } = mutation;
            if (op === 'open') {
                const { error } = await supabase
                    .from('cash_shifts')
                    .upsert(payload, { onConflict: 'id' });
                if (error && isNetworkError(error)) throw error;
            } else if (op === 'close') {
                const { id, ...updateFields } = payload;
                const { error } = await supabase
                    .from('cash_shifts')
                    .update(updateFields)
                    .eq('id', id);
                if (error && isNetworkError(error)) throw error;
            } else if (op === 'adjustment') {
                const { error } = await supabase
                    .from('cash_adjustments')
                    .upsert(payload, { onConflict: 'id' });
                if (error && isNetworkError(error)) throw error;
            }
            break;
        }
    }
}

let _isFlushingQueue = false;

/**
 * Replays all pending mutations in FIFO order for a tenant.
 * Returns the number of remaining items in the queue.
 */
export async function flushOfflineQueue(
    tenantId: string | null | undefined
): Promise<{ remaining: number; synced: number; online: boolean }> {
    if (!tenantId) return { remaining: 0, synced: 0, online: true };
    if (_isFlushingQueue) {
        const current = await getOfflineQueue(tenantId);
        return { remaining: current.length, synced: 0, online: true };
    }

    const online = await checkOnlineStatus();
    const queue = await getOfflineQueue(tenantId);
    if (!online) {
        return { remaining: queue.length, synced: 0, online: false };
    }
    if (queue.length === 0) {
        return { remaining: 0, synced: 0, online: true };
    }

    _isFlushingQueue = true;
    let syncedCount = 0;
    const remainingQueue = [...queue];

    try {
        while (remainingQueue.length > 0) {
            const nextRecord = remainingQueue[0];
            try {
                await executeQueuedMutation(nextRecord);
                remainingQueue.shift();
                syncedCount++;
                await AsyncStorage.setItem(
                    getQueueStorageKey(tenantId),
                    JSON.stringify(remainingQueue)
                );
            } catch (err) {
                if (isNetworkError(err)) {
                    // Stop processing further mutations until network returns
                    return {
                        remaining: remainingQueue.length,
                        synced: syncedCount,
                        online: false,
                    };
                } else {
                    console.warn(
                        '[OfflineQueue] Dropping non-recoverable mutation error:',
                        nextRecord.mutation.type,
                        err
                    );
                    remainingQueue.shift();
                    await AsyncStorage.setItem(
                        getQueueStorageKey(tenantId),
                        JSON.stringify(remainingQueue)
                    );
                }
            }
        }
        return { remaining: 0, synced: syncedCount, online: true };
    } finally {
        _isFlushingQueue = false;
    }
}
