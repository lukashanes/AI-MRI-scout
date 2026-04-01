"use client";

import { Upload, Cpu, Send, Brain, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

export type AnalysisPhase = "preparing" | "selecting" | "sending" | "analyzing" | "done" | "error";

interface AnalysisStepperProps {
  phase: AnalysisPhase;
  elapsed: number;
  streamChars?: number;
  imageCount: number;
  lang: string;
}

const STEPS = [
  { phase: "preparing", icon: Upload, key: "stepPreparing" },
  { phase: "selecting", icon: Cpu, key: "stepSelecting" },
  { phase: "sending", icon: Send, key: "stepSending" },
  { phase: "analyzing", icon: Brain, key: "stepAnalyzing" },
] as const;

const PHASE_ORDER = ["preparing", "selecting", "sending", "analyzing", "done"];

export function AnalysisStepper({ phase, elapsed, streamChars, imageCount, lang }: AnalysisStepperProps) {
  const currentIdx = PHASE_ORDER.indexOf(phase);

  return (
    <div className="rounded-xl border border-[#1E293B] px-4 py-4 animate-fade-in" style={{ backgroundColor: "#111827" }}>
      <div className="flex items-center justify-between mb-4">
        {STEPS.map((step, i) => {
          const stepIdx = PHASE_ORDER.indexOf(step.phase);
          const isComplete = currentIdx > stepIdx;
          const isActive = currentIdx === stepIdx;
          const Icon = step.icon;
          return (
            <div key={step.phase} className="flex items-center flex-1 last:flex-initial">
              <div className="flex flex-col items-center gap-1.5">
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all",
                  isComplete ? "border-[#00D4AA] bg-[#00D4AA] text-[#0A0E1A]" :
                  isActive ? "border-[#00D4AA] bg-[#042F2E] text-[#00D4AA] animate-pulse" :
                  "border-[#334155] bg-[#1E293B] text-[#64748B]"
                )}>
                  {isComplete ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className={cn("text-[10px] text-center", isActive ? "text-[#00D4AA] font-medium" : isComplete ? "text-[#94A3B8]" : "text-[#64748B]")}>
                  {t(lang, step.key)}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("flex-1 h-0.5 mx-3 mt-[-18px]", isComplete ? "bg-[#00D4AA]" : "bg-[#334155]")} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-[#94A3B8]">
          {phase === "sending" && t(lang, "sending", { count: imageCount })}
          {phase === "analyzing" && t(lang, "receiving", { chars: streamChars || 0 })}
          {phase === "done" && t(lang, "done", { time: elapsed.toFixed(1) })}
          {(phase === "preparing" || phase === "selecting") && t(lang, STEPS.find(s => s.phase === phase)?.key || "stepPreparing")}
        </span>
        <span className="font-mono text-xs text-[#00D4AA]">{elapsed.toFixed(1)}s</span>
      </div>
    </div>
  );
}
