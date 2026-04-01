"use client";

import { useState } from "react";
import { Key, Check, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiKeySetupProps {
  ready: boolean;
  onSaved: () => void;
}

export function ApiKeySetup({ ready, onSaved }: ApiKeySetupProps) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!key.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save.");
      } else {
        setKey("");
        setOpen(false);
        onSaved();
      }
    } catch {
      setError("Network error.");
    }
    setSaving(false);
  };

  if (ready && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs"
        title="API key configured — click to change"
      >
        <div className="w-2 h-2 rounded-full bg-[#10B981]" />
        <span className="text-[#10B981] hidden sm:inline">Ready</span>
      </button>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border border-[#991B1B] bg-[#450A0A] text-[#EF4444] hover:bg-[#991B1B]/30 transition-colors"
      >
        <Key className="w-3 h-3" />
        Set API Key
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)}>
      <div
        className="rounded-xl border border-[#334155] p-5 w-full max-w-md space-y-4 animate-fade-in"
        style={{ backgroundColor: "#111827" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-[#00D4AA]" />
          <h2 className="text-base font-bold text-[#F1F5F9]">Google AI API Key</h2>
        </div>

        <p className="text-xs text-[#94A3B8] leading-relaxed">
          MRI Scout uses the Google Gemini API to analyze images. You need a free API key:
        </p>

        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-[#00D4AA] hover:text-[#00E8BB] transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Get a free key at Google AI Studio
        </a>

        <div className="space-y-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste your API key here..."
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="w-full px-3 py-2 rounded-lg text-sm border border-[#334155] bg-[#0A0E1A] text-[#F1F5F9] placeholder-[#64748B] focus:border-[#00D4AA] focus:outline-none"
          />

          {error && <p className="text-xs text-[#EF4444]">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={!key.trim() || saving}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors",
                key.trim() && !saving
                  ? "bg-[#00D4AA] text-[#0A0E1A] hover:bg-[#00E8BB]"
                  : "bg-[#1E293B] text-[#64748B] cursor-not-allowed"
              )}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? "Saving..." : "Save & Connect"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-lg text-sm text-[#94A3B8] border border-[#334155] hover:bg-[#1E293B] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

        <p className="text-[10px] text-[#64748B] italic">
          Key is stored locally in .env.local — never sent anywhere except Google API.
        </p>
      </div>
    </div>
  );
}
