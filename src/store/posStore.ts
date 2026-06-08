import { create } from 'zustand';
import { supabase, setTenantIdHeader } from '../utils/supabase';
import { buildReceiptBuffer, printToNetwork } from '../utils/printerEngine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    checkItemAvailability as checkItemAvailabilityImpl,
    getIngredientMultiplier as getIngredientMultiplierImpl,
    deductInventoryForCartItem as deductInventoryForCartItemImpl,
    refundInventoryForCartItem as refundInventoryForCartItemImpl,
    adjustSingleIngredientStock as adjustSingleIngredientStockImpl
} from '../services/inventoryService';
import { printCustomerReceipt as printCustomerReceiptImpl } from '../services/printerService';
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
} from '../types';

// Re-export cart types so existing imports from posStore keep working
export type { CartItem, CartItemIngredient };

interface PosState {
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
    applyManualPromotion: (promoId: string) => void;
    removeManualPromotion: (promoId: string) => void;
    recalculateCartMath: () => void;

    // Table service & Settings
    tableServiceEnabled: boolean;
    mapBackgroundUrl: string | null;
    themeColor: string;
    themeMode: string;
    language: string;
    setLanguage: (lang: string) => void;
    currency: string;
    tables: FloorTable[];
    zones: TableZone[];
    printers: Printer[];
    localReceiptPrinterId: string | null;
    setLocalReceiptPrinterId: (id: string | null) => void;
    setThemeColor: (color: string) => void;
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
    setTenant: (id: string, name: string, subdomain: string) => Promise<void>;
    clearTenant: () => Promise<void>;

    // Auth
    currentPosUser: PosUser | null;
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
    updateTicketItemStatus: (itemId: string, status: string) => Promise<void>;
    markExpediterBatchComplete: (batchId: string) => Promise<void>;
    voidOrder: (orderId: string) => Promise<void>;
    addToCart: (item: MenuItem, selectedOptions?: Record<string, string>, extras?: MenuItem[]) => Promise<void>;
    removeFromCart: (cart_id: string) => void;
    clearCart: () => void;
    toggleIngredient: (cart_id: string, ingredient_id: string, sub_cart_id?: string) => void;
    addExtraIngredient: (cart_id: string, ingredient: MenuItem, sub_cart_id?: string) => void;
    removeExtraIngredient: (cart_id: string, ingredient_id: string, sub_cart_id?: string) => void;

    updateCartItemOptions: (cart_id: string, options: Record<string, string>, sub_cart_id?: string) => void;
    incrementCartItemQuantity: (cart_id: string) => void;
    decrementCartItemQuantity: (cart_id: string) => void;
    sendToKitchen: () => Promise<void>;
    checkout: (payments: Payment[]) => Promise<{ order_number: string, table_name: string | null } | null>;
    cancelKitchenTicketsForItem: (itemName: string) => Promise<void>;
    isItemAvailable: (item: MenuItem) => boolean;
    printCustomerReceipt: (orderData: Order) => Promise<boolean>;

    setupSubscriptions: () => void;
}

// Guard to prevent concurrent saveOrder calls that cause Hermes OOM during JSON.stringify
let _saveInProgress = false;

// --- Delegated to inventoryService.ts ---
const checkItemAvailability = checkItemAvailabilityImpl;
const getIngredientMultiplier = getIngredientMultiplierImpl;
const deductInventoryForCartItem = deductInventoryForCartItemImpl;
const refundInventoryForCartItem = refundInventoryForCartItemImpl;
const adjustSingleIngredientStock = adjustSingleIngredientStockImpl;

export const usePosStore = create<PosState>((set, get) => ({
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
            if (cartItem.selectedOptions && cartItem.item.options) {
                cartItem.item.options.forEach((opt: any) => {
                    const selectedChoice = cartItem.selectedOptions?.[opt.name];
                    const choiceDef = (opt.choices || []).find((c: any) => c.name === selectedChoice);
                    if (choiceDef && choiceDef.price_modifier) unitPrice += choiceDef.price_modifier;
                });
            }
            (cartItem.ingredients || []).forEach(ing => {
                if (ing.extra && !ing.removed) unitPrice += ing.base_price;
            });
            (cartItem.sub_items || []).forEach(sub => {
                let subUnitPrice = 0;
                if (sub.selectedOptions && sub.item.options) {
                    sub.item.options.forEach((opt: any) => {
                        const selectedChoice = sub.selectedOptions?.[opt.name];
                        const choiceDef = (opt.choices || []).find((c: any) => c.name === selectedChoice);
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
    tables: [],
    zones: [],
    printers: [],
    localReceiptPrinterId: null,
    setLocalReceiptPrinterId: (id) => set({ localReceiptPrinterId: id }),
    setThemeColor: (color) => set({ themeColor: color }),
    receiptTemplate: {
        logo_url: '',
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
        paper_width: '80mm'
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
        set({ tenantId: null, tenantName: null, tenantSubdomain: null, currentPosUser: null });
    },

    currentPosUser: null,
    posLogin: (user) => set({ currentPosUser: user }),
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
    }),

    setScreen: (screen) => set({ screen }),
    setActiveCategory: (catId) => set({ activeCategory: catId, inspectingCartItemId: null, inspectingSubItemId: null }),
    setInspectingCartItemId: (cartId) => {
        set({ inspectingCartItemId: cartId, inspectingSubItemId: null });
    },
    setInspectingSubItemId: (subCartId) => set({ inspectingSubItemId: subCartId }),

    fetchSettings: async () => {
        const localLang = await AsyncStorage.getItem('pos_language');
        const { data: settingsData } = await supabase.from('restaurant_settings').select('*').limit(1);
        const settings = settingsData && settingsData.length > 0 ? settingsData[0] : null;
        const { data: tablesData } = await supabase.from('tables').select('*').order('name');
        const { data: zonesData } = await supabase.from('table_zones').select('*').order('display_order');
        const { data: printers } = await supabase.from('printers').select('*').order('name');
        set({
            tableServiceEnabled: settings?.enable_table_service || false,
            mapBackgroundUrl: settings?.map_background_url || null,
            themeColor: settings?.theme_color || 'teal',
            themeMode: settings?.theme_mode || 'light',
            language: localLang || settings?.language || 'es',
            currency: settings?.currency || 'USD',
            tables: tablesData || [],
            zones: zonesData || [],
            printers: printers || [],
            receiptTemplate: settings?.receipt_template || get().receiptTemplate,
            attendanceSettings: settings?.attendance_settings || get().attendanceSettings,
        });
    },

    startOrder: async (type, table, customerName) => {
        const currentUser = get().currentPosUser;
        const { data: order, error } = await supabase
            .from('orders')
            .insert([{
                type,
                table_id: table?.id || null,
                customer_name: customerName || null,
                status: 'open',
                total_amount: 0,
                user_id: currentUser?.id || null
            }])
            .select()
            .single();

        if (error || !order) {
            console.error('Failed to create order:', error);
            return;
        }

        // If dine-in, mark the table as occupied
        if (type === 'dine_in' && table) {
            await supabase.from('tables').update({ status: 'occupied' }).eq('id', table.id);
            set(prev => ({ tables: prev.tables.map((t: any) => t.id === table.id ? { ...t, status: 'occupied' } : t) }));
        }

        set({
            activeOrderId: order.id,
            activeOrderType: type,
            activeOrderTable: table || null,
            activeOrderCustomer: order.customer_name || null,
            activeOrderNumber: order.order_number || order.id.slice(0, 6).toUpperCase(),
            cart: [],
            inspectingCartItemId: null,
            inspectingSubItemId: null,
            screen: 'pos',
        });
    },

    updateTableStatus: async (tableId, status, reservedBy = undefined, reservedAt = undefined) => {
        // Update local state immediately
        set(prev => ({
            tables: prev.tables.map((t: any) =>
                t.id === tableId ? { ...t, status, reserved_by: reservedBy, reserved_at: reservedAt } : t
            )
        }));
        // Update DB
        await supabase.from('tables').update({
            status,
            reserved_by: reservedBy,
            reserved_at: reservedAt
        }).eq('id', tableId);
    },

    reserveTable: async (tableId, guestName, dateStr) => {
        await get().updateTableStatus(tableId, 'reserved', guestName, dateStr);
    },

    saveOrder: async () => {
        // Prevent concurrent saves — overlapping JSON.stringify calls can exhaust Hermes heap
        if (_saveInProgress) return;
        _saveInProgress = true;
        try {
            // Re-run tax and promotion mathematics specifically right before saving state to DB
            get().recalculateCartMath();
            
            const { activeOrderId, cart } = get();
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

            let totalAmount = 0;
            const lineItemsToInsert = cart.map(cartItem => {
                let unitPrice = cartItem.item.base_price;

                // Add main item option modifiers
                if (cartItem.selectedOptions && cartItem.item.options) {
                    cartItem.item.options.forEach((opt: any) => {
                        const selectedChoice = cartItem.selectedOptions?.[opt.name];
                        if (selectedChoice) {
                            const choiceDef = (opt.choices || []).find((c: any) => c.name === selectedChoice);
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
                    let subUnitPrice = 0;

                    if (sub.selectedOptions && sub.item.options) {
                        sub.item.options.forEach((opt: any) => {
                            const selectedChoice = sub.selectedOptions?.[opt.name];
                            if (selectedChoice) {
                                const choiceDef = (opt.choices || []).find((c: any) => c.name === selectedChoice);
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
            const baseImponibleIva = subtotalBruto - totalDescuentos;
            const montoIva = baseImponibleIva * 0.15; // 15% IVA Tax
            const totalNeto = baseImponibleIva + montoIva;

            // Extract unique promotions used in this order
            const appliedPromotions = [...new Set(lineItemsToInsert.map(c => c.promotion_id).filter(Boolean))];

            // Delete existing lines to replace with current cart state
            await supabase.from('order_line_items').delete().eq('order_id', activeOrderId);

            if (lineItemsToInsert.length > 0) {
                await supabase.from('order_line_items').insert(lineItemsToInsert);
            }

            // Update order total and DGI properties
            await supabase.from('orders').update({ 
                total_amount: totalNeto, // Keep total_amount synced with total_neto for backwards compatibility
                subtotal_bruto: subtotalBruto,
                total_descuentos: totalDescuentos,
                base_imponible_iva: baseImponibleIva,
                monto_iva: montoIva,
                total_neto: totalNeto,
                applied_promotions: appliedPromotions.length > 0 ? appliedPromotions : null
            }).eq('id', activeOrderId);
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
        // Void the order by setting status to 'void'
        await supabase.from('orders').update({ status: 'void' }).eq('id', orderId);

        // We also want to archive the kitchen tickets so the kitchen isn't cooking a void order
        await supabase.from('kitchen_tickets').update({ status: 'archived' }).eq('order_id', orderId);

        // Note: Voided orders might need their inventory refunded eventually, but for now we just change the state.
        const currentActiveId = get().activeOrderId;
        if (currentActiveId === orderId) {
            get().clearCart();
            get().setScreen('home');
        } else {
            get().fetchOrders();
        }
    },

    loadOrder: async (order) => {
        // Load existing open order back into the cart
        const { data: lines } = await supabase
            .from('order_line_items')
            .select('*')
            .eq('order_id', order.id);
        const allStoreItems = [...get().items, ...get().allIngredients];

        const cartItems: CartItem[] = (lines || []).map((line: Record<string, unknown>) => {
            const mods = (line.modifications || {}) as Record<string, unknown>;
            const found = allStoreItems.find(i => i.id === line.item_id);
            const slimItem: MenuItem = found
                ? { id: found.id, name: found.name, base_price: found.base_price, type: found.type }
                : { id: line.item_id as string, name: 'Item', base_price: 0, type: 'product' };
            return {
                cart_id: line.id as string,
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

        const tenantId = get().tenantId || '7488df63-4fa8-4444-9c59-b1d5565f121d';
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
        try {
            const { data: catData } = await supabase.from('categories').select('*').eq('type', 'menu').order('display_order');
            const { data: linkData } = await supabase.from('item_categories').select('*');
            const { data: itemData } = await supabase.from('items').select('id,name,type,base_price,track_inventory,stock_level,station_id,image_url,tags,options').in('type', ['product', 'combo']).order('name');
            const { data: ingredientData } = await supabase.from('items').select('id,name,type,base_price,track_inventory,stock_level,station_id,image_url,tags,options').eq('type', 'ingredient').order('name');
            const { data: recipeData } = await supabase.from('recipes').select('parent_item_id, child_item_id, quantity, size_name');
            
            // Fetch active promotions
            const { data: promos } = await supabase.from('promotions').select('*').eq('active', true).order('priority', { ascending: false });
            const { data: targets } = await supabase.from('promotion_targets').select('*');

            set({
                categories: catData || [],
                itemCategoryLinks: linkData || [],
                items: itemData || [],
                allIngredients: ingredientData || [],
                recipes: recipeData || [],
                availablePromotions: promos || [],
                promotionTargets: targets || [],
                isLoading: false
            });

            // Trigger discount calculations for items currently in the cart
            get().recalculateCartMath();
        } catch (e) {
            console.error(e);
            set({ isLoading: false });
        }
    },

    printCustomerReceipt: async (orderData: any) => {
        const localId = get().localReceiptPrinterId;
        if (!localId) return false;

        const printer = get().printers.find(p => p.id === localId);
        if (!printer || !printer.ip_address) return false;

        const enriched = {
            ...orderData,
            server_name: get().currentPosUser?.full_name || 'POS STAFF'
        };

        return printCustomerReceiptImpl(enriched, printer, get().receiptTemplate);
    },

    fetchOrders: async () => {
        set({ isLoadingOrders: true });
        try {
            const { data: ordersData, error } = await supabase
                .from('orders')
                .select('*, payments(*), order_line_items(*), kitchen_tickets(*, kitchen_ticket_items(*))')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) {
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

            set({ ordersList: enriched, isLoadingOrders: false });
        } catch (e) {
            console.error('[fetchOrders] unexpected error:', e);
            set({ isLoadingOrders: false });
        }
    },


    addToCart: async (product, selectedOptions = {}, extras = []) => {
        const { data: recipeData } = await supabase
            .from('recipes')
            .select('*, child_item:items!child_item_id(*)')
            .eq('parent_item_id', product.id);

        const sizeKey = Object.keys(selectedOptions).find(k => k.toLowerCase() === 'size' || k.toLowerCase() === 'tamaño');
        const selectedSize = sizeKey ? selectedOptions[sizeKey] : null;
        const normalizedSelectedSize = selectedSize ? selectedSize.toLowerCase() : null;

        let filteredRecipeData = (recipeData || []).filter((r: any) => (r.size_name ? r.size_name.toLowerCase() : null) === normalizedSelectedSize);
        if (filteredRecipeData.length === 0) {
            filteredRecipeData = (recipeData || []).filter((r: any) => !r.size_name);
        }

        // Keep only the fields React Native / Hermes needs to display and calculate.
        // Storing full Supabase row objects causes JSON.stringify to OOM-crash in Hermes.
        const slimProduct: MenuItem = { id: product.id, name: product.name, base_price: product.base_price, type: product.type, options: product.options };

        let sub_items: CartItem[] = [];
        let ingredients: CartItemIngredient[] = [];

        if (product.type === 'combo') {
            for (const r of filteredRecipeData) {
                const subProduct = r.child_item;
                const slimSubProduct: MenuItem = { id: subProduct.id, name: subProduct.name, base_price: subProduct.base_price, type: subProduct.type, options: subProduct.options };

                const { data: subRecipeData } = await supabase
                    .from('recipes')
                    .select('*, child_item:items!child_item_id(*)')
                    .eq('parent_item_id', subProduct.id);

                let filteredSubRecipeData = (subRecipeData || []).filter((sr: any) => (sr.size_name ? sr.size_name.toLowerCase() : null) === normalizedSelectedSize);
                if (filteredSubRecipeData.length === 0) {
                    filteredSubRecipeData = (subRecipeData || []).filter((sr: any) => !sr.size_name);
                }

                const subIngredients: CartItemIngredient[] = filteredSubRecipeData.map((sr: any) => ({
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
                        defaultSubOptions[opt.name] = opt.choices[0];
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
            ingredients = filteredRecipeData.map((r: any) => ({
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

        const newCartItem: CartItem = {
            cart_id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
            item: slimProduct,
            quantity: 1,
            ingredients,
            sub_items,
            selectedOptions
        };

        set(state => ({
            cart: [...state.cart, newCartItem],
            inspectingCartItemId: newCartItem.cart_id,
            inspectingSubItemId: null
        }));

        await get().saveOrder();

        // REAL-TIME: Deduct inventory immediately
        await deductInventoryForCartItem(newCartItem, 1, get, set);
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
        if (item && (item.sentQuantity ?? 0) > 0 && activeOrderId) {
            await get().cancelKitchenTicketsForItem(item.item.name);
        }

        // REAL-TIME: Refund inventory immediately
        if (item) {
            await refundInventoryForCartItem(item, item.quantity, get, set);
        }

        await get().saveOrder();
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
        get().saveOrder();

        // REAL-TIME: if was NOT removed and now IS removed → refund stock
        // if was removed and now is NOT removed → deduct stock
        if (ing) {
            if (wasRemoved) {
                // Un-removing → deduct again
                await adjustSingleIngredientStock(ingredient_id, qty, 1, set);
            } else {
                // Removing → refund
                await adjustSingleIngredientStock(ingredient_id, qty, -1, set);
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
        get().saveOrder();

        // REAL-TIME: Deduct 1 unit of the extra ingredient
        await adjustSingleIngredientStock(ingredient.id, cartItem?.quantity ?? 1, 1, set);
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
        get().saveOrder();

        // REAL-TIME: Refund 1 unit of the extra ingredient
        await adjustSingleIngredientStock(ingredient_id, cartItem?.quantity ?? 1, -1, set);
    },

    updateCartItemOptions: (cart_id, options, sub_cart_id) => {
        const state = get();
        const oldCi = state.cart.find(c => c.cart_id === cart_id);
        if (!oldCi) return;

        let newCi = JSON.parse(JSON.stringify(oldCi));

        const getNewIngredients = (item_id: string, selectedSize: string | null, oldIngredients: any[]) => {
            const normalizedSelectedSize = selectedSize ? selectedSize.toLowerCase() : null;
            const subRecipes = state.recipes.filter((r: any) => r.parent_item_id === item_id);
            let filteredSubRecipes = subRecipes.filter((r: any) => (r.size_name ? r.size_name.toLowerCase() : null) === normalizedSelectedSize);
            if (filteredSubRecipes.length === 0) filteredSubRecipes = subRecipes.filter((r: any) => !r.size_name);

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
                    const subSizeKey = Object.keys(options).find(k => k.toLowerCase() === 'size' || k.toLowerCase() === 'tamaño');
                    const subSize = subSizeKey ? options[subSizeKey] : null;
                    sub.selectedOptions = options;
                    sub.ingredients = getNewIngredients(sub.item.id, subSize, sub.ingredients);
                }
                return sub;
            });
        } else {
            newCi.selectedOptions = options;
            const sizeKey = Object.keys(options).find(k => k.toLowerCase() === 'size' || k.toLowerCase() === 'tamaño');
            const selectedSize = sizeKey ? options[sizeKey] : null;

            if (newCi.item.type === 'combo') {
                newCi.sub_items = newCi.sub_items?.map((sub: any) => {
                    sub.ingredients = getNewIngredients(sub.item.id, selectedSize, sub.ingredients);
                    return sub;
                });
            } else {
                newCi.ingredients = getNewIngredients(newCi.item.id, selectedSize, newCi.ingredients);
            }
        }

        set(s => ({
            cart: s.cart.map(c => c.cart_id === cart_id ? newCi : c)
        }));

        (async () => {
            await refundInventoryForCartItem(oldCi, oldCi.quantity, get, set);
            await deductInventoryForCartItem(newCi, newCi.quantity, get, set);
            get().saveOrder();
        })();
    },

    incrementCartItemQuantity: async (cart_id) => {
        const cartItem = get().cart.find((c: CartItem) => c.cart_id === cart_id);
        set(state => ({
            cart: state.cart.map((c: CartItem) =>
                c.cart_id === cart_id ? { ...c, quantity: c.quantity + 1 } : c
            )
        }));
        get().saveOrder();

        // REAL-TIME: Deduct 1 more unit worth of ingredients
        if (cartItem) {
            await deductInventoryForCartItem(cartItem, 1, get, set);
        }
    },

    decrementCartItemQuantity: async (cart_id) => {
        const cartItem = get().cart.find((c: CartItem) => c.cart_id === cart_id);
        const willRemove = cartItem && cartItem.quantity <= 1;

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
        get().saveOrder();

        // REAL-TIME: Refund 1 unit worth of ingredients
        if (cartItem) {
            await refundInventoryForCartItem(cartItem, 1, get, set);
        }
    },

    sendToKitchen: async () => {
        const { cart, activeOrderId, activeOrderType, activeOrderTable, activeOrderNumber } = get();
        // Items with unsent delta: quantity > sentQuantity (or sentQuantity undefined)
        const itemsWithDelta = cart.filter((c: CartItem) => {
            const sent = c.sentQuantity ?? 0;
            return sent < c.quantity;
        });
        if (!activeOrderId || itemsWithDelta.length === 0) return;

        // Fetch settings for Expediter printer
        const { data: settings } = await supabase.from('restaurant_settings')
            .select('expediter_output_mode, expediter_printer_id').single();

        // Fetch station assignments
        const itemIds = itemsWithDelta.map((c: CartItem) => c.item.id);
        const { data: itemsWithStation } = await supabase
            .from('items')
            .select('id, name, station_id')
            .in('id', itemIds);

        // Group by station, carrying the unsent delta
        const stationGroups: Record<string, { stationId: string | null; items: { cartItem: CartItem; delta: number }[] }> = {};
        for (const cartItem of itemsWithDelta as CartItem[]) {
            const meta = itemsWithStation?.find((i: any) => i.id === cartItem.item.id);
            const key = meta?.station_id || 'none';
            if (!stationGroups[key]) stationGroups[key] = { stationId: meta?.station_id || null, items: [] };
            const delta = cartItem.quantity - (cartItem.sentQuantity ?? 0);
            stationGroups[key].items.push({ cartItem, delta });
        }

        // Fetch station names AND Printer config
        const uniqueIds = Object.values(stationGroups).map(g => g.stationId).filter(Boolean) as string[];
        const { data: stationRows } = uniqueIds.length > 0
            ? await supabase.from('kitchen_stations').select('id, name, color, output_mode, printer_id').in('id', uniqueIds)
            : { data: [] };

        // Get current order number if missing
        let displayOrderNumber = activeOrderNumber;
        if (!displayOrderNumber) {
            const { data: orderRow } = await supabase.from('orders').select('order_number').eq('id', activeOrderId).single();
            displayOrderNumber = orderRow?.order_number;
        }

        // Generate a valid UUID v4 for the batch_id
        const batchId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });

        // 1. Create the Master Expediter Ticket containing ALL items from this send
        const { data: expediterTicket } = await supabase.from('kitchen_tickets').insert([{
            order_id: activeOrderId,
            order_number: displayOrderNumber || null,
            station_id: null,
            station_name: 'Expediter View',
            status: 'pending',
            type: activeOrderType,
            table_name: activeOrderTable?.name || null,
            is_expediter: true,
            batch_id: batchId
        }]).select().single();

        if (expediterTicket) {
            const allTicketItems = itemsWithDelta.map((cartItem) => {
                const delta = cartItem.quantity - (cartItem.sentQuantity ?? 0);
                const mods = {
                    ingredients: cartItem.ingredients?.map((i: any) => ({ name: i.name, removed: i.removed || false, extra: i.extra || false })) || [],
                    selectedOptions: cartItem.selectedOptions || {}
                };
                return { ticket_id: expediterTicket.id, item_name: cartItem.item.name, quantity: delta, modifications: mods, status: 'pending' };
            });
            if (allTicketItems.length > 0) {
                await supabase.from('kitchen_ticket_items').insert(allTicketItems);
            }
        }

        // 2. Create the Station-specific tickets
        for (const [, group] of Object.entries(stationGroups)) {
            const station = stationRows?.find((s: any) => s.id === group.stationId);
            const { data: ticket } = await supabase.from('kitchen_tickets').insert([{
                order_id: activeOrderId,
                order_number: displayOrderNumber || null,
                station_id: group.stationId,
                station_name: station?.name || null,
                status: group.stationId ? 'pending' : 'done',
                type: activeOrderType,
                table_name: activeOrderTable?.name || null,
                is_expediter: false,
                batch_id: batchId
            }]).select().single();

            if (ticket) {
                const ticketRows = group.items.map(({ cartItem, delta }) => {
                    const mods = {
                        ingredients: cartItem.ingredients?.map((i: any) => ({ name: i.name, removed: i.removed || false, extra: i.extra || false })) || [],
                        selectedOptions: cartItem.selectedOptions || {}
                    };
                    return { ticket_id: ticket.id, item_name: cartItem.item.name, quantity: delta, modifications: mods, status: 'pending' };
                });

                if (ticketRows.length > 0) {
                    await supabase.from('kitchen_ticket_items').insert(ticketRows);

                    // TCP PRINTING FOR STATION
                    const stationPrinter = station ? get().printers.find((p: any) => p.id === station.printer_id) : null;
                    if (station && (station.output_mode === 'printer' || station.output_mode === 'both') && stationPrinter) {
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
                }
            }
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

        // Instantly save to DB so "sent" status isn't lost if the user leaves the order immediately
        await get().saveOrder();
    },

    checkout: async (payments) => {
        set({ isLoading: true });
        try {
            const { cart, activeOrderId, activeOrderTable } = get();

            if (!activeOrderId) {
                console.error('No active order to checkout');
                set({ isLoading: false });
                return null;
            }

            // Force a final sync of the cart to the database before marking paid
            await get().saveOrder();

            // 1. Update the existing open order to 'paid'
            // NOTE: We don't need to update total_amount here because saveOrder() already calculated
            // and saved the exact total_neto including IVA and discounts.
            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .update({ status: 'paid' })
                .eq('id', activeOrderId)
                .select()
                .single();

            if (orderError) throw orderError;
            const orderId = orderData.id;

            // 1.5 Record the payments
            if (payments && payments.length > 0) {
                const paymentRecords = payments.map(p => ({
                    order_id: activeOrderId,
                    amount: p.amount,
                    method: p.method,
                    reference_id: p.reference_id || null,
                    status: 'completed'
                }));
                const { error: paymentError } = await supabase.from('payments').insert(paymentRecords);
                if (paymentError) console.error("Payment recording error:", paymentError);
            }

            // NOTE: Inventory deduction is no longer done at checkout.
            // Stock is deducted in real-time when items are added to the cart.

            // 5. Create Kitchen Tickets for any UNSENT items (items already sent via sendToKitchen are skipped)
            {
                const unsentCart = cart.filter((c: CartItem) => (c.sentQuantity ?? 0) < c.quantity);
                if (unsentCart.length > 0) {

                    // Fetch settings for Expediter printer
                    const { data: settings } = await supabase.from('restaurant_settings')
                        .select('expediter_output_mode, expediter_printer_id').single();

                    const itemIds = unsentCart.map((c: CartItem) => c.item.id);
                    const { data: itemsWithStation } = await supabase
                        .from('items')
                        .select('id, name, station_id')
                        .in('id', itemIds);

                    const stationGroups: Record<string, { stationId: string | null; items: CartItem[] }> = {};
                    for (const cartItem of unsentCart as CartItem[]) {
                        const itemMeta = itemsWithStation?.find(i => i.id === cartItem.item.id);
                        const stationKey = itemMeta?.station_id || 'none';
                        if (!stationGroups[stationKey]) {
                            stationGroups[stationKey] = { stationId: itemMeta?.station_id || null, items: [] };
                        }
                        stationGroups[stationKey].items.push(cartItem);
                    }

                    const uniqueStationIds = Object.values(stationGroups).map(g => g.stationId).filter(Boolean) as string[];
                    const { data: stationRows } = uniqueStationIds.length > 0
                        ? await supabase.from('kitchen_stations').select('id, name, color, output_mode, printer_id').in('id', uniqueStationIds)
                        : { data: [] };

                    const orderState = get();

                    const batchId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                        return v.toString(16);
                    });

                    // 1. Expediter ticket
                    const { data: expediterTicket } = await supabase.from('kitchen_tickets').insert([{
                        order_id: orderState.activeOrderId,
                        order_number: orderData.order_number,
                        station_id: null,
                        station_name: 'Expediter View',
                        status: 'pending',
                        type: orderState.activeOrderType,
                        table_name: orderState.activeOrderTable?.name || null,
                        batch_id: batchId,
                        is_expediter: true
                    }]).select().single();

                    if (expediterTicket) {
                        const allTicketItems = unsentCart.map((cartItem) => {
                            const mods = {
                                ingredients: cartItem.ingredients?.map((i: any) => ({ name: i.name, removed: i.removed || false, extra: i.extra || false })) || [],
                                selectedOptions: cartItem.selectedOptions || {}
                            };
                            return { ticket_id: expediterTicket.id, item_name: cartItem.item.name, quantity: cartItem.quantity - (cartItem.sentQuantity || 0), modifications: mods, status: 'pending' };
                        });
                        if (allTicketItems.length > 0) {
                            await supabase.from('kitchen_ticket_items').insert(allTicketItems);
                        }
                    }

                    // 2. Station tickets
                    for (const [, group] of Object.entries(stationGroups)) {
                        const station = stationRows?.find(s => s.id === group.stationId);
                        const { data: ticket } = await supabase.from('kitchen_tickets').insert([{
                            order_id: orderState.activeOrderId,
                            order_number: orderData.order_number,
                            station_id: group.stationId,
                            station_name: station?.name || null,
                            status: group.stationId ? 'pending' : 'done',
                            type: orderState.activeOrderType,
                            table_name: orderState.activeOrderTable?.name || null,
                            batch_id: batchId,
                            is_expediter: false
                        }]).select().single();

                        if (ticket) {
                            const ticketItems = group.items.flatMap((cartItem: CartItem) => {
                                const delta = cartItem.quantity - (cartItem.sentQuantity || 0);
                                const mods = {
                                    ingredients: cartItem.ingredients?.map((i: any) => ({ name: i.name, removed: i.removed || false, extra: i.extra || false })) || [],
                                    selectedOptions: cartItem.selectedOptions || {}
                                };
                                return [{ ticket_id: ticket.id, item_name: cartItem.item.name, quantity: delta, modifications: mods, status: 'pending' }];
                            });

                            if (ticketItems.length > 0) {
                                await supabase.from('kitchen_ticket_items').insert(ticketItems);

                                // TCP PRINTING FOR STATION
                                const stationPrinter = station ? get().printers.find((p: any) => p.id === station.printer_id) : null;
                                if (station && (station.output_mode === 'printer' || station.output_mode === 'both') && stationPrinter) {
                                    try {
                                        const buffer = buildReceiptBuffer({
                                            printerIp: stationPrinter.ip_address,
                                            printerPort: stationPrinter.port || 9100,
                                            orderNumber: String(orderData.order_number || ''),
                                            orderType: orderState.activeOrderType,
                                            tableName: orderState.activeOrderTable?.name || '',
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
                            }
                        }
                    }

                    // TCP PRINTING FOR EXPEDITER (Master Ticket of sent items)
                    const expPrinter = settings ? get().printers.find((p: any) => p.id === settings.expediter_printer_id) : null;
                    if (settings && (settings.expediter_output_mode === 'printer' || settings.expediter_output_mode === 'both') && expPrinter) {
                        try {
                            const buffer = buildReceiptBuffer({
                                printerIp: expPrinter.ip_address,
                                printerPort: expPrinter.port || 9100,
                                orderNumber: String(orderData.order_number || ''),
                                orderType: orderState.activeOrderType,
                                tableName: orderState.activeOrderTable?.name || '',
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
                await supabase.from('tables').update({ status: 'available' }).eq('id', activeOrderTable.id);
                set(prev => ({ tables: prev.tables.map((t: any) => t.id === activeOrderTable.id ? { ...t, status: 'available' } : t) }));
            }

            // 7. Clear Active Order ID *first* so any trailing saveOrder calls exit early
            const finishedOrderTable = activeOrderTable?.name || null;
            const finishedOrderNumber = orderData.order_number;
            set({ activeOrderId: null });

            // 8. Clear Cart 
            set({ cart: [], inspectingCartItemId: null, inspectingSubItemId: null, isLoading: false, activeOrderTable: null, activeOrderCustomer: null, activeOrderNumber: null });

            return {
                order_number: finishedOrderNumber,
                table_name: finishedOrderTable
            };
        } catch (error) {
            console.error("Checkout failed:", error);
            set({ isLoading: false });
            return null;
        }
    }
}));
