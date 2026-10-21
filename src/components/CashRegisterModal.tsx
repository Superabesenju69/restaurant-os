import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { usePosStore } from '../store/posStore';
import { t } from '../utils/i18n';
import { formatCurrency } from '../utils/currency';

const themePalette: Record<string, Record<string, string>> = {
  teal: { 50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e' },
  rose: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337', 950: '#4c0519' },
  amber: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03' },
  indigo: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81', 950: '#1e1b4b' }
};

export default function CashRegisterModal() {
  const showCashRegisterModal = usePosStore(s => s.showCashRegisterModal);
  const setShowCashRegisterModal = usePosStore(s => s.setShowCashRegisterModal);
  const activeCashShift = usePosStore(s => s.activeCashShift);
  const openCashShift = usePosStore(s => s.openCashShift);
  const closeCashShift = usePosStore(s => s.closeCashShift);
  const addCashAdjustment = usePosStore(s => s.addCashAdjustment);
  const fetchCashShiftSummary = usePosStore(s => s.fetchCashShiftSummary);
  const currentPosUser = usePosStore(s => s.currentPosUser);
  const language = usePosStore(s => s.language);
  const currency = usePosStore(s => s.currency);
  const themeColor = usePosStore(s => s.themeColor);

  const tp = themePalette[themeColor] || themePalette.teal;

  const [startingCashInput, setStartingCashInput] = useState('');
  const [actualCashInput, setActualCashInput] = useState('');
  const [adjustmentAmountInput, setAdjustmentAmountInput] = useState('');
  const [adjustmentReasonInput, setAdjustmentReasonInput] = useState('');
  const [shiftSummary, setShiftSummary] = useState<{ cashSales: number; adjustmentsIn: number; adjustmentsOut: number } | null>(null);
  const [shiftNotesInput, setShiftNotesInput] = useState('');
  const [isLoadingShiftSummary, setIsLoadingShiftSummary] = useState(false);

  const refreshSummary = (shiftId: string) => {
    setIsLoadingShiftSummary(true);
    fetchCashShiftSummary(shiftId)
      .then(summary => {
        setShiftSummary(summary);
        setIsLoadingShiftSummary(false);
      })
      .catch(err => {
        console.error(err);
        setIsLoadingShiftSummary(false);
      });
  };

  useEffect(() => {
    if (showCashRegisterModal && activeCashShift) {
      refreshSummary(activeCashShift.id);
    } else if (!showCashRegisterModal) {
      setShiftSummary(null);
      setStartingCashInput('');
      setActualCashInput('');
      setAdjustmentAmountInput('');
      setAdjustmentReasonInput('');
      setShiftNotesInput('');
    }
  }, [showCashRegisterModal, activeCashShift]);

  if (!showCashRegisterModal || !currentPosUser) return null;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 200, elevation: 200 }}>
      <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 28, width: '92%', maxWidth: 650, maxHeight: '90%', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 15, elevation: 10 }}>
        {/* Modal Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 16 }}>
          <Text style={{ fontSize: 22, fontWeight: '900', color: '#111827' }}>
            {language === 'es' ? '💵 Control de Caja' : '💵 Cash Register Drawer'}
          </Text>
          <TouchableOpacity onPress={() => setShowCashRegisterModal(false)} style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
            <Text style={{ fontWeight: 'bold', color: '#374151' }}>{t('pos.settings.close', language)}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
          {!activeCashShift ? (
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
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                      <View style={{ flex: 1, minWidth: 120 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 4 }}>{language === 'es' ? 'Monto' : 'Amount'}</Text>
                        <TextInput
                          style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 16 }}
                          placeholder="0.00"
                          keyboardType="numeric"
                          value={adjustmentAmountInput}
                          onChangeText={setAdjustmentAmountInput}
                        />
                      </View>
                      <View style={{ flex: 2, minWidth: 180 }}>
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
                            refreshSummary(activeCashShift.id);
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
                            refreshSummary(activeCashShift.id);
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

                        const expectedCash =
                          Number(activeCashShift.starting_cash) +
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
  );
}
