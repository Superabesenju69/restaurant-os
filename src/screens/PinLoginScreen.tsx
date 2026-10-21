import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView } from 'react-native';
import { usePosStore } from '../store/posStore';
import { t } from '../utils/i18n';

interface Props {
    onLogin: (user: { id: string; full_name: string; role: string }) => void;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export default function PinLoginScreen({ onLogin }: Props) {
    const { themeColor, language } = usePosStore();
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    function pressDigit(d: string) {
        if (d === '') return;
        if (d === '⌫') {
            setPin(p => p.slice(0, -1));
            setError('');
            return;
        }
        if (pin.length >= 4) return;
        const next = pin + d;
        setPin(next);
        if (next.length === 4) {
            // auto-submit when 4 digits entered
            setTimeout(() => submitPinValue(next), 100);
        }
    }

    async function submitPinValue(p: string) {
        setLoading(true);
        setError('');
        try {
            const { createClient } = await import('@supabase/supabase-js');
            const client = createClient(
                process.env.EXPO_PUBLIC_SUPABASE_URL!,
                process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
            );
            const { data, error: dbErr } = await client
                .from('usuarios')
                .select('id, nombre, apellido, role, active')
                .eq('pin', p)
                .single();

            if (dbErr || !data) {
                setError(t('pos.login.invalid', language));
                setPin('');
                setLoading(false);
                return;
            }
            if (!data.active) {
                setError(t('pos.login.inactive', language));
                setPin('');
                setLoading(false);
                return;
            }
            onLogin({ id: data.id, full_name: `${data.nombre} ${data.apellido}`, role: data.role });
        } catch {
            setError(t('pos.login.error', language));
            setPin('');
            setLoading(false);
        }
    }

    const dots = [0, 1, 2, 3].map(i => ({
        filled: i < pin.length,
    }));

    const themeBgs: Record<string, string> = {
        teal: '#f0fdfa', // primary-50
        rose: '#fff1f2',
        amber: '#fffbeb',
        indigo: '#eef2ff',
    };

    const themePrimary: Record<string, string> = {
        teal: '#0d9488', // primary-600
        rose: '#e11d48',
        amber: '#d97706',
        indigo: '#4f46e5',
    };

    const bgStr = themeBgs[themeColor] || themeBgs.teal;
    const primStr = themePrimary[themeColor] || themePrimary.teal;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: bgStr }]}>
            <View style={[styles.card, { backgroundColor: bgStr }]}>
                {/* Logo */}
                <View style={[styles.logo, { backgroundColor: primStr }]}>
                    <Text style={styles.logoText}>🍽</Text>
                </View>
                <Text style={styles.title}>{t('pos.login.title', language)}</Text>
                <Text style={styles.subtitle}>{t('pos.login.subtitle', language)}</Text>

                {/* PIN dots */}
                <View style={styles.dotsRow}>
                    {dots.map((d, i) => (
                        <View key={i} style={[styles.dot, { borderColor: primStr }, d.filled && { backgroundColor: primStr }]} />
                    ))}
                </View>

                {/* Error */}
                {error ? (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}

                {/* Numpad */}
                {loading ? (
                    <View style={{ height: 350, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="large" color={primStr} />
                    </View>
                ) : (
                    <View style={styles.numpad}>
                        {DIGITS.map((d, idx) => (
                            <TouchableOpacity
                                key={idx}
                                disabled={d === ''}
                                onPress={() => pressDigit(d)}
                                style={[
                                    styles.numBtn,
                                    d === '' && { backgroundColor: 'transparent', borderWidth: 0 }
                                ]}
                            >
                                <Text style={[
                                    styles.numBtnText,
                                    { color: primStr },
                                    d === '⌫' && { fontSize: 28 }
                                ]}>
                                    {d}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    card: {
        width: 360,
        borderRadius: 28,
        padding: 36,
        alignItems: 'center',
    },
    logo: {
        width: 64,
        height: 64,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    logoText: { fontSize: 30 },
    title: { fontSize: 26, fontWeight: '600', color: '#111827', marginBottom: 4 },
    subtitle: { fontSize: 16, color: '#4b5563', marginBottom: 28 },
    dotsRow: { flexDirection: 'row', gap: 20, marginBottom: 40 },
    dot: {
        width: 16, height: 16,
        borderRadius: 8,
        borderWidth: 1.5,
        backgroundColor: 'transparent',
    },
    errorBox: {
        position: 'absolute',
        top: 240,
    },
    errorText: { color: '#ef4444', fontSize: 14, textAlign: 'center', fontWeight: '500' },
    numpad: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 16,
        marginTop: 8,
        width: 290,
    },
    numBtn: {
        width: 76, height: 76,
        borderRadius: 38,
        backgroundColor: 'rgba(255,255,255,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
        shadowColor: '#000',
        shadowOpacity: 0.02,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
    },
    numBtnText: { fontSize: 32, fontWeight: '400' },
});
