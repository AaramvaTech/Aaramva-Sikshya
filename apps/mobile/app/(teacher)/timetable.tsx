import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { useMyTimetable } from '../../hooks/useTeacher';
import type { TeacherSlotItem } from '../../types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SUBJECT_COLORS = [
  { bg: '#dbeafe', text: '#1e40af', bar: '#2563eb' },
  { bg: '#d1fae5', text: '#065f46', bar: '#059669' },
  { bg: '#ede9fe', text: '#5b21b6', bar: '#7c3aed' },
  { bg: '#fef3c7', text: '#92400e', bar: '#d97706' },
  { bg: '#fce7f3', text: '#9d174d', bar: '#db2777' },
  { bg: '#cffafe', text: '#155e75', bar: '#0891b2' },
  { bg: '#ffedd5', text: '#9a3412', bar: '#ea580c' },
  { bg: '#f0fdf4', text: '#14532d', bar: '#16a34a' },
];

function todayDayOfWeekNepal(): number {
  const offset = 5 * 60 + 45;
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + offset * 60000).getDay();
}

function SlotCard({ slot, idx }: { slot: TeacherSlotItem; idx: number }) {
  const color = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
  return (
    <View style={{
      backgroundColor: 'white', borderRadius: 20, marginBottom: 10,
      shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
      overflow: 'hidden',
    }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 5, backgroundColor: color.bar }} />
        <View style={{
          width: 62, alignItems: 'center', justifyContent: 'center',
          paddingVertical: 16, borderRightWidth: 1, borderRightColor: '#f3f4f6',
          marginRight: 14,
        }}>
          <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600' }}>
            {slot.startTime}
          </Text>
          <View style={{
            width: 32, height: 32, borderRadius: 10,
            backgroundColor: color.bg, alignItems: 'center',
            justifyContent: 'center', marginVertical: 6,
          }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: color.text }}>
              P{slot.periodNumber}
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600' }}>
            {slot.endTime}
          </Text>
        </View>
        <View style={{ flex: 1, paddingVertical: 14, paddingRight: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
            {slot.subject.code && (
              <View style={{
                backgroundColor: color.bg, borderRadius: 8,
                paddingHorizontal: 8, paddingVertical: 2,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: color.text }}>
                  {slot.subject.code}
                </Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 6 }}>
            {slot.subject.name}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="people-outline" size={12} color="#9ca3af" />
              <Text style={{ fontSize: 12, color: '#6b7280', marginLeft: 4 }}>
                {slot.className} · {slot.section}
              </Text>
            </View>
            {slot.room && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="location-outline" size={12} color="#9ca3af" />
                <Text style={{ fontSize: 12, color: '#6b7280', marginLeft: 4 }}>
                  Room {slot.room}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

export default function TeacherTimetable() {
  const todayDow = todayDayOfWeekNepal();
  const [selectedDay, setSelectedDay] = useState(todayDow === 6 ? 0 : todayDow);
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, isError, refetch } = useMyTimetable();

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const slots = data?.schedule[selectedDay] ?? [];
  const isSaturday = selectedDay === 6;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f9fafb' }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e40af" />}
    >
      {/* Header */}
      <LinearGradient
        colors={['#1e3a8a', '#1e40af', '#2563eb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 56, paddingBottom: 24, paddingHorizontal: 20 }}
      >
        <Text style={{ color: '#bfdbfe', fontSize: 12, fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          Weekly Timetable
        </Text>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 4 }}>
          {DAY_NAMES[selectedDay]}
        </Text>
        {data && slots.length > 0 && (
          <Text style={{ color: '#93c5fd', fontSize: 13 }}>
            {slots.length} period{slots.length !== 1 ? 's' : ''}
          </Text>
        )}
      </LinearGradient>

      {/* Day selector */}
      <View style={{ backgroundColor: 'white', paddingVertical: 12, paddingHorizontal: 8,
        borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingHorizontal: 4 }}>
          {DAY_LABELS.map((label, dow) => {
            const isSelected = selectedDay === dow;
            const isToday = dow === todayDow;
            const isSat = dow === 6;
            return (
              <TouchableOpacity
                key={dow}
                onPress={() => setSelectedDay(dow)}
                style={{
                  width: 44, height: 56, borderRadius: 14, alignItems: 'center',
                  justifyContent: 'center', gap: 2,
                  backgroundColor: isSelected ? '#1e40af' : isSat ? '#fef9ee' : '#f9fafb',
                  borderWidth: isToday && !isSelected ? 1.5 : 0,
                  borderColor: '#1e40af',
                }}
              >
                <Text style={{
                  fontSize: 10, fontWeight: '700',
                  color: isSelected ? 'rgba(255,255,255,0.75)' : isSat ? '#d97706' : '#6b7280',
                }}>
                  {label}
                </Text>
                <Text style={{
                  fontSize: 13, fontWeight: '800',
                  color: isSelected ? 'white' : isSat ? '#d97706' : '#374151',
                }}>
                  {dow + 1}
                </Text>
                {isToday && (
                  <View style={{
                    width: 4, height: 4, borderRadius: 2,
                    backgroundColor: isSelected ? 'white' : '#1e40af',
                  }} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}>
        {isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <ActivityIndicator size="large" color="#1e40af" />
            <Text style={{ color: '#9ca3af', marginTop: 12 }}>Loading timetable...</Text>
          </View>
        ) : isError ? (
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <Ionicons name="cloud-offline-outline" size={48} color="#d1d5db" />
            <Text style={{ color: '#374151', fontWeight: '600', marginTop: 12 }}>Failed to load</Text>
            <TouchableOpacity
              onPress={() => refetch()}
              style={{ backgroundColor: '#1e40af', paddingHorizontal: 24,
                paddingVertical: 10, borderRadius: 12, marginTop: 12 }}
            >
              <Text style={{ color: 'white', fontWeight: '700' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : isSaturday ? (
          <View style={{
            backgroundColor: 'white', borderRadius: 20, padding: 32, alignItems: 'center',
            shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
          }}>
            <Ionicons name="sunny-outline" size={44} color="#d97706" />
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827', marginTop: 12 }}>
              Saturday — Rest Day
            </Text>
            <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 6, textAlign: 'center' }}>
              No classes are scheduled on Saturdays.
            </Text>
          </View>
        ) : slots.length === 0 ? (
          <View style={{
            backgroundColor: 'white', borderRadius: 20, padding: 32, alignItems: 'center',
            shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
          }}>
            <Ionicons name="calendar-clear-outline" size={44} color="#d1d5db" />
            <Text style={{ color: '#9ca3af', marginTop: 12, fontSize: 14 }}>
              No classes for {DAY_NAMES[selectedDay]}.
            </Text>
          </View>
        ) : (
          slots.map((slot, idx) => (
            <SlotCard key={slot.slotId} slot={slot} idx={idx} />
          ))
        )}
      </View>
    </ScrollView>
  );
}
