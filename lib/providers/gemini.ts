import { GoogleGenerativeAI } from "@google/generative-ai";
import { AnalysisProvider, Base64Image, AnalysisResult } from "./types";
import { getSystemPrompt, getDeepDivePrompt } from "./system-prompt";

const MODEL = "gemini-3.1-pro-preview";

function parseImageName(name?: string): { series: string | null; slice: number | null } {
  if (!name) return { series: null, slice: null };

  const base = name.slice(0, 200).replace(/\.[^.]+$/, "");
  const match = base.match(/^(.{1,100})_I(\d{1,6})$/);
  if (match) {
    return { series: match[1], slice: parseInt(match[2], 10) };
  }

  return { series: null, slice: null };
}

function buildImageContext(images: Base64Image[]): string {
  const lines = [
    "Study context:",
    `- ${images.length} rasterized MRI image(s) were provided.`,
    "- Filenames and optional context may contain series, plane, protocol, or slice indices. Treat them as routing hints, not proof of diagnosis.",
    "- Do not invent right/left, sequence type, or anatomy unless it is explicitly visible in the pixels or repeatedly supported by the image context.",
    "Image list:",
  ];

  images.forEach((img, index) => {
    const meta = parseImageName(img.name);
    const parts = [`#${index}`];
    if (img.name) parts.push(`file=${img.name}`);
    if (meta.series) parts.push(`series=${meta.series}`);
    if (meta.slice != null) parts.push(`slice=${meta.slice}`);
    if (img.context) parts.push(`context=${img.context.slice(0, 180)}`);
    lines.push(`- ${parts.join(", ")}`);
  });

  return lines.join("\n");
}

function buildRequest(images: Base64Image[], systemPrompt: string) {
  const imageParts = images.map((img) => ({
    inlineData: { mimeType: img.mediaType, data: img.data },
  }));

  return {
    contents: [
      {
        role: "user" as const,
        parts: [
          { text: systemPrompt },
          { text: buildImageContext(images) },
          ...imageParts,
          {
            text: "Analyze these MRI images according to the provided instructions.",
          },
        ],
      },
    ],
  };
}

function getModel() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: MODEL });
}

export const geminiProvider: AnalysisProvider = {
  name: "Gemini",
  slug: "gemini",
  model: MODEL,

  async analyze(
    images: Base64Image[],
    lang?: string,
    customPrompt?: string
  ): Promise<AnalysisResult> {
    const model = getModel();
    const start = Date.now();
    const result = await model.generateContent(
      buildRequest(images, customPrompt || getSystemPrompt(lang, images.length))
    );

    return {
      provider: "Gemini",
      model: MODEL,
      content: result.response.text() || "No response.",
      duration: Date.now() - start,
      timestamp: new Date(),
    };
  },

  async analyzeStream(
    images: Base64Image[],
    onChunk: (text: string) => void,
    lang?: string,
    customPrompt?: string
  ): Promise<AnalysisResult> {
    const model = getModel();
    const start = Date.now();
    let fullContent = "";

    const result = await model.generateContentStream(
      buildRequest(images, customPrompt || getSystemPrompt(lang, images.length))
    );

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        fullContent += text;
        onChunk(text);
      }
    }

    return {
      provider: "Gemini",
      model: MODEL,
      content: fullContent || "No response.",
      duration: Date.now() - start,
      timestamp: new Date(),
    };
  },
};
