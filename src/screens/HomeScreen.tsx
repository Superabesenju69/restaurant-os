import React, { useState } from "react";
import { StatusBar } from 'expo-status-bar';
import { View, Text, SafeAreaView, TouchableOpacity, ScrollView, Image, TextInput, useWindowDimensions } from 'react-native';
import { usePosStore } from "../store/posStore";
import { t } from '../utils/i18n';
import type { FloorTable, Printer } from '../types';

interface HomeScreenProps {
  bgStr: string;
  tp: Record<string, string>;
  language: string;
  mapWidth: number;
  mapHeight: number;
}

export default function HomeScreen({ bgStr, tp, language, mapWidth, mapHeight }: HomeScreenProps) {
  const setScreen = usePosStore(s => s.setScreen);
  const tableServiceEnabled = usePosStore(s => s.tableServiceEnabled);
  const mapBackgroundUrl = usePosStore(s => s.mapBackgroundUrl);
  const tables = usePosStore(s => s.tables);
  const startOrder = usePosStore(s => s.startOrder);
  const currentPosUser = usePosStore(s => s.currentPosUser);
  const posLogout = usePosStore(s => s.posLogout);
  const printers = usePosStore(s => s.printers);
  const localReceiptPrinterId = usePosStore(s => s.localReceiptPrinterId);
  const setLocalReceiptPrinterId = usePosStore(s => s.setLocalReceiptPrinterId);
  const setLanguage = usePosStore(s => s.setLanguage);
  const activeCashShift = usePosStore(s => s.activeCashShift);
  const setShowCashRegisterModal = usePosStore(s => s.setShowCashRegisterModal);

  const { width: winWidth } = useWindowDimensions();
  const isCompact = winWidth < 640;

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showOrderTypeModal, setShowOrderTypeModal] = useState(false);
  const [selectedOrderType, setSelectedOrderType] = useState<'dine_in' | 'take_out' | null>(null);
  const [orderCreationStep, setOrderCreationStep] = useState<'type' | 'name' | 'table'>('type');
  const [newOrderCustomerName, setNewOrderCustomerName] = useState('');
  const [fitFloorToScreen, setFitFloorToScreen] = useState(true);
  const [floorContainerSize, setFloorContainerSize] = useState({ width: 0, height: 0 });

  const handleStartModalOrder = (type: 'dine_in' | 'take_out', table?: FloorTable) => {
    setShowOrderTypeModal(false);
    setSelectedOrderType(null);
    setOrderCreationStep('type');
    startOrder(type, table, newOrderCustomerName);
    setNewOrderCustomerName('');
  };

  if (!currentPosUser) return null;

  const floorScale = fitFloorToScreen && floorContainerSize.width > 0 && floorContainerSize.height > 0
    ? Math.min(1, floorContainerSize.width / mapWidth, floorContainerSize.height / mapHeight)
    : 1;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bgStr }}>
      <StatusBar style="dark" />
      {/* Top Header Bar (Responsive wrap, no overlap) */}
      <View style={{ width: '100%', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
        <TouchableOpacity 
          onPress={() => setShowCashRegisterModal(true)} 
          style={{ backgroundColor: activeCashShift ? '#e0f2fe' : '#fee2e2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: activeCashShift ? '#0284c7' : '#dc2626' }}>
            {activeCashShift ? (language === 'es' ? '💵 Caja Abierta' : '💵 Register Open') : (language === 'es' ? '💵 Abrir Caja' : '💵 Open Register')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowSettingsModal(true)} style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#4b5563' }}>{t('pos.home.settings', language)}</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>{currentPosUser.full_name}</Text>
          <Text style={{ fontSize: 11, color: '#9ca3af', textTransform: 'capitalize' }}>{currentPosUser.role.replace('_', ' ')}</Text>
        </View>
        <TouchableOpacity onPress={posLogout} style={{ backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626' }}>{t('pos.home.signout', language)}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
        <Text style={{ fontSize: isCompact ? 28 : 36, fontWeight: '900', color: '#111827', marginBottom: isCompact ? 24 : 40, textAlign: 'center' }}>Restaurant OS</Text>
        <View style={{ width: '100%', maxWidth: 640, gap: 16 }}>
          <TouchableOpacity
            style={{ backgroundColor: tp[600], padding: isCompact ? 18 : 24, borderRadius: 20, alignItems: 'center' }}
            onPress={() => {
              if (tableServiceEnabled) {
                setShowOrderTypeModal(true);
              } else {
                startOrder('take_out');
              }
            }}
          >
            <Text style={{ color: 'white', fontSize: isCompact ? 18 : 22, fontWeight: 'bold' }}>{t('pos.home.new_order', language)}</Text>
          </TouchableOpacity>

          {tableServiceEnabled && (
            <TouchableOpacity
              style={{ backgroundColor: tp[600], padding: isCompact ? 18 : 24, borderRadius: 20, alignItems: 'center' }}
              onPress={() => setScreen('tables')}
            >
              <Text style={{ color: 'white', fontSize: isCompact ? 18 : 22, fontWeight: 'bold' }}>{t('pos.home.view_floor', language)}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={{ backgroundColor: 'white', padding: isCompact ? 18 : 24, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' }}
            onPress={() => setScreen('orders')}
          >
            <Text style={{ color: '#111827', fontSize: isCompact ? 18 : 22, fontWeight: 'bold' }}>{t('pos.home.order_history', language)}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ backgroundColor: '#10b981', padding: isCompact ? 18 : 24, borderRadius: 20, alignItems: 'center' }}
            onPress={() => setScreen('serving')}
          >
            <Text style={{ color: 'white', fontSize: isCompact ? 18 : 22, fontWeight: 'bold' }}>{t('pos.home.ready_orders', language)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Order Type Overlay */}
      {showOrderTypeModal && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          {orderCreationStep === 'table' && selectedOrderType === 'dine_in' ? (
            <View style={{ backgroundColor: '#fdfbeb', borderRadius: 24, padding: 20, width: '95%', height: '90%', maxWidth: 1000, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Text style={{ fontSize: isCompact ? 18 : 24, fontWeight: '900', color: '#111827' }}>{t('pos.modal.select_table_for', language)} {newOrderCustomerName}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setFitFloorToScreen(f => !f)}
                    style={{ backgroundColor: fitFloorToScreen ? tp[100] : '#f3f4f6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                  >
                    <Text style={{ fontWeight: 'bold', color: fitFloorToScreen ? tp[700] : '#374151', fontSize: 13 }}>
                      {fitFloorToScreen ? (language === 'es' ? '🔍 Ajustar Pantalla' : '🔍 Fit Screen') : '100%'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setOrderCreationStep('name')} style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
                    <Text style={{ fontWeight: 'bold', color: '#374151' }}>{t('pos.modal.back', language).replace('←', '').trim()}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View
                style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, overflow: 'hidden' }}
                onLayout={e => setFloorContainerSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
              >
                <ScrollView horizontal showsHorizontalScrollIndicator={!fitFloorToScreen} style={{ flex: 1 }}>
                  <ScrollView showsVerticalScrollIndicator={!fitFloorToScreen} style={{ flex: 1 }}>
                    <View style={{ width: mapWidth * floorScale, height: mapHeight * floorScale, position: 'relative' }}>
                      {mapBackgroundUrl && (
                        <Image source={{ uri: mapBackgroundUrl }} style={{ width: '100%', height: '100%', position: 'absolute', opacity: 0.5 }} resizeMode="cover" />
                      )}
                      {tables.map(table => {
                        const isWall = table.shape === 'wall';
                        const isCircle = table.shape === 'circle';
                        const isOccupied = table.status === 'occupied';
                        const scaledW = table.width * floorScale;
                        const scaledH = table.height * floorScale;
                        const minDim = Math.min(scaledW, scaledH);
                        const titleSize = Math.max(9, minDim * 0.18);
                        const badgeSize = Math.max(6, minDim * 0.09);
                        const showBadge = minDim >= 48;

                        return (
                          <TouchableOpacity
                            key={table.id}
                            disabled={isWall}
                            onPress={() => handleStartModalOrder('dine_in', table)}
                            style={{
                              position: 'absolute',
                              left: table.x * floorScale,
                              top: table.y * floorScale,
                              width: scaledW,
                              height: scaledH,
                              backgroundColor: isWall ? '#f3f4f6' : (isOccupied ? '#fef08a' : 'white'),
                              borderColor: isWall ? '#e5e7eb' : (isOccupied ? '#facc15' : '#e5e7eb'),
                              borderWidth: isOccupied ? 3 : 2,
                              borderRadius: isCircle ? 999 : (isWall ? 4 : 12),
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: isWall ? 0.8 : 1,
                              shadowColor: isOccupied ? '#eab308' : '#000',
                              shadowOpacity: isWall ? 0 : (isOccupied ? 0.4 : 0.05),
                              shadowRadius: isOccupied || false ? 12 : 6,
                              shadowOffset: { width: 0, height: 2 },
                              elevation: isWall ? 0 : (isOccupied ? 8 : 3),
                              transform: [{ rotate: `${table.rotation || 0}deg` }]
                            }}
                          >
                            {!isWall && (
                              <>
                                <Text style={{ fontWeight: '900', color: isOccupied ? '#854d0e' : '#374151', fontSize: titleSize, textAlign: 'center', paddingHorizontal: 4 }} numberOfLines={1}>{table.name}</Text>
                                {showBadge && (
                                  <View style={{ backgroundColor: isOccupied ? '#fde047' : '#f3f4f6', paddingHorizontal: Math.max(4, minDim * 0.05), paddingVertical: 2, borderRadius: 99, marginTop: 4 }}>
                                    <Text style={{ fontSize: badgeSize, fontWeight: '900', color: isOccupied ? '#a16207' : '#6b7280' }}>{isOccupied ? t('pos.table.occupied', language) : t('pos.table.available', language)}</Text>
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
          ) : (
            <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 28, width: '85%', maxWidth: 500, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10 }}>
              {orderCreationStep === 'type' && (
                <>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827', marginBottom: 24, textAlign: 'center' }}>{t('pos.modal.order_type', language)}</Text>
                  <TouchableOpacity
                    style={{ backgroundColor: tp[600], padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 12 }}
                    onPress={() => { setSelectedOrderType('take_out'); setOrderCreationStep('name'); }}
                  >
                    <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>{t('pos.modal.take_out', language)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ backgroundColor: tp[50], padding: 20, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: tp[300], marginBottom: 16 }}
                    onPress={() => { setSelectedOrderType('dine_in'); setOrderCreationStep('name'); }}
                  >
                    <Text style={{ color: tp[800], fontSize: 18, fontWeight: 'bold' }}>{t('pos.modal.dine_in', language)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowOrderTypeModal(false)} style={{ alignItems: 'center', marginTop: 8 }}>
                    <Text style={{ color: '#9ca3af', fontWeight: 'bold', fontSize: 16 }}>{t('pos.modal.cancel', language)}</Text>
                  </TouchableOpacity>
                </>
              )}

              {orderCreationStep === 'name' && (
                <>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827', marginBottom: 8, textAlign: 'center' }}>{t('pos.modal.customer_name', language)}</Text>
                  <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 20, textAlign: 'center' }}>{t('pos.modal.enter_name_desc', language)}</Text>
                  <TextInput
                    style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, padding: 16, fontSize: 18, marginBottom: 24, textAlign: 'center' }}
                    placeholder={t('pos.modal.customer_name', language)}
                    value={newOrderCustomerName}
                    onChangeText={setNewOrderCustomerName}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: (newOrderCustomerName.trim().length > 0) ? tp[600] : '#d1d5db', padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 12 }}
                    disabled={newOrderCustomerName.trim().length === 0}
                    onPress={() => {
                      if (selectedOrderType === 'take_out') {
                        handleStartModalOrder('take_out');
                      } else {
                        setOrderCreationStep('table');
                      }
                    }}
                  >
                    <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>{t('pos.modal.continue', language)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setOrderCreationStep('type')} style={{ alignItems: 'center', marginTop: 8 }}>
                    <Text style={{ color: '#9ca3af', fontWeight: 'bold', fontSize: 16 }}>{t('pos.modal.back', language)}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 32, width: '90%', maxWidth: 500, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827' }}>{t('pos.settings.title', language)}</Text>
              <TouchableOpacity onPress={() => setShowSettingsModal(false)} style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
                <Text style={{ fontWeight: 'bold', color: '#374151' }}>{t('pos.settings.close', language)}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#374151', marginBottom: 12 }}>{t('pos.settings.language', language)}</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => setLanguage('en')} style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: language === 'en' ? '#e0e7ff' : '#f9fafb', borderWidth: 1, borderColor: language === 'en' ? '#4f46e5' : '#e5e7eb', alignItems: 'center' }}>
                  <Text style={{ fontWeight: 'bold', color: language === 'en' ? '#4f46e5' : '#374151' }}>🇺🇸 English</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setLanguage('es')} style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: language === 'es' ? '#e0e7ff' : '#f9fafb', borderWidth: 1, borderColor: language === 'es' ? '#4f46e5' : '#e5e7eb', alignItems: 'center' }}>
                  <Text style={{ fontWeight: 'bold', color: language === 'es' ? '#4f46e5' : '#374151' }}>🇪🇸 Español</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#374151', marginBottom: 12 }}>{t('pos.settings.receipt_printer', language)}</Text>
              <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>{t('pos.settings.printer_desc', language)}</Text>

              <View style={{ backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
                <TouchableOpacity
                  onPress={() => setLocalReceiptPrinterId(null)}
                  style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: !localReceiptPrinterId ? '#e0e7ff' : 'transparent' }}
                >
                  <Text style={{ fontWeight: 'bold', color: !localReceiptPrinterId ? '#4f46e5' : '#374151' }}>{t('pos.settings.no_printing', language)}</Text>
                </TouchableOpacity>
                {printers.map((p: Printer) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setLocalReceiptPrinterId(p.id)}
                    style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: localReceiptPrinterId === p.id ? '#e0e7ff' : 'transparent' }}
                  >
                    <Text style={{ fontWeight: 'bold', color: localReceiptPrinterId === p.id ? '#4f46e5' : '#374151' }}>{p.name} ({p.ip_address})</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView >
  );
}
