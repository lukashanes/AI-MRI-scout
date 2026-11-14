"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Disclaimer } from "@/components/disclaimer";
import { LanguageSelector } from "@/components/language-selector";
import { ApiKeySetup, type ProviderStatus } from "@/components/api-key-setup";
import { UploadZone, type UploadedImage } from "@/components/upload-zone";
import { ImageLightbox } from "@/components/image-lightbox";
import { Onboarding } from "@/components/onboarding";
import { AnalysisStepper, type AnalysisPhase } from "@/components/analysis-stepper";
import { SeriesFilmstrip } from "@/components/series-filmstrip";
import { FindingCard, type ImageFinding } from "@/components/finding-card";
import { ToastContainer, type ToastItem } from "@/components/toast";
import { selectRepresentativeImages, selectExplorationImages, getNeighboringSlices, getSliceRange } from "@/lib/image-selector";
import { getDeepDivePrompt, getExplorationPrompt } from "@/lib/providers/system-prompt";
import { AnalysisResponseSchema, type ValidatedAnalysis } from "@/lib/schema";
import { saveAnalysis, type HistoryEntry } from "@/lib/history";
import { HistoryPanel } from "@/components/history-panel";
import { t } from "@/lib/i18n";
import {
  Activity, FileDown, FileJson, FileSpreadsheet,
  CheckCircle2, AlertTriangle, XCircle,
  ShieldCheck, Info, AlertOctagon,
  Loader2, Search, ArrowRight, RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_IMAGES = 50;
const STATUS_PRIORITY: Record<string, number> = { abnormal: 0, note: 1, normal: 2 };

function recommendationScore(value: ValidatedAnalysis["recommendation"]): number {
  switch (value) {
    case "urgent":
      return 4;
    case "advised":
      return 3;
    case "routine":
      return 2;
    default:
      return 1;
  }
}

function severityScore(value?: string): number {
  switch (value) {
    case "complete_rupture":
      return 6;
    case "severe":
      return 5;
    case "moderate":
      return 4;
    case "mild":
      return 3;
    case "normal":
      return 1;
    default:
      return 0;
  }
}

function analysisStrengthScore(analysis: ValidatedAnalysis): number {
  const abnormalScore = analysis.images
    .filter((finding) => finding.status === "abnormal")
    .reduce((sum, finding) => sum + severityScore(finding.severity) * 10 + (finding.confidence ?? 0) / 10, 0);
  const noteScore = analysis.images
    .filter((finding) => finding.status === "note")
    .reduce((sum, finding) => sum + 4 + (finding.confidence ?? 0) / 20, 0);

  return (
    recommendationScore(analysis.recommendation) * 40 +
    abnormalScore +
    noteScore +
    analysis.structures_affected.length * 8 -
    (analysis.needs_more_slices ? 10 : 0)
  );
}

function shouldRunExploratoryPass(analysis: ValidatedAnalysis): boolean {
  const abnormalCount = analysis.images.filter((finding) => finding.status === "abnormal").length;
  const noteCount = analysis.images.filter((finding) => finding.status === "note").length;
  const maxConfidence = Math.max(0, ...analysis.images.map((finding) => finding.confidence ?? 0));

  return (
    analysis.needs_more_slices ||
    abnormalCount === 0 ||
    (abnormalCount === 0 && noteCount > 0) ||
    analysis.structures_affected.length === 0 ||
    maxConfidence < 70
  );
}

function choosePreferredAnalysis(primary: ValidatedAnalysis, followUp: ValidatedAnalysis): ValidatedAnalysis {
  const primaryScore = analysisStrengthScore(primary);
  const followUpScore = analysisStrengthScore(followUp);
  return followUpScore >= primaryScore + 12 ? followUp : primary;
}

function getImageName(image: UploadedImage): string {
  return image.name;
}

function getImageContext(image: UploadedImage): string | undefined {
  if (image.sourceType !== "dicom" || !image.dicomMeta) return undefined;

  const parts: string[] = [];
  if (image.dicomMeta.seriesNumber != null) parts.push(`series ${image.dicomMeta.seriesNumber}`);
  if (image.dicomMeta.seriesDescription) parts.push(image.dicomMeta.seriesDescription);
  else if (image.dicomMeta.protocolName) parts.push(image.dicomMeta.protocolName);
  if (image.dicomMeta.instanceNumber != null) parts.push(`instance ${image.dicomMeta.instanceNumber}`);
  if (image.dicomMeta.rows && image.dicomMeta.cols) parts.push(`${image.dicomMeta.rows}x${image.dicomMeta.cols}`);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

interface SeriesRequest {
  series_prefix: string;
  from_slice: number;
  to_slice: number;
  reason: string;
}

interface StreamState {
  text: string;
  stage: "sending" | "streaming" | "done" | "error";
  duration?: number;
  error?: string;
}

interface ServerAuditEntry {
  pass: string;
  provider: string;
  imageCount: number;
  status: "completed" | "error";
  durationMs?: number;
  recommendation?: string;
  structures?: string[];
  summary?: string;
  error?: string;
}

interface StreamStatusEvent {
  stage: string;
  message?: string;
  detail?: string;
  kind?: "info" | "finding" | "verify" | "success";
  structures?: string[];
  focusAreas?: string[];
}

interface StreamDonePayload {
  content: string;
  duration?: number;
  auditTrail?: ServerAuditEntry[];
}

interface ScanUpdate {
  id: string;
  message: string;
  detail?: string;
  kind: "info" | "finding" | "verify" | "success";
  stage?: string;
  structures?: string[];
  focusAreas?: string[];
}

interface AuditTrailEntry extends ServerAuditEntry {
  id: string;
  selectedFiles?: string[];
}

const REC_CONFIG = {
  none:    { Icon: ShieldCheck,   color: "text-[#10B981]", bg: "bg-[#022C22]",  border: "border-[#065F46]", iconBg: "bg-[#065F46]" },
  routine: { Icon: Info,          color: "text-[#3B82F6]", bg: "bg-[#172554]",  border: "border-[#1E40AF]", iconBg: "bg-[#1E40AF]" },
  advised: { Icon: AlertTriangle, color: "text-[#F59E0B]", bg: "bg-[#422006]",  border: "border-[#92400E]", iconBg: "bg-[#92400E]" },
  urgent:  { Icon: AlertOctagon,  color: "text-[#EF4444]", bg: "bg-[#450A0A]",  border: "border-[#991B1B]", iconBg: "bg-[#991B1B]" },
};

function parseAnalysis(text: string): ValidatedAnalysis | null {
  try {
    let clean = text.trim();
    if (clean.startsWith("```")) clean = clean.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const raw = JSON.parse(clean);
    const result = AnalysisResponseSchema.safeParse(raw);
    if (result.success) return result.data;
    console.warn("Schema validation errors:", result.error.issues);
    // Fallback: try raw parse if schema fails on non-critical fields
    return AnalysisResponseSchema.parse(raw);
  } catch { return null; }
}

function exportJSON(
  analysis: ValidatedAnalysis,
  deepDive: ValidatedAnalysis | null,
  auditTrail: AuditTrailEntry[]
) {
  const data = { analysis, deepDive, auditTrail, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mri-scout-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV(analysis: ValidatedAnalysis) {
  const headers = ["Index", "Body Part", "Sequence", "Status", "Severity", "Temporal", "Confidence", "Finding", "Detail", "Marker X", "Marker Y"];
  const escape = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
  const rows = analysis.images.map((img) => [
    img.index, escape(img.body_part || ""), escape(img.sequence || ""),
    img.status, img.severity || "", img.temporal || "", img.confidence ?? "",
    escape(img.finding), escape(img.detail),
    img.marker_x ?? "", img.marker_y ?? "",
  ].join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mri-scout-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function getScanStageLabel(lang: string, stage?: string): string {
  const cs = lang.startsWith("cs");
  switch (stage) {
    case "processing":
      return cs ? "Příprava" : "Preparing";
    case "primary_pass":
      return cs ? "Hledání" : "Searching";
    case "primary_findings":
      return cs ? "Předběžný nález" : "Preliminary finding";
    case "peer_review":
      return cs ? "Ověřování" : "Verifying";
    case "peer_review_result":
      return cs ? "Výsledek ověření" : "Verification result";
    case "finalizing":
      return cs ? "Finalizace" : "Finalizing";
    default:
      return cs ? "Průběh" : "Progress";
  }
}

function getAuditPassLabel(lang: string, pass: string): string {
  const cs = lang.startsWith("cs");
  switch (pass) {
    case "primary":
      return cs ? "Hlavní průchod" : "Primary pass";
    case "internal_verification":
      return cs ? "Interní ověření" : "Internal verification";
    case "exploration":
      return cs ? "Exploratorní průchod" : "Exploration pass";
    case "targeted_verification":
      return cs ? "Cílené ověření" : "Targeted verification";
    default:
      return pass;
  }
}

export default function Home() {
  const [lang, setLang] = useState("en");
  const [analysisLang, setAnalysisLang] = useState("en"); // Locked during analysis
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>({
    ready: false,
    providers: {
      gemini: false,
    },
  });
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<AnalysisPhase>("preparing");
  const [stream, setStream] = useState<StreamState | null>(null);
  const [analysis, setAnalysis] = useState<ValidatedAnalysis | null>(null);
  const [selectedImages, setSelectedImages] = useState<UploadedImage[]>([]);
  const [selectionInfo, setSelectionInfo] = useState<{
    ids: Set<string>;
    series: { name: string; total: number; centralRange: string; picked: number }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  const [deepDiveAnalysis, setDeepDiveAnalysis] = useState<ValidatedAnalysis | null>(null);
  const [deepDiveStream, setDeepDiveStream] = useState<StreamState | null>(null);
  const [deepDiveImages, setDeepDiveImages] = useState<UploadedImage[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [lightboxImage, setLightboxImage] = useState<UploadedImage | null>(null);
  const [lightboxFinding, setLightboxFinding] = useState<ImageFinding | null>(null);
  const [progressStatus, setProgressStatus] = useState<string>("");
  const [scanUpdates, setScanUpdates] = useState<ScanUpdate[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevImageCount = useRef(0);
  const deepDiveRef = useRef<HTMLDivElement>(null);
  const auditTrailRef = useRef<AuditTrailEntry[]>([]);

  const [retranslating, setRetranslating] = useState(false);
  const prevLang = useRef(lang);

  const addToast = useCallback((message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((tt) => tt.id !== id)), 4000);
  }, []);

  const addScanUpdate = useCallback((
    message: string,
    kind: ScanUpdate["kind"] = "info",
    detail?: string,
    meta?: Pick<ScanUpdate, "stage" | "structures" | "focusAreas">
  ) => {
    setProgressStatus(message);
    setScanUpdates((prev) => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.message === message &&
        last.detail === detail &&
        last.kind === kind &&
        last.stage === meta?.stage
      ) {
        return prev;
      }
      return [
        ...prev.slice(-5),
        {
          id: crypto.randomUUID(),
          message,
          detail,
          kind,
          stage: meta?.stage,
          structures: meta?.structures?.slice(0, 4),
          focusAreas: meta?.focusAreas?.slice(0, 4),
        },
      ];
    });
  }, []);

  const addAuditEntries = useCallback((
    pass: AuditTrailEntry["pass"],
    selectedFiles: string[],
    entries: ServerAuditEntry[]
  ) => {
    setAuditTrail((prev) => {
      const next = [
        ...prev,
        ...entries.map((entry) => ({
          ...entry,
          id: crypto.randomUUID(),
          pass,
          selectedFiles: selectedFiles.slice(0, 12),
        })),
      ];
      auditTrailRef.current = next;
      return next;
    });
  }, []);

  const exportPDF = useCallback(() => {
    if (!analysis) return;
    const reportData = {
      analysis,
      deepDive: deepDiveAnalysis,
      auditTrail,
      imageUrls: selectedImages.map((img) => img.preview),
      deepDiveImageUrls: deepDiveImages.map((img) => img.preview),
      date: new Date().toLocaleDateString(),
      lang: analysisLang,
      duration: stream?.duration || 0,
    };
    sessionStorage.setItem("mri-scout-report", JSON.stringify(reportData));
    window.open("/report", "_blank");
  }, [analysis, deepDiveAnalysis, auditTrail, selectedImages, deepDiveImages, analysisLang, stream]);

  const checkApiKey = useCallback(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((s) => setProviderStatus({
        ready: !!s.ready,
        providers: {
          gemini: !!s.providers?.gemini,
        },
      }))
      .catch(() => {});
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
    setProgressStatus(t(lang, "statusSelecting"));
    const res = selectRepresentativeImages(images.map((img) => ({ id: img.id, name: getImageName(img) })), MAX_IMAGES);
    const ids = new Set(res.selectedIds);
    setSelectionInfo({ ids, series: res.series });
    const sel = images.filter((img) => ids.has(img.id));
    setSelectedImages(sel);
    addToast(t(lang, "toastSelected", { count: sel.length }), "info");
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
      const payload = selectedImages.map((img) => ({
        data: img.base64,
        mediaType: img.mediaType,
        name: getImageName(img),
        context: getImageContext(img),
      }));
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
        if (parsed) {
          setAnalysis(parsed);
          setAnalysisLang(lang);
        }
      } catch (err) {
        console.error("Retranslation failed:", err);
        addToast("Translation failed", "error");
      }
      setRetranslating(false);
    };
    retranslate();
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const runStream = useCallback(async (
    payload: { data: string; mediaType: string; name?: string; context?: string }[],
    setStreamFn: React.Dispatch<React.SetStateAction<StreamState | null>>,
    customPrompt?: string,
    onStatus?: (status: StreamStatusEvent) => void,
    onDone?: (done: StreamDonePayload) => void
  ): Promise<string> => {
    setStreamFn({ text: "", stage: "sending" });
    const res = await fetch("/api/analyze", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: payload, provider: "gemini", lang: analysisLang, customPrompt }),
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
            else if (ev === "done") {
              finalContent = d.content;
              setStreamFn((s) => s ? { ...s, stage: "done", text: d.content, duration: d.duration } : s);
              onDone?.(d);
            }
            else if (ev === "error") { setStreamFn((s) => s ? { ...s, stage: "error", error: d.error } : s); throw new Error(d.error); }
            else if (ev === "status") { onStatus?.(d); }
          } catch (e) { if (e instanceof Error && e.message !== "skip") throw e; }
          ev = "";
        }
      }
    }
    return finalContent;
  }, [analysisLang]);

  const runDeepDive = useCallback(async (
    seriesRequests?: SeriesRequest[],
    focusIds?: string[],
    customPrompt?: string,
    passLabel: AuditTrailEntry["pass"] = "targeted_verification"
  ): Promise<ValidatedAnalysis | null> => {
    if (!selectionInfo) return null;
    setDeepDiveLoading(true); setDeepDiveAnalysis(null);
    setProgressStatus(t(lang, "statusDeepDive"));

    let deepDiveIds: string[] = [];
    const anchorIds = focusIds && focusIds.length > 0 ? focusIds : [...selectionInfo.ids];
    const imgFiles = images.map((img) => ({ id: img.id, name: getImageName(img) }));

    if (seriesRequests && seriesRequests.length > 0) {
      for (const req of seriesRequests) {
        const rangeIds = getSliceRange(imgFiles, req.series_prefix, req.from_slice, req.to_slice, 30);
        deepDiveIds.push(...rangeIds);
      }
    }

    if (deepDiveIds.length < 10) {
      const neighborIds = getNeighboringSlices(imgFiles, anchorIds, 20);
      deepDiveIds.push(...neighborIds);
    }

    const allIds = new Set([...anchorIds, ...deepDiveIds]);
    const dImages = images.filter((img) => allIds.has(img.id)).slice(0, MAX_IMAGES);
    if (dImages.length === 0) {
      setDeepDiveLoading(false);
      return null;
    }
    setDeepDiveImages(dImages);

    const payload = dImages.map((img) => ({
      data: img.base64,
      mediaType: img.mediaType,
      name: getImageName(img),
      context: getImageContext(img),
    }));
    try {
      const content = await runStream(
        payload,
        setDeepDiveStream,
        customPrompt || getDeepDivePrompt(analysisLang, dImages.length),
        (status) => {
          if (status.message) {
            addScanUpdate(status.message, status.kind || "info", status.detail, {
              stage: status.stage,
              structures: status.structures,
              focusAreas: status.focusAreas,
            });
          }
        },
        (done) => {
          if (done.auditTrail?.length) {
            addAuditEntries(passLabel, dImages.map((img) => getImageName(img)), done.auditTrail);
          }
        }
      );
      const parsed = parseAnalysis(content);
      if (parsed) {
        setDeepDiveAnalysis(parsed);
        setProgressStatus(t(lang, "statusComplete"));
        return parsed;
      }
      return null;
    } catch (err) { setError(err instanceof Error ? err.message : "Deep dive error"); return null; }
    finally { setDeepDiveLoading(false); }
  }, [images, selectionInfo, lang, analysisLang, runStream, addScanUpdate, addAuditEntries]);

  const analyze = useCallback(async () => {
    if (selectedImages.length === 0) return;
    // Lock language for this analysis session
    setAnalysisLang(lang);
    setLoading(true); setError(null); setAnalysis(null); setDeepDiveAnalysis(null); setDeepDiveStream(null);
    setScanUpdates([]);
    setAuditTrail([]);
    auditTrailRef.current = [];
    setExpandedCard(null);
    setPhase("preparing"); setProgressStatus(t(lang, "statusAnalyzing"));
    addScanUpdate(
      lang.startsWith("cs")
        ? "Zahajuji hlavní průchod nad reprezentativní sadou řezů."
        : "Starting the main pass over the representative slice set.",
      "info",
      lang.startsWith("cs")
        ? `Vybráno je ${selectedImages.length} řezů napříč sériemi.`
        : `${selectedImages.length} slices are queued across the detected series.`,
      {
        stage: "processing",
        focusAreas: lang.startsWith("cs")
          ? ["výběr řezů", "pokrytí studie", "hlavní průchod"]
          : ["slice selection", "study coverage", "main pass"],
      }
    );
    setTimeout(() => setPhase("selecting"), 200);
    setTimeout(() => setPhase("sending"), 600);
    const payload = selectedImages.map((img) => ({
      data: img.base64,
      mediaType: img.mediaType,
      name: getImageName(img),
      context: getImageContext(img),
    }));
    try {
      setPhase("sending");
      const content = await runStream(payload, setStream, undefined, (status) => {
        if (status.message) {
          addScanUpdate(status.message, status.kind || "info", status.detail, {
            stage: status.stage,
            structures: status.structures,
            focusAreas: status.focusAreas,
          });
        }
      }, (done) => {
        if (done.auditTrail?.length) {
          addAuditEntries("primary", selectedImages.map((img) => getImageName(img)), done.auditTrail);
        }
      });
      setPhase("done");
      const parsed = parseAnalysis(content);
      if (parsed) {
        let finalAnalysis = parsed;
        let followUpAnalysis: ValidatedAnalysis | null = null;
        setAnalysis(parsed);

        const severeFindings = parsed.images.filter((i) =>
          i.status === "abnormal" &&
          (i.severity === "moderate" || i.severity === "severe" || i.severity === "complete_rupture")
        );
        const shouldDeepDive = severeFindings.length > 0 || parsed.needs_more_slices;
        const shouldExplore = shouldRunExploratoryPass(parsed);
        const abnCount = parsed.images.filter((i) => i.status === "abnormal").length;
        const noteCount = parsed.images.filter((i) => i.status === "note").length;

        if (shouldExplore) {
          const exploratoryIds = selectExplorationImages(
            images.map((img) => ({ id: img.id, name: getImageName(img) })),
            selectedImages.map((img) => img.id),
            MAX_IMAGES
          );
          if (exploratoryIds.length > 0) {
            addScanUpdate(
              lang.startsWith("cs")
                ? "První průchod je nejistý, rozšiřuji hledání na další řezy."
                : "The first pass is uncertain, so the review is expanding to additional slices.",
              "verify",
              lang.startsWith("cs")
                ? `Do exploratorního průchodu jde ${exploratoryIds.length} dosud nezkontrolovaných řezů.`
                : `${exploratoryIds.length} previously unseen slices are being checked in the exploratory pass.`,
              {
                stage: "peer_review",
                focusAreas: lang.startsWith("cs")
                  ? ["rozšířené hledání", "další řezy", "vyloučení přehlédnutí"]
                  : ["expanded search", "additional slices", "missed lesion check"],
              }
            );
            const exploratoryPrompt = getExplorationPrompt(
              analysisLang,
              exploratoryIds.length,
              parsed.summary,
              parsed.structures_affected
            );
            const exploratoryAnalysis = await runDeepDive(undefined, exploratoryIds, exploratoryPrompt, "exploration");
            if (exploratoryAnalysis) {
              followUpAnalysis = exploratoryAnalysis;
              finalAnalysis = choosePreferredAnalysis(finalAnalysis, exploratoryAnalysis);
              setAnalysis(finalAnalysis);
            }
          }
        }

        if (shouldDeepDive) {
          const suspiciousImageIds = parsed.images
            .map((finding, index) => ({ finding, index }))
            .filter(({ finding }) => finding.status !== "normal" && (finding.confidence ?? 0) >= 35)
            .map(({ index }) => selectedImages[index]?.id)
            .filter((id): id is string => !!id);

          addScanUpdate(
            lang.startsWith("cs")
              ? "Ověřuji podezřelé řezy a jejich sousedy."
              : "Verifying suspicious slices and their neighbors.",
            "finding",
            lang.startsWith("cs")
              ? `K detailní kontrole jde ${suspiciousImageIds.length} označených řezů.`
              : `${suspiciousImageIds.length} flagged slices were selected for targeted verification.`,
            {
              stage: "peer_review",
              focusAreas: lang.startsWith("cs")
                ? ["cílené ověření", "sousední řezy", "shoda nálezu"]
                : ["targeted verification", "neighboring slices", "finding agreement"],
            }
          );
          addToast(t(lang, "toastAnalysisAttention", { count: abnCount + noteCount }), "warning");
          const targetedAnalysis = await runDeepDive(parsed.series_requests, suspiciousImageIds, undefined, "targeted_verification");
          if (targetedAnalysis) {
            followUpAnalysis = targetedAnalysis;
            finalAnalysis = choosePreferredAnalysis(finalAnalysis, targetedAnalysis);
            setAnalysis(finalAnalysis);
          }
        }

        setProgressStatus(t(lang, "statusComplete"));
        addToast(t(lang, "toastAnalysisDone"), "success");

        saveAnalysis({
          id: crypto.randomUUID(),
          date: new Date().toLocaleString(),
          imageCount: selectedImages.length,
          recommendation: finalAnalysis.recommendation,
          summary: finalAnalysis.summary,
          analysis: finalAnalysis,
          deepDive: followUpAnalysis,
          duration: stream?.duration || 0,
          auditTrail: auditTrailRef.current,
        }).catch(() => {});
      } else { setError("Failed to parse AI response."); }
    } catch (err) { setError(err instanceof Error ? err.message : "Analysis error"); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedImages, runStream, addToast, lang, selectionInfo, runDeepDive, images, analysisLang, addScanUpdate]);

  const retry = useCallback(() => {
    setError(null);
    setStream(null);
    analyze();
  }, [analyze]);

  const loadFromHistory = useCallback((entry: HistoryEntry) => {
    setAnalysis(entry.analysis);
    setDeepDiveAnalysis(entry.deepDive);
    setAuditTrail(entry.auditTrail || []);
    auditTrailRef.current = entry.auditTrail || [];
    setProgressStatus(t(lang, "statusComplete"));
    addToast("Loaded from history", "info");
  }, [lang, addToast]);

  const neighborCount = selectionInfo ? getNeighboringSlices(images.map((img) => ({ id: img.id, name: getImageName(img) })), [...selectionInfo.ids], 15).length : 0;
  const canAnalyze = disclaimerAccepted && providerStatus.ready && selectedImages.length > 0 && !loading;
  const normalCount = analysis?.images.filter((i) => i.status === "normal").length || 0;
  const noteCount = analysis?.images.filter((i) => i.status === "note").length || 0;
  const abnormalCount = analysis?.images.filter((i) => i.status === "abnormal").length || 0;
  const activeStream = deepDiveLoading ? deepDiveStream : stream;
  const primaryPreviewImages = selectedImages.slice(0, 24);
  const deepDivePreviewImages = deepDiveImages.slice(0, 18);

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
            <ApiKeySetup status={providerStatus} onSaved={checkApiKey} />
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
            setImages(imgs); setAnalysis(null); setStream(null); setDeepDiveAnalysis(null); setProgressStatus(""); setError(null); setScanUpdates([]); setAuditTrail([]); auditTrailRef.current = [];
          }} disabled={loading || deepDiveLoading} lang={lang} />
        </div>

        <HistoryPanel onLoad={loadFromHistory} />

        {images.length === 0 && !analysis && <Onboarding lang={lang} />}

        {selectionInfo && !analysis && (
          <SeriesFilmstrip seriesData={selectionInfo.series} totalImages={images.length} selectedCount={selectedImages.length} lang={lang} />
        )}

        {!loading && !analysis && (
          <button onClick={analyze} disabled={!canAnalyze}
            className={cn("w-full py-3 px-6 rounded-lg font-semibold text-sm transition-all no-print",
              canAnalyze ? "bg-[#00D4AA] hover:bg-[#00E8BB] text-[#0A0E1A] loading-glow" : "bg-[#1E293B] text-[#64748B] cursor-not-allowed"
            )}>
            {!disclaimerAccepted ? t(lang, "analyzeBtnNoDisclaimer") : !providerStatus.ready ? t(lang, "analyzeBtnNoKey") : images.length === 0 ? t(lang, "analyzeBtnNoImages") : t(lang, "analyzeBtn", { count: selectedImages.length })}
          </button>
        )}

        {(loading || deepDiveLoading) && (
          <AnalysisStepper
            phase={activeStream?.stage === "streaming" ? "analyzing" : phase}
            elapsed={elapsed}
            streamChars={activeStream?.text.length}
            imageCount={selectedImages.length}
            lang={lang}
          />
        )}

        {(loading || deepDiveLoading) && scanUpdates.length > 0 && (
          <div className="rounded-xl border border-[#1E293B] p-4 animate-fade-in" style={{ backgroundColor: "#111827" }}>
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-[#00D4AA]" />
              <div>
                <p className="text-sm font-semibold text-[#F1F5F9]">{t(lang, "liveAnalysis")}</p>
                <p className="text-xs text-[#64748B]">
                  {lang.startsWith("cs")
                    ? "Průběžně vypisuji, co právě kontroluji a co potřebuji ověřit."
                    : "Live narration of what the model is checking, finding, and verifying."}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {scanUpdates.slice().reverse().map((item, index) => {
                const isCurrent = index === 0;
                const Icon =
                  item.kind === "finding" ? AlertTriangle :
                  item.kind === "verify" ? Search :
                  item.kind === "success" ? CheckCircle2 :
                  Info;

                const iconClass =
                  item.kind === "finding" ? "text-[#F59E0B]" :
                  item.kind === "verify" ? "text-[#38BDF8]" :
                  item.kind === "success" ? "text-[#10B981]" :
                  "text-[#94A3B8]";

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-lg border px-3 py-2 transition-colors",
                      isCurrent ? "border-[#00D4AA] bg-[#0A1324]" : "border-[#1E293B] bg-[#0F172A]"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5">
                        <Icon className={cn("w-4 h-4", iconClass, isCurrent && item.kind === "verify" && "animate-pulse")} />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                            item.kind === "finding" && "border-[#92400E] bg-[#422006] text-[#F59E0B]",
                            item.kind === "verify" && "border-[#0C4A6E] bg-[#082F49] text-[#38BDF8]",
                            item.kind === "success" && "border-[#065F46] bg-[#022C22] text-[#10B981]",
                            item.kind === "info" && "border-[#334155] bg-[#0F172A] text-[#94A3B8]"
                          )}>
                            {getScanStageLabel(lang, item.stage)}
                          </span>
                          {isCurrent && (
                            <span className="flex items-center gap-1 text-[10px] text-[#64748B]">
                              <span className="inline-block h-2 w-2 rounded-full bg-[#00D4AA] animate-pulse" />
                              {lang.startsWith("cs") ? "živě" : "live"}
                            </span>
                          )}
                        </div>
                        <p className={cn("text-sm leading-relaxed", isCurrent ? "text-[#F8FAFC]" : "text-[#CBD5E1]")}>
                          {item.message}
                        </p>
                        {item.detail && (
                          <p className="text-xs text-[#64748B] leading-relaxed">{item.detail}</p>
                        )}
                        {item.focusAreas && item.focusAreas.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {item.focusAreas.map((focus) => (
                              <span
                                key={focus}
                                className="rounded-full border border-[#1E3A5F] bg-[#0B1B33] px-2 py-0.5 text-[10px] text-[#93C5FD]"
                              >
                                {focus}
                              </span>
                            ))}
                          </div>
                        )}
                        {item.structures && item.structures.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {item.structures.map((structure) => (
                              <span
                                key={structure}
                                className="rounded-full border border-[#134E4A] bg-[#052E2B] px-2 py-0.5 text-[10px] text-[#5EEAD4]"
                              >
                                {structure}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Error with retry */}
        {error && (
          <div className="bg-[#450A0A] border border-[#991B1B] rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-[#EF4444]">{error}</span>
            <button onClick={retry} className="flex items-center gap-1.5 text-xs text-[#F1F5F9] bg-[#991B1B] hover:bg-[#B91C1C] px-3 py-1.5 rounded-lg transition-colors">
              <RotateCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        )}

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
                      <button onClick={() => exportJSON(analysis, deepDiveAnalysis, auditTrail)} className="flex items-center gap-1 text-xs text-[#64748B] hover:text-[#00D4AA] transition-colors" title="Export JSON">
                        <FileJson className="w-4 h-4" />
                        <span className="hidden sm:inline">JSON</span>
                      </button>
                      <button onClick={() => exportCSV(analysis)} className="flex items-center gap-1 text-xs text-[#64748B] hover:text-[#00D4AA] transition-colors" title="Export CSV">
                        <FileSpreadsheet className="w-4 h-4" />
                        <span className="hidden sm:inline">CSV</span>
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

                    {analysis.peer_review && analysis.peer_review.mode === "cross_check" && (
                      <div className="rounded-lg border border-[#1E293B] bg-[#0A0E1A] px-3 py-3 space-y-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="space-y-1">
                            <span className="block text-[11px] font-semibold text-[#F1F5F9]">
                              {analysis.peer_review.mode === "cross_check" ? "Two-model comparison" : "Single-model analysis"}
                            </span>
                            {analysis.peer_review.mode === "cross_check" && analysis.peer_review.reviewer_provider && (
                              <span className="block text-[10px] text-[#64748B]">
                                {analysis.peer_review.primary_provider} vs {analysis.peer_review.reviewer_provider}
                              </span>
                            )}
                          </div>
                          {analysis.peer_review.mode === "cross_check" && (
                            <span className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full border",
                              analysis.peer_review.agreement_level === "high" && "text-[#10B981] border-[#065F46] bg-[#022C22]",
                              analysis.peer_review.agreement_level === "medium" && "text-[#F59E0B] border-[#92400E] bg-[#422006]",
                              analysis.peer_review.agreement_level === "low" && "text-[#EF4444] border-[#991B1B] bg-[#450A0A]"
                            )}>
                              Agreement: {analysis.peer_review.agreement_level}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#94A3B8] leading-relaxed">{analysis.peer_review.consensus_summary}</p>
                        {analysis.peer_review.mode === "cross_check" && (
                          <div className="grid gap-2 md:grid-cols-2">
                            <div className="rounded-lg border border-[#065F46] bg-[#022C22]/70 px-3 py-2">
                              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#10B981]">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Where models agree
                              </div>
                              {analysis.peer_review.agreements.length > 0 ? (
                                <ul className="mt-2 space-y-1">
                                  {analysis.peer_review.agreements.map((item, index) => (
                                    <li key={index} className="text-[11px] text-[#D1FAE5] leading-relaxed">
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-2 text-[11px] text-[#A7F3D0]">
                                  No clear shared finding was confirmed by both models.
                                </p>
                              )}
                            </div>
                            <div className="rounded-lg border border-[#92400E] bg-[#422006]/70 px-3 py-2">
                              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#F59E0B]">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Where models disagree
                              </div>
                              {analysis.peer_review.disagreements.length > 0 ? (
                                <ul className="mt-2 space-y-1">
                                  {analysis.peer_review.disagreements.map((item, index) => (
                                    <li key={index} className="text-[11px] text-[#FDE68A] leading-relaxed">
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-2 text-[11px] text-[#FDE68A]">
                                  No unresolved disagreement was reported in the cross-check.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        {false && (
                          <p className="text-[11px] text-[#10B981]">
                            Agreed
                          </p>
                        )}
                        {false && (
                          <p className="text-[11px] text-[#F59E0B]">
                            Disputed
                          </p>
                        )}
                      </div>
                    )}

                    {auditTrail.length > 0 && (
                      <div className="rounded-lg border border-[#1E293B] bg-[#0A0E1A] px-3 py-3 space-y-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="space-y-1">
                            <span className="block text-[11px] font-semibold text-[#F1F5F9]">
                              {lang.startsWith("cs") ? "Audit průchodů" : "Analysis audit trail"}
                            </span>
                            <span className="block text-[10px] text-[#64748B]">
                              {lang.startsWith("cs")
                                ? "Záznam po jednotlivých průchodech pro dohledání, kde model ujel."
                                : "Per-pass log for tracing where the model drifted."}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {auditTrail.map((entry) => (
                            <div key={entry.id} className="rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="rounded-full border border-[#334155] bg-[#0A0E1A] px-2 py-0.5 text-[10px] text-[#F1F5F9]">
                                    {getAuditPassLabel(lang, entry.pass)}
                                  </span>
                                  <span className={cn(
                                    "rounded-full border px-2 py-0.5 text-[10px]",
                                    entry.status === "completed"
                                      ? "border-[#065F46] bg-[#022C22] text-[#10B981]"
                                      : "border-[#991B1B] bg-[#450A0A] text-[#EF4444]"
                                  )}>
                                    {entry.status}
                                  </span>
                                  <span className="text-[10px] text-[#64748B]">
                                    {entry.provider} · {entry.imageCount} {t(lang, "slices")}
                                  </span>
                                  {entry.durationMs != null && (
                                    <span className="text-[10px] text-[#64748B] font-mono">
                                      {(entry.durationMs / 1000).toFixed(1)}s
                                    </span>
                                  )}
                                </div>
                                {entry.recommendation && (
                                  <span className="text-[10px] text-[#94A3B8]">
                                    {lang.startsWith("cs") ? "doporučení" : "recommendation"}: {entry.recommendation}
                                  </span>
                                )}
                              </div>
                              {entry.summary && (
                                <p className="mt-2 text-[11px] text-[#CBD5E1] leading-relaxed">{entry.summary}</p>
                              )}
                              {entry.error && (
                                <p className="mt-2 text-[11px] text-[#FCA5A5] leading-relaxed">{entry.error}</p>
                              )}
                              {entry.structures && entry.structures.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {entry.structures.map((structure) => (
                                    <span key={structure} className="rounded-full border border-[#134E4A] bg-[#052E2B] px-2 py-0.5 text-[10px] text-[#5EEAD4]">
                                      {structure}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {entry.selectedFiles && entry.selectedFiles.length > 0 && (
                                <p className="mt-2 text-[10px] text-[#64748B] truncate">
                                  {entry.selectedFiles.join(", ")}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Counts + deep dive status */}
                    <div className="flex items-center gap-3 flex-wrap border-t border-[#1E293B] pt-2">
                      <span className="flex items-center gap-1 text-xs text-[#10B981]"><CheckCircle2 className="w-3 h-3" />{t(lang, "findingsNormal", { count: normalCount })}</span>
                      <span className="flex items-center gap-1 text-xs text-[#F59E0B]"><AlertTriangle className="w-3 h-3" />{t(lang, "findingsNote", { count: noteCount })}</span>
                      <span className="flex items-center gap-1 text-xs text-[#EF4444]"><XCircle className="w-3 h-3" />{t(lang, "findingsAbnormal", { count: abnormalCount })}</span>
                      {stream?.duration && <span className="text-[10px] text-[#64748B] font-mono">({(stream.duration / 1000).toFixed(1)}s)</span>}
                    </div>
                    <p className="text-[10px] text-[#64748B] italic">{analysis.disclaimer}</p>
                  </div>
                </div>
              );
            })()}

            <div className="rounded-xl border border-[#1E293B] p-4 space-y-3 animate-fade-in" style={{ backgroundColor: "#111827" }}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold text-[#F1F5F9]">
                    {lang.startsWith("cs") ? "Odeslané řezy do hlavní analýzy" : "Slices sent to the primary analysis"}
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    {lang.startsWith("cs")
                      ? `${selectedImages.length} vybraných řezů. ${t(lang, "clickToEnlarge")}.`
                      : `${selectedImages.length} selected slices. ${t(lang, "clickToEnlarge")}.`}
                  </p>
                </div>
                <span className="rounded-full border border-[#334155] bg-[#0F172A] px-2 py-0.5 text-[10px] text-[#94A3B8]">
                  {selectedImages.length} {t(lang, "slices")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {primaryPreviewImages.map((img, index) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => {
                      setLightboxImage(img);
                      setLightboxFinding(null);
                    }}
                    className="group overflow-hidden rounded-lg border border-[#1E293B] bg-[#0A0E1A] text-left transition-colors hover:border-[#00D4AA]"
                  >
                    <img
                      src={img.preview}
                      alt={getImageName(img)}
                      className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                    <div className="border-t border-[#1E293B] px-2 py-1.5">
                      <p className="text-[10px] text-[#F1F5F9] font-medium truncate">
                        {t(lang, "scan")} {index + 1}
                      </p>
                      <p className="text-[10px] text-[#64748B] truncate">{getImageName(img)}</p>
                    </div>
                  </button>
                ))}
              </div>

              {selectedImages.length > primaryPreviewImages.length && (
                <p className="text-[11px] text-[#64748B]">
                  {lang.startsWith("cs")
                    ? `Zobrazeno ${primaryPreviewImages.length} z ${selectedImages.length} odeslaných řezů.`
                    : `Showing ${primaryPreviewImages.length} of ${selectedImages.length} sent slices.`}
                </p>
              )}
            </div>

            {deepDiveImages.length > 0 && (
              <div className="rounded-xl border border-[#1E293B] p-4 space-y-3 animate-fade-in" style={{ backgroundColor: "#111827" }}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-sm font-semibold text-[#F1F5F9]">
                      {lang.startsWith("cs") ? "Řezy poslané do ověření" : "Slices sent to verification"}
                    </h3>
                    <p className="text-xs text-[#64748B]">
                      {lang.startsWith("cs")
                        ? `${deepDiveImages.length} doplňkových řezů z druhého průchodu. ${t(lang, "clickToEnlarge")}.`
                        : `${deepDiveImages.length} follow-up slices from the second pass. ${t(lang, "clickToEnlarge")}.`}
                    </p>
                  </div>
                  <span className="rounded-full border border-[#0C4A6E] bg-[#082F49] px-2 py-0.5 text-[10px] text-[#38BDF8]">
                    {deepDiveImages.length} {t(lang, "slices")}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {deepDivePreviewImages.map((img, index) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => {
                        setLightboxImage(img);
                        setLightboxFinding(null);
                      }}
                      className="group overflow-hidden rounded-lg border border-[#1E293B] bg-[#0A0E1A] text-left transition-colors hover:border-[#38BDF8]"
                    >
                      <img
                        src={img.preview}
                        alt={getImageName(img)}
                        className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                      <div className="border-t border-[#1E293B] px-2 py-1.5">
                        <p className="text-[10px] text-[#F1F5F9] font-medium truncate">
                          {lang.startsWith("cs") ? `Ověření ${index + 1}` : `Verify ${index + 1}`}
                        </p>
                        <p className="text-[10px] text-[#64748B] truncate">{getImageName(img)}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {deepDiveImages.length > deepDivePreviewImages.length && (
                  <p className="text-[11px] text-[#64748B]">
                    {lang.startsWith("cs")
                      ? `Zobrazeno ${deepDivePreviewImages.length} z ${deepDiveImages.length} ověřovacích řezů.`
                      : `Showing ${deepDivePreviewImages.length} of ${deepDiveImages.length} verification slices.`}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage.preview}
          alt={getImageName(lightboxImage)}
          caption={getImageName(lightboxImage)}
          onClose={() => {
            setLightboxImage(null);
            setLightboxFinding(null);
          }}
          markerX={lightboxFinding?.marker_x}
          markerY={lightboxFinding?.marker_y}
          markerStatus={lightboxFinding?.status}
        />
      )}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
