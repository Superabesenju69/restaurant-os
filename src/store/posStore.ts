import { Alert } from 'react-native';
import { create, type StateCreator } from 'zustand';
import { supabase, setTenantIdHeader } from '../utils/supabase';

// Safe inline subscribeWithSelector middleware (avoids bundling zustand/esm/middleware.mjs
// which contains `import.meta.env` and breaks classic <script defer> tags on Expo Web).
const subscribeWithSelector = <T extends object>(
    fn: StateCreator<T, [], []>
): StateCreator<T, [], []> => (set, get, api) => {
    const origSubscribe = api.subscribe;
    (api as any).subscribe = (selector: any, optListener?: any, options?: any) => {
        if (!optListener) {
            return origSubscribe(selector);
        }
        const equalityFn = options?.equalityFn || Object.is;
        let currentSlice = selector(api.getState());
        const listener = (state: T) => {
            const nextSlice = selector(state);
            if (!equalityFn(currentSlice, nextSlice)) {
                const previousSlice = currentSlice;
                optListener((currentSlice = nextSlice), previousSlice);
            }
        };
        if (options?.fireImmediately) {
            optListener(currentSlice, currentSlice);
        }
        return origSubscribe(listener);
    };
    return fn(set, get, api);
};
import { buildReceiptBuffer, printToNetwork } from '../utils/printerEngine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    checkItemAvailability as checkItemAvailabilityImpl,
    getIngredientMultiplier as getIngredientMultiplierImpl,
    deductInventoryForCartItem as deductInventoryForCartItemImpl,
    refundInventoryForCartItem as refundInventoryForCartItemImpl,
    adjustSingleIngredientStock as adjustSingleIngredientStockImpl,
    canIncrementCartItem,
    canChangeCartItemVariation
} from '../services/inventoryService';
import { printCustomerReceipt as printCustomerReceiptImpl, triggerCashDrawer as triggerCashDrawerImpl } from '../services/printerService';
import { decodeRecipeVariation, resolveCombinationPrice, filterRecipesByVariation } from '../utils/recipeUtils';
import {
    generateUUID,
    isNetworkError,
    saveLocalCache,
    loadLocalCache,
    getNextLocalOrderNumber,
    syncLocalOrderSequence,
    getOfflineQueue,
    enqueueOfflineMutation,
    flushOfflineQueue,
} from '../services/offlineSyncService';
import type {
    ScreenName, OrderType,
    MenuItem, ItemOption, ItemOptionChoice, Recipe,
    Category, ItemCategoryLink,
    FloorTable, TableZone, TableStatus,
    Printer,
    Order, Payment,
    CartItem, CartItemIngredient,
    Promotion, PromotionTarget,
    PosUser,
    CashShift, CashAdjustment,
} from '../types';

// Re-export cart types so existing imports from posStore keep working
export type { CartItem, CartItemIngredient };

export interface PosState {
    screen: ScreenName;
    ordersList: Order[];
    categories: Category[];
    itemCategoryLinks: ItemCategoryLink[];
    items: MenuItem[];
    allIngredients: MenuItem[];
    recipes: Recipe[];
    cart: CartItem[];
    activeCategory: string | null;
    isLoading: boolean;
    isLoadingOrders: boolean;
    inspectingCartItemId: string | null;
    inspectingSubItemId: string | null;

    // Promotions Engine State
    availablePromotions: Promotion[];
    promotionTargets: PromotionTarget[];
    appliedGlobalPromotionIds: string[];

    // Table service & Settings
    tableServiceEnabled: boolean;
    mapBackgroundUrl: string | null;
    themeColor: string;
    themeMode: string;
    language: string;
    currency: string;
    secondaryCurrency: string;
    enableSecondaryCurrency: boolean;
    enableTax: boolean;
    taxRate: number;
    pricesIncludeTax: boolean;
    tables: FloorTable[];
    zones: TableZone[];
    zoneBackgrounds: Record<string, string>;
    printers: Printer[];
    localReceiptPrinterId: string | null;
    receiptTemplate: any;
    attendanceSettings: any;
    activeOrderId: string | null;
    activeOrderType: OrderType;
    activeOrderTable: FloorTable | null;
    activeOrderCustomer: string | null;
    activeOrderNumber: string | null;

    // Tenant
    tenantId: string | null;
    tenantName: string | null;
    tenantSubdomain: string | null;

    // Auth
    currentPosUser: PosUser | null;

    // Cash Drawer Turnos State
    activeCashShift: CashShift | null;
    showCashRegisterModal: boolean;
    usdExchangeRate: number;

    // Offline-First Sync & Cached Station Metadata
    isOnline: boolean;
    pendingSyncCount: number;
    isSyncingOfflineQueue: boolean;
    kitchenStations: any[];
    expediterSettings: {
        expediter_output_mode: string | null;
        expediter_printer_id: string | null;
    };
}

export interface PosActions {
    applyManualPromotion: (promoId: string) => void;
    removeManualPromotion: (promoId: string) => void;
    recalculateCartMath: () => void;

    setLanguage: (lang: string) => void;
    setLocalReceiptPrinterId: (id: string | null) => void;
    setThemeColor: (color: string) => void;

    setTenant: (id: string, name: string, subdomain: string) => Promise<void>;
    clearTenant: () => Promise<void>;

    posLogin: (user: PosUser) => void;
    posLogout: () => void;

    updateTableStatus: (tableId: string, status: TableStatus, reservedBy?: string, reservedAt?: string) => Promise<void>;
    reserveTable: (tableId: string, guestName: string, dateStr: string) => Promise<void>;

    setScreen: (screen: ScreenName) => void;
    setActiveCategory: (catId: string | null) => void;
    setInspectingCartItemId: (cartId: string | null) => void;
    setInspectingSubItemId: (subCartId: string | null) => void;

    fetchMenu: (background?: boolean) => Promise<void>;
    fetchOrders: () => Promise<void>;
    fetchSettings: () => Promise<void>;
    startOrder: (type: OrderType, table?: FloorTable, customerName?: string) => Promise<void>;
    loadOrder: (order: Order) => Promise<void>;
    saveOrder: () => Promise<void>;
    debouncedSaveOrder: () => void;
    syncOfflineQueue: () => Promise<void>;
    setOnlineStatus: (online: boolean) => void;
    updateTicketItemStatus: (itemId: string, status: string) => Promise<void>;
    markExpediterBatchComplete: (batchId: string) => Promise<void>;
    voidOrder: (orderId: string) => Promise<void>;
    addToCart: (item: MenuItem, selectedOptions?: Record<string, string>, extras?: MenuItem[], initialQuantity?: number) => Promise<void>;
    removeFromCart: (cart_id: string) => void;
    clearCart: () => void;
    toggleIngredient: (cart_id: string, ingredient_id: string, sub_cart_id?: string) => void;
    addExtraIngredient: (cart_id: string, ingredient: MenuItem, sub_cart_id?: string) => void;
    removeExtraIngredient: (cart_id: string, ingredient_id: string, sub_cart_id?: string) => void;

    updateCartItemOptions: (cart_id: string, options: Record<string, string>, sub_cart_id?: string) => Promise<{ success: boolean; reason?: string }>;
    incrementCartItemQuantity: (cart_id: string) => Promise<{ success: boolean; reason?: string }>;
    decrementCartItemQuantity: (cart_id: string) => void;
    sendToKitchen: () => Promise<void>;
    checkout: (payments: Payment[]) => Promise<{ order_number: string, table_name: string | null } | null>;
    cancelKitchenTicketsForItem: (itemName: string) => Promise<void>;
    isItemAvailable: (item: MenuItem) => boolean;
    printCustomerReceipt: (orderData: Order) => Promise<{ success: boolean; error?: string }>;
    openCashDrawer: () => Promise<{ success: boolean; error?: string }>;
    setupSubscriptions: () => void;

    // Cash Drawer Turnos Actions
    setShowCashRegisterModal: (show: boolean) => void;
    fetchActiveCashShift: () => Promise<void>;
    openCashShift: (startingCash: number) => Promise<boolean>;
    closeCashShift: (actualCash: number, notes?: string | null) => Promise<boolean>;
    addCashAdjustment: (type: 'cash_in' | 'cash_out', amount: number, reason?: string | null) => Promise<boolean>;
    fetchCashShiftSummary: (shiftId: string) => Promise<{ cashSales: number; adjustmentsIn: number; adjustmentsOut: number } | null>;
    setUsdExchangeRate: (rate: number) => Promise<void>;
}

export type PosStore = PosState & PosActions;

// Guard to prevent concurrent saveOrder calls that cause Hermes OOM during JSON.stringify
let _saveInProgress = false;
let _saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// --- Delegated to inventoryService.ts ---
const checkItemAvailability = checkItemAvailabilityImpl;
const getIngredientMultiplier = getIngredientMultiplierImpl;
const deductInventoryForCartItem = deductInventoryForCartItemImpl;
const refundInventoryForCartItem = refundInventoryForCartItemImpl;
const adjustSingleIngredientStock = adjustSingleIngredientStockImpl;

export const usePosStore = create<PosStore>()(
    subscribeWithSelector((set, get) => ({
    screen: 'home',
    ordersList: [],
    categories: [],
    itemCategoryLinks: [],
    items: [],
    allIngredients: [],
    recipes: [],
    cart: [],
    activeCategory: null,
    isLoading: true,
    isLoadingOrders: false,
    inspectingCartItemId: null,
    inspectingSubItemId: null,

    // Cash Drawer Turnos State
    activeCashShift: null,
    showCashRegisterModal: false,
    setShowCashRegisterModal: (show) => set({ showCashRegisterModal: show }),

    currentPosUser: null,
    usdExchangeRate: 36.00,

    // Offline-First Sync & Cached Station Metadata
    isOnline: true,
    pendingSyncCount: 0,
    isSyncingOfflineQueue: false,
    kitchenStations: [],
    expediterSettings: {
        expediter_output_mode: null,
        expediter_printer_id: null,
    },

    setOnlineStatus: (online: boolean) => {
        const wasOffline = !get().isOnline;
        set({ isOnline: online });
        if (online && wasOffline) {
            get().syncOfflineQueue();
        }
    },

    syncOfflineQueue: async () => {
        const tenantId = get().tenantId;
        if (!tenantId || get().isSyncingOfflineQueue) return;
        const queue = await getOfflineQueue(tenantId);
        set({ pendingSyncCount: queue.length });
        if (queue.length === 0) return;

        set({ isSyncingOfflineQueue: true });
        try {
            const res = await flushOfflineQueue(tenantId);
            set({
                pendingSyncCount: res.remaining,
                isOnline: res.online,
                isSyncingOfflineQueue: false,
            });
            if (res.synced > 0 && res.online) {
                get().fetchOrders();
                get().fetchSettings();
            }
        } catch {
            set({ isSyncingOfflineQueue: false });
        }
    },

    debouncedSaveOrder: () => {
        if (_saveDebounceTimer) {
            clearTimeout(_saveDebounceTimer);
        }
        _saveDebounceTimer = setTimeout(() => {
            _saveDebounceTimer = null;
            get().saveOrder();
        }, 550);
    },

    // Promotions Engine defaults
    availablePromotions: [],
    promotionTargets: [],
    appliedGlobalPromotionIds: [],

    applyManualPromotion: (promoId) => {
        set((state) => ({
            appliedGlobalPromotionIds: [...new Set([...state.appliedGlobalPromotionIds, promoId])]
        }));
        get().recalculateCartMath();
    },

    removeManualPromotion: (promoId) => {
        set((state) => ({
            appliedGlobalPromotionIds: state.appliedGlobalPromotionIds.filter(id => id !== promoId)
        }));
        get().recalculateCartMath();
    },

    recalculateCartMath: () => {
        const state = get();
        let currentCart = [...state.cart];
        if (currentCart.length === 0) return;

        // 1. Calculate Gross Amounts (Before any discount)
        currentCart = currentCart.map(cartItem => {
            let unitPrice = cartItem.item.base_price || 0;

            const selectedTipo = cartItem.selectedOptions?.['Tipo'] || cartItem.selectedOptions?.['tipo'];
            const selectedSize = cartItem.selectedOptions?.['Tamaño'] || cartItem.selectedOptions?.['tamaño'] || cartItem.selectedOptions?.['size'];
            const comboPrice = resolveCombinationPrice(cartItem.item.combination_prices, cartItem.item.base_price, selectedTipo, selectedSize);
            const hasComboPrice = comboPrice !== cartItem.item.base_price;
            if (hasComboPrice) {
                unitPrice = comboPrice;
            }

            if (cartItem.selectedOptions && cartItem.item.options) {
                cartItem.item.options.forEach((opt: any) => {
                    const optLower = (opt.name || '').toLowerCase();
                    if (hasComboPrice && (optLower === 'tipo' || optLower === 'tamaño' || optLower === 'tamano' || optLower === 'size')) {
                        return;
                    }
                    const selectedChoice = cartItem.selectedOptions?.[opt.name];
                    const choiceDef = (opt.choices || []).find((c: any) => (typeof c === 'object' ? c.name : c) === selectedChoice);
                    if (choiceDef && choiceDef.price_modifier) unitPrice += choiceDef.price_modifier;
                });
            }
            (cartItem.ingredients || []).forEach(ing => {
                if (ing.extra && !ing.removed) unitPrice += ing.base_price;
            });
            (cartItem.sub_items || []).forEach(sub => {
                let subUnitPrice = sub.item.base_price || 0;
                const subTipo = sub.selectedOptions?.['Tipo'] || sub.selectedOptions?.['tipo'];
                const subSize = sub.selectedOptions?.['Tamaño'] || sub.selectedOptions?.['tamaño'] || sub.selectedOptions?.['size'];
                const subComboPrice = resolveCombinationPrice(sub.item.combination_prices, sub.item.base_price, subTipo, subSize);
                const hasSubCombo = subComboPrice !== sub.item.base_price;
                if (hasSubCombo) {
                    subUnitPrice = subComboPrice;
                }

                if (sub.selectedOptions && sub.item.options) {
                    sub.item.options.forEach((opt: any) => {
                        const optLower = (opt.name || '').toLowerCase();
                        if (hasSubCombo && (optLower === 'tipo' || optLower === 'tamaño' || optLower === 'tamano' || optLower === 'size')) {
                            return;
                        }
                        const selectedChoice = sub.selectedOptions?.[opt.name];
                        const choiceDef = (opt.choices || []).find((c: any) => (typeof c === 'object' ? c.name : c) === selectedChoice);
                        if (choiceDef && choiceDef.price_modifier) subUnitPrice += choiceDef.price_modifier;
                    });
                }
                (sub.ingredients || []).forEach(ing => {
                    if (ing.extra && !ing.removed) subUnitPrice += ing.base_price;
                });
                unitPrice += (subUnitPrice * sub.quantity);
            });

            return { ...cartItem, grossAmount: unitPrice * cartItem.quantity, discountAmount: 0, appliedPromotionId: null };
        });

        // 2. Identify Applicable Promotions based on Rules & Schedule
        const now = new Date();
        const currentDay = now.getDay(); // 0 is Sunday
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        const validPromos = state.availablePromotions.filter(promo => {
            if (!promo.active) return false;
            
            // Allow manual promos that are explicitly selected
            if (!promo.is_automatic && !state.appliedGlobalPromotionIds.includes(promo.id)) return false;

            // Date limits
            if (promo.start_date && new Date(promo.start_date) > now) return false;
            if (promo.end_date && new Date(promo.end_date) < now) return false;

            // Schedule Rules e.g. Happy Hour
            if (promo.is_automatic && promo.schedule_rules) {
                const rules = typeof promo.schedule_rules === 'string' ? JSON.parse(promo.schedule_rules) : promo.schedule_rules;
                if (rules.days && Array.isArray(rules.days) && !rules.days.includes(currentDay)) return false;
                if (rules.timeStart && currentTime < rules.timeStart) return false;
                if (rules.timeEnd && currentTime > rules.timeEnd) return false;
            }

            // Conditions (Min Order)
            if (promo.conditions) {
                const cond = typeof promo.conditions === 'string' ? JSON.parse(promo.conditions) : promo.conditions;
                if (cond.minOrderAmount) {
                    const totalGross = currentCart.reduce((acc, c) => acc + (c.grossAmount || 0), 0);
                    if (totalGross < cond.minOrderAmount) return false;
                }
            }

            return true;
        });

        // 3. Apply Promotions
        // We evaluate promos by priority descending.
        validPromos.sort((a, b) => (b.priority || 0) - (a.priority || 0));

        let remainingCart = [...currentCart];

        validPromos.forEach(promo => {
            const targets = state.promotionTargets.filter((t: any) => t.promotion_id === promo.id);

            // Function to check if a specific cart item matches a promotion target
            const isTargeted = (cartItem: any) => {
                if (targets.length === 0) return false; // Safety catch
                
                return targets.some((t: any) => {
                    if (t.target_type === 'all') return true;
                    if (t.target_type === 'item') return t.target_id === cartItem.item.id;
                    if (t.target_type === 'category') {
                        // Check if the item belongs to the category via itemCategoryLinks
                        return state.itemCategoryLinks.some((link: any) => link.item_id === cartItem.item.id && link.category_id === t.target_id);
                    }
                    return false;
                });
            };

            // BOGO Rule Execution
            if (promo.type === 'bogo' && promo.bogo_rules) {
                const bogo = typeof promo.bogo_rules === 'string' ? JSON.parse(promo.bogo_rules) : promo.bogo_rules;
                const reqQty = bogo.buyQuantity || 1;
                const freeQty = bogo.getQuantity || 1;
                const bogoDiscountType = bogo.discountType || 'percentage'; // percentage | fixed_amount
                const bogoDiscountVal = parseFloat(bogo.discountValue) || 100;
                const getTargetType = bogo.getTargetType || 'same';
                const getTargetId = bogo.getTargetId || '';

                const isGetTargeted = (cartItem: any) => {
                    if (getTargetType === 'same') return isTargeted(cartItem);
                    if (getTargetType === 'all') return true;
                    if (getTargetType === 'item') return cartItem.item.id === getTargetId;
                    if (getTargetType === 'category') {
                        return state.itemCategoryLinks.some((link: any) => link.item_id === cartItem.item.id && link.category_id === getTargetId);
                    }
                    return false;
                };

                if (getTargetType === 'same') {
                    // Identical-Item BOGO (Buy 2 Pizzas, Get 1 Pizza)
                    for (let i = 0; i < remainingCart.length; i++) {
                        let item = remainingCart[i];
                        if (!item.appliedPromotionId && isTargeted(item) && item.quantity >= (reqQty + freeQty)) {
                            const combinations = Math.floor(item.quantity / (reqQty + freeQty));
                            const itemsToDiscount = combinations * freeQty;
                            
                            const singleUnitPrice = (item.grossAmount || 0) / item.quantity;
                            let discountToApply = 0;
                            
                            if (bogoDiscountType === 'percentage') {
                                discountToApply = (singleUnitPrice * (bogoDiscountVal / 100)) * itemsToDiscount;
                            } else {
                                discountToApply = bogoDiscountVal * itemsToDiscount;
                            }

                            item.discountAmount = (item.discountAmount || 0) + discountToApply;
                            item.appliedPromotionId = promo.id;
                        }
                    }
                } else {
                    // Cross-Item BOGO (Buy 1 Pizza, Get 1 Beer)
                    let totalBuyQty = 0;
                    remainingCart.forEach(item => {
                        // Count how many eligible "buy" triggers there are
                        if (isTargeted(item)) totalBuyQty += item.quantity;
                    });

                    const combinations = Math.floor(totalBuyQty / reqQty);
                    let itemsToDiscountRemaining = combinations * freeQty;

                    if (itemsToDiscountRemaining > 0) {
                        // Find eligible "get" items in the cart
                        const getCartItems = remainingCart.filter(item => 
                            isGetTargeted(item) && (promo.allow_stacking || !item.appliedPromotionId)
                        );

                        // Sort by ascending price to protect the business (apply free/discounted to cheapest valid item first)
                        getCartItems.sort((a,b) => ((a.grossAmount||0)/a.quantity) - ((b.grossAmount||0)/b.quantity));

                        for (let i = 0; i < getCartItems.length && itemsToDiscountRemaining > 0; i++) {
                            let item = getCartItems[i];
                            let qtyToDiscountHere = Math.min(item.quantity, itemsToDiscountRemaining);
                            
                            const singleUnitPrice = (item.grossAmount || 0) / item.quantity;
                            let discountToApply = 0;
                            
                            if (bogoDiscountType === 'percentage') {
                                discountToApply = (singleUnitPrice * (bogoDiscountVal / 100)) * qtyToDiscountHere;
                            } else {
                                discountToApply = bogoDiscountVal * qtyToDiscountHere;
                            }

                            item.discountAmount = (item.discountAmount || 0) + discountToApply;
                            item.appliedPromotionId = promo.id;
                            
                            itemsToDiscountRemaining -= qtyToDiscountHere;
                        }
                    }
                }
            }
            // Simple Percentage or Fixed Amount
            else {
                remainingCart.forEach(item => {
                    if ((promo.allow_stacking || !item.appliedPromotionId) && isTargeted(item)) {
                        let toDiscount = 0;
                        if (promo.type === 'percentage') {
                            toDiscount = (item.grossAmount || 0) * ((promo.discount_value ?? promo.value) / 100);
                        } else if (promo.type === 'fixed_amount') {
                            // Discount is applied to the total line item, or per quantity? 
                            // Usually per item (quantity) or across the board depending on "target: all". 
                            // For safety, we just subtract the fixed amount, capped at the item's gross.
                            // If applied globally (target all), we should distribute the fixed amount across all matching items.
                            // (Distribution logic is complex, for MVP we apply flat if it's per item)
                            toDiscount = (promo.discount_value ?? promo.value) * item.quantity; 
                        }

                        if (toDiscount > (item.grossAmount || 0)) toDiscount = item.grossAmount || 0; // Cap at 100%

                        item.discountAmount = (item.discountAmount || 0) + toDiscount;
                        item.appliedPromotionId = promo.id;
                    }
                });
            }
        });

        set({ cart: remainingCart });
    },

    tableServiceEnabled: false,
    mapBackgroundUrl: null,
    themeColor: 'teal',
    themeMode: 'light',
    language: 'es',
    currency: 'USD',
    secondaryCurrency: 'USD',
    enableSecondaryCurrency: false,
    enableTax: true,
    taxRate: 15,
    pricesIncludeTax: false,
    tables: [],
    zones: [],
    zoneBackgrounds: {},
    printers: [],
    localReceiptPrinterId: null,
    setLocalReceiptPrinterId: (id) => set({ localReceiptPrinterId: id }),
    setThemeColor: (color) => set({ themeColor: color }),
    receiptTemplate: {
        logo_url: '',
        logo_size: 'medium',
        header_lines: [
            "EL GAUCHO STEAKHOUSE",
            "KM 4.5 Carretera Masaya",
            "Managua, Nicaragua",
            "Tel: +505 2278 1234"
        ],
        footer_lines: [
            "¡Gracias por su visita!",
            "Sígannos en Instagram: @elgaucho_ni",
            "Ley de Concertación Tributaria Art. 122"
        ],
        show_server_name: true,
        show_order_timestamp: true,
        show_tax_breakdown: true,
        show_promotion_discounts: true,
        alignment: 'center',
        paper_width: '80mm',
        font_family: 'classic',
        font_size: 'normal',
        header_format: 'bold_uppercase',
        divider_style: 'dashes',
        line_spacing: 'normal'
    },
    setLanguage: async (lang) => {
        await AsyncStorage.setItem('pos_language', lang);
        set({ language: lang });
    },
    attendanceSettings: {
        enable_breaks: true,
        enable_break_deductions: true,
        standard_break_duration: 15,
        standard_lunch_duration: 30
    },
    activeOrderId: null,
    activeOrderType: 'take_out',
    activeOrderTable: null,
    activeOrderCustomer: null,
    activeOrderNumber: null,

    tenantId: null,
    tenantName: null,
    tenantSubdomain: null,
    setTenant: async (id, name, subdomain) => {
        await AsyncStorage.setItem('pos_tenant_id', id);
        await AsyncStorage.setItem('pos_tenant_name', name);
        await AsyncStorage.setItem('pos_tenant_subdomain', subdomain);
        setTenantIdHeader(id);
        set({ tenantId: id, tenantName: name, tenantSubdomain: subdomain });
    },
    clearTenant: async () => {
        await AsyncStorage.removeItem('pos_tenant_id');
        await AsyncStorage.removeItem('pos_tenant_name');
        await AsyncStorage.removeItem('pos_tenant_subdomain');
        setTenantIdHeader('');
        set({
            tenantId: null,
            tenantName: null,
            tenantSubdomain: null,
            currentPosUser: null,
            categories: [],
            items: [],
            allIngredients: [],
            itemCategoryLinks: [],
            tables: [],
            ordersList: [],
            activeOrderId: null,
            cart: []
        });
    },

    posLogin: (user) => {
        set({ currentPosUser: user });
        get().fetchActiveCashShift();
    },
    posLogout: () => set({
        currentPosUser: null,
        screen: 'home',
        cart: [],
        activeOrderId: null,
        activeOrderType: 'take_out',
        activeOrderTable: null,
        activeOrderCustomer: null,
        activeOrderNumber: null,
        inspectingCartItemId: null,
        inspectingSubItemId: null,
        activeCashShift: null
    }),

    setScreen: (screen) => set({ screen }),
    setActiveCategory: (catId) => set({ activeCategory: catId, inspectingCartItemId: null, inspectingSubItemId: null }),
    setInspectingCartItemId: (cartId) => {
        set({ inspectingCartItemId: cartId, inspectingSubItemId: null });
    },
    setInspectingSubItemId: (subCartId) => set({ inspectingSubItemId: subCartId }),
    setUsdExchangeRate: async (rate: number) => {
        set({ usdExchangeRate: rate });
        await AsyncStorage.setItem('pos_usd_exchange_rate', String(rate));
    },

    fetchSettings: async () => {
        const localLang = await AsyncStorage.getItem('pos_language');
        const localRate = await AsyncStorage.getItem('pos_usd_exchange_rate');
        const tenantId = get().tenantId;

        const queue = await getOfflineQueue(tenantId);
        set({ pendingSyncCount: queue.length });

        const applySettingsSnapshot = (
            settings: any,
            tablesData: any[],
            zonesData: any[],
            printers: any[],
            stationsData: any[]
        ) => {
            const cs = settings?.attendance_settings?.currency_settings || settings?.currency_settings;
            const ts = settings?.attendance_settings?.tax_settings || settings?.tax_settings;
            const zoneBg = settings?.attendance_settings?.zone_backgrounds || settings?.zone_backgrounds || {};

            const remoteRate = cs?.exchange_rate ?? settings?.exchange_rate;
            const parsedRate = remoteRate ? Number(remoteRate) : (localRate ? parseFloat(localRate) : 36.80);

            set({
                tableServiceEnabled: settings?.enable_table_service || false,
                mapBackgroundUrl: settings?.map_background_url || null,
                themeColor: settings?.theme_color || 'teal',
                themeMode: settings?.theme_mode || 'light',
                language: localLang || settings?.language || 'es',
                currency: settings?.currency || 'USD',
                secondaryCurrency: cs?.secondary_currency || settings?.secondary_currency || 'USD',
                enableSecondaryCurrency: cs?.enable_secondary_currency ?? settings?.enable_secondary_currency ?? false,
                usdExchangeRate: parsedRate,
                enableTax: ts?.enable_tax ?? settings?.enable_tax ?? true,
                taxRate: ts?.tax_rate ?? settings?.tax_rate ?? 15,
                pricesIncludeTax: ts?.prices_include_tax ?? settings?.prices_include_tax ?? false,
                tables: tablesData || [],
                zones: zonesData || [],
                zoneBackgrounds: zoneBg,
                printers: printers || [],
                kitchenStations: stationsData || [],
                expediterSettings: {
                    expediter_output_mode: settings?.expediter_output_mode || null,
                    expediter_printer_id: settings?.expediter_printer_id || null,
                },
                receiptTemplate: settings?.receipt_template || get().receiptTemplate,
                attendanceSettings: settings?.attendance_settings || get().attendanceSettings,
            });
        };

        try {
            const { data: settingsData, error: settingsErr } = await supabase.from('restaurant_settings').select('*').limit(1);
            if (settingsErr && isNetworkError(settingsErr)) throw settingsErr;

            const settings = settingsData && settingsData.length > 0 ? settingsData[0] : null;
            const { data: tablesData } = await supabase.from('tables').select('*').order('name');
            const { data: zonesData } = await supabase.from('table_zones').select('*').order('display_order');
            const { data: printers } = await supabase.from('printers').select('*').order('name');
            const { data: stationsData } = await supabase.from('kitchen_stations').select('id, name, color, output_mode, printer_id');

            // Also cache POS staff PIN list for offline PIN login
            const { data: usersData } = await supabase
                .from('usuarios')
                .select('id, nombre, apellido, role, pin, active')
                .eq('active', true);
            if (usersData && usersData.length > 0) {
                await saveLocalCache(tenantId, 'pos_users', usersData);
            }

            applySettingsSnapshot(
                settings,
                tablesData || [],
                zonesData || [],
                printers || [],
                stationsData || []
            );
            set({ isOnline: true });

            await saveLocalCache(tenantId, 'settings_catalog', {
                settings,
                tablesData: tablesData || [],
                zonesData: zonesData || [],
                printers: printers || [],
                stationsData: stationsData || [],
            });

            if (queue.length > 0) {
                get().syncOfflineQueue();
            }
        } catch (err) {
            console.warn('[fetchSettings] Offline fallback activated:', err);
            set({ isOnline: false });
            const cached = await loadLocalCache<{
                settings: any;
                tablesData: any[];
                zonesData: any[];
                printers: any[];
                stationsData: any[];
            }>(tenantId, 'settings_catalog');
            if (cached) {
                applySettingsSnapshot(
                    cached.settings,
                    cached.tablesData || [],
                    cached.zonesData || [],
                    cached.printers || [],
                    cached.stationsData || []
                );
            }
        }
    },

    startOrder: async (type, table, customerName) => {
        const state = get();
        const currentUser = state.currentPosUser;
        const tenantId = state.tenantId;
        const clientOrderId = generateUUID();
        const localOrderNum = await getNextLocalOrderNumber(tenantId, state.ordersList);

        let createdOrder: any = null;
        let workedOnline = false;

        if (state.isOnline !== false) {
            try {
                const { data: order, error } = await supabase
                    .from('orders')
                    .insert([{
                        id: clientOrderId,
                        type,
                        table_id: table?.id || null,
                        customer_name: customerName || null,
                        status: 'open',
                        total_amount: 0,
                        user_id: currentUser?.id || null
                    }])
                    .select()
                    .single();

                if (!error && order) {
                    createdOrder = order;
                    workedOnline = true;
                    await syncLocalOrderSequence(tenantId, order.order_number);
                } else if (error && !isNetworkError(error)) {
                    console.error('Failed to create order:', error);
                    return;
                }
            } catch (e) {
                console.warn('[startOrder] Network error, creating order offline:', e);
            }
        }

        if (!createdOrder) {
            createdOrder = {
                id: clientOrderId,
                order_number: localOrderNum,
                type,
                table_id: table?.id || null,
                customer_name: customerName || null,
                status: 'open',
                total_amount: 0,
                user_id: currentUser?.id || null,
                tenant_id: tenantId,
                created_at: new Date().toISOString(),
                order_line_items: [],
                kitchen_tickets: [],
                payments: [],
            };
            const count = await enqueueOfflineMutation(tenantId, {
                type: 'UPSERT_ORDER',
                order: {
                    id: createdOrder.id,
                    type: createdOrder.type,
                    table_id: createdOrder.table_id,
                    customer_name: createdOrder.customer_name,
                    status: 'open',
                    total_amount: 0,
                    user_id: createdOrder.user_id,
                    tenant_id: tenantId,
                },
                lineItems: [],
            });
            set({ isOnline: false, pendingSyncCount: count });
        }

        // If dine-in, mark the table as occupied immediately in local state + DB/Queue
        if (type === 'dine_in' && table) {
            set(prev => ({ tables: prev.tables.map((t: any) => t.id === table.id ? { ...t, status: 'occupied' } : t) }));
            if (workedOnline) {
                try {
                    await supabase.from('tables').update({ status: 'occupied' }).eq('id', table.id);
                } catch {
                    const count = await enqueueOfflineMutation(tenantId, {
                        type: 'UPDATE_TABLE_STATUS',
                        tableId: table.id,
                        status: 'occupied',
                    });
                    set({ pendingSyncCount: count });
                }
            } else {
                const count = await enqueueOfflineMutation(tenantId, {
                    type: 'UPDATE_TABLE_STATUS',
                    tableId: table.id,
                    status: 'occupied',
                });
                set({ pendingSyncCount: count });
            }
        }

        const displayNum = createdOrder.order_number || localOrderNum || createdOrder.id.slice(0, 6).toUpperCase();
        const enrichedNewOrder = {
            ...createdOrder,
            order_number: displayNum,
            table_name: table?.name || null,
            order_line_items: createdOrder.order_line_items || [],
        };
        const updatedOrdersList = [enrichedNewOrder, ...get().ordersList.filter(o => o.id !== createdOrder.id)];
        await saveLocalCache(tenantId, 'orders_list', updatedOrdersList);

        set({
            ordersList: updatedOrdersList,
            activeOrderId: createdOrder.id,
            activeOrderType: type,
            activeOrderTable: table || null,
            activeOrderCustomer: createdOrder.customer_name || null,
            activeOrderNumber: String(displayNum),
            cart: [],
            inspectingCartItemId: null,
            inspectingSubItemId: null,
            screen: 'pos',
        });
    },

    updateTableStatus: async (tableId, status, reservedBy = undefined, reservedAt = undefined) => {
        const tenantId = get().tenantId;
        // Update local state immediately
        set(prev => ({
            tables: prev.tables.map((t: any) =>
                t.id === tableId ? { ...t, status, reserved_by: reservedBy, reserved_at: reservedAt } : t
            )
        }));
        // Update DB or enqueue offline
        try {
            if (get().isOnline === false) {
                const count = await enqueueOfflineMutation(tenantId, {
                    type: 'UPDATE_TABLE_STATUS',
                    tableId,
                    status,
                    reservedBy: reservedBy || null,
                    reservedAt: reservedAt || null,
                });
                set({ pendingSyncCount: count });
                return;
            }
            const { error } = await supabase.from('tables').update({
                status,
                reserved_by: reservedBy,
                reserved_at: reservedAt
            }).eq('id', tableId);
            if (error && isNetworkError(error)) {
                const count = await enqueueOfflineMutation(tenantId, {
                    type: 'UPDATE_TABLE_STATUS',
                    tableId,
                    status,
                    reservedBy: reservedBy || null,
                    reservedAt: reservedAt || null,
                });
                set({ isOnline: false, pendingSyncCount: count });
            }
        } catch (err) {
            if (isNetworkError(err)) {
                const count = await enqueueOfflineMutation(tenantId, {
                    type: 'UPDATE_TABLE_STATUS',
                    tableId,
                    status,
                    reservedBy: reservedBy || null,
                    reservedAt: reservedAt || null,
                });
                set({ isOnline: false, pendingSyncCount: count });
            }
        }
    },

    reserveTable: async (tableId, guestName, dateStr) => {
        await get().updateTableStatus(tableId, 'reserved', guestName, dateStr);
    },

    saveOrder: async () => {
        if (_saveDebounceTimer) {
            clearTimeout(_saveDebounceTimer);
            _saveDebounceTimer = null;
        }
        // Prevent concurrent saves — overlapping JSON.stringify calls can exhaust Hermes heap
        if (_saveInProgress) return;
        _saveInProgress = true;
        try {
            // Re-run tax and promotion mathematics specifically right before saving state to DB
            get().recalculateCartMath();
            
            const { activeOrderId, cart, tenantId, activeOrderType, activeOrderTable, activeOrderCustomer, currentPosUser } = get();
            if (!activeOrderId) { _saveInProgress = false; return; }

            // Helper: strip an item down to only the fields needed for display / logic.
            // This prevents Hermes from OOM-crashing when JSON.stringify is called on
            // large full item objects (which include images, category links, etc.).
            const minimalItem = (item: any) => ({
                id: item?.id ?? '',
                name: item?.name ?? 'Item',
                base_price: item?.base_price ?? 0,
                type: item?.type ?? 'product',
            });

            const minimalIngredient = (ing: CartItemIngredient) => ({
                instance_id: ing.instance_id,
                id: ing.id,
                name: ing.name,
                base_price: ing.base_price,
                recipe_quantity: ing.recipe_quantity,
                removed: ing.removed,
                extra: ing.extra,
            });

            const lineItemsToInsert = cart.map(cartItem => {
                let unitPrice = cartItem.item.base_price;

                const selectedTipo = cartItem.selectedOptions?.['Tipo'] || cartItem.selectedOptions?.['tipo'];
                const selectedSize = cartItem.selectedOptions?.['Tamaño'] || cartItem.selectedOptions?.['tamaño'] || cartItem.selectedOptions?.['size'];
                const comboPrice = resolveCombinationPrice(cartItem.item.combination_prices, cartItem.item.base_price, selectedTipo, selectedSize);
                const hasComboPrice = comboPrice !== cartItem.item.base_price;
                if (hasComboPrice) {
                    unitPrice = comboPrice;
                }

                // Add main item option modifiers
                if (cartItem.selectedOptions && cartItem.item.options) {
                    cartItem.item.options.forEach((opt: any) => {
                        const optLower = (opt.name || '').toLowerCase();
                        if (hasComboPrice && (optLower === 'tipo' || optLower === 'tamaño' || optLower === 'tamano' || optLower === 'size')) {
                            return;
                        }
                        const selectedChoice = cartItem.selectedOptions?.[opt.name];
                        if (selectedChoice) {
                            const choiceDef = (opt.choices || []).find((c: any) => (typeof c === 'object' ? c.name : c) === selectedChoice);
                            if (choiceDef && choiceDef.price_modifier) unitPrice += choiceDef.price_modifier;
                        }
                    });
                }

                // Add main item extra ingredients
                (cartItem.ingredients || []).forEach(ing => {
                    if (ing.extra && !ing.removed) unitPrice += ing.base_price;
                });

                // Add combo sub-items extras & option modifiers
                (cartItem.sub_items || []).forEach(sub => {
                    let subUnitPrice = sub.item.base_price || 0;
                    const subTipo = sub.selectedOptions?.['Tipo'] || sub.selectedOptions?.['tipo'];
                    const subSize = sub.selectedOptions?.['Tamaño'] || sub.selectedOptions?.['tamaño'] || sub.selectedOptions?.['size'];
                    const subComboPrice = resolveCombinationPrice(sub.item.combination_prices, sub.item.base_price, subTipo, subSize);
                    const hasSubCombo = subComboPrice !== sub.item.base_price;
                    if (hasSubCombo) {
                        subUnitPrice = subComboPrice;
                    }

                    if (sub.selectedOptions && sub.item.options) {
                        sub.item.options.forEach((opt: any) => {
                            const optLower = (opt.name || '').toLowerCase();
                            if (hasSubCombo && (optLower === 'tipo' || optLower === 'tamaño' || optLower === 'tamano' || optLower === 'size')) {
                                return;
                            }
                            const selectedChoice = sub.selectedOptions?.[opt.name];
                            if (selectedChoice) {
                                const choiceDef = (opt.choices || []).find((c: any) => (typeof c === 'object' ? c.name : c) === selectedChoice);
                                if (choiceDef && choiceDef.price_modifier) subUnitPrice += choiceDef.price_modifier;
                            }
                        });
                    }

                    (sub.ingredients || []).forEach(ing => {
                        if (ing.extra && !ing.removed) subUnitPrice += ing.base_price;
                    });

                    unitPrice += (subUnitPrice * sub.quantity);
                });

                let itemTotal = unitPrice * cartItem.quantity;

                // Sync the pre-calculated gross/discount from recalculateCartMath if available, otherwise fallback
                let finalGross = cartItem.grossAmount !== undefined ? cartItem.grossAmount : itemTotal;
                let finalDiscount = cartItem.discountAmount || 0;
                let baseImponible = finalGross - finalDiscount;

                return {
                    order_id: activeOrderId,
                    item_id: cartItem.item.id,
                    quantity: cartItem.quantity,
                    subtotal_bruto: finalGross,
                    discount_amount: finalDiscount,
                    base_imponible_iva: baseImponible,
                    promotion_id: cartItem.appliedPromotionId || null,
                    modifications: {
                        sentQuantity: cartItem.sentQuantity,
                        sentAt: cartItem.sentAt,
                        ingredients: (cartItem.ingredients || []).map(minimalIngredient),
                        selectedOptions: cartItem.selectedOptions || {},
                        sub_items: (cartItem.sub_items || []).map(sub => ({
                            cart_id: sub.cart_id,
                            item: minimalItem(sub.item),
                            quantity: sub.quantity,
                            selectedOptions: sub.selectedOptions || {},
                            ingredients: (sub.ingredients || []).map(minimalIngredient),
                        })),
                    }
                };
            });

            // Calculate Order-Level Totals (DGI Nicaragua LCT Art. 122 compliance)
            const subtotalBruto = lineItemsToInsert.reduce((acc, c) => acc + (c.subtotal_bruto || 0), 0);
            const totalDescuentos = lineItemsToInsert.reduce((acc, c) => acc + (c.discount_amount || 0), 0);
            const baseImponibleIva = Math.max(0, subtotalBruto - totalDescuentos);

            const { enableTax, taxRate, pricesIncludeTax } = get();
            let montoIva = 0;
            let totalNeto = baseImponibleIva;

            if (enableTax !== false && !pricesIncludeTax) {
                const effectiveTaxRate = (typeof taxRate === 'number' ? taxRate : 15) / 100;
                montoIva = baseImponibleIva * effectiveTaxRate;
                totalNeto = baseImponibleIva + montoIva;
            } else {
                montoIva = 0;
                totalNeto = baseImponibleIva;
            }

            // Extract unique promotions used in this order
            const appliedPromotions = [...new Set(lineItemsToInsert.map(c => c.promotion_id).filter(Boolean))];

            const orderUpdatePayload = {
                total_amount: totalNeto,
                subtotal_bruto: subtotalBruto,
                total_descuentos: totalDescuentos,
                base_imponible_iva: baseImponibleIva,
                monto_iva: montoIva,
                total_neto: totalNeto,
                applied_promotions: appliedPromotions.length > 0 ? appliedPromotions : null
            };

            // Always keep local ordersList + AsyncStorage cache updated immediately
            const updatedOrdersList = get().ordersList.map((o: any) =>
                o.id === activeOrderId
                    ? { ...o, ...orderUpdatePayload, order_line_items: lineItemsToInsert }
                    : o
            );
            set({ ordersList: updatedOrdersList });
            await saveLocalCache(tenantId, 'orders_list', updatedOrdersList);

            const enqueueOrderSave = async () => {
                const count = await enqueueOfflineMutation(tenantId, {
                    type: 'UPSERT_ORDER',
                    order: {
                        id: activeOrderId,
                        type: activeOrderType,
                        table_id: activeOrderTable?.id || null,
                        customer_name: activeOrderCustomer || null,
                        status: 'open',
                        user_id: currentPosUser?.id || null,
                        tenant_id: tenantId,
                        ...orderUpdatePayload,
                    },
                    lineItems: lineItemsToInsert,
                });
                set({ isOnline: false, pendingSyncCount: count });
            };

            if (get().isOnline === false) {
                await enqueueOrderSave();
                return;
            }

            try {
                // Delete existing lines to replace with current cart state
                const { error: delErr } = await supabase.from('order_line_items').delete().eq('order_id', activeOrderId);
                if (delErr && isNetworkError(delErr)) {
                    await enqueueOrderSave();
                    return;
                }

                if (lineItemsToInsert.length > 0) {
                    const { error: insErr } = await supabase.from('order_line_items').insert(lineItemsToInsert);
                    if (insErr && isNetworkError(insErr)) {
                        await enqueueOrderSave();
                        return;
                    }
                }

                // Update order total and DGI properties
                const { error: updErr } = await supabase.from('orders').update(orderUpdatePayload).eq('id', activeOrderId);
                if (updErr && isNetworkError(updErr)) {
                    await enqueueOrderSave();
                    return;
                }
            } catch (err) {
                if (isNetworkError(err)) {
                    await enqueueOrderSave();
                }
            }
        } finally {
            _saveInProgress = false;
        }
    },

    updateTicketItemStatus: async (itemId: string, newStatus: string) => {
        const now = new Date().toISOString();
        const payload: any = { status: newStatus };
        if (newStatus === 'ready') payload.ready_at = now;
        if (newStatus === 'delivered') payload.delivered_at = now;
        await supabase.from('kitchen_ticket_items').update(payload).eq('id', itemId);
        get().fetchOrders();
    },

    markExpediterBatchComplete: async (batchId: string) => {
        const now = new Date().toISOString();
        // 1. Mark any non-delivered items inside this Expediter Ticket as delivered
        const { data: tickets } = await supabase.from('kitchen_tickets').select('id, is_expediter').eq('batch_id', batchId).eq('is_expediter', true);
        if (tickets && tickets.length > 0) {
            const expTicketId = tickets[0].id;
            const { data: items } = await supabase.from('kitchen_ticket_items').select('id, status').eq('ticket_id', expTicketId);
            if (items) {
                const pending = items.filter((i: any) => i.status !== 'delivered');
                for (const item of pending) {
                    await supabase.from('kitchen_ticket_items').update({ status: 'delivered', delivered_at: now }).eq('id', item.id);
                }
            }
        }
        
        // 2. Archive all tickets in this batch so they disappear from Serving tab
        await supabase.from('kitchen_tickets').update({ status: 'archived' }).eq('batch_id', batchId);
        get().fetchOrders();
    },

    voidOrder: async (orderId: string) => {
        const tenantId = get().tenantId;
        const targetOrder = get().ordersList.find((o: any) => o.id === orderId);
        const updatedList = get().ordersList.map((o: any) =>
            o.id === orderId ? { ...o, status: 'void' } : o
        );
        set({ ordersList: updatedList });
        await saveLocalCache(tenantId, 'orders_list', updatedList);

        try {
            if (get().isOnline === false) {
                const count = await enqueueOfflineMutation(tenantId, {
                    type: 'VOID_ORDER',
                    orderId,
                    tableId: targetOrder?.table_id || null,
                });
                set({ pendingSyncCount: count });
            } else {
                const { error } = await supabase.from('orders').update({ status: 'void' }).eq('id', orderId);
                if (error && isNetworkError(error)) {
                    const count = await enqueueOfflineMutation(tenantId, {
                        type: 'VOID_ORDER',
                        orderId,
                        tableId: targetOrder?.table_id || null,
                    });
                    set({ isOnline: false, pendingSyncCount: count });
                } else {
                    await supabase.from('kitchen_tickets').update({ status: 'archived' }).eq('order_id', orderId);
                }
            }
        } catch (err) {
            if (isNetworkError(err)) {
                const count = await enqueueOfflineMutation(tenantId, {
                    type: 'VOID_ORDER',
                    orderId,
                    tableId: targetOrder?.table_id || null,
                });
                set({ isOnline: false, pendingSyncCount: count });
            }
        }

        const currentActiveId = get().activeOrderId;
        if (currentActiveId === orderId) {
            get().clearCart();
            get().setScreen('home');
        } else if (get().isOnline) {
            get().fetchOrders();
        }
    },

    loadOrder: async (order) => {
        // Load existing open order back into the cart (with offline fallback to order.order_line_items)
        let lines: any[] | null = null;
        if (get().isOnline !== false) {
            try {
                const { data, error } = await supabase
                    .from('order_line_items')
                    .select('*')
                    .eq('order_id', order.id);
                if (!error && data) {
                    lines = data;
                }
            } catch {
                // Fall back to cached order_line_items below
            }
        }
        if (!lines || lines.length === 0) {
            lines = (order as any).order_line_items || [];
        }

        const allStoreItems = [...get().items, ...get().allIngredients];

        const cartItems: CartItem[] = (lines || []).map((line: Record<string, unknown>, idx: number) => {
            const mods = (line.modifications || {}) as Record<string, unknown>;
            const found = allStoreItems.find(i => i.id === line.item_id);
            const slimItem: MenuItem = found
                ? { id: found.id, name: found.name, base_price: found.base_price, type: found.type, track_inventory: found.track_inventory, options: found.options, combination_prices: found.combination_prices }
                : { id: line.item_id as string, name: 'Item', base_price: 0, type: 'product' };
            return {
                cart_id: (line.id as string) || `cached_${idx}_${Date.now()}`,
                item: slimItem,
                quantity: line.quantity as number,
                sentQuantity: (mods.sentQuantity as number) ?? 0,
                sentAt: (mods.sentAt as number) ?? null,
                selectedOptions: (mods.selectedOptions as Record<string, string>) || {},
                ingredients: Array.isArray(mods.ingredients) ? mods.ingredients : [],
                sub_items: Array.isArray(mods.sub_items) ? mods.sub_items : [],
            };
        });

        // Fix: restore the table reference for dine-in orders so the header shows correctly
        const restoredTable = order.table_id
            ? (get().tables.find(t => t.id === order.table_id) || null)
            : null;

        set({
            activeOrderId: order.id,
            activeOrderType: order.type || 'take_out',
            activeOrderTable: restoredTable,
            activeOrderCustomer: order.customer_name || null,
            activeOrderNumber: order.order_number || order.id.slice(0, 6).toUpperCase(),
            cart: cartItems,
            inspectingCartItemId: null,
            inspectingSubItemId: null,
            screen: 'pos',
        });
    },
    setupSubscriptions: () => {
        const handleDbChange = (payload: any) => {
            console.log('Realtime update received:', payload);
            get().fetchMenu(true);
        };

        const handleSettingsChange = (payload: any) => {
            console.log('Settings update received:', payload);
            get().fetchSettings();
        };

        const handleKitchenTicketChange = async (payload: any) => {
            // Always refresh orders so the serving screen updates in real-time
            // regardless of which status transition happened
            get().fetchOrders();

            // Show toast when ALL tickets for an order become finished
            if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
                const newStatus = payload.new?.status;
                if (newStatus === 'done' || newStatus === 'archived') {
                    const { data: siblings } = await supabase
                        .from('kitchen_tickets')
                        .select('status')
                        .eq('order_id', payload.new.order_id);

                    if (siblings && siblings.length > 0) {
                        const allFinished = siblings.every((t: any) => t.status === 'done' || t.status === 'archived');
                        if (allFinished) {
                            import('react-native-toast-message').then(m => {
                                m.default.show({
                                    type: 'success',
                                    text1: `🔔 Order #${payload.new.order_number || 'Unknown'} is Ready!`,
                                    text2: `Table: ${payload.new.table_name || 'Take Out'}`,
                                    position: 'top',
                                    visibilityTime: 6000,
                                    topOffset: 60,
                                });
                            });
                        }
                    }
                }
            }
        };

        const tenantId = get().tenantId;
        if (!tenantId) return;
        const filterStr = `tenant_id=eq.${tenantId}`;

        const channel = supabase.channel('pos-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: filterStr }, handleDbChange)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: filterStr }, handleDbChange)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'item_categories', filter: filterStr }, handleDbChange)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes', filter: filterStr }, handleDbChange)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_settings', filter: filterStr }, handleSettingsChange)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'kitchen_tickets', filter: filterStr }, handleKitchenTicketChange)
            .subscribe();

        // Optional: you could return a cleanup function, but for a global store, leaving it alive is usually fine.
    },

    fetchMenu: async (background = false) => {
        if (!background) {
            set({ isLoading: true });
        }
        const tenantId = get().tenantId;

        const processItems = (rawList: any[] | null | undefined): MenuItem[] => (rawList || []).map((i: any) => {
            const comboOption = (i.options || []).find((o: any) => o.name === '__combination_prices');
            return {
                ...i,
                combination_prices: i.combination_prices || comboOption?.prices || null,
                options: (i.options || []).filter((o: any) => o.name !== '__combination_prices')
            };
        });

        const processRecipes = (rawList: any[] | null | undefined): Recipe[] => (rawList || []).map((r: any) => {
            const dec = decodeRecipeVariation(r);
            return {
                parent_item_id: r.parent_item_id,
                child_item_id: r.child_item_id,
                quantity: r.quantity,
                type_name: dec.type_name,
                size_name: dec.size_name
            };
        });

        try {
            const { data: catData, error: catErr } = await supabase.from('categories').select('*').eq('type', 'menu').order('display_order');
            if (catErr && isNetworkError(catErr)) throw catErr;

            const { data: linkData } = await supabase.from('item_categories').select('*');
            const { data: itemData } = await supabase.from('items').select('id,name,type,base_price,track_inventory,stock_level,station_id,image_url,tags,options').in('type', ['product', 'combo']).order('name');
            const { data: ingredientData } = await supabase.from('items').select('id,name,type,base_price,track_inventory,stock_level,station_id,image_url,tags,options').eq('type', 'ingredient').order('name');
            const { data: recipeData } = await supabase.from('recipes').select('parent_item_id, child_item_id, quantity, size_name');
            
            // Fetch active promotions
            const { data: promos } = await supabase.from('promotions').select('*').eq('active', true).order('priority', { ascending: false });
            const { data: targets } = await supabase.from('promotion_targets').select('*');

            await saveLocalCache(tenantId, 'menu_catalog', {
                catData: catData || [],
                linkData: linkData || [],
                itemData: itemData || [],
                ingredientData: ingredientData || [],
                recipeData: recipeData || [],
                promos: promos || [],
                targets: targets || [],
            });

            set({
                categories: catData || [],
                itemCategoryLinks: linkData || [],
                items: processItems(itemData),
                allIngredients: processItems(ingredientData),
                recipes: processRecipes(recipeData),
                availablePromotions: promos || [],
                promotionTargets: targets || [],
                isOnline: true,
                isLoading: false
            });

            // Trigger discount calculations for items currently in the cart
            get().recalculateCartMath();
        } catch (e) {
            console.warn('[fetchMenu] Offline fallback activated:', e);
            set({ isOnline: false });
            const cached = await loadLocalCache<{
                catData: any[];
                linkData: any[];
                itemData: any[];
                ingredientData: any[];
                recipeData: any[];
                promos: any[];
                targets: any[];
            }>(tenantId, 'menu_catalog');
            if (cached) {
                set({
                    categories: cached.catData || [],
                    itemCategoryLinks: cached.linkData || [],
                    items: processItems(cached.itemData),
                    allIngredients: processItems(cached.ingredientData),
                    recipes: processRecipes(cached.recipeData),
                    availablePromotions: cached.promos || [],
                    promotionTargets: cached.targets || [],
                    isLoading: false
                });
                get().recalculateCartMath();
            } else {
                set({ isLoading: false });
            }
        }
    },

    printCustomerReceipt: async (orderData: any) => {
        const localId = get().localReceiptPrinterId;
        if (!localId) return { success: false, error: 'NO_PRINTER_SELECTED' };

        const printer = get().printers.find(p => p.id === localId);
        if (!printer || !printer.ip_address) return { success: false, error: 'NO_IP' };

        const enriched = {
            ...orderData,
            server_name: get().currentPosUser?.full_name || 'POS STAFF'
        };

        return printCustomerReceiptImpl(enriched, printer, get().receiptTemplate);
    },

    openCashDrawer: async () => {
        const localId = get().localReceiptPrinterId;
        if (!localId) return { success: false, error: 'NO_PRINTER_SELECTED' };

        const printer = get().printers.find(p => p.id === localId);
        if (!printer || !printer.ip_address) return { success: false, error: 'NO_IP' };

        return triggerCashDrawerImpl(printer);
    },

    fetchOrders: async () => {
        set({ isLoadingOrders: true });
        const tenantId = get().tenantId;
        try {
            const { data: ordersData, error } = await supabase
                .from('orders')
                .select('*, payments(*), order_line_items(*), kitchen_tickets(*, kitchen_ticket_items(*))')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) {
                if (isNetworkError(error)) throw error;
                console.error('[fetchOrders] orders query error:', error);
                set({ isLoadingOrders: false });
                return;
            }

            // Enrich each order with the table name from local state for display in order cards
            const localTables = get().tables;
            const enriched = (ordersData || []).map((order: any) => {
                const table = order.table_id
                    ? localTables.find((t: any) => t.id === order.table_id)
                    : null;
                return { ...order, table_name: table?.name || null };
            });

            if (enriched.length > 0) {
                await syncLocalOrderSequence(tenantId, enriched[0]?.order_number);
            }
            await saveLocalCache(tenantId, 'orders_list', enriched);

            set({ ordersList: enriched, isOnline: true, isLoadingOrders: false });
        } catch (e) {
            console.warn('[fetchOrders] Offline fallback activated:', e);
            set({ isOnline: false });
            const cachedOrders = await loadLocalCache<Order[]>(tenantId, 'orders_list');
            if (cachedOrders && cachedOrders.length > 0 && get().ordersList.length === 0) {
                set({ ordersList: cachedOrders, isLoadingOrders: false });
            } else {
                set({ isLoadingOrders: false });
            }
        }
    },


    addToCart: async (product, selectedOptions = {}, extras = [], initialQuantity = 1) => {
        const { recipes: memoryRecipes, items: memoryItems, allIngredients: memoryIngredients } = get();
        const pool = [...memoryItems, ...memoryIngredients];

        const resolveRecipesForParent = async (parentId: string) => {
            if (memoryRecipes.length > 0) {
                return memoryRecipes
                    .filter(r => r.parent_item_id === parentId)
                    .map(r => ({
                        ...r,
                        child_item: r.child_item || pool.find(i => i.id === r.child_item_id),
                    }))
                    .filter(r => Boolean(r.child_item));
            }
            const { data } = await supabase
                .from('recipes')
                .select('*, child_item:items!child_item_id(*)')
                .eq('parent_item_id', parentId);
            return data || [];
        };

        const recipeData = await resolveRecipesForParent(product.id);

        const tipoKey = Object.keys(selectedOptions).find(k => 
            k.toLowerCase() === 'tipo' || 
            k.toLowerCase().includes('tipo')
        );
        const selectedTipo = tipoKey ? selectedOptions[tipoKey] : null;

        const sizeKey = Object.keys(selectedOptions).find(k => 
            k.toLowerCase().includes('size') || 
            k.toLowerCase().includes('tamaño') || 
            k.toLowerCase().includes('tamano') || 
            k.toLowerCase().includes('porcion') || 
            k.toLowerCase().includes('porción')
        );
        let selectedSize = sizeKey ? selectedOptions[sizeKey] : null;

        const filteredRecipeData = filterRecipesByVariation(recipeData || [], selectedTipo, selectedSize);

        // Keep only the fields React Native / Hermes needs to display and calculate.
        // Storing full Supabase row objects causes JSON.stringify to OOM-crash in Hermes.
        const slimProduct: MenuItem = { 
            id: product.id, 
            name: product.name, 
            base_price: product.base_price, 
            type: product.type, 
            track_inventory: product.track_inventory,
            options: product.options, 
            combination_prices: product.combination_prices 
        };

        let sub_items: CartItem[] = [];
        let ingredients: CartItemIngredient[] = [];

        if (product.type === 'combo') {
            for (const r of filteredRecipeData) {
                const subProduct = r.child_item;
                if (!subProduct) continue;
                const slimSubProduct: MenuItem = { 
                    id: subProduct.id, 
                    name: subProduct.name, 
                    base_price: subProduct.base_price, 
                    type: subProduct.type, 
                    track_inventory: subProduct.track_inventory,
                    options: subProduct.options, 
                    combination_prices: subProduct.combination_prices 
                };

                const subRecipeData = await resolveRecipesForParent(subProduct.id);

                const filteredSubRecipeData = filterRecipesByVariation(subRecipeData || [], selectedTipo, selectedSize);

                const subIngredients: CartItemIngredient[] = filteredSubRecipeData
                    .filter((sr: any) => Boolean(sr.child_item))
                    .map((sr: any) => ({
                        instance_id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
                        id: sr.child_item.id,
                        name: sr.child_item.name,
                        base_price: sr.child_item.base_price,
                        recipe_quantity: sr.quantity,
                        removed: false,
                        extra: false
                    })) || [];

                const defaultSubOptions: Record<string, string> = {};
                (subProduct.options || []).forEach((opt: any) => {
                    if (!opt.hide_in_combo && opt.choices && opt.choices.length > 0) {
                        const first = opt.choices[0];
                        defaultSubOptions[opt.name] = typeof first === 'object' ? first.name : first;
                    }
                });

                sub_items.push({
                    cart_id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
                    item: slimSubProduct,
                    quantity: r.quantity,
                    ingredients: subIngredients,
                    selectedOptions: defaultSubOptions
                });
            }
        } else {
            ingredients = filteredRecipeData
                .filter((r: any) => Boolean(r.child_item))
                .map((r: any) => ({
                    instance_id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
                    id: r.child_item.id,
                    name: r.child_item.name,
                    base_price: r.child_item.base_price,
                    recipe_quantity: r.quantity,
                    removed: false,
                    extra: false
                })) || [];
        }

        // Add user-selected extras to the ingredients array
        if (extras.length > 0) {
            const parsedExtras: CartItemIngredient[] = extras.map(ext => ({
                instance_id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
                id: ext.id,
                name: ext.name,
                base_price: ext.base_price,
                recipe_quantity: 1,
                removed: false,
                extra: true
            }));
            ingredients = [...ingredients, ...parsedExtras];
        }

        const qtyToAdd = Math.max(1, initialQuantity);

        const newCartItem: CartItem = {
            cart_id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
            item: slimProduct,
            quantity: qtyToAdd,
            ingredients,
            sub_items,
            selectedOptions
        };

        set(state => ({
            cart: [...state.cart, newCartItem],
            inspectingCartItemId: newCartItem.cart_id,
            inspectingSubItemId: null
        }));

        get().recalculateCartMath();
        get().debouncedSaveOrder();

        // REAL-TIME: Deduct inventory immediately
        await deductInventoryForCartItem(newCartItem, qtyToAdd, get, set);
    },

    removeFromCart: async (cart_id) => {
        const { cart, activeOrderId } = get();
        const item = cart.find((c: CartItem) => c.cart_id === cart_id);
        // Remove from local state first
        set(state => ({
            cart: state.cart.filter(c => c.cart_id !== cart_id),
            inspectingCartItemId: state.inspectingCartItemId === cart_id ? null : state.inspectingCartItemId,
            inspectingSubItemId: state.inspectingCartItemId === cart_id ? null : state.inspectingSubItemId
        }));
        // Cancel any pending KDS tickets for this item
        if (item && (item.sentQuantity ?? 0) > 0 && activeOrderId && get().isOnline !== false) {
            await get().cancelKitchenTicketsForItem(item.item.name);
        }

        // REAL-TIME: Refund inventory immediately
        if (item) {
            await refundInventoryForCartItem(item, item.quantity, get, set);
        }

        get().recalculateCartMath();
        get().debouncedSaveOrder();
    },

    cancelKitchenTicketsForItem: async (itemName: string) => {
        const { activeOrderId } = get();
        if (!activeOrderId) return;
        // Find pending tickets for this order
        const { data: tickets } = await supabase
            .from('kitchen_tickets')
            .select('id')
            .eq('order_id', activeOrderId)
            .eq('status', 'pending');
        if (!tickets || tickets.length === 0) return;
        const ticketIds = tickets.map((t: any) => t.id);
        // Delete ticket_items that match the removed item name
        const { data: matchingItems } = await supabase
            .from('kitchen_ticket_items')
            .select('id, ticket_id')
            .in('ticket_id', ticketIds)
            .eq('item_name', itemName);
        if (!matchingItems || matchingItems.length === 0) return;
        const matchedIds = matchingItems.map((m: any) => m.id);
        await supabase.from('kitchen_ticket_items').delete().in('id', matchedIds);
        // Delete parent tickets that now have zero items
        const affectedTicketIds = [...new Set(matchingItems.map((m: any) => m.ticket_id))] as string[];
        for (const tid of affectedTicketIds) {
            const { count } = await supabase
                .from('kitchen_ticket_items')
                .select('id', { count: 'exact', head: true })
                .eq('ticket_id', tid);
            if (count === 0) {
                await supabase.from('kitchen_tickets').delete().eq('id', tid);
            }
        }
    },

    isItemAvailable: (item: any) => {
        const { items, allIngredients, recipes } = get();
        return checkItemAvailability(item, items, allIngredients, recipes);
    },

    clearCart: async () => {
        // REAL-TIME: Refund all cart items before clearing
        const { cart } = get();
        for (const cartItem of cart) {
            await refundInventoryForCartItem(cartItem, cartItem.quantity, get, set);
        }
        set({ cart: [], inspectingCartItemId: null, inspectingSubItemId: null });
    },

    toggleIngredient: async (cart_id, ingredient_id, sub_cart_id) => {
        // Find the ingredient BEFORE toggling to know if we're removing or un-removing
        const cartItem = get().cart.find(c => c.cart_id === cart_id);
        let ing: CartItemIngredient | undefined;
        if (sub_cart_id && cartItem?.sub_items) {
            const sub = cartItem.sub_items.find(s => s.cart_id === sub_cart_id);
            ing = sub?.ingredients.find(i => i.id === ingredient_id);
        } else {
            ing = cartItem?.ingredients.find(i => i.id === ingredient_id);
        }

        const wasRemoved = ing?.removed ?? false;
        const qty = (ing?.extra ? 1 : (ing?.recipe_quantity ?? 1)) * (cartItem?.quantity ?? 1);

        set(state => ({
            cart: state.cart.map(ci => {
                if (ci.cart_id === cart_id) {
                    if (sub_cart_id && ci.sub_items) {
                        return {
                            ...ci,
                            sub_items: ci.sub_items.map(sub => {
                                if (sub.cart_id === sub_cart_id) {
                                    return {
                                        ...sub,
                                        ingredients: (sub.ingredients || []).map(i =>
                                            i.id === ingredient_id ? { ...i, removed: !i.removed } : i
                                        )
                                    }
                                }
                                return sub;
                            })
                        }
                    } else {
                        return {
                            ...ci,
                            ingredients: (ci.ingredients || []).map(i =>
                                i.id === ingredient_id ? { ...i, removed: !i.removed } : i
                            ),
                            selectedOptions: ci.selectedOptions || {}
                        }
                    }
                }
                return ci;
            })
        }));
        get().recalculateCartMath();
        get().debouncedSaveOrder();

        // REAL-TIME: if was NOT removed and now IS removed → refund stock
        // if was removed and now is NOT removed → deduct stock
        if (ing) {
            if (wasRemoved) {
                // Un-removing → deduct again
                await adjustSingleIngredientStock(ingredient_id, qty, 1, set, get);
            } else {
                // Removing → refund
                await adjustSingleIngredientStock(ingredient_id, qty, -1, set, get);
            }
        }
    },

    addExtraIngredient: async (cart_id, ingredient, sub_cart_id) => {
        const cartItem = get().cart.find(c => c.cart_id === cart_id);
        set(state => ({
            cart: state.cart.map(ci => {
                if (ci.cart_id === cart_id) {
                    if (sub_cart_id && ci.sub_items) {
                        return {
                            ...ci,
                            sub_items: ci.sub_items.map(sub => {
                                if (sub.cart_id === sub_cart_id) {
                                    return {
                                        ...sub,
                                        ingredients: [...(sub.ingredients || []), {
                                            instance_id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
                                            id: ingredient.id,
                                            name: ingredient.name,
                                            base_price: ingredient.base_price,
                                            recipe_quantity: 1,
                                            removed: false,
                                            extra: true
                                        }]
                                    }
                                }
                                return sub;
                            })
                        }
                    } else {
                        return {
                            ...ci,
                            ingredients: [...(ci.ingredients || []), {
                                instance_id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
                                id: ingredient.id,
                                name: ingredient.name,
                                base_price: ingredient.base_price,
                                recipe_quantity: 1,
                                removed: false,
                                extra: true
                            }]
                        }
                    }
                }
                return ci;
            })
        }));
        get().recalculateCartMath();
        get().debouncedSaveOrder();

        // REAL-TIME: Deduct 1 unit of the extra ingredient
        await adjustSingleIngredientStock(ingredient.id, cartItem?.quantity ?? 1, 1, set, get);
    },

    removeExtraIngredient: async (cart_id, ingredient_id, sub_cart_id) => {
        const cartItem = get().cart.find(c => c.cart_id === cart_id);
        set(state => ({
            cart: state.cart.map(ci => {
                if (ci.cart_id === cart_id) {
                    if (sub_cart_id && ci.sub_items) {
                        return {
                            ...ci,
                            sub_items: ci.sub_items.map(sub => {
                                if (sub.cart_id === sub_cart_id) {
                                    const reversedIdx = [...(sub.ingredients || [])].reverse().findIndex(i => i.id === ingredient_id && i.extra);
                                    if (reversedIdx !== -1) {
                                        const actualIdx = (sub.ingredients || []).length - 1 - reversedIdx;
                                        const newIngredients = [...(sub.ingredients || [])];
                                        newIngredients.splice(actualIdx, 1);
                                        return { ...sub, ingredients: newIngredients };
                                    }
                                }
                                return sub;
                            })
                        }
                    } else {
                        const reversedIdx = [...(ci.ingredients || [])].reverse().findIndex(i => i.id === ingredient_id && i.extra);
                        if (reversedIdx !== -1) {
                            const actualIdx = (ci.ingredients || []).length - 1 - reversedIdx;
                            const newIngredients = [...(ci.ingredients || [])];
                            newIngredients.splice(actualIdx, 1);
                            return { ...ci, ingredients: newIngredients };
                        }
                    }
                }
                return ci;
            })
        }));
        get().recalculateCartMath();
        get().debouncedSaveOrder();

        // REAL-TIME: Refund 1 unit of the extra ingredient
        await adjustSingleIngredientStock(ingredient_id, cartItem?.quantity ?? 1, -1, set, get);
    },

    updateCartItemOptions: async (cart_id, options, sub_cart_id) => {
        const state = get();
        const oldCi = state.cart.find(c => c.cart_id === cart_id);
        if (!oldCi) return { success: false, reason: 'Item not found in cart' };

        let newCi = JSON.parse(JSON.stringify(oldCi));

        const getNewIngredients = (item_id: string, selectedTipo: string | null, selectedSize: string | null, oldIngredients: any[]) => {
            const subRecipes = state.recipes.filter((r: any) => r.parent_item_id === item_id);
            const filteredSubRecipes = filterRecipesByVariation(subRecipes, selectedTipo, selectedSize);

            const newIngredients = filteredSubRecipes.map((r: any) => {
                const child = state.allIngredients.find(i => i.id === r.child_item_id) || state.items.find(i => i.id === r.child_item_id);
                return {
                    instance_id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
                    id: r.child_item_id,
                    name: child ? child.name : 'Unknown',
                    base_price: child ? child.base_price : 0,
                    recipe_quantity: r.quantity,
                    removed: false,
                    extra: false
                };
            });

            const oldExtras = oldIngredients?.filter(i => i.extra) || [];
            const oldRemovedIds = oldIngredients?.filter(i => i.removed).map(i => i.id) || [];
            
            newIngredients.push(...oldExtras);
            newIngredients.forEach((i: any) => {
                if (oldRemovedIds.includes(i.id)) i.removed = true;
            });

            return newIngredients;
        };

        if (sub_cart_id && newCi.sub_items) {
            newCi.sub_items = newCi.sub_items.map((sub: any) => {
                if (sub.cart_id === sub_cart_id) {
                    const subTipoKey = Object.keys(options).find(k => 
                        k.toLowerCase() === 'tipo' || 
                        k.toLowerCase().includes('tipo')
                    );
                    const subTipo = subTipoKey ? options[subTipoKey] : null;

                    const subSizeKey = Object.keys(options).find(k => 
                        k.toLowerCase().includes('size') || 
                        k.toLowerCase().includes('tamaño') || 
                        k.toLowerCase().includes('tamano') || 
                        k.toLowerCase().includes('porcion') || 
                        k.toLowerCase().includes('porción')
                    );
                    const subSize = subSizeKey ? options[subSizeKey] : null;

                    sub.selectedOptions = options;
                    sub.ingredients = getNewIngredients(sub.item.id, subTipo, subSize, sub.ingredients);
                }
                return sub;
            });
        } else {
            newCi.selectedOptions = options;
            const tipoKey = Object.keys(options).find(k => 
                k.toLowerCase() === 'tipo' || 
                k.toLowerCase().includes('tipo')
            );
            const selectedTipo = tipoKey ? options[tipoKey] : null;

            const sizeKey = Object.keys(options).find(k => 
                k.toLowerCase().includes('size') || 
                k.toLowerCase().includes('tamaño') || 
                k.toLowerCase().includes('tamano') || 
                k.toLowerCase().includes('porcion') || 
                k.toLowerCase().includes('porción')
            );
            const selectedSize = sizeKey ? options[sizeKey] : null;

            if (newCi.item.type === 'combo') {
                newCi.sub_items = newCi.sub_items?.map((sub: any) => {
                    sub.ingredients = getNewIngredients(sub.item.id, selectedTipo, selectedSize, sub.ingredients);
                    return sub;
                });
            } else {
                newCi.ingredients = getNewIngredients(newCi.item.id, selectedTipo, selectedSize, newCi.ingredients);
            }
        }

        // VALIDATE STOCK BEFORE APPLYING VARIATION CHANGE
        const check = canChangeCartItemVariation(oldCi, newCi, state.allIngredients, state.items);
        if (!check.canChange) {
            Alert.alert('Stock insuficiente', check.reason || 'No hay ingredientes suficientes para este cambio.');
            return { success: false, reason: check.reason };
        }

        set(s => ({
            cart: s.cart.map(c => c.cart_id === cart_id ? newCi : c)
        }));

        get().recalculateCartMath();

        await refundInventoryForCartItem(oldCi, oldCi.quantity, get, set);
        await deductInventoryForCartItem(newCi, newCi.quantity, get, set);
        get().debouncedSaveOrder();

        return { success: true };
    },

    incrementCartItemQuantity: async (cart_id) => {
        const state = get();
        const cartItem = state.cart.find((c: CartItem) => c.cart_id === cart_id);
        if (!cartItem) return { success: false, reason: 'Item not found in cart' };

        const check = canIncrementCartItem(cartItem, state.allIngredients, state.items, 1);
        if (!check.canIncrement) {
            Alert.alert('Stock insuficiente', check.reason || 'No hay ingredientes suficientes para aumentar la cantidad.');
            return { success: false, reason: check.reason };
        }

        set(s => ({
            cart: s.cart.map((c: CartItem) =>
                c.cart_id === cart_id ? { ...c, quantity: c.quantity + 1 } : c
            )
        }));
        get().recalculateCartMath();
        get().debouncedSaveOrder();

        // REAL-TIME: Deduct 1 more unit worth of ingredients
        await deductInventoryForCartItem(cartItem, 1, get, set);
        return { success: true };
    },

    decrementCartItemQuantity: async (cart_id) => {
        const cartItem = get().cart.find((c: CartItem) => c.cart_id === cart_id);

        set(state => ({
            cart: state.cart
                .map((c: CartItem) =>
                    c.cart_id === cart_id ? { ...c, quantity: c.quantity - 1 } : c
                )
                .filter((c: CartItem) => c.quantity > 0),
            inspectingCartItemId: state.cart.find(
                (c: CartItem) => c.cart_id === cart_id && c.quantity <= 1
            ) ? null : state.inspectingCartItemId,
        }));
        get().recalculateCartMath();
        get().debouncedSaveOrder();

        // REAL-TIME: Refund 1 unit worth of ingredients
        if (cartItem) {
            await refundInventoryForCartItem(cartItem, 1, get, set);
        }
    },

    sendToKitchen: async () => {
        const {
            cart,
            activeOrderId,
            activeOrderType,
            activeOrderTable,
            activeOrderNumber,
            tenantId,
            items: memoryItems,
            kitchenStations: memoryStations,
            expediterSettings,
        } = get();
        // Items with unsent delta: quantity > sentQuantity (or sentQuantity undefined)
        const itemsWithDelta = cart.filter((c: CartItem) => {
            const sent = c.sentQuantity ?? 0;
            return sent < c.quantity;
        });
        if (!activeOrderId || itemsWithDelta.length === 0) return;

        // Flush any pending cart state before sending to kitchen
        await get().saveOrder();

        // Resolve Expediter printer settings from cached state (or Supabase fallback if online)
        let settings: any = expediterSettings;
        if (
            get().isOnline !== false &&
            !settings?.expediter_output_mode &&
            !settings?.expediter_printer_id
        ) {
            try {
                const { data } = await supabase
                    .from('restaurant_settings')
                    .select('expediter_output_mode, expediter_printer_id')
                    .single();
                if (data) settings = data;
            } catch {
                // Use cached expediterSettings
            }
        }

        // Group by station using cached memoryItems first so zero network wait is needed
        const stationGroups: Record<string, { stationId: string | null; items: { cartItem: CartItem; delta: number }[] }> = {};
        for (const cartItem of itemsWithDelta as CartItem[]) {
            const meta = memoryItems.find((i: any) => i.id === cartItem.item.id) || cartItem.item;
            const key = (meta as any)?.station_id || 'none';
            if (!stationGroups[key]) stationGroups[key] = { stationId: (meta as any)?.station_id || null, items: [] };
            const delta = cartItem.quantity - (cartItem.sentQuantity ?? 0);
            stationGroups[key].items.push({ cartItem, delta });
        }

        // Resolve station rows from cached kitchenStations (with online fallback)
        let stationRows: any[] = memoryStations || [];
        const uniqueIds = Object.values(stationGroups).map(g => g.stationId).filter(Boolean) as string[];
        if (uniqueIds.length > 0 && stationRows.length === 0 && get().isOnline !== false) {
            try {
                const { data } = await supabase
                    .from('kitchen_stations')
                    .select('id, name, color, output_mode, printer_id')
                    .in('id', uniqueIds);
                if (data) stationRows = data;
            } catch {
                // Keep empty
            }
        }

        const displayOrderNumber = activeOrderNumber || activeOrderId.slice(0, 6).toUpperCase();
        const batchId = generateUUID();

        const persistOrEnqueueTicket = async (ticketRow: Record<string, any>, ticketItemRows: Array<Record<string, any>>) => {
            if (get().isOnline === false) {
                const count = await enqueueOfflineMutation(tenantId, {
                    type: 'CREATE_KITCHEN_TICKET',
                    ticket: ticketRow,
                    ticketItems: ticketItemRows,
                });
                set({ pendingSyncCount: count });
                return;
            }
            try {
                const { error: tErr } = await supabase.from('kitchen_tickets').insert([ticketRow]);
                if (tErr && isNetworkError(tErr)) {
                    const count = await enqueueOfflineMutation(tenantId, {
                        type: 'CREATE_KITCHEN_TICKET',
                        ticket: ticketRow,
                        ticketItems: ticketItemRows,
                    });
                    set({ isOnline: false, pendingSyncCount: count });
                    return;
                }
                if (!tErr && ticketItemRows.length > 0) {
                    const { error: tiErr } = await supabase.from('kitchen_ticket_items').insert(ticketItemRows);
                    if (tiErr && isNetworkError(tiErr)) {
                        const count = await enqueueOfflineMutation(tenantId, {
                            type: 'CREATE_KITCHEN_TICKET',
                            ticket: ticketRow,
                            ticketItems: ticketItemRows,
                        });
                        set({ isOnline: false, pendingSyncCount: count });
                    }
                }
            } catch (err) {
                if (isNetworkError(err)) {
                    const count = await enqueueOfflineMutation(tenantId, {
                        type: 'CREATE_KITCHEN_TICKET',
                        ticket: ticketRow,
                        ticketItems: ticketItemRows,
                    });
                    set({ isOnline: false, pendingSyncCount: count });
                }
            }
        };

        // 1. Create the Master Expediter Ticket containing ALL items from this send
        const expediterTicketId = generateUUID();
        const expediterTicketRow = {
            id: expediterTicketId,
            order_id: activeOrderId,
            order_number: displayOrderNumber || null,
            station_id: null,
            station_name: 'Expediter View',
            status: 'pending',
            type: activeOrderType,
            table_name: activeOrderTable?.name || null,
            is_expediter: true,
            batch_id: batchId,
        };
        const expediterTicketItems = itemsWithDelta.map((cartItem) => {
            const delta = cartItem.quantity - (cartItem.sentQuantity ?? 0);
            const mods = {
                ingredients: cartItem.ingredients?.map((i: any) => ({ name: i.name, removed: i.removed || false, extra: i.extra || false })) || [],
                selectedOptions: cartItem.selectedOptions || {}
            };
            return {
                id: generateUUID(),
                ticket_id: expediterTicketId,
                item_name: cartItem.item.name,
                quantity: delta,
                modifications: mods,
                status: 'pending',
            };
        });
        await persistOrEnqueueTicket(expediterTicketRow, expediterTicketItems);

        // 2. Create the Station-specific tickets + fire LAN TCP:9100 printing immediately
        for (const [, group] of Object.entries(stationGroups)) {
            const station = stationRows?.find((s: any) => s.id === group.stationId);
            const stationTicketId = generateUUID();
            const stationTicketRow = {
                id: stationTicketId,
                order_id: activeOrderId,
                order_number: displayOrderNumber || null,
                station_id: group.stationId,
                station_name: station?.name || null,
                status: group.stationId ? 'pending' : 'done',
                type: activeOrderType,
                table_name: activeOrderTable?.name || null,
                is_expediter: false,
                batch_id: batchId,
            };
            const ticketRows = group.items.map(({ cartItem, delta }) => {
                const mods = {
                    ingredients: cartItem.ingredients?.map((i: any) => ({ name: i.name, removed: i.removed || false, extra: i.extra || false })) || [],
                    selectedOptions: cartItem.selectedOptions || {}
                };
                return {
                    id: generateUUID(),
                    ticket_id: stationTicketId,
                    item_name: cartItem.item.name,
                    quantity: delta,
                    modifications: mods,
                    status: 'pending',
                };
            });

            // TCP PRINTING FOR STATION (works over local Wi-Fi even when internet is offline!)
            const stationPrinter = station ? get().printers.find((p: any) => p.id === station.printer_id) : null;
            if (ticketRows.length > 0 && station && (station.output_mode === 'printer' || station.output_mode === 'both') && stationPrinter) {
                try {
                    const buffer = buildReceiptBuffer({
                        printerIp: stationPrinter.ip_address,
                        printerPort: stationPrinter.port || 9100,
                        orderNumber: String(displayOrderNumber || ''),
                        orderType: activeOrderType,
                        tableName: activeOrderTable?.name || '',
                        items: group.items.map(m => ({
                            name: m.cartItem.item.name,
                            quantity: m.delta,
                            selectedOptions: m.cartItem.selectedOptions,
                            ingredients: m.cartItem.ingredients
                        })),
                        stationName: station.name
                    });
                    printToNetwork(stationPrinter.ip_address, stationPrinter.port || 9100, buffer).catch((e: any) => console.error("TCP Print Error (Station):", e));
                } catch (e: any) {
                    console.error("Failed to build receipt buffer", e);
                }
            }

            await persistOrEnqueueTicket(stationTicketRow, ticketRows);
        }

        // TCP PRINTING FOR EXPEDITER (Master Ticket of sent items)
        const expPrinter = settings ? get().printers.find((p: any) => p.id === settings.expediter_printer_id) : null;
        if (settings && (settings.expediter_output_mode === 'printer' || settings.expediter_output_mode === 'both') && expPrinter) {
            try {
                const buffer = buildReceiptBuffer({
                    printerIp: expPrinter.ip_address,
                    printerPort: expPrinter.port || 9100,
                    orderNumber: String(displayOrderNumber || ''),
                    orderType: activeOrderType,
                    tableName: activeOrderTable?.name || '',
                    items: itemsWithDelta.map(c => ({
                        name: c.item.name,
                        quantity: c.quantity - (c.sentQuantity ?? 0),
                        selectedOptions: c.selectedOptions,
                        ingredients: c.ingredients
                    })),
                    isExpediter: true
                });
                printToNetwork(expPrinter.ip_address, expPrinter.port || 9100, buffer).catch((e: any) => console.error("TCP Print Error (Expediter):", e));
            } catch (e: any) {
                console.error("Failed to build expediter receipt buffer", e);
            }
        }

        // Mark all items as fully sent (sentQuantity = quantity, stamp sentAt)
        const now = Date.now();
        set(prev => ({
            cart: prev.cart.map((c: CartItem) =>
                itemsWithDelta.some(u => u.cart_id === c.cart_id) ? { ...c, sentQuantity: c.quantity, sentAt: now } : c
            )
        }));

        // Instantly save to DB/Queue so "sent" status isn't lost if the user leaves the order immediately
        await get().saveOrder();
    },

    checkout: async (payments) => {
        set({ isLoading: true });
        try {
            const {
                cart,
                activeOrderId,
                activeOrderTable,
                activeOrderNumber,
                activeOrderType,
                tenantId,
                items: memoryItems,
                kitchenStations: memoryStations,
                expediterSettings,
            } = get();

            if (!activeOrderId) {
                console.error('No active order to checkout');
                set({ isLoading: false });
                return null;
            }

            // Force a final sync of the cart to the database / local cache before marking paid
            await get().saveOrder();

            const cachedOrder = get().ordersList.find((o: any) => o.id === activeOrderId);
            const finalOrderNumber = String(
                cachedOrder?.order_number || activeOrderNumber || activeOrderId.slice(0, 6).toUpperCase()
            );
            const totalAmount = Number(cachedOrder?.total_amount ?? 0);
            const taxAmount = Number(cachedOrder?.monto_iva ?? 0);

            const activeShift = get().activeCashShift;
            const paymentRecords = (payments || []).map(p => ({
                id: generateUUID(),
                order_id: activeOrderId,
                amount: p.amount,
                method: p.method,
                reference_id: p.reference_id || null,
                status: 'completed',
                cash_shift_id: p.method === 'cash' ? (activeShift?.id || null) : null
            }));

            let workedOnline = false;
            if (get().isOnline !== false) {
                try {
                    const { data: orderData, error: orderError } = await supabase
                        .from('orders')
                        .update({ status: 'paid' })
                        .eq('id', activeOrderId)
                        .select()
                        .single();

                    if (!orderError && orderData) {
                        workedOnline = true;
                        if (paymentRecords.length > 0) {
                            const { error: paymentError } = await supabase.from('payments').insert(paymentRecords);
                            if (paymentError) console.error("Payment recording error:", paymentError);
                        }
                    } else if (orderError && !isNetworkError(orderError)) {
                        throw orderError;
                    }
                } catch (err) {
                    if (!isNetworkError(err)) {
                        throw err;
                    }
                    workedOnline = false;
                }
            }

            if (!workedOnline) {
                const count = await enqueueOfflineMutation(tenantId, {
                    type: 'COMPLETE_CHECKOUT',
                    orderId: activeOrderId,
                    orderSnapshot: cachedOrder
                        ? {
                              id: cachedOrder.id,
                              type: cachedOrder.type,
                              table_id: cachedOrder.table_id,
                              customer_name: cachedOrder.customer_name,
                              status: 'paid',
                              total_amount: totalAmount,
                              subtotal_bruto: cachedOrder.subtotal_bruto,
                              total_descuentos: cachedOrder.total_descuentos,
                              base_imponible_iva: cachedOrder.base_imponible_iva,
                              monto_iva: taxAmount,
                              total_neto: totalAmount,
                              user_id: cachedOrder.user_id,
                              tenant_id: tenantId,
                          }
                        : undefined,
                    lineItemsSnapshot: (cachedOrder as any)?.order_line_items || [],
                    totalAmount,
                    taxAmount,
                    tableId: activeOrderTable?.id || null,
                    payments: paymentRecords,
                });
                set({ isOnline: false, pendingSyncCount: count });
            }

            // 5. Create Kitchen Tickets & Print over LAN for any UNSENT items
            {
                const unsentCart = cart.filter((c: CartItem) => (c.sentQuantity ?? 0) < c.quantity);
                if (unsentCart.length > 0) {
                    let settings: any = expediterSettings;
                    if (
                        workedOnline &&
                        !settings?.expediter_output_mode &&
                        !settings?.expediter_printer_id
                    ) {
                        try {
                            const { data } = await supabase
                                .from('restaurant_settings')
                                .select('expediter_output_mode, expediter_printer_id')
                                .single();
                            if (data) settings = data;
                        } catch {
                            // Use cached
                        }
                    }

                    const stationGroups: Record<string, { stationId: string | null; items: CartItem[] }> = {};
                    for (const cartItem of unsentCart as CartItem[]) {
                        const itemMeta = memoryItems.find(i => i.id === cartItem.item.id) || cartItem.item;
                        const stationKey = (itemMeta as any)?.station_id || 'none';
                        if (!stationGroups[stationKey]) {
                            stationGroups[stationKey] = { stationId: (itemMeta as any)?.station_id || null, items: [] };
                        }
                        stationGroups[stationKey].items.push(cartItem);
                    }

                    let stationRows: any[] = memoryStations || [];
                    const uniqueStationIds = Object.values(stationGroups).map(g => g.stationId).filter(Boolean) as string[];
                    if (uniqueStationIds.length > 0 && stationRows.length === 0 && workedOnline) {
                        try {
                            const { data } = await supabase
                                .from('kitchen_stations')
                                .select('id, name, color, output_mode, printer_id')
                                .in('id', uniqueStationIds);
                            if (data) stationRows = data;
                        } catch {
                            // Keep empty
                        }
                    }

                    const batchId = generateUUID();
                    const persistTicket = async (tRow: Record<string, any>, tItems: Array<Record<string, any>>) => {
                        if (!workedOnline) {
                            const count = await enqueueOfflineMutation(tenantId, {
                                type: 'CREATE_KITCHEN_TICKET',
                                ticket: tRow,
                                ticketItems: tItems,
                            });
                            set({ pendingSyncCount: count });
                            return;
                        }
                        try {
                            await supabase.from('kitchen_tickets').insert([tRow]);
                            if (tItems.length > 0) {
                                await supabase.from('kitchen_ticket_items').insert(tItems);
                            }
                        } catch {
                            const count = await enqueueOfflineMutation(tenantId, {
                                type: 'CREATE_KITCHEN_TICKET',
                                ticket: tRow,
                                ticketItems: tItems,
                            });
                            set({ pendingSyncCount: count });
                        }
                    };

                    // 1. Expediter ticket
                    const expTicketId = generateUUID();
                    const expTicketRow = {
                        id: expTicketId,
                        order_id: activeOrderId,
                        order_number: finalOrderNumber,
                        station_id: null,
                        station_name: 'Expediter View',
                        status: 'pending',
                        type: activeOrderType,
                        table_name: activeOrderTable?.name || null,
                        batch_id: batchId,
                        is_expediter: true,
                    };
                    const allTicketItems = unsentCart.map((cartItem) => {
                        const mods = {
                            ingredients: cartItem.ingredients?.map((i: any) => ({ name: i.name, removed: i.removed || false, extra: i.extra || false })) || [],
                            selectedOptions: cartItem.selectedOptions || {}
                        };
                        return {
                            id: generateUUID(),
                            ticket_id: expTicketId,
                            item_name: cartItem.item.name,
                            quantity: cartItem.quantity - (cartItem.sentQuantity || 0),
                            modifications: mods,
                            status: 'pending',
                        };
                    });
                    await persistTicket(expTicketRow, allTicketItems);

                    // 2. Station tickets + LAN TCP printing
                    for (const [, group] of Object.entries(stationGroups)) {
                        const station = stationRows?.find((s: any) => s.id === group.stationId);
                        const stTicketId = generateUUID();
                        const stTicketRow = {
                            id: stTicketId,
                            order_id: activeOrderId,
                            order_number: finalOrderNumber,
                            station_id: group.stationId,
                            station_name: station?.name || null,
                            status: group.stationId ? 'pending' : 'done',
                            type: activeOrderType,
                            table_name: activeOrderTable?.name || null,
                            batch_id: batchId,
                            is_expediter: false,
                        };
                        const ticketItems = group.items.map((cartItem: CartItem) => {
                            const delta = cartItem.quantity - (cartItem.sentQuantity || 0);
                            const mods = {
                                ingredients: cartItem.ingredients?.map((i: any) => ({ name: i.name, removed: i.removed || false, extra: i.extra || false })) || [],
                                selectedOptions: cartItem.selectedOptions || {}
                            };
                            return {
                                id: generateUUID(),
                                ticket_id: stTicketId,
                                item_name: cartItem.item.name,
                                quantity: delta,
                                modifications: mods,
                                status: 'pending',
                            };
                        });

                        // TCP PRINTING FOR STATION (works offline over LAN Wi-Fi)
                        const stationPrinter = station ? get().printers.find((p: any) => p.id === station.printer_id) : null;
                        if (ticketItems.length > 0 && station && (station.output_mode === 'printer' || station.output_mode === 'both') && stationPrinter) {
                            try {
                                const buffer = buildReceiptBuffer({
                                    printerIp: stationPrinter.ip_address,
                                    printerPort: stationPrinter.port || 9100,
                                    orderNumber: finalOrderNumber,
                                    orderType: activeOrderType,
                                    tableName: activeOrderTable?.name || '',
                                    items: group.items.map(m => ({
                                        name: m.item.name,
                                        quantity: m.quantity - (m.sentQuantity ?? 0),
                                        selectedOptions: m.selectedOptions,
                                        ingredients: m.ingredients
                                    })),
                                    stationName: station.name
                                });
                                printToNetwork(stationPrinter.ip_address, stationPrinter.port || 9100, buffer).catch((e: any) => console.error("TCP Print Error (Station):", e));
                            } catch (e: any) {
                                console.error("Failed to build receipt buffer", e);
                            }
                        }

                        await persistTicket(stTicketRow, ticketItems);
                    }

                    // TCP PRINTING FOR EXPEDITER (Master Ticket of sent items)
                    const expPrinter = settings ? get().printers.find((p: any) => p.id === settings.expediter_printer_id) : null;
                    if (settings && (settings.expediter_output_mode === 'printer' || settings.expediter_output_mode === 'both') && expPrinter) {
                        try {
                            const buffer = buildReceiptBuffer({
                                printerIp: expPrinter.ip_address,
                                printerPort: expPrinter.port || 9100,
                                orderNumber: finalOrderNumber,
                                orderType: activeOrderType,
                                tableName: activeOrderTable?.name || '',
                                items: unsentCart.map(c => ({
                                    name: c.item.name,
                                    quantity: c.quantity - (c.sentQuantity ?? 0),
                                    selectedOptions: c.selectedOptions,
                                    ingredients: c.ingredients
                                })),
                                isExpediter: true
                            });
                            printToNetwork(expPrinter.ip_address, expPrinter.port || 9100, buffer).catch((e: any) => console.error("TCP Print Error (Expediter):", e));
                        } catch (e: any) {
                            console.error("Failed to build expediter receipt buffer", e);
                        }
                    }
                }
            }

            // 6. Release table back to available if dine-in
            if (activeOrderTable?.id) {
                set(prev => ({ tables: prev.tables.map((t: any) => t.id === activeOrderTable.id ? { ...t, status: 'available' } : t) }));
                if (workedOnline) {
                    try {
                        await supabase.from('tables').update({ status: 'available' }).eq('id', activeOrderTable.id);
                    } catch {
                        // Already handled if COMPLETE_CHECKOUT was queued
                    }
                }
            }

            // Update local ordersList to mark order paid
            const updatedOrdersList = get().ordersList.map((o: any) =>
                o.id === activeOrderId
                    ? { ...o, status: 'paid', payments: paymentRecords }
                    : o
            );
            await saveLocalCache(tenantId, 'orders_list', updatedOrdersList);

            // 7. Clear Active Order ID *first* so any trailing saveOrder calls exit early
            const finishedOrderTable = activeOrderTable?.name || null;
            set({ activeOrderId: null, ordersList: updatedOrdersList });

            // 8. Clear Cart 
            set({ cart: [], inspectingCartItemId: null, inspectingSubItemId: null, isLoading: false, activeOrderTable: null, activeOrderCustomer: null, activeOrderNumber: null });

            return {
                order_number: finalOrderNumber,
                table_name: finishedOrderTable
            };
        } catch (error) {
            console.error("Checkout failed:", error);
            set({ isLoading: false });
            return null;
        }
    },
    fetchActiveCashShift: async () => {
        const user = get().currentPosUser;
        const tenantId = get().tenantId;
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('cash_shifts')
                .select('*')
                .eq('user_id', user.id)
                .eq('status', 'open')
                .limit(1);
            if (error) throw error;
            if (data && data.length > 0) {
                set({ activeCashShift: data[0] });
                await saveLocalCache(tenantId, 'active_cash_shift', data[0]);
            } else {
                set({ activeCashShift: null });
                await saveLocalCache(tenantId, 'active_cash_shift', null);
            }
        } catch (e) {
            console.warn('Offline fallback for active cash shift:', e);
            const cachedShift = await loadLocalCache<CashShift | null>(tenantId, 'active_cash_shift');
            if (cachedShift && cachedShift.user_id === user.id && cachedShift.status === 'open') {
                set({ activeCashShift: cachedShift });
            }
        }
    },
    openCashShift: async (startingCash) => {
        const user = get().currentPosUser;
        const tenantId = get().tenantId;
        if (!user) return false;
        const shiftId = generateUUID();
        const fallbackShift: any = {
            id: shiftId,
            user_id: user.id,
            status: 'open',
            starting_cash: startingCash,
            expected_cash: startingCash,
            opening_time: new Date().toISOString(),
        };
        try {
            if (get().isOnline === false) {
                const count = await enqueueOfflineMutation(tenantId, {
                    type: 'CASH_SHIFT_OP',
                    op: 'open',
                    payload: {
                        id: shiftId,
                        user_id: user.id,
                        status: 'open',
                        starting_cash: startingCash,
                        expected_cash: startingCash,
                    },
                });
                set({ activeCashShift: fallbackShift, pendingSyncCount: count });
                await saveLocalCache(tenantId, 'active_cash_shift', fallbackShift);
                return true;
            }
            const { data, error } = await supabase
                .from('cash_shifts')
                .insert([{
                    id: shiftId,
                    user_id: user.id,
                    status: 'open',
                    starting_cash: startingCash,
                    expected_cash: startingCash
                }])
                .select()
                .single();
            if (error) {
                if (isNetworkError(error)) {
                    const count = await enqueueOfflineMutation(tenantId, {
                        type: 'CASH_SHIFT_OP',
                        op: 'open',
                        payload: {
                            id: shiftId,
                            user_id: user.id,
                            status: 'open',
                            starting_cash: startingCash,
                            expected_cash: startingCash,
                        },
                    });
                    set({ isOnline: false, activeCashShift: fallbackShift, pendingSyncCount: count });
                    await saveLocalCache(tenantId, 'active_cash_shift', fallbackShift);
                    return true;
                }
                console.error('Failed to open cash shift:', error);
                return false;
            }
            set({ activeCashShift: data });
            await saveLocalCache(tenantId, 'active_cash_shift', data);
            return true;
        } catch (e) {
            if (isNetworkError(e)) {
                const count = await enqueueOfflineMutation(tenantId, {
                    type: 'CASH_SHIFT_OP',
                    op: 'open',
                    payload: {
                        id: shiftId,
                        user_id: user.id,
                        status: 'open',
                        starting_cash: startingCash,
                        expected_cash: startingCash,
                    },
                });
                set({ isOnline: false, activeCashShift: fallbackShift, pendingSyncCount: count });
                await saveLocalCache(tenantId, 'active_cash_shift', fallbackShift);
                return true;
            }
            console.error('Error opening cash shift:', e);
            return false;
        }
    },
    closeCashShift: async (actualCash, notes) => {
        const activeShift = get().activeCashShift;
        const tenantId = get().tenantId;
        if (!activeShift) return false;
        try {
            const summary = await get().fetchCashShiftSummary(activeShift.id);
            const expectedCash = Number(activeShift.starting_cash) + 
                Number(summary?.cashSales || 0) + 
                Number(summary?.adjustmentsIn || 0) - 
                Number(summary?.adjustmentsOut || 0);
            const difference = actualCash - expectedCash;
            const closePayload = {
                status: 'closed',
                closing_time: new Date().toISOString(),
                expected_cash: expectedCash,
                actual_cash: actualCash,
                difference: difference,
                notes: notes || null
            };

            if (get().isOnline === false) {
                const count = await enqueueOfflineMutation(tenantId, {
                    type: 'CASH_SHIFT_OP',
                    op: 'close',
                    payload: { id: activeShift.id, ...closePayload },
                });
                set({ activeCashShift: null, pendingSyncCount: count });
                await saveLocalCache(tenantId, 'active_cash_shift', null);
                return true;
            }

            const { error } = await supabase
                .from('cash_shifts')
                .update(closePayload)
                .eq('id', activeShift.id);

            if (error) {
                if (isNetworkError(error)) {
                    const count = await enqueueOfflineMutation(tenantId, {
                        type: 'CASH_SHIFT_OP',
                        op: 'close',
                        payload: { id: activeShift.id, ...closePayload },
                    });
                    set({ isOnline: false, activeCashShift: null, pendingSyncCount: count });
                    await saveLocalCache(tenantId, 'active_cash_shift', null);
                    return true;
                }
                console.error('Failed to close cash shift:', error);
                return false;
            }
            set({ activeCashShift: null });
            await saveLocalCache(tenantId, 'active_cash_shift', null);
            return true;
        } catch (e) {
            console.error('Error closing cash shift:', e);
            return false;
        }
    },
    addCashAdjustment: async (type, amount, reason) => {
        const activeShift = get().activeCashShift;
        const tenantId = get().tenantId;
        if (!activeShift) return false;
        const adjPayload = {
            id: generateUUID(),
            shift_id: activeShift.id,
            type,
            amount,
            reason: reason || null
        };
        try {
            if (get().isOnline === false) {
                const count = await enqueueOfflineMutation(tenantId, {
                    type: 'CASH_SHIFT_OP',
                    op: 'adjustment',
                    payload: adjPayload,
                });
                set({ pendingSyncCount: count });
                return true;
            }
            const { error } = await supabase
                .from('cash_adjustments')
                .insert([adjPayload]);
            if (error) {
                if (isNetworkError(error)) {
                    const count = await enqueueOfflineMutation(tenantId, {
                        type: 'CASH_SHIFT_OP',
                        op: 'adjustment',
                        payload: adjPayload,
                    });
                    set({ isOnline: false, pendingSyncCount: count });
                    return true;
                }
                console.error('Failed to add cash adjustment:', error);
                return false;
            }
            await get().fetchActiveCashShift();
            return true;
        } catch (e) {
            if (isNetworkError(e)) {
                const count = await enqueueOfflineMutation(tenantId, {
                    type: 'CASH_SHIFT_OP',
                    op: 'adjustment',
                    payload: adjPayload,
                });
                set({ isOnline: false, pendingSyncCount: count });
                return true;
            }
            console.error('Error adding cash adjustment:', e);
            return false;
        }
    },
    fetchCashShiftSummary: async (shiftId) => {
        try {
            const { data: payments, error: payErr } = await supabase
                .from('payments')
                .select('amount')
                .eq('cash_shift_id', shiftId)
                .eq('method', 'cash');
            if (payErr) throw payErr;
            
            const { data: adjs, error: adjErr } = await supabase
                .from('cash_adjustments')
                .select('type, amount')
                .eq('shift_id', shiftId);
            if (adjErr) throw adjErr;

            const cashSales = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
            const adjustmentsIn = (adjs || []).filter(a => a.type === 'cash_in').reduce((sum, a) => sum + Number(a.amount), 0);
            const adjustmentsOut = (adjs || []).filter(a => a.type === 'cash_out').reduce((sum, a) => sum + Number(a.amount), 0);

            return { cashSales, adjustmentsIn, adjustmentsOut };
        } catch (e) {
            console.error('Error fetching cash shift summary:', e);
            return null;
        }
    }
    }))
);
