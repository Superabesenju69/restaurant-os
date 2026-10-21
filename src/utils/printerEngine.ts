import { Buffer } from 'buffer';

let TcpSocket: any = null;
try {
    TcpSocket = require('react-native-tcp-socket').default;
} catch (e) {
    console.warn("TcpSocket native module not found. Direct printing will not work in this environment (e.g. Expo Go).", e);
}

// Basic ESC/POS commands
const CMD_INIT = '\x1B\x40'; // Initialize printer
const CMD_ALIGN_LEFT = '\x1B\x61\x00'; // Align left
const CMD_ALIGN_CENTER = '\x1B\x61\x01'; // Align center
const CMD_TEXT_NORMAL = '\x1B\x21\x00'; // Normal text
const CMD_TEXT_DOUBLE_HEIGHT = '\x1B\x21\x10'; // Double height
const CMD_TEXT_DOUBLE_WIDTH = '\x1B\x21\x20'; // Double width
const CMD_TEXT_TITLE = '\x1B\x21\x30'; // Double height + width
const CMD_CUT = '\x1D\x56\x41\x10'; // Partial cut and feed
const NL = '\n';

export interface PrintJob {
    printerIp: string;
    printerPort?: number;
    orderNumber: string;
    orderType: string;
    tableName?: string;
    items: any[];
    isExpediter?: boolean;
    isCustomerReceipt?: boolean;
    stationName?: string;
    total?: number;
    subtotal?: number;
    tax?: number;
    discount?: number;
    payments?: { method: string; amount: number; reference_id?: string }[];
    change?: number;
}

export const buildReceiptBuffer = (job: PrintJob): Buffer => {
    let commands = '';

    commands += CMD_INIT;
    commands += CMD_ALIGN_CENTER;

    // Header
    commands += CMD_TEXT_TITLE;
    if (job.isCustomerReceipt) {
        commands += `RECEIPT${NL}`;
    } else {
        commands += `${job.isExpediter ? 'EXPEDITER TICKET' : (job.stationName?.toUpperCase() || 'STATION') + ' TICKET'}${NL}`;
    }

    commands += CMD_TEXT_NORMAL;
    commands += `--------------------------------${NL}`;

    commands += CMD_TEXT_DOUBLE_HEIGHT;
    commands += `Order: #${job.orderNumber}${NL}`;

    commands += CMD_TEXT_NORMAL;
    commands += `Type: ${job.orderType === 'dine_in' ? 'Dine In' : 'Take Out'}${NL}`;
    if (job.tableName) {
        commands += `Table: ${job.tableName}${NL}`;
    }
    commands += `Time: ${new Date().toLocaleTimeString()}${NL}`;
    commands += `--------------------------------${NL}`;
    commands += CMD_ALIGN_LEFT;

    // Items
    job.items.forEach(item => {
        commands += CMD_TEXT_DOUBLE_HEIGHT;
        commands += `${item.quantity}x ${item.name}${NL}`;
        commands += CMD_TEXT_NORMAL;

        // Options
        if (item.selectedOptions) {
            Object.entries(item.selectedOptions).forEach(([k, v]) => {
                commands += `  - ${k}: ${v}${NL}`;
            });
        }

        // Ingredients (Removed / Extra)
        if (item.ingredients) {
            item.ingredients.forEach((ing: any) => {
                if (ing.removed) commands += `  [NO] ${ing.name}${NL}`;
                if (ing.extra) commands += `  [EXTRA] ${ing.name}${NL}`;
            });
        }
        commands += NL; // Space between items
    });

    commands += CMD_ALIGN_CENTER;
    commands += `--------------------------------${NL}`;

    if (job.isCustomerReceipt && job.total !== undefined) {
        if (job.subtotal !== undefined) {
            commands += `Subtotal: $${job.subtotal.toFixed(2)}${NL}`;
        }
        if (job.discount !== undefined && job.discount > 0) {
            commands += `Descuentos: -$${job.discount.toFixed(2)}${NL}`;
        }
        if (job.tax !== undefined) {
            commands += `IVA (15%): $${job.tax.toFixed(2)}${NL}`;
        }
        commands += `--------------------------------${NL}`;
        commands += CMD_TEXT_DOUBLE_HEIGHT;
        commands += `Total: $${job.total.toFixed(2)}${NL}`;
        commands += CMD_TEXT_NORMAL;

        // Payment breakdown
        if (job.payments && job.payments.length > 0) {
            commands += `--------------------------------${NL}`;
            commands += CMD_ALIGN_LEFT;
            for (const p of job.payments) {
                const methodLabel = p.method.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
                const refNote = p.reference_id ? ` (${p.reference_id})` : '';
                const amtStr = `$${p.amount.toFixed(2)}`;
                const line = `${methodLabel}${refNote}`;
                const padded = line.padEnd(32 - amtStr.length, ' ') + amtStr;
                commands += `${padded}${NL}`;
            }
            commands += CMD_ALIGN_CENTER;
        }

        // Change / Vuelto
        if (job.change && job.change > 0.001) {
            commands += CMD_TEXT_DOUBLE_HEIGHT;
            commands += `Vuelto: $${job.change.toFixed(2)}${NL}`;
            commands += CMD_TEXT_NORMAL;
        }

        commands += `--------------------------------${NL}`;
        commands += `Thank you for your visit!${NL}`;
    } else {
        commands += `End of Ticket${NL}`;
    }

    commands += NL + NL + NL + NL; // Extra feeds
    commands += CMD_CUT;

    return Buffer.from(commands, 'latin1');
};

export const printToNetwork = async (ip: string, port: number = 9100, buffer: Buffer): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        if (!TcpSocket) {
            console.warn("Printing bypassed: TcpSocket native module is missing (likely running in Expo Go).");
            // Resolve false to indicate failure without crashing
            return resolve(false);
        }

        try {
            const client = TcpSocket.createConnection({
                port: port,
                host: ip,
            }, () => {
                // TCP Connection established
                client.write(buffer);
                setTimeout(() => {
                    client.end();
                    resolve(true);
                }, 300);
            });

            client.setTimeout(5000, () => {
                console.warn(`Printer timeout at ${ip}:${port}`);
                client.destroy();
                reject(new Error('Printer timeout'));
            });

            client.on('error', (error: any) => {
                console.warn(`Printer connection failed at ${ip}:${port}`, error);
                client.destroy();
                reject(error);
            });
        } catch (e) {
            reject(e);
        }
    });
};
