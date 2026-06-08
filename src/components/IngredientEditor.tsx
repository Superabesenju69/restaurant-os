import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { formatCurrency } from '../utils/currency';
import { t } from '../utils/i18n';

import type { CartItemIngredient, MenuItem } from '../types';

interface IngredientEditorProps {
  targetCartId: string;
  subCartId: string | null;
  targetIngredients: CartItemIngredient[];
  itemTags: string[];
  allIngredients: MenuItem[];
  tp: Record<string, string>;
  language: string;
  currency: string;
  toggleIngredient: (cartId: string, ingredientId: string, subCartId?: string) => void;
  addExtraIngredient: (cartId: string, ingredient: MenuItem, subCartId?: string) => void;
  removeExtraIngredient: (cartId: string, ingredientId: string, subCartId?: string) => void;
}

/**
 * The ingredient editor panel shown when inspecting a cart item.
 * Allows toggling base ingredients on/off and adding/removing extra ingredients
 * grouped by tag.
 */
export default function IngredientEditor({
  targetCartId, subCartId, targetIngredients, itemTags,
  allIngredients, tp, language, currency,
  toggleIngredient, addExtraIngredient, removeExtraIngredient
}: IngredientEditorProps) {
  const safeIngredients = targetIngredients || [];
  const baseIngredients = safeIngredients.filter(i => !i.extra);

  const availableExtras = allIngredients.filter((ing: MenuItem) =>
    ing.tags && ing.tags.some((tag: string) => itemTags.includes(tag))
  );

  const groupedExtras: Record<string, any[]> = {};
  const seenExtras = new Set<string>();

  itemTags.forEach(tag => {
    const extrasForTag = availableExtras.filter((ing: MenuItem) => {
      if (seenExtras.has(ing.id)) return false;
      if (ing.tags && ing.tags.includes(tag)) {
        seenExtras.add(ing.id);
        return true;
      }
      return false;
    });
    if (extrasForTag.length > 0) {
      groupedExtras[tag] = extrasForTag;
    }
  });

  if (baseIngredients.length === 0 && availableExtras.length === 0) {
    return (
      <View className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 mb-6 items-center justify-center">
        <Text className="text-xl font-bold text-gray-900 mb-2">{t('pos.modal.no_customizations', language)}</Text>
        <Text className="text-gray-500 text-center">{t('pos.modal.no_custom_desc', language)}</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Standard Ingredients (Removable) */}
      {baseIngredients.length > 0 && (
        <View className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-4">{t('pos.modal.inc_ingredients', language)}</Text>
          <View className="flex-row flex-wrap gap-3">
            {baseIngredients.map(ing => (
              <TouchableOpacity
                key={ing.instance_id}
                onPress={() => toggleIngredient(targetCartId, ing.id, subCartId || undefined)}
                className={`px-4 py-3 rounded-xl border flex-row items-center gap-3 ${ing.removed ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}
              >
                <View className={`w-4 h-4 rounded-full border items-center justify-center ${ing.removed ? 'border-red-400 bg-white' : 'border-green-500 bg-green-500'}`}>
                  {!ing.removed && <View className="w-1.5 h-1.5 bg-white rounded-full" />}
                </View>
                <Text className={`font-medium ${ing.removed ? 'text-red-700 line-through' : 'text-green-800'}`}>{ing.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Add Extra Ingredients */}
      {availableExtras.length > 0 && (
        <View className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-4">
          <Text className="text-lg font-bold text-gray-900 mb-2">{t('pos.modal.avail_extras', language)}</Text>
          <Text className="text-sm text-gray-500 mb-4">{t('pos.modal.extras_desc', language)}</Text>

          {Object.entries(groupedExtras).map(([tag, extras]) => (
            <View key={tag} className="mb-6">
              <Text className="text-md font-bold text-gray-700 mb-3 capitalize">{tag}</Text>
              <View className="flex-row flex-wrap gap-3">
                {extras.map((ing: MenuItem) => {
                  const timesAdded = safeIngredients.filter(i => i?.id === ing.id && i.extra).length;

                  if (timesAdded > 0) {
                    return (
                      <View
                        key={ing.id}
                        className="px-4 py-3 rounded-xl flex-row items-center justify-between min-w-[200px] border"
                        style={{ backgroundColor: tp[50], borderColor: tp[200] }}
                      >
                        <View>
                          <Text className="font-bold" style={{ color: tp[900] }}>{ing.name}</Text>
                          <Text className="text-xs font-bold" style={{ color: tp[600] }}>+{formatCurrency(ing.base_price, currency)}</Text>
                        </View>
                        <View className="flex-row items-center gap-3">
                          <TouchableOpacity
                            onPress={() => removeExtraIngredient(targetCartId, ing.id, subCartId || undefined)}
                            className="bg-white rounded-full w-8 h-8 items-center justify-center border"
                            style={{ borderColor: tp[200] }}
                          >
                            <Text className="font-bold text-lg leading-none" style={{ color: tp[600] }}>-</Text>
                          </TouchableOpacity>
                          <Text className="font-black text-lg w-4 text-center" style={{ color: tp[900] }}>{timesAdded}</Text>
                          <TouchableOpacity
                            onPress={() => addExtraIngredient(targetCartId, ing, subCartId || undefined)}
                            className="rounded-full w-8 h-8 items-center justify-center shadow-sm"
                            style={{ backgroundColor: tp[600] }}
                          >
                            <Text className="text-white font-bold text-lg leading-none">+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  }

                  return (
                    <TouchableOpacity
                      key={ing.id}
                      onPress={() => addExtraIngredient(targetCartId, ing, subCartId || undefined)}
                      className="bg-white border border-gray-200 px-4 py-3 rounded-xl flex-row items-center justify-between min-w-[200px]"
                    >
                      <View>
                        <Text className="font-medium text-gray-900">{ing.name}</Text>
                        <Text className="text-xs font-bold" style={{ color: tp[600] }}>+{formatCurrency(ing.base_price, currency)}</Text>
                      </View>
                      <Text className="text-gray-400 text-lg">+</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
