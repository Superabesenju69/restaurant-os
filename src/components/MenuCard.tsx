import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { formatCurrency } from '../utils/currency';

import type { MenuItem } from '../types';

interface MenuCardProps {
  item: MenuItem;
  unavailable: boolean;
  reason: string | null;
  tp: Record<string, string>;
  currency: string;
  onPress: () => void;
}

/**
 * A single menu item card displayed in the POS menu grid.
 * Shows item image (or initial letter), name, price, and availability.
 */
export default function MenuCard({ item, unavailable, reason, tp, currency, onPress }: MenuCardProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={unavailable}
      className="flex-1 bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden flex-col aspect-square"
      style={{ opacity: unavailable ? 0.45 : 1 }}
    >
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '60%' }} resizeMode="cover" />
      ) : (
        <View
          className={`w-full h-[60%] items-center justify-center ${unavailable ? 'bg-gray-100' : item.type === 'combo' ? 'bg-purple-100' : ''}`}
          style={(!unavailable && item.type !== 'combo') ? { backgroundColor: tp[100] } : undefined}
        >
          <Text
            className={`text-4xl font-bold ${unavailable ? 'text-gray-400' : item.type === 'combo' ? 'text-purple-600' : ''}`}
            style={(!unavailable && item.type !== 'combo') ? { color: tp[600] } : undefined}
          >
            {item.name.charAt(0)}
          </Text>
        </View>
      )}
      <View className="flex-1 p-3 justify-between">
        <Text className={`text-base font-bold leading-tight ${unavailable ? 'text-gray-400' : 'text-gray-900'}`} numberOfLines={2}>
          {item.name}
        </Text>

        <View className="flex-row items-end justify-between mt-1">
          {unavailable ? (
            <View className="bg-red-50 px-2 py-0.5 rounded-md">
              <Text className="text-red-500 font-bold text-[10px]">{reason}</Text>
            </View>
          ) : (
            <Text className="font-black text-lg" style={{ color: tp[600] }}>{formatCurrency(item.base_price, currency)}</Text>
          )}

          {!unavailable && (
            <View className="bg-gray-100 rounded-full w-8 h-8 items-center justify-center">
              <Text className="font-bold text-lg" style={{ color: tp[600] }}>+</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
