import { adToBs, formatBs } from 'bs-calendar';

interface BsDateProps {
  date: string | { ad: string; bs: string };
  showAd?: boolean;
  lang?: 'en' | 'np';
}

export function BsDate({ date, showAd = true, lang = 'en' }: BsDateProps) {
  if (typeof date === 'object') {
    return (
      <span title={showAd ? `AD: ${date.ad}` : undefined}>
        {date.bs}
      </span>
    );
  }
  try {
    const bs = adToBs(new Date(date));
    const formatted = formatBs(bs, lang);
    return <span title={showAd ? `AD: ${date}` : undefined}>{formatted}</span>;
  } catch {
    return <span>{date}</span>;
  }
}
