'use client';

import { useState, useEffect, useMemo } from 'react';
import { adToBs, bsToAd, daysInBsMonth, todayBs, BS_MONTH_NAMES_EN } from '@/lib/bs-calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface BsDateInputProps {
  value?: string; // AD date string "YYYY-MM-DD"
  onChange: (adDate: string) => void;
  label?: string;
  minYear?: number; // BS year, defaults to today-25
  maxYear?: number; // BS year, defaults to today-2
}

function parseBsFromAd(adDate: string) {
  if (!adDate) return null;
  try {
    return adToBs(new Date(adDate));
  } catch {
    return null;
  }
}

export function BsDateInput({ value, onChange, label, minYear: minYearProp, maxYear: maxYearProp }: BsDateInputProps) {
  const today = todayBs();
  const minYear = minYearProp ?? today.year - 25;
  const maxYear = maxYearProp ?? today.year - 2;

  const [year, setYear] = useState<string>(() => {
    const bs = parseBsFromAd(value ?? '');
    return bs ? String(bs.year) : '';
  });
  const [month, setMonth] = useState<string>(() => {
    const bs = parseBsFromAd(value ?? '');
    return bs ? String(bs.month) : '';
  });
  const [day, setDay] = useState<string>(() => {
    const bs = parseBsFromAd(value ?? '');
    return bs ? String(bs.day) : '';
  });

  // Sync dropdowns when value is cleared externally (e.g. form reset)
  useEffect(() => {
    if (!value) {
      setYear('');
      setMonth('');
      setDay('');
    }
  }, [value]);

  const years = useMemo(
    () => Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i),
    [minYear, maxYear],
  );

  const dayCount = useMemo(() => {
    if (!year || !month) return 32;
    try {
      return daysInBsMonth(Number(year), Number(month));
    } catch {
      return 32;
    }
  }, [year, month]);

  function fireChange(y: string, m: string, d: string) {
    if (!y || !m || !d) return;
    try {
      const ad = bsToAd({ year: Number(y), month: Number(m), day: Number(d) });
      onChange(ad.toISOString().split('T')[0]);
    } catch {
      // invalid combination — ignore
    }
  }

  function handleYear(y: string | null) {
    if (!y) return;
    setYear(y);
    const newCount = month
      ? (() => { try { return daysInBsMonth(Number(y), Number(month)); } catch { return 32; } })()
      : 32;
    const clampedDay = day && Number(day) > newCount ? String(newCount) : day;
    if (clampedDay !== day) setDay(clampedDay);
    fireChange(y, month, clampedDay);
  }

  function handleMonth(m: string | null) {
    if (!m) return;
    setMonth(m);
    const newCount = year
      ? (() => { try { return daysInBsMonth(Number(year), Number(m)); } catch { return 32; } })()
      : 32;
    const clampedDay = day && Number(day) > newCount ? String(newCount) : day;
    if (clampedDay !== day) setDay(clampedDay);
    fireChange(year, m, clampedDay);
  }

  function handleDay(d: string | null) {
    if (!d) return;
    setDay(d);
    fireChange(year, month, d);
  }

  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <div className="flex gap-2">
        <Select value={year} onValueChange={handleYear}>
          <SelectTrigger className="w-[96px]">
            <span className={year ? '' : 'text-muted-foreground'}>
              {year || 'Year'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={month} onValueChange={handleMonth}>
          <SelectTrigger className="flex-1 min-w-[120px]">
            <span className={month ? '' : 'text-muted-foreground'}>
              {month ? BS_MONTH_NAMES_EN[Number(month) - 1] : 'Month'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {BS_MONTH_NAMES_EN.map((name, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={day} onValueChange={handleDay}>
          <SelectTrigger className="w-[72px]">
            <span className={day ? '' : 'text-muted-foreground'}>
              {day || 'Day'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
