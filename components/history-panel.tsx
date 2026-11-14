"use client";

import { useState, useEffect } from "react";
import { History, Trash2, ChevronDown, ChevronUp, AlertOctagon, AlertTriangle, ShieldCheck, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { getHistory, deleteAnalysis, clearHistory, type HistoryEntry } from "@/lib/history";

interface HistoryPanelProps {
  onLoad: (entry: HistoryEntry) => void;
}

const REC_ICON = {
  none: ShieldCheck,
  routine: Info,
  advised: AlertTriangle,
  urgent: AlertOctagon,
};
const REC_COLOR = {
  none: "text-[#10B981]",
  routine: "text-[#3B82F6]",
  advised: "text-[#F59E0B]",
  urgent: "text-[#EF4444]",
};

export function HistoryPanel({ onLoad }: HistoryPanelProps) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const h = await getHistory(20);
      setEntries(h);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined" || open || entries.length > 0) return;

    getHistory(1)
      .then((h) => {
        if (h.length > 0) setEntries(h);
      })
      .catch(() => {});
  }, [open, entries.length]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteAnalysis(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleClear = async () => {
    await clearHistory();
    setEntries([]);
  };

  if (entries.length === 0 && !open) return null;

  return (
    <div className="no-print">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors"
      >
        <History className="w-3.5 h-3.5" />
        Past analyses ({entries.length})
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-[#1E293B] overflow-hidden animate-fade-in" style={{ backgroundColor: "#111827" }}>
          {loading ? (
            <div className="p-4 text-xs text-[#64748B]">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="p-4 text-xs text-[#64748B]">No past analyses</div>
          ) : (
            <>
              <div className="max-h-64 overflow-y-auto divide-y divide-[#1E293B]">
                {entries.map((entry) => {
                  const rec = entry.recommendation as keyof typeof REC_ICON;
                  const RecIcon = REC_ICON[rec] || Info;
                  const color = REC_COLOR[rec] || "text-[#94A3B8]";
                  return (
                    <div
                      key={entry.id}
                      onClick={() => { onLoad(entry); setOpen(false); }}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-[#1E293B] cursor-pointer transition-colors"
                    >
                      <RecIcon className={cn("w-4 h-4 shrink-0", color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#F1F5F9] truncate">{entry.summary.slice(0, 80)}...</p>
                        <p className="text-[10px] text-[#64748B]">{entry.date} — {entry.imageCount} slices — {(entry.duration / 1000).toFixed(1)}s</p>
                      </div>
                      <button
                        onClick={(e) => handleDelete(entry.id, e)}
                        className="p-1 text-[#64748B] hover:text-[#EF4444] transition-colors shrink-0"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-[#1E293B] px-3 py-2">
                <button onClick={handleClear} className="text-[10px] text-[#64748B] hover:text-[#EF4444] transition-colors">
                  Clear all history
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
