import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useMyStaffProfile, useMyTimetable } from '../../hooks/useTeacher';
import { logout } from '../../lib/session';
import { todayBs, formatBs } from 'bs-calendar';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
  const nepalDate = new Date(utcMs + offset * 60000);
  return nepalDate.getDay();
}

function getGreeting(): string {
  const offset = 5 * 60 + 45;
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const nepalDate = new Date(utcMs + offset * 60000);
  const hour = nepalDate.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function TeacherHome() {
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const profileResult = useMyStaffProfile();
  const timetableResult = useMyTimetable();

  const todayDow = todayDayOfWeekNepal();
  const isSaturday = todayDow === 6;

  const todaySlots = useMemo(() => {
    if (!timetableResult.data) return [];
    return timetableResult.data.schedule[todayDow] ?? [];
  }, [timetableResult.data, todayDow]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([profileResult.refetch(), timetableResult.refetch()]);
    setRefreshing(false);
  };

  const teacherName = profileResult.data
    ? `${profileResult.data.firstName} ${profileResult.data.lastName}`
    : '...';

  const bsToday = todayBs();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f9fafb' }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e40af" />
      }
    >
      {/* Header */}
      <LinearGradient
        colors={['#1e3a8a', '#1e40af', '#2563eb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 56, paddingBottom: 28, paddingHorizontal: 20 }}
      >
        <Text style={{ color: '#bfdbfe', fontSize: 12, fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          {getGreeting()}
        </Text>
        {profileResult.isLoading ? (
          <ActivityIndicator color="white" style={{ alignSelf: 'flex-start', marginBottom: 6 }} />
        ) : (
          <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 4 }}>
            {teacherName}
          </Text>
        )}
        {profileResult.data?.designationTitle && (
          <Text style={{ color: '#93c5fd', fontSize: 13, fontWeight: '500', marginBottom: 8 }}>
            {profileResult.data.designationTitle}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <Ionicons name="calendar-outline" size={13} color="#93c5fd" />
          <Text style={{ color: '#93c5fd', fontSize: 13, marginLeft: 5 }}>
            {DAY_NAMES[todayDow]} · {formatBs(bsToday, 'en')}
          </Text>
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 12 }}>

        {/* Today's classes card */}
        <View style={{
          backgroundColor: 'white', borderRadius: 20, padding: 16,
          shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '700',
              textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Today's Classes
            </Text>
            {!isSaturday && todaySlots.length > 0 && (
              <View style={{
                backgroundColor: '#eff6ff', borderRadius: 10,
                paddingHorizontal: 10, paddingVertical: 3,
              }}>
                <Text style={{ fontSize: 11, color: '#1e40af', fontWeight: '700' }}>
                  {todaySlots.length} period{todaySlots.length !== 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>

          {timetableResult.isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <ActivityIndicator size="small" color="#1e40af" />
            </View>
          ) : isSaturday ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Ionicons name="sunny-outline" size={36} color="#d97706" />
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#374151', marginTop: 8 }}>
                Saturday — Rest Day
              </Text>
              <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
                No classes scheduled. Rest and recharge!
              </Text>
            </View>
          ) : todaySlots.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Ionicons name="calendar-clear-outline" size={36} color="#d1d5db" />
              <Text style={{ fontSize: 14, color: '#9ca3af', marginTop: 8 }}>
                No classes scheduled for today.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {todaySlots.map((slot, idx) => {
                const color = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
                return (
                  <View
                    key={slot.slotId}
                    style={{
                      flexDirection: 'row', borderRadius: 14,
                      overflow: 'hidden', backgroundColor: '#f9fafb',
                      borderWidth: 1, borderColor: '#f3f4f6',
                    }}
                  >
                    <View style={{ width: 4, backgroundColor: color.bar }} />
                    <View style={{
                      width: 52, alignItems: 'center', justifyContent: 'center',
                      borderRightWidth: 1, borderRightColor: '#f3f4f6',
                      paddingVertical: 10,
                    }}>
                      <View style={{
                        width: 28, height: 28, borderRadius: 8,
                        backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: color.text }}>
                          P{slot.periodNumber}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 4, fontWeight: '600' }}>
                        {slot.startTime}
                      </Text>
                    </View>
                    <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 3 }}>
                        {slot.subject.name}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="people-outline" size={11} color="#9ca3af" />
                          <Text style={{ fontSize: 12, color: '#6b7280', marginLeft: 3 }}>
                            {slot.className} · {slot.section}
                          </Text>
                        </View>
                        {slot.room && (
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="location-outline" size={11} color="#9ca3af" />
                            <Text style={{ fontSize: 12, color: '#6b7280', marginLeft: 3 }}>
                              Room {slot.room}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Quick actions */}
        <View style={{
          backgroundColor: 'white', borderRadius: 20, padding: 16,
          shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
        }}>
          <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
            Quick Actions
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => router.push('/(teacher)/attendance')}
              style={{
                flex: 1, backgroundColor: '#1e40af', borderRadius: 14,
                paddingVertical: 12, alignItems: 'center', gap: 4,
              }}
            >
              <Ionicons name="checkbox-outline" size={20} color="white" />
              <Text style={{ color: 'white', fontSize: 12, fontWeight: '700' }}>
                Mark Attendance
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/(teacher)/leave')}
              style={{
                flex: 1, backgroundColor: '#eff6ff', borderRadius: 14,
                paddingVertical: 12, alignItems: 'center', gap: 4,
              }}
            >
              <Ionicons name="document-text-outline" size={20} color="#1e40af" />
              <Text style={{ color: '#1e40af', fontSize: 12, fontWeight: '700' }}>
                Apply Leave
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Staff info card */}
        {profileResult.data && (
          <View style={{
            backgroundColor: 'white', borderRadius: 20, padding: 16,
            shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
          }}>
            <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '700',
              textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
              My Details
            </Text>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: '#6b7280' }}>Employee ID</Text>
                <Text style={{ fontSize: 13, color: '#111827', fontWeight: '600' }}>
                  {profileResult.data.employeeId}
                </Text>
              </View>
              {profileResult.data.departmentName && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: '#6b7280' }}>Department</Text>
                  <Text style={{ fontSize: 13, color: '#111827', fontWeight: '600' }}>
                    {profileResult.data.departmentName}
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: '#6b7280' }}>Employment</Text>
                <Text style={{ fontSize: 13, color: '#111827', fontWeight: '600' }}>
                  {profileResult.data.employmentType}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Logout */}
        <TouchableOpacity
          onPress={logout}
          style={{
            backgroundColor: 'white', borderRadius: 20, padding: 16,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
          }}
        >
          <Ionicons name="log-out-outline" size={18} color="#ef4444" />
          <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '700' }}>Sign Out</Text>
        </TouchableOpacity>

      </View>
    </ScrollView>
  );
}
