"use client";

import { cn } from "@/lib/utils";
import { Cpu, CheckCircle, XCircle } from "lucide-react";

export type ProviderSlug = "gemini";

interface ProviderInfo {
  slug: ProviderSlug;
  name: string;
  model: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
}

const PROVIDERS: ProviderInfo[] = [
  {
    slug: "gemini",
    name: "Gemini",
    model: "gemini-3.1-pro-preview",
    color: "text-blue-400",
    bgColor: "bg-blue-950/30",
    borderColor: "border-blue-700",
    icon: <Cpu className="w-8 h-8" />,
  },
];

interface ProviderSelectorProps {
  selected: ProviderSlug | null;
  onSelect: (provider: ProviderSlug) => void;
  status: Record<string, boolean>;
}

export function ProviderSelector({
  selected,
  onSelect,
  status,
}: ProviderSelectorProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
        AI Provider
      </h2>
      <div className="grid grid-cols-1 gap-3">
        {PROVIDERS.map((p) => {
          const available = status[p.slug];
          const isSelected = selected === p.slug;

          return (
            <button
              key={p.slug}
              onClick={() => available && onSelect(p.slug)}
              disabled={!available}
              className={cn(
                "relative p-4 rounded-lg border-2 transition-all text-left",
                available
                  ? "cursor-pointer hover:scale-[1.01]"
                  : "cursor-not-allowed opacity-50",
                isSelected
                  ? `${p.borderColor} ${p.bgColor} ring-2 ring-offset-2 ring-offset-gray-950 ${p.borderColor.replace("border-", "ring-")}`
                  : "border-gray-700 bg-gray-900 hover:border-gray-600"
              )}
            >
              <div className="flex items-center gap-4">
                <div className={cn(p.color)}>{p.icon}</div>
                <div className="flex-1">
                  <h3 className={cn("font-semibold text-lg", p.color)}>
                    {p.name}
                    {isSelected && (
                      <span className="ml-2 text-sm">Selected</span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">
                    {p.model}
                  </p>
                </div>
                {available ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
              </div>
              {!available && (
                <p className="text-xs text-red-400 mt-2 ml-12">
                  API key not configured
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
