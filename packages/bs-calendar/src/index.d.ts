export interface BsDate {
    year: number;
    month: number;
    day: number;
}
export declare const BS_MONTH_NAMES_EN: string[];
export declare const BS_MONTH_NAMES_NP: string[];
export declare function adToBs(adDate: Date): BsDate;
export declare function bsToAd(bsDate: BsDate): Date;
export declare function formatBs(bsDate: BsDate, lang: 'en' | 'np'): string;
export declare function todayBs(): BsDate;
export declare function getBsYear(adDate: Date): number;
export declare function daysInBsMonth(year: number, month: number): number;
export declare function isValidBsDate(bsDate: BsDate): boolean;
export declare function getCurrentFiscalYear(): string;
export declare function parseBsString(dateStr: string): BsDate;
