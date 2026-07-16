/**
 * printerService.ts
 * 
 * Extracted from posStore.ts — handles building receipt data and sending
 * print jobs to network printers via the printerEngine utility.
 */
import { buildReceiptBuffer, printToNetwork, openCashDrawer as openDrawerKick } from '../utils/printerEngine';

import type { CartItem, OrderLineItem, Payment, Printer } from '../types';

export interface ReceiptOrderData {
    order_number?: string | number;
    type?: string;
    table_name?: string;
    total_amount?: number;
    total?: number;
    subtotal_bruto?: number;
    monto_iva?: number;
    total_descuentos?: number;
    change?: number;
    payments?: Payment[];
    cartCopy?: CartItem[];
    items?: OrderLineItem[];
    server_name?: string;
}

/**
 * Print a customer receipt for a given order to the specified printer.
 * Returns true on success, false on failure.
 */
export async function printCustomerReceipt(
    orderData: ReceiptOrderData,
    printer: Printer,
    receiptTemplate?: any
): Promise<{ success: boolean; error?: string }> {
    if (!printer.ip_address) return { success: false, error: 'NO_IP' };

    try {
        // Unify cart/items structure from old orders vs new orders
        const itemsToPrint = (orderData.cartCopy || orderData.items || []).map((c: CartItem | OrderLineItem) => {
            const isCartItem = 'item' in c;
            const itemDef = isCartItem ? c.item : { name: c.item_name || 'Unknown Item' };
            const modifications = !isCartItem && c.modifications ? c.modifications : undefined;
            return {
                name: itemDef.name,
                quantity: c.quantity || 1,
                selectedOptions: (isCartItem ? c.selectedOptions : modifications?.selectedOptions) || {},
                ingredients: (isCartItem ? c.ingredients : modifications?.ingredients) || []
            };
        });

        const buffer = buildReceiptBuffer({
            printerIp: printer.ip_address,
            printerPort: printer.port || 9100,
            orderNumber: String(orderData.order_number || ''),
            orderType: orderData.type || 'take_out',
            tableName: orderData.table_name || '',
            items: itemsToPrint,
            isCustomerReceipt: true,
            total: orderData.total_amount || orderData.total || 0,
            subtotal: orderData.subtotal_bruto || orderData.total_amount || 0,
            tax: orderData.monto_iva || 0,
            discount: orderData.total_descuentos || 0,
            payments: (orderData.payments || []).map((p: Payment) => ({
                method: p.method,
                amount: p.amount,
                reference_id: p.reference_id || undefined
            })),
            change: (() => {
                const total = orderData.total_amount || orderData.total || 0;
                const paid = (orderData.payments || []).reduce((s: number, p: Payment) => s + (p.amount || 0), 0);
                return paid > total ? paid - total : (orderData.change || 0);
            })(),
            receiptTemplate: receiptTemplate,
            serverName: orderData.server_name,
        });

        await printToNetwork(printer.ip_address, printer.port || 9100, buffer);
        return { success: true };
    } catch (e: any) {
        console.error("TCP Receipt Print Error:", e);
        return { success: false, error: e.message || 'UNKNOWN' };
    }
}

export async function triggerCashDrawer(printer: Printer): Promise<{ success: boolean; error?: string }> {
    if (!printer.ip_address) return { success: false, error: 'NO_IP' };
    try {
        await openDrawerKick(printer.ip_address, printer.port || 9100);
        return { success: true };
    } catch (e: any) {
        console.error("TCP Drawer Kick Error:", e);
        return { success: false, error: e.message || 'UNKNOWN' };
    }
}
