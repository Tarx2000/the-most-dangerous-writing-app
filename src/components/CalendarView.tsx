import React from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { theme } from '../styles/theme';
import { useStorage } from '../hooks/useStorage';

const { width } = Dimensions.get('window');
const CALENDAR_WIDTH = width * 0.85;
const DAY_SIZE = (CALENDAR_WIDTH - 60) / 7;

export const CalendarView: React.FC = () => {
    const { savedNotes } = useStorage();

    // Group notes by date string to determine which days have records
    const recordDays = React.useMemo(() => {
        const days = new Set<string>();
        savedNotes.forEach(note => {
            const dateObj = new Date(note.timestamp);
            const dateStr = `${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDate()}`;
            days.add(dateStr);
        });
        return days;
    }, [savedNotes]);

    const renderMonth = (monthOffset: number) => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() - monthOffset;

        const targetDate = new Date(year, month, 1);
        const targetMonth = targetDate.getMonth();
        const targetYear = targetDate.getFullYear();

        const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        const firstDay = new Date(targetYear, targetMonth, 1).getDay();

        const monthName = targetDate.toLocaleString('default', { month: 'long', year: 'numeric' });

        const dates = [];
        for (let i = 0; i < firstDay; i++) {
            dates.push(<View key={`empty-${i}`} style={styles.dayContainer} />);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${targetYear}-${targetMonth}-${i}`;
            const hasRecord = recordDays.has(dateStr);
            const isToday = now.getDate() === i && now.getMonth() === targetMonth && now.getFullYear() === targetYear;

            dates.push(
                <View key={`day-${i}`} style={[styles.dayContainer, hasRecord && styles.hasRecord, isToday && styles.isToday]}>
                    <Text style={[styles.dayText, hasRecord && styles.dayTextRecord, isToday && styles.dayTextToday]}>
                        {i}
                    </Text>
                    {hasRecord && <Text style={styles.flameIcon}>🔥</Text>}
                </View>
            );
        }

        return (
            <View key={`month-${monthOffset}`} style={styles.monthContainer}>
                <Text style={styles.monthTitle}>{monthName}</Text>
                <View style={styles.weekDaysRow}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                        <Text key={`wd-${i}`} style={styles.weekDayText}>{d}</Text>
                    ))}
                </View>
                <View style={styles.daysGrid}>
                    {dates}
                </View>
            </View>
        );
    };

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            {renderMonth(0)}
            {renderMonth(1)}
            {renderMonth(2)}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        maxHeight: 500,
    },
    monthContainer: {
        marginBottom: 30,
        backgroundColor: theme.colors.glassBackground,
        borderRadius: theme.borderRadius.md,
        padding: 15,
        borderWidth: 1,
        borderColor: theme.colors.glassBorder,
    },
    monthTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontWeight: theme.typography.weightBold,
        marginBottom: 15,
        textAlign: 'center',
    },
    weekDaysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    weekDayText: {
        color: theme.colors.textMuted,
        width: DAY_SIZE,
        textAlign: 'center',
        fontWeight: theme.typography.weightMedium,
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
    },
    dayContainer: {
        width: DAY_SIZE,
        height: DAY_SIZE + 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: (CALENDAR_WIDTH - 30 - DAY_SIZE * 7) / 14,
        marginBottom: 5,
        borderRadius: theme.borderRadius.sm,
    },
    hasRecord: {
        backgroundColor: 'rgba(255, 77, 77, 0.15)',
        borderWidth: 1,
        borderColor: theme.colors.danger,
    },
    isToday: {
        borderWidth: 1,
        borderColor: theme.colors.textPrimary,
    },
    dayText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
    },
    dayTextRecord: {
        color: theme.colors.danger,
        fontWeight: theme.typography.weightBold,
    },
    dayTextToday: {
        color: theme.colors.textPrimary,
        fontWeight: theme.typography.weightBold,
    },
    flameIcon: {
        fontSize: 10,
        marginTop: 2,
    }
});
