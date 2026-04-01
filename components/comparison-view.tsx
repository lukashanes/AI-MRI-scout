"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  AnalysisResult,
  type AnalysisResultData,
} from "./analysis-result";

interface ComparisonViewProps {
  results: AnalysisResultData[];
}

const PROVIDER_COLORS: Record<string, string> = {
  Claude: "border-amber-600 text-amber-400",
  ChatGPT: "border-emerald-600 text-emerald-400",
  Gemini: "border-blue-600 text-blue-400",
};

export function ComparisonView({ results }: ComparisonViewProps) {
  const [activeTab, setActiveTab] = useState(0);

  if (results.length === 0) return null;
  if (results.length === 1) return <AnalysisResult result={results[0]} />;

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
        {results.map((r, i) => (
          <button
            key={r.provider}
            onClick={() => setActiveTab(i)}
            className={cn(
              "flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all",
              activeTab === i
                ? `bg-gray-800 ${PROVIDER_COLORS[r.provider] || "text-gray-300"}`
                : "text-gray-500 hover:text-gray-300"
            )}
          >
            {r.provider}
            <span className="ml-2 text-xs opacity-60">
              {(r.duration / 1000).toFixed(1)}s
            </span>
          </button>
        ))}
      </div>

      {/* Active result */}
      <AnalysisResult result={results[activeTab]} />
    </div>
  );
}
