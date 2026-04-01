"use client";

import { AlertTriangle } from "lucide-react";
import { t } from "@/lib/i18n";

interface DisclaimerProps {
  accepted: boolean;
  onAccept: (accepted: boolean) => void;
  lang: string;
}

export function Disclaimer({ accepted, onAccept, lang }: DisclaimerProps) {
  return (
    <>
      <div className="border-b px-4 py-3" style={{ backgroundColor: "#450A0A", borderColor: "#991B1B" }}>
        <div className="max-w-6xl mx-auto flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#EF4444] shrink-0 mt-0.5" />
          <p className="text-sm text-[#FCA5A5]">
            <span className="font-bold">⚕️</span> {t(lang, "disclaimer")}
          </p>
        </div>
      </div>
      {!accepted && (
        <div className="border-b px-4 py-4" style={{ backgroundColor: "#111827", borderColor: "#1E293B" }}>
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <input type="checkbox" id="disclaimer-accept" checked={accepted} onChange={(e) => onAccept(e.target.checked)}
              className="w-4 h-4 rounded border-[#334155] bg-[#1E293B] accent-[#00D4AA]" />
            <label htmlFor="disclaimer-accept" className="text-sm text-[#94A3B8] cursor-pointer select-none">
              {t(lang, "disclaimerCheck")}
            </label>
          </div>
        </div>
      )}
    </>
  );
}
