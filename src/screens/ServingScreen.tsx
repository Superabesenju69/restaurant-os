import React from "react";
import { StatusBar } from 'expo-status-bar';
import { View, Text, SafeAreaView, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { usePosStore } from "../store/posStore";
import { t } from '../utils/i18n';
import type { Order, KitchenTicket, KitchenTicketItem } from '../types';

interface ServingScreenProps {
  bgStr: string;
  language: string;
}

export default function ServingScreen({ bgStr, language }: ServingScreenProps) {
  const { width } = useWindowDimensions();
  const cardWidth = width < 600 ? width - 40 : width < 900 ? (width - 56) / 2 : (width - 72) / 3;

  const {
    setScreen, ordersList, tables, currentPosUser
  } = usePosStore();

  // Collect all active expediter batches for the current user's orders
  const activeBatches: any[] = [];
  ordersList.forEach((order: Order) => {
    if (order.user_id !== currentPosUser?.id && currentPosUser?.role !== 'admin') return;
    
    const batches = (order.kitchen_tickets || []).filter((t: KitchenTicket) => t.is_expediter && t.status !== 'archived');
    batches.forEach((b: KitchenTicket) => {
      activeBatches.push({ ...b, _order_number: order.order_number, _table_id: order.table_id, _type: order.type, _customer_name: order.customer_name });
    });
  });

  // Sort oldest first
  activeBatches.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bgStr }}>
      <StatusBar style="dark" />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: 'white' }}>
        <TouchableOpacity onPress={() => setScreen('home')} style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
          <Text style={{ fontWeight: 'bold', color: '#374151' }}>{t('pos.serving.back', language)}</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '900', color: '#111827' }}>{t('pos.serving.title', language)}</Text>
        <TouchableOpacity onPress={() => usePosStore.getState().fetchOrders()} style={{ backgroundColor: '#ecfdf5', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
          <Text style={{ fontWeight: 'bold', color: '#059669' }}>{t('pos.serving.refresh', language)}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1, padding: 20 }}>
        {activeBatches.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 }}>
            <Text style={{ fontSize: 60, marginBottom: 16 }}>🏃</Text>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#111827' }}>{t('pos.serving.no_orders', language)}</Text>
            <Text style={{ fontSize: 16, color: '#6b7280', marginTop: 8 }}>{t('pos.serving.no_orders_desc', language)}</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {activeBatches.map(batch => {
              const batchItems = batch.kitchen_ticket_items || [];
              const allReady = batchItems.length > 0 && batchItems.every((i: KitchenTicketItem) => i.status === 'ready' || i.status === 'delivered');
              const allDelivered = batchItems.length > 0 && batchItems.every((i: KitchenTicketItem) => i.status === 'delivered');

              if (allDelivered) return null;

              const readyItems = batchItems.filter((i: KitchenTicketItem) => i.status === 'ready' || i.status === 'delivered');
              const lastUpdatedAt = readyItems.length > 0
                ? Math.max(...readyItems.map((i: KitchenTicketItem) => new Date(i.updated_at || i.created_at || batch.created_at).getTime()))
                : null;
              const endTime = allReady && lastUpdatedAt ? lastUpdatedAt : Date.now();
              const elapsedMin = Math.floor((endTime - new Date(batch.created_at).getTime()) / 60000);

              return (
                <View key={batch.id} style={{ width: cardWidth, backgroundColor: 'white', borderRadius: 16, borderWidth: 2, borderColor: allReady ? '#10b981' : '#e5e7eb', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12 }}>
                  {/* Header */}
                  <View style={{ padding: 16, backgroundColor: allReady ? '#ecfdf5' : '#f9fafb', borderBottomWidth: 1, borderBottomColor: allReady ? '#d1fae5' : '#e5e7eb', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={{ fontSize: 22, fontWeight: '900', color: '#111827' }}>#{batch._order_number || '—'}</Text>
                      <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: 'bold' }}>
                        {batch._type === 'dine_in' ? `${t('pos.orders.dine_in', language)}${batch._table_id ? ': ' + (tables.find(tbl => tbl.id === batch._table_id)?.name || '') : ''}` : t('pos.orders.take_out', language)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {allReady && (
                          <View style={{ backgroundColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, marginBottom: 4 }}>
                              <Text style={{ fontSize: 12, fontWeight: '900', color: '#059669' }}>{t('pos.serving.all_ready', language)}</Text>
                          </View>
                      )}
                      <Text style={{ fontSize: 14, fontWeight: 'bold', color: allReady ? '#059669' : '#6b7280' }}>{elapsedMin}m</Text>
                    </View>
                  </View>

                  {/* Customer Name */}
                  <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#1f2937' }}>{batch._customer_name || t('pos.serving.walk_in', language)}</Text>
                  </View>

                  {/* Batch Items list */}
                  <View style={{ padding: 12, gap: 10 }}>
                      {batchItems.map((item: KitchenTicketItem) => {
                          const isReady = item.status === 'ready';
                          const isDelivered = item.status === 'delivered';
                          if (isDelivered) return null;
                          return (
                              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isReady ? '#f0fdf4' : '#f9fafb', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: isReady ? '#bbf7d0' : '#e5e7eb' }}>
                                  <View>
                                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                                          <Text style={{ fontWeight: '900', fontSize: 16 }}>{item.quantity}×</Text>
                                          <Text style={{ fontWeight: '700', fontSize: 16, color: isReady ? '#166534' : '#374151' }}>{item.item_name}</Text>
                                      </View>
                                      {item.modifications?.ingredients?.filter((i:any)=>i.removed||i.extra).length > 0 && (
                                          <Text style={{ fontSize: 11, color: '#ef4444', fontWeight: 'bold', marginLeft: 24, marginTop: 2 }}>
                                              {item.modifications.ingredients.map((i:any)=>i.removed ? `NO ${i.name}` : `EXTRA ${i.name}`).join(', ')}
                                          </Text>
                                      )}
                                  </View>

                                  <View>
                                      {isReady ? (
                                          <TouchableOpacity onPress={() => usePosStore.getState().updateTicketItemStatus(item.id, 'delivered')} style={{ backgroundColor: '#3b82f6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                                              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>{t('pos.serving.serve', language)}</Text>
                                          </TouchableOpacity>
                                      ) : (
                                          <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#d97706' }}>{t('pos.serving.kitchen', language)}</Text>
                                      )}
                                  </View>
                              </View>
                          );
                      })}
                  </View>

                  {/* Mark ALL as Served button */}
                  <View style={{ padding: 12, backgroundColor: '#f9fafb', borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
                    <TouchableOpacity
                      disabled={!allReady}
                      onPress={() => usePosStore.getState().markExpediterBatchComplete(batch.batch_id)}
                      style={{ backgroundColor: allReady ? '#3b82f6' : '#d1d5db', paddingVertical: 16, borderRadius: 12, alignItems: 'center' }}
                    >
                      <Text style={{ color: allReady ? 'white' : '#9ca3af', fontSize: 16, fontWeight: '900', letterSpacing: 1 }}>{allReady ? t('pos.serving.serve_all', language) : t('pos.serving.waiting', language)}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
