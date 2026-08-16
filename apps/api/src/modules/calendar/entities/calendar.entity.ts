import { toAdString, toBsString } from '../../attendance/entities/attendance.entity';
import type { BsAdDate } from '../../attendance/entities/attendance.entity';

export interface CalendarDayRow {
  id: string;
  date: Date | string;
  academic_year_id: string | null;
  is_holiday: boolean;
  source: 'GOVT' | 'SCHOOL';
  label_en: string;
  label_ne: string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface CalendarDayResponseDto {
  id: string;
  date: BsAdDate;
  academicYearId: string | null;
  isHoliday: boolean;
  source: 'GOVT' | 'SCHOOL';
  labelEn: string;
  labelNe: string | null;
  createdBy: string | null;
  createdAt: string;
}

export function toCalendarDayResponse(row: CalendarDayRow): CalendarDayResponseDto {
  return {
    id: row.id,
    date: { ad: toAdString(row.date), bs: toBsString(row.date) },
    academicYearId: row.academic_year_id,
    isHoliday: row.is_holiday,
    source: row.source,
    labelEn: row.label_en,
    labelNe: row.label_ne,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}
