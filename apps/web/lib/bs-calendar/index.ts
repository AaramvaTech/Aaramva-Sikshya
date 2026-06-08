import { AD_EPOCH, BS_MONTH_DATA } from './data';

export interface BsDate {
  year: number;  // e.g. 2081
  month: number; // 1–12 (1 = Baisakh)
  day: number;   // 1–32
}

export const BS_MONTH_NAMES_EN = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan',
  'Bhadra', 'Ashwin', 'Kartik', 'Mangsir',
  'Poush', 'Magh', 'Falgun', 'Chaitra',
];

export const BS_MONTH_NAMES_NP = [
  'बैशाख', 'जेठ', 'असार', 'श्रावण',
  'भाद्र', 'आश्विन', 'कार्तिक', 'मंसिर',
  'पुष', 'माघ', 'फागुन', 'चैत्र',
];

function diffDays(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcA - utcB) / 86400000);
}

export function adToBs(adDate: Date): BsDate {
  let remaining = diffDays(adDate, AD_EPOCH);

  if (remaining < 0) {
    throw new Error('Date is before the supported range (13 April 1943 / 1 Baisakh 2000 BS)');
  }

  let bsYear = 2000;
  let bsMonth = 1;

  outer: for (let y = 2000; y <= 2100; y++) {
    const monthData = BS_MONTH_DATA[y];
    if (!monthData) throw new Error(`BS year ${y} not in lookup table`);
    for (let m = 0; m < 12; m++) {
      const days = monthData[m];
      if (remaining < days) {
        bsYear = y;
        bsMonth = m + 1;
        break outer;
      }
      remaining -= days;
    }
  }

  return { year: bsYear, month: bsMonth, day: remaining + 1 };
}

export function bsToAd(bsDate: BsDate): Date {
  if (!isValidBsDate(bsDate)) {
    throw new Error(`Invalid BS date: ${bsDate.year}-${bsDate.month}-${bsDate.day}`);
  }

  let totalDays = 0;

  for (let y = 2000; y < bsDate.year; y++) {
    const monthData = BS_MONTH_DATA[y];
    if (!monthData) throw new Error(`BS year ${y} not in lookup table`);
    for (let m = 0; m < 12; m++) {
      totalDays += monthData[m];
    }
  }

  for (let m = 0; m < bsDate.month - 1; m++) {
    totalDays += BS_MONTH_DATA[bsDate.year][m];
  }

  totalDays += bsDate.day - 1;

  const result = new Date(AD_EPOCH);
  result.setDate(result.getDate() + totalDays);
  return result;
}

export function formatBs(bsDate: BsDate, lang: 'en' | 'np'): string {
  const names = lang === 'np' ? BS_MONTH_NAMES_NP : BS_MONTH_NAMES_EN;
  return `${bsDate.day} ${names[bsDate.month - 1]} ${bsDate.year}`;
}

export function todayBs(): BsDate {
  return adToBs(new Date());
}

export function getBsYear(adDate: Date): number {
  return adToBs(adDate).year;
}

export function daysInBsMonth(year: number, month: number): number {
  const monthData = BS_MONTH_DATA[year];
  if (!monthData) throw new Error(`BS year ${year} not in lookup table`);
  if (month < 1 || month > 12) throw new Error(`Invalid BS month: ${month}`);
  return monthData[month - 1];
}

export function isValidBsDate(bsDate: BsDate): boolean {
  if (bsDate.month < 1 || bsDate.month > 12) return false;
  const monthData = BS_MONTH_DATA[bsDate.year];
  if (!monthData) return false;
  const maxDays = monthData[bsDate.month - 1];
  return bsDate.day >= 1 && bsDate.day <= maxDays;
}

export function getCurrentFiscalYear(): string {
  const today = todayBs();
  // Nepal fiscal year: Shrawan (month 4) to Ashadh (month 3) of next year
  const fyStart = today.month >= 4 ? today.year : today.year - 1;
  const fyEnd = (fyStart + 1) % 100;
  return `${fyStart}/${fyEnd.toString().padStart(2, '0')}`;
}

export function parseBsString(dateStr: string): BsDate {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid BS date string: "${dateStr}". Expected format: "YYYY-MM-DD"`);
  }
  const [year, month, day] = parts;
  return { year, month, day };
}
