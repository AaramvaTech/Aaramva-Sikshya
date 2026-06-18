import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, Alert, RefreshControl, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, useMemo } from 'react';
import { useMyLeaveRequests, useLeaveTypes, useApplyLeave } from '../../hooks/useTeacher';
import { todayBs, bsToAd, adToBs, BS_MONTH_NAMES_EN, formatBs } from 'bs-calendar';
import type { BsDate } from 'bs-calendar';
import type { LeaveRequest, LeaveType } from '../../types';

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  PENDING:  { bg: '#fef3c7', text: '#92400e' },
  APPROVED: { bg: '#d1fae5', text: '#065f46' },
  REJECTED: { bg: '#fee2e2', text: '#991b1b' },
  CANCELLED:{ bg: '#f3f4f6', text: '#6b7280' },
};

function formatBsDate(bsAdDate: { ad: string; bs: string } | null | undefined): string {
  if (!bsAdDate) return '—';
  if (bsAdDate.bs) return bsAdDate.bs;
  if (bsAdDate.ad) {
    try {
      const adDate = new Date(bsAdDate.ad + 'T12:00:00Z');
      const bs = adToBs(adDate);
      return formatBs(bs, 'en');
    } catch { return bsAdDate.ad; }
  }
  return '—';
}

function bsDateToAdString(bs: BsDate): string {
  return bsToAd(bs).toISOString().split('T')[0];
}

function prevMonth(b: BsDate): BsDate {
  if (b.month === 1) return { year: b.year - 1, month: 12, day: 1 };
  return { year: b.year, month: b.month - 1, day: 1 };
}
function nextMonth(b: BsDate): BsDate {
  if (b.month === 12) return { year: b.year + 1, month: 1, day: 1 };
  return { year: b.year, month: b.month + 1, day: 1 };
}

// ─── Simple BS date picker ─────────────────────────────────────────────────────

function BsDatePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: BsDate;
  onChange: (bs: BsDate) => void;
}) {
  const [viewMonth, setViewMonth] = useState<BsDate>({ year: value.year, month: value.month, day: 1 });
  const { daysInBsMonth } = require('bs-calendar');
  const days = useMemo(() => {
    const n = daysInBsMonth(viewMonth.year, viewMonth.month) as number;
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [viewMonth.year, viewMonth.month]);

  return (
    <View>
      <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '600', marginBottom: 8 }}>{label}</Text>
      {/* Month nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <TouchableOpacity onPress={() => setViewMonth(prevMonth(viewMonth))} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={18} color="#1e40af" />
        </TouchableOpacity>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
          {BS_MONTH_NAMES_EN[viewMonth.month - 1]} {viewMonth.year}
        </Text>
        <TouchableOpacity onPress={() => setViewMonth(nextMonth(viewMonth))} style={{ padding: 4 }}>
          <Ionicons name="chevron-forward" size={18} color="#1e40af" />
        </TouchableOpacity>
      </View>
      {/* Day row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
        {days.map((d) => {
          const isSelected = value.year === viewMonth.year &&
            value.month === viewMonth.month && value.day === d;
          return (
            <TouchableOpacity
              key={d}
              onPress={() => onChange({ year: viewMonth.year, month: viewMonth.month, day: d })}
              style={{
                width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isSelected ? '#1e40af' : '#f3f4f6',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: isSelected ? 'white' : '#374151' }}>
                {d}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
        AD: {bsDateToAdString(value)}
      </Text>
    </View>
  );
}

// ─── Leave request card ────────────────────────────────────────────────────────

function LeaveCard({ req }: { req: LeaveRequest }) {
  const statusStyle = STATUS_STYLE[req.status] ?? { bg: '#f3f4f6', text: '#6b7280' };
  return (
    <View style={{
      backgroundColor: 'white', borderRadius: 16, padding: 14, marginBottom: 10,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', flex: 1, marginRight: 8 }}>
          {req.leaveTypeName ?? 'Leave'}
        </Text>
        <View style={{ backgroundColor: statusStyle.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: statusStyle.text }}>{req.status}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 16, marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="calendar-outline" size={12} color="#9ca3af" />
          <Text style={{ fontSize: 12, color: '#6b7280' }}>
            {formatBsDate(req.fromDate)} → {formatBsDate(req.toDate)}
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: '#6b7280' }}>
          {req.totalDays} day{req.totalDays !== 1 ? 's' : ''}
        </Text>
      </View>
      {req.reason && (
        <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }} numberOfLines={2}>
          {req.reason}
        </Text>
      )}
      {req.reviewerNote && (
        <View style={{ marginTop: 8, backgroundColor: '#f9fafb', borderRadius: 8, padding: 8 }}>
          <Text style={{ fontSize: 11, color: '#6b7280' }}>Note: {req.reviewerNote}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Apply leave modal ─────────────────────────────────────────────────────────

function ApplyLeaveModal({
  visible,
  onClose,
  leaveTypes,
}: {
  visible: boolean;
  onClose: () => void;
  leaveTypes: LeaveType[];
}) {
  const applyMutation = useApplyLeave();
  const today = todayBs();
  const [selectedType, setSelectedType] = useState<string | null>(leaveTypes[0]?.id ?? null);
  const [fromBs, setFromBs] = useState<BsDate>(today);
  const [toBs, setToBs] = useState<BsDate>(today);
  const [reason, setReason] = useState('');

  const handleSubmit = async () => {
    if (!selectedType) {
      Alert.alert('Required', 'Please select a leave type.');
      return;
    }
    try {
      await applyMutation.mutateAsync({
        leaveTypeId: selectedType,
        fromDate: bsDateToAdString(fromBs),
        toDate: bsDateToAdString(toBs),
        reason: reason || undefined,
      });
      onClose();
    } catch {
      Alert.alert('Failed', 'Could not submit leave application. Please try again.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }} contentContainerStyle={{ padding: 20, paddingTop: 48 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827' }}>Apply for Leave</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Leave type */}
          <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '600', marginBottom: 8 }}>Leave Type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {leaveTypes.map((lt) => (
              <TouchableOpacity
                key={lt.id}
                onPress={() => setSelectedType(lt.id)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5,
                  borderColor: selectedType === lt.id ? '#1e40af' : '#e5e7eb',
                  backgroundColor: selectedType === lt.id ? '#eff6ff' : 'white',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600',
                  color: selectedType === lt.id ? '#1e40af' : '#374151' }}>
                  {lt.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* From date */}
          <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 14, marginBottom: 12 }}>
            <BsDatePicker label="From Date" value={fromBs} onChange={setFromBs} />
          </View>

          {/* To date */}
          <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 14, marginBottom: 12 }}>
            <BsDatePicker label="To Date" value={toBs} onChange={setToBs} />
          </View>

          {/* Reason */}
          <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 14, marginBottom: 24 }}>
            <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '600', marginBottom: 8 }}>
              Reason (optional)
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
              placeholder="Enter reason for leave..."
              placeholderTextColor="#9ca3af"
              style={{
                fontSize: 14, color: '#111827', minHeight: 72,
                textAlignVertical: 'top', lineHeight: 20,
              }}
            />
          </View>

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={applyMutation.isPending}
            style={{
              backgroundColor: applyMutation.isPending ? '#93c5fd' : '#1e40af',
              borderRadius: 16, padding: 16,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
            }}
          >
            {applyMutation.isPending ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="send-outline" size={18} color="white" />
            )}
            <Text style={{ color: 'white', fontSize: 15, fontWeight: '800' }}>
              {applyMutation.isPending ? 'Submitting...' : 'Submit Application'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function TeacherLeave() {
  const [refreshing, setRefreshing] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);

  const leaveResult = useMyLeaveRequests();
  const typesResult = useLeaveTypes();

  const onRefresh = async () => {
    setRefreshing(true);
    await leaveResult.refetch();
    setRefreshing(false);
  };

  const requests = leaveResult.data?.data ?? [];

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
        style={{ paddingTop: 56, paddingBottom: 28, paddingHorizontal: 20 }}
      >
        <Text style={{ color: '#bfdbfe', fontSize: 12, fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          Leave Management
        </Text>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 4 }}>
          My Leave
        </Text>
        <Text style={{ color: '#93c5fd', fontSize: 13 }}>
          {requests.length} request{requests.length !== 1 ? 's' : ''}
        </Text>
      </LinearGradient>

      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 12 }}>

        {/* Apply button */}
        <TouchableOpacity
          onPress={() => setShowApplyModal(true)}
          style={{
            backgroundColor: '#1e40af', borderRadius: 20, padding: 16,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            shadowColor: '#1e40af', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
          }}
        >
          <Ionicons name="add-circle-outline" size={22} color="white" />
          <Text style={{ color: 'white', fontSize: 15, fontWeight: '800' }}>Apply for Leave</Text>
        </TouchableOpacity>

        {/* Leave list */}
        <View>
          <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
            Leave Requests
          </Text>

          {leaveResult.isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <ActivityIndicator size="large" color="#1e40af" />
            </View>
          ) : leaveResult.isError ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Ionicons name="cloud-offline-outline" size={44} color="#d1d5db" />
              <Text style={{ color: '#374151', fontWeight: '600', marginTop: 10 }}>Failed to load</Text>
              <TouchableOpacity
                onPress={() => leaveResult.refetch()}
                style={{ backgroundColor: '#1e40af', paddingHorizontal: 20, paddingVertical: 10,
                  borderRadius: 12, marginTop: 12 }}
              >
                <Text style={{ color: 'white', fontWeight: '700' }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : requests.length === 0 ? (
            <View style={{
              backgroundColor: 'white', borderRadius: 20, padding: 32, alignItems: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
            }}>
              <Ionicons name="document-outline" size={44} color="#d1d5db" />
              <Text style={{ color: '#6b7280', marginTop: 12, fontSize: 14, fontWeight: '500' }}>
                No leave requests yet.
              </Text>
              <Text style={{ color: '#9ca3af', marginTop: 4, fontSize: 13 }}>
                Tap "Apply for Leave" to submit one.
              </Text>
            </View>
          ) : (
            requests.map((req) => <LeaveCard key={req.id} req={req} />)
          )}
        </View>

      </View>

      {/* Apply modal */}
      <ApplyLeaveModal
        visible={showApplyModal}
        onClose={() => setShowApplyModal(false)}
        leaveTypes={typesResult.data ?? []}
      />
    </ScrollView>
  );
}
