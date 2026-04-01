"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Disclaimer } from "@/components/disclaimer";
import { LanguageSelector } from "@/components/language-selector";
import { ApiKeySetup } from "@/components/api-key-setup";
import { UploadZone, type UploadedImage } from "@/components/upload-zone";
import { ImageViewer } from "@/components/image-viewer";
import { ImageLightbox } from "@/components/image-lightbox";
import { Onboarding } from "@/components/onboarding";
import { AnalysisStepper, type AnalysisPhase } from "@/components/analysis-stepper";
import { SeriesFilmstrip } from "@/components/series-filmstrip";
import { FindingCard, type ImageFinding } from "@/components/finding-card";
import { ToastContainer, type ToastItem } from "@/components/toast";
import { selectRepresentativeImages, getNeighboringSlices, getSliceRange } from "@/lib/image-selector";
import { getDeepDivePrompt } from "@/lib/providers/system-prompt";
import { t } from "@/lib/i18n";
import {
  Activity, Printer, FileDown,
  CheckCircle2, AlertTriangle, XCircle,
  ShieldCheck, Info, AlertOctagon,
  Loader2, Search, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_IMAGES = 50;
const STATUS_PRIORITY: Record<string, number> = { abnormal: 0, note: 1, normal: 2 };

interface SeriesRequest {
  series_prefix: string;
  from_slice: number;
  to_slice: number;
  reason: string;
}

interface AnalysisData {
  summary: string;
  recommendation: "none" | "routine" | "advised" | "urgent";
  recommendation_text: string;
  injury_pattern?: string | null;
  structures_affected?: string[];
  urgency_reason?: string | null;
  needs_more_slices?: boolean;
  series_requests?: SeriesRequest[];
  images: ImageFinding[];
  disclaimer: string;
}

interface StreamState {
  text: string;
  stage: "sending" | "streaming" | "done" | "error";
  duration?: number;
  error?: string;
}

const REC_CONFIG = {
  none:    { Icon: ShieldCheck,   color: "text-[#10B981]", bg: "bg-[#022C22]",  border: "border-[#065F46]", iconBg: "bg-[#065F46]" },
  routine: { Icon: Info,          color: "text-[#3B82F6]", bg: "bg-[#172554]",  border: "border-[#1E40AF]", iconBg: "bg-[#1E40AF]" },
  advised: { Icon: AlertTriangle, color: "text-[#F59E0B]", bg: "bg-[#422006]",  border: "border-[#92400E]", iconBg: "bg-[#92400E]" },
  urgent:  { Icon: AlertOctagon,  color: "text-[#EF4444]", bg: "bg-[#450A0A]",  border: "border-[#991B1B]", iconBg: "bg-[#991B1B]" },
};

function parseAnalysis(text: string): AnalysisData | null {
  try {
    let clean = text.trim();
    if (clean.startsWith("```")) clean = clean.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(clean);
  } catch { return null; }
}

export default function Home() {
  const [lang, setLang] = useState("en");
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [providerReady, setProviderReady] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<AnalysisPhase>("preparing");
  const [stream, setStream] = useState<StreamState | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [selectedImages, setSelectedImages] = useState<UploadedImage[]>([]);
  const [selectionInfo, setSelectionInfo] = useState<{
    ids: Set<string>;
    series: { name: string; total: number; centralRange: string; picked: number }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [viewerImage, setViewerImage] = useState<UploadedImage | null>(null);
  const [viewerFinding, setViewerFinding] = useState<ImageFinding | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  const [deepDiveAnalysis, setDeepDiveAnalysis] = useState<AnalysisData | null>(null);
  const [deepDiveStream, setDeepDiveStream] = useState<StreamState | null>(null);
  const [deepDiveImages, setDeepDiveImages] = useState<UploadedImage[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [lightboxImage, setLightboxImage] = useState<UploadedImage | null>(null);
  const [lightboxFinding, setLightboxFinding] = useState<ImageFinding | null>(null);
  const [progressStatus, setProgressStatus] = useState<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevImageCount = useRef(0);
  const deepDiveRef = useRef<HTMLDivElement>(null);

  const [retranslating, setRetranslating] = useState(false);
  const prevLang = useRef(lang);

  const addToast = useCallback((message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((tt) => tt.id !== id)), 4000);
  }, []);

  const exportPDF = useCallback(() => {
    if (!analysis) return;
    const reportData = {
      analysis,
      deepDive: deepDiveAnalysis,
      imageUrls: selectedImages.map((img) => img.preview),
      deepDiveImageUrls: deepDiveImages.map((img) => img.preview),
      date: new Date().toLocaleDateString(),
      lang,
      duration: stream?.duration || 0,
    };
    sessionStorage.setItem("mri-scout-report", JSON.stringify(reportData));
    window.open("/report", "_blank");
  }, [analysis, deepDiveAnalysis, selectedImages, deepDiveImages, lang, stream]);

  const checkApiKey = useCallback(() => {
    fetch("/api/config").then((r) => r.json()).then((s) => setProviderReady(!!s.ready)).catch(() => {});
  }, []);

  useEffect(() => {
    checkApiKey();
  }, []);

  useEffect(() => {
    if (images.length === 0) { setSelectionInfo(null); setSelectedImages([]); return; }
    if (images.length !== prevImageCount.current && images.length > 0) {
      addToast(t(lang, "toastUploaded", { count: images.length }), "success");
    }
    prevImageCount.current = images.length;
    const res = selectRepresentativeImages(images.map((img) => ({ id: img.id, name: img.file.name })), MAX_IMAGES);
    const ids = new Set(res.selectedIds);
    setSelectionInfo({ ids, series: res.series });
    const sel = images.filter((img) => ids.has(img.id));
    setSelectedImages(sel);
    setProgressStatus(t(lang, "statusSelecting"));
  }, [images]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loading || deepDiveLoading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 0.1), 100);
    } else { if (timerRef.current) clearInterval(timerRef.current); }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading, deepDiveLoading]);

  // Re-translate when language changes and analysis exists
  useEffect(() => {
    if (lang === prevLang.current) return;
    prevLang.current = lang;
    if (!analysis || selectedImages.length === 0 || loading || retranslating) return;

    const retranslate = async () => {
      setRetranslating(true);
      addToast(t(lang, "translateOutput"), "info");
      const payload = selectedImages.map((img) => ({ data: img.base64, mediaType: img.mediaType }));
      try {
        const res = await fetch("/api/analyze", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: payload, provider: "gemini", lang }),
        });
        if (!res.ok) { setRetranslating(false); return; }
        const reader = res.body?.getReader();
        if (!reader) { setRetranslating(false); return; }
        const decoder = new TextDecoder();
        let buffer = "", finalContent = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n"); buffer = lines.pop() || "";
          let ev = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) ev = line.slice(7);
            else if (line.startsWith("data: ") && ev) {
              try {
                const d = JSON.parse(line.slice(6));
                if (ev === "done") finalContent = d.content;
              } catch {}
              ev = "";
            }
          }
        }
        const parsed = parseAnalysis(finalContent);
        if (parsed) setAnalysis(parsed);
      } catch {}
      setRetranslating(false);
    };
    retranslate();
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const runStream = useCallback(async (
    payload: { data: string; mediaType: string }[],
    setStreamFn: React.Dispatch<React.SetStateAction<StreamState | null>>,
    customPrompt?: string
  ): Promise<string> => {
    setStreamFn({ text: "", stage: "sending" });
    const res = await fetch("/api/analyze", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: payload, provider: "gemini", lang, customPrompt }),
    });
    if (!res.ok) {
      let msg = "Request failed";
      try { const ct = res.headers.get("content-type") || ""; if (ct.includes("json")) msg = (await res.json()).error || msg; } catch {}
      setStreamFn((s) => s ? { ...s, stage: "error", error: msg } : s);
      throw new Error(msg);
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");
    const decoder = new TextDecoder();
    let buffer = "", finalContent = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop() || "";
      let ev = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) ev = line.slice(7);
        else if (line.startsWith("data: ") && ev) {
          try {
            const d = JSON.parse(line.slice(6));
            if (ev === "chunk") setStreamFn((s) => s ? { ...s, stage: "streaming", text: s.text + d.text } : s);
            else if (ev === "done") { finalContent = d.content; setStreamFn((s) => s ? { ...s, stage: "done", text: d.content, duration: d.duration } : s); }
            else if (ev === "error") { setStreamFn((s) => s ? { ...s, stage: "error", error: d.error } : s); throw new Error(d.error); }
          } catch (e) { if (e instanceof Error && e.message !== "skip") throw e; }
          ev = "";
        }
      }
    }
    return finalContent;
  }, [lang]);

  const runDeepDive = useCallback(async (seriesRequests?: SeriesRequest[]) => {
    if (!selectionInfo) return;
    setDeepDiveLoading(true); setDeepDiveAnalysis(null);
    setProgressStatus(t(lang, "statusDeepDive"));

    // If AI requested specific slice ranges, use those (targeted deep dive)
    let deepDiveIds: string[] = [];
    const imgFiles = images.map((img) => ({ id: img.id, name: img.file.name }));

    if (seriesRequests && seriesRequests.length > 0) {
      for (const req of seriesRequests) {
        const rangeIds = getSliceRange(imgFiles, req.series_prefix, req.from_slice, req.to_slice, 30);
        deepDiveIds.push(...rangeIds);
      }
    }

    // Fallback: add neighbors if targeted didn't find enough
    if (deepDiveIds.length < 10) {
      const neighborIds = getNeighboringSlices(imgFiles, [...selectionInfo.ids], 20);
      deepDiveIds.push(...neighborIds);
    }

    // Deduplicate and add original selection
    const allIds = new Set([...selectionInfo.ids, ...deepDiveIds]);
    const dImages = images.filter((img) => allIds.has(img.id)).slice(0, MAX_IMAGES);
    setDeepDiveImages(dImages);

    const payload = dImages.map((img) => ({ data: img.base64, mediaType: img.mediaType }));
    try {
      const content = await runStream(payload, setDeepDiveStream, getDeepDivePrompt(lang, dImages.length));
      const parsed = parseAnalysis(content);
      if (parsed) {
        setDeepDiveAnalysis(parsed);
        setProgressStatus(t(lang, "statusComplete"));
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Deep dive error"); }
    finally { setDeepDiveLoading(false); }
  }, [images, selectionInfo, lang, runStream]);

  const analyze = useCallback(async () => {
    if (selectedImages.length === 0) return;
    setLoading(true); setError(null); setAnalysis(null); setDeepDiveAnalysis(null); setDeepDiveStream(null);
    setExpandedCard(null); setViewerImage(null); setViewerFinding(null);
    setPhase("preparing"); setProgressStatus(t(lang, "statusAnalyzing"));
    setTimeout(() => setPhase("selecting"), 200);
    setTimeout(() => setPhase("sending"), 600);
    const payload = selectedImages.map((img) => ({ data: img.base64, mediaType: img.mediaType }));
    try {
      setPhase("sending");
      const content = await runStream(payload, setStream);
      setPhase("done");
      const parsed = parseAnalysis(content);
      if (parsed) {
        setAnalysis(parsed);
        const abnCount = parsed.images.filter((i) => i.status === "abnormal").length;
        const noteCount = parsed.images.filter((i) => i.status === "note").length;
        const shouldDeepDive = abnCount > 0 || parsed.needs_more_slices || parsed.images.some((i) => i.deep_dive_recommended);
        if (shouldDeepDive) {
          setProgressStatus(t(lang, "statusAnomalies"));
          addToast(t(lang, "toastAnalysisAttention", { count: abnCount + noteCount }), "warning");
          setTimeout(() => runDeepDive(parsed.series_requests), 500);
        } else {
          setProgressStatus(t(lang, "statusComplete"));
          addToast(t(lang, "toastAnalysisDone"), "success");
        }
      } else { setError("Failed to parse AI response."); }
    } catch (err) { setError(err instanceof Error ? err.message : "Analysis error"); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedImages, runStream, addToast, lang, selectionInfo, runDeepDive]);

  const neighborCount = selectionInfo ? getNeighboringSlices(images.map((img) => ({ id: img.id, name: img.file.name })), [...selectionInfo.ids], 15).length : 0;
  const canAnalyze = disclaimerAccepted && providerReady && selectedImages.length > 0 && !loading;
  const normalCount = analysis?.images.filter((i) => i.status === "normal").length || 0;
  const noteCount = analysis?.images.filter((i) => i.status === "note").length || 0;
  const abnormalCount = analysis?.images.filter((i) => i.status === "abnormal").length || 0;
  const keyFindings = analysis?.images.filter((i) => i.status !== "normal") || [];

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#0A0E1A" }}>
      <Disclaimer accepted={disclaimerAccepted} onAccept={setDisclaimerAccepted} lang={lang} />

      {/* Header */}
      <header className="border-b border-[#1E293B] px-4 py-3 no-print" style={{ backgroundColor: "#111827" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#042F2E" }}>
              <Activity className="w-5 h-5 text-[#00D4AA]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#F1F5F9]">{t(lang, "appName")}</h1>
              <p className="text-xs text-[#64748B]">{t(lang, "subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSelector lang={lang} onChange={setLang} />
            <ApiKeySetup ready={providerReady} onSaved={checkApiKey} />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full p-4 lg:p-6 space-y-5">
        {/* Progress status bar */}
        {progressStatus && images.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-[#94A3B8] px-1 no-print">
            {(loading || deepDiveLoading) && <Loader2 className="w-3 h-3 animate-spin text-[#00D4AA]" />}
            {!loading && !deepDiveLoading && analysis && <CheckCircle2 className="w-3 h-3 text-[#10B981]" />}
            <span>{progressStatus}</span>
            {(loading || deepDiveLoading) && <span className="text-[#00D4AA] font-mono">{elapsed.toFixed(1)}s</span>}
          </div>
        )}

        {/* Upload */}
        <div className="no-print">
          <UploadZone images={images} onImagesChange={(imgs) => {
            setImages(imgs); setAnalysis(null); setStream(null); setDeepDiveAnalysis(null); setProgressStatus("");
          }} disabled={loading || deepDiveLoading} lang={lang} />
        </div>

        {images.length === 0 && !analysis && <Onboarding lang={lang} />}

        {selectionInfo && !analysis && (
          <SeriesFilmstrip seriesData={selectionInfo.series} totalImages={images.length} selectedCount={selectedImages.length} lang={lang} />
        )}

        {!loading && !analysis && (
          <button onClick={analyze} disabled={!canAnalyze}
            className={cn("w-full py-3 px-6 rounded-lg font-semibold text-sm transition-all no-print",
              canAnalyze ? "bg-[#00D4AA] hover:bg-[#00E8BB] text-[#0A0E1A] loading-glow" : "bg-[#1E293B] text-[#64748B] cursor-not-allowed"
            )}>
            {!disclaimerAccepted ? t(lang, "analyzeBtnNoDisclaimer") : !providerReady ? t(lang, "analyzeBtnNoKey") : images.length === 0 ? t(lang, "analyzeBtnNoImages") : t(lang, "analyzeBtn", { count: selectedImages.length })}
          </button>
        )}

        {loading && <AnalysisStepper phase={stream?.stage === "streaming" ? "analyzing" : phase} elapsed={elapsed} streamChars={stream?.text.length} imageCount={selectedImages.length} lang={lang} />}

        {stream && stream.stage === "streaming" && !analysis && (
          <div className="rounded-lg p-3 border border-[#1E293B]" style={{ backgroundColor: "#111827" }}>
            <pre className="text-xs text-[#64748B] font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
              {stream.text}<span className="inline-block w-2 h-3 bg-[#00D4AA] animate-pulse ml-0.5" />
            </pre>
          </div>
        )}

        {error && <div className="bg-[#450A0A] border border-[#991B1B] rounded-lg px-4 py-3 text-sm text-[#EF4444]">{error}</div>}

        {/* ========== RESULTS ========== */}
        {analysis && (
          <div className="space-y-5">

            {/* SUMMARY — recommendation + summary text + counts */}
            {(() => {
              const rec = REC_CONFIG[analysis.recommendation];
              const RecIcon = rec.Icon;
              return (
                <div className={cn("rounded-xl border overflow-hidden animate-fade-in", rec.border)} style={{ backgroundColor: "#111827" }}>
                  {/* Recommendation bar */}
                  <div className={cn("px-4 py-3 flex items-center gap-3", rec.bg)}>
                    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", rec.iconBg)}>
                      <RecIcon className={cn("w-5 h-5", rec.color)} />
                    </div>
                    <h2 className={cn("font-bold text-base flex-1", rec.color)}>{analysis.recommendation_text}</h2>
                    <div className="flex items-center gap-2 no-print">
                      {retranslating && <Loader2 className="w-3 h-3 animate-spin text-[#00D4AA]" />}
                      <button onClick={exportPDF} className="flex items-center gap-1 text-xs text-[#64748B] hover:text-[#00D4AA] transition-colors" title="Export PDF">
                        <FileDown className="w-4 h-4" />
                        <span className="hidden sm:inline">PDF</span>
                      </button>
                    </div>
                  </div>
                  {/* Summary text + clinical info */}
                  <div className="px-4 py-3 space-y-3">
                    <p className="text-sm text-[#94A3B8] leading-relaxed">{analysis.summary}</p>

                    {/* Injury pattern + affected structures */}
                    {analysis.injury_pattern && (
                      <div className="text-sm text-[#F59E0B] bg-[#422006]/50 rounded-lg px-3 py-2 border border-[#92400E]/50">
                        <strong>{t(lang, "recommendation")}:</strong> {analysis.injury_pattern}
                      </div>
                    )}
                    {analysis.structures_affected && analysis.structures_affected.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.structures_affected.map((s, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full border border-[#991B1B] bg-[#450A0A] text-[#EF4444]">{s}</span>
                        ))}
                      </div>
                    )}
                    {analysis.urgency_reason && (
                      <p className="text-xs text-[#EF4444] italic">{analysis.urgency_reason}</p>
                    )}

                    {/* Counts + deep dive status */}
                    <div className="flex items-center gap-3 flex-wrap border-t border-[#1E293B] pt-2">
                      <span className="flex items-center gap-1 text-xs text-[#10B981]"><CheckCircle2 className="w-3 h-3" />{t(lang, "findingsNormal", { count: normalCount })}</span>
                      <span className="flex items-center gap-1 text-xs text-[#F59E0B]"><AlertTriangle className="w-3 h-3" />{t(lang, "findingsNote", { count: noteCount })}</span>
                      <span className="flex items-center gap-1 text-xs text-[#EF4444]"><XCircle className="w-3 h-3" />{t(lang, "findingsAbnormal", { count: abnormalCount })}</span>
                      {stream?.duration && <span className="text-[10px] text-[#64748B] font-mono">({(stream.duration / 1000).toFixed(1)}s)</span>}
                      {deepDiveLoading && <span className="flex items-center gap-1 text-[10px] text-[#00D4AA]"><Loader2 className="w-3 h-3 animate-spin" />{t(lang, "statusDeepDive")}</span>}
                      {deepDiveAnalysis && !deepDiveLoading && (
                        <button onClick={() => deepDiveRef.current?.scrollIntoView({ behavior: "smooth" })} className="flex items-center gap-1 text-[10px] text-[#0D9488] hover:text-[#00D4AA]">
                          <ArrowRight className="w-3 h-3" />{t(lang, "viewDeepDiveResults")}
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-[#64748B] italic">{analysis.disclaimer}</p>
                  </div>
                </div>
              );
            })()}

            {/* PER-IMAGE FINDINGS — each image shown full with description beside it */}
            <div className="space-y-4">
              {analysis.images
                .map((img, i) => ({ finding: img, originalIndex: i }))
                .sort((a, b) => (STATUS_PRIORITY[a.finding.status] ?? 2) - (STATUS_PRIORITY[b.finding.status] ?? 2))
                .map(({ finding: img, originalIndex }) => {
                  const imageFile = selectedImages[originalIndex];
                  return (
                    <FindingCard
                      key={originalIndex}
                      finding={img}
                      image={imageFile}
                      sliceLabel={t(lang, "sliceOf", { n: originalIndex + 1, total: selectedImages.length })}
                      isExpanded={expandedCard === originalIndex}
                      onToggleExpand={() => setExpandedCard(expandedCard === originalIndex ? null : originalIndex)}
                      onThumbnailClick={() => { setLightboxImage(imageFile || null); setLightboxFinding(img); }}
                      onDeepDive={() => runDeepDive()}
                      deepDiveDisabled={deepDiveLoading}
                      deepDiveCompleted={!!deepDiveAnalysis}
                      onScrollToDeepDive={() => deepDiveRef.current?.scrollIntoView({ behavior: "smooth" })}
                      neighborCount={neighborCount}
                      lang={lang}
                    />
                  );
                })}
            </div>

            {/* DEEP DIVE SECTION */}
            {deepDiveLoading && deepDiveStream && (
              <div className="rounded-lg p-4 border border-[#1E293B] animate-fade-in" style={{ backgroundColor: "#111827" }}>
                <div className="flex items-center gap-2 text-[#0D9488] text-sm mb-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {deepDiveStream.stage === "streaming" ? t(lang, "receiving", { chars: deepDiveStream.text.length }) : t(lang, "deepDiving")}
                </div>
                {deepDiveStream.stage === "streaming" && (
                  <pre className="text-xs text-[#64748B] font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
                    {deepDiveStream.text}<span className="inline-block w-2 h-3 bg-[#0D9488] animate-pulse ml-0.5" />
                  </pre>
                )}
              </div>
            )}

            {deepDiveAnalysis && (
              <div ref={deepDiveRef} className="space-y-3 animate-fade-in">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-[#0D9488]" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-[#0D9488]">{t(lang, "deepDiveResults")}</h3>
                </div>
                {(() => {
                  const rec = REC_CONFIG[deepDiveAnalysis.recommendation];
                  const RecIcon = rec.Icon;
                  return (
                    <div className={cn("rounded-lg border p-4", rec.bg, rec.border)}>
                      <div className="flex items-center gap-2">
                        <RecIcon className={cn("w-4 h-4", rec.color)} />
                        <span className={cn("font-semibold text-sm", rec.color)}>{deepDiveAnalysis.recommendation_text}</span>
                      </div>
                      <p className="text-sm text-[#94A3B8] mt-1">{deepDiveAnalysis.summary}</p>
                    </div>
                  );
                })()}
                {deepDiveAnalysis.images
                  .map((img, i) => ({ finding: img, originalIndex: i }))
                  .sort((a, b) => (STATUS_PRIORITY[a.finding.status] ?? 2) - (STATUS_PRIORITY[b.finding.status] ?? 2))
                  .map(({ finding: img, originalIndex }) => (
                    <FindingCard
                      key={`dd-${originalIndex}`}
                      finding={img}
                      image={deepDiveImages[originalIndex]}
                      sliceLabel={`Deep ${originalIndex + 1}/${deepDiveAnalysis.images.length}`}
                      isExpanded={false}
                      onToggleExpand={() => {}}
                      onThumbnailClick={() => { setLightboxImage(deepDiveImages[originalIndex] || null); setLightboxFinding(img); }}
                      lang={lang}
                    />
                  ))}
              </div>
            )}
          </div>
        )}
      </main>

      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage.preview} alt={lightboxImage.file.name}
          onClose={() => { setLightboxImage(null); setLightboxFinding(null); }}
          markerX={lightboxFinding?.marker_x} markerY={lightboxFinding?.marker_y}
          markerStatus={lightboxFinding?.status} caption={lightboxImage.file.name}
        />
      )}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
