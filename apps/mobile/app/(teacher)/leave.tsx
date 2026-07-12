import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Alert,
  RefreshControl, Modal, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { useLocale, bsLang } from '../../hooks/useLocale';
import NpText from '../../components/NpText';
import { bsMonthName } from '../../lib/i18n/date';
import { Ionicons } from '@expo/vector-icons';
import { useState, useMemo } from 'react';
import { useMyLeaveRequests, useLeaveTypes, useApplyLeave } from '../../hooks/useTeacher';
import { todayBs, bsToAd, adToBs, BS_MONTH_NAMES_EN, formatBs, daysInBsMonth } from 'bs-calendar';
import type { BsDate } from 'bs-calendar';
import type { LeaveRequest, LeaveType } from '../../types';
import { useThemeColors } from '../../lib/theme/colors';
import { localDateKey } from '../../lib/time';
import {
  ScreenHeader, Card, CardLabel, PrimaryButton, StatusBadge, SelectChip,
  MonthNav, EmptyState, ErrorState,
} from '../../components/ui';
import Skeleton from '../../components/Skeleton';

// Semantic leave-status palette (not brand-coupled).
const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  PENDING:   { bg: '#fef3c7', text: '#92400e' },
  APPROVED:  { bg: '#d1fae5', text: '#065f46' },
  REJECTED:  { bg: '#fee2e2', text: '#991b1b' },
  CANCELLED: { bg: '#f3f4f6', text: '#6b7280' },
};

function formatLeaveDate(d: { ad: string; bs: string } | null | undefined): string {
  if (!d) return '—';
  if (d.bs) return d.bs;
  if (d.ad) {
    try { return formatBs(adToBs(new Date(d.ad + 'T12:00:00Z')), 'en'); }
    catch { return d.ad; }
  }
  return '—';
}
function bsToAdString(bs: BsDate): string {
  // localDateKey reads local calendar components (TZ-safe); toISOString would
  // shift a Nepal (+05:45) local-midnight date back to the previous UTC day.
  return localDateKey(bsToAd(bs));
}
function prevMonth(b: BsDate): BsDate {
  if (b.month === 1) return { year: b.year - 1, month: 12, day: 1 };
  return { year: b.year, month: b.month - 1, day: 1 };
}
function nextMonth(b: BsDate): BsDate {
  if (b.month === 12) return { year: b.year + 1, month: 1, day: 1 };
  return { year: b.year, month: b.month + 1, day: 1 };
}

// ── BS date picker (month nav + day strip) ────────────────────────────────────

function BsDatePicker({ label, value, onChange }: { label: string; value: BsDate; onChange: (bs: BsDate) => void }) {
  const c = useThemeColors();
  const { t, locale } = useLocale('teacher');
  const [viewMonth, setViewMonth] = useState<BsDate>({ year: value.year, month: value.month, day: 1 });
  const days = useMemo(() => {
    const n = daysInBsMonth(viewMonth.year, viewMonth.month);
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [viewMonth.year, viewMonth.month]);

  return (
    <View>
      <Text className="text-muted-foreground" style={styles.fieldLabel}>{label}</Text>
      <View style={styles.pickerNav}>
        <MonthNav
          label={`${bsMonthName(viewMonth.month, locale)} ${viewMonth.year}`}
          onPrev={() => setViewMonth(prevMonth(viewMonth))}
          onNext={() => setViewMonth(nextMonth(viewMonth))}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
        {days.map((d) => {
          const selected = value.year === viewMonth.year && value.month === viewMonth.month && value.day === d;
          return (
            <TouchableOpacity
              key={d}
              onPress={() => onChange({ year: viewMonth.year, month: viewMonth.month, day: d })}
              activeOpacity={0.8}
              accessibilityState={{ selected }}
              className={selected ? 'bg-primary' : 'bg-surface-muted'}
              style={styles.dayBtn}
            >
              <Text
                className={selected ? 'text-primary-foreground' : 'text-foreground'}
                style={styles.dayBtnText}
              >
                {d}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text className="text-muted-foreground" style={styles.adHint}>AD: {bsToAdString(value)}</Text>
    </View>
  );
}

// ── Leave request card ────────────────────────────────────────────────────────

function LeaveCard({ req }: { req: LeaveRequest }) {
  const c = useThemeColors();
  const { t, locale } = useLocale('teacher');
  const st = STATUS_STYLE[req.status] ?? { bg: '#f3f4f6', text: '#6b7280' };
  return (
    <Card padded style={styles.leaveCard}>
      <View style={styles.leaveTop}>
        <Text className="text-foreground" style={styles.leaveTitle}>{req.leaveTypeName ?? t('leave.leaveFallback')}</Text>
        <StatusBadge label={req.status} bg={st.bg} color={st.text} />
      </View>
      <View style={styles.leaveMeta}>
        <View style={styles.leaveMetaItem}>
          <Ionicons name="calendar-outline" size={12} color={c.mutedForeground} />
          <Text className="text-muted-foreground" style={styles.leaveMetaText}>
            {formatLeaveDate(req.fromDate)} → {formatLeaveDate(req.toDate)}
          </Text>
        </View>
        <Text className="text-muted-foreground" style={styles.leaveMetaText}>
          {req.totalDays} day{req.totalDays !== 1 ? 's' : ''}
        </Text>
      </View>
      {req.reason ? (
        <Text className="text-muted-foreground" style={styles.leaveReason} numberOfLines={2}>{req.reason}</Text>
      ) : null}
      {req.reviewerNote ? (
        <View className="bg-background" style={styles.noteBox}>
          <Text className="text-muted-foreground" style={styles.noteText}>Note: {req.reviewerNote}</Text>
        </View>
      ) : null}
    </Card>
  );
}

// ── Apply modal ───────────────────────────────────────────────────────────────

function ApplyLeaveModal({ visible, onClose, leaveTypes }: { visible: boolean; onClose: () => void; leaveTypes: LeaveType[] }) {
  const c = useThemeColors();
  const { t, locale } = useLocale('teacher');
  const applyMutation = useApplyLeave();
  const today = todayBs();
  const [selectedType, setSelectedType] = useState<string | null>(leaveTypes[0]?.id ?? null);
  const [fromBs, setFromBs] = useState<BsDate>(today);
  const [toBs, setToBs] = useState<BsDate>(today);
  const [reason, setReason] = useState('');

  const handleSubmit = async () => {
    if (!selectedType) { Alert.alert(t('leave.alertRequiredTitle'), t('leave.alertRequiredBody')); return; }
    try {
      await applyMutation.mutateAsync({
        leaveTypeId: selectedType,
        fromDate: bsToAdString(fromBs),
        toDate: bsToAdString(toBs),
        reason: reason || undefined,
      });
      onClose();
    } catch {
      Alert.alert(t('leave.alertFailedTitle'), t('leave.alertFailedBody'));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="bg-background" style={styles.fill} contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <NpText className="text-foreground" style={styles.modalTitle}>{t('leave.applyForLeave')}</NpText>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={c.mutedForeground} />
            </TouchableOpacity>
          </View>

          <NpText className="text-muted-foreground" style={styles.fieldLabel}>{t('leave.leaveType')}</NpText>
          <View style={styles.typeRow}>
            {leaveTypes.map((lt) => (
              <SelectChip key={lt.id} label={lt.name} selected={selectedType === lt.id} onPress={() => setSelectedType(lt.id)} />
            ))}
          </View>

          <Card padded style={styles.modalCard}>
            <BsDatePicker label={t('leave.fromDate')} value={fromBs} onChange={setFromBs} />
          </Card>
          <Card padded style={styles.modalCard}>
            <BsDatePicker label={t('leave.toDate')} value={toBs} onChange={setToBs} />
          </Card>

          <Card padded style={styles.modalCardLast}>
            <Text className="text-muted-foreground" style={styles.fieldLabel}>Reason (optional)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
              placeholder={t('leave.reasonPlaceholder')}
              placeholderTextColor={c.mutedForeground}
              className="text-foreground"
              style={styles.reasonInput}
            />
          </Card>

          <PrimaryButton
            label={applyMutation.isPending ? t('leave.submitting') : t('leave.submitApplication')}
            icon="send-outline"
            loading={applyMutation.isPending}
            onPress={handleSubmit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TeacherLeave() {
  const [refreshing, setRefreshing] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const c = useThemeColors();
  const { t, locale } = useLocale('teacher');

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
      className="bg-background"
      style={styles.fill}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
    >
      <ScreenHeader
        eyebrow={t('leave.eyebrow')}
        title={t('leave.title')}
        subtitle={t('leave.requestCount', { count: requests.length })}
      />

      <View style={styles.body}>
        <PrimaryButton label={t('leave.applyForLeave')} icon="add-circle-outline" onPress={() => setShowApplyModal(true)} />

        <View>
          <CardLabel>{t('leave.leaveRequests')}</CardLabel>
          {leaveResult.isLoading ? (
            <View style={{ gap: 10 }}>
              {[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 88 }} className="rounded-2xl" />)}
            </View>
          ) : leaveResult.isError ? (
            <Card><ErrorState title={t('leave.errorTitle')} onRetry={() => leaveResult.refetch()} /></Card>
          ) : requests.length === 0 ? (
            <Card>
              <EmptyState icon="document-outline" title={t('leave.emptyTitle')} subtitle='Tap "Apply for Leave" to submit one.' />
            </Card>
          ) : (
            requests.map((req) => <LeaveCard key={req.id} req={req} />)
          )}
        </View>
      </View>

      <ApplyLeaveModal visible={showApplyModal} onClose={() => setShowApplyModal(false)} leaveTypes={typesResult.data ?? []} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  // date picker
  pickerNav: { marginBottom: 8 },
  dayStrip: { gap: 6 },
  dayBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayBtnText: { fontSize: 14, fontWeight: '700' },
  adHint: { fontSize: 11, marginTop: 8 },
  // leave card
  leaveCard: { padding: 14, marginBottom: 10 },
  leaveTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  leaveTitle: { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  leaveMeta: { flexDirection: 'row', gap: 16, marginBottom: 4, flexWrap: 'wrap' },
  leaveMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leaveMetaText: { fontSize: 12 },
  leaveReason: { fontSize: 12, marginTop: 4 },
  noteBox: { marginTop: 8, borderRadius: 8, padding: 8 },
  noteText: { fontSize: 11 },
  // modal
  modalContent: { padding: 20, paddingTop: 48, gap: 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  modalCard: { marginBottom: 12 },
  modalCardLast: { marginBottom: 24 },
  reasonInput: { fontSize: 14, minHeight: 72, textAlignVertical: 'top', lineHeight: 20 },
});
