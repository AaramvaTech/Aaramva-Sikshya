import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { todayBs, formatBs } from 'bs-calendar';

import { useMyChildren, useChildTimetable } from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import type { SectionTimetableSlot } from '../../types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ParentTimetable() {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(() => new Date().getDay());

  const selectedChildId = useAuthStore((s) => s.selectedChildId);
  const setSelectedChildId = useAuthStore((s) => s.setSelectedChildId);
  const childrenQuery = useMyChildren();
  const children = childrenQuery.data ?? [];
  const effectiveChildId: string | null = selectedChildId ?? (children[0]?.id ?? null);
  if (!selectedChildId && effectiveChildId) setSelectedChildId(effectiveChildId);

  const selectedChild = children.find((c) => c.id === effectiveChildId) ?? null;
  const sectionId = selectedChild?.currentEnrollment?.sectionId ?? null;

  const timetableQuery = useChildTimetable(sectionId);
  const slots = timetableQuery.data ?? [];

  const todayDow = new Date().getDay();

  const daySlots: SectionTimetableSlot[] = slots
    .filter((s) => s.dayOfWeek === selectedDay)
    .sort((a, b) => a.periodNumber - b.periodNumber);

  const onRefresh = async () => {
    setRefreshing(true);
    await timetableQuery.refetch();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e3a5f" />}
    >
      <LinearGradient
        colors={['#0f172a', '#1e3a5f', '#1e40af']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 56, paddingBottom: 72, paddingHorizontal: 20 }}
      >
        <Text style={{ color: '#93c5fd', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          {selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : 'Timetable'}
        </Text>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 4 }}>
          Timetable
        </Text>
        <Text style={{ color: '#bfdbfe', fontSize: 13 }}>
          {formatBs(todayBs(), 'en')}
        </Text>

        {/* Child picker */}
        {children.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            {children.map((c) => {
              const sel = c.id === effectiveChildId;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={{
                    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                    backgroundColor: sel ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)',
                    marginRight: 8,
                  }}
                  onPress={() => setSelectedChildId(c.id)}
                >
                  <Text style={{ color: sel ? '#1e3a5f' : '#bfdbfe', fontSize: 13, fontWeight: '600' }}>
                    {c.firstName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </LinearGradient>

      <View style={{ marginTop: -52, paddingHorizontal: 16, paddingBottom: 32 }}>
        {/* Day selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 12 }}
        >
          {DAY_NAMES.map((name, dow) => {
            const isSat = dow === 6;
            const isToday = dow === todayDow;
            const isSelected = dow === selectedDay;
            return (
              <TouchableOpacity
                key={dow}
                disabled={isSat}
                onPress={() => setSelectedDay(dow)}
                style={[
                  styles.dayChip,
                  isSelected && styles.dayChipActive,
                  isSat && { opacity: 0.4 },
                ]}
              >
                <Text style={[styles.dayChipText, isSelected && styles.dayChipTextActive]}>
                  {name.slice(0, 3)}
                </Text>
                {isToday && (
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: isSelected ? '#bfdbfe' : '#1e3a5f', marginTop: 3 }} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Periods */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{DAY_NAMES[selectedDay].toUpperCase()} PERIODS</Text>

          {timetableQuery.isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <ActivityIndicator size="small" color="#1e3a5f" />
            </View>
          ) : selectedDay === 6 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Ionicons name="sunny-outline" size={40} color="#d1d5db" />
              <Text style={{ color: '#9ca3af', fontSize: 14, fontWeight: '500', marginTop: 10 }}>
                Saturday — no school
              </Text>
            </View>
          ) : daySlots.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Ionicons name="moon-outline" size={40} color="#d1d5db" />
              <Text style={{ color: '#9ca3af', fontSize: 14, fontWeight: '500', marginTop: 10 }}>
                No periods
              </Text>
            </View>
          ) : (
            daySlots.map((p, idx) => (
              <View
                key={p.slotId}
                style={[
                  styles.periodRow,
                  idx < daySlots.length - 1 && styles.periodBorder,
                ]}
              >
                <View style={styles.periodBadge}>
                  <Text style={styles.periodBadgeText}>{p.periodNumber}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', flex: 1, marginRight: 8 }}>
                      {p.subject.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>
                      {p.startTime}–{p.endTime}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#9ca3af' }}>
                    {p.teacher.fullName}{p.room ? ` · Room ${p.room}` : ''}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafb' },
  card: {
    backgroundColor: 'white', borderRadius: 24, padding: 20, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  cardLabel: {
    fontSize: 11, color: '#6b7280', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14,
  },
  dayChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    backgroundColor: 'white', marginRight: 8, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  dayChipActive: { backgroundColor: '#1e3a5f' },
  dayChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  dayChipTextActive: { color: 'white' },
  periodRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12 },
  periodBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  periodBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#dbeafe', alignItems: 'center',
    justifyContent: 'center', marginRight: 12, marginTop: 2,
  },
  periodBadgeText: { color: '#1e3a5f', fontSize: 12, fontWeight: '800' },
});
