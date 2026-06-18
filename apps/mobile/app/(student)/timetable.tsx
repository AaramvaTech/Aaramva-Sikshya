import {
  View, Text, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { useMyTimetable } from '../../hooks/useStudentMe';
import BsDate from '../../components/BsDate';
import type { TimetablePeriod } from '../../types';

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const SUBJECT_COLORS = [
  { bg: '#d1fae5', text: '#065f46', bar: '#065f46' },
  { bg: '#dbeafe', text: '#1e40af', bar: '#2563eb' },
  { bg: '#ede9fe', text: '#5b21b6', bar: '#7c3aed' },
  { bg: '#fef3c7', text: '#92400e', bar: '#d97706' },
  { bg: '#fce7f3', text: '#9d174d', bar: '#db2777' },
  { bg: '#cffafe', text: '#155e75', bar: '#0891b2' },
  { bg: '#ffedd5', text: '#9a3412', bar: '#ea580c' },
  { bg: '#f0fdf4', text: '#14532d', bar: '#16a34a' },
];

function isCurrentPeriod(period: TimetablePeriod): boolean {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = period.startTime.split(':').map(Number);
  const [eh, em] = period.endTime.split(':').map(Number);
  return nowMin >= sh * 60 + sm && nowMin < eh * 60 + em;
}

function isUpcomingPeriod(period: TimetablePeriod): boolean {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = period.startTime.split(':').map(Number);
  return sh * 60 + sm > nowMin;
}

export default function StudentTimetable() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, isError, refetch } = useMyTimetable();

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#065f46" />
        <Text style={{ color: '#9ca3af', marginTop: 12, fontSize: 14 }}>Loading classes...</Text>
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Ionicons name="cloud-offline-outline" size={52} color="#d1d5db" />
        <Text style={{ color: '#374151', fontWeight: '600', marginTop: 12, fontSize: 16 }}>Failed to load</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={{ backgroundColor: '#065f46', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 16 }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentIdx = data.periods.findIndex(isCurrentPeriod);
  const totalPeriods = data.periods.length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f9fafb' }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#065f46" />}
    >
      {/* Header */}
      <LinearGradient
        colors={['#064e3b', '#065f46', '#047857']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 56, paddingBottom: 72, paddingHorizontal: 20 }}
      >
        <Text style={{ color: '#6ee7b7', fontSize: 12, fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          {DAY_NAMES[data.dayOfWeek]}
        </Text>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 6 }}>
          Today's Classes
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="calendar-outline" size={13} color="#6ee7b7" />
          <View style={{ marginLeft: 6 }}>
            <BsDate isoDate={`${data.dateAd}T12:00:00.000Z`} />
          </View>
        </View>
        {data.isSchoolDay && totalPeriods > 0 && (
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20,
            paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 10,
          }}>
            <Ionicons name="book-outline" size={12} color="#a7f3d0" />
            <Text style={{ color: '#a7f3d0', fontSize: 12, fontWeight: '600', marginLeft: 5 }}>
              {totalPeriods} {totalPeriods === 1 ? 'period' : 'periods'} today
            </Text>
          </View>
        )}
      </LinearGradient>

      <View style={{ marginTop: -52, paddingHorizontal: 16, paddingBottom: 32 }}>
        {!data.isSchoolDay ? (
          <View style={{
            backgroundColor: 'white', borderRadius: 20, padding: 32,
            alignItems: 'center', shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
          }}>
            <View style={{
              width: 72, height: 72, borderRadius: 24,
              backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}>
              <Ionicons name="sunny" size={36} color="#065f46" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
              No School Today
            </Text>
            <Text style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center' }}>
              {data.dayOfWeek === 6
                ? 'Saturday is a weekly holiday. Rest and recharge!'
                : 'You are not assigned to a class yet.'}
            </Text>
          </View>
        ) : totalPeriods === 0 ? (
          <View style={{
            backgroundColor: 'white', borderRadius: 20, padding: 32,
            alignItems: 'center', shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
          }}>
            <Ionicons name="calendar-clear-outline" size={44} color="#d1d5db" />
            <Text style={{ color: '#9ca3af', marginTop: 12, fontSize: 14 }}>No classes scheduled for today.</Text>
          </View>
        ) : (
          data.periods.map((period, idx) => {
            const color = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
            const isCurrent = isCurrentPeriod(period);
            const isUpcoming = !isCurrent && isUpcomingPeriod(period);
            const isPast = !isCurrent && !isUpcoming;

            return (
              <View
                key={period.slotId}
                style={{
                  backgroundColor: 'white',
                  borderRadius: 20, marginBottom: 12,
                  shadowColor: isCurrent ? color.bar : '#000',
                  shadowOffset: { width: 0, height: isCurrent ? 6 : 3 },
                  shadowOpacity: isCurrent ? 0.2 : 0.06,
                  shadowRadius: isCurrent ? 16 : 8,
                  elevation: isCurrent ? 8 : 3,
                  borderWidth: isCurrent ? 2 : 0,
                  borderColor: isCurrent ? color.bar : 'transparent',
                  opacity: isPast ? 0.55 : 1,
                  overflow: 'hidden',
                }}
              >
                {/* Current class live banner */}
                {isCurrent && (
                  <View style={{
                    backgroundColor: color.bar, flexDirection: 'row',
                    alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6,
                  }}>
                    <View style={{
                      width: 7, height: 7, borderRadius: 4,
                      backgroundColor: 'white', marginRight: 7,
                    }} />
                    <Text style={{ color: 'white', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>
                      HAPPENING NOW
                    </Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row' }}>
                  {/* Left color accent */}
                  <View style={{ width: 5, backgroundColor: color.bar }} />

                  {/* Time column */}
                  <View style={{
                    width: 60, alignItems: 'center', justifyContent: 'center',
                    paddingVertical: 16, borderRightWidth: 1, borderRightColor: '#f3f4f6',
                    marginRight: 14,
                  }}>
                    <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600' }}>
                      {period.startTime}
                    </Text>
                    <View style={{
                      width: 32, height: 32, borderRadius: 10,
                      backgroundColor: color.bg,
                      alignItems: 'center', justifyContent: 'center', marginVertical: 6,
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: color.text }}>
                        P{period.periodNumber}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600' }}>
                      {period.endTime}
                    </Text>
                  </View>

                  {/* Subject info */}
                  <View style={{ flex: 1, paddingVertical: 14, paddingRight: 12 }}>
                    {/* Subject name + code */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <View style={{
                        backgroundColor: color.bg, borderRadius: 8,
                        paddingHorizontal: 8, paddingVertical: 2, marginRight: 8,
                      }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: color.text }}>
                          {period.subject.code ?? 'SUB'}
                        </Text>
                      </View>
                      {isUpcoming && (
                        <View style={{
                          backgroundColor: '#f0fdf4', borderRadius: 8,
                          paddingHorizontal: 8, paddingVertical: 2,
                        }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#065f46' }}>UPCOMING</Text>
                        </View>
                      )}
                    </View>

                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                      {period.subject.name}
                    </Text>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="person-outline" size={12} color="#9ca3af" />
                        <Text style={{ fontSize: 12, color: '#6b7280', marginLeft: 4 }}>
                          {period.teacher.fullName}
                        </Text>
                      </View>
                      {period.room && (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="location-outline" size={12} color="#9ca3af" />
                          <Text style={{ fontSize: 12, color: '#6b7280', marginLeft: 4 }}>
                            Room {period.room}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
