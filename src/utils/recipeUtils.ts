/**
 * recipeUtils.ts
 * Utilities for encoding/decoding 2D recipe matrix variations (Tipo × Tamaño)
 * and resolving pricing combinations in the POS app.
 */

export interface RecipeVariation {
    type_name: string | null;
    size_name: string | null;
}

/**
 * Decodes a raw recipe record from DB into explicit { type_name, size_name }.
 */
export function decodeRecipeVariation(recipe: {
    type_name?: string | null;
    size_name?: string | null;
}): RecipeVariation {
    if (recipe.type_name) {
        let cleanSize = recipe.size_name || null;
        if (cleanSize) {
            if (cleanSize.includes(':::')) {
                cleanSize = cleanSize.split(':::')[1] || null;
            } else if (cleanSize.startsWith('[tipo]')) {
                cleanSize = null;
            }
        }
        return { type_name: recipe.type_name, size_name: cleanSize };
    }

    const raw = recipe.size_name?.trim() || null;
    if (!raw) {
        return { type_name: null, size_name: null };
    }

    if (raw.includes(':::')) {
        const [t, s] = raw.split(':::');
        return { type_name: t?.trim() || null, size_name: s?.trim() || null };
    }

    if (raw.startsWith('[tipo]')) {
        return { type_name: raw.replace('[tipo]', '').trim() || null, size_name: null };
    }

    return { type_name: null, size_name: raw };
}

/**
 * Generates a consistent key for pricing combinations
 */
export function getCombinationKey(tipo: string, tamano: string): string {
    return `${tipo.trim()}__${tamano.trim()}`;
}

/**
 * Resolve price for an item given combination prices, base price, selected Tipo, and selected Tamaño.
 * Returns the resolved combination price, or fallback basePrice if no match is found.
 */
export function resolveCombinationPrice(
    combinationPrices: Record<string, number> | null | undefined,
    basePrice: number,
    selectedTipo?: string | null,
    selectedTamaño?: string | null
): number {
    if (!combinationPrices) {
        return basePrice;
    }

    const t = selectedTipo?.trim();
    const s = selectedTamaño?.trim();

    // 1. Both Tipo and Tamaño
    if (t && s) {
        const key1 = `${t}__${s}`;
        const key2 = `${t}:::${s}`;
        if (typeof combinationPrices[key1] === 'number') {
            return combinationPrices[key1];
        }
        if (typeof combinationPrices[key2] === 'number') {
            return combinationPrices[key2];
        }
    }

    // 2. Only Tipo
    if (t) {
        if (typeof combinationPrices[t] === 'number') {
            return combinationPrices[t];
        }
    }

    // 3. Only Tamaño
    if (s) {
        if (typeof combinationPrices[s] === 'number') {
            return combinationPrices[s];
        }
    }

    return basePrice;
}
