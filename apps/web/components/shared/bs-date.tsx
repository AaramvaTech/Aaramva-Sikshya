import { adToBs, formatBs } from '@/lib/bs-calendar';

interface BsDateProps {
  date: string | { ad: string; bs: string } | null | undefined;
  showAd?: boolean;
  lang?: 'en' | 'np';
}

export function BsDate({ date, showAd = false, lang = 'en' }: BsDateProps) {
  if (!date) return <span>—</span>;

  if (typeof date === 'object' && 'bs' in date) {
    return (
      <span title={showAd ? `AD: ${date.ad}` : undefined}>
        {date.bs}
      </span>
    );
  }

  if (typeof date === 'string') {
    try {
      const bs = adToBs(new Date(date));
      const formatted = formatBs(bs, lang);
      return <span title={showAd ? `AD: ${date}` : undefined}>{formatted}</span>;
    } catch {
      return <span>{date}</span>;
    }
  }

  return <span>—</span>;
}
