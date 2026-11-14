"use client";

import { useEffect, useState } from "react";

interface ImageFinding {
  index: number;
  body_part?: string;
  sequence?: string;
  finding: string;
  status: "normal" | "note" | "abnormal";
  severity?: string;
  temporal?: string;
  detail: string;
}

interface AnalysisData {
  summary: string;
  recommendation: "none" | "routine" | "advised" | "urgent";
  recommendation_text: string;
  injury_pattern?: string | null;
  structures_affected?: string[];
  urgency_reason?: string | null;
  images: ImageFinding[];
  peer_review?: {
    mode: "single_provider" | "cross_check";
    primary_provider: string;
    reviewer_provider?: string | null;
    consensus_summary: string;
    agreement_level: "high" | "medium" | "low";
    agreements: string[];
    disagreements: string[];
  } | null;
  disclaimer: string;
}

interface ReportData {
  analysis: AnalysisData;
  deepDive: AnalysisData | null;
  auditTrail?: Array<{
    id: string;
    pass: string;
    provider: string;
    imageCount: number;
    status: "completed" | "error";
    durationMs?: number;
    recommendation?: string;
    structures?: string[];
    summary?: string;
    error?: string;
    selectedFiles?: string[];
  }>;
  date: string;
  lang: string;
  duration: number;
}

const REC_COLOR = { none: "#10B981", routine: "#3B82F6", advised: "#F59E0B", urgent: "#EF4444" };

export default function ReportPage() {
  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("mri-scout-report");
      if (raw) {
        setData(JSON.parse(raw));
        sessionStorage.removeItem("mri-scout-report");
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (data) {
      setTimeout(() => window.print(), 500);
    }
  }, [data]);

  if (!data) {
    return <div style={{ padding: 40, fontFamily: "sans-serif" }}>No report data. Open this page from MRI Scout analysis.</div>;
  }

  const { analysis, auditTrail, date, duration } = data;
  const abnormal = analysis.images.filter((i) => i.status === "abnormal").length;
  const notes = analysis.images.filter((i) => i.status === "note").length;
  const normal = analysis.images.filter((i) => i.status === "normal").length;

  return (
    <html>
      <head>
        <title>MRI Scout Report - {date}</title>
        <style>{`
          @page { size: A4; margin: 15mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Inter', 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a1a; line-height: 1.5; }
          .page { min-height: 100vh; }
          h1 { font-size: 22px; font-weight: 700; }
          h2 { font-size: 14px; font-weight: 600; margin: 16px 0 8px; color: #0D9488; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
          h3 { font-size: 12px; font-weight: 600; margin: 0 0 6px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0D9488; padding-bottom: 12px; margin-bottom: 16px; }
          .rec-banner { padding: 12px 16px; border-radius: 8px; margin: 12px 0; border-left: 4px solid; }
          .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 500; background: #fef2f2; color: #dc2626; margin: 2px; border: 1px solid #fecaca; }
          .peer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
          .peer-box { padding: 10px; border-radius: 8px; border: 1px solid; }
          .peer-box ul { margin: 0; padding-left: 16px; }
          .peer-box li { margin-bottom: 4px; }
          .peer-empty { font-size: 10px; }
          .disclaimer { margin-top: 20px; padding: 10px; background: #fefce8; border: 1px solid #fde68a; border-radius: 6px; font-size: 10px; color: #854d0e; }
          .meta { color: #888; font-size: 10px; }
          .counts { display: flex; gap: 12px; flex-wrap: wrap; font-size: 10px; margin-top: 12px; color: #475569; }
          @media screen { body { max-width: 210mm; margin: 0 auto; padding: 20px; background: #f9f9f9; } .page { background: white; padding: 20mm; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 4px; } }
        `}</style>
      </head>
      <body>
        <div className="page">
          <div className="header">
            <div>
              <h1>MRI Scout Report</h1>
              <div className="meta">{date} - Analysis duration: {(duration / 1000).toFixed(1)}s</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 10, color: "#888" }}>
              <div>{analysis.images.length} slices analyzed</div>
            </div>
          </div>

          <div className="rec-banner" style={{ borderLeftColor: REC_COLOR[analysis.recommendation], backgroundColor: `${REC_COLOR[analysis.recommendation]}10` }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: REC_COLOR[analysis.recommendation] }}>
              {analysis.recommendation_text}
            </div>
          </div>

          <h2>Summary</h2>
          <p style={{ fontSize: 12, lineHeight: 1.7 }}>{analysis.summary}</p>

          {analysis.injury_pattern && (
            <>
              <h2>Injury Pattern</h2>
              <p style={{ color: "#B45309", fontWeight: 500 }}>{analysis.injury_pattern}</p>
            </>
          )}

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

          {analysis.peer_review && analysis.peer_review.mode === "cross_check" && (
            <>
              <h2>{analysis.peer_review.mode === "cross_check" ? "Model Consensus" : "Provider Status"}</h2>
              <p style={{ marginBottom: 6 }}>{analysis.peer_review.consensus_summary}</p>
              <p style={{ fontSize: 10, color: "#666" }}>
                Agreement level: {analysis.peer_review.agreement_level}
              </p>
              {analysis.peer_review.mode === "cross_check" && analysis.peer_review.reviewer_provider && (
                <p style={{ fontSize: 10, color: "#666" }}>
                  Compared providers: {analysis.peer_review.primary_provider} vs {analysis.peer_review.reviewer_provider}
                </p>
              )}
              {analysis.peer_review.mode === "cross_check" && (
                <div className="peer-grid">
                  <div className="peer-box" style={{ borderColor: "#A7F3D0", background: "#ECFDF5" }}>
                    <h3 style={{ color: "#047857" }}>Where models agree</h3>
                    {analysis.peer_review.agreements.length > 0 ? (
                      <ul style={{ color: "#065F46", fontSize: 10 }}>
                        {analysis.peer_review.agreements.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="peer-empty" style={{ color: "#047857" }}>
                        No clear shared finding was confirmed by both models.
                      </p>
                    )}
                  </div>
                  <div className="peer-box" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
                    <h3 style={{ color: "#B45309" }}>Where models disagree</h3>
                    {analysis.peer_review.disagreements.length > 0 ? (
                      <ul style={{ color: "#92400E", fontSize: 10 }}>
                        {analysis.peer_review.disagreements.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="peer-empty" style={{ color: "#92400E" }}>
                        No unresolved disagreement was reported in the cross-check.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {auditTrail && auditTrail.length > 0 && (
            <>
              <h2>Analysis Audit Trail</h2>
              <div style={{ display: "grid", gap: 8 }}>
                {auditTrail.map((entry) => (
                  <div key={entry.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <strong>{entry.pass}</strong>
                      <span style={{ fontSize: 10, color: entry.status === "completed" ? "#047857" : "#b91c1c" }}>
                        {entry.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
                      {entry.provider} · {entry.imageCount} slices
                      {entry.durationMs != null ? ` · ${(entry.durationMs / 1000).toFixed(1)}s` : ""}
                    </div>
                    {entry.summary && <p style={{ marginTop: 6 }}>{entry.summary}</p>}
                    {entry.error && <p style={{ marginTop: 6, color: "#b91c1c" }}>{entry.error}</p>}
                    {entry.structures && entry.structures.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {entry.structures.map((structure) => (
                          <span key={structure} className="tag">{structure}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="counts">
            <span>Normal: {normal}</span>
            <span>Note: {notes}</span>
            <span>Abnormal: {abnormal}</span>
          </div>

          <div className="disclaimer">Medical disclaimer: {analysis.disclaimer}</div>
        </div>
      </body>
    </html>
  );
}
