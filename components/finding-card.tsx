"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Search, Expand, ArrowDown, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { UploadedImage } from "./upload-zone";

interface ImageFinding {
  index: number;
  body_part?: string;
  sequence?: string;
  finding: string;
  status: "normal" | "note" | "abnormal";
  severity?: "normal" | "mild" | "moderate" | "severe" | "complete_rupture";
  temporal?: "acute" | "subacute" | "chronic" | null;
  detail: string;
  deep_dive_recommended?: boolean;
  deep_dive_reason?: string;
  marker_x?: number;
  marker_y?: number;
}

interface FindingCardProps {
  finding: ImageFinding;
  image?: UploadedImage;
  sliceLabel: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDeepDive?: () => void;
  onThumbnailClick?: () => void;
  deepDiveDisabled?: boolean;
  deepDiveCompleted?: boolean;
  onScrollToDeepDive?: () => void;
  neighborCount?: number;
  lang: string;
}

const STATUS_CONFIG = {
  normal:   { Icon: CheckCircle2,  color: "text-[#10B981]", border: "border-[#065F46]", badgeBg: "bg-[#022C22]", dotColor: "#10B981" },
  note:     { Icon: AlertTriangle, color: "text-[#F59E0B]", border: "border-[#92400E]", badgeBg: "bg-[#422006]", dotColor: "#F59E0B" },
  abnormal: { Icon: XCircle,       color: "text-[#EF4444]", border: "border-[#991B1B]", badgeBg: "bg-[#450A0A]", dotColor: "#EF4444" },
};

const STATUS_KEY = { normal: "statusNormal", note: "statusNote", abnormal: "statusAbnormal" } as const;

export type { ImageFinding };

export function FindingCard({
  finding, image, sliceLabel, isExpanded, onToggleExpand,
  onDeepDive, onThumbnailClick, deepDiveDisabled,
  deepDiveCompleted, onScrollToDeepDive, neighborCount = 0, lang,
}: FindingCardProps) {
  const config = STATUS_CONFIG[finding.status];
  const StatusIcon = config.Icon;
  const hasMarker = finding.status !== "normal" && finding.marker_x != null && finding.marker_y != null;
  const [showMarker, setShowMarker] = useState(true);

  return (
    <div className={cn("rounded-xl border overflow-hidden animate-fade-in", config.border)} style={{ backgroundColor: "#111827" }}>
      {/* Image + description side by side */}
      <div className="flex flex-col lg:flex-row">
        {/* Image — shown at full card width on mobile, ~320px on desktop */}
        {image && (
          <div className="relative shrink-0 lg:w-[320px] group/img">
            <img
              src={image.preview}
              alt={finding.body_part || "MRI slice"}
              className="w-full lg:w-[320px] h-auto lg:h-full object-contain bg-black cursor-pointer"
              onClick={onThumbnailClick}
            />
            {/* Marker */}
            {hasMarker && showMarker && (
              <div
                className="absolute pointer-events-none"
                style={{ left: `${finding.marker_x}%`, top: `${finding.marker_y}%`, transform: "translate(-50%, -50%)" }}
              >
                <div className="w-8 h-8 rounded-full border-2 animate-pulse" style={{ borderColor: config.dotColor, backgroundColor: `${config.dotColor}30` }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.dotColor }} />
              </div>
            )}
            {/* Status badge */}
            <span className={cn("absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold", config.badgeBg, config.color)}>
              <StatusIcon className="w-3 h-3" />{t(lang, STATUS_KEY[finding.status])}
            </span>
            {/* Slice label */}
            <span className="absolute bottom-2 left-2 text-[10px] bg-black/70 text-[#94A3B8] px-1.5 py-0.5 rounded">{sliceLabel}</span>
            {/* Controls: marker toggle + zoom */}
            <div className="absolute bottom-2 right-2 flex gap-1">
              {hasMarker && (
                <button onClick={(e) => { e.stopPropagation(); setShowMarker(!showMarker); }}
                  className={cn("p-1 rounded text-xs transition-colors", showMarker ? "bg-[#042F2E] text-[#00D4AA]" : "bg-black/50 text-[#64748B]")}
                  title={showMarker ? "Hide marker" : "Show marker"}>
                  <Crosshair className="w-3.5 h-3.5" />
                </button>
              )}
              {onThumbnailClick && (
                <button onClick={(e) => { e.stopPropagation(); onThumbnailClick(); }}
                  className="p-1 rounded bg-black/50 text-[#94A3B8] hover:text-white transition-colors" title="Zoom">
                  <Expand className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Text content */}
        <div className="flex-1 min-w-0 p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusIcon className={cn("w-4 h-4", config.color)} />
            <h3 className={cn("font-semibold", config.color)}>{finding.body_part || `Slice ${finding.index + 1}`}</h3>
            {finding.sequence && <code className="text-[10px] text-[#64748B] bg-[#1E293B] px-1.5 py-0.5 rounded">{finding.sequence}</code>}
            {finding.severity && finding.severity !== "normal" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1E293B] text-[#94A3B8] border border-[#334155]">
                {finding.severity === "complete_rupture" ? "Complete rupture" : finding.severity}
              </span>
            )}
            {finding.temporal && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1E293B] text-[#64748B]">
                {finding.temporal}
              </span>
            )}
          </div>

          <p className="text-sm text-[#94A3B8] leading-relaxed">{finding.finding}</p>

          {/* Expandable detail */}
          <div className={cn("overflow-hidden transition-all duration-300 ease-in-out", isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0")}>
            <div className="text-sm text-[#64748B] rounded p-3 mt-1 leading-relaxed" style={{ backgroundColor: "#0A0E1A" }}>
              {finding.detail}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button onClick={onToggleExpand} className="flex items-center gap-1 text-xs text-[#00D4AA] hover:text-[#00E8BB] transition-colors">
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {isExpanded ? t(lang, "less") : t(lang, "detail")}
            </button>

            {deepDiveCompleted && onScrollToDeepDive ? (
              <button onClick={onScrollToDeepDive} className="flex items-center gap-1.5 text-xs text-[#0D9488] hover:text-[#00D4AA] transition-colors">
                <ArrowDown className="w-3 h-3" />{t(lang, "viewDeepDiveResults")}
              </button>
            ) : onDeepDive && !deepDiveCompleted ? (
              <button onClick={onDeepDive} disabled={deepDiveDisabled}
                className={cn("flex items-center gap-1.5 text-xs rounded px-2 py-1 transition-all",
                  finding.deep_dive_recommended ? "text-[#00D4AA] bg-[#042F2E] border border-[#0D9488] animate-pulse" : "text-[#64748B] hover:text-[#94A3B8] bg-[#1E293B] border border-[#334155]",
                  deepDiveDisabled && "opacity-40 cursor-not-allowed"
                )}>
                <Search className="w-3 h-3" />
                {neighborCount > 0 ? t(lang, "deepDive", { count: neighborCount }) : t(lang, "deepDive", { count: "?" })}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
