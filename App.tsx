import "./global.css";
import React, { useEffect, useState } from "react";
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, SafeAreaView, ActivityIndicator, Image, FlatList, Alert, useWindowDimensions } from "react-native";
import type { GestureResponderEvent } from "react-native";
import type { MenuItem, ItemOption, ItemOptionChoice, Recipe, CartItem, CartItemIngredient, Payment, Category, FloorTable } from "./src/types";
import { usePosStore } from "./src/store/posStore";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErrorBoundary } from 'react-error-boundary';
import PinLoginScreen from "./src/screens/PinLoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import TablesScreen from "./src/screens/TablesScreen";
import ServingScreen from "./src/screens/ServingScreen";
import OrdersScreen from "./src/screens/OrdersScreen";
import MenuCard from "./src/components/MenuCard";
import CartItemRow from "./src/components/CartItemRow";
import IngredientEditor from "./src/components/IngredientEditor";
import Toast from 'react-native-toast-message';
import { t } from './src/utils/i18n';
import { formatCurrency, CURRENCIES } from './src/utils/currency';
import { checkForUpdates } from "./src/utils/updateChecker";

function MainApp() {
  const {
    screen, setScreen,
    categories, itemCategoryLinks, items, allIngredients, recipes, cart, activeCategory, isLoading,
    inspectingCartItemId, inspectingSubItemId,
    tables, activeOrderId, activeOrderType, activeOrderTable, activeOrderCustomer, activeOrderNumber,
    fetchMenu, setupSubscriptions, setActiveCategory, setInspectingCartItemId, setInspectingSubItemId, isItemAvailable,
    addToCart, removeFromCart, clearCart, toggleIngredient, addExtraIngredient, removeExtraIngredient, checkout, sendToKitchen, incrementCartItemQuantity, decrementCartItemQuantity, updateCartItemOptions,
    startOrder, loadOrder,
    currentPosUser, posLogin, themeColor,
    localReceiptPrinterId,
    availablePromotions, appliedGlobalPromotionIds, applyManualPromotion, removeManualPromotion, recalculateCartMath,
    language, currency,
    activeCashShift, showCashRegisterModal, setShowCashRegisterModal,
    openCashShift, closeCashShift, addCashAdjustment, usdExchangeRate
  } = usePosStore();

  const themeBgs: Record<string, string> = {
    teal: '#f0fdfa',
    rose: '#fff1f2',
    amber: '#fffbeb',
    indigo: '#eef2ff',
  };
  const themePalette: Record<string, Record<string, string>> = {
    teal: { 50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e' },
    rose: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337', 950: '#4c0519' },
    amber: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03' },
    indigo: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81', 950: '#1e1b4b' }
  };
  const bgStr = themeBgs[themeColor] || themeBgs.teal;
  const tp = themePalette[themeColor] || themePalette.teal;

  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [isFooterExpanded, setIsFooterExpanded] = useState(false);

  const [qtyPickerItem, setQtyPickerItem] = useState<any | null>(null);
  const [qtyPickerCount, setQtyPickerCount] = useState(1);
  const [qtyPickerOptions, setQtyPickerOptions] = useState<Record<string, string>>({});

  // Customization Modal State
  const [customizationItem, setCustomizationItem] = useState<any | null>(null);
  const [customizationOptions, setCustomizationOptions] = useState<Record<string, string>>({});
  const [customizationExtras, setCustomizationExtras] = useState<any[]>([]); // Array of ingredients

  // Promos & Checkout State
  const [showPromosModal, setShowPromosModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [currentPayments, setCurrentPayments] = useState<{ amount: number, method: string, reference_id?: string }[]>([]);
  const [cashTenderAmount, setCashTenderAmount] = useState('');
  const [processingCard, setProcessingCard] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [payInUsd, setPayInUsd] = useState(false);
  const [usdAmountInput, setUsdAmountInput] = useState('');

  // Receipt State
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [lastCompletedOrder, setLastCompletedOrder] = useState<any>(null);

  // Cash Drawer Register Local State
  const [startingCashInput, setStartingCashInput] = useState('');
  const [actualCashInput, setActualCashInput] = useState('');
  const [adjustmentAmountInput, setAdjustmentAmountInput] = useState('');
  const [adjustmentReasonInput, setAdjustmentReasonInput] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'cash_in' | 'cash_out' | null>(null);
  const [shiftSummary, setShiftSummary] = useState<{ cashSales: number; adjustmentsIn: number; adjustmentsOut: number } | null>(null);
  const [shiftNotesInput, setShiftNotesInput] = useState('');
  const [isLoadingShiftSummary, setIsLoadingShiftSummary] = useState(false);

  useEffect(() => {
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


  const { tenantId, setTenant, clearTenant } = usePosStore();
  const [tenantChecking, setTenantChecking] = useState(true);

  useEffect(() => {
    async function initTenant() {
      try {
        const id = await AsyncStorage.getItem('pos_tenant_id');
        const name = await AsyncStorage.getItem('pos_tenant_name');
        const subdomain = await AsyncStorage.getItem('pos_tenant_subdomain');
        if (id && name && subdomain) {
          await setTenant(id, name, subdomain);
        } else {
          await clearTenant();
        }
      } catch (err) {
        console.error("Failed to load tenant:", err);
      } finally {
        setTenantChecking(false);
      }
    }
    initTenant();
  }, []);

  useEffect(() => {
    if (tenantChecking) return;
    if (tenantId) {
      fetchMenu();
      setupSubscriptions();
      usePosStore.getState().fetchSettings();
    }
  }, [tenantId, tenantChecking]);



  useEffect(() => {
    if (screen === 'orders' || screen === 'tables' || screen === 'serving') {
      usePosStore.getState().fetchOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // Derived state
  const displayedItems = React.useMemo(() => {
    return activeCategory
      ? items.filter(i => {
        const linksForThisCategory = itemCategoryLinks.filter(link => link.category_id === activeCategory);
        return linksForThisCategory.some(link => link.item_id === i.id);
      })
      : items;
  }, [activeCategory, items, itemCategoryLinks]);

  const mapWidth = tables.length > 0 ? Math.max(1200, ...tables.map((t: FloorTable) => (t.x || 0) + (t.width || 0) + 100)) : 1200;
  const mapHeight = tables.length > 0 ? Math.max(800, ...tables.map((t: FloorTable) => (t.y || 0) + (t.height || 0) + 100)) : 800;

  const inspectingItem = cart.find(c => c.cart_id === inspectingCartItemId);

  const getCartItemPrice = (item: CartItem) => {
    let itemTotal = item.item.base_price;

    // Main item / Combo-level option modifiers
    if (item.selectedOptions && item.item.options) {
      item.item.options.forEach((opt: ItemOption) => {
        const selectedChoiceName = item.selectedOptions?.[opt.name];
        if (selectedChoiceName) {
          const choiceDef = (opt.choices || []).find((c: ItemOptionChoice) => (typeof c === 'object' ? c.name : c) === selectedChoiceName);
          if (choiceDef && typeof choiceDef === 'object' && choiceDef.price_modifier) {
            itemTotal += choiceDef.price_modifier;
          }
        }
      });
    }

    // Main item extras
    (item.ingredients || []).forEach((ing: CartItemIngredient) => {
      if (ing.extra && !ing.removed) itemTotal += ing.base_price;
    });

    // Sub-items extras and option modifiers
    (item.sub_items || []).forEach((sub: CartItem) => {
      let subUnitPrice = 0;

      if (sub.selectedOptions && sub.item.options) {
        sub.item.options.forEach((opt: ItemOption) => {
          const selectedChoiceName = sub.selectedOptions?.[opt.name];
          if (selectedChoiceName) {
            const choiceDef = (opt.choices || []).find((c: ItemOptionChoice) => (typeof c === 'object' ? c.name : c) === selectedChoiceName);
            if (choiceDef && typeof choiceDef === 'object' && choiceDef.price_modifier) {
              subUnitPrice += choiceDef.price_modifier;
            }
          }
        });
      }

      (sub.ingredients || []).forEach((ing: CartItemIngredient) => {
        if (ing.extra && !ing.removed) subUnitPrice += ing.base_price;
      });

      itemTotal += (subUnitPrice * sub.quantity);
    });

    return itemTotal;
  };

  const cartTotals = React.useMemo(() => {
    let subtotalBruto = 0;
    let totalDescuentos = 0;
    
    cart.forEach(item => {
      subtotalBruto += item.grossAmount !== undefined ? item.grossAmount : (getCartItemPrice(item) * item.quantity);
      totalDescuentos += item.discountAmount || 0;
    });

    const baseImponibleIva = Math.max(0, subtotalBruto - totalDescuentos);
    const montoIva = baseImponibleIva * 0.15; // 15% IVA Nicaragua
    const totalNeto = baseImponibleIva + montoIva;

    return {
      subtotalBruto,
      totalDescuentos,
      baseImponibleIva,
      montoIva,
      totalNeto
    };
  }, [cart]);

  const cartTotal = cartTotals.totalNeto;

  const renderIngredientEditor = (targetCartId: string, subCartId: string | null, targetIngredients: CartItemIngredient[], itemTags: string[]) => (
    <IngredientEditor
      targetCartId={targetCartId}
      subCartId={subCartId}
      targetIngredients={targetIngredients}
      itemTags={itemTags}
      allIngredients={allIngredients}
      tp={tp}
      language={language}
      currency={currency}
      toggleIngredient={toggleIngredient}
      addExtraIngredient={addExtraIngredient}
      removeExtraIngredient={removeExtraIngredient}
    />
  );

  // Show loading indicator while loading tenant configuration
  if (tenantChecking) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#0d9488" />
        <Text style={{ marginTop: 12, color: '#94a3b8', fontSize: 16 }}>Loading Restaurant OS...</Text>
      </SafeAreaView>
    );
  }

  // Show PIN login screen if no user is logged in
  if (!currentPosUser) {
    return <PinLoginScreen onLogin={posLogin} />;
  }

  if (screen === 'home') {
    return <HomeScreen bgStr={bgStr} tp={tp} language={language} mapWidth={mapWidth} mapHeight={mapHeight} />;
  }

  if (screen === 'tables') {
    return <TablesScreen bgStr={bgStr} tp={tp} language={language} mapWidth={mapWidth} mapHeight={mapHeight} />;
  }

  if (screen === 'serving') {
    return <ServingScreen bgStr={bgStr} language={language} />;
  }

  if (screen === 'orders') {
    return <OrdersScreen bgStr={bgStr} tp={tp} language={language} />;
  }

  return (
    <ErrorBoundary fallbackRender={({ error }) => (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fef2f2', padding: 20 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#dc2626' }}>{t('pos.error.crash', language)}</Text>
        <Text style={{ fontSize: 16, color: '#991b1b', marginTop: 10 }}>{String(error)}</Text>
        <TouchableOpacity onPress={() => setScreen('home')} style={{ marginTop: 20, backgroundColor: '#dc2626', padding: 16, borderRadius: 8 }}>
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>{t('pos.error.go_home', language)}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )}>
      <SafeAreaView className="flex-1" style={{ backgroundColor: bgStr }}>
        <StatusBar style="dark" />

        <View className="flex-1 flex-col md:flex-row">
          {/* Left Panel: Cart & Checkout (35%) */}
          <View className="w-full md:w-[35%] h-[48%] md:h-full bg-white border-b md:border-b-0 md:border-r border-gray-200 shadow-sm z-10 flex-col">
            <View className="p-3 md:p-6 border-b border-gray-100 flex-col justify-between bg-white z-20 shadow-sm relative">
              <View className="flex-row items-center justify-between w-full">
                <View>
                  <Text className="text-xl md:text-3xl font-black text-gray-900 tracking-tight">{t('pos.lbl.order_prefix', language)} #{activeOrderNumber}</Text>
                  <Text className="text-xs md:text-sm font-semibold mt-1 uppercase tracking-wider" style={{ color: tp[600] }}>
                    {activeOrderCustomer ? `👤 ${activeOrderCustomer} — ` : ''}
                    {activeOrderType === 'dine_in' && activeOrderTable
                      ? `🍽 ${t('pos.orders.dine_in', language)} (${activeOrderTable.name})`
                      : `🛍 ${t('pos.orders.take_out', language)}`}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setScreen('home')} className="bg-gray-50 p-2 md:p-3 rounded-xl md:rounded-2xl border border-gray-200 shadow-sm">
                  <Text className="font-bold text-xs md:text-base text-gray-700">{t('pos.main.home', language)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              className="flex-1 p-3 md:p-4"
              data={cart}
              keyExtractor={item => item.cart_id}
              ListEmptyComponent={
                <View className="flex-1 items-center justify-center py-6 md:py-20">
                  <Text className="text-gray-400 font-medium text-base md:text-lg">{t('pos.msg.empty_cart', language)}</Text>
                  <Text className="text-gray-400 text-xs md:text-sm mt-1 md:mt-2 text-center px-4">{t('pos.main.empty_cart_hint', language)}</Text>
                </View>
              }
              renderItem={({ item: cartItem }: { item: CartItem }) => (
                <CartItemRow
                  cartItem={cartItem}
                  isInspecting={inspectingCartItemId === cartItem.cart_id}
                  tp={tp}
                  language={language}
                  currency={currency}
                  getCartItemPrice={getCartItemPrice}
                  onPress={() => requestAnimationFrame(() => setInspectingCartItemId(cartItem.cart_id))}
                  onIncrement={() => incrementCartItemQuantity(cartItem.cart_id)}
                  onDecrement={() => decrementCartItemQuantity(cartItem.cart_id)}
                  onRemove={() => removeFromCart(cartItem.cart_id)}
                />
              )}
            />

            <View className="p-3 md:p-6 border-t border-gray-100 bg-gray-50">
              {/* MOBILE COLLAPSIBLE TOGGLE ROW */}
              {isMobile && (
                <View className="flex-row justify-between items-center mb-2 pb-2 border-b border-gray-200/60">
                  <TouchableOpacity 
                    onPress={() => setIsFooterExpanded(!isFooterExpanded)} 
                    className="flex-row items-center gap-1.5 py-1 px-2.5 bg-gray-200/60 rounded-lg"
                  >
                    <Text className="text-gray-700 font-bold text-xs uppercase tracking-wider">
                      {isFooterExpanded ? '👇 Ocultar' : '👆 Detalles'}
                    </Text>
                  </TouchableOpacity>
                  {cartTotals.totalDescuentos > 0 && !isFooterExpanded && (
                    <Text className="text-red-500 font-bold text-xs">
                      Descuento: -{formatCurrency(cartTotals.totalDescuentos, currency)}
                    </Text>
                  )}
                </View>
              )}

              {/* DETAILS BLOCK (Shown permanently on tablet, or on mobile when expanded) */}
              {(!isMobile || isFooterExpanded) && (
                <View className="mb-2">
                  <View className="flex flex-row justify-between mb-1">
                    <Text className="text-gray-500 font-medium text-xs md:text-sm">{t('pos.lbl.subtotal', language)}</Text>
                    <Text className="text-gray-900 font-bold text-xs md:text-sm">{formatCurrency(cartTotals.subtotalBruto, currency)}</Text>
                  </View>

                  {cartTotals.totalDescuentos > 0 && (
                    <View className="flex flex-row justify-between mb-1">
                      <Text className="text-red-500 font-medium text-xs md:text-sm">{t('pos.lbl.discount', language)}</Text>
                      <Text className="text-red-500 font-bold text-xs md:text-sm">-{formatCurrency(cartTotals.totalDescuentos, currency)}</Text>
                    </View>
                  )}

                  {cartTotals.totalDescuentos > 0 && (
                    <View className="flex flex-row justify-between mb-2 pb-2 border-b border-gray-200">
                      <Text className="text-gray-500 font-medium tracking-wide text-[10px] md:text-xs">{t('pos.main.base_imponible', language)}</Text>
                      <Text className="text-gray-700 font-semibold text-[10px] md:text-xs">{formatCurrency(cartTotals.baseImponibleIva, currency)}</Text>
                    </View>
                  )}

                  <View className="flex flex-row justify-between mb-2">
                    <Text className="text-gray-500 font-medium text-xs md:text-sm">{t('pos.lbl.tax', language)}</Text>
                    <Text className="text-gray-900 font-bold text-xs md:text-sm">{formatCurrency(cartTotals.montoIva, currency)}</Text>
                  </View>
                </View>
              )}

              {/* TOTAL ROW & EXPANDED ACTIONS CONTAINER */}
              {(!isMobile || isFooterExpanded) ? (
                <>
                  <View className="flex-row justify-between items-center bg-gray-200/50 p-2.5 md:p-4 rounded-xl mb-3 md:mb-4 mt-1 md:mt-2">
                    <Text className="text-base md:text-lg font-bold text-gray-900">{t('pos.lbl.total', language)}</Text>
                    <Text className="text-2xl md:text-3xl font-black text-gray-900">{formatCurrency(cartTotal, currency)}</Text>
                  </View>

                  {/* Send to Kitchen / Checkout buttons */}
                  <View className="flex-col gap-2 md:gap-3">
                    {/* Send to Kitchen button — show if any item has unsent delta */}
                    {cart.some((c: CartItem) => (c.sentQuantity ?? 0) < c.quantity) ? (
                      <TouchableOpacity
                        onPress={async () => {
                          await sendToKitchen();
                          Alert.alert(t('pos.main.kitchen_notified', language), t('pos.main.kitchen_notified_desc', language));
                        }}
                        disabled={cart.length === 0}
                        className="bg-amber-400 px-4 md:px-6 py-2 md:py-3 rounded-xl items-center justify-center flex-row gap-2 shadow-sm"
                      >
                        <Text className="text-white font-bold text-sm md:text-base">{t('pos.main.send_kitchen', language)}</Text>
                      </TouchableOpacity>
                    ) : cart.length > 0 ? (
                      <View className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl items-center">
                        <Text className="text-amber-700 font-semibold text-xs md:text-sm">{t('pos.main.all_sent', language)}</Text>
                      </View>
                    ) : null}

                    <View className="flex-row gap-2 md:gap-3">
                      <TouchableOpacity
                        onPress={() => setShowPromosModal(true)}
                        disabled={cart.length === 0}
                        className="bg-indigo-50 px-3 md:px-4 py-2.5 md:py-4 rounded-xl items-center justify-center border border-indigo-200"
                        style={cart.length === 0 ? { opacity: 0.5 } : {}}
                      >
                        <Text className="text-indigo-700 font-bold text-sm md:text-lg">🏷️ {t('pos.tab.promos', language)}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={clearCart}
                        className="bg-red-50 px-3 md:px-4 py-2.5 md:py-4 rounded-xl items-center justify-center border border-red-100"
                      >
                        <Text className="text-red-600 font-bold text-sm md:text-lg">{t('pos.lbl.clear', language)}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={async () => {
                          if (cart.length === 0) return;
                          if (currentPosUser?.role === 'mesero') {
                            Alert.alert(
                              language === 'es' ? 'Acceso Denegado' : 'Access Denied',
                              language === 'es'
                                ? 'Su rol de Mesero no le permite realizar cobros. Solicite ayuda a un Cajero o Administrador.'
                                : 'Your server role does not permit processing payments. Please contact a Cashier or Admin.'
                            );
                            return;
                          }
                          if (!activeCashShift) {
                            Alert.alert(
                              language === 'es' ? 'Caja Cerrada' : 'Register Closed',
                              language === 'es'
                                ? 'Debe abrir una caja antes de poder realizar cobros.'
                                : 'You must open a cash drawer shift before processing checkouts.',
                              [
                                { text: language === 'es' ? 'Abrir Caja' : 'Open Register', onPress: () => { setScreen('home'); setShowCashRegisterModal(true); } },
                                { text: language === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' }
                              ]
                            );
                            return;
                          }
                          setShowCheckoutModal(true);
                          setCurrentPayments([]);
                          setCashTenderAmount('');
                        }}
                        className={`flex-1 px-4 md:px-6 py-2.5 md:py-4 rounded-xl items-center justify-center shadow-sm ${cart.length === 0 ? 'bg-gray-300' : ''}`}
                        style={cart.length > 0 ? { backgroundColor: tp[600] } : undefined}
                        disabled={cart.length === 0 || isLoading}
                      >
                        <Text className="text-white font-bold text-lg md:text-xl">{isLoading ? t('pos.main.processing', language) : t('pos.tab.checkout', language)}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              ) : (
                /* COLLAPSED QUICK-ACTIONS ROW FOR MOBILE */
                <View className="flex-row justify-between items-center py-1">
                  <View className="flex-col">
                    <Text className="text-gray-500 font-semibold text-[10px] uppercase tracking-wider">{t('pos.lbl.total', language)}</Text>
                    <Text className="text-2xl font-black text-gray-900">{formatCurrency(cartTotal, currency)}</Text>
                  </View>
                  
                  <View className="flex-row gap-2 flex-1 justify-end ml-4">
                    {/* If any item needs to be sent to kitchen, show quick send button */}
                    {cart.some((c: CartItem) => (c.sentQuantity ?? 0) < c.quantity) && (
                      <TouchableOpacity
                        onPress={async () => {
                          await sendToKitchen();
                          Alert.alert(t('pos.main.kitchen_notified', language), t('pos.main.kitchen_notified_desc', language));
                        }}
                        disabled={cart.length === 0}
                        className="bg-amber-400 px-4 py-2.5 rounded-xl items-center justify-center shadow-sm"
                      >
                        <Text className="text-white font-bold text-sm">🔥 Enviar</Text>
                      </TouchableOpacity>
                    )}
                    
                    <TouchableOpacity
                      onPress={async () => {
                        if (cart.length === 0) return;
                        if (currentPosUser?.role === 'mesero') {
                          Alert.alert(
                            language === 'es' ? 'Acceso Denegado' : 'Access Denied',
                            language === 'es'
                              ? 'Su rol de Mesero no le permite realizar cobros. Solicite ayuda a un Cajero o Administrador.'
                              : 'Your server role does not permit processing payments. Please contact a Cashier or Admin.'
                          );
                          return;
                        }
                        if (!activeCashShift) {
                          Alert.alert(
                            language === 'es' ? 'Caja Cerrada' : 'Register Closed',
                            language === 'es'
                              ? 'Debe abrir una caja antes de poder realizar cobros.'
                              : 'You must open a cash drawer shift before processing checkouts.',
                            [
                              { text: language === 'es' ? 'Abrir Caja' : 'Open Register', onPress: () => { setScreen('home'); setShowCashRegisterModal(true); } },
                              { text: language === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' }
                            ]
                          );
                          return;
                        }
                        setShowCheckoutModal(true);
                        setCurrentPayments([]);
                        setCashTenderAmount('');
                      }}
                      className={`px-6 py-2.5 rounded-xl items-center justify-center shadow-sm ${cart.length === 0 ? 'bg-gray-300' : ''}`}
                      style={cart.length > 0 ? { backgroundColor: tp[600] } : undefined}
                      disabled={cart.length === 0 || isLoading}
                    >
                      <Text className="text-white font-bold text-sm">{t('pos.tab.checkout', language)}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Right Panel: Dynamic (Menu Grid OR Ingredient Inspector) (65%) */}
          <View className="flex-1 flex-col bg-gray-100/50 relative">

            {/* CATEGORIES HEADER TABS */}
            <View className="bg-white border-b border-gray-200">
              <View className="p-6 pb-4 flex-row justify-between items-center">
                <Text className="text-2xl font-bold text-gray-900 tracking-tight">
                  {inspectingItem ? `${t('pos.main.customize', language)} ${inspectingItem.item.name}` : t('pos.main.menu', language)}
                </Text>

                {inspectingItem && (
                  <TouchableOpacity
                    onPress={() => requestAnimationFrame(() => setInspectingCartItemId(null))}
                    className="bg-gray-100 px-4 py-2 rounded-lg border border-gray-200"
                  >
                    <Text className="font-bold text-gray-700">{t('pos.main.done_back', language)}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!inspectingItem && categories.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-6 pb-4 flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setActiveCategory(null)}
                    className={`px-5 py-2.5 rounded-full border ${activeCategory === null ? '' : 'bg-white border-gray-200'}`}
                    style={activeCategory === null ? { backgroundColor: tp[600], borderColor: tp[600] } : undefined}
                  >
                    <Text className={`font-bold ${activeCategory === null ? 'text-white' : 'text-gray-700'}`}>{t('pos.main.all_items', language)}</Text>
                  </TouchableOpacity>

                  {categories.map((cat: Category) => (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => setActiveCategory(cat.id)}
                      className={`px-5 py-2.5 rounded-full border ${activeCategory === cat.id ? '' : 'bg-white border-gray-200'}`}
                      style={activeCategory === cat.id ? { backgroundColor: tp[600], borderColor: tp[600] } : undefined}
                    >
                      <Text className={`font-bold ${activeCategory === cat.id ? 'text-white' : 'text-gray-700'}`}>{cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* MAIN CONTENT AREA */}
            <View className="flex-1 p-6">
              {isLoading ? (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator color={tp[600]} size="large" />
                  <Text className="text-gray-400 font-medium mt-4">{t('pos.main.loading', language)}</Text>
                </View>
              ) : inspectingItem ? (
                // --- INGREDIENT INSPECTOR VIEW ---
                <ScrollView className="flex-1">
                  <View className="pb-10">
                    {inspectingItem.item.type === 'combo' && inspectingItem.sub_items ? (
                      <>
                        {(() => {
                          const fullItem = items.find((i: MenuItem) => i.id === inspectingItem.item.id);
                          const itemOptions: ItemOption[] = fullItem?.options || [];
                          const currentSelected: Record<string, string> = inspectingItem.selectedOptions || {};

                          if (itemOptions.length === 0) return null;
                          return (
                            <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb' }}>
                              <Text style={{ fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 12 }}>{t('pos.custom.combo_options', language)}</Text>
                              {itemOptions.map((opt: ItemOption) => (
                                <View key={opt.name} style={{ marginBottom: 14 }}>
                                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    {opt.name}
                                  </Text>
                                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                    {(opt.choices || []).map((choiceDef: ItemOptionChoice) => {
                                      const choiceName = typeof choiceDef === 'object' ? choiceDef.name : choiceDef;
                                      const isSelected = currentSelected[opt.name] === choiceName;
                                      const priceMod = typeof choiceDef === 'object' ? choiceDef.price_modifier : 0;
                                      const labelText = priceMod ? `${choiceName} (${priceMod > 0 ? '+' : ''}${formatCurrency(priceMod, currency)})` : choiceName;

                                      return (
                                        <TouchableOpacity
                                          key={choiceName}
                                          onPress={() => updateCartItemOptions(inspectingItem.cart_id, { ...currentSelected, [opt.name]: choiceName })}
                                          style={{
                                            paddingHorizontal: 18, paddingVertical: 10, borderRadius: 99, borderWidth: 2,
                                            backgroundColor: isSelected ? tp[600] : 'white',
                                            borderColor: isSelected ? tp[600] : '#d1d5db',
                                          }}
                                        >
                                          <Text style={{ fontWeight: 'bold', color: isSelected ? 'white' : '#4b5563', fontSize: 15 }}>
                                            {labelText}
                                          </Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                </View>
                              ))}
                            </View>
                          );
                        })()}
                        {inspectingItem.sub_items.map(subItem => {
                          const isExpanded = inspectingSubItemId === subItem.cart_id;
                          return (
                            <View key={subItem.cart_id} className={`mb-4 bg-white rounded-2xl shadow-sm border overflow-hidden ${!isExpanded ? 'border-gray-200' : ''}`} style={{ borderColor: isExpanded ? tp[300] : undefined }}>
                              <TouchableOpacity
                                onPress={() => setInspectingSubItemId(isExpanded ? null : subItem.cart_id)}
                                className={`p-6 flex-row justify-between items-center ${isExpanded ? 'border-b' : ''}`}
                                style={isExpanded ? { backgroundColor: tp[50], borderBottomColor: tp[100] } : undefined}
                              >
                                <View>
                                  <Text className="text-xl font-bold text-gray-900">{subItem.item.name}</Text>
                                  <Text className="text-sm text-gray-500">{t('pos.custom.tap_customize', language)}</Text>
                                </View>
                                <Text className={`font-bold px-4 py-2 border rounded-full ${!isExpanded ? 'text-gray-600 border-gray-200' : ''}`} style={isExpanded ? { backgroundColor: tp[100], color: tp[700], borderColor: tp[200] } : undefined}>
                                  {isExpanded ? t('pos.custom.close_config', language) : t('pos.custom.customize', language)}
                                </Text>
                              </TouchableOpacity>

                              {isExpanded && (
                                <View className="p-6 bg-gray-50/50">
                                  {(() => {
                                    const fullSubItem = items.find((i: MenuItem) => i.id === subItem.item.id);
                                    const subItemOptions: ItemOption[] = fullSubItem?.options || [];
                                    const visibleOptions = subItemOptions.filter(opt => !opt.hide_in_combo);
                                    const currentSelected: Record<string, string> = subItem.selectedOptions || {};

                                    return (
                                      <>
                                        {visibleOptions.length > 0 && (
                                          <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb' }}>
                                            <Text style={{ fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 12 }}>{t('pos.custom.required_options', language)}</Text>
                                            {visibleOptions.map((opt: ItemOption) => (
                                              <View key={opt.name} style={{ marginBottom: 14 }}>
                                                <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                  {opt.name}
                                                </Text>
                                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                                  {(opt.choices || []).map((choiceDef: ItemOptionChoice) => {
                                                    const choiceName = typeof choiceDef === 'object' ? choiceDef.name : choiceDef;
                                                    const isSelected = currentSelected[opt.name] === choiceName;
                                                    const priceMod = typeof choiceDef === 'object' ? choiceDef.price_modifier : 0;
                                                    const labelText = priceMod ? `${choiceName} (${priceMod > 0 ? '+' : ''}${formatCurrency(priceMod, currency)})` : choiceName;

                                                    return (
                                                      <TouchableOpacity
                                                        key={choiceName}
                                                        onPress={() => updateCartItemOptions(inspectingItem.cart_id, { ...currentSelected, [opt.name]: choiceName }, subItem.cart_id)}
                                                        style={{
                                                          paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99, borderWidth: 2,
                                                          backgroundColor: isSelected ? tp[600] : 'white',
                                                          borderColor: isSelected ? tp[600] : '#d1d5db',
                                                        }}
                                                      >
                                                        <Text style={{ fontWeight: 'bold', color: isSelected ? 'white' : '#4b5563', fontSize: 14 }}>
                                                          {labelText}
                                                        </Text>
                                                      </TouchableOpacity>
                                                    );
                                                  })}
                                                </View>
                                              </View>
                                            ))}
                                          </View>
                                        )}
                                        {renderIngredientEditor(inspectingItem.cart_id, subItem.cart_id, subItem.ingredients, fullSubItem?.tags || [])}
                                      </>
                                    );
                                  })()}
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </>
                    ) : (() => {
                      const fullItem = items.find((i: MenuItem) => i.id === inspectingItem.item.id);
                      const itemOptions: ItemOption[] = fullItem?.options || [];
                      const currentSelected: Record<string, string> = inspectingItem.selectedOptions || {};
                      return (
                        <>
                          {itemOptions.length > 0 && (
                            <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb' }}>
                              <Text style={{ fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 12 }}>{t('pos.custom.required_options', language)}</Text>
                              {itemOptions.map((opt: ItemOption) => (
                                <View key={opt.name} style={{ marginBottom: 14 }}>
                                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    {opt.name}
                                  </Text>
                                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                    {(opt.choices || []).map((choiceDef: ItemOptionChoice) => {
                                      const choiceName = typeof choiceDef === 'object' ? choiceDef.name : choiceDef;
                                      const isSelected = currentSelected[opt.name] === choiceName;
                                      const priceMod = typeof choiceDef === 'object' ? choiceDef.price_modifier : 0;
                                      const labelText = priceMod ? `${choiceName} (${priceMod > 0 ? '+' : ''}${formatCurrency(priceMod, currency)})` : choiceName;

                                      return (
                                        <TouchableOpacity
                                          key={choiceName}
                                          onPress={() => updateCartItemOptions(inspectingItem.cart_id, { ...currentSelected, [opt.name]: choiceName })}
                                          style={{
                                            paddingHorizontal: 18, paddingVertical: 10, borderRadius: 99, borderWidth: 2,
                                            backgroundColor: isSelected ? tp[600] : 'white',
                                            borderColor: isSelected ? tp[600] : '#d1d5db',
                                          }}
                                        >
                                          <Text style={{ fontWeight: 'bold', color: isSelected ? 'white' : '#4b5563', fontSize: 15 }}>
                                            {labelText}
                                          </Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                </View>
                              ))}
                            </View>
                          )}
                          {renderIngredientEditor(inspectingItem.cart_id, null, inspectingItem.ingredients, fullItem?.tags || [])}
                        </>
                      );
                    })()
                    }
                  </View>
                </ScrollView>
              ) : (
                // --- MENU GRID VIEW ---
                <FlatList
                  data={displayedItems}
                  keyExtractor={(i: MenuItem) => i.id}
                  numColumns={3}
                  columnWrapperStyle={{ gap: 16, marginBottom: 16 }}
                  ListEmptyComponent={
                    <View className="py-20 items-center justify-center">
                      <Text className="text-gray-500 font-medium">{t('pos.main.no_items', language)}</Text>
                    </View>
                  }
                  renderItem={({ item }: { item: MenuItem }) => {
                    const unavailable = !isItemAvailable(item);
                    const reason = unavailable ? (item.type === 'combo' ? t('pos.main.ingredient_unavail', language) : t('pos.main.out_of_stock', language)) : null;

                    return (
                      <MenuCard
                        item={item}
                        unavailable={unavailable}
                        reason={reason}
                        tp={tp}
                        currency={currency}
                        onPress={() => {
                          setQtyPickerItem(item);
                          setQtyPickerCount(1);
                          const defaultOptions: Record<string, string> = {};
                          (item.options || []).forEach((opt: ItemOption) => {
                            if (opt.choices && opt.choices.length > 0) {
                              const firstChoice = opt.choices[0];
                              defaultOptions[opt.name] = typeof firstChoice === 'object' ? firstChoice.name : firstChoice;
                            }
                          });
                          setQtyPickerOptions(defaultOptions);
                        }}
                      />
                    );
                  }}
                />
              )}
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* Quantity Picker Modal — shown when tapping a menu item */}
      {!!qtyPickerItem && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, elevation: 100, zIndex: 100 }}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setQtyPickerItem(null)}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}
          >
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}
              style={{ backgroundColor: 'white', borderRadius: 24, padding: 28, width: 320, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20 }}>
              {qtyPickerItem && (
                <>
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: qtyPickerItem.type === 'combo' ? '#ede9fe' : tp[100], alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    <Text style={{ fontSize: 22, fontWeight: '900', color: qtyPickerItem.type === 'combo' ? '#7c3aed' : tp[600] }}>{qtyPickerItem.name.charAt(0)}</Text>
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 4, textAlign: 'center' }}>{qtyPickerItem.name}</Text>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: tp[600], marginBottom: 24 }}>{formatCurrency(qtyPickerItem.base_price, currency)} {t('pos.main.each', language)}</Text>
                  {(() => {
                    let maxAvailableQty = Infinity;
                    if (qtyPickerItem.track_inventory) {
                      maxAvailableQty = Math.min(maxAvailableQty, qtyPickerItem.stock_level ?? 0);
                    }
                    const itemRecipes = recipes.filter((r: Recipe) => r.parent_item_id === qtyPickerItem.id);
                    for (const r of itemRecipes) {
                      const ing = allIngredients.find((i: MenuItem) => i.id === r.child_item_id);
                      if (ing && ing.track_inventory) {
                        const maxFromIng = Math.floor((ing.stock_level ?? 0) / (r.quantity || 1));
                        maxAvailableQty = Math.min(maxAvailableQty, maxFromIng);
                      }
                    }
                    if (qtyPickerItem.type === 'combo') {
                      for (const r of itemRecipes) {
                        const subProduct = items.find((i: MenuItem) => i.id === r.child_item_id);
                        if (subProduct) {
                          if (subProduct.track_inventory) {
                            maxAvailableQty = Math.min(maxAvailableQty, Math.floor((subProduct.stock_level ?? 0) / (r.quantity || 1)));
                          }
                          const subRecipes = recipes.filter((sr: Recipe) => sr.parent_item_id === subProduct.id);
                          for (const sr of subRecipes) {
                            const subIng = allIngredients.find((i: MenuItem) => i.id === sr.child_item_id);
                            if (subIng && subIng.track_inventory) {
                              const totalNeeded = sr.quantity * (r.quantity || 1);
                              const maxFromSubIng = Math.floor((subIng.stock_level ?? 0) / totalNeeded);
                              maxAvailableQty = Math.min(maxAvailableQty, maxFromSubIng);
                            }
                          }
                        }
                      }
                    }
                    if (!isFinite(maxAvailableQty)) maxAvailableQty = 999;
                    const atMax = qtyPickerCount >= maxAvailableQty;

                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 28 }}>
                        <TouchableOpacity
                          onPress={() => setQtyPickerCount((q: number) => Math.max(1, q - 1))}
                          style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: qtyPickerCount > 1 ? '#fee2e2' : '#f3f4f6', borderWidth: 1, borderColor: qtyPickerCount > 1 ? '#fca5a5' : '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ fontSize: 24, fontWeight: '900', color: qtyPickerCount > 1 ? '#dc2626' : '#9ca3af' }}>−</Text>
                        </TouchableOpacity>
                        <View style={{ width: 56, height: 44, backgroundColor: '#f3f4f6', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827' }}>{qtyPickerCount}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setQtyPickerCount((q: number) => Math.min(maxAvailableQty, q + 1))}
                          disabled={atMax}
                          style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: atMax ? '#f3f4f6' : tp[100], borderWidth: 1, borderColor: atMax ? '#e5e7eb' : tp[300], alignItems: 'center', justifyContent: 'center', opacity: atMax ? 0.5 : 1 }}
                        >
                          <Text style={{ fontSize: 24, fontWeight: '900', color: atMax ? '#9ca3af' : tp[600] }}>+</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })()}
                  <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
                    {t('pos.main.subtotal', language)} <Text style={{ fontWeight: '800', color: '#111827' }}>
                      {formatCurrency(qtyPickerCount * (qtyPickerItem.base_price + Object.entries(qtyPickerOptions).reduce((sum, [optName, choiceName]) => {
                        const optDef = (qtyPickerItem.options || []).find((o: ItemOption) => o.name === optName);
                        if (!optDef) return sum;
                        const choiceDef = (optDef.choices || []).find((c: ItemOptionChoice) => (typeof c === 'object' ? c.name : c) === choiceName);
                        return sum + (typeof choiceDef === 'object' && choiceDef.price_modifier ? choiceDef.price_modifier : 0);
                      }, 0)), currency)}
                    </Text>
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      const itemToAdd = qtyPickerItem;
                      const optionsToAdd = qtyPickerOptions;
                      const count = qtyPickerCount;
                      setQtyPickerItem(null);
                      setQtyPickerCount(1);
                      setQtyPickerOptions({});
                      (async () => {
                        try {
                          for (let i = 0; i < count; i++) {
                            await addToCart(itemToAdd, optionsToAdd, []);
                          }
                        } catch (err) {
                          console.error('Error adding multiple to cart:', err);
                        }
                      })();
                    }}
                    style={{ backgroundColor: tp[600], paddingVertical: 16, paddingHorizontal: 32, borderRadius: 16, width: '100%', alignItems: 'center', shadowColor: tp[600], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}
                  >
                    <Text style={{ color: 'white', fontSize: 18, fontWeight: '800' }}>
                      {t('pos.main.add_to_cart', language).replace('{qty}', String(qtyPickerCount))}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      )}

      {/* Customization Modal */}
      {!!customizationItem && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, elevation: 110, zIndex: 110 }}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setCustomizationItem(null)}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e: GestureResponderEvent) => e.stopPropagation()}
              style={{ backgroundColor: 'white', borderRadius: 24, padding: 24, width: '90%', maxWidth: 500, maxHeight: '80%', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20 }}>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827' }}>{t('pos.custom.customize', language)} {customizationItem.name}</Text>
                <TouchableOpacity onPress={() => setCustomizationItem(null)} style={{ backgroundColor: '#f3f4f6', padding: 8, borderRadius: 8 }}>
                  <Text style={{ fontWeight: 'bold', color: '#374151' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {customizationItem.options && customizationItem.options.length > 0 && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#374151', marginBottom: 12 }}>{t('pos.custom.required_options', language)}</Text>
                    {customizationItem.options.map((opt: ItemOption) => (
                      <View key={opt.name} style={{ marginBottom: 16 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: '#4b5563', marginBottom: 8 }}>{opt.name}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {(opt.choices || []).map((choiceDef: ItemOptionChoice) => {
                            const choiceName = typeof choiceDef === 'object' ? choiceDef.name : choiceDef;
                            const isSelected = customizationOptions[opt.name] === choiceName;
                            const priceMod = typeof choiceDef === 'object' ? choiceDef.price_modifier : 0;
                            const labelText = priceMod ? `${choiceName} (${priceMod > 0 ? '+' : ''}${formatCurrency(priceMod, currency)})` : choiceName;

                            return (
                              <TouchableOpacity
                                key={choiceName}
                                onPress={() => setCustomizationOptions(prev => ({ ...prev, [opt.name]: choiceName }))}
                                style={{
                                  paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99, borderWidth: 2,
                                  backgroundColor: isSelected ? tp[600] : 'white',
                                  borderColor: isSelected ? tp[600] : '#e5e7eb',
                                }}
                              >
                                <Text style={{ fontSize: 13, fontWeight: '700', color: isSelected ? 'white' : '#4b5563' }}>
                                  {labelText}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Extras Section (tag-based ingredients) */}
                {customizationItem.tags && customizationItem.tags.length > 0 && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#374151', marginBottom: 12 }}>{t('pos.modal.avail_extras', language)}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {allIngredients
                        .filter((ing: MenuItem) => ing.tags && ing.tags.some((tag: string) => customizationItem.tags.includes(tag)))
                        .map((ing: MenuItem) => {
                          const timesAdded = customizationExtras.filter((e: MenuItem) => e.id === ing.id).length;

                          if (timesAdded > 0) {
                            return (
                              <View key={ing.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: tp[50], borderColor: tp[200], borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: '48%', justifyContent: 'space-between' }}>
                                <View>
                                  <Text style={{ fontWeight: 'bold', color: tp[900] }}>{ing.name}</Text>
                                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: tp[600] }}>+{formatCurrency(ing.base_price, currency)}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                  <TouchableOpacity
                                    onPress={() => {
                                      const idx = customizationExtras.findIndex((e: MenuItem) => e.id === ing.id);
                                      if (idx !== -1) {
                                        const newExtras = [...customizationExtras];
                                        newExtras.splice(idx, 1);
                                        setCustomizationExtras(newExtras);
                                      }
                                    }}
                                    style={{ backgroundColor: 'white', borderRadius: 99, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderColor: tp[200], borderWidth: 1 }}
                                  >
                                    <Text style={{ fontWeight: 'bold', color: tp[600] }}>−</Text>
                                  </TouchableOpacity>
                                  <Text style={{ fontWeight: '900', color: tp[900] }}>{timesAdded}</Text>
                                  <TouchableOpacity
                                    onPress={() => setCustomizationExtras((prev: MenuItem[]) => [...prev, ing])}
                                    style={{ backgroundColor: tp[600], borderRadius: 99, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    <Text style={{ color: 'white', fontWeight: 'bold' }}>+</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            );
                          }

                          return (
                            <TouchableOpacity
                              key={ing.id}
                              onPress={() => setCustomizationExtras((prev: MenuItem[]) => [...prev, ing])}
                              style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, backgroundColor: 'white', borderColor: '#d1d5db', minWidth: '48%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                              <View>
                                <Text style={{ fontWeight: '500', color: '#374151' }}>{ing.name}</Text>
                                <Text style={{ fontSize: 12, fontWeight: 'bold', color: tp[600] }}>+{formatCurrency(ing.base_price, currency)}</Text>
                              </View>
                              <Text style={{ color: '#9ca3af', fontSize: 18 }}>+</Text>
                            </TouchableOpacity>
                          );
                        })}
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Add to Order Button */}
              <View style={{ borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 16, marginTop: 16 }}>
                <TouchableOpacity
                  style={{ backgroundColor: tp[600], borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
                  onPress={async () => {
                    // Validate all required options are selected
                    if (customizationItem.options) {
                      for (const opt of customizationItem.options) {
                        if (!customizationOptions[opt.name]) {
                          Alert.alert(t('pos.custom.missing', language), `${t('pos.custom.missing_desc', language)} ${opt.name}`);
                          return;
                        }
                      }
                    }

                    // Capture current state to pass into async call
                    const itemToAdd = customizationItem;
                    const optionsToAdd = customizationOptions;
                    const extrasToAdd = customizationExtras;

                    // Immediately close the modal to prevent visual delay
                    setCustomizationItem(null);
                    setCustomizationOptions({});
                    setCustomizationExtras([]);

                    // Execute database save in the background
                    addToCart(itemToAdd, optionsToAdd, extrasToAdd).catch(err => {
                      console.error("Error adding to cart:", err);
                    });
                  }}
                >
                  <Text style={{ color: 'white', fontSize: 18, fontWeight: '800' }}>{t('pos.custom.add_to_order', language)}</Text>
                </TouchableOpacity>
              </View>

            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      )}

      {/* Promotions / Ofertas Modal */}
      {showPromosModal && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, elevation: 130, zIndex: 130 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 32, width: '90%', maxWidth: 600, maxHeight: '80%', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 30, shadowOffset: { width: 0, height: 10 } }}>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 16, marginBottom: 20 }}>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827' }}>{t('pos.promos.title', language)}</Text>
                <TouchableOpacity onPress={() => setShowPromosModal(false)} style={{ backgroundColor: '#f3f4f6', padding: 10, borderRadius: 12 }}>
                  <Text style={{ fontWeight: 'bold', color: '#374151', fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 400 }}>
                {availablePromotions.filter(p => !p.is_automatic).length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <Text style={{ fontSize: 48, marginBottom: 12 }}>📭</Text>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#6b7280' }}>{t('pos.promos.no_manual', language)}</Text>
                    <Text style={{ fontSize: 14, color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>{t('pos.promos.no_manual_desc', language)}</Text>
                  </View>
                ) : (
                  availablePromotions.filter(p => !p.is_automatic).map(promo => {
                    const isApplied = appliedGlobalPromotionIds.includes(promo.id);
                    return (
                      <TouchableOpacity
                        key={promo.id}
                        onPress={() => {
                          if (isApplied) {
                            removeManualPromotion(promo.id);
                          } else {
                            applyManualPromotion(promo.id);
                          }
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: 16,
                          marginBottom: 12,
                          borderRadius: 16,
                          borderWidth: 2,
                          borderColor: isApplied ? '#22c55e' : '#e5e7eb',
                          backgroundColor: isApplied ? '#f0fdf4' : '#ffffff'
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 17, fontWeight: '800', color: isApplied ? '#15803d' : '#111827' }}>{promo.name}</Text>
                          {promo.description ? (
                            <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{promo.description}</Text>
                          ) : null}
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <View style={{ backgroundColor: '#eef2ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#4f46e5', textTransform: 'uppercase' }}>
                                {promo.type === 'percentage' ? `${promo.discount_value}% OFF` :
                                 promo.type === 'fixed_amount' ? `C$${promo.discount_value} OFF` :
                                 promo.type === 'bogo' ? 'BOGO' : promo.type}
                              </Text>
                            </View>
                            {promo.allow_stacking && (
                              <View style={{ backgroundColor: '#fefce8', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#a16207' }}>{t('pos.promos.stackable', language)}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <View style={{
                          width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: isApplied ? '#22c55e' : '#f3f4f6'
                        }}>
                          <Text style={{ color: isApplied ? 'white' : '#9ca3af', fontWeight: '900', fontSize: 16 }}>
                            {isApplied ? '✓' : '+'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}

                {/* Show automatic promos as informational */}
                {availablePromotions.filter(p => p.is_automatic).length > 0 && (
                  <View style={{ marginTop: 16, padding: 16, backgroundColor: '#fffbeb', borderRadius: 16, borderWidth: 1, borderColor: '#fde68a' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#92400e', marginBottom: 8 }}>{t('pos.promos.auto_active', language)}</Text>
                    {availablePromotions.filter(p => p.is_automatic).map(promo => (
                      <View key={promo.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Text style={{ color: '#d97706' }}>•</Text>
                        <Text style={{ fontSize: 13, color: '#78350f', fontWeight: '600' }}>{promo.name}</Text>
                        <Text style={{ fontSize: 11, color: '#a16207' }}>
                          ({promo.type === 'percentage' ? `${promo.discount_value}%` : promo.type === 'bogo' ? 'BOGO' : `C$${promo.discount_value}`})
                        </Text>
                      </View>
                    ))}
                    <Text style={{ fontSize: 11, color: '#92400e', marginTop: 8 }}>{t('pos.promos.auto_desc', language)}</Text>
                  </View>
                )}
              </ScrollView>

              <TouchableOpacity
                onPress={() => {
                  recalculateCartMath();
                  setShowPromosModal(false);
                }}
                style={{
                  marginTop: 20,
                  backgroundColor: tp[600],
                  paddingVertical: 16,
                  borderRadius: 16,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: 'white', fontWeight: '900', fontSize: 18 }}>{t('pos.promos.apply_close', language)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Checkout Split Payment Modal */}
      {showCheckoutModal && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, elevation: 120, zIndex: 120 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 32, width: '90%', maxWidth: 800, height: 650, maxHeight: '90%', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 30, shadowOffset: { width: 0, height: 10 } }}>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 16, marginBottom: 24 }}>
                <Text style={{ fontSize: 28, fontWeight: '900', color: '#111827' }}>{t('pos.checkout.title', language)}</Text>
                <TouchableOpacity onPress={() => setShowCheckoutModal(false)} style={{ backgroundColor: '#f3f4f6', padding: 10, borderRadius: 12 }}>
                  <Text style={{ fontWeight: 'black', color: '#374151', fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>

              {(() => {
                const totalPaid = currentPayments.reduce((sum, p) => sum + p.amount, 0);
                const remaining = Math.max(0, cartTotal - totalPaid);
                const isFullyPaid = remaining <= 0;

                // Progress calculation
                const progressPct = Math.min(100, (totalPaid / cartTotal) * 100) || 0;

                const handleAddPayment = (method: string, amount: number) => {
                  if (isNaN(amount) || amount <= 0) return;

                  // Enforcement for max 5 cards / 5 bank deposits
                  if (method === 'credit_card' && currentPayments.filter(p => p.method === 'credit_card').length >= 5) {
                    Alert.alert(t('pos.checkout.limit', language), t('pos.checkout.limit_cards', language));
                    return;
                  }
                  if (method === 'bank_deposit' && currentPayments.filter(p => p.method === 'bank_deposit').length >= 5) {
                    Alert.alert(t('pos.checkout.limit', language), t('pos.checkout.limit_bank', language));
                    return;
                  }

                  const processPayment = () => {
                    const newPayment = {
                      amount: method === 'cash' ? amount : Math.min(amount, remaining),
                      method,
                      reference_id: method === 'credit_card' ? `CC-${Math.floor(Math.random() * 9000) + 1000}` : undefined
                    };
                    setCurrentPayments(prev => [...prev, newPayment]);
                    setCashTenderAmount('');
                  };

                  if (method === 'credit_card') {
                    setProcessingCard(true);
                    setTimeout(() => {
                      setProcessingCard(false);
                      processPayment();
                    }, 2000); // Simulated API latency
                  } else {
                    processPayment();
                  }
                };

                return (
                  <View style={{ flex: 1, flexDirection: 'row', gap: 32 }}>

                    {/* Left: Balances & Payment Entry */}
                    <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: '#f3f4f6', paddingRight: 32 }}>

                      {/* Visual Balance Card */}
                      <View style={{ backgroundColor: isFullyPaid ? '#f0fdf4' : tp[50], padding: 24, borderRadius: 20, marginBottom: 24, borderWidth: 1, borderColor: isFullyPaid ? '#bbf7d0' : tp[200] }}>
                        <Text style={{ fontSize: 16, color: isFullyPaid ? '#166534' : tp[700], fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('pos.checkout.remaining', language)}</Text>
                        <Text style={{ fontSize: 48, fontWeight: '900', color: isFullyPaid ? '#15803d' : tp[900], letterSpacing: -1 }}>{formatCurrency(remaining, currency)}</Text>

                        {/* Progress Bar */}
                        <View style={{ height: 8, backgroundColor: isFullyPaid ? '#bbf7d0' : tp[200], borderRadius: 4, marginTop: 16, overflow: 'hidden' }}>
                          <View style={{ height: '100%', width: `${progressPct}%`, backgroundColor: isFullyPaid ? '#22c55e' : tp[600] }} />
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                          <Text style={{ fontSize: 13, color: tp[600], fontWeight: '600' }}>{t('pos.checkout.paid_label', language)} {formatCurrency(totalPaid, currency)}</Text>
                          <Text style={{ fontSize: 13, color: tp[600], fontWeight: '600' }}>{t('pos.checkout.total_label', language)} {formatCurrency(cartTotal, currency)}</Text>
                        </View>
                      </View>

                      {processingCard ? (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', borderRadius: 16, borderWidth: 2, borderColor: '#e2e8f0', borderStyle: 'dashed' }}>
                          <ActivityIndicator size="large" color={tp[600]} style={{ marginBottom: 16, transform: [{ scale: 1.5 }] }} />
                          <Text style={{ fontSize: 20, fontWeight: '800', color: '#334155' }}>{t('pos.checkout.awaiting_card', language)}</Text>
                          <Text style={{ fontSize: 14, color: '#64748b', marginTop: 8 }}>{t('pos.checkout.tap_insert', language)}</Text>
                        </View>
                      ) : !isFullyPaid ? (
                        <ScrollView showsVerticalScrollIndicator={false}>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 16 }}>{t('pos.checkout.add_payment', language)}</Text>

                          {/* Currency Tab Selector */}
                          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                            <TouchableOpacity
                              onPress={() => setPayInUsd(false)}
                              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: !payInUsd ? tp[100] : '#f3f4f6', alignItems: 'center', borderWidth: 1, borderColor: !payInUsd ? tp[400] : '#e5e7eb' }}
                            >
                              <Text style={{ fontWeight: 'bold', color: !payInUsd ? tp[700] : '#4b5563' }}>
                                {language === 'es' ? `Pago en ${currency === 'USD' ? 'Dólares' : 'Córdobas'}` : `Pay in ${currency === 'USD' ? 'Dollars' : 'Cordobas'}`}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => setPayInUsd(true)}
                              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: payInUsd ? '#e0f2fe' : '#f3f4f6', alignItems: 'center', borderWidth: 1, borderColor: payInUsd ? '#38bdf8' : '#e5e7eb' }}
                            >
                              <Text style={{ fontWeight: 'bold', color: payInUsd ? '#0369a1' : '#4b5563' }}>
                                {language === 'es' ? 'Pago en Dólares (USD)' : 'Pay in Dollars (USD)'}
                              </Text>
                            </TouchableOpacity>
                          </View>

                          {payInUsd ? (
                            /* USD Cash Payment Input card */
                            <View style={{ backgroundColor: '#f0f9ff', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#bae6fd', marginBottom: 16 }}>
                              <Text style={{ fontWeight: '800', color: '#0369a1', marginBottom: 12 }}>
                                {language === 'es' ? 'Monto Recibido en USD ($)' : 'Received Amount in USD ($)'}
                              </Text>
                              
                              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                                <View style={{ flex: 1, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#bae6fd', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
                                  <Text style={{ fontSize: 20, color: '#0284c7', fontWeight: 'bold' }}>$</Text>
                                  <TextInput
                                    value={usdAmountInput}
                                    onChangeText={setUsdAmountInput}
                                    keyboardType="decimal-pad"
                                    placeholder={currency === 'USD' ? remaining.toFixed(2) : (remaining / usdExchangeRate).toFixed(2)}
                                    placeholderTextColor="#9ca3af"
                                    style={{ flex: 1, fontSize: 24, fontWeight: '800', paddingVertical: 12, marginLeft: 8, color: '#0f172a' }}
                                  />
                                </View>
                              </View>

                              {/* Conversion metrics */}
                              <Text style={{ fontSize: 13, color: '#475569', fontWeight: '600', marginBottom: 4 }}>
                                {language === 'es' ? `Tasa de Cambio: 1 USD = C$ ${usdExchangeRate.toFixed(2)}` : `Exchange Rate: 1 USD = C$ ${usdExchangeRate.toFixed(2)}`}
                              </Text>
                              {currency !== 'USD' && (
                                <Text style={{ fontSize: 15, color: '#0369a1', fontWeight: '800' }}>
                                  {language === 'es' ? 'Equivalente en Córdobas: ' : 'Equivalent in Cordobas: '}
                                  C$ {(parseFloat(usdAmountInput || '0') * usdExchangeRate).toFixed(2)}
                                </Text>
                              )}

                              <TouchableOpacity
                                onPress={() => {
                                  const usdVal = parseFloat(usdAmountInput || (currency === 'USD' ? remaining.toString() : (remaining / usdExchangeRate).toString()));
                                  if (isNaN(usdVal) || usdVal <= 0) {
                                    Alert.alert(language === 'es' ? 'Error' : 'Invalid Amount', language === 'es' ? 'Ingrese un monto válido.' : 'Please enter a valid amount.');
                                    return;
                                  }
                                  
                                  const baseAmt = currency === 'USD' ? usdVal : usdVal * usdExchangeRate;
                                  handleAddPayment('cash', baseAmt);
                                  
                                  // Record reference string so it displays USD received on receipt
                                  const refStr = `USD: $${usdVal.toFixed(2)} (@ ${usdExchangeRate.toFixed(2)})`;
                                  setCurrentPayments(prev => {
                                    const updated = [...prev];
                                    if (updated.length > 0) {
                                      updated[updated.length - 1].reference_id = refStr;
                                    }
                                    return updated;
                                  });
                                  setUsdAmountInput('');
                                  setPayInUsd(false);
                                }}
                                style={{ backgroundColor: '#0284c7', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 16 }}
                              >
                                <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>
                                  💵 {language === 'es' ? 'Confirmar Pago en USD' : 'Confirm USD Cash Payment'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            /* Regular Unified Amount Input & Actions */
                            <>
                              <View style={{ backgroundColor: '#f9fafb', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16 }}>
                                <Text style={{ fontWeight: '800', color: '#374151', marginBottom: 12 }}>{t('pos.checkout.amt_to_charge', language).replace(':', '')}</Text>
                                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                                  <View style={{ flex: 1, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#d1d5db', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
                                    <Text style={{ fontSize: 20, color: '#9ca3af', fontWeight: 'bold' }}>{CURRENCIES[currency]?.symbol || '$'}</Text>
                                    <TextInput
                                      value={cashTenderAmount}
                                      onChangeText={setCashTenderAmount}
                                      keyboardType="decimal-pad"
                                      placeholder={remaining.toFixed(2)}
                                      placeholderTextColor="#9ca3af"
                                      style={{ flex: 1, fontSize: 24, fontWeight: '800', paddingVertical: 12, marginLeft: 8 }}
                                    />
                                  </View>
                                </View>

                                {/* Quick Amount Buttons */}
                                <Text style={{ fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase' }}>{t('pos.checkout.quick_select', language)}</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                  <TouchableOpacity onPress={() => setCashTenderAmount(remaining.toFixed(2))} style={{ backgroundColor: 'white', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db' }}>
                                    <Text style={{ fontWeight: '700', color: '#374151' }}>{t('pos.checkout.exact', language)} {formatCurrency(remaining, currency)}</Text>
                                  </TouchableOpacity>
                                  {[10, 20, 50, 100].filter(amt => amt >= remaining).slice(0, 3).map(amt => (
                                    <TouchableOpacity key={amt} onPress={() => setCashTenderAmount(amt.toString())} style={{ backgroundColor: 'white', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db' }}>
                                      <Text style={{ fontWeight: '700', color: '#374151' }}>{formatCurrency(amt, currency)}</Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </View>

                              {/* Payment Method Action Buttons */}
                              <View style={{ flexDirection: 'row', gap: 12 }}>
                                <TouchableOpacity
                                  onPress={() => handleAddPayment('cash', parseFloat(cashTenderAmount || remaining.toString()))}
                                  style={{ flex: 1, backgroundColor: 'white', padding: 16, borderRadius: 16, borderWidth: 2, borderColor: '#22c55e', alignItems: 'center' }}
                                >
                                  <Text style={{ fontSize: 24, marginBottom: 8 }}>💵</Text>
                                  <Text style={{ fontWeight: '800', color: '#166534' }}>{t('pos.checkout.cash', language)}</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  onPress={() => handleAddPayment('credit_card', parseFloat(cashTenderAmount || remaining.toString()))}
                                  style={{ flex: 1, backgroundColor: 'white', padding: 16, borderRadius: 16, borderWidth: 2, borderColor: '#3b82f6', alignItems: 'center' }}
                                >
                                  <Text style={{ fontSize: 24, marginBottom: 8 }}>💳</Text>
                                  <Text style={{ fontWeight: '800', color: '#1e40af' }}>{t('pos.checkout.card', language)}</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  onPress={() => handleAddPayment('bank_deposit', parseFloat(cashTenderAmount || remaining.toString()))}
                                  style={{ flex: 1, backgroundColor: 'white', padding: 16, borderRadius: 16, borderWidth: 2, borderColor: '#8b5cf6', alignItems: 'center' }}
                                >
                                  <Text style={{ fontSize: 24, marginBottom: 8 }}>🏦</Text>
                                  <Text style={{ fontWeight: '800', color: '#5b21b6' }}>{t('pos.checkout.bank', language)}</Text>
                                </TouchableOpacity>
                              </View>
                            </>
                          )}
                        </ScrollView>
                      ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <View style={{ width: 80, height: 80, backgroundColor: '#dcfce7', borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                            <Text style={{ fontSize: 40 }}>✅</Text>
                          </View>
                          <Text style={{ fontSize: 24, fontWeight: '900', color: '#166534' }}>{t('pos.checkout.fully_paid', language)}</Text>
                          {cartTotal < totalPaid && (
                            <View style={{ alignItems: 'center', marginTop: 12 }}>
                              <Text style={{ fontSize: 18, color: '#15803d', fontWeight: 'bold' }}>
                                {t('pos.checkout.change', language)} {formatCurrency(totalPaid - cartTotal, currency)}
                              </Text>
                              <Text style={{ fontSize: 20, color: '#0369a1', fontWeight: '900', marginTop: 12, backgroundColor: '#e0f2fe', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, overflow: 'hidden' }}>
                                {language === 'es' ? 'Entregar Cambio en Córdobas: ' : 'Give Change in Cordobas: '} 
                                C$ {((totalPaid - cartTotal) * (currency === 'USD' ? usdExchangeRate : 1)).toFixed(2)}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                    </View>

                    {/* Right: Applied Payments & Action */}
                    <View style={{ width: 280, justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 16 }}>{t('pos.checkout.applied_payments', language)}</Text>

                        {currentPayments.length === 0 ? (
                          <View style={{ backgroundColor: '#f9fafb', padding: 24, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#f3f4f6', borderStyle: 'dashed' }}>
                            <Text style={{ color: '#9ca3af', fontWeight: '600' }}>{t('pos.checkout.no_payments', language)}</Text>
                          </View>
                        ) : (
                          <ScrollView showsVerticalScrollIndicator={false}>
                            {currentPayments.map((p, idx) => (
                              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: 16, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                                <View>
                                  <Text style={{ fontWeight: '800', color: '#334155', textTransform: 'capitalize' }}>
                                    {p.method.replace('_', ' ')}
                                  </Text>
                                  {p.reference_id && <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Ref: {p.reference_id}</Text>}
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                  <Text style={{ fontWeight: '900', color: '#0f172a', fontSize: 16 }}>{formatCurrency(p.amount, currency)}</Text>
                                  <TouchableOpacity onPress={() => setCurrentPayments(prev => prev.filter((_, i) => i !== idx))}>
                                    <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 18 }}>×</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ))}
                          </ScrollView>
                        )}
                      </View>

                      <View style={{ paddingTop: 24, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
                        <TouchableOpacity
                          disabled={!isFullyPaid || isCheckingOut}
                          onPress={async () => {
                            setIsCheckingOut(true);
                            try {
                              const result = await checkout(currentPayments);
                              if (result) {
                                setShowCheckoutModal(false);
                                setLastCompletedOrder({
                                  ...result,
                                  cartCopy: [...cart],
                                  paymentsCopy: [...currentPayments],
                                  total: cartTotal,
                                  subtotal: cartTotals.subtotalBruto,
                                  tax: cartTotals.montoIva,
                                  discount: cartTotals.totalDescuentos,
                                  change: totalPaid > cartTotal ? totalPaid - cartTotal : 0
                                });
                                setShowReceiptModal(true);
                              } else {
                                Alert.alert("Error", t('pos.checkout.error', language));
                              }
                            } finally {
                              setIsCheckingOut(false);
                            }
                          }}
                          style={{
                            backgroundColor: isFullyPaid && !isCheckingOut ? '#16a34a' : '#d1d5db',
                            paddingVertical: 20,
                            borderRadius: 16,
                            alignItems: 'center',
                            shadowColor: isFullyPaid ? '#16a34a' : 'transparent',
                            shadowOpacity: 0.3,
                            shadowRadius: 12,
                            shadowOffset: { width: 0, height: 6 }
                          }}
                        >
                          <Text style={{ color: 'white', fontSize: 20, fontWeight: '900' }}>{isCheckingOut ? t('pos.main.processing', language) : t('pos.checkout.complete', language)}</Text>
                        </TouchableOpacity>
                      </View>

                    </View>
                  </View>
                );
              })()}

            </View>
          </View>
        </View>
      )}

      {/* Checkout Completion Receipt Modal (The main checkout confirmation) */}
      {showReceiptModal && lastCompletedOrder && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, elevation: 130, zIndex: 130 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ backgroundColor: '#f8fafc', borderRadius: 8, width: 380, maxHeight: '90%', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 40, overflow: 'hidden' }}>

              <View style={{ backgroundColor: 'white', padding: 32, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#e2e8f0', borderStyle: 'dashed' }}>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', letterSpacing: 2 }}>{t('pos.receipt.title', language)}</Text>
                <Text style={{ fontSize: 14, color: '#64748b', marginTop: 8 }}>{t('pos.lbl.order_prefix', language)} #{lastCompletedOrder.order_number}</Text>
                {lastCompletedOrder.table_name && <Text style={{ fontSize: 14, color: '#64748b', fontWeight: 'bold' }}>{t('pos.receipt.table', language)} {lastCompletedOrder.table_name}</Text>}
                <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{new Date().toLocaleString()}</Text>
              </View>

              <ScrollView style={{ backgroundColor: 'white', padding: 32 }} showsVerticalScrollIndicator={false}>

                <View style={{ marginBottom: 24 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{t('pos.receipt.items', language)}</Text>
                  {(lastCompletedOrder.cartCopy || []).map((cartItem: CartItem) => {
                    const posState = usePosStore.getState();

                    let unitPrice = cartItem.item.base_price;
                    if (cartItem.selectedOptions && cartItem.item.options) {
                      cartItem.item.options.forEach((opt: ItemOption) => {
                        const choice = cartItem.selectedOptions?.[opt.name];
                        if (choice) {
                          const cDef = (opt.choices || []).find((c: ItemOptionChoice) => c.name === choice);
                          if (cDef?.price_modifier) unitPrice += cDef.price_modifier;
                        }
                      });
                    }
                    (cartItem.ingredients || []).forEach((ing: CartItemIngredient) => {
                      if (ing.extra && !ing.removed) unitPrice += (ing.base_price || 0);
                    });

                    (cartItem.sub_items || []).forEach((sub: CartItem) => {
                      let subUnitPrice = 0;
                      if (sub.selectedOptions && sub.item?.options) {
                        sub.item.options.forEach((opt: ItemOption) => {
                          const choice = sub.selectedOptions?.[opt.name];
                          if (choice) {
                            const cDef = (opt.choices || []).find((c: ItemOptionChoice) => c.name === choice);
                            if (cDef?.price_modifier) subUnitPrice += cDef.price_modifier;
                          }
                        });
                      }
                      (sub.ingredients || []).forEach((ing: CartItemIngredient) => {
                        if (ing.extra && !ing.removed) subUnitPrice += (ing.base_price || 0);
                      });
                      unitPrice += (subUnitPrice * sub.quantity);
                    });

                    const itemTotal = cartItem.quantity * unitPrice;

                    return (
                      <View key={cartItem.cart_id} style={{ marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: '#334155' }}>{cartItem.quantity}x {cartItem.item.name}</Text>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>{formatCurrency(itemTotal, currency)}</Text>
                        </View>

                        {cartItem.selectedOptions && Object.entries(cartItem.selectedOptions).map(([k, v]) => (
                          <Text key={k} style={{ fontSize: 13, color: '#64748b', marginLeft: 16 }}>+ {k}: {String(v)}</Text>
                        ))}
                        {(cartItem.ingredients || []).filter((i: CartItemIngredient) => i.extra || i.removed).map((ing: CartItemIngredient) => (
                          <Text key={ing.instance_id} style={{ fontSize: 13, color: ing.removed ? '#f87171' : '#64748b', marginLeft: 16, textDecorationLine: ing.removed ? 'line-through' : 'none' }}>
                            {ing.extra ? '+ ' : '- '}{ing.name}
                          </Text>
                        ))}

                        {(cartItem.sub_items || []).map((sub: CartItem) => (
                          <View key={sub.cart_id} style={{ marginTop: 4, marginLeft: 16 }}>
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
                      <Text style={{ fontSize: 14, color: '#334155' }}>{formatCurrency((lastCompletedOrder.subtotal || lastCompletedOrder.total || 0), currency)}</Text>
                    </View>
                    {lastCompletedOrder.discount > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, color: '#ef4444' }}>{t('pos.receipt.discount', language) || 'Descuentos'}</Text>
                        <Text style={{ fontSize: 14, color: '#ef4444' }}>-{formatCurrency(lastCompletedOrder.discount, currency)}</Text>
                      </View>
                    )}
                    {lastCompletedOrder.tax !== undefined && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, color: '#64748b' }}>{t('pos.receipt.tax', language) || 'IVA (15%)'}</Text>
                        <Text style={{ fontSize: 14, color: '#334155' }}>{formatCurrency(lastCompletedOrder.tax, currency)}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 16 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#334155' }}>{t('pos.receipt.total', language)}</Text>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: '#0f172a' }}>{formatCurrency(lastCompletedOrder.total, currency)}</Text>
                  </View>
                </View>

                <View>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{t('pos.receipt.payments', language)}</Text>
                  {(lastCompletedOrder.paymentsCopy || []).map((p: Payment, idx: number) => (
                    <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 14, color: '#64748b', textTransform: 'capitalize' }}>
                        {p.method.replace('_', ' ')} {p.reference_id ? `(${p.reference_id})` : ''}
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#334155' }}>{formatCurrency(p.amount, currency)}</Text>
                    </View>
                  ))}

                  {lastCompletedOrder.change > 0 && (
                    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#16a34a' }}>{t('pos.receipt.change', language)}</Text>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#16a34a' }}>{formatCurrency(lastCompletedOrder.change, currency)}</Text>
                      </View>
                      <View style={{ backgroundColor: '#e0f2fe', padding: 8, borderRadius: 8, marginTop: 4, alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#0369a1' }}>
                          {language === 'es' ? 'Cambio en Córdobas: ' : 'Change in Cordobas: '} 
                          C$ {(currency === 'USD' ? lastCompletedOrder.change * usdExchangeRate : lastCompletedOrder.change).toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                <View style={{ height: 40 }} />
              </ScrollView>

              <View style={{ backgroundColor: '#f1f5f9', padding: 24, borderTopWidth: 1, borderTopColor: '#e2e8f0', gap: 12 }}>
                <TouchableOpacity
                  onPress={() => {
                    const pos = usePosStore.getState();
                    if (!pos.localReceiptPrinterId) {
                      Alert.alert(t('pos.receipt.no_printer', language), t('pos.receipt.no_printer_desc', language));
                    } else {
                      pos.printCustomerReceipt(lastCompletedOrder);
                    }
                  }}
                  style={{ backgroundColor: 'white', paddingVertical: 16, borderRadius: 12, alignItems: 'center', borderWidth: 2, borderColor: tp[200] }}
                >
                  <Text style={{ color: tp[700], fontSize: 18, fontWeight: '800' }}>{t('pos.receipt.print', language)}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setShowReceiptModal(false);
                    setLastCompletedOrder(null);
                    setScreen('home');
                  }}
                  style={{ backgroundColor: tp[600], paddingVertical: 16, borderRadius: 12, alignItems: 'center', shadowColor: tp[600], shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
                >
                  <Text style={{ color: 'white', fontSize: 18, fontWeight: '800' }}>{t('pos.receipt.new_order', language)}</Text>
                </TouchableOpacity>
              </View>

            </View>
          </View>
        </View>
      )}
    </ErrorBoundary>
  );
}

export default function App() {
  const themeColor = usePosStore(s => s.themeColor);

  useEffect(() => {
    checkForUpdates().catch(err => {
      console.error("[UpdateChecker] Error in checkForUpdates on mount:", err);
    });
  }, []);

  return (
    <View style={{ flex: 1 }} className={themeColor === 'rose' ? 'theme-rose' : themeColor === 'amber' ? 'theme-amber' : themeColor === 'indigo' ? 'theme-indigo' : ''}>
      <MainApp />
      <Toast />
    </View>
  );
}
