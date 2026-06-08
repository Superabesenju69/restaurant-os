/**
 * inventoryService.ts
 * 
 * Extracted from posStore.ts — handles all inventory stock deduction, refund,
 * and single-ingredient adjustment operations against Supabase + local state.
 */
import { supabase } from '../utils/supabase';

import type { CartItem, CartItemIngredient, MenuItem, Recipe, ItemOptionChoice } from '../types';

/**
 * Calculate the combined ingredient multiplier for a cart item based on its selected options.
 * Only options with `affects_ingredients: true` contribute to the multiplier.
 * Multiple multipliers are multiplied together (e.g. Large 1.5x × Thick Crust 1.2x = 1.8x).
 */
export function getIngredientMultiplier(item: MenuItem, selectedOptions?: Record<string, string>): number {
    if (!selectedOptions || !item?.options) return 1;
    let combined = 1;
    for (const opt of (item.options || [])) {
        if (!opt.affects_ingredients) continue;
        const selectedChoiceName = selectedOptions[opt.name];
        if (!selectedChoiceName) continue;
        const choiceDef = (opt.choices || []).find((c: ItemOptionChoice) => c.name === selectedChoiceName);
        if (choiceDef && choiceDef.ingredient_multiplier != null) {
            combined *= choiceDef.ingredient_multiplier;
        }
    }
    return combined;
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
    set: (fn: (prev: { allIngredients: MenuItem[]; items: MenuItem[] }) => Partial<{ allIngredients: MenuItem[]; items: MenuItem[] }>) => void
) {
    for (const [itemId, qty] of Object.entries(changes)) {
        const { data: currentItem } = await supabase
            .from('items')
            .select('stock_level, track_inventory')
            .eq('id', itemId)
            .single();

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
    }
}

/**
 * Build a map of { ingredientId → totalQuantity } for all ingredients in a cart item.
 * Handles both main-item and combo sub-item ingredients with multipliers.
 */
function buildDeductionMap(cartItem: CartItem, multiplier: number): Record<string, number> {
    const deductions: Record<string, number> = {};

    const mainMultiplier = getIngredientMultiplier(cartItem.item, cartItem.selectedOptions);

    // Main item ingredients (non-removed)
    for (const ing of cartItem.ingredients) {
        if (!ing.removed) {
            const qty = (ing.extra ? 1 : ing.recipe_quantity * mainMultiplier) * multiplier;
            deductions[ing.id] = (deductions[ing.id] || 0) + qty;
        }
    }

    // Combo sub-item ingredients
    for (const sub of (cartItem.sub_items || [])) {
        const subMultiplier = getIngredientMultiplier(sub.item, sub.selectedOptions);
        for (const ing of sub.ingredients) {
            if (!ing.removed) {
                const qty = (ing.extra ? 1 : ing.recipe_quantity * subMultiplier) * sub.quantity * multiplier;
                deductions[ing.id] = (deductions[ing.id] || 0) + qty;
            }
        }
    }

    return deductions;
}

/**
 * Deduct inventory in DB and local state for one cart item (qty=1).
 * Handles the item's own recipe ingredients AND combo sub-item ingredients.
 * Applies ingredient multipliers from selected options (e.g. Size: Large = 1.5x).
 */
export async function deductInventoryForCartItem(
    cartItem: CartItem,
    multiplier: number,
    _get: () => unknown,
    set: (fn: (prev: { allIngredients: MenuItem[]; items: MenuItem[] }) => Partial<{ allIngredients: MenuItem[]; items: MenuItem[] }>) => void
) {
    const deductions = buildDeductionMap(cartItem, multiplier);
    await applyStockChanges(deductions, 1, set);
}

/**
 * Refund inventory in DB and local state for one cart item.
 * Exact inverse of deductInventoryForCartItem.
 * Applies ingredient multipliers from selected options (e.g. Size: Large = 1.5x).
 */
export async function refundInventoryForCartItem(
    cartItem: CartItem,
    multiplier: number,
    _get: () => unknown,
    set: (fn: (prev: { allIngredients: MenuItem[]; items: MenuItem[] }) => Partial<{ allIngredients: MenuItem[]; items: MenuItem[] }>) => void
) {
    const refunds = buildDeductionMap(cartItem, multiplier);
    await applyStockChanges(refunds, -1, set);
}

/**
 * Deduct or refund stock for a single ingredient by a given quantity.
 * direction: 1 = deduct, -1 = refund
 */
export async function adjustSingleIngredientStock(
    ingredientId: string,
    qty: number,
    direction: 1 | -1,
    set: (fn: (prev: { allIngredients: MenuItem[]; items: MenuItem[] }) => Partial<{ allIngredients: MenuItem[]; items: MenuItem[] }>) => void
) {
    await applyStockChanges({ [ingredientId]: qty }, direction, set);
}
