/**
 * SupabaseConnector.ts
 *
 * PowerSync Backend Connector for Restaurant OS.
 * Bridges local SQLite CRUD transactions (`uploadData`) to Supabase PostgREST
 * and atomic PostgreSQL RPCs (`adjust_item_stock`, `complete_order_checkout`).
 *
 * Activates automatically when `EXPO_PUBLIC_POWERSYNC_URL` is configured.
 */
import { supabase } from '../../utils/supabase';

export type PowerSyncUpdateType = 'PUT' | 'PATCH' | 'DELETE';

export interface PowerSyncCrudEntry {
    table: string;
    op: PowerSyncUpdateType;
    id: string;
    opData?: Record<string, any>;
    previousValues?: Record<string, any>;
}

export interface PowerSyncCrudTransaction {
    crud: PowerSyncCrudEntry[];
    complete: () => Promise<void>;
}

export interface PowerSyncDatabaseLike {
    getNextCrudTransaction: () => Promise<PowerSyncCrudTransaction | null>;
}

export class SupabaseConnector {
    /**
     * Fetches the PowerSync endpoint and authentication token from the active Supabase session
     * or falls back to the configured anon key for POS terminals using custom x-tenant-id headers.
     */
    async fetchCredentials() {
        const endpoint = process.env.EXPO_PUBLIC_POWERSYNC_URL || '';
        const {
            data: { session },
        } = await supabase.auth.getSession();

        const token =
            session?.access_token || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

        if (!endpoint || !token) {
            return null;
        }

        return {
            endpoint,
            token,
            expiresAt: session?.expires_at
                ? new Date(session.expires_at * 1000)
                : undefined,
        };
    }

    /**
     * Uploads local SQLite write-ahead log (WAL) transactions to Supabase.
     * Prevents race conditions on `items.stock_level` by routing stock deltas
     * through the atomic `adjust_item_stock` PostgreSQL RPC.
     */
    async uploadData(database: PowerSyncDatabaseLike): Promise<void> {
        const transaction = await database.getNextCrudTransaction();
        if (!transaction) return;

        try {
            for (const op of transaction.crud) {
                const table = supabase.from(op.table);

                // Parse stringified JSONB columns back to objects for Postgres JSONB columns
                const payload: Record<string, any> = { ...op.opData };
                if (
                    (op.table === 'order_line_items' ||
                        op.table === 'kitchen_ticket_items') &&
                    typeof payload.modifications === 'string'
                ) {
                    try {
                        payload.modifications = JSON.parse(payload.modifications);
                    } catch {
                        // Keep as-is if already valid
                    }
                }

                // Route stock adjustments through atomic RPC instead of last-write-wins PATCH
                if (
                    op.table === 'items' &&
                    op.op === 'PATCH' &&
                    payload.stock_level !== undefined &&
                    op.previousValues?.stock_level !== undefined
                ) {
                    const delta =
                        Number(payload.stock_level) -
                        Number(op.previousValues.stock_level);
                    if (delta !== 0) {
                        const { error: rpcErr } = await supabase.rpc(
                            'adjust_item_stock',
                            {
                                p_item_id: op.id,
                                p_delta: delta,
                            }
                        );
                        if (rpcErr) throw rpcErr;
                    }
                    delete payload.stock_level;
                    if (Object.keys(payload).length === 0) continue;
                }

                let result: { error: any } = { error: null };
                if (op.op === 'PUT') {
                    result = await table.upsert({ ...payload, id: op.id });
                } else if (op.op === 'PATCH') {
                    result = await table.update(payload).eq('id', op.id);
                } else if (op.op === 'DELETE') {
                    result = await table.delete().eq('id', op.id);
                }

                if (result.error) {
                    throw result.error;
                }
            }

            await transaction.complete();
        } catch (error) {
            console.error('[PowerSync] Upload error, will retry automatically:', error);
            throw error;
        }
    }
}
