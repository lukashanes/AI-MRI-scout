"use client";

import { t } from "@/lib/i18n";

interface SeriesFilmstripProps {
  seriesData: { name: string; total: number; centralRange: string; picked: number }[];
  totalImages: number;
  selectedCount: number;
  lang: string;
}

export function SeriesFilmstrip({ seriesData, totalImages, selectedCount, lang }: SeriesFilmstripProps) {
  return (
    <div className="rounded-xl border border-[#1E293B] p-4 space-y-3 animate-fade-in" style={{ backgroundColor: "#111827" }}>
      <p className="text-sm text-[#94A3B8]">{t(lang, "autoSelected", { selected: selectedCount, series: seriesData.length, total: totalImages })}</p>
      <div className="space-y-2.5">
        {seriesData.map((s) => {
          const [startStr, endStr] = s.centralRange.split("-");
          const start = parseInt(startStr);
          const end = parseInt(endStr);
          const bucketSize = s.total > 80 ? Math.ceil(s.total / 80) : 1;
          const bucketCount = Math.ceil(s.total / bucketSize);
          return (
            <div key={s.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[#94A3B8] font-mono truncate max-w-[200px]">{s.name}</span>
                <span className="text-xs text-[#64748B]"><span className="text-[#00D4AA]">{s.picked}</span>/{s.total} {t(lang, "slices")}</span>
              </div>
              <div className="flex gap-px">
                {Array.from({ length: bucketCount }, (_, i) => {
                  const sliceIdx = i * bucketSize;
                  const isCentral = sliceIdx >= start && sliceIdx <= end;
                  return (
                    <div key={i} className="h-3 rounded-[2px] flex-1 max-w-[6px] transition-colors"
                      style={{ backgroundColor: isCentral ? "#334155" : "#1E293B50" }}
                      title={isCentral ? t(lang, "filmstripCentral") : t(lang, "filmstripTrimmed")} />
                  );
                })}
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="text-[9px] text-[#334155]">0</span>
                <span className="text-[9px] text-[#0D9488]">{t(lang, "filmstripCentral")}</span>
                <span className="text-[9px] text-[#334155]">{s.total}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
