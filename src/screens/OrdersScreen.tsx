import React, { useState } from "react";
import { StatusBar } from 'expo-status-bar';
import { View, Text, SafeAreaView, TouchableOpacity, FlatList, ActivityIndicator, ScrollView, Alert, useWindowDimensions } from 'react-native';
import { usePosStore } from "../store/posStore";
import { t } from '../utils/i18n';
import { formatCurrency } from '../utils/currency';
import type { Order, OrderLineItem, MenuItem, ItemOption, ItemOptionChoice, CartItemIngredient, CartItem, Payment } from '../types';

interface OrdersScreenProps {
  bgStr: string;
  tp: Record<string, string>;
  language: string;
}

export default function OrdersScreen({ bgStr, tp, language }: OrdersScreenProps) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const {
    setScreen, ordersList, isLoadingOrders, loadOrder, items, allIngredients, currency
  } = usePosStore();

  const [orderTab, setOrderTab] = useState<'open' | 'paid' | 'void'>('open');
  const [selectedPastOrder, setSelectedPastOrder] = useState<any | null>(null);

  const openOrders = ordersList.filter((o: Order) => o.status === 'open');
  const paidOrders = ordersList.filter((o: Order) => o.status === 'paid');
  const voidOrders = ordersList.filter((o: Order) => o.status === 'void' || o.status === 'voided' || o.status === 'cancelled');
  const tabData = orderTab === 'open' ? openOrders : orderTab === 'paid' ? paidOrders : voidOrders;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bgStr }}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: 'white' }}>
        <TouchableOpacity onPress={() => setScreen('home')} style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
          <Text style={{ fontWeight: 'bold', color: '#374151' }}>{t('pos.orders.back', language)}</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '900', color: '#111827' }}>{t('pos.orders.title', language)}</Text>
        <TouchableOpacity onPress={() => usePosStore.getState().fetchOrders()} style={{ backgroundColor: tp[50], paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
          <Text style={{ fontWeight: 'bold', color: tp[600] }}>{t('pos.orders.refresh', language)}</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={{ backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingHorizontal: 16, paddingVertical: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setOrderTab('open')}
            style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 99, borderWidth: 1, backgroundColor: orderTab === 'open' ? tp[600] : 'white', borderColor: orderTab === 'open' ? tp[600] : '#e5e7eb' }}
          >
            <Text style={{ fontWeight: 'bold', color: orderTab === 'open' ? 'white' : '#374151' }}>{t('pos.orders.open', language)} ({openOrders.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setOrderTab('paid')}
            style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 99, borderWidth: 1, backgroundColor: orderTab === 'paid' ? tp[600] : 'white', borderColor: orderTab === 'paid' ? tp[600] : '#e5e7eb' }}
          >
            <Text style={{ fontWeight: 'bold', color: orderTab === 'paid' ? 'white' : '#374151' }}>{t('pos.orders.paid_tab', language)} ({paidOrders.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setOrderTab('void')}
            style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 99, borderWidth: 1, backgroundColor: orderTab === 'void' ? tp[600] : 'white', borderColor: orderTab === 'void' ? tp[600] : '#e5e7eb' }}
          >
            <Text style={{ fontWeight: 'bold', color: orderTab === 'void' ? 'white' : '#374151' }}>{t('pos.orders.void_tab', language)} ({voidOrders.length})</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoadingOrders ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={tp[600]} />
        </View>
      ) : (
        <FlatList
          data={tabData}
          keyExtractor={o => o.id}
          contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 16, paddingTop: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => {
            const isOpen = item.status === 'open';
            const isVoid = item.status === 'void' || item.status === 'voided' || item.status === 'cancelled';
            const orderTypeLbl = item.type === 'dine_in' ? `🍽 ${t('pos.orders.dine_in', language)}` : `🛍 ${t('pos.orders.take_out', language)}`;
            const tableLabel = item.type === 'dine_in' && item.table_name ? ` — ${item.table_name}` : '';

            const borderColor = '#e5e7eb';
            const badgeBg = isVoid ? '#f3f4f6' : isOpen ? tp[100] : '#d1fae5';
            const badgeText = isVoid ? '#9ca3af' : isOpen ? tp[700] : '#065f46';
            const badgeLabel = isVoid ? t('pos.orders.badge_void', language) : isOpen ? t('pos.orders.badge_open', language) : t('pos.orders.badge_paid', language);

            return (
              <TouchableOpacity
                disabled={isVoid}
                onPress={() => {
                  if (isOpen) {
                    loadOrder(item);
                  } else {
                    setSelectedPastOrder(item);
                  }
                }}
                style={{
                  backgroundColor: isVoid ? '#fafafa' : 'white',
                  padding: 16,
                  borderRadius: 12,
                  borderWidth: isOpen ? 2 : 1,
                  borderColor,
                  opacity: isVoid ? 0.75 : 1,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 17, fontWeight: 'bold', color: isVoid ? '#9ca3af' : '#111827' }}>
                    {t('pos.orders.order', language)} #{item.order_number}
                  </Text>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: badgeBg }}>
                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: badgeText }}>{badgeLabel}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <Text style={{ fontSize: 14, color: '#6b7280' }}>
                    {item.customer_name ? `👤 ${item.customer_name}` : `👤 ${t('pos.orders.walk_in', language)}`}
                  </Text>
                  <Text style={{ fontSize: 13, color: isVoid ? '#d1d5db' : tp[600], fontWeight: '600' }}>
                    {orderTypeLbl}{tableLabel}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>
                    {new Date(item.created_at).toLocaleString()}
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: isVoid ? '#9ca3af' : tp[700] }}>
                    {formatCurrency((item.total_amount || 0), currency)}
                  </Text>
                </View>

                {isOpen && (
                  <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1, backgroundColor: tp[50], padding: 8, borderRadius: 8, alignItems: 'center' }}>
                      <Text style={{ color: tp[600], fontWeight: 'bold', fontSize: 12 }}>{t('pos.orders.tap_reopen', language)}</Text>
                    </View>
                    <TouchableOpacity 
                      onPress={(e) => { 
                          e.stopPropagation();
                          if (window.confirm && window.confirm(t('pos.orders.void_confirm', language))) {
                              usePosStore.getState().voidOrder(item.id); 
                          }
                      }}
                      style={{ backgroundColor: '#fee2e2', padding: 8, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 12 }}>{t('pos.orders.void_btn', language)}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Text style={{ fontSize: 32, marginBottom: 12 }}>
                {orderTab === 'open' ? '🛒' : orderTab === 'paid' ? '✅' : '🚫'}
              </Text>
              <Text style={{ textAlign: 'center', color: '#6b7280', fontSize: 16 }}>
                {orderTab === 'open' ? t('pos.orders.no_open', language) : orderTab === 'paid' ? t('pos.orders.no_paid', language) : t('pos.orders.no_void', language)}
              </Text>
            </View>
          }
        />
      )}

      {/* Past Order Receipt Modal */}
      {selectedPastOrder && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, elevation: 130, zIndex: 130 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ backgroundColor: '#f8fafc', borderRadius: 8, width: 380, maxHeight: '90%', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 40, overflow: 'hidden' }}>

              <View style={{ backgroundColor: 'white', padding: 32, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#e2e8f0', borderStyle: 'dashed' }}>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', letterSpacing: 2 }}>{t('pos.receipt.copy', language)}</Text>
                <Text style={{ fontSize: 14, color: '#64748b', marginTop: 8 }}>{t('pos.lbl.order_prefix', language)} #{selectedPastOrder.order_number}</Text>
                {selectedPastOrder.table_name && <Text style={{ fontSize: 14, color: '#64748b', fontWeight: 'bold' }}>{t('pos.receipt.table', language)} {selectedPastOrder.table_name}</Text>}
                <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{new Date(selectedPastOrder.created_at).toLocaleString()}</Text>
              </View>

              <ScrollView style={{ backgroundColor: 'white', padding: 32 }} showsVerticalScrollIndicator={false}>
                <View style={{ marginBottom: 24 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{t('pos.receipt.items', language)}</Text>
                  {(selectedPastOrder.order_line_items || []).map((line: OrderLineItem, idx: number) => {
                    const posState = usePosStore.getState();
                    const product = posState.items.find((i: MenuItem) => i.id === line.item_id) || posState.allIngredients.find((i: MenuItem) => i.id === line.item_id);

                    let unitPrice = product ? product.base_price : 0;
                    const mods = line.modifications || {};

                    if (mods.selectedOptions && product && product.options) {
                      product.options.forEach((opt: ItemOption) => {
                        const choice = mods.selectedOptions![opt.name];
                        if (choice) {
                          const cDef = (opt.choices || []).find((c: ItemOptionChoice) => c.name === choice);
                          if (cDef?.price_modifier) unitPrice += cDef.price_modifier;
                        }
                      });
                    }

                    (mods.ingredients || []).forEach((ing: CartItemIngredient) => {
                      if (ing.extra && !ing.removed) unitPrice += (ing.base_price || 0);
                    });

                    (mods.sub_items || []).forEach((sub: CartItem) => {
                      let subPrice = 0;
                      const subProd = posState.items.find((i: MenuItem) => i.id === sub.item?.id);
                      if (sub.selectedOptions && subProd?.options) {
                        subProd.options.forEach((opt: ItemOption) => {
                          const choice = sub.selectedOptions![opt.name];
                          if (choice) {
                            const cDef = (opt.choices || []).find((c: ItemOptionChoice) => c.name === choice);
                            if (cDef?.price_modifier) subPrice += cDef.price_modifier;
                          }
                        });
                      }
                      (sub.ingredients || []).forEach((ing: CartItemIngredient) => {
                        if (ing.extra && !ing.removed) subPrice += (ing.base_price || 0);
                      });
                      unitPrice += (subPrice * (sub.quantity || 1));
                    });

                    const lineTotal = unitPrice * line.quantity;

                    return (
                      <View key={idx} style={{ marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: '#334155' }}>
                            {line.quantity}x {product ? product.name : line.item_name || 'Item'}
                          </Text>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>
                            {formatCurrency(lineTotal, currency)}
                          </Text>
                        </View>

                        {mods.selectedOptions && Object.entries(mods.selectedOptions).map(([k, v]) => (
                          <Text key={k} style={{ fontSize: 13, color: '#64748b', marginLeft: 16 }}>+ {k}: {String(v)}</Text>
                        ))}
                        {(mods.ingredients || []).filter((i: CartItemIngredient) => i.extra || i.removed).map((ing: CartItemIngredient) => (
                          <Text key={ing.instance_id} style={{ fontSize: 13, color: ing.removed ? '#f87171' : '#64748b', marginLeft: 16, textDecorationLine: ing.removed ? 'line-through' : 'none' }}>
                            {ing.extra ? '+ ' : '- '}{ing.name}
                          </Text>
                        ))}

                        {(mods.sub_items || []).map((sub: CartItem, sIdx: number) => (
                          <View key={sIdx} style={{ marginTop: 4, marginLeft: 16 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569' }}>- {sub.item?.name || 'Item'}</Text>
                            {sub.selectedOptions && Object.entries(sub.selectedOptions).map(([k, v]) => (
                              <Text key={k} style={{ fontSize: 12, color: '#94a3b8', marginLeft: 12 }}>+ {k}: {String(v)}</Text>
                            ))}
                            {(sub.ingredients || []).filter((i: CartItemIngredient) => i.extra || i.removed).map((ing: CartItemIngredient) => (
                              <Text key={ing.instance_id} style={{ fontSize: 12, color: ing.removed ? '#fca5a5' : '#94a3b8', marginLeft: 12, textDecorationLine: ing.removed ? 'line-through' : 'none' }}>
                                {ing.extra ? '+ ' : '- '}{ing.name}
                              </Text>
                            ))}
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>

                <View style={{ borderTopWidth: 2, borderTopColor: '#e2e8f0', borderStyle: 'dashed', paddingTop: 24, marginBottom: 24 }}>
                  <View style={{ gap: 8, marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, color: '#64748b' }}>{t('pos.receipt.subtotal', language) || 'Subtotal'}</Text>
                      <Text style={{ fontSize: 14, color: '#334155' }}>{formatCurrency((selectedPastOrder.subtotal_bruto || selectedPastOrder.total_amount || 0), currency)}</Text>
                    </View>
                    {selectedPastOrder.total_descuentos > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, color: '#ef4444' }}>{t('pos.receipt.discount', language) || 'Descuentos'}</Text>
                        <Text style={{ fontSize: 14, color: '#ef4444' }}>-{formatCurrency(selectedPastOrder.total_descuentos, currency)}</Text>
                      </View>
                    )}
                    {(selectedPastOrder.monto_iva !== undefined) && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, color: '#64748b' }}>{t('pos.receipt.tax', language) || 'IVA (15%)'}</Text>
                        <Text style={{ fontSize: 14, color: '#334155' }}>{formatCurrency((selectedPastOrder.monto_iva || 0), currency)}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 16 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#334155' }}>{t('pos.receipt.total', language)}</Text>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: '#0f172a' }}>{formatCurrency((selectedPastOrder.total_amount || 0), currency)}</Text>
                  </View>
                </View>

                <View>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{t('pos.receipt.payments', language)}</Text>
                  {(selectedPastOrder.payments || []).length === 0 ? (
                    <Text style={{ fontSize: 14, color: '#94a3b8', fontStyle: 'italic' }}>{t('pos.receipt.no_payments', language)}</Text>
                  ) : (selectedPastOrder.payments || []).map((p: Payment, idx: number) => (
                    <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 14, color: '#64748b', textTransform: 'capitalize' }}>
                        {p.method.replace('_', ' ')} {p.reference_id ? `(${p.reference_id})` : ''}
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#334155' }}>{formatCurrency(p.amount, currency)}</Text>
                    </View>
                  ))}
                  {(() => {
                    const totalPaidPast = (selectedPastOrder.payments || []).reduce((sum: number, p: Payment) => sum + (p.amount || 0), 0);
                    const changeDue = totalPaidPast - (selectedPastOrder.total_amount || 0);
                    if (changeDue > 0.001) {
                      return (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0' }}>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: '#16a34a' }}>{language === 'es' ? '💵 Vuelto' : '💵 Change'}</Text>
                          <Text style={{ fontSize: 15, fontWeight: '900', color: '#16a34a' }}>{formatCurrency(changeDue, currency)}</Text>
                        </View>
                      );
                    }
                    return null;
                  })()}
                </View>
              </ScrollView>

              <View style={{ padding: 24, backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: '#e2e8f0', gap: 12 }}>
                <TouchableOpacity
                  onPress={async () => {
                    const pos = usePosStore.getState();
                    if (!pos.localReceiptPrinterId) {
                      Alert.alert(t('pos.receipt.no_printer', language), t('pos.receipt.no_printer_desc', language));
                    } else {
                      const result = await pos.printCustomerReceipt(selectedPastOrder);
                      if (!result.success) {
                        let errMsg = '';
                        if (result.error === 'NO_NATIVE_MODULE') {
                          errMsg = language === 'es'
                            ? 'El módulo de red local no está disponible en este entorno (ej. si estás en navegador web o Expo Go). Por favor usa el APK instalado en tu tableta.'
                            : 'Local network printing is not supported in this environment (e.g. web browser or Expo Go). Please use the compiled APK on your tablet.';
                        } else if (result.error === 'TIMEOUT') {
                          errMsg = language === 'es'
                            ? 'Tiempo de espera agotado al conectar a la impresora. Verifica que esté encendida y en la misma red WiFi.'
                            : 'Connection timed out. Make sure the printer is turned on and connected to the same WiFi.';
                        } else if (result.error === 'CONNECTION_FAILED') {
                          errMsg = language === 'es'
                            ? 'Error de conexión física. Verifica que la dirección IP de la impresora en Ajustes sea correcta y que esté conectada al router.'
                            : 'Connection failed. Verify that the printer IP address in Settings is correct and it is connected to the router.';
                        } else {
                          errMsg = language === 'es'
                            ? `Error de impresión (${result.error}). Verifica la configuración de red.`
                            : `Print error (${result.error}). Verify your network configuration.`;
                        }
                        Alert.alert(
                          language === 'es' ? 'Error de Impresión' : 'Print Error',
                          errMsg
                        );
                      }
                    }
                  }}
                  style={{ backgroundColor: tp[600], paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>{t('pos.receipt.print', language)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSelectedPastOrder(null)}
                  style={{ backgroundColor: '#e2e8f0', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: '#475569', fontWeight: 'bold', fontSize: 16 }}>{t('pos.receipt.close', language)}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
