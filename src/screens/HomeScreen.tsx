import React, { useState } from "react";
import { StatusBar } from 'expo-status-bar';
import { View, Text, SafeAreaView, TouchableOpacity, ScrollView, Image, TextInput, ActivityIndicator, Alert } from 'react-native';
import { usePosStore } from "../store/posStore";
import { t } from '../utils/i18n';
import type { FloorTable, Printer } from '../types';
import TimeClockModal from "../components/TimeClockModal";
import { formatCurrency } from '../utils/currency';
import Toast from 'react-native-toast-message';

interface HomeScreenProps {
  bgStr: string;
  tp: Record<string, string>;
  language: string;
  mapWidth: number;
  mapHeight: number;
}

export default function HomeScreen({ bgStr, tp, language, mapWidth, mapHeight }: HomeScreenProps) {
  const {
    setScreen, tableServiceEnabled, mapBackgroundUrl, tables, startOrder,
    currentPosUser, posLogout, printers, localReceiptPrinterId, setLocalReceiptPrinterId,
    setLanguage, activeCashShift, setShowCashRegisterModal,
    showCashRegisterModal, openCashShift, closeCashShift, addCashAdjustment, currency,
    usdExchangeRate, setUsdExchangeRate
  } = usePosStore();

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showTimeClockModal, setShowTimeClockModal] = useState(false);
  const [showOrderTypeModal, setShowOrderTypeModal] = useState(false);
  const [selectedOrderType, setSelectedOrderType] = useState<'dine_in' | 'take_out' | null>(null);
  const [orderCreationStep, setOrderCreationStep] = useState<'type' | 'name' | 'table'>('type');
  const [newOrderCustomerName, setNewOrderCustomerName] = useState('');
  const [exchangeRateInput, setExchangeRateInput] = useState('');

  // Cash Drawer Register Local State
  const [startingCashInput, setStartingCashInput] = useState('');
  const [actualCashInput, setActualCashInput] = useState('');
  const [adjustmentAmountInput, setAdjustmentAmountInput] = useState('');
  const [adjustmentReasonInput, setAdjustmentReasonInput] = useState('');
  const [shiftSummary, setShiftSummary] = useState<{ cashSales: number; adjustmentsIn: number; adjustmentsOut: number } | null>(null);
  const [shiftNotesInput, setShiftNotesInput] = useState('');
  const [isLoadingShiftSummary, setIsLoadingShiftSummary] = useState(false);

  React.useEffect(() => {
    if (showSettingsModal) {
      setExchangeRateInput(usdExchangeRate.toString());
    }
  }, [showSettingsModal, usdExchangeRate]);

  React.useEffect(() => {
    if (showCashRegisterModal && activeCashShift) {
      setIsLoadingShiftSummary(true);
      usePosStore.getState().fetchCashShiftSummary(activeCashShift.id)
        .then(summary => {
          setShiftSummary(summary);
          setIsLoadingShiftSummary(false);
        })
        .catch(err => {
          console.error(err);
          setIsLoadingShiftSummary(false);
        });
    }
  }, [showCashRegisterModal, activeCashShift]);

  const handleStartModalOrder = (type: 'dine_in' | 'take_out', table?: FloorTable) => {
    setShowOrderTypeModal(false);
    setSelectedOrderType(null);
    setOrderCreationStep('type');
    startOrder(type, table, newOrderCustomerName);
    setNewOrderCustomerName('');
  };

  if (!currentPosUser) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bgStr, alignItems: 'center', justifyContent: 'center' }}>
      <StatusBar style="dark" />
      {/* User + logout */}
      <View style={{ position: 'absolute', top: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
        <TouchableOpacity onPress={() => setShowTimeClockModal(true)} style={{ backgroundColor: '#ccfbf1', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#0d9488' }}>⏰ {language === 'es' ? 'Marcación' : 'Time Clock'}</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>{currentPosUser.full_name}</Text>
          <Text style={{ fontSize: 11, color: '#9ca3af', textTransform: 'capitalize' }}>{currentPosUser.role.replace('_', ' ')}</Text>
        </View>
        <TouchableOpacity onPress={posLogout} style={{ backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626' }}>{t('pos.home.signout', language)}</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 36, fontWeight: '900', color: '#111827', marginBottom: 40 }}>Restaurant OS</Text>
      <View style={{ width: '80%', gap: 16 }}>
        <TouchableOpacity
          style={{ backgroundColor: tp[600], padding: 24, borderRadius: 20, alignItems: 'center' }}
          onPress={() => {
            if (tableServiceEnabled) {
              setShowOrderTypeModal(true);
            } else {
              startOrder('take_out');
            }
          }}
        >
          <Text style={{ color: 'white', fontSize: 22, fontWeight: 'bold' }}>{t('pos.home.new_order', language)}</Text>
        </TouchableOpacity>

        {tableServiceEnabled && (
          <TouchableOpacity
            style={{ backgroundColor: tp[600], padding: 24, borderRadius: 20, alignItems: 'center' }}
            onPress={() => setScreen('tables')}
          >
            <Text style={{ color: 'white', fontSize: 22, fontWeight: 'bold' }}>{t('pos.home.view_floor', language)}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={{ backgroundColor: 'white', padding: 24, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' }}
          onPress={() => setScreen('orders')}
        >
          <Text style={{ color: '#111827', fontSize: 22, fontWeight: 'bold' }}>{t('pos.home.order_history', language)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ backgroundColor: '#10b981', padding: 24, borderRadius: 20, alignItems: 'center' }}
          onPress={() => setScreen('serving')}
        >
          <Text style={{ color: 'white', fontSize: 22, fontWeight: 'bold' }}>{t('pos.home.ready_orders', language)}</Text>
        </TouchableOpacity>
      </View>

      {/* Order Type Overlay */}
      {showOrderTypeModal && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          {orderCreationStep === 'table' && selectedOrderType === 'dine_in' ? (
            <View style={{ backgroundColor: '#fdfbeb', borderRadius: 24, padding: 20, width: '95%', height: '90%', maxWidth: 1000, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827' }}>{t('pos.modal.select_table_for', language)} {newOrderCustomerName}</Text>
                <TouchableOpacity onPress={() => setOrderCreationStep('name')} style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
                  <Text style={{ fontWeight: 'bold', color: '#374151' }}>{t('pos.modal.back', language).replace('←', '').trim()}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, overflow: 'hidden' }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ flex: 1 }}>
                  <ScrollView showsVerticalScrollIndicator={true} style={{ flex: 1 }}>
                    <View style={{ width: mapWidth, height: mapHeight, position: 'relative' }}>
                      {mapBackgroundUrl && (
                        <Image source={{ uri: mapBackgroundUrl }} style={{ width: '100%', height: '100%', position: 'absolute', opacity: 0.5 }} resizeMode="cover" />
                      )}
                      {tables.map(table => {
                        const isWall = table.shape === 'wall';
                        const isCircle = table.shape === 'circle';
                        const isOccupied = table.status === 'occupied';
                        const minDim = Math.min(table.width, table.height);
                        const titleSize = Math.max(10, minDim * 0.18);
                        const badgeSize = Math.max(7, minDim * 0.09);
                        const showBadge = minDim >= 60;

                        return (
                          <TouchableOpacity
                            key={table.id}
                            disabled={isWall}
                            onPress={() => handleStartModalOrder('dine_in', table)}
                            style={{
                              position: 'absolute',
                              left: table.x,
                              top: table.y,
                              width: table.width,
                              height: table.height,
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
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#374151', marginBottom: 12 }}>
                {language === 'es' ? '💵 Tasa de Cambio (USD a NIO)' : '💵 Exchange Rate (USD to NIO)'}
              </Text>
              <TextInput
                style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, fontSize: 18, fontWeight: '700', color: '#111827' }}
                placeholder="36.00"
                keyboardType="numeric"
                value={exchangeRateInput}
                onChangeText={(val) => {
                  setExchangeRateInput(val);
                  const parsed = parseFloat(val);
                  if (!isNaN(parsed) && parsed > 0) {
                    setUsdExchangeRate(parsed);
                  }
                }}
              />
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

      {/* Time Clock Modal */}
      {showTimeClockModal && (
        <TimeClockModal
          visible={showTimeClockModal}
          onClose={() => setShowTimeClockModal(false)}
          userId={currentPosUser.id}
          employeeName={currentPosUser.full_name}
          language={language}
          tp={tp}
        />
      )}

      {/* Cash Register Shift Modal */}
      {showCashRegisterModal && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 32, width: '90%', maxWidth: 650, maxHeight: '90%', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 15, elevation: 10 }}>
            
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 16 }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827' }}>
                {language === 'es' ? '💵 Control de Caja' : '💵 Cash Register Drawer'}
              </Text>
              <TouchableOpacity onPress={() => setShowCashRegisterModal(false)} style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
                <Text style={{ fontWeight: 'bold', color: '#374151' }}>{t('pos.settings.close', language)}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
              {!activeCashShift ? (
                /* Register is CLOSED: Form to Open */
                <View>
                  <Text style={{ fontSize: 16, color: '#4b5563', marginBottom: 24, lineHeight: 22 }}>
                    {language === 'es' 
                      ? 'La caja registradora está actualmente cerrada. Ingrese el monto en efectivo con el que iniciará el turno para poder abrirla.'
                      : 'The cash register is currently closed. Please input the starting cash amount to open the register shift.'}
                  </Text>
                  
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 8 }}>
                    {language === 'es' ? 'Monto Inicial en Efectivo' : 'Starting Cash Amount'}
                  </Text>
                  <TextInput
                    style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, padding: 16, fontSize: 20, fontWeight: '700', marginBottom: 24, color: '#111827' }}
                    placeholder="0.00"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={startingCashInput}
                    onChangeText={setStartingCashInput}
                  />

                  <TouchableOpacity
                    onPress={async () => {
                      const amount = parseFloat(startingCashInput);
                      if (isNaN(amount) || amount < 0) {
                        Alert.alert(language === 'es' ? 'Error' : 'Invalid Amount', language === 'es' ? 'Ingrese un monto válido.' : 'Please enter a valid starting cash amount.');
                        return;
                      }
                      const ok = await openCashShift(amount);
                      if (ok) {
                        Toast.show({
                          type: 'success',
                          text1: language === 'es' ? 'Caja Abierta' : 'Register Opened',
                          text2: language === 'es' ? 'La caja se abrió correctamente.' : 'Cash register shift opened successfully.'
                        });
                      } else {
                        Alert.alert('Error', language === 'es' ? 'No se pudo abrir la caja.' : 'Could not open cash shift.');
                      }
                    }}
                    style={{ backgroundColor: tp[600], padding: 18, borderRadius: 16, alignItems: 'center' }}
                  >
                    <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>
                      {language === 'es' ? 'Abrir Caja Registradora' : 'Open Cash Drawer'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Register is OPEN: Shift dashboard and controls */
                <View>
                  {isLoadingShiftSummary ? (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                      <ActivityIndicator size="large" color={tp[600]} />
                    </View>
                  ) : (
                    <View>
                      {/* Current Shift Info Card */}
                      <View style={{ backgroundColor: '#f0f9ff', borderLeftWidth: 4, borderLeftColor: '#0284c7', borderRadius: 12, padding: 16, marginBottom: 24 }}>
                        <Text style={{ fontSize: 14, color: '#0369a1', fontWeight: '800', textTransform: 'uppercase', marginBottom: 12 }}>
                          {language === 'es' ? 'Turno Activo' : 'Active Shift Info'}
                        </Text>
                        <View style={{ gap: 8 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: '#475569' }}>{language === 'es' ? 'Usuario:' : 'Cashier:'}</Text>
                            <Text style={{ fontWeight: '700', color: '#0f172a' }}>{currentPosUser.full_name}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: '#475569' }}>{language === 'es' ? 'Hora Apertura:' : 'Opened At:'}</Text>
                            <Text style={{ fontWeight: '700', color: '#0f172a' }}>
                              {new Date(activeCashShift.opening_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e0f2fe', paddingTop: 8, marginTop: 4 }}>
                            <Text style={{ color: '#475569' }}>{language === 'es' ? 'Monto Inicial:' : 'Starting Cash:'}</Text>
                            <Text style={{ fontWeight: '700', color: '#0f172a' }}>{formatCurrency(activeCashShift.starting_cash, currency)}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: '#475569' }}>{language === 'es' ? 'Ventas en Efectivo:' : 'Cash Sales:'}</Text>
                            <Text style={{ fontWeight: '700', color: '#16a34a' }}>+ {formatCurrency(shiftSummary?.cashSales || 0, currency)}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: '#475569' }}>{language === 'es' ? 'Ingresos de Efectivo:' : 'Cash In Adjustments:'}</Text>
                            <Text style={{ fontWeight: '700', color: '#2563eb' }}>+ {formatCurrency(shiftSummary?.adjustmentsIn || 0, currency)}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: '#475569' }}>{language === 'es' ? 'Retiros de Efectivo:' : 'Cash Out Adjustments:'}</Text>
                            <Text style={{ fontWeight: '700', color: '#dc2626' }}>- {formatCurrency(shiftSummary?.adjustmentsOut || 0, currency)}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#cbd5e1', paddingTop: 8, marginTop: 4 }}>
                            <Text style={{ fontWeight: '800', color: '#0f172a' }}>{language === 'es' ? 'Efectivo Esperado:' : 'Expected Cash:'}</Text>
                            <Text style={{ fontWeight: '900', color: '#0f172a', fontSize: 18 }}>
                              {formatCurrency(
                                Number(activeCashShift.starting_cash) + 
                                Number(shiftSummary?.cashSales || 0) + 
                                Number(shiftSummary?.adjustmentsIn || 0) - 
                                Number(shiftSummary?.adjustmentsOut || 0), 
                                currency
                              )}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Cash Adjustments Form */}
                      <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 16, marginBottom: 24 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#1f2937', marginBottom: 12 }}>
                          {language === 'es' ? 'Movimientos de Caja (Ingreso / Egreso)' : 'Drawer Cash Adjustments'}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 4 }}>{language === 'es' ? 'Monto' : 'Amount'}</Text>
                            <TextInput
                              style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 16 }}
                              placeholder="0.00"
                              keyboardType="numeric"
                              value={adjustmentAmountInput}
                              onChangeText={setAdjustmentAmountInput}
                            />
                          </View>
                          <View style={{ flex: 2 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 4 }}>{language === 'es' ? 'Concepto / Motivo' : 'Reason'}</Text>
                            <TextInput
                              style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 16 }}
                              placeholder={language === 'es' ? 'Ej. Cambio, Pago a Proveedor...' : 'e.g. Extra Change, Supplier Pay...'}
                              value={adjustmentReasonInput}
                              onChangeText={setAdjustmentReasonInput}
                            />
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                          <TouchableOpacity
                            onPress={async () => {
                              const amt = parseFloat(adjustmentAmountInput);
                              if (isNaN(amt) || amt <= 0) {
                                Alert.alert('Error', language === 'es' ? 'Ingrese un monto válido.' : 'Please enter a valid amount.');
                                return;
                              }
                              const ok = await addCashAdjustment('cash_in', amt, adjustmentReasonInput);
                              if (ok) {
                                Toast.show({ type: 'success', text1: language === 'es' ? 'Ingreso Registrado' : 'Cash In Recorded' });
                                setAdjustmentAmountInput('');
                                setAdjustmentReasonInput('');
                              }
                            }}
                            style={{ flex: 1, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', padding: 12, borderRadius: 10, alignItems: 'center' }}
                          >
                            <Text style={{ color: '#1e40af', fontWeight: 'bold' }}>📥 {language === 'es' ? 'Ingresar Efectivo' : 'Cash In'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={async () => {
                              const amt = parseFloat(adjustmentAmountInput);
                              if (isNaN(amt) || amt <= 0) {
                                Alert.alert('Error', language === 'es' ? 'Ingrese un monto válido.' : 'Please enter a valid amount.');
                                return;
                              }
                              const ok = await addCashAdjustment('cash_out', amt, adjustmentReasonInput);
                              if (ok) {
                                Toast.show({ type: 'success', text1: language === 'es' ? 'Retiro Registrado' : 'Cash Out Recorded' });
                                setAdjustmentAmountInput('');
                                setAdjustmentReasonInput('');
                              }
                            }}
                            style={{ flex: 1, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5', padding: 12, borderRadius: 10, alignItems: 'center' }}
                          >
                            <Text style={{ color: '#991b1b', fontWeight: 'bold' }}>📤 {language === 'es' ? 'Retirar Efectivo' : 'Cash Out'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Close Shift Form */}
                      <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 16 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#1f2937', marginBottom: 12 }}>
                          {language === 'es' ? 'Cierre de Caja' : 'Close Register Shift'}
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 4 }}>
                          {language === 'es' ? 'Efectivo Real en Caja (Arqueo)' : 'Actual Cash in Drawer'}
                        </Text>
                        <TextInput
                          style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, padding: 16, fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#111827' }}
                          placeholder="0.00"
                          keyboardType="numeric"
                          value={actualCashInput}
                          onChangeText={setActualCashInput}
                        />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 4 }}>
                          {language === 'es' ? 'Observaciones / Notas de Cierre' : 'Closing Notes'}
                        </Text>
                        <TextInput
                          style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, padding: 12, fontSize: 16, marginBottom: 24 }}
                          placeholder={language === 'es' ? 'Notas adicionales...' : 'Additional notes...'}
                          value={shiftNotesInput}
                          onChangeText={setShiftNotesInput}
                        />

                        <TouchableOpacity
                          onPress={async () => {
                            const actualCash = parseFloat(actualCashInput);
                            if (isNaN(actualCash) || actualCash < 0) {
                              Alert.alert('Error', language === 'es' ? 'Ingrese un monto de arqueo válido.' : 'Please enter a valid actual cash amount.');
                              return;
                            }
                            
                            const expectedCash = Number(activeCashShift.starting_cash) + 
                              Number(shiftSummary?.cashSales || 0) + 
                              Number(shiftSummary?.adjustmentsIn || 0) - 
                              Number(shiftSummary?.adjustmentsOut || 0);
                            const diff = actualCash - expectedCash;
                            
                            let diffMsg = '';
                            if (diff === 0) {
                              diffMsg = language === 'es' ? 'Cuadre perfecto (sin diferencias).' : 'Perfect balance (no difference).';
                            } else if (diff > 0) {
                              diffMsg = language === 'es' ? `Sobrante de ${formatCurrency(diff, currency)}.` : `Cash surplus of ${formatCurrency(diff, currency)}.`;
                            } else {
                              diffMsg = language === 'es' ? `Faltante de ${formatCurrency(Math.abs(diff), currency)}.` : `Cash shortage of ${formatCurrency(Math.abs(diff), currency)}.`;
                            }

                            Alert.alert(
                              language === 'es' ? 'Confirmar Cierre' : 'Confirm Close Register',
                              (language === 'es' 
                                ? `¿Desea cerrar la caja con un efectivo real de ${formatCurrency(actualCash, currency)}?\n\n` 
                                : `Do you want to close the cash drawer with actual cash of ${formatCurrency(actualCash, currency)}?\n\n`) + diffMsg,
                              [
                                {
                                  text: language === 'es' ? 'Sí, Cerrar Caja' : 'Yes, Close Register',
                                  onPress: async () => {
                                    const ok = await closeCashShift(actualCash, shiftNotesInput);
                                    if (ok) {
                                      Toast.show({
                                        type: 'success',
                                        text1: language === 'es' ? 'Caja Cerrada' : 'Shift Closed',
                                        text2: language === 'es' ? 'El turno de caja se cerró exitosamente.' : 'Cash shift closed successfully.'
                                      });
                                    } else {
                                      Alert.alert('Error', language === 'es' ? 'No se pudo cerrar la caja.' : 'Could not close cash shift.');
                                    }
                                  }
                                },
                                { text: t('pos.modal.cancel', language), style: 'cancel' }
                              ]
                            );
                          }}
                          style={{ backgroundColor: '#dc2626', padding: 18, borderRadius: 16, alignItems: 'center' }}
                        >
                          <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>
                            🔒 {language === 'es' ? 'Cerrar Caja Registradora' : 'Close Cash Drawer'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </SafeAreaView >
  );
}
