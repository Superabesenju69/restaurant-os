/**
 * types.ts — Shared type definitions for the Restaurant OS POS App.
 *
 * These interfaces map to Supabase table schemas and the runtime
 * data structures used across the store, screens, components, and services.
 */

// ─── Screen Navigation ──────────────────────────────────────────

export type ScreenName = 'home' | 'pos' | 'orders' | 'tables' | 'serving';
export type OrderType = 'dine_in' | 'take_out';

// ─── Core Domain Models (Supabase table shapes) ─────────────────

/** A menu item (product, combo, or ingredient) from the `items` table. */
export interface MenuItem {
  id: string;
  name: string;
  type: 'product' | 'combo' | 'ingredient';
  base_price: number;
  track_inventory?: boolean;
  stock_level?: number | null;
  station_id?: string | null;
  image_url?: string | null;
  tags?: string[] | null;
  options?: ItemOption[] | null;
}

/** An option group on a menu item (e.g., "Size", "Meat Term"). */
export interface ItemOption {
  name: string;
  affects_ingredients?: boolean;
  choices: ItemOptionChoice[];
  hide_in_combo?: boolean;
}

/** A single choice within an option group. */
export interface ItemOptionChoice {
  name: string;
  price_modifier?: number;
  ingredient_multiplier?: number;
}

/** A recipe link between a parent item and a child ingredient/sub-product. */
export interface Recipe {
  parent_item_id: string;
  child_item_id: string;
  quantity: number;
  size_name?: string | null;
}

/** A category from the `categories` table. */
export interface Category {
  id: string;
  name: string;
  type: string;
  display_order: number;
  icon?: string | null;
}

/** A link between an item and a category from `item_categories`. */
export interface ItemCategoryLink {
  id: string;
  item_id: string;
  category_id: string;
}

// ─── Table & Floor Plan ─────────────────────────────────────────

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'dirty' | 'unavailable';

/** A table from the `tables` table. */
export interface FloorTable {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  seats: number;
  shape: 'rect' | 'circle' | 'wall';
  zone_id: string | null;
  zone?: string | null;
  status: TableStatus;
  rotation?: number;
  reserved_by?: string | null;
  reserved_at?: string | null;
}

/** A zone/section of the floor plan from `table_zones`. */
export interface TableZone {
  id: string;
  name: string;
  color: string;
  display_order: number;
}

// ─── Printer ────────────────────────────────────────────────────

/** A printer from the `printers` table. */
export interface Printer {
  id: string;
  name: string;
  ip_address: string;
  port?: number;
  station_id?: string | null;
  is_expediter?: boolean;
}

// ─── Orders & Payments ──────────────────────────────────────────

export type OrderStatus = 'open' | 'paid' | 'void' | 'voided' | 'cancelled';

/** An order from the `orders` table (with relations). */
export interface Order {
  id: string;
  order_number: string;
  type: OrderType;
  status: OrderStatus;
  table_id: string | null;
  table_name?: string | null; // enriched client-side
  customer_name: string | null;
  user_id: string | null;
  total_amount: number;
  subtotal_bruto?: number;
  monto_iva?: number;
  total_descuentos?: number;
  created_at: string;
  updated_at?: string;
  payments?: Payment[];
  order_line_items?: OrderLineItem[];
  kitchen_tickets?: KitchenTicket[];
  cartCopy?: CartItem[]; // JSON snapshot of the cart at time of checkout
}

/** A payment on an order from the `payments` table.
 *  `id` and `order_id` are optional so we can reuse this type
 *  for in-flight checkout payments before they have DB identities. */
export interface Payment {
  id?: string;
  order_id?: string;
  method: string;
  amount: number;
  reference_id?: string | null;
  cash_shift_id?: string | null;
}

export interface CashShift {
  id: string;
  user_id: string | null;
  status: 'open' | 'closed';
  opening_time: string;
  closing_time?: string | null;
  starting_cash: number;
  expected_cash?: number;
  actual_cash?: number;
  difference?: number;
  notes?: string | null;
  created_at: string;
}

export interface CashAdjustment {
  id: string;
  shift_id: string;
  type: 'cash_in' | 'cash_out';
  amount: number;
  reason?: string | null;
  created_at: string;
}

/** A line item snapshot on a completed order from `order_line_items`. */
export interface OrderLineItem {
  id: string;
  order_id: string;
  item_id?: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  modifications?: {
    selectedOptions?: Record<string, string>;
    ingredients?: CartItemIngredient[];
    sub_items?: any[];
  };
}

// ─── Kitchen Tickets ────────────────────────────────────────────

/** A kitchen ticket from the `kitchen_tickets` table. */
export interface KitchenTicket {
  id: string;
  order_id: string;
  batch_id: string;
  station_id: string | null;
  is_expediter: boolean;
  status: string;
  created_at: string;
  kitchen_ticket_items?: KitchenTicketItem[];
}

/** A single item on a kitchen ticket. */
export interface KitchenTicketItem {
  id: string;
  kitchen_ticket_id: string;
  item_name: string;
  quantity: number;
  status: string;
  created_at?: string;
  updated_at?: string;
  modifications?: any;
}

// ─── Cart (Runtime) ─────────────────────────────────────────────

/** An ingredient instance on a cart item. */
export interface CartItemIngredient {
  instance_id: string;
  id: string;
  name: string;
  base_price: number;
  recipe_quantity: number;
  removed: boolean;
  extra: boolean;
}

/** A cart item (in-memory during an active order). */
export interface CartItem {
  cart_id: string;
  item: MenuItem;
  quantity: number;
  ingredients: CartItemIngredient[];
  sub_items?: CartItem[];
  selectedOptions?: Record<string, string>;
  sentQuantity?: number;
  sentAt?: number;
  // DGI Tax calculation fields
  grossAmount?: number;
  discountAmount?: number;
  appliedPromotionId?: string | null;
}

// ─── Promotions ─────────────────────────────────────────────────

export type PromoType = 'percentage' | 'fixed_amount' | 'bogo';

/** A promotion from the `promotions` table. */
export interface Promotion {
  id: string;
  name: string;
  description?: string | null;
  type: PromoType;
  value: number;
  discount_value?: number;
  active: boolean;
  auto_apply?: boolean;
  is_automatic?: boolean;
  allow_stacking?: boolean;
  priority: number;
  start_date?: string | null;
  end_date?: string | null;
  schedule_rules?: string | Record<string, unknown> | null;
  conditions?: string | Record<string, unknown> | null;
  bogo_rules?: {
    buy_qty: number;
    get_qty: number;
    discount_pct: number;
  } | null;
}

/** A target link for a promotion from `promotion_targets`. */
export interface PromotionTarget {
  id: string;
  promotion_id: string;
  target_type: 'all' | 'item' | 'category';
  target_id: string | null;
}

// ─── Auth ───────────────────────────────────────────────────────

/** A POS user (employee) logged in via PIN. */
export interface PosUser {
  id: string;
  full_name: string;
  role: string;
}

// ─── Theme ──────────────────────────────────────────────────────

/** A theme palette (shade map keyed by weight). */
export type ThemePalette = Record<number, string>;

/** All available theme names. */
export type ThemeColor = 'teal' | 'rose' | 'amber' | 'indigo';
