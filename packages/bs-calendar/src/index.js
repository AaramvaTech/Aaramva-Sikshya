"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BS_MONTH_NAMES_NP = exports.BS_MONTH_NAMES_EN = void 0;
exports.adToBs = adToBs;
exports.bsToAd = bsToAd;
exports.formatBs = formatBs;
exports.todayBs = todayBs;
exports.getBsYear = getBsYear;
exports.daysInBsMonth = daysInBsMonth;
exports.isValidBsDate = isValidBsDate;
exports.getCurrentFiscalYear = getCurrentFiscalYear;
exports.parseBsString = parseBsString;
const data_1 = require("./data");
exports.BS_MONTH_NAMES_EN = [
    'Baisakh', 'Jestha', 'Ashadh', 'Shrawan',
    'Bhadra', 'Ashwin', 'Kartik', 'Mangsir',
    'Poush', 'Magh', 'Falgun', 'Chaitra',
];
exports.BS_MONTH_NAMES_NP = [
    'बैशाख', 'जेठ', 'असार', 'श्रावण',
    'भाद्र', 'आश्विन', 'कार्तिक', 'मंसिर',
    'पुष', 'माघ', 'फागुन', 'चैत्र',
];
function diffDays(a, b) {
    const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((utcA - utcB) / 86400000);
}
function adToBs(adDate) {
    let remaining = diffDays(adDate, data_1.AD_EPOCH);
    if (remaining < 0) {
        throw new Error('Date is before the supported range (13 April 1943 / 1 Baisakh 2000 BS)');
    }
    let bsYear = 2000;
    let bsMonth = 1;
    outer: for (let y = 2000; y <= 2100; y++) {
        const monthData = data_1.BS_MONTH_DATA[y];
        if (!monthData)
            throw new Error(`BS year ${y} not in lookup table`);
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
function bsToAd(bsDate) {
    if (!isValidBsDate(bsDate)) {
        throw new Error(`Invalid BS date: ${bsDate.year}-${bsDate.month}-${bsDate.day}`);
    }
    let totalDays = 0;
    for (let y = 2000; y < bsDate.year; y++) {
        const monthData = data_1.BS_MONTH_DATA[y];
        if (!monthData)
            throw new Error(`BS year ${y} not in lookup table`);
        for (let m = 0; m < 12; m++) {
            totalDays += monthData[m];
        }
    }
    for (let m = 0; m < bsDate.month - 1; m++) {
        totalDays += data_1.BS_MONTH_DATA[bsDate.year][m];
    }
    totalDays += bsDate.day - 1;
    const result = new Date(data_1.AD_EPOCH);
    result.setDate(result.getDate() + totalDays);
    return result;
}
function formatBs(bsDate, lang) {
    const names = lang === 'np' ? exports.BS_MONTH_NAMES_NP : exports.BS_MONTH_NAMES_EN;
    return `${bsDate.day} ${names[bsDate.month - 1]} ${bsDate.year}`;
}
function todayBs() {
    return adToBs(new Date());
}
function getBsYear(adDate) {
    return adToBs(adDate).year;
}
function daysInBsMonth(year, month) {
    const monthData = data_1.BS_MONTH_DATA[year];
    if (!monthData)
        throw new Error(`BS year ${year} not in lookup table`);
    if (month < 1 || month > 12)
        throw new Error(`Invalid BS month: ${month}`);
    return monthData[month - 1];
}
function isValidBsDate(bsDate) {
    if (bsDate.month < 1 || bsDate.month > 12)
        return false;
    const monthData = data_1.BS_MONTH_DATA[bsDate.year];
    if (!monthData)
        return false;
    const maxDays = monthData[bsDate.month - 1];
    return bsDate.day >= 1 && bsDate.day <= maxDays;
}
function getCurrentFiscalYear() {
    const today = todayBs();
    const fyStart = today.month >= 4 ? today.year : today.year - 1;
    const fyEnd = (fyStart + 1) % 100;
    return `${fyStart}/${fyEnd.toString().padStart(2, '0')}`;
}
function parseBsString(dateStr) {
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
        throw new Error(`Invalid BS date string: "${dateStr}". Expected format: "YYYY-MM-DD"`);
    }
    const [year, month, day] = parts;
    return { year, month, day };
}
//# sourceMappingURL=index.js.map