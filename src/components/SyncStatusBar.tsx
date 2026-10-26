import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { usePosStore } from '../store/posStore';

export default function SyncStatusBar() {
    const isOnline = usePosStore((s) => s.isOnline);
    const pendingSyncCount = usePosStore((s) => s.pendingSyncCount);
    const isSyncingOfflineQueue = usePosStore((s) => s.isSyncingOfflineQueue);
    const language = usePosStore((s) => s.language);
    const syncOfflineQueue = usePosStore((s) => s.syncOfflineQueue);
    const setOnlineStatus = usePosStore((s) => s.setOnlineStatus);

    useEffect(() => {
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            const handleOnline = () => {
                setOnlineStatus(true);
                syncOfflineQueue();
            };
            const handleOffline = () => {
                setOnlineStatus(false);
            };
            window.addEventListener('online', handleOnline);
            window.addEventListener('offline', handleOffline);
            return () => {
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
            };
        }
    }, [setOnlineStatus, syncOfflineQueue]);

    const isEs = language === 'es';

    // When online and zero pending mutations, show a subtle compact green pill
    if (isOnline && pendingSyncCount === 0 && !isSyncingOfflineQueue) {
        return (
            <TouchableOpacity
                onPress={() => syncOfflineQueue()}
                activeOpacity={0.8}
                style={[styles.pill, styles.pillOnline]}
            >
                <View style={[styles.dot, { backgroundColor: '#10b981' }]} />
                <Text style={styles.textOnline}>
                    {isEs ? 'En Línea' : 'Online'}
                </Text>
            </TouchableOpacity>
        );
    }

    if (isSyncingOfflineQueue) {
        return (
            <View style={[styles.pill, styles.pillSyncing]}>
                <ActivityIndicator size="small" color="#2563eb" style={{ marginRight: 6 }} />
                <Text style={styles.textSyncing}>
                    {isEs
                        ? `Sincronizando (${pendingSyncCount})...`
                        : `Syncing (${pendingSyncCount})...`}
                </Text>
            </View>
        );
    }

    return (
        <TouchableOpacity
            onPress={() => syncOfflineQueue()}
            activeOpacity={0.8}
            style={[styles.pill, !isOnline ? styles.pillOffline : styles.pillPending]}
        >
            <View
                style={[
                    styles.dot,
                    { backgroundColor: !isOnline ? '#f59e0b' : '#3b82f6' },
                ]}
            />
            <Text style={!isOnline ? styles.textOffline : styles.textSyncing}>
                {!isOnline
                    ? isEs
                        ? `Modo Offline${pendingSyncCount > 0 ? ` (${pendingSyncCount} pend.)` : ''}`
                        : `Offline Mode${pendingSyncCount > 0 ? ` (${pendingSyncCount} queued)` : ''}`
                    : isEs
                    ? `${pendingSyncCount} pend. · Tocar para sincronizar`
                    : `${pendingSyncCount} pending · Tap to sync`}
            </Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
    },
    pillOnline: {
        backgroundColor: '#ecfdf5',
        borderColor: '#a7f3d0',
    },
    pillOffline: {
        backgroundColor: '#fffbeb',
        borderColor: '#fde68a',
    },
    pillPending: {
        backgroundColor: '#eff6ff',
        borderColor: '#bfdbfe',
    },
    pillSyncing: {
        backgroundColor: '#eff6ff',
        borderColor: '#bfdbfe',
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    textOnline: {
        fontSize: 11,
        fontWeight: '700',
        color: '#047857',
    },
    textOffline: {
        fontSize: 11,
        fontWeight: '700',
        color: '#b45309',
    },
    textSyncing: {
        fontSize: 11,
        fontWeight: '700',
        color: '#1d4ed8',
    },
});
