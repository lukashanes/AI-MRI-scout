"use client";

import { Clock, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalysisResultData } from "./analysis-result";
import type { UploadedImage } from "./upload-zone";

export interface HistoryEntry {
  id: string;
  images: UploadedImage[];
  results: AnalysisResultData[];
  timestamp: Date;
}

interface AnalysisHistoryProps {
  entries: HistoryEntry[];
  activeId: string | null;
  onSelect: (entry: HistoryEntry) => void;
}

const PROVIDER_ICON: Record<string, React.ReactNode> = {
  Gemini: <Cpu className="w-3 h-3 text-blue-400" />,
};

export function AnalysisHistory({
  entries,
  activeId,
  onSelect,
}: AnalysisHistoryProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center text-gray-600 text-sm py-8">
        No analyses yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider px-1">
        History ({entries.length})
      </h3>
      <div className="space-y-1 max-h-[600px] overflow-y-auto">
        {entries.map((entry) => (
          <button
            key={entry.id}
            onClick={() => onSelect(entry)}
            className={cn(
              "w-full text-left p-3 rounded-lg transition-all",
              activeId === entry.id
                ? "bg-gray-800 border border-teal-700"
                : "bg-gray-900/50 border border-transparent hover:bg-gray-800/50 hover:border-gray-700"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              {entry.images.length > 0 && (
                <img
                  src={entry.images[0].preview}
                  alt=""
                  className="w-8 h-8 rounded object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-400 truncate">
                  {entry.images.length} image
                  {entry.images.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  {entry.results.map((r) => (
                    <span key={r.provider}>{PROVIDER_ICON[r.provider]}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <Clock className="w-3 h-3" />
                {new Date(entry.timestamp).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
