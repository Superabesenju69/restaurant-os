import React, { useState } from "react";
import { StatusBar } from 'expo-status-bar';
import { View, Text, SafeAreaView, TouchableOpacity, ScrollView, Image, TextInput } from 'react-native';
import { usePosStore } from "../store/posStore";
import { t } from '../utils/i18n';
import { formatCurrency } from '../utils/currency';
import type { TableZone, FloorTable, OrderLineItem, MenuItem } from '../types';

interface TablesScreenProps {
  bgStr: string;
  tp: Record<string, string>;
  language: string;
  mapWidth: number;
  mapHeight: number;
}

export default function TablesScreen({ bgStr, tp, language, mapWidth, mapHeight }: TablesScreenProps) {
  const {
    setScreen, mapBackgroundUrl, tables, zones, items, ordersList,
    updateTableStatus, reserveTable, startOrder, loadOrder, currency
  } = usePosStore();

  const [floorZoneFilter, setFloorZoneFilter] = useState('all');
  const [selectedTableForOrders, setSelectedTableForOrders] = useState<any | null>(null);
  const [tableOrderNameInput, setTableOrderNameInput] = useState('');
  const [showReservationForm, setShowReservationForm] = useState(false);
  const [reservationName, setReservationName] = useState('');
  const [reservationDate, setReservationDate] = useState('');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bgStr }}>
      <StatusBar style="dark" />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: 'white' }}>
        <TouchableOpacity onPress={() => setScreen('home')} style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
          <Text style={{ fontWeight: 'bold', color: '#374151' }}>{t('pos.floor.back', language)}</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '900', color: '#111827' }}>{t('pos.floor.select_table', language)}</Text>
        <View style={{ width: 70 }} />
      </View>

      {/* Zone Filter */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, flexDirection: 'row', gap: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
           <TouchableOpacity
              onPress={() => setFloorZoneFilter('all')}
              style={{
                paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                backgroundColor: floorZoneFilter === 'all' ? '#111827' : 'white',
                borderWidth: 1, borderColor: floorZoneFilter === 'all' ? '#111827' : '#d1d5db'
              }}
           >
              <Text style={{ fontWeight: 'bold', color: floorZoneFilter === 'all' ? 'white' : '#374151' }}>{t('pos.floor.all', language)}</Text>
           </TouchableOpacity>
           {zones.map((z: TableZone) => (
              <TouchableOpacity
                key={z.id}
                onPress={() => setFloorZoneFilter(z.id)}
                style={{
                  paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                  backgroundColor: floorZoneFilter === z.id ? (z.color || '#3b82f6') : 'white',
                  borderWidth: 1, borderColor: floorZoneFilter === z.id ? (z.color || '#3b82f6') : '#d1d5db'
                }}
              >
                <Text style={{ fontWeight: 'bold', color: floorZoneFilter === z.id ? 'white' : '#374151' }}>{z.name}</Text>
              </TouchableOpacity>
           ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1, padding: 20 }}>
        <View style={{ flex: 1, width: '100%', overflow: 'hidden', borderRadius: 16, backgroundColor: '#fdfbeb', borderWidth: 1, borderColor: '#e5e7eb' }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={true} style={{ flex: 1 }}>
              <View style={{ width: mapWidth, height: mapHeight, position: 'relative' }}>
                {mapBackgroundUrl && (
                  <Image
                    source={{ uri: mapBackgroundUrl }}
                    style={{ width: '100%', height: '100%', position: 'absolute', opacity: 0.5 }}
                    resizeMode="cover"
                  />
                )}

                {tables.filter(tbl => floorZoneFilter === 'all' || tbl.zone === floorZoneFilter).map((table: FloorTable) => {
                  const isWall = table.shape === 'wall';
                  const isCircle = table.shape === 'circle';
                  const isOccupied = table.status === 'occupied';
                  const isReserved = table.status === 'reserved';
                  const isUnavailable = table.status === 'unavailable';
                  
                  let bg = 'white';
                  let border = '#e5e7eb';
                  let text = '#374151';
                  if (isWall) { bg = '#f3f4f6'; border = '#e5e7eb'; }
                  else if (isOccupied) { bg = '#fef08a'; border = '#facc15'; text = '#854d0e'; }
                  else if (isReserved) { bg = '#fbcfe8'; border = '#f472b6'; text = '#9d174d'; }
                  else if (isUnavailable) { bg = '#f3f4f6'; border = '#d1d5db'; text = '#6b7280'; }

                  const minDim = Math.min(table.width, table.height);
                  const titleSize = Math.max(10, minDim * 0.18);
                  const badgeSize = Math.max(7, minDim * 0.09);
                  const showBadge = minDim >= 60;

                  return (
                    <TouchableOpacity
                      key={table.id}
                      disabled={isWall}
                      onPress={() => setSelectedTableForOrders(table)}
                      style={{
                        position: 'absolute',
                        left: table.x,
                        top: table.y,
                        width: table.width,
                        height: table.height,
                        backgroundColor: bg,
                        borderColor: border,
                        borderWidth: isOccupied || isReserved ? 3 : 2,
                        borderRadius: isCircle ? 999 : (isWall ? 4 : 12),
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: isWall || isUnavailable ? 0.8 : 1,
                        shadowColor: isOccupied ? '#eab308' : (isReserved ? '#db2777' : '#000'),
                        shadowOpacity: isWall ? 0 : (isOccupied || isReserved ? 0.4 : 0.05),
                        shadowRadius: isOccupied || isReserved ? 12 : 6,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: isWall ? 0 : (isOccupied || isReserved ? 8 : 3),
                        transform: [{ rotate: `${table.rotation || 0}deg` }]
                      }}
                    >
                      {!isWall && (
                        <>
                          <Text style={{ fontWeight: '900', color: text, fontSize: titleSize, textAlign: 'center', paddingHorizontal: 4 }} numberOfLines={1}>{table.name}</Text>
                          {table.seats && (
                            <View style={{ position: 'absolute', bottom: -5, right: -5, backgroundColor: '#374151', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{table.seats}</Text>
                            </View>
                          )}
                          {showBadge && (
                            <View style={{ backgroundColor: isOccupied ? '#fde047' : (isReserved ? '#fbcfe8' : '#f3f4f6'), paddingHorizontal: Math.max(4, minDim * 0.05), paddingVertical: 2, borderRadius: 99, marginTop: 4 }}>
                              <Text style={{ fontSize: badgeSize, fontWeight: '900', color: text }}>
                                {table.status === 'occupied' ? t('pos.table.occupied', language) : table.status === 'reserved' ? t('pos.table.reserved', language) : table.status === 'unavailable' ? t('pos.table.unavailable', language) : t('pos.table.available', language)}
                              </Text>
                            </View>
                          )}
                        </>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </ScrollView>
        </View>
      </View>

      {/* Selected Table Orders Overlay */}
      {selectedTableForOrders && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 28, width: '90%', maxWidth: 640, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, maxHeight: '85%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827' }}>🪑 {selectedTableForOrders.name}</Text>
              <TouchableOpacity onPress={() => { setSelectedTableForOrders(null); setShowReservationForm(false); }} style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
                <Text style={{ fontWeight: 'bold', color: '#374151' }}>{t('pos.table.close', language)}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
               <Text style={{ color: '#6b7280', fontSize: 14 }}>
                 {ordersList.filter(o => o.table_id === selectedTableForOrders.id && o.status === 'open').length} {t('pos.table.active_orders', language)}
               </Text>
               <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity onPress={() => updateTableStatus(selectedTableForOrders.id, 'available')} style={{ backgroundColor: selectedTableForOrders.status === 'available' ? '#111827' : '#f3f4f6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                     <Text style={{ fontSize: 12, fontWeight: 'bold', color: selectedTableForOrders.status === 'available' ? 'white' : '#4b5563' }}>{t('pos.table.btn_available', language)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => updateTableStatus(selectedTableForOrders.id, 'occupied')} style={{ backgroundColor: selectedTableForOrders.status === 'occupied' ? '#111827' : '#fef08a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                     <Text style={{ fontSize: 12, fontWeight: 'bold', color: selectedTableForOrders.status === 'occupied' ? 'white' : '#854d0e' }}>{t('pos.table.btn_occupied', language)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setSelectedTableForOrders(selectedTableForOrders); setShowReservationForm(true); }} style={{ backgroundColor: selectedTableForOrders.status === 'reserved' ? '#111827' : '#fbcfe8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                     <Text style={{ fontSize: 12, fontWeight: 'bold', color: selectedTableForOrders.status === 'reserved' ? 'white' : '#9d174d' }}>{t('pos.table.btn_reserve', language)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => updateTableStatus(selectedTableForOrders.id, 'unavailable')} style={{ backgroundColor: selectedTableForOrders.status === 'unavailable' ? '#111827' : '#f3f4f6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                     <Text style={{ fontSize: 12, fontWeight: 'bold', color: selectedTableForOrders.status === 'unavailable' ? 'white' : '#4b5563' }}>{t('pos.table.btn_block', language)}</Text>
                  </TouchableOpacity>
               </View>
            </View>

            {selectedTableForOrders.status === 'reserved' && !showReservationForm && (
               <View style={{ backgroundColor: '#fbcfe8', padding: 12, borderRadius: 8, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontWeight: 'bold', color: '#9d174d' }}>{t('pos.table.reserved_label', language)}</Text>
                    {selectedTableForOrders.reserved_by && <Text style={{ color: '#9d174d', fontSize: 13 }}>{t('pos.table.guest', language)} {selectedTableForOrders.reserved_by}</Text>}
                    {selectedTableForOrders.reserved_at && <Text style={{ color: '#9d174d', fontSize: 13 }}>{t('pos.table.time', language)} {new Date(selectedTableForOrders.reserved_at).toLocaleString()}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => updateTableStatus(selectedTableForOrders.id, 'available')} style={{ backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}>
                    <Text style={{ color: '#9d174d', fontWeight: 'bold', fontSize: 12 }}>{t('pos.table.unreserve', language)}</Text>
                  </TouchableOpacity>
               </View>
            )}

            {showReservationForm ? (
               <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 16 }}>{t('pos.table.reservation_details', language)}</Text>
                  <TextInput style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, marginBottom: 8 }} placeholder={t('pos.table.guest_name', language)} value={reservationName} onChangeText={setReservationName} />
                  <TextInput style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, marginBottom: 12 }} placeholder={t('pos.table.date_time', language)} value={reservationDate} onChangeText={setReservationDate} />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                     <TouchableOpacity onPress={() => {
                        reserveTable(selectedTableForOrders.id, reservationName, reservationDate);
                        setShowReservationForm(false);
                        setReservationName('');
                        setReservationDate('');
                     }} style={{ flex: 1, backgroundColor: '#db2777', padding: 12, borderRadius: 8, alignItems: 'center' }}>
                        <Text style={{ color: 'white', fontWeight: 'bold' }}>{t('pos.table.confirm_reservation', language)}</Text>
                     </TouchableOpacity>
                     <TouchableOpacity onPress={() => setShowReservationForm(false)} style={{ flex: 1, backgroundColor: '#f3f4f6', padding: 12, borderRadius: 8, alignItems: 'center' }}>
                        <Text style={{ color: '#374151', fontWeight: 'bold' }}>{t('pos.modal.cancel', language)}</Text>
                     </TouchableOpacity>
                  </View>
               </View>
            ) : (
              <>
                <ScrollView style={{ maxHeight: 460, marginBottom: 16 }} showsVerticalScrollIndicator={true}>
              {ordersList.filter(o => o.table_id === selectedTableForOrders.id && o.status === 'open').length === 0 ? (
                <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                  <Text style={{ color: '#6b7280', fontSize: 16 }}>{t('pos.table.no_active_orders', language)}</Text>
                  <Text style={{ color: '#9ca3af', fontSize: 13, marginTop: 8 }}>{t('pos.table.use_form', language)}</Text>
                </View>
              ) : (
                ordersList.filter(o => o.table_id === selectedTableForOrders.id && o.status === 'open').map(order => {
                  const totalItems = (order.order_line_items || []).reduce((acc: number, curr: OrderLineItem) => acc + curr.quantity, 0);
                  const createdDate = new Date(order.created_at);
                  const timeString = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <View key={order.id} style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 12 }}>
                        <View>
                          <Text style={{ fontWeight: '900', fontSize: 20, color: '#111827' }}>{order.customer_name || t('pos.table.walk_in', language)}</Text>
                          <Text style={{ color: '#4b5563', fontSize: 14, marginTop: 4 }}>
                            <Text style={{ fontWeight: 'bold' }}>{t('pos.lbl.order_prefix', language)} #{order.order_number || order.id.slice(0, 6).toUpperCase()}</Text> • 🕒 {timeString}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontWeight: '900', fontSize: 22, color: '#059669' }}>{formatCurrency((order.total_amount || 0), currency)}</Text>
                          <Text style={{ color: '#6b7280', fontSize: 13, fontWeight: 'bold', marginTop: 2 }}>{totalItems} {t('pos.table.items', language)}</Text>
                        </View>
                      </View>

                      <View style={{ marginBottom: 16 }}>
                        {(order.order_line_items || []).length === 0 ? (
                          <Text style={{ color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', paddingVertical: 10 }}>{t('pos.table.cart_empty', language)}</Text>
                        ) : (
                          (order.order_line_items || []).map((line: OrderLineItem, idx: number) => {
                            const product = items.find((i: MenuItem) => i.id === line.item_id);
                            return (
                              <View key={idx} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: idx === (order.order_line_items || []).length - 1 ? 0 : 1, borderBottomColor: '#f3f4f6' }}>
                                <Text style={{ fontWeight: 'bold', width: 32, color: '#374151' }}>{line.quantity}x</Text>
                                <Text style={{ color: '#1f2937', flex: 1 }} numberOfLines={2}>{product ? product.name : 'Unknown Item'}</Text>
                              </View>
                            );
                          })
                        )}
                      </View>

                      <TouchableOpacity
                        style={{ backgroundColor: tp[600], paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                        onPress={() => {
                          setSelectedTableForOrders(null);
                          loadOrder(order);
                        }}
                      >
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>{t('pos.table.open_pos', language)}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={{ borderTopWidth: 1, borderColor: '#e5e7eb', paddingTop: 20 }}>
              <Text style={{ fontWeight: 'bold', marginBottom: 8, color: '#374151' }}>{t('pos.table.start_new', language)}</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TextInput
                  style={{ flex: 1, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, paddingHorizontal: 16, fontSize: 16 }}
                  placeholder={t('pos.modal.customer_name', language)}
                  value={tableOrderNameInput}
                  onChangeText={setTableOrderNameInput}
                />
                <TouchableOpacity
                  disabled={tableOrderNameInput.trim().length === 0}
                  style={{ backgroundColor: tableOrderNameInput.trim().length === 0 ? '#d1d5db' : tp[600], paddingHorizontal: 24, paddingVertical: 16, borderRadius: 12, justifyContent: 'center' }}
                  onPress={() => {
                    setSelectedTableForOrders(null);
                    startOrder('dine_in', selectedTableForOrders, tableOrderNameInput);
                    setTableOrderNameInput('');
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>{t('pos.table.add', language)}</Text>
                </TouchableOpacity>
              </View>
            </View>
            </>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
