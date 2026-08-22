import { Buffer } from 'buffer';

let TcpSocket: any = null;
try {
    const tcpModule = require('react-native-tcp-socket');
    TcpSocket = tcpModule.default || tcpModule;
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
const CMD_FONT_A = '\x1B\x4D\x00'; // Standard font (12x24)
const CMD_FONT_B = '\x1B\x4D\x01'; // Condensed font (9x17)
const CMD_BOLD_ON = '\x1B\x45\x01'; // Bold text ON
const CMD_BOLD_OFF = '\x1B\x45\x00'; // Bold text OFF
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
    receiptTemplate?: any;
    serverName?: string;
}

export const buildReceiptBuffer = (job: PrintJob): Buffer => {
    let commands = '';

    const template = job.receiptTemplate;
    const isNarrow = template?.paper_width === '58mm';
    const lineLength = isNarrow ? 30 : 42;

    const dividerChar = template?.divider_style === 'equals' ? '=' 
        : template?.divider_style === 'dots' ? '.' 
        : template?.divider_style === 'stars' ? '*' 
        : '-';
    const divider = dividerChar.repeat(lineLength);

    const alignCmd = template?.alignment === 'left' ? CMD_ALIGN_LEFT : CMD_ALIGN_CENTER;
    const fontCmd = template?.font_family === 'condensed' ? CMD_FONT_B : CMD_FONT_A;

    commands += CMD_INIT;
    commands += fontCmd;

    // Header
    if (job.isCustomerReceipt) {
        commands += alignCmd;
        
        // Custom Logo Placeholder with size spacing
        if (template?.logo_url && template.logo_url.trim()) {
            const logoSpacing = template.logo_size === 'xlarge' ? `${NL}${NL}${NL}` : template.logo_size === 'large' ? `${NL}${NL}` : `${NL}`;
            commands += `[ 🍽️ ]${logoSpacing}`;
        }

        // Custom Header Lines
        if (template?.header_lines && template.header_lines.length > 0) {
            template.header_lines.forEach((line: string, idx: number) => {
                if (idx === 0) {
                    if (template.header_format === 'bold_uppercase') {
                        commands += CMD_TEXT_TITLE + line.toUpperCase() + NL + CMD_TEXT_NORMAL + fontCmd;
                    } else if (template.header_format === 'bold') {
                        commands += CMD_BOLD_ON + line + CMD_BOLD_OFF + NL;
                    } else {
                        commands += line + NL;
                    }
                } else {
                    commands += line + NL;
                }
            });
        } else {
            commands += CMD_TEXT_TITLE + `RECEIPT${NL}` + CMD_TEXT_NORMAL + fontCmd;
        }
    } else {
        commands += CMD_ALIGN_CENTER;
        commands += CMD_TEXT_TITLE;
        commands += `${job.isExpediter ? 'EXPEDITER TICKET' : (job.stationName?.toUpperCase() || 'STATION') + ' TICKET'}${NL}`;
    }

    commands += CMD_TEXT_NORMAL;
    commands += `${divider}${NL}`;

    commands += CMD_TEXT_DOUBLE_HEIGHT;
    commands += `Order: #${job.orderNumber}${NL}`;

    commands += CMD_TEXT_NORMAL;
    commands += `Type: ${job.orderType === 'dine_in' ? 'Dine In' : 'Take Out'}${NL}`;
    if (job.tableName) {
        commands += `Table: ${job.tableName}${NL}`;
    }

    if (job.isCustomerReceipt) {
        if (template?.show_server_name !== false && job.serverName) {
            commands += `Waiter: ${job.serverName}${NL}`;
        }
        if (template?.show_order_timestamp !== false) {
            commands += `Time: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}${NL}`;
        }
    } else {
        commands += `Time: ${new Date().toLocaleTimeString()}${NL}`;
    }

    commands += `${divider}${NL}`;
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
    commands += `${divider}${NL}`;

    if (job.isCustomerReceipt && job.total !== undefined) {
        if (job.subtotal !== undefined) {
            const valStr = `$${job.subtotal.toFixed(2)}`;
            commands += `Subtotal:`.padEnd(lineLength - valStr.length, ' ') + valStr + NL;
        }
        if (job.discount !== undefined && job.discount > 0 && template?.show_promotion_discounts !== false) {
            const valStr = `-$${job.discount.toFixed(2)}`;
            commands += `Descuentos:`.padEnd(lineLength - valStr.length, ' ') + valStr + NL;
        }
        if (job.tax !== undefined && template?.show_tax_breakdown !== false) {
            const valStr = `$${job.tax.toFixed(2)}`;
            commands += `IVA (15%):`.padEnd(lineLength - valStr.length, ' ') + valStr + NL;
        }
        commands += `${divider}${NL}`;
        
        commands += CMD_TEXT_DOUBLE_HEIGHT;
        const totalValStr = `$${job.total.toFixed(2)}`;
        commands += `Total:`.padEnd(lineLength - totalValStr.length, ' ') + totalValStr + NL;
        commands += CMD_TEXT_NORMAL;

        // Payment breakdown
        if (job.payments && job.payments.length > 0) {
            commands += `${divider}${NL}`;
            commands += CMD_ALIGN_LEFT;
            for (const p of job.payments) {
                const methodLabel = p.method.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
                const refNote = p.reference_id ? ` (${p.reference_id})` : '';
                const amtStr = `$${p.amount.toFixed(2)}`;
                const line = `${methodLabel}${refNote}`;
                const padded = line.padEnd(lineLength - amtStr.length, ' ') + amtStr;
                commands += `${padded}${NL}`;
            }
            commands += CMD_ALIGN_CENTER;
        }

        // Change / Vuelto
        if (job.change && job.change > 0.001) {
            commands += CMD_TEXT_DOUBLE_HEIGHT;
            const changeStr = `$${job.change.toFixed(2)}`;
            commands += `Vuelto:`.padEnd(lineLength - changeStr.length, ' ') + changeStr + NL;
            commands += CMD_TEXT_NORMAL;
        }

        commands += `${divider}${NL}`;
        
        // Custom Footer Lines
        if (template?.footer_lines && template.footer_lines.length > 0) {
            commands += alignCmd;
            template.footer_lines.forEach((line: string) => {
                commands += line + NL;
            });
        } else {
            commands += CMD_ALIGN_CENTER;
            commands += `Thank you for your visit!${NL}`;
        }
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
            console.warn("Printing bypassed: TcpSocket native module is missing.");
            return reject(new Error('NO_NATIVE_MODULE'));
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
                reject(new Error('TIMEOUT'));
            });

            client.on('error', (error: any) => {
                console.warn(`Printer connection failed at ${ip}:${port}`, error);
                client.destroy();
                reject(new Error('CONNECTION_FAILED'));
            });
        } catch (e) {
            reject(e);
        }
    });
};

export const openCashDrawer = async (ip: string, port: number = 9100): Promise<boolean> => {
    // ESC p m t1 t2
    // m = 0 (drawer 1), t1 = 25 (50ms pulse ON), t2 = 250 (500ms pulse OFF)
    const buffer = Buffer.from('\x1B\x70\x00\x19\xFA', 'latin1');
    return printToNetwork(ip, port, buffer);
};
