import { NextRequest } from "next/server";
import { getConfiguredProviders } from "@/lib/providers";
import { Base64Image, type AnalysisResult } from "@/lib/providers/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { AnalysisResponseSchema, type ValidatedAnalysis } from "@/lib/schema";

export const maxDuration = 300;

const MAX_IMAGES = 50;
const MAX_REVIEW_IMAGES = 16;
const MAX_IMAGE_SIZE_B64 = 10 * 1024 * 1024; // ~10MB base64 per image
const MAX_CUSTOM_PROMPT_LENGTH = 12000;
const REVIEW_TIMEOUT_MS = 45_000;
const ALLOWED_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"];

type StatusKind = "info" | "finding" | "verify" | "success";

function hasReviewableAnomaly(analysis: ValidatedAnalysis): boolean {
  return (
    analysis.recommendation === "advised" ||
    analysis.recommendation === "urgent" ||
    analysis.structures_affected.length > 0 ||
    analysis.images.some((finding) => finding.status !== "normal")
  );
}

function buildGeminiVerificationPrompt(lang: string | undefined, primaryAnalysis: ValidatedAnalysis): string {
  const suspiciousFindings = primaryAnalysis.images
    .filter((finding) => finding.status !== "normal")
    .slice(0, 4)
    .map((finding, index) => {
      const bodyPart = finding.body_part || `image ${finding.index + 1}`;
      const severity = finding.severity ? ` (${finding.severity})` : "";
      return `- ${index + 1}. ${bodyPart}${severity}: ${finding.finding.slice(0, 120)}`;
    });

  const structures = primaryAnalysis.structures_affected.slice(0, 4).join(", ");

  return [
    `Return JSON only in ${lang || "en"}.`,
    "Second-pass MRI verification.",
    "Verify or reject the suspected abnormality conservatively using only these images.",
    "Keep only findings that are clearly reproduced on the subset. Otherwise downgrade or remove them.",
    primaryAnalysis.injury_pattern ? `Pattern: ${primaryAnalysis.injury_pattern.slice(0, 140)}` : "",
    structures ? `Structures: ${structures}` : "",
    suspiciousFindings.length > 0 ? "Claims to verify:" : "",
    ...suspiciousFindings,
  ]
    .filter(Boolean)
    .join("\n");
}

function isCzech(lang?: string): boolean {
  return (lang || "").toLowerCase().startsWith("cs");
}

function formatList(items: string[], limit = 3): string {
  return items.slice(0, limit).join(", ");
}

function buildPrimaryFindingStatus(
  lang: string | undefined,
  analysis: ValidatedAnalysis
): { message: string; detail?: string; kind: StatusKind } {
  const cs = isCzech(lang);
  const abnormalCount = analysis.images.filter((finding) => finding.status === "abnormal").length;
  const noteCount = analysis.images.filter((finding) => finding.status === "note").length;
  const structures = analysis.structures_affected.slice(0, 3);
  const structuresLabel = structures.length > 0 ? formatList(structures) : null;

  if (abnormalCount > 0) {
    return {
      kind: "finding",
      message: cs
        ? structuresLabel
          ? `PĹ™edbÄ›ĹľnÄ› vidĂ­m podezĹ™elĂ© zmÄ›ny v: ${structuresLabel}.`
          : "PĹ™edbÄ›ĹľnÄ› vidĂ­m podezĹ™elĂ© patologickĂ© zmÄ›ny."
        : structuresLabel
          ? `Preliminary finding: suspicious changes in ${structuresLabel}.`
          : "Preliminary finding: suspicious abnormality detected.",
      detail: cs
        ? `AbnormĂˇlnĂ­ch Ĺ™ezĹŻ: ${abnormalCount}. DalĹˇĂ­ krok je ovÄ›Ĺ™enĂ­ na sousednĂ­ch nebo dosud nezkontrolovanĂ˝ch Ĺ™ezech.`
        : `Abnormal slices flagged: ${abnormalCount}. Next step is to verify them on adjacent or previously unseen slices.`,
    };
  }

  if (noteCount > 0) {
    return {
      kind: "verify",
      message: cs
        ? structuresLabel
          ? `Zachytil jsem jemnĂ© zmÄ›ny v: ${structuresLabel}.`
          : "Zachytil jsem jemnĂ© nebo nejasnĂ© zmÄ›ny."
        : structuresLabel
          ? `Subtle changes seen in ${structuresLabel}.`
          : "Subtle or uncertain changes were noticed.",
      detail: cs
        ? "NĂˇlez nenĂ­ dost silnĂ˝. ProhledĂˇm dalĹˇĂ­ Ĺ™ezy, aby nÄ›co dĹŻleĹľitĂ©ho nezĹŻstalo mimo prvnĂ­ vĂ˝bÄ›r."
        : "The signal is not strong enough yet. I will scan more slices so important pathology is not missed outside the first selection.",
    };
  }

  return {
    kind: "info",
    message: cs
      ? "PrvnĂ­ prĹŻchod zatĂ­m neukĂˇzal jasnou patologii."
      : "The first pass did not reveal a clear focal abnormality yet.",
    detail: cs
      ? "RozĹˇĂ­Ĺ™Ă­m hledĂˇnĂ­ i na dalĹˇĂ­ Ĺ™ezy, abych ovÄ›Ĺ™il, Ĺľe problĂ©m neleĹľĂ­ mimo pĹŻvodnĂ­ vĂ˝bÄ›r."
      : "The review will expand to additional slices to confirm the pathology is not hiding outside the original selection.",
  };
}

function buildVerificationStartStatus(
  lang: string | undefined,
  analysis: ValidatedAnalysis,
  reviewImageCount: number
): { message: string; detail?: string; kind: StatusKind } {
  const cs = isCzech(lang);
  const structures = analysis.structures_affected.slice(0, 3);
  const structuresLabel = structures.length > 0 ? formatList(structures) : null;

  return {
    kind: "verify",
    message: cs
      ? structuresLabel
        ? `OvÄ›Ĺ™uji nĂˇlez kolem struktur: ${structuresLabel}.`
        : "OvÄ›Ĺ™uji podezĹ™elĂ© Ĺ™ezy v druhĂ©m prĹŻchodu."
      : structuresLabel
        ? `Verifying the finding around ${structuresLabel}.`
        : "Running a second verification pass over suspicious slices.",
    detail: cs
      ? `Kontroluji ${reviewImageCount} cĂ­lenÄ› vybranĂ˝ch Ĺ™ezĹŻ, vÄŤetnÄ› sousednĂ­ch snĂ­mkĹŻ.`
      : `Checking ${reviewImageCount} targeted slices, including adjacent images.`,
  };
}

function buildVerificationOutcomeStatus(
  lang: string | undefined,
  peerReview: NonNullable<ValidatedAnalysis["peer_review"]>
): { message: string; detail?: string; kind: StatusKind } {
  const cs = isCzech(lang);

  if (peerReview.mode === "single_provider") {
    return {
      kind: "verify",
      message: cs
        ? "DruhĂ˝ prĹŻchod stejnĂ˝ nĂˇlez jasnÄ› nepotvrdil."
        : "The second pass did not clearly reproduce the same finding.",
      detail: peerReview.consensus_summary,
    };
  }

  if (peerReview.agreement_level === "high") {
    return {
      kind: "success",
      message: cs
        ? "OvÄ›Ĺ™ovacĂ­ prĹŻchod hlavnĂ­ nĂˇlez potvrdil."
        : "The verification pass confirmed the main abnormality.",
      detail: peerReview.consensus_summary,
    };
  }

  return {
    kind: "verify",
    message: cs
      ? "OvÄ›Ĺ™ovacĂ­ prĹŻchod naĹˇel jen ÄŤĂˇsteÄŤnou shodu."
      : "The verification pass found only partial support.",
    detail: peerReview.consensus_summary,
  };
}

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function normalizeJsonText(content: string): string {
  const trimmed = content.trim();
  return trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    : trimmed;
}

function parseAnalysis(content: string): ValidatedAnalysis {
  const raw = JSON.parse(normalizeJsonText(content));
  return AnalysisResponseSchema.parse(raw);
}

function injectPeerReview(
  analysis: ValidatedAnalysis,
  peerReview: ValidatedAnalysis["peer_review"]
): ValidatedAnalysis {
  return {
    ...analysis,
    peer_review: peerReview,
  };
}

function singleProviderPeerReview(primaryProvider: string): NonNullable<ValidatedAnalysis["peer_review"]> {
  return {
    mode: "single_provider",
    primary_provider: primaryProvider,
    reviewer_provider: null,
    consensus_summary: `${primaryProvider} produced the final report without a second model cross-check.`,
    agreement_level: "medium",
    agreements: [],
    disagreements: [],
  };
}

function sanitizeError(raw: string): string {
  if (raw.includes("API key")) return "API key issue. Check your configuration.";
  if (raw.includes("quota") || raw.includes("rate")) return "Rate limit reached. Please wait and try again.";
  if (raw.includes("timeout")) return "Analysis timed out. Try fewer images.";
  if (raw.includes("not found") || raw.includes("404")) return "Model not available. Check configuration.";
  return "Analysis failed. Please try again.";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
    }),
  ]);
}

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildCrossCheckPeerReview(
  primaryProvider: string,
  reviewerProvider: string,
  primaryAnalysis: ValidatedAnalysis,
  reviewerAnalysis: ValidatedAnalysis
): NonNullable<ValidatedAnalysis["peer_review"]> {
  const sameProviderReview = normalizeComparable(primaryProvider) === normalizeComparable(reviewerProvider);
  const primaryStructures = new Map(
    primaryAnalysis.structures_affected.map((item) => [normalizeComparable(item), item])
  );
  const reviewerStructures = new Map(
    reviewerAnalysis.structures_affected.map((item) => [normalizeComparable(item), item])
  );

  const agreements = [...primaryStructures.entries()]
    .filter(([key]) => reviewerStructures.has(key))
    .map(([, value]) => value);

  const disagreements = [
    ...[...primaryStructures.entries()]
      .filter(([key]) => !reviewerStructures.has(key))
      .slice(0, 2)
      .map(([, value]) => `${primaryProvider} only: ${value}`),
    ...[...reviewerStructures.entries()]
      .filter(([key]) => !primaryStructures.has(key))
      .slice(0, 2)
      .map(([, value]) => `${reviewerProvider} only: ${value}`),
  ];

  if (primaryAnalysis.recommendation === reviewerAnalysis.recommendation) {
    agreements.unshift(`Both models recommended ${primaryAnalysis.recommendation} follow-up.`);
  } else {
    disagreements.unshift(
      `Urgency differs: ${primaryProvider}=${primaryAnalysis.recommendation}, ${reviewerProvider}=${reviewerAnalysis.recommendation}`
    );
  }

  let agreementLevel: "high" | "medium" | "low" = "low";
  if (agreements.length >= 3 && disagreements.length <= 1) agreementLevel = "high";
  else if (agreements.length >= 1) agreementLevel = "medium";

  if (agreements.length === 0) {
    return {
      mode: "single_provider",
      primary_provider: primaryProvider,
      reviewer_provider: null,
      consensus_summary: sameProviderReview
        ? `${reviewerProvider} did not confirm the suspected abnormality, so the app keeps only the primary ${primaryProvider} report.`
        : `${reviewerProvider} did not confirm the primary finding, so the app keeps only the primary ${primaryProvider} report.`,
      agreement_level: "low",
      agreements: [],
      disagreements: [],
    };
  }

  const consensusSummary = sameProviderReview
    ? agreementLevel === "high"
      ? `${primaryProvider} confirmed the suspected abnormality in a second verification pass.`
      : agreementLevel === "medium"
        ? `${primaryProvider} partially confirmed the suspected abnormality in a second verification pass.`
        : `${primaryProvider} did not reproduce the same finding in the verification pass, so the anomaly remains uncertain.`
    : agreementLevel === "high"
      ? `${primaryProvider} and ${reviewerProvider} mostly agreed on the key findings.`
      : agreementLevel === "medium"
        ? `${primaryProvider} and ${reviewerProvider} agreed on part of the study but differed on some structures.`
        : `${primaryProvider} and ${reviewerProvider} produced materially different interpretations; the final report keeps the primary model wording and exposes the disagreement.`;

  return {
    mode: "cross_check",
    primary_provider: primaryProvider,
    reviewer_provider: reviewerProvider,
    consensus_summary: consensusSummary,
    agreement_level: agreementLevel,
    agreements: agreements.slice(0, 4),
    disagreements: disagreements.slice(0, 4),
  };
}

function getSeriesKey(name?: string): string {
  if (!name) return "unknown";
  const base = name.slice(0, 200).replace(/\.[^.]+$/, "");
  const match = base.match(/^(.{1,100})_I\d{1,6}$/);
  return match?.[1] || base;
}

function buildReviewerSelection(
  images: Base64Image[],
  analysis: ValidatedAnalysis
): { indexes: number[]; images: Base64Image[] } {
  const chosen = new Set<number>();

  const rankedFindings = analysis.images
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => {
      const severityRank = (value?: string) => {
        switch (value) {
          case "complete_rupture":
            return 5;
          case "severe":
            return 4;
          case "moderate":
            return 3;
          case "mild":
            return 2;
          default:
            return 1;
        }
      };

      const statusRank = (value: string) => {
        if (value === "abnormal") return 2;
        if (value === "note") return 1;
        return 0;
      };

      return (
        statusRank(b.finding.status) - statusRank(a.finding.status) ||
        severityRank(b.finding.severity) - severityRank(a.finding.severity) ||
        (b.finding.confidence ?? 0) - (a.finding.confidence ?? 0)
      );
    });

  for (const { finding, index } of rankedFindings) {
    if (finding.status === "normal") continue;
    chosen.add(index);
    if (chosen.size >= Math.ceil(MAX_REVIEW_IMAGES / 2)) break;
  }

  for (const index of [...chosen]) {
    const current = images[index];
    if (!current) continue;
    const currentSeries = getSeriesKey(current.name);

    for (const neighbor of [index - 1, index + 1]) {
      if (chosen.size >= MAX_REVIEW_IMAGES) break;
      const image = images[neighbor];
      if (!image) continue;
      if (getSeriesKey(image.name) === currentSeries) chosen.add(neighbor);
    }
  }

  const seenSeries = new Set<string>();
  images.forEach((image, index) => {
    if (chosen.size >= MAX_REVIEW_IMAGES) return;
    const series = getSeriesKey(image.name);
    if (seenSeries.has(series)) return;
    seenSeries.add(series);
    chosen.add(index);
  });

  if (chosen.size < Math.min(8, images.length)) {
    const step = Math.max(1, Math.floor(images.length / Math.min(8, images.length)));
    for (let index = 0; index < images.length && chosen.size < Math.min(8, images.length); index += step) {
      chosen.add(index);
    }
  }

  const indexes = [...chosen].sort((a, b) => a - b).slice(0, MAX_REVIEW_IMAGES);
  return {
    indexes,
    images: indexes.map((index) => images[index]),
  };
}

function remapReviewerIndexes(
  analysis: ValidatedAnalysis,
  reviewerIndexes: number[]
): ValidatedAnalysis {
  return {
    ...analysis,
    images: analysis.images.map((finding, localIndex) => ({
      ...finding,
      index: reviewerIndexes[localIndex] ?? finding.index,
    })),
  };
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed, retryAfterMs } = checkRateLimit(ip, { maxRequests: 5, windowMs: 60_000 });
    if (!allowed) {
      return Response.json(
        { error: `Rate limit exceeded. Try again in ${Math.ceil(retryAfterMs / 1000)}s.` },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const body = await request.json();
    const { images, lang, customPrompt } = body as {
      images: Base64Image[];
      lang?: string;
      customPrompt?: string;
    };

    if (!images || !Array.isArray(images) || images.length === 0) {
      return Response.json({ error: "No images provided." }, { status: 400 });
    }

    if (images.length > MAX_IMAGES) {
      return Response.json({ error: `Maximum ${MAX_IMAGES} images per request.` }, { status: 400 });
    }

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img || typeof img.data !== "string" || typeof img.mediaType !== "string") {
        return Response.json({ error: `Invalid image at index ${i}.` }, { status: 400 });
      }
      if (img.name != null && (typeof img.name !== "string" || img.name.length > 200)) {
        return Response.json({ error: `Invalid image name at index ${i}.` }, { status: 400 });
      }
      if (img.context != null && (typeof img.context !== "string" || img.context.length > 400)) {
        return Response.json({ error: `Invalid image context at index ${i}.` }, { status: 400 });
      }
      if (!ALLOWED_MEDIA_TYPES.includes(img.mediaType)) {
        return Response.json({ error: `Unsupported media type: ${img.mediaType}` }, { status: 400 });
      }
      if (img.data.length > MAX_IMAGE_SIZE_B64) {
        return Response.json({ error: `Image ${i} exceeds size limit.` }, { status: 400 });
      }
    }

    const safeLang = typeof lang === "string" && lang.length <= 5 ? lang : "en";

    let safePrompt: string | undefined;
    if (typeof customPrompt === "string" && customPrompt.length > 0) {
      if (customPrompt.length > MAX_CUSTOM_PROMPT_LENGTH) {
        return Response.json({ error: "Custom prompt too long." }, { status: 400 });
      }
      safePrompt = customPrompt;
    }

    const configuredProviders = getConfiguredProviders();
    if (configuredProviders.length === 0) {
      return Response.json({ error: "No provider API key is configured." }, { status: 400 });
    }

    const primaryProvider = configuredProviders[0];
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        function send(event: string, data: unknown) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }

        try {
          send("status", {
            stage: "processing",
            imageCount: images.length,
            provider: primaryProvider.name,
            reviewer: null,
            kind: "info",
            focusAreas: isCzech(safeLang)
              ? ["tĹ™Ă­dÄ›nĂ­ sĂ©riĂ­", "vĂ˝bÄ›r Ĺ™ezĹŻ", "pokrytĂ­ studie"]
              : ["series sorting", "slice selection", "study coverage"],
            message: isCzech(safeLang)
              ? `PĹ™ipravuji ${images.length} vybranĂ˝ch Ĺ™ezĹŻ a Ĺ™adĂ­m je podle sĂ©riĂ­.`
              : `Preparing ${images.length} selected slices and grouping them by series.`,
            detail: isCzech(safeLang)
              ? "Nejprve probÄ›hne hlavnĂ­ prĹŻchod nad reprezentativnĂ­ sadou Ĺ™ezĹŻ."
              : "The first step is a primary pass over the representative slice set.",
          });
          send("status", {
            stage: "primary_pass",
            imageCount: images.length,
            provider: primaryProvider.name,
            kind: "info",
            focusAreas: isCzech(safeLang)
              ? ["prvnĂ­ prĹŻchod", "reprezentativnĂ­ Ĺ™ezy", "porovnĂˇnĂ­ sĂ©riĂ­"]
              : ["first pass", "representative slices", "series comparison"],
            message: isCzech(safeLang)
              ? `${primaryProvider.name} prĂˇvÄ› prochĂˇzĂ­ hlavnĂ­ Ĺ™ezy studie.`
              : `${primaryProvider.name} is reviewing the core slices of the study.`,
            detail: isCzech(safeLang)
              ? "Porovnávám reprezentativní řezy napříč sériemi a skládám první odhad nálezu."
              : "Comparing representative slices across series to build the first impression of the study.",
          });

          const primaryResult = await primaryProvider.analyzeStream(
            images,
            (chunk) => send("chunk", { text: chunk }),
            safeLang,
            safePrompt
          );
          let totalDuration = primaryResult.duration;

          const primaryParsed = parseAnalysis(primaryResult.content);
          const auditTrail: Array<{
            pass: string;
            provider: string;
            imageCount: number;
            status: "completed" | "error";
            durationMs?: number;
            recommendation?: string;
            structures?: string[];
            summary?: string;
            error?: string;
          }> = [
            {
              pass: "primary",
              provider: primaryResult.provider,
              imageCount: images.length,
              status: "completed" as const,
              durationMs: primaryResult.duration,
              recommendation: primaryParsed.recommendation,
              structures: primaryParsed.structures_affected.slice(0, 6),
              summary: primaryParsed.summary,
            },
          ];
          const primaryFindingStatus = buildPrimaryFindingStatus(safeLang, primaryParsed);
          send("status", {
            stage: "primary_findings",
            provider: primaryProvider.name,
            kind: primaryFindingStatus.kind,
            structures: primaryParsed.structures_affected.slice(0, 4),
            focusAreas:
              primaryParsed.images.filter((finding) => finding.status === "abnormal").length > 0
                ? isCzech(safeLang)
                  ? ["pĹ™edbÄ›ĹľnĂ˝ nĂˇlez", "oznaÄŤenĂ© Ĺ™ezy", "nĂˇslednĂ© ovÄ›Ĺ™enĂ­"]
                  : ["preliminary finding", "flagged slices", "follow-up verification"]
                : isCzech(safeLang)
                  ? ["nejistĂ˝ nĂˇlez", "rozĹˇĂ­Ĺ™enĂ© hledĂˇnĂ­", "dalĹˇĂ­ Ĺ™ezy"]
                  : ["uncertain finding", "expanded search", "additional slices"],
            message: primaryFindingStatus.message,
            detail: primaryFindingStatus.detail,
          });

          let finalResult: AnalysisResult = primaryResult;
          let finalAnalysis = injectPeerReview(primaryParsed, singleProviderPeerReview(primaryProvider.name));
          const reviewerProvider =
            !safePrompt && primaryProvider.slug === "gemini" && hasReviewableAnomaly(primaryParsed)
              ? primaryProvider
              : null;

          if (reviewerProvider) {
            const reviewerSelection = buildReviewerSelection(images, primaryParsed);
            const reviewerLabel =
              reviewerProvider.slug === primaryProvider.slug
                ? `${reviewerProvider.name} verification pass`
                : reviewerProvider.name;
            send("status", {
              stage: "peer_review",
              provider: primaryProvider.name,
              reviewer: reviewerLabel,
              reviewImageCount: reviewerSelection.images.length,
              structures: primaryParsed.structures_affected.slice(0, 4),
              focusAreas: isCzech(safeLang)
                ? ["potvrzenĂ­ nĂˇlezu", "sousednĂ­ Ĺ™ezy", "shoda signĂˇlu"]
                : ["finding confirmation", "adjacent slices", "signal consistency"],
              ...buildVerificationStartStatus(safeLang, primaryParsed, reviewerSelection.images.length),
            });

            try {
              const reviewerResult = await withTimeout(
                reviewerProvider.analyze(
                  reviewerSelection.images,
                  safeLang,
                  reviewerProvider.slug === primaryProvider.slug
                    ? buildGeminiVerificationPrompt(safeLang, primaryParsed)
                    : undefined
                ),
                REVIEW_TIMEOUT_MS,
                `${reviewerLabel} peer review`
              );
              totalDuration += reviewerResult.duration;
              const reviewerParsed = remapReviewerIndexes(
                parseAnalysis(reviewerResult.content),
                reviewerSelection.indexes
              );

              finalAnalysis = injectPeerReview(
                primaryParsed,
                buildCrossCheckPeerReview(
                  primaryResult.provider,
                  reviewerProvider.slug === primaryProvider.slug ? reviewerLabel : reviewerResult.provider,
                  primaryParsed,
                  reviewerParsed
                )
              );
              auditTrail.push({
                pass: "internal_verification",
                provider: reviewerProvider.slug === primaryProvider.slug ? reviewerLabel : reviewerResult.provider,
                imageCount: reviewerSelection.images.length,
                status: "completed",
                durationMs: reviewerResult.duration,
                recommendation: reviewerParsed.recommendation,
                structures: reviewerParsed.structures_affected.slice(0, 6),
                summary: reviewerParsed.summary,
              });
              send("status", {
                stage: "peer_review_result",
                provider: primaryProvider.name,
                reviewer: reviewerLabel,
                structures: finalAnalysis.peer_review?.agreements.slice(0, 4) || primaryParsed.structures_affected.slice(0, 4),
                focusAreas: finalAnalysis.peer_review?.agreement_level === "high"
                  ? isCzech(safeLang)
                    ? ["potvrzenĂ˝ nĂˇlez", "silnĂˇ shoda", "finĂˇlnĂ­ zĂˇvÄ›r"]
                    : ["confirmed finding", "strong agreement", "final impression"]
                  : isCzech(safeLang)
                    ? ["ÄŤĂˇsteÄŤnĂˇ shoda", "spornĂ˝ nĂˇlez", "opatrnĂˇ interpretace"]
                    : ["partial agreement", "disputed finding", "cautious interpretation"],
                ...buildVerificationOutcomeStatus(safeLang, finalAnalysis.peer_review!),
              });
            } catch (reviewError) {
              const rawReview = reviewError instanceof Error ? reviewError.message : "";
              console.error("Peer review failed:", rawReview);
              finalAnalysis = injectPeerReview(primaryParsed, {
                mode: "single_provider",
                primary_provider: primaryProvider.name,
                reviewer_provider: reviewerLabel,
                consensus_summary: `${reviewerLabel} failed, so the final report falls back to ${primaryProvider.name}.`,
                agreement_level: "low",
                agreements: [],
                disagreements: ["Peer-review pass failed before consensus could be produced."],
              });
              auditTrail.push({
                pass: "internal_verification",
                provider: reviewerLabel,
                imageCount: reviewerSelection.images.length,
                status: "error",
                error: sanitizeError(rawReview),
              });
              send("status", {
                stage: "peer_review_result",
                provider: primaryProvider.name,
                reviewer: reviewerLabel,
                kind: "verify",
                structures: primaryParsed.structures_affected.slice(0, 4),
                focusAreas: isCzech(safeLang)
                  ? ["selhĂˇnĂ­ ovÄ›Ĺ™enĂ­", "hlavnĂ­ interpretace", "fallback"]
                  : ["verification failure", "primary interpretation", "fallback"],
                message: isCzech(safeLang)
                  ? "OvÄ›Ĺ™ovacĂ­ prĹŻchod selhal, zĹŻstĂˇvĂˇ hlavnĂ­ interpretace."
                  : "The verification pass failed, so the app keeps the primary interpretation.",
                detail: sanitizeError(rawReview),
              });
            }
          }

          const content = JSON.stringify(finalAnalysis);
          send("status", {
            stage: "finalizing",
            provider: primaryProvider.name,
            kind: "success",
            structures: finalAnalysis.structures_affected.slice(0, 4),
            focusAreas: isCzech(safeLang)
              ? ["souhrn nĂˇlezu", "doporuÄŤenĂ­", "vĂ˝slednĂ˝ report"]
              : ["study summary", "recommendation", "final report"],
            message: isCzech(safeLang)
              ? "SklĂˇdĂˇm finĂˇlnĂ­ souhrn nĂˇlezu."
              : "Composing the final study summary.",
            detail: isCzech(safeLang)
              ? "VĂ˝stup bude obsahovat hlavnĂ­ zĂˇvÄ›r, doporuÄŤenĂ­ a pĹ™Ă­padnĂ© ovÄ›Ĺ™enĂ­."
              : "The output will include the main impression, recommendation, and any verification result.",
          });

          send("done", {
            provider: reviewerProvider ? `${primaryProvider.name} + ${reviewerProvider.name}` : primaryResult.provider,
            model: reviewerProvider ? `${primaryProvider.model} + ${reviewerProvider.model}` : finalResult.model,
            content,
            duration: totalDuration,
            auditTrail,
            imageCount: images.length,
            timestamp: finalResult.timestamp.toISOString(),
          });
        } catch (err) {
          const raw = err instanceof Error ? err.message : "";
          console.error("Analysis error:", raw);
          send("error", { error: sanitizeError(raw) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Request error:", error);
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
}
