import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { useLocale } from '../../hooks/useLocale';
import NpText from '../../components/NpText';
import { bsMonthName } from '../../lib/i18n/date';
import { useState, useMemo, useEffect } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import api from '../../lib/api';
import { useMyChildren } from '../../hooks/useParentChild';
import { useAuthStore } from '../../store/auth';
import { useThemeColors } from '../../lib/theme/colors';
import {
  ScreenHeader, ChildPicker, Card, CardLabel, PrimaryButton, HeaderIconButton, MonthNav, Icon,
} from '../../components/ui';
import { localDateKey } from '../../lib/time';
import { FONT } from '../../lib/theme/fonts';
import {
  todayBs, bsToAd, BS_MONTH_NAMES_EN, formatBs, daysInBsMonth,
} from 'bs-calendar';
import type { BsDate } from 'bs-calendar';

// Wired to POST /attendance/leave (SESSION-M7.1). The endpoint creates a PENDING
// leave request (status defaults to 'PENDING'; a coordinator reviews it later) —
// it is NOT immediately effective, so the success copy says "submitted … review",
// not "approved". Hard-scoped server-side: a PARENT may only file for a studentId
// that belongs to their own guardians row (403 otherwise).

// AD date the form sends. localDateKey is TZ-safe (unlike toISOString,
// which shifts a Nepal-local midnight to the previous UTC day). Display stays BS.
function bsToAdKey(bs: BsDate): string {
  return localDateKey(bsToAd(bs));
}
// Order two BS dates by their AD instant. >0 means a is after b.
function bsCompare(a: BsDate, b: BsDate): number {
  return bsToAd(a).getTime() - bsToAd(b).getTime();
}
function inclusiveDays(from: BsDate, to: BsDate): number {
  const ms = bsToAd(to).getTime() - bsToAd(from).getTime();
  return Math.round(ms / 86_400_000) + 1;
}
function prevMonth(b: BsDate): BsDate {
  if (b.month === 1) return { year: b.year - 1, month: 12, day: 1 };
  return { year: b.year, month: b.month - 1, day: 1 };
}
function nextMonth(b: BsDate): BsDate {
  if (b.month === 12) return { year: b.year + 1, month: 1, day: 1 };
  return { year: b.year, month: b.month + 1, day: 1 };
}

// ── BS date picker (month nav + day strip; display BS, expose AD) ──────────────

function BsDatePicker({
  value, onChange, minBs,
}: {
  value: BsDate;
  onChange: (bs: BsDate) => void;
  /** Disable any day before this BS date (used so "To" can't precede "From"). */
  minBs?: BsDate;
}) {
  const c = useThemeColors();
  const { t, locale } = useLocale('parent');
  const [viewMonth, setViewMonth] = useState<BsDate>({ year: value.year, month: value.month, day: 1 });

  // Keep the picker on the month of the current value when it changes externally.
  useEffect(() => {
    setViewMonth({ year: value.year, month: value.month, day: 1 });
  }, [value.year, value.month]);

  const days = useMemo(() => {
    const n = daysInBsMonth(viewMonth.year, viewMonth.month);
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [viewMonth.year, viewMonth.month]);

  return (
    <View>
      <View style={styles.pickerNav}>
        <MonthNav
          variant="card"
          label={`${bsMonthName(viewMonth.month, locale)} ${viewMonth.year}`}
          onPrev={() => setViewMonth(prevMonth(viewMonth))}
          onNext={() => setViewMonth(nextMonth(viewMonth))}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
        {days.map((d) => {
          const candidate: BsDate = { year: viewMonth.year, month: viewMonth.month, day: d };
          const selected = value.year === candidate.year && value.month === candidate.month && value.day === d;
          const disabled = minBs ? bsCompare(candidate, minBs) < 0 : false;
          return (
            <TouchableOpacity
              key={d}
              disabled={disabled}
              onPress={() => onChange(candidate)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              style={[
                styles.dayBtn,
                {
                  backgroundColor: selected ? c.primary : c.surfaceMuted,
                  opacity: disabled ? 0.35 : 1,
                },
              ]}
            >
              <Text style={[styles.dayBtnText, { color: selected ? c.primaryForeground : c.foreground }]}>{d}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text style={[styles.adHint, { color: c.mutedForeground }]}>AD {bsToAdKey(value)}</Text>
    </View>
  );
}

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

export default function ParentRequestLeave() {
  const c = useThemeColors();
  const { t, locale } = useLocale('parent');
  const today = todayBs();
  const queryClient = useQueryClient();

  const selectedChildId = useAuthStore((s) => s.selectedChildId);
  const setSelectedChildId = useAuthStore((s) => s.setSelectedChildId);
  const childrenQuery = useMyChildren();
  const children = childrenQuery.data ?? [];
  const effectiveChildId: string | null = selectedChildId ?? (children[0]?.id ?? null);
  useEffect(() => {
    if (!selectedChildId && effectiveChildId) setSelectedChildId(effectiveChildId);
  }, [selectedChildId, effectiveChildId, setSelectedChildId]);
  const selectedChild = children.find((ch) => ch.id === effectiveChildId) ?? null;

  const [fromBs, setFromBs] = useState<BsDate>(today);
  const [toBs, setToBs] = useState<BsDate>(today);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<SubmitStatus>('idle');

  // Any edit after a terminal state returns the form to idle (clears banners).
  const resetStatus = () => setStatus((s) => (s === 'idle' || s === 'submitting' ? s : 'idle'));

  const handleFrom = (bs: BsDate) => {
    setFromBs(bs);
    if (bsCompare(toBs, bs) < 0) setToBs(bs); // keep the range valid
    resetStatus();
  };
  const handleTo = (bs: BsDate) => { setToBs(bs); resetStatus(); };
  const handleReason = (txt: string) => { setReason(txt); resetStatus(); };

  const enrollment = selectedChild?.currentEnrollment ?? null;
  const academicYearId = enrollment?.academicYearId ?? null;

  const datesValid = bsCompare(toBs, fromBs) >= 0;
  const reasonValid = reason.trim().length > 0;
  // academicYearId is required by the DTO; without an active enrollment we can't file.
  const canSubmit =
    !!effectiveChildId && !!academicYearId && datesValid && reasonValid && status !== 'submitting';

  const totalDays = datesValid ? inclusiveDays(fromBs, toBs) : 0;
  const childName = selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : '';
  const enrollmentLine = enrollment
    ? [enrollment.className, `Section ${enrollment.sectionName}`].join(' · ')
    : 'No active enrollment';

  const handleSubmit = async () => {
    if (!canSubmit && status !== 'error') return;
    // Re-check on retry (status === 'error' can re-enter): never POST without a child + year.
    if (!effectiveChildId || !academicYearId || !datesValid || !reasonValid) return;
    setStatus('submitting');
    try {
      // studentId is ALWAYS the selected child's id — never user-typed. The server
      // still enforces 403 if it isn't one of this parent's guardians' children.
      await api.post('/attendance/leave', {
        studentId: effectiveChildId,
        academicYearId,
        fromDate: bsToAdKey(fromBs),
        toDate: bsToAdKey(toBs),
        reason: reason.trim(),
      });
      // Reflect the new request: refresh the child's attendance views.
      await queryClient.invalidateQueries({ queryKey: ['parent', 'child', effectiveChildId, 'attendance'] });
      setStatus('success');
      setReason('');
      setFromBs(today);
      setToBs(today);
    } catch {
      setStatus('error');
    }
  };

  const submitting = status === 'submitting';
  const buttonLabel = status === 'error' ? t('requestLeave.tryAgain') : t('requestLeave.submit');

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        className="bg-background"
        style={styles.fill}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          eyebrow={t('requestLeave.eyebrow')}
          title={t('requestLeave.title')}
          overlap
          right={<HeaderIconButton icon="close" label={t('requestLeave.close')} color={c.primaryForeground} onPress={() => router.back()} />}
        >
          <ChildPicker children={children} selectedId={effectiveChildId} onSelect={(id) => { setSelectedChildId(id); resetStatus(); }} />
        </ScreenHeader>

        <View style={styles.body}>
          {/* Who the leave is for */}
          <Card elevated padded>
            <CardLabel>{t('requestLeave.filingFor')}</CardLabel>
            <View style={styles.childRow}>
              <View style={[styles.childAvatar, { backgroundColor: c.primary }]}>
                <Text style={[styles.childInitial, { color: c.primaryForeground }]}>
                  {(selectedChild?.firstName?.[0] ?? '?').toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <NpText style={[styles.childName, { color: c.foreground }]} numberOfLines={1}>
                  {childName || 'No child selected'}
                </NpText>
                <NpText style={[styles.childSub, { color: c.mutedForeground }]} numberOfLines={1}>
                  {enrollmentLine}
                </NpText>
              </View>
            </View>
            {children.length > 1 ? (
              <Text style={[styles.hint, { color: c.mutedForeground }]}>
                Switch child using the selector above.
              </Text>
            ) : null}
          </Card>

          {/* Date range */}
          <Card padded style={styles.gap}>
            <CardLabel>{t('requestLeave.from')}</CardLabel>
            <BsDatePicker value={fromBs} onChange={handleFrom} />
          </Card>
          <Card padded style={styles.gap}>
            <CardLabel>{t('requestLeave.to')}</CardLabel>
            <BsDatePicker value={toBs} onChange={handleTo} minBs={fromBs} />
          </Card>

          {/* Range summary / validity */}
          <View style={[styles.summaryRow, { backgroundColor: c.brandSurface, borderColor: c.brandBorder }]}>
            <Icon name="calendar_month" size={16} color={c.primary} />
            {datesValid ? (
              <Text style={[styles.summaryText, { color: c.foreground }]}>
                {formatBs(fromBs, 'en')} → {formatBs(toBs, 'en')}
                <Text style={{ color: c.mutedForeground }}>{`  ·  ${totalDays} day${totalDays !== 1 ? 's' : ''}`}</Text>
              </Text>
            ) : (
              <NpText style={[styles.summaryText, { color: c.danger }]}>{t('requestLeave.endBeforeStart')}</NpText>
            )}
          </View>

          {/* Reason */}
          <Card padded style={styles.gap}>
            <CardLabel>{t('requestLeave.reason')}</CardLabel>
            <TextInput
              value={reason}
              onChangeText={handleReason}
              multiline
              numberOfLines={4}
              placeholder={t('requestLeave.reasonPlaceholder')}
              placeholderTextColor={c.mutedForeground}
              style={[styles.reasonInput, { color: c.foreground, backgroundColor: c.surfaceMuted, borderColor: c.border }]}
              accessibilityLabel="Reason for leave"
            />
          </Card>

          {/* Status banners */}
          {status === 'success' ? (
            <View style={[styles.banner, { backgroundColor: `${c.success}1A`, borderColor: `${c.success}55` }]}>
              <Icon name="check_circle" size={18} color={c.success} />
              <NpText style={[styles.bannerText, { color: c.success }]}>
                {t('requestLeave.successBanner')}
              </NpText>
            </View>
          ) : null}
          {status === 'error' ? (
            <View style={[styles.banner, { backgroundColor: `${c.danger}14`, borderColor: `${c.danger}40` }]}>
              <Icon name="error" size={18} color={c.danger} />
              <NpText style={[styles.bannerText, { color: c.danger }]}>
                {t('requestLeave.errorBanner')}
              </NpText>
            </View>
          ) : null}

          <PrimaryButton
            label={submitting ? t('requestLeave.submitting') : buttonLabel}
            icon={status === 'error' ? 'refresh' : 'send'}
            loading={submitting}
            disabled={!canSubmit && status !== 'error'}
            onPress={handleSubmit}
            style={styles.submit}
          />
          <Text style={[styles.footnote, { color: c.mutedForeground }]}>
            Leave is filed for your selected child only.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 40, marginTop: -56 },
  gap: { marginTop: 12 },

  // child card
  childRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  childAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  childInitial: { fontFamily: FONT.extrabold, fontSize: 18 },
  childName: { fontFamily: FONT.bold, fontSize: 15 },
  childSub: { fontFamily: FONT.regular, fontSize: 12, marginTop: 2 },
  hint: { fontFamily: FONT.regular, fontSize: 11, marginTop: 10 },

  // date picker
  pickerNav: { marginBottom: 10 },
  dayStrip: { gap: 6, paddingVertical: 2 },
  dayBtn: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayBtnText: { fontFamily: FONT.bold, fontSize: 14 },
  adHint: { fontFamily: FONT.regular, fontSize: 11, marginTop: 10 },

  // range summary
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1,
  },
  summaryText: { fontFamily: FONT.bold, fontSize: 13, flex: 1 },

  // reason
  reasonInput: {
    fontSize: 14, minHeight: 96, textAlignVertical: 'top', lineHeight: 20,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },

  // banners + submit
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 16, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1,
  },
  bannerText: { fontFamily: FONT.semibold, fontSize: 12.5, flex: 1, lineHeight: 18 },
  submit: { marginTop: 16 },
  footnote: { fontFamily: FONT.regular, fontSize: 11, textAlign: 'center', marginTop: 12 },
});
