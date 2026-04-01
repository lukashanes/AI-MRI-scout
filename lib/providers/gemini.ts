import { GoogleGenerativeAI } from "@google/generative-ai";
import { AnalysisProvider, Base64Image, AnalysisResult } from "./types";
import { getSystemPrompt, getDeepDivePrompt } from "./system-prompt";

const MODEL = "gemini-3.1-pro-preview";

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

  async analyze(images: Base64Image[], lang?: string): Promise<AnalysisResult> {
    const model = getModel();
    const start = Date.now();
    const result = await model.generateContent(
      buildRequest(images, getSystemPrompt(lang))
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
