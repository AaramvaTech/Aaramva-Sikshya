import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useMemo } from 'react';
import { todayBs, daysInBsMonth, bsToAd } from 'bs-calendar';
import type { BsDate } from 'bs-calendar';
import { useThemeColors, SATURDAY_HIGHLIGHT } from '../../lib/theme/colors';
import { localDateKey } from '../../lib/time';
import { FONT } from '../../lib/theme/fonts';
import Skeleton from '../Skeleton';

const SCREEN_WIDTH = Dimensions.get('window').width;
// 16px screen padding + 16px card padding, each side = 64px total.
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 64) / 7);
const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Minimum shape this calendar needs from a status config entry. */
export interface CalendarStatusStyle {
  bg: string;
  color: string;
  shortCode: string;
}

interface AttendanceCalendarProps {
  viewMonth: BsDate;
  /** Map of AD date (yyyy-mm-dd) → status key. */
  recordMap: Map<string, string>;
  statusConfig: Record<string, CalendarStatusStyle>;
  isLoading?: boolean;
}

/**
 * Reusable Bikram Sambat month calendar. Lays out the BS month against AD
 * weekdays, colours each cell from `statusConfig`, highlights Saturday and today.
 * Neutral surfaces are token-driven; status colours are caller-provided.
 */
export function AttendanceCalendar({ viewMonth, recordMap, statusConfig, isLoading = false }: AttendanceCalendarProps) {
  const c = useThemeColors();
  const today = todayBs();
  const { year, month } = viewMonth;

  const { weekdayOfFirst, daysInMonth } = useMemo(() => {
    const days = daysInBsMonth(year, month);
    const firstAd = bsToAd({ year, month, day: 1 });
    return { weekdayOfFirst: firstAd.getDay(), daysInMonth: days };
  }, [year, month]);

  const rows = useMemo<(number | null)[][]>(() => {
    const cells: (number | null)[] = [];
    for (let i = 0; i < weekdayOfFirst; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    const result: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) result.push(cells.slice(i, i + 7));
    while (result.length > 0 && result[result.length - 1].every((x) => x === null)) result.pop();
    return result;
  }, [weekdayOfFirst, daysInMonth]);

  if (isLoading) {
    return (
      <View style={{ gap: 4 }}>
        {[0, 1, 2, 3, 4, 5].map((r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 4 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((cIdx) => (
              <Skeleton key={cIdx} style={{ height: CELL_SIZE, flex: 1 }} />
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View>
      {/* Day headers */}
      <View style={styles.row}>
        {DAY_HEADERS.map((d, i) => (
          <View key={d} style={styles.dayHeader}>
            <Text
              style={[styles.dayHeaderText, { color: i === 6 ? SATURDAY_HIGHLIGHT.text : c.mutedForeground }]}
            >
              {d}
            </Text>
          </View>
        ))}
      </View>

      {/* Weeks */}
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((day, ci) => {
            if (day === null) return <View key={`b-${ci}`} style={styles.cell} />;
            const adStr = localDateKey(bsToAd({ year, month, day }));
            const status = recordMap.get(adStr);
            const cfg = status ? statusConfig[status] : undefined;
            const isToday = today.year === year && today.month === month && today.day === day;
            const isSat = ci === 6;
            const cellBg = cfg ? cfg.bg : isSat ? SATURDAY_HIGHLIGHT.bg : c.surfaceMuted;
            const numColor = isToday
              ? c.primary
              : cfg
                ? cfg.color
                : isSat
                  ? SATURDAY_HIGHLIGHT.text
                  : c.mutedForeground;
            return (
              <View
                key={day}
                style={[
                  styles.cell,
                  { backgroundColor: cellBg },
                  isToday && styles.todayCell,
                  isToday && { borderColor: c.primary },
                ]}
              >
                <Text style={[styles.cellNum, { color: numColor }]}>{day}</Text>
                {cfg ? <Text style={[styles.cellCode, { color: cfg.color }]}>{cfg.shortCode}</Text> : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 4 },
  dayHeader: { width: CELL_SIZE, height: 28, alignItems: 'center', justifyContent: 'center' },
  dayHeaderText: { fontFamily: FONT.bold, fontSize: 9.5 },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 1,
  },
  todayCell: { borderWidth: 1.5 },
  cellNum: { fontFamily: FONT.bold, fontSize: 11.5, lineHeight: 14 },
  cellCode: { fontFamily: FONT.extrabold, fontSize: 9, lineHeight: 11, marginTop: 1 },
});
