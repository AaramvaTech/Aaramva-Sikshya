'use client';

import { useState, useEffect, useMemo } from 'react';
import { adToBs, bsToAd, daysInBsMonth, todayBs, BS_MONTH_NAMES_EN } from 'bs-calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { bsYearRange, toLocalAdString } from '@/lib/bs-year-range';

interface BsDateInputProps {
  value?: string; // AD date string "YYYY-MM-DD"
  onChange: (adDate: string) => void;
  label?: string;
  minYear?: number; // BS year, defaults to today-10
  maxYear?: number; // BS year, defaults to today+5 (both clamped to the bs-calendar table)
}

function parseBsFromAd(adDate: string) {
  if (!adDate) return null;
  try {
    // Local-frame Date (not new Date('YYYY-MM-DD'), which is UTC midnight and lands on the
    // previous day west of UTC) — the mirror image of toLocalAdString on the write side.
    const [y, m, d] = adDate.slice(0, 10).split('-').map(Number);
    return adToBs(new Date(y, m - 1, d));
  } catch {
    return null;
  }
}

export function BsDateInput({ value, onChange, label, minYear: minYearProp, maxYear: maxYearProp }: BsDateInputProps) {
  const today = todayBs();
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

  // Sync dropdowns when value is changed externally: cleared (form reset) OR set
  // (e.g. a default like "start of the selected academic year"). Our own picks round-trip
  // through onChange → value, land here with identical numbers, and are a no-op.
  useEffect(() => {
    if (!value) {
      setYear('');
      setMonth('');
      setDay('');
      return;
    }
    const bs = parseBsFromAd(value);
    if (bs) {
      setYear(String(bs.year));
      setMonth(String(bs.month));
      setDay(String(bs.day));
    }
  }, [value]);

  const years = useMemo(
    () => bsYearRange(today.year, minYearProp, maxYearProp),
    [today.year, minYearProp, maxYearProp],
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
      onChange(toLocalAdString(ad));
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
          <SelectTrigger className="w-[84px] shrink-0 px-3">
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
          <SelectTrigger className="min-w-0 flex-1 px-3">
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
          <SelectTrigger className="w-[64px] shrink-0 px-3">
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
