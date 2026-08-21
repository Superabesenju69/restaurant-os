import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://jyxvmtcvgodbclnwbyiw.supabase.co";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5eHZtdGN2Z29kYmNsbndieWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MzMzNjcsImV4cCI6MjA4ODUwOTM2N30.QX6KpCli1HleQ-EILSPWmb69YKRBFFikWPAN3jV0MdI";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

export function setTenantIdHeader(tenantId: string) {
    const client = supabase as any;
    if (!client || !client.rest || !client.rest.headers) return;
    if (tenantId) {
        if (typeof client.rest.headers.set === 'function') {
            client.rest.headers.set('x-tenant-id', tenantId);
        } else {
            client.rest.headers['x-tenant-id'] = tenantId;
        }
    } else {
        if (typeof client.rest.headers.delete === 'function') {
            client.rest.headers.delete('x-tenant-id');
        } else {
            delete client.rest.headers['x-tenant-id'];
        }
    }
}

