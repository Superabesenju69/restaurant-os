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

/**
 * Filters a list of recipe records according to selected Tipo and Tamaño,
 * falling back gracefully (exact match -> tipo match -> tamano match -> base).
 */
export function filterRecipesByVariation<T extends { type_name?: string | null; size_name?: string | null; parent_item_id?: string }>(
    rawList: T[],
    targetTipo: string | null | undefined,
    targetSize: string | null | undefined
): T[] {
    const decoded = (rawList || []).map(r => {
        const dec = decodeRecipeVariation(r);
        return {
            ...r,
            type_name: dec.type_name,
            size_name: dec.size_name
        };
    });

    const normTipo = targetTipo ? targetTipo.trim().toLowerCase() : null;
    const normSize = targetSize ? targetSize.trim().toLowerCase() : null;

    // 1. Exact match for both Tipo & Tamaño
    if (normTipo && normSize) {
        const exact = decoded.filter(r => 
            (r.type_name ? r.type_name.toLowerCase() : null) === normTipo &&
            (r.size_name ? r.size_name.toLowerCase() : null) === normSize
        );
        if (exact.length > 0) return exact;
    }

    // 2. Match Tipo only
    if (normTipo) {
        const matchTipo = decoded.filter(r => 
            (r.type_name ? r.type_name.toLowerCase() : null) === normTipo && !r.size_name
        );
        if (matchTipo.length > 0) return matchTipo;
    }

    // 3. Match Tamaño only
    if (normSize) {
        const matchSize = decoded.filter(r => 
            !r.type_name && (r.size_name ? r.size_name.toLowerCase() : null) === normSize
        );
        if (matchSize.length > 0) return matchSize;
    }

    // 4. Base General (no tipo, no size)
    const base = decoded.filter(r => !r.type_name && !r.size_name);
    if (base.length > 0) return base;

    return decoded;
}
