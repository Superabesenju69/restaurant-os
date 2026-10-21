import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { formatCurrency } from '../utils/currency';
import { t } from '../utils/i18n';

import type { CartItem, CartItemIngredient } from '../types';

interface CartItemRowProps {
  cartItem: CartItem;
  isInspecting: boolean;
  tp: Record<string, string>;
  language: string;
  currency: string;
  getCartItemPrice: (item: CartItem) => number;
  onPress: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}

/**
 * A single row in the POS cart list.
 * Displays item name, price, quantity stepper, ingredient/sub-item preview,
 * discount badge, sent-to-kitchen indicator, and options tags.
 */
export default function CartItemRow({
  cartItem, isInspecting, tp, language, currency,
  getCartItemPrice, onPress, onIncrement, onDecrement, onRemove
}: CartItemRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: isInspecting ? '#eff6ff' : (cartItem.sentQuantity ?? 0) > 0 ? '#fffbeb' : '#ffffff',
        borderColor: isInspecting ? tp[300] : undefined
      }}
      className={`mb-4 p-5 rounded-2xl border shadow-sm ${(cartItem.sentQuantity ?? 0) > 0 ? (!isInspecting ? 'border-amber-200' : '') : (!isInspecting ? 'border-gray-200' : '')}`}
    >
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1 pr-4">
          <View className="flex-row items-center flex-wrap gap-2">
            <Text className={`text-lg font-bold ${!isInspecting ? 'text-gray-900' : ''}`} style={{ color: isInspecting ? tp[900] : undefined }}>{cartItem.item.name}</Text>
            {/* Sent / Total badge */}
            {(cartItem.sentQuantity ?? 0) > 0 && (
              <View className="bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
                <Text className="text-xs text-amber-700 font-semibold">
                  🔥 {cartItem.sentQuantity}/{cartItem.quantity} {t('pos.main.sent', language)}
                </Text>
              </View>
            )}
          </View>
          <Text className="text-sm text-gray-500 capitalize">{cartItem.item.type}</Text>
        </View>
        {/* Right: price + stepper */}
        <View className="items-end" style={{ gap: 6 }}>
          {cartItem.discountAmount && cartItem.discountAmount > 0 ? (
            <View className="items-end">
              <Text className="text-xs text-gray-400 font-bold tracking-tight mb-1" style={{ textDecorationLine: 'line-through' }}>{formatCurrency((cartItem.grossAmount || 0), currency)}</Text>
              <Text className="text-base font-black text-green-600">{formatCurrency(((cartItem.grossAmount || 0) - cartItem.discountAmount), currency)}</Text>
              <View className="bg-green-100 px-2 py-0.5 rounded flex flex-row items-center gap-1 mt-1">
                <Text className="text-[10px] text-green-800 font-bold uppercase tracking-wider">{t('pos.main.promo', language)}</Text>
              </View>
            </View>
          ) : (
            <Text className="text-base font-bold" style={{ color: tp[600] }}>{formatCurrency((cartItem.grossAmount !== undefined ? cartItem.grossAmount : (getCartItemPrice(cartItem) * cartItem.quantity)), currency)}</Text>
          )}
          {/* −/qty/+ stepper */}
          <View className="flex-row items-center" style={{ gap: 4 }}>
            {(() => {
              const sent = cartItem.sentQuantity ?? 0;
              const withinWindow = sent > 0 && cartItem.sentAt
                ? Date.now() - cartItem.sentAt < 30000
                : true;
              const canDec = sent === 0 || withinWindow;
              return (
                <TouchableOpacity
                  onPress={() => canDec && onDecrement()}
                  disabled={!canDec}
                  style={{ width: 36, height: 36 }}
                  className={`rounded-xl items-center justify-center border ${canDec ? 'bg-red-50 border-red-200 shadow-sm' : 'bg-gray-100 border-gray-200'}`}
                >
                  <Text className={`text-xl font-black leading-none ${canDec ? 'text-red-600' : 'text-gray-400'}`}>{canDec ? '−' : '🔒'}</Text>
                </TouchableOpacity>
              );
            })()}
            <View style={{ width: 36, height: 36 }} className="items-center justify-center bg-gray-50 rounded-xl border border-gray-100">
              <Text className="text-base font-black text-gray-900">{cartItem.quantity}</Text>
            </View>
            <TouchableOpacity
              onPress={onIncrement}
              style={{ width: 36, height: 36, backgroundColor: tp[50], borderColor: tp[200] }}
              className="border rounded-xl shadow-sm items-center justify-center"
            >
              <Text className="text-xl font-black leading-none" style={{ color: tp[700] }}>+</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={onRemove}>
            <Text className="text-xs text-red-500 font-medium">{t('pos.main.remove', language)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tiny Ingredient / SubItem Preview */}
      {cartItem.item.type === 'combo' && cartItem.sub_items ? (
        <View className="mt-2 pl-2 border-l-2 border-gray-200">
          {(cartItem.selectedOptions && Object.keys(cartItem.selectedOptions).length > 0) && (
            <View className="flex-row flex-wrap gap-1 mb-2">
              {Object.entries(cartItem.selectedOptions).map(([key, val]) => (
                <View key={key} className="bg-purple-50 px-2 py-0.5 rounded text-xs border border-purple-100">
                  <Text className="text-xs text-purple-700 font-bold">{key}: {String(val)}</Text>
                </View>
              ))}
            </View>
          )}
          {cartItem.sub_items.map((subItem: CartItem) => (
            <View key={subItem.cart_id} className="mb-2">
              <Text className="text-sm font-bold text-gray-700">- {subItem.item.name}</Text>
              {(subItem.selectedOptions && Object.keys(subItem.selectedOptions).length > 0) && (
                <View className="flex-row flex-wrap gap-1 mt-1 ml-3">
                  {Object.entries(subItem.selectedOptions).map(([key, val]) => (
                    <View key={key} className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                      <Text className="text-xs text-gray-600 font-medium">{key}: {String(val)}</Text>
                    </View>
                  ))}
                </View>
              )}
              {(subItem.ingredients || []).length > 0 && (
                <View className="mt-1 ml-3 flex-row flex-wrap gap-1">
                  {(subItem.ingredients || []).map((ing: CartItemIngredient) => (
                    <View key={ing.instance_id} className={`px-2 py-0.5 rounded text-xs ${ing.removed ? 'bg-red-50' : 'bg-gray-100'}`}>
                      <Text className={`text-xs ${ing.removed ? 'text-red-400 line-through' : 'text-gray-600'}`}>
                        {ing.extra ? '+' : ''}{ing.name}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      ) : (
        (cartItem.ingredients || []).length > 0 && (
          <View className="mt-1 flex-row flex-wrap gap-1">
            {(cartItem.ingredients || []).map((ing: CartItemIngredient) => (
              <View key={ing.instance_id} className={`px-2 py-0.5 rounded text-xs ${ing.removed ? 'bg-red-50' : 'bg-gray-100'}`}>
                <Text className={`text-xs ${ing.removed ? 'text-red-400 line-through' : 'text-gray-600'}`}>
                  {ing.extra ? '+' : ''}{ing.name}
                </Text>
              </View>
            ))}
          </View>
        )
      )}

      {/* Options Preview (non-combo items only — combo options shown above) */}
      {cartItem.item.type !== 'combo' && cartItem.selectedOptions && Object.keys(cartItem.selectedOptions).length > 0 && (
        <View className="mt-1 flex-row flex-wrap gap-1">
          {Object.entries(cartItem.selectedOptions).map(([key, val]) => (
            <View key={key} className="px-2 py-0.5 rounded text-xs bg-indigo-50 border border-indigo-100">
              <Text className="text-xs text-indigo-700 font-medium">
                {key}: {val as React.ReactNode}
              </Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}
