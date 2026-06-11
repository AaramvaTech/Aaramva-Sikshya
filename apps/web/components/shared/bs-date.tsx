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
      <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
        <span>{date.bs}</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">BS</span>
        {showAd && (
          <span className="text-xs text-gray-400">({date.ad} AD)</span>
        )}
      </span>
    );
  }

  if (typeof date === 'string') {
    try {
      const bs = adToBs(new Date(date));
      const formatted = formatBs(bs, lang);
      return (
        <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
          <span>{formatted}</span>
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">BS</span>
          {showAd && (
            <span className="text-xs text-gray-400">({date} AD)</span>
          )}
        </span>
      );
    } catch {
      return <span>{date}</span>;
    }
  }

  return <span>—</span>;
}
