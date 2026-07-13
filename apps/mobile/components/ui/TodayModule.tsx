import { View, TouchableOpacity, StyleSheet } from 'react-native';
import NpText from '../NpText';
import { Icon } from './Icon';
import { Card } from './Card';
import { SectionLabel } from './SectionLabel';
import { FeatureButton } from './FeatureTile';
import { useThemeColors, SEMANTIC_SOFT } from '../../lib/theme/colors';
import { FONT } from '../../lib/theme/fonts';
import { useLocale } from '../../hooks/useLocale';
import { formatPeriodTime12 } from '../../lib/time';
import type { PeriodLike } from '../../lib/nextPeriod';
import type { IconName } from '../../lib/icons/names';

interface TodayModuleProps {
  /** Today's attendance status ('PRESENT' | 'ABSENT' | ... ), or null if unmarked. */
  status: string | null;
  /** The next upcoming period today, or null once the school day is over. */
  next: PeriodLike | null;
  homeworkCount: number;
  noticeCount: number;
  /** Today's date already formatted in BS (e.g. "27 Ashad 2083"). */
  todayBsLabel: string;
  onNext: () => void;
  onHomework: () => void;
  onNotices: () => void;
}

/**
 * The "Today" module — first thing on the Student Home body (Task C1). Replaces
 * the old full AttendanceSummaryCard on Home (that breakdown still lives on the
 * Attendance tab, untouched): a compact present/absent status row, an optional
 * next-class row, and two navigation buttons (homework / notices).
 */
export function TodayModule({
  status, next, homeworkCount, noticeCount, todayBsLabel,
  onNext, onHomework, onNotices,
}: TodayModuleProps) {
  const c = useThemeColors();
  const { t } = useLocale('student');

  // Status → tone/icon/label. Attendance data can carry PRESENT/ABSENT/LATE/LEAVE
  // (or null when unmarked) — every known status needs its own honest label, not
  // just PRESENT/ABSENT falling through to the rest as "Not yet marked".
  const STATUS_META: Record<string, { tone: keyof typeof SEMANTIC_SOFT; icon: IconName; labelKey: string }> = {
    PRESENT: { tone: 'success', icon: 'check_circle', labelKey: 'today.markedPresent' },
    ABSENT: { tone: 'danger', icon: 'check_circle', labelKey: 'today.markedAbsent' },
    LATE: { tone: 'warning', icon: 'schedule', labelKey: 'today.markedLate' },
    LEAVE: { tone: 'info', icon: 'event', labelKey: 'today.markedLeave' },
  };
  const statusMeta = status ? STATUS_META[status] : undefined;
  const tone: keyof typeof SEMANTIC_SOFT = statusMeta?.tone ?? 'neutral';
  const statusSoft = SEMANTIC_SOFT[tone];
  const statusIcon: IconName = statusMeta?.icon ?? 'check_circle';
  const statusLabel = statusMeta ? t(statusMeta.labelKey) : t('today.notMarked');

  return (
    <Card elevated style={styles.card}>
      <View style={styles.headRow}>
        <SectionLabel>{t('today.title')}</SectionLabel>
        <View style={[styles.pill, { backgroundColor: c.brandSurface }]}>
          <NpText style={[styles.pillText, { color: c.primary }]}>{todayBsLabel}</NpText>
        </View>
      </View>

      <View style={[styles.row, { backgroundColor: statusSoft.bg }]}>
        <Icon name={statusIcon} fill={status === 'PRESENT'} size={22} color={statusSoft.fg} />
        <NpText style={[styles.rowTitle, { color: statusSoft.fgDeep }]}>{statusLabel}</NpText>
      </View>

      {next ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onNext}
          style={[styles.row, { backgroundColor: SEMANTIC_SOFT.info.bg }]}
        >
          <View style={[styles.iconChip, { backgroundColor: c.surface }]}>
            <Icon name="schedule" size={19} color={SEMANTIC_SOFT.info.fg} />
          </View>
          <View style={styles.rowInfo}>
            <NpText style={[styles.rowTitle, { color: SEMANTIC_SOFT.info.fgDeep }]}>
              {t('today.nextClass', { time: formatPeriodTime12(next.startTime) })}
            </NpText>
            <NpText style={[styles.rowSub, { color: c.mutedForeground }]} numberOfLines={1}>
              {next.subject.name}{next.room ? ` · ${next.room}` : ''}
            </NpText>
          </View>
          <Icon name="chevron_right" size={18} color={c.mutedForeground} />
        </TouchableOpacity>
      ) : null}

      <View style={styles.btnRow}>
        <FeatureButton
          icon="assignment_late"
          tone="warning"
          count={homeworkCount}
          label={t('today.homeworkDue')}
          onPress={onHomework}
        />
        <FeatureButton
          icon="campaign"
          tone="danger"
          count={noticeCount}
          label={t('today.newNotice')}
          onPress={onNotices}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  pill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontFamily: FONT.bold, fontSize: 10.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 14, padding: 11, marginBottom: 9 },
  iconChip: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: FONT.bold, fontSize: 13 },
  rowSub: { fontFamily: FONT.medium, fontSize: 11.5, marginTop: 2 },
  btnRow: { flexDirection: 'row', gap: 9, marginTop: 2 },
});
