"use client";

import { LANGUAGES } from "@/lib/i18n";
import { Globe } from "lucide-react";

interface LanguageSelectorProps {
  lang: string;
  onChange: (lang: string) => void;
}

export function LanguageSelector({ lang, onChange }: LanguageSelectorProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Globe className="w-4 h-4 text-[#64748B]" />
      <select
        value={lang}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#1E293B] border border-[#334155] rounded px-2 py-1 text-xs text-[#94A3B8] focus:border-[#00D4AA] focus:outline-none cursor-pointer max-w-[140px]"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
