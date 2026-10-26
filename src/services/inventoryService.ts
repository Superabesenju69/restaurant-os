/**
 * inventoryService.ts
 * 
 * Extracted from posStore.ts — handles all inventory stock deduction, refund,
 * and single-ingredient adjustment operations against Supabase + local state.
 */
import { supabase } from '../utils/supabase';
import { filterRecipesByVariation } from '../utils/recipeUtils';
import { enqueueOfflineMutation, isNetworkError } from './offlineSyncService';

import type { CartItem, CartItemIngredient, MenuItem, Recipe, ItemOptionChoice } from '../types';

/**
 * Calculate the combined ingredient multiplier for a cart item based on its selected options.
 * @deprecated Sizes now have dedicated exact recipes. Retained for backward compatibility returning 1.
 */
export function getIngredientMultiplier(_item: MenuItem, _selectedOptions?: Record<string, string>): number {
    return 1;
}

/**
 * Recursively check if an item (product or combo) is available based on stock.
 * A product is unavailable if its own stock is 0 (when tracked) OR any of its required ingredients are out of stock.
 * A combo is unavailable if any of its sub-products (or their ingredients) are unavailable.
 */
export function checkItemAvailability(item: MenuItem, items: MenuItem[], allIngredients: MenuItem[], recipes: Recipe[]): boolean {
    // If the item itself tracks inventory and has 0 stock, it's unavailable
    if (item.track_inventory && (item.stock_level ?? 0) <= 0) return false;

    // Get the recipe children of this item
    const children = recipes.filter(r => r.parent_item_id === item.id);

    for (const child of children) {
        // Find the child item in the master list
        const childItem = [...items, ...allIngredients].find(i => i.id === child.child_item_id);
        if (!childItem) continue;

        if (childItem.type === 'ingredient') {
            // Ingredient: check if it has enough stock for one unit of the recipe
            if (childItem.track_inventory && (childItem.stock_level ?? 0) < child.quantity) {
                return false;
            }
        } else {
            // Sub-product (in a combo): recurse
            if (!checkItemAvailability(childItem, items, allIngredients, recipes)) {
                return false;
            }
        }
    }

    return true;
}

/** 
 * Helper: apply a stock delta to DB + local Zustand state for a batch of ingredient IDs. 
 * direction: 1 = deduct, -1 = refund
 */
async function applyStockChanges(
    changes: Record<string, number>,
    direction: 1 | -1,
    set: (fn: (prev: { allIngredients: MenuItem[]; items: MenuItem[] }) => Partial<{ allIngredients: MenuItem[]; items: MenuItem[] }>) => void,
    get?: () => any
) {
    const entries = Object.entries(changes).filter(([, qty]) => qty > 0);
    if (entries.length === 0) return;

    // 1. Optimistic local state update so UI reacts immediately
    set((prev: { allIngredients: MenuItem[]; items: MenuItem[] }) => {
        const applyLocalDelta = (list: MenuItem[]) =>
            list.map((i: MenuItem) => {
                const qty = changes[i.id];
                if (qty === undefined || !i.track_inventory) return i;
                const nextStock = Math.max(0, (i.stock_level ?? 0) - qty * direction);
                return { ...i, stock_level: nextStock };
            });

        return {
            allIngredients: applyLocalDelta(prev.allIngredients),
            items: applyLocalDelta(prev.items),
        };
    });

    const state = get ? get() : null;
    const tenantId = state?.tenantId || null;

    // 2. Atomic DB adjustment via adjust_item_stock RPC (with offline queue fallback)
    await Promise.all(
        entries.map(async ([itemId, qty]) => {
            const delta = -(qty * direction);
            try {
                if (state && state.isOnline === false) {
                    const count = await enqueueOfflineMutation(tenantId, {
                        type: 'ADJUST_STOCK',
                        itemId,
                        delta,
                    });
                    if (state) set(() => ({ pendingSyncCount: count } as any));
                    return;
                }

                const { data: rpcStock, error: rpcError } = await supabase.rpc('adjust_item_stock', {
                    p_item_id: itemId,
                    p_delta: delta,
                });

                if (!rpcError) {
                    if (typeof rpcStock === 'number') {
                        set((prev: { allIngredients: MenuItem[]; items: MenuItem[] }) => ({
                            allIngredients: prev.allIngredients.map((i: MenuItem) =>
                                i.id === itemId ? { ...i, stock_level: rpcStock } : i
                            ),
                            items: prev.items.map((i: MenuItem) =>
                                i.id === itemId ? { ...i, stock_level: rpcStock } : i
                            ),
                        }));
                    }
                    return;
                }

                if (isNetworkError(rpcError)) {
                    const count = await enqueueOfflineMutation(tenantId, {
                        type: 'ADJUST_STOCK',
                        itemId,
                        delta,
                    });
                    set(() => ({ isOnline: false, pendingSyncCount: count } as any));
                    return;
                }

                // Fallback if RPC is not yet deployed
                const { data: currentItem, error: selErr } = await supabase
                    .from('items')
                    .select('stock_level, track_inventory')
                    .eq('id', itemId)
                    .single();

                if (selErr && isNetworkError(selErr)) {
                    const count = await enqueueOfflineMutation(tenantId, {
                        type: 'ADJUST_STOCK',
                        itemId,
                        delta,
                    });
                    set(() => ({ isOnline: false, pendingSyncCount: count } as any));
                    return;
                }

                if (currentItem?.track_inventory) {
                    const newStock = Math.max(0, (currentItem.stock_level ?? 0) - (qty * direction));
                    await supabase.from('items').update({ stock_level: newStock }).eq('id', itemId);
                    set((prev: { allIngredients: MenuItem[]; items: MenuItem[] }) => ({
                        allIngredients: prev.allIngredients.map((i: MenuItem) =>
                            i.id === itemId ? { ...i, stock_level: newStock } : i
                        ),
                        items: prev.items.map((i: MenuItem) =>
                            i.id === itemId ? { ...i, stock_level: newStock } : i
                        ),
                    }));
                }
            } catch (err) {
                if (isNetworkError(err)) {
                    const count = await enqueueOfflineMutation(tenantId, {
                        type: 'ADJUST_STOCK',
                        itemId,
                        delta,
                    });
                    set(() => ({ isOnline: false, pendingSyncCount: count } as any));
                }
            }
        })
    );
}

/**
 * Build a map of { ingredientId → totalQuantity } for all ingredients in a cart item.
 * Uses exact recipe quantities defined for the selected size without artificial multipliers.
 */
export function buildDeductionMap(cartItem: CartItem, multiplier: number): Record<string, number> {
    const deductions: Record<string, number> = {};

    // If the main item itself directly tracks inventory and has no recipe ingredients
    if (cartItem.item.track_inventory && (!cartItem.ingredients || cartItem.ingredients.length === 0)) {
        deductions[cartItem.item.id] = (deductions[cartItem.item.id] || 0) + multiplier;
    }

    // Main item ingredients (non-removed)
    for (const ing of cartItem.ingredients) {
        if (!ing.removed) {
            const qty = (ing.extra ? 1 : (ing.recipe_quantity || 1)) * multiplier;
            deductions[ing.id] = (deductions[ing.id] || 0) + qty;
        }
    }

    // Combo sub-item ingredients
    for (const sub of (cartItem.sub_items || [])) {
        if (sub.item.track_inventory && (!sub.ingredients || sub.ingredients.length === 0)) {
            deductions[sub.item.id] = (deductions[sub.item.id] || 0) + (sub.quantity * multiplier);
        }
        for (const ing of sub.ingredients) {
            if (!ing.removed) {
                const qty = (ing.extra ? 1 : (ing.recipe_quantity || 1)) * sub.quantity * multiplier;
                deductions[ing.id] = (deductions[ing.id] || 0) + qty;
            }
        }
    }

    return deductions;
}

/**
 * Validates if an item in the cart can increment its quantity by delta units (default 1).
 * Checks available stock of all recipe ingredients and combo sub-items.
 */
export function canIncrementCartItem(
    cartItem: CartItem,
    allIngredients: MenuItem[],
    items: MenuItem[],
    delta: number = 1
): { canIncrement: boolean; reason?: string } {
    const deductions = buildDeductionMap(cartItem, delta);
    const pool = [...allIngredients, ...items];

    for (const [id, neededQty] of Object.entries(deductions)) {
        const item = pool.find(i => i.id === id);
        if (item?.track_inventory) {
            const currentStock = item.stock_level ?? 0;
            if (currentStock < neededQty) {
                return {
                    canIncrement: false,
                    reason: `Stock insuficiente de "${item.name}". Disponible: ${currentStock}, necesario para +${delta}: ${neededQty}.`
                };
            }
        }
    }

    return { canIncrement: true };
}

/**
 * Calculates the maximum orderable quantity for a product under a specific (Tipo, Tamaño) variation,
 * based on current ingredient stocks in the kitchen/pantry.
 */
export function calculateVariationMaxStock(
    item: MenuItem,
    selectedTipo: string | null | undefined,
    selectedSize: string | null | undefined,
    allIngredients: MenuItem[],
    recipes: Recipe[],
    items: MenuItem[]
): { maxQty: number; limitingItemName?: string } {
    let maxQty = Infinity;
    let limitingItemName: string | undefined = undefined;

    const pool = [...allIngredients, ...items];

    // Direct product stock check if it tracks inventory
    const directItem = pool.find(i => i.id === item.id) || item;
    if (directItem.track_inventory) {
        const stock = directItem.stock_level ?? 0;
        if (stock < maxQty) {
            maxQty = stock;
            limitingItemName = directItem.name;
        }
    }

    const itemRecipes = recipes.filter(r => r.parent_item_id === item.id);
    const matchedRecipes = filterRecipesByVariation(itemRecipes, selectedTipo, selectedSize);

    if (item.type === 'combo') {
        for (const r of matchedRecipes) {
            const subProduct = pool.find(i => i.id === r.child_item_id);
            if (subProduct) {
                if (subProduct.track_inventory) {
                    const maxFromSub = Math.floor((subProduct.stock_level ?? 0) / (r.quantity || 1));
                    if (maxFromSub < maxQty) {
                        maxQty = maxFromSub;
                        limitingItemName = subProduct.name;
                    }
                }
                const subRecipes = recipes.filter(sr => sr.parent_item_id === subProduct.id);
                const matchedSubRecipes = filterRecipesByVariation(subRecipes, selectedTipo, selectedSize);
                for (const sr of matchedSubRecipes) {
                    const subIng = pool.find(i => i.id === sr.child_item_id);
                    if (subIng && subIng.track_inventory) {
                        const totalNeeded = (sr.quantity || 1) * (r.quantity || 1);
                        const maxFromSubIng = Math.floor((subIng.stock_level ?? 0) / totalNeeded);
                        if (maxFromSubIng < maxQty) {
                            maxQty = maxFromSubIng;
                            limitingItemName = subIng.name;
                        }
                    }
                }
            }
        }
    } else {
        for (const r of matchedRecipes) {
            const ing = pool.find(i => i.id === r.child_item_id);
            if (ing && ing.track_inventory) {
                const maxFromIng = Math.floor((ing.stock_level ?? 0) / (r.quantity || 1));
                if (maxFromIng < maxQty) {
                    maxQty = maxFromIng;
                    limitingItemName = ing.name;
                }
            }
        }
    }

    if (!isFinite(maxQty)) {
        maxQty = 999;
    }

    return { maxQty: Math.max(0, maxQty), limitingItemName };
}

/**
 * Validates whether a cart item can switch its variation/options to newCartItem at its current quantity.
 * Refunds the old options' ingredients virtually and checks if the new options can be fulfilled.
 */
export function canChangeCartItemVariation(
    oldCartItem: CartItem,
    newCartItem: CartItem,
    allIngredients: MenuItem[],
    items: MenuItem[]
): { canChange: boolean; reason?: string } {
    const oldDeductions = buildDeductionMap(oldCartItem, oldCartItem.quantity);
    const newDeductions = buildDeductionMap(newCartItem, newCartItem.quantity);
    const pool = [...allIngredients, ...items];

    for (const [id, neededQty] of Object.entries(newDeductions)) {
        const item = pool.find(i => i.id === id);
        if (item?.track_inventory) {
            const availableStock = (item.stock_level ?? 0) + (oldDeductions[id] || 0);
            if (availableStock < neededQty) {
                return {
                    canChange: false,
                    reason: `No hay suficiente stock de "${item.name}" para esta opción. Disponible: ${availableStock}, requerido: ${neededQty}.`
                };
            }
        }
    }

    return { canChange: true };
}

/**
 * Deduct inventory in DB and local state for one cart item (qty=1).
 * Handles the item's own recipe ingredients AND combo sub-item ingredients.
 * Applies ingredient multipliers from selected options (e.g. Size: Large = 1.5x).
 */
export async function deductInventoryForCartItem(
    cartItem: CartItem,
    multiplier: number,
    get: () => unknown,
    set: (fn: (prev: { allIngredients: MenuItem[]; items: MenuItem[] }) => Partial<{ allIngredients: MenuItem[]; items: MenuItem[] }>) => void
) {
    const deductions = buildDeductionMap(cartItem, multiplier);
    await applyStockChanges(deductions, 1, set, get as () => any);
}

/**
 * Refund inventory in DB and local state for one cart item.
 * Exact inverse of deductInventoryForCartItem.
 * Applies ingredient multipliers from selected options (e.g. Size: Large = 1.5x).
 */
export async function refundInventoryForCartItem(
    cartItem: CartItem,
    multiplier: number,
    get: () => unknown,
    set: (fn: (prev: { allIngredients: MenuItem[]; items: MenuItem[] }) => Partial<{ allIngredients: MenuItem[]; items: MenuItem[] }>) => void
) {
    const refunds = buildDeductionMap(cartItem, multiplier);
    await applyStockChanges(refunds, -1, set, get as () => any);
}

/**
 * Deduct or refund stock for a single ingredient by a given quantity.
 * direction: 1 = deduct, -1 = refund
 */
export async function adjustSingleIngredientStock(
    ingredientId: string,
    qty: number,
    direction: 1 | -1,
    set: (fn: (prev: { allIngredients: MenuItem[]; items: MenuItem[] }) => Partial<{ allIngredients: MenuItem[]; items: MenuItem[] }>) => void,
    get?: () => unknown
) {
    await applyStockChanges({ [ingredientId]: qty }, direction, set, get as () => any);
}
