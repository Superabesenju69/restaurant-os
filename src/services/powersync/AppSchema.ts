/**
 * AppSchema.ts
 *
 * PowerSync Local SQLite Schema definition for Restaurant OS.
 * Ready to be passed to `new Schema(AppTables)` from `@powersync/react-native`
 * or `@powersync/web` whenever `EXPO_PUBLIC_POWERSYNC_URL` is configured.
 *
 * Note: PowerSync automatically creates the primary `id` TEXT column on every table.
 */

export type PowerSyncColumnType = 'TEXT' | 'INTEGER' | 'REAL';

export interface PowerSyncTableDefinition {
    columns: Record<string, PowerSyncColumnType>;
    indexes?: Record<string, string[]>;
}

export const AppTables: Record<string, PowerSyncTableDefinition> = {
    // 1. Read-mostly Catalog & Floor Configuration
    items: {
        columns: {
            tenant_id: 'TEXT',
            name: 'TEXT',
            base_price: 'REAL',
            type: 'TEXT',
            station_id: 'TEXT',
            track_inventory: 'INTEGER',
            stock_level: 'REAL',
            low_stock_threshold: 'REAL',
            image_url: 'TEXT',
            options: 'TEXT', // JSON stringified array of ItemOption
            combination_prices: 'TEXT', // JSON stringified Record<string, number>
            available: 'INTEGER',
        },
        indexes: {
            by_tenant: ['tenant_id'],
        },
    },

    categories: {
        columns: {
            tenant_id: 'TEXT',
            name: 'TEXT',
            sort_order: 'INTEGER',
            allow_extra_ingredients: 'INTEGER',
        },
        indexes: {
            by_tenant: ['tenant_id'],
        },
    },

    item_categories: {
        columns: {
            tenant_id: 'TEXT',
            item_id: 'TEXT',
            category_id: 'TEXT',
        },
    },

    recipes: {
        columns: {
            tenant_id: 'TEXT',
            parent_item_id: 'TEXT',
            child_item_id: 'TEXT',
            quantity: 'REAL',
            is_mandatory: 'INTEGER',
            variation_name: 'TEXT',
        },
        indexes: {
            by_parent: ['parent_item_id'],
        },
    },

    promotions: {
        columns: {
            tenant_id: 'TEXT',
            name: 'TEXT',
            description: 'TEXT',
            type: 'TEXT',
            value: 'REAL',
            discount_value: 'REAL',
            is_automatic: 'INTEGER',
            active: 'INTEGER',
            priority: 'INTEGER',
            allow_stacking: 'INTEGER',
            schedule_rules: 'TEXT',
            bogo_rules: 'TEXT',
            conditions: 'TEXT',
            start_date: 'TEXT',
            end_date: 'TEXT',
        },
    },

    promotion_targets: {
        columns: {
            tenant_id: 'TEXT',
            promotion_id: 'TEXT',
            target_type: 'TEXT',
            target_id: 'TEXT',
        },
    },

    tables: {
        columns: {
            tenant_id: 'TEXT',
            name: 'TEXT',
            status: 'TEXT',
            x_pos: 'REAL',
            y_pos: 'REAL',
            width: 'REAL',
            height: 'REAL',
            shape: 'TEXT',
            seats: 'INTEGER',
            zone_id: 'TEXT',
            reserved_by: 'TEXT',
            reserved_at: 'TEXT',
        },
        indexes: {
            by_tenant: ['tenant_id'],
        },
    },

    table_zones: {
        columns: {
            tenant_id: 'TEXT',
            name: 'TEXT',
            sort_order: 'INTEGER',
        },
    },

    kitchen_stations: {
        columns: {
            tenant_id: 'TEXT',
            name: 'TEXT',
            output_mode: 'TEXT',
            printer_id: 'TEXT',
        },
    },

    printers: {
        columns: {
            tenant_id: 'TEXT',
            name: 'TEXT',
            ip_address: 'TEXT',
            port: 'INTEGER',
            type: 'TEXT',
        },
    },

    // 2. Transactional Read/Write POS Tables (Offline-First)
    orders: {
        columns: {
            tenant_id: 'TEXT',
            order_number: 'INTEGER',
            type: 'TEXT',
            status: 'TEXT',
            table_id: 'TEXT',
            customer_name: 'TEXT',
            total_amount: 'REAL',
            tax_amount: 'REAL',
            created_at: 'TEXT',
            updated_at: 'TEXT',
        },
        indexes: {
            by_status: ['tenant_id', 'status'],
            by_table: ['table_id'],
        },
    },

    order_line_items: {
        columns: {
            tenant_id: 'TEXT',
            order_id: 'TEXT',
            item_id: 'TEXT',
            quantity: 'INTEGER',
            price_at_time_of_order: 'REAL',
            modifications: 'TEXT', // JSON stringified cart modifications
        },
        indexes: {
            by_order: ['order_id'],
        },
    },

    kitchen_tickets: {
        columns: {
            tenant_id: 'TEXT',
            order_id: 'TEXT',
            station_id: 'TEXT',
            status: 'TEXT',
            fulfillment_Ref: 'TEXT',
            created_at: 'TEXT',
        },
        indexes: {
            by_order: ['order_id'],
        },
    },

    kitchen_ticket_items: {
        columns: {
            tenant_id: 'TEXT',
            ticket_id: 'TEXT',
            item_name: 'TEXT',
            quantity: 'INTEGER',
            modifications: 'TEXT',
            station_id: 'TEXT',
            status: 'TEXT',
            batch_id: 'TEXT',
        },
        indexes: {
            by_ticket: ['ticket_id'],
        },
    },

    payments: {
        columns: {
            tenant_id: 'TEXT',
            order_id: 'TEXT',
            method: 'TEXT',
            amount: 'REAL',
            created_at: 'TEXT',
        },
        indexes: {
            by_order: ['order_id'],
        },
    },

    cash_shifts: {
        columns: {
            tenant_id: 'TEXT',
            opened_by: 'TEXT',
            closed_by: 'TEXT',
            starting_cash: 'REAL',
            expected_cash: 'REAL',
            actual_cash: 'REAL',
            difference: 'REAL',
            status: 'TEXT',
            notes: 'TEXT',
            opened_at: 'TEXT',
            closed_at: 'TEXT',
        },
        indexes: {
            by_status: ['tenant_id', 'status'],
        },
    },

    cash_adjustments: {
        columns: {
            tenant_id: 'TEXT',
            shift_id: 'TEXT',
            user_id: 'TEXT',
            type: 'TEXT',
            amount: 'REAL',
            reason: 'TEXT',
            created_at: 'TEXT',
        },
        indexes: {
            by_shift: ['shift_id'],
        },
    },
};

export function isPowerSyncConfigured(): boolean {
    return Boolean(process.env.EXPO_PUBLIC_POWERSYNC_URL);
}
