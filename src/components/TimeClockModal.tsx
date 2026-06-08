import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, ActivityIndicator, Alert, Modal, Platform } from 'react-native';
import { supabase } from '../utils/supabase';

interface Props {
    visible: boolean;
    onClose: () => void;
    userId: string;
    employeeName: string;
    language: string;
    tp: Record<string, string>;
}

export default function TimeClockModal({ visible, onClose, userId, employeeName, language, tp }: Props) {
    const isEs = language === 'es';
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'clock' | 'calendar' | 'leaves'>('clock');
    const [punchesToday, setPunchesToday] = useState<any[]>([]);
    const [currentStatus, setCurrentStatus] = useState<{ type: string; time?: string } | null>(null);
    const [enableBreaks, setEnableBreaks] = useState(true);
    const [scheduleList, setScheduleList] = useState<any[]>([]);

    // Time off request form state
    const [leaveType, setLeaveType] = useState<'vacation' | 'sick' | 'early_out'>('vacation');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [leaveHours, setLeaveHours] = useState('8');
    const [leaveNotes, setLeaveNotes] = useState('');

    useEffect(() => {
        if (visible && userId) {
            loadAttendanceState();
        }
    }, [visible, userId]);

    async function loadAttendanceState() {
        setLoading(true);
        try {
            const localTodayStr = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD' in system's local time
            
            // Fetch punches, schedules, and settings in parallel
            const [punchesRes, schedulesRes, settingsRes] = await Promise.all([
                supabase.from('attendance_punches').select('*').eq('user_id', userId).order('timestamp', { ascending: true }),
                supabase.from('attendance_schedules').select('*').eq('user_id', userId),
                supabase.from('restaurant_settings').select('attendance_settings').limit(1)
            ]);

            if (punchesRes.error) throw punchesRes.error;
            if (schedulesRes.error) throw schedulesRes.error;

            setScheduleList(schedulesRes.data || []);

            const list = punchesRes.data || [];
            // Filter out any punches that are in the future by more than 1 hour (e.g. mock seed punches for next day)
            const nowLimit = new Date(Date.now() + 60 * 60 * 1000); 
            const filteredList = list.filter(p => new Date(p.timestamp) <= nowLimit);

            // Filter list for today's display based on local timezone date
            const todayPunches = filteredList.filter(p => {
                const punchLocalDate = new Date(p.timestamp).toLocaleDateString('en-CA');
                return punchLocalDate === localTodayStr;
            });
            setPunchesToday(todayPunches);

            if (filteredList.length > 0) {
                const last = filteredList[filteredList.length - 1];
                const time = new Date(last.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                setCurrentStatus({ type: last.type, time });
            } else {
                setCurrentStatus(null);
            }

            // Load settings
            if (settingsRes.data && settingsRes.data.length > 0 && settingsRes.data[0].attendance_settings) {
                const attSettings = settingsRes.data[0].attendance_settings;
                setEnableBreaks(attSettings.enable_breaks !== false);
            }
        } catch (e: any) {
            console.error('Failed to load employee attendance details:', e);
        }
        setLoading(false);
    }

    async function handlePunch(type: string) {
        setActionLoading(true);
        try {
            const timestamp = new Date().toISOString();
            const { error } = await supabase.from('attendance_punches').insert([{
                user_id: userId,
                type,
                timestamp,
                notes: `Punch registered from POS Terminal by employee`
            }]);

            if (error) throw error;

            Alert.alert(
                isEs ? '✅ Registro Exitoso' : '✅ Punch Registered',
                isEs ? `Marcación registrada correctamente.` : `Punch status successfully logged.`
            );
            await loadAttendanceState();
        } catch (e: any) {
            Alert.alert('Error', e.message);
        }
        setActionLoading(false);
    }

    async function submitLeaveRequest() {
        if (!startDate || !endDate || !leaveHours) {
            Alert.alert(isEs ? 'Campos obligatorios' : 'Required fields', isEs ? 'Por favor complete todos los datos.' : 'Please enter all form details.');
            return;
        }
        setActionLoading(true);
        try {
            const { error } = await supabase.from('attendance_time_off').insert([{
                user_id: userId,
                type: leaveType,
                start_date: startDate,
                end_date: endDate,
                hours: parseFloat(leaveHours) || 8,
                status: 'pending',
                notes: leaveNotes.trim() || 'Submitted from POS'
            }]);

            if (error) throw error;

            Alert.alert(
                isEs ? '✈️ Solicitud Enviada' : '✈️ Request Submitted',
                isEs ? 'Su solicitud de permiso ha sido enviada para revisión del administrador.' : 'Your leave request has been submitted for manager approval.'
            );
            setActiveTab('clock'); // Switch back to clock tab
            setLeaveNotes('');
        } catch (e: any) {
            Alert.alert('Error', e.message);
        }
        setActionLoading(false);
    }

    function getPunchName(type: string) {
        switch (type) {
            case 'clock_in': return isEs ? 'Entrada (Clock In)' : 'Clock In';
            case 'clock_out': return isEs ? 'Salida (Clock Out)' : 'Clock Out';
            case 'break_start': return isEs ? 'Inicio Receso' : 'Start Break';
            case 'break_end': return isEs ? 'Fin Receso' : 'End Break';
            case 'lunch_start': return isEs ? 'Inicio Almuerzo' : 'Start Lunch';
            case 'lunch_end': return isEs ? 'Fin Almuerzo' : 'End Lunch';
            default: return type;
        }
    }

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={styles.overlay}>
                <View style={styles.modalCard}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.headerTitle}>{isEs ? '⏰ Portal de Empleado' : '⏰ Employee Portal'}</Text>
                            <Text style={styles.headerUser}>{employeeName}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Text style={styles.closeBtnText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Navigation Tabs */}
                    <View style={styles.tabsRow}>
                        <TouchableOpacity onPress={() => setActiveTab('clock')} style={[styles.tabBtn, activeTab === 'clock' && { borderBottomColor: tp[600] || '#14b8a6' }]}>
                            <Text style={[styles.tabText, activeTab === 'clock' && { color: tp[600] || '#14b8a6', fontWeight: 'bold' }]}>🕒 {isEs ? 'Reloj' : 'Clock'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setActiveTab('calendar')} style={[styles.tabBtn, activeTab === 'calendar' && { borderBottomColor: tp[600] || '#14b8a6' }]}>
                            <Text style={[styles.tabText, activeTab === 'calendar' && { color: tp[600] || '#14b8a6', fontWeight: 'bold' }]}>📅 {isEs ? 'Mi Horario' : 'Schedule'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setActiveTab('leaves')} style={[styles.tabBtn, activeTab === 'leaves' && { borderBottomColor: tp[600] || '#14b8a6' }]}>
                            <Text style={[styles.tabText, activeTab === 'leaves' && { color: tp[600] || '#14b8a6', fontWeight: 'bold' }]}>✈️ {isEs ? 'Permisos' : 'Leaves'}</Text>
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={tp[600]} />
                        </View>
                    ) : (
                        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                            {activeTab === 'leaves' ? (
                                /* Leave Form view */
                                <View style={styles.formContainer}>
                                    <Text style={styles.sectionTitle}>{isEs ? 'Solicitar Permiso / Ausencia' : 'Submit Leave / Time Off'}</Text>
                                    
                                    <Text style={styles.label}>{isEs ? 'Tipo' : 'Leave Type'}</Text>
                                    <View style={styles.typeSelectorRow}>
                                        {(['vacation', 'sick', 'early_out'] as const).map(t => (
                                            <TouchableOpacity
                                                key={t}
                                                onPress={() => setLeaveType(t)}
                                                style={[
                                                    styles.typeBtn,
                                                    leaveType === t ? { backgroundColor: tp[600], borderColor: tp[600] } : null
                                                ]}
                                            >
                                                <Text style={[styles.typeBtnText, leaveType === t ? { color: 'white' } : { color: '#4b5563' }]}>
                                                    {t === 'vacation' ? (isEs ? 'Vacación' : 'Vacation') : t === 'sick' ? (isEs ? 'Enfermo' : 'Sick') : (isEs ? 'Salida' : 'Early Out')}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    <Text style={styles.label}>{isEs ? 'Fecha de Inicio (AAAA-MM-DD)' : 'Start Date (YYYY-MM-DD)'}</Text>
                                    <TextInput value={startDate} onChangeText={setStartDate} style={styles.input} />

                                    <Text style={styles.label}>{isEs ? 'Fecha de Fin (AAAA-MM-DD)' : 'End Date (YYYY-MM-DD)'}</Text>
                                    <TextInput value={endDate} onChangeText={setEndDate} style={styles.input} />

                                    <Text style={styles.label}>{isEs ? 'Horas Totales a Justificar' : 'Total Hours to Apply'}</Text>
                                    <TextInput value={leaveHours} onChangeText={setLeaveHours} keyboardType="numeric" style={styles.input} />

                                    <Text style={styles.label}>{isEs ? 'Notas / Motivo' : 'Notes / Description'}</Text>
                                    <TextInput value={leaveNotes} onChangeText={setLeaveNotes} multiline placeholder={isEs ? 'Escriba el motivo aquí...' : 'Enter details...'} style={[styles.input, { height: 80 }]} />

                                    <View style={styles.formActions}>
                                        <TouchableOpacity onPress={submitLeaveRequest} disabled={actionLoading} style={[styles.submitBtn, { backgroundColor: tp[600] }]}>
                                            <Text style={styles.submitBtnText}>{actionLoading ? '...' : (isEs ? 'Enviar' : 'Submit Request')}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => setActiveTab('clock')} style={styles.cancelBtn}>
                                            <Text style={styles.cancelBtnText}>{isEs ? 'Regresar' : 'Go Back'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ) : activeTab === 'calendar' ? (
                                /* Weekly Schedule view */
                                <View style={styles.calendarContainer}>
                                    <Text style={styles.calendarTitle}>{isEs ? 'Mi Programación Semanal' : 'My Weekly Shift Schedule'}</Text>
                                    <Text style={styles.calendarSubtitle}>{isEs ? 'Los turnos asignados por la administración para esta semana:' : 'Assigned work shifts by manager for this week:'}</Text>
                                    
                                    <View style={styles.calendarList}>
                                        {(() => {
                                            const DAYS_OF_WEEK = [
                                                { key: 1, label: isEs ? 'Lunes' : 'Monday' },
                                                { key: 2, label: isEs ? 'Martes' : 'Tuesday' },
                                                { key: 3, label: isEs ? 'Miércoles' : 'Wednesday' },
                                                { key: 4, label: isEs ? 'Jueves' : 'Thursday' },
                                                { key: 5, label: isEs ? 'Viernes' : 'Friday' },
                                                { key: 6, label: isEs ? 'Sábado' : 'Saturday' },
                                                { key: 0, label: isEs ? 'Domingo' : 'Sunday' },
                                            ];
                                            const currentDayOfWeek = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
                                            
                                            return DAYS_OF_WEEK.map(day => {
                                                const shift = scheduleList.find(s => s.day_of_week === day.key);
                                                const isToday = day.key === currentDayOfWeek;
                                                
                                                return (
                                                    <View key={day.key} style={[
                                                        styles.calendarDayCard,
                                                        isToday ? { borderColor: tp[600] || '#14b8a6', borderWidth: 2, backgroundColor: tp[50] || '#f0fdfa' } : null
                                                    ]}>
                                                        <View style={styles.dayMeta}>
                                                            <Text style={[styles.dayLabel, isToday ? { color: tp[700] || '#0f766e', fontWeight: '900' } : null]}>
                                                                {day.label}
                                                            </Text>
                                                            {isToday && (
                                                                <View style={[styles.todayBadge, { backgroundColor: tp[600] || '#14b8a6' }]}>
                                                                    <Text style={styles.todayBadgeText}>{isEs ? 'HOY' : 'TODAY'}</Text>
                                                                </View>
                                                            )}
                                                        </View>
                                                        
                                                        <View style={styles.shiftTimeContainer}>
                                                            {shift ? (
                                                                <Text style={[styles.shiftTimeText, isToday ? { color: tp[800] || '#115e59', fontWeight: '800' } : null]}>
                                                                    🕒 {shift.start_time.substring(0, 5)} - {shift.end_time.substring(0, 5)}
                                                                </Text>
                                                            ) : (
                                                                <Text style={styles.offTimeText}>
                                                                    🌴 {isEs ? 'Día Libre' : 'Day Off'}
                                                                </Text>
                                                            )}
                                                        </View>
                                                    </View>
                                                );
                                            });
                                        })()}
                                    </View>
                                </View>
                            ) : (
                                /* Clock Buttons view */
                                <View>
                                    {/* Current State Indicator */}
                                    <View style={styles.statusBox}>
                                        <Text style={styles.statusLabel}>{isEs ? 'Estado Actual Today:' : 'Current Status Today:'}</Text>
                                        <Text style={[styles.statusValue, { color: tp[700] }]}>
                                            {currentStatus 
                                                ? `${getPunchName(currentStatus.type)} (${currentStatus.time})`
                                                : (isEs ? 'Sin Entrada Registrada' : 'Clocked Out / Not Punched')}
                                        </Text>
                                    </View>

                                    {/* Action Punch Buttons */}
                                    <View style={styles.buttonsGrid}>
                                        {/* Clock In */}
                                        {(!currentStatus || currentStatus.type === 'clock_out') && (
                                            <TouchableOpacity onPress={() => handlePunch('clock_in')} disabled={actionLoading} style={[styles.punchBtn, { backgroundColor: '#10b981' }]}>
                                                <Text style={styles.punchBtnText}>📥 {isEs ? 'Marcar Entrada' : 'Clock In'}</Text>
                                            </TouchableOpacity>
                                        )}

                                        {/* Clocked In Options */}
                                        {currentStatus && (currentStatus.type === 'clock_in' || currentStatus.type === 'break_end' || currentStatus.type === 'lunch_end') && (
                                            <>
                                                {enableBreaks && (
                                                    <TouchableOpacity onPress={() => handlePunch('break_start')} disabled={actionLoading} style={[styles.punchBtn, { backgroundColor: '#f59e0b' }]}>
                                                        <Text style={styles.punchBtnText}>☕ {isEs ? 'Iniciar Receso' : 'Start Break'}</Text>
                                                    </TouchableOpacity>
                                                )}
                                                <TouchableOpacity onPress={() => handlePunch('lunch_start')} disabled={actionLoading} style={[styles.punchBtn, { backgroundColor: '#3b82f6' }]}>
                                                    <Text style={styles.punchBtnText}>🍔 {isEs ? 'Iniciar Almuerzo' : 'Start Lunch'}</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => handlePunch('clock_out')} disabled={actionLoading} style={[styles.punchBtn, { backgroundColor: '#ef4444' }]}>
                                                    <Text style={styles.punchBtnText}>📤 {isEs ? 'Marcar Salida' : 'Clock Out'}</Text>
                                                </TouchableOpacity>
                                            </>
                                        )}

                                        {/* On Break */}
                                        {currentStatus && currentStatus.type === 'break_start' && (
                                            <TouchableOpacity onPress={() => handlePunch('break_end')} disabled={actionLoading} style={[styles.punchBtn, { backgroundColor: '#f59e0b' }]}>
                                                <Text style={styles.punchBtnText}>☕ {isEs ? 'Finalizar Receso' : 'End Break'}</Text>
                                            </TouchableOpacity>
                                        )}

                                        {/* On Lunch */}
                                        {currentStatus && currentStatus.type === 'lunch_start' && (
                                            <TouchableOpacity onPress={() => handlePunch('lunch_end')} disabled={actionLoading} style={[styles.punchBtn, { backgroundColor: '#3b82f6' }]}>
                                                <Text style={styles.punchBtnText}>🍔 {isEs ? 'Finalizar Almuerzo' : 'End Lunch'}</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {/* punches logs list */}
                                    <View style={styles.logsSection}>
                                        <Text style={styles.sectionTitle}>{isEs ? 'Historial de Hoy' : 'Punches Log Today'}</Text>
                                        {punchesToday.length === 0 ? (
                                            <Text style={styles.emptyLogsText}>{isEs ? 'No ha realizado marcaciones el día de hoy.' : 'No shift punch logs registered today.'}</Text>
                                        ) : (
                                            punchesToday.map(p => (
                                                <View key={p.id} style={styles.logRow}>
                                                    <Text style={styles.logName}>{getPunchName(p.type)}</Text>
                                                    <Text style={styles.logTime}>{new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                                </View>
                                            ))
                                        )}
                                    </View>
                                </View>
                            )}
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
    },
    modalCard: {
        backgroundColor: 'white',
        borderRadius: 24,
        width: '95%',
        maxWidth: 480,
        maxHeight: '90%',
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 20,
        overflow: 'hidden'
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6'
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '900',
        color: '#111827'
    },
    headerUser: {
        fontSize: 14,
        color: '#6b7280',
        marginTop: 4,
        fontWeight: '600'
    },
    closeBtn: {
        backgroundColor: '#f3f4f6',
        padding: 10,
        borderRadius: 10
    },
    closeBtnText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#374151'
    },
    loadingContainer: {
        height: 300,
        alignItems: 'center',
        justifyContent: 'center'
    },
    content: {
        padding: 24,
        flexGrow: 0
    },
    statusBox: {
        backgroundColor: '#f9fafb',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        marginBottom: 20,
        alignItems: 'center'
    },
    statusLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#9ca3af',
        textTransform: 'uppercase',
        letterSpacing: 0.5
    },
    statusValue: {
        fontSize: 18,
        fontWeight: '900',
        marginTop: 6
    },
    buttonsGrid: {
        gap: 12
    },
    punchBtn: {
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3
    },
    punchBtnText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold'
    },
    leaveTriggerBtn: {
        marginTop: 20,
        backgroundColor: '#eef2ff',
        borderWidth: 1,
        borderColor: '#c7d2fe',
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center'
    },
    leaveTriggerBtnText: {
        color: '#4f46e5',
        fontWeight: 'bold',
        fontSize: 13
    },
    logsSection: {
        marginTop: 24,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6'
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#374151',
        marginBottom: 12
    },
    emptyLogsText: {
        fontSize: 13,
        color: '#9ca3af',
        fontStyle: 'italic',
        textAlign: 'center',
        paddingVertical: 8
    },
    logRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f9fafb'
    },
    logName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4b5563'
    },
    logTime: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#9ca3af',
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'
    },
    formContainer: {
        gap: 12
    },
    label: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: 0.5
    },
    input: {
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 12,
        padding: 12,
        fontSize: 14,
        color: '#111827'
    },
    typeSelectorRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 4
    },
    typeBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: '#d1d5db',
        backgroundColor: 'white',
        alignItems: 'center'
    },
    typeBtnText: {
        fontWeight: 'bold',
        fontSize: 13
    },
    formActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 12,
        paddingBottom: 20
    },
    submitBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center'
    },
    submitBtnText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 15
    },
    cancelBtn: {
        flex: 1,
        backgroundColor: '#f3f4f6',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center'
    },
    cancelBtnText: {
        color: '#4b5563',
        fontWeight: 'bold',
        fontSize: 15
    },
    tabsRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
        backgroundColor: '#fafafa'
    },
    tabBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent'
    },
    tabText: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#6b7280'
    },
    calendarContainer: {
        paddingVertical: 4
    },
    calendarTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#1f2937'
    },
    calendarSubtitle: {
        fontSize: 12,
        color: '#6b7280',
        marginTop: 4,
        marginBottom: 16
    },
    calendarList: {
        gap: 8
    },
    calendarDayCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        padding: 14
    },
    dayMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    dayLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#4b5563'
    },
    todayBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6
    },
    todayBadgeText: {
        color: 'white',
        fontSize: 9,
        fontWeight: 'bold'
    },
    shiftTimeContainer: {
        alignItems: 'flex-end'
    },
    shiftTimeText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1f2937'
    },
    offTimeText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#9ca3af',
        fontStyle: 'italic'
    }
});
