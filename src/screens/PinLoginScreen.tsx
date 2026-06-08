import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView, TextInput } from 'react-native';
import { usePosStore } from '../store/posStore';
import { t } from '../utils/i18n';
import TimeClockModal from '../components/TimeClockModal';
import { supabase } from '../utils/supabase';

interface Props {
    onLogin: (user: { id: string; full_name: string; role: string }) => void;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export default function PinLoginScreen({ onLogin }: Props) {
    const { themeColor, language, tenantId, tenantName, setTenant, clearTenant } = usePosStore();
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Tablet Activation States
    const [subdomainInput, setSubdomainInput] = useState('');
    const [activationError, setActivationError] = useState('');
    const [activating, setActivating] = useState(false);

    // Time Clock mode state
    const [timeClockMode, setTimeClockMode] = useState(false);
    const [showClockModal, setShowClockModal] = useState(false);
    const [clockUser, setClockUser] = useState<{ id: string; name: string } | null>(null);

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
            const { data, error: dbErr } = await supabase
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

            if (data.role === 'cocinero') {
                setError(language === 'es' ? 'Acceso de Cocinero: Redirigiendo a Reloj de Personal' : 'Cook access: Redirecting to Time Clock');
                setClockUser({ id: data.id, name: `${data.nombre} ${data.apellido}` });
                setShowClockModal(true);
                setPin('');
                setLoading(false);
            } else if (timeClockMode) {
                setClockUser({ id: data.id, name: `${data.nombre} ${data.apellido}` });
                setShowClockModal(true);
                setPin('');
                setLoading(false);
            } else {
                onLogin({ id: data.id, full_name: `${data.nombre} ${data.apellido}`, role: data.role });
            }
        } catch {
            setError(t('pos.login.error', language));
            setPin('');
            setLoading(false);
        }
    }

    async function handleActivate() {
        if (!subdomainInput.trim()) {
            setActivationError(language === 'es' ? 'Ingrese un código de restaurante.' : 'Enter a restaurant code.');
            return;
        }
        setActivating(true);
        setActivationError('');
        try {
            const { data, error: tErr } = await supabase
                .from('tenants')
                .select('id, name, subdomain')
                .eq('subdomain', subdomainInput.trim().toLowerCase())
                .single();

            if (tErr || !data) {
                setActivationError(language === 'es' ? 'Código de restaurante inválido.' : 'Invalid restaurant code.');
                setActivating(false);
                return;
            }

            await setTenant(data.id, data.name, data.subdomain);
            setActivating(false);
        } catch (err) {
            setActivationError(language === 'es' ? 'Error de conexión.' : 'Connection error.');
            setActivating(false);
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

    if (!tenantId) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: bgStr }]}>
                <View style={[styles.card, { backgroundColor: bgStr }]}>
                    <View style={[styles.logo, { backgroundColor: primStr }]}>
                        <Text style={styles.logoText}>🍽</Text>
                    </View>
                    <Text style={styles.title}>
                        {language === 'es' ? 'Activar POS' : 'Activate POS'}
                    </Text>
                    <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 16 }]}>
                        {language === 'es' 
                            ? 'Ingrese el código de subdomain de su restaurante para activar esta tablet.' 
                            : 'Enter your restaurant subdomain code to activate this tablet.'}
                    </Text>

                    {activationError ? (
                        <Text style={[styles.errorText, { marginBottom: 12 }]}>{activationError}</Text>
                    ) : null}

                    <TextInput
                        value={subdomainInput}
                        onChangeText={setSubdomainInput}
                        placeholder={language === 'es' ? 'ej. central' : 'e.g. central'}
                        placeholderTextColor="#94a3b8"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.input}
                    />

                    <TouchableOpacity 
                        onPress={handleActivate} 
                        disabled={activating}
                        style={[styles.btn, { backgroundColor: primStr, marginTop: 16 }]}
                    >
                        {activating ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.btnText}>
                                {language === 'es' ? 'Activar' : 'Activate'}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: bgStr }]}>
            <View style={[styles.card, { backgroundColor: bgStr }]}>
                {/* Logo */}
                <View style={[styles.logo, { backgroundColor: primStr }]}>
                    <Text style={styles.logoText}>🍽</Text>
                </View>
                <Text style={styles.title}>
                    {timeClockMode 
                        ? (language === 'es' ? 'Marcación Personal' : 'Staff Attendance') 
                        : t('pos.login.title', language)}
                </Text>
                <Text style={styles.subtitle}>
                    {timeClockMode 
                        ? (language === 'es' ? 'Ingrese su PIN para registrar asistencia' : 'Enter your PIN to clock punches') 
                        : t('pos.login.subtitle', language)}
                </Text>

                {tenantName ? (
                    <View style={{ alignItems: 'center', marginBottom: 20 }}>
                        <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: 'bold' }}>
                            {language === 'es' ? `Conectado a: ${tenantName}` : `Connected to: ${tenantName}`}
                        </Text>
                        <TouchableOpacity onPress={clearTenant} style={{ marginTop: 4 }}>
                            <Text style={{ fontSize: 12, color: primStr, fontWeight: 'bold', textDecorationLine: 'underline' }}>
                                {language === 'es' ? 'Cambiar de Restaurante' : 'Change Restaurant'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

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

                {/* Time Clock mode toggle */}
                <TouchableOpacity
                    onPress={() => {
                        setTimeClockMode(!timeClockMode);
                        setError('');
                        setPin('');
                    }}
                    style={[styles.modeBtn, { borderColor: primStr }]}
                >
                    <Text style={[styles.modeBtnText, { color: primStr }]}>
                        {timeClockMode 
                            ? (language === 'es' ? '← Iniciar Sesión POS' : '← POS Order Login')
                            : `⏰ ${language === 'es' ? 'Reloj de Marcación' : 'Time Clock'}`}
                    </Text>
                </TouchableOpacity>

                {/* Time Clock Modal */}
                {showClockModal && clockUser && (
                    <TimeClockModal
                        visible={showClockModal}
                        onClose={() => {
                            setShowClockModal(false);
                            setClockUser(null);
                            setTimeClockMode(false);
                        }}
                        userId={clockUser.id}
                        employeeName={clockUser.name}
                        language={language}
                        tp={usePosStore.getState().themeColor === 'teal' 
                            ? { 50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e' }
                            : usePosStore.getState().themeColor === 'rose'
                            ? { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337', 950: '#4c0519' }
                            : usePosStore.getState().themeColor === 'amber'
                            ? { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03' }
                            : { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81', 950: '#1e1b4b' }
                        }
                    />
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
    modeBtn: {
        marginTop: 28,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1.5,
        backgroundColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modeBtnText: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    input: {
        width: '100%',
        backgroundColor: '#fff',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        color: '#1f2937',
        marginTop: 12,
        textAlign: 'center',
    },
    btn: {
        width: '100%',
        height: 50,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
