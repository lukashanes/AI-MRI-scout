"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, AlertOctagon, ShieldCheck, Info } from "lucide-react";

interface ImageFinding {
  index: number;
  body_part?: string;
  sequence?: string;
  finding: string;
  status: "normal" | "note" | "abnormal";
  severity?: string;
  temporal?: string;
  detail: string;
  marker_x?: number;
  marker_y?: number;
}

interface AnalysisData {
  summary: string;
  recommendation: "none" | "routine" | "advised" | "urgent";
  recommendation_text: string;
  injury_pattern?: string | null;
  structures_affected?: string[];
  urgency_reason?: string | null;
  images: ImageFinding[];
  disclaimer: string;
}

interface ReportData {
  analysis: AnalysisData;
  deepDive: AnalysisData | null;
  imageUrls: string[];
  deepDiveImageUrls: string[];
  date: string;
  lang: string;
  duration: number;
}

const REC_LABEL = { none: "No action needed", routine: "Routine follow-up", advised: "Medical consultation advised", urgent: "Urgent medical attention" };
const REC_COLOR = { none: "#10B981", routine: "#3B82F6", advised: "#F59E0B", urgent: "#EF4444" };

export default function ReportPage() {
  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("mri-scout-report");
      if (raw) {
        setData(JSON.parse(raw));
        // Clear sensitive data immediately after reading
        sessionStorage.removeItem("mri-scout-report");
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (data) {
      setTimeout(() => window.print(), 500);
    }
  }, [data]);

  if (!data) return <div style={{ padding: 40, fontFamily: "sans-serif" }}>No report data. Open this page from MRI Scout analysis.</div>;

  const { analysis, deepDive, imageUrls, deepDiveImageUrls, date, duration } = data;
  const abnormal = analysis.images.filter((i) => i.status === "abnormal");
  const notes = analysis.images.filter((i) => i.status === "note");
  const normal = analysis.images.filter((i) => i.status === "normal");

  return (
    <html>
      <head>
        <title>MRI Scout Report — {date}</title>
        <style>{`
          @page { size: A4; margin: 15mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Inter', 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a1a; line-height: 1.5; }
          .page { page-break-after: always; min-height: 100vh; }
          .page:last-child { page-break-after: avoid; }
          h1 { font-size: 22px; font-weight: 700; }
          h2 { font-size: 14px; font-weight: 600; margin: 16px 0 8px; color: #0D9488; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
          h3 { font-size: 12px; font-weight: 600; margin: 8px 0 4px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0D9488; padding-bottom: 12px; margin-bottom: 16px; }
          .rec-banner { padding: 12px 16px; border-radius: 8px; margin: 12px 0; border-left: 4px solid; }
          .finding-row { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
          .finding-img { width: 120px; height: 120px; object-fit: contain; border-radius: 4px; background: #f5f5f5; flex-shrink: 0; }
          .finding-text { flex: 1; }
          .badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
          .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 500; background: #fef2f2; color: #dc2626; margin: 2px; border: 1px solid #fecaca; }
          .disclaimer { margin-top: 20px; padding: 10px; background: #fefce8; border: 1px solid #fde68a; border-radius: 6px; font-size: 10px; color: #854d0e; }
          .meta { color: #888; font-size: 10px; }
          @media screen { body { max-width: 210mm; margin: 0 auto; padding: 20px; background: #f9f9f9; } .page { background: white; padding: 20mm; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 20px; border-radius: 4px; } }
        `}</style>
      </head>
      <body>
        {/* PAGE 1: Summary */}
        <div className="page">
          <div className="header">
            <div>
              <h1>MRI Scout Report</h1>
              <div className="meta">{date} — Analysis duration: {(duration / 1000).toFixed(1)}s</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 10, color: "#888" }}>
              <div>{analysis.images.length} slices analyzed</div>
              {deepDive && <div>+ {deepDive.images.length} deep dive slices</div>}
            </div>
          </div>

          {/* Recommendation */}
          <div className="rec-banner" style={{ borderLeftColor: REC_COLOR[analysis.recommendation], backgroundColor: `${REC_COLOR[analysis.recommendation]}10` }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: REC_COLOR[analysis.recommendation] }}>
              {analysis.recommendation_text}
            </div>
          </div>

          {/* Summary */}
          <h2>Summary</h2>
          <p style={{ fontSize: 12, lineHeight: 1.7 }}>{analysis.summary}</p>

          {/* Injury pattern */}
          {analysis.injury_pattern && (
            <>
              <h2>Injury Pattern</h2>
              <p style={{ color: "#B45309", fontWeight: 500 }}>{analysis.injury_pattern}</p>
            </>
          )}

          {/* Affected structures */}
          {analysis.structures_affected && analysis.structures_affected.length > 0 && (
            <>
              <h2>Affected Structures</h2>
              <div>{analysis.structures_affected.map((s, i) => <span key={i} className="tag">{s}</span>)}</div>
            </>
          )}

          {analysis.urgency_reason && (
            <>
              <h2>Urgency</h2>
              <p style={{ color: "#dc2626" }}>{analysis.urgency_reason}</p>
            </>
          )}

          {/* Key findings */}
          <h2>Key Findings ({abnormal.length} abnormal, {notes.length} notes, {normal.length} normal)</h2>
          {abnormal.length > 0 && abnormal.map((f, i) => (
            <div key={i} style={{ padding: "4px 0", borderLeft: "3px solid #EF4444", paddingLeft: 8, marginBottom: 4 }}>
              <span style={{ color: "#EF4444", fontWeight: 600 }}>🔴 {f.body_part}:</span> {f.finding}
              {f.severity && f.severity !== "normal" && <span className="badge" style={{ backgroundColor: "#fef2f2", color: "#dc2626", marginLeft: 6 }}>{f.severity}</span>}
            </div>
          ))}
          {notes.length > 0 && notes.map((f, i) => (
            <div key={i} style={{ padding: "4px 0", borderLeft: "3px solid #F59E0B", paddingLeft: 8, marginBottom: 4 }}>
              <span style={{ color: "#B45309", fontWeight: 600 }}>⚠️ {f.body_part}:</span> {f.finding}
            </div>
          ))}

          <div className="disclaimer">⚕️ {analysis.disclaimer}</div>
        </div>

        {/* PAGE 2+: Individual findings with images */}
        <div className="page">
          <h2>Detailed Findings — All Slices</h2>
          {analysis.images
            .map((img, i) => ({ finding: img, i }))
            .sort((a, b) => {
              const p: Record<string, number> = { abnormal: 0, note: 1, normal: 2 };
              return (p[a.finding.status] ?? 2) - (p[b.finding.status] ?? 2);
            })
            .map(({ finding: f, i }) => (
              <div key={i} className="finding-row">
                {imageUrls[i] && <img src={imageUrls[i]} className="finding-img" alt="" />}
                <div className="finding-text">
                  <h3>
                    {f.status === "abnormal" ? "🔴" : f.status === "note" ? "⚠️" : "✅"}{" "}
                    {f.body_part || `Slice ${i + 1}`}
                    {f.sequence && <span style={{ color: "#888", fontWeight: 400, marginLeft: 6, fontSize: 10 }}>{f.sequence}</span>}
                    {f.severity && f.severity !== "normal" && <span className="badge" style={{ backgroundColor: "#f0f0f0", marginLeft: 6 }}>{f.severity}</span>}
                    {f.temporal && <span className="badge" style={{ backgroundColor: "#f0f0f0", marginLeft: 4 }}>{f.temporal}</span>}
                  </h3>
                  <p style={{ marginTop: 2 }}>{f.finding}</p>
                  <p style={{ marginTop: 4, fontSize: 10, color: "#666" }}>{f.detail}</p>
                </div>
              </div>
            ))}
        </div>

        {/* Deep dive results */}
        {deepDive && (
          <div className="page">
            <h2>Deep Dive Analysis</h2>
            <div className="rec-banner" style={{ borderLeftColor: REC_COLOR[deepDive.recommendation], backgroundColor: `${REC_COLOR[deepDive.recommendation]}10` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: REC_COLOR[deepDive.recommendation] }}>
                {deepDive.recommendation_text}
              </div>
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 12 }}>{deepDive.summary}</p>

            {deepDive.injury_pattern && (
              <p style={{ color: "#B45309", fontWeight: 500, marginBottom: 8 }}>{deepDive.injury_pattern}</p>
            )}
            {deepDive.structures_affected && deepDive.structures_affected.length > 0 && (
              <div style={{ marginBottom: 8 }}>{deepDive.structures_affected.map((s, i) => <span key={i} className="tag">{s}</span>)}</div>
            )}

            {deepDive.images
              .map((img, i) => ({ finding: img, i }))
              .sort((a, b) => {
                const p: Record<string, number> = { abnormal: 0, note: 1, normal: 2 };
                return (p[a.finding.status] ?? 2) - (p[b.finding.status] ?? 2);
              })
              .map(({ finding: f, i }) => (
                <div key={i} className="finding-row">
                  {deepDiveImageUrls[i] && <img src={deepDiveImageUrls[i]} className="finding-img" alt="" />}
                  <div className="finding-text">
                    <h3>
                      {f.status === "abnormal" ? "🔴" : f.status === "note" ? "⚠️" : "✅"}{" "}
                      {f.body_part || `Deep ${i + 1}`}
                      {f.severity && f.severity !== "normal" && <span className="badge" style={{ backgroundColor: "#f0f0f0", marginLeft: 6 }}>{f.severity}</span>}
                    </h3>
                    <p>{f.finding}</p>
                    <p style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{f.detail}</p>
                  </div>
                </div>
              ))}

            <div className="disclaimer">⚕️ {deepDive.disclaimer}</div>
          </div>
        )}
      </body>
    </html>
  );
}
