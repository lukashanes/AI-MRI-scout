"use client";

import { Upload, Cpu, Search } from "lucide-react";
import { t } from "@/lib/i18n";

const STEPS = [
  { icon: Upload, key: "onboardingStep1", descKey: "onboardingStep1Desc" },
  { icon: Cpu, key: "onboardingStep2", descKey: "onboardingStep2Desc" },
  { icon: Search, key: "onboardingStep3", descKey: "onboardingStep3Desc" },
];

export function Onboarding({ lang }: { lang: string }) {
  return (
    <div className="rounded-xl p-8 animate-fade-in border border-[#1E293B]" style={{ backgroundColor: "#111827" }}>
      <h2 className="text-lg font-bold text-[#F1F5F9] text-center">{t(lang, "onboardingTitle")}</h2>
      <p className="text-sm text-[#64748B] text-center mt-1">{t(lang, "onboardingSubtitle")}</p>

      <div className="flex items-start justify-center gap-4 mt-8">
        {STEPS.map((step, i) => (
          <div key={step.key} className="flex items-start gap-4">
            <div className="flex flex-col items-center text-center w-36">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3 border-2 border-[#0D9488]" style={{ backgroundColor: "#042F2E" }}>
                <step.icon className="w-6 h-6 text-[#00D4AA]" />
              </div>
              <span className="text-xs font-bold text-[#00D4AA] mb-1">{i + 1}. {t(lang, step.key)}</span>
              <span className="text-xs text-[#64748B]">{t(lang, step.descKey)}</span>
            </div>
            {i < STEPS.length - 1 && <div className="mt-7 w-12 border-t border-dashed border-[#334155]" />}
          </div>
        ))}
      </div>
    </div>
  );
}
