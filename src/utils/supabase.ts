import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

export function setTenantIdHeader(tenantId: string) {
    if (tenantId) {
        // @ts-ignore
        supabase.rest.headers['x-tenant-id'] = tenantId;
    } else {
        // @ts-ignore
        delete supabase.rest.headers['x-tenant-id'];
    }
}
