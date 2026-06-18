import {
  View, Text, ScrollView,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { useMyTimetable } from '../../hooks/useStudentMe';
import BsDate from '../../components/BsDate';
import NpText from '../../components/NpText';
import Skeleton from '../../components/Skeleton';
import type { TimetablePeriod } from '../../types';
import { useThemeColors, headerGradient, deriveOnPrimary } from '../../lib/theme/colors';

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
  const c = useThemeColors();
  const onPrimary = deriveOnPrimary(c.primary);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1 }} className="bg-background">
        <Skeleton style={{ height: 180 }} className="rounded-none" />
        <View style={{ paddingHorizontal: 16, marginTop: -48, gap: 12 }}>
          <Skeleton style={{ height: 72 }} className="rounded-2xl" />
          <Skeleton style={{ height: 72 }} className="rounded-2xl" />
          <Skeleton style={{ height: 72 }} className="rounded-2xl" />
          <Skeleton style={{ height: 72 }} className="rounded-2xl" />
          <Skeleton style={{ height: 72 }} className="rounded-2xl" />
        </View>
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }} className="bg-background">
        <Ionicons name="cloud-offline-outline" size={52} color={c.placeholderIcon} />
        <Text style={{ fontWeight: '600', marginTop: 12, fontSize: 16 }} className="text-foreground">Couldn't load today's classes</Text>
        <Text style={{ fontSize: 14, marginTop: 4, textAlign: 'center' }} className="text-muted-foreground">Check your connection and try again.</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={{ paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 16 }}
          className="bg-primary"
        >
          <Text style={{ fontWeight: '700' }} className="text-primary-foreground">Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentIdx = data.periods.findIndex(isCurrentPeriod);
  const totalPeriods = data.periods.length;

  return (
    <ScrollView
      style={{ flex: 1 }}
      className="bg-background"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
    >
      {/* Header */}
      <LinearGradient
        colors={headerGradient(c.primary) as [string, string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 56, paddingBottom: 72, paddingHorizontal: 20 }}
      >
        {/* onPrimary.bright — documented accent exception: on-primary decorative tint */}
        <Text style={{ fontSize: 12, fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
          color: onPrimary.bright }}>
          {DAY_NAMES[data.dayOfWeek]}
        </Text>
        <Text style={{ fontSize: 24, fontWeight: '800', marginBottom: 6 }} className="text-primary-foreground">
          Today's Classes
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* onPrimary.bright — documented accent exception: on-primary decorative tint */}
          <Ionicons name="calendar-outline" size={13} color={onPrimary.bright} />
          <View style={{ marginLeft: 6 }}>
            <BsDate isoDate={`${data.dateAd}T12:00:00.000Z`} />
          </View>
        </View>
        {data.isSchoolDay && totalPeriods > 0 && (
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            borderRadius: 20,
            paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 10,
          }} className="bg-white/12">
            {/* onPrimary.soft — documented accent exception: on-primary decorative tint */}
            <Ionicons name="book-outline" size={12} color={onPrimary.soft} />
            <Text style={{ fontSize: 12, fontWeight: '600', marginLeft: 5, color: onPrimary.soft }}>
              {totalPeriods} {totalPeriods === 1 ? 'period' : 'periods'} today
            </Text>
          </View>
        )}
      </LinearGradient>

      <View style={{ marginTop: -52, paddingHorizontal: 16, paddingBottom: 32 }}>
        {!data.isSchoolDay ? (
          <View style={{
            borderRadius: 20, padding: 32,
            alignItems: 'center', shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
          }} className="bg-surface">
            <View style={{
              width: 72, height: 72, borderRadius: 24,
              alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }} className="bg-primary/10">
              <Ionicons name="sunny" size={36} color={c.primary} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }} className="text-foreground">
              No school today
            </Text>
            <Text style={{ fontSize: 14, textAlign: 'center' }} className="text-muted-foreground">
              {data.dayOfWeek === 6
                ? "Saturday's a holiday — rest up."
                : "You're not in a class yet. Ask your school to add you."}
            </Text>
          </View>
        ) : totalPeriods === 0 ? (
          <View style={{
            borderRadius: 20, padding: 32,
            alignItems: 'center', shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
          }} className="bg-surface">
            <Ionicons name="calendar-clear-outline" size={44} color={c.placeholderIcon} />
            <Text style={{ marginTop: 12, fontSize: 14 }} className="text-muted-foreground">Nothing scheduled for today.</Text>
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
                className="bg-surface"
              >
                {/* Current class live banner */}
                {isCurrent && (
                  <View style={{
                    backgroundColor: color.bar, flexDirection: 'row',
                    alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6,
                  }}>
                    <View style={{
                      width: 7, height: 7, borderRadius: 4,
                      marginRight: 7,
                    }} className="bg-white" />
                    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1 }} className="text-white">
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
                    paddingVertical: 16, marginRight: 14,
                  }} className="border-r border-border">
                    <Text style={{ fontSize: 11, fontWeight: '600' }} className="text-muted-foreground">
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
                    <Text style={{ fontSize: 11, fontWeight: '600' }} className="text-muted-foreground">
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
                          borderRadius: 8,
                          paddingHorizontal: 8, paddingVertical: 2,
                        }} className="bg-primary/10">
                          <Text style={{ fontSize: 10, fontWeight: '700' }} className="text-primary">UPCOMING</Text>
                        </View>
                      )}
                    </View>

                    <NpText style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }} className="text-foreground">
                      {period.subject.name}
                    </NpText>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="person-outline" size={12} color={c.mutedForeground} />
                        <NpText style={{ fontSize: 12, marginLeft: 4 }} className="text-muted-foreground">
                          {period.teacher.fullName}
                        </NpText>
                      </View>
                      {period.room && (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="location-outline" size={12} color={c.mutedForeground} />
                          <Text style={{ fontSize: 12, marginLeft: 4 }} className="text-muted-foreground">
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
