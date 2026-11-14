"use client";

import { useMemo, useState } from "react";
import { Key, Check, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProviderStatus {
  ready: boolean;
  providers: {
    gemini: boolean;
  };
}

interface ApiKeySetupProps {
  status: ProviderStatus;
  onSaved: () => void;
}

export function ApiKeySetup({ status, onSaved }: ApiKeySetupProps) {
  const [open, setOpen] = useState(false);
  const [googleKey, setGoogleKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const readyCount = useMemo(() => Number(status.providers.gemini), [status.providers.gemini]);

  const save = async () => {
    if (!googleKey.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleApiKey: googleKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save.");
      } else {
        setGoogleKey("");
        setOpen(false);
        onSaved();
      }
    } catch {
      setError("Network error.");
    }
    setSaving(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border transition-colors",
          status.ready
            ? "border-[#065F46] bg-[#022C22] text-[#10B981] hover:bg-[#053126]"
            : "border-[#991B1B] bg-[#450A0A] text-[#EF4444] hover:bg-[#991B1B]/30"
        )}
        title="Configure provider API keys"
      >
        <Key className="w-3 h-3" />
        <span>API Keys</span>
        <span className="rounded-full border border-current/30 px-1.5 py-0.5 text-[10px] leading-none">
          {readyCount}/1
        </span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => { if (status.ready) setOpen(false); }}>
      <div
        className="rounded-xl border border-[#334155] p-5 w-full max-w-md space-y-4 animate-fade-in"
        style={{ backgroundColor: "#111827" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-[#00D4AA]" />
          <h2 className="text-base font-bold text-[#F1F5F9]">Provider API Keys</h2>
        </div>

        <p className="text-xs text-[#94A3B8] leading-relaxed">
          MRI Scout now uses only Google Gemini. Add or replace the Gemini API key here.
        </p>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[#F1F5F9]">Google Gemini</label>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-[#00D4AA] hover:text-[#00E8BB] transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Get key
            </a>
          </div>
          <input
            type="password"
            value={googleKey}
            onChange={(e) => setGoogleKey(e.target.value)}
            placeholder={status.providers.gemini ? "Configured - paste to replace" : "Paste Google API key"}
            className="w-full px-3 py-2 rounded-lg text-sm border border-[#334155] bg-[#0A0E1A] text-[#F1F5F9] placeholder-[#64748B] focus:border-[#00D4AA] focus:outline-none"
          />
        </div>

        <div className="text-[11px] text-[#94A3B8] space-y-1">
          <p>Configured now: Gemini {status.providers.gemini ? "yes" : "no"}</p>
        </div>

        {error && <p className="text-xs text-[#EF4444]">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={!googleKey.trim() || saving}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors",
              googleKey.trim() && !saving
                ? "bg-[#00D4AA] text-[#0A0E1A] hover:bg-[#00E8BB]"
                : "bg-[#1E293B] text-[#64748B] cursor-not-allowed"
            )}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? "Saving..." : "Save & Connect"}
          </button>
          {status.ready && (
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-lg text-sm text-[#94A3B8] border border-[#334155] hover:bg-[#1E293B] transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        <p className="text-[10px] text-[#64748B] italic">
          Keys are stored locally in .env.local and only sent to the selected model providers.
        </p>
      </div>
    </div>
  );
}
