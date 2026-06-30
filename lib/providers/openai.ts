import OpenAI from "openai";
import { AnalysisProvider, Base64Image, AnalysisResult } from "./types";
import { getSystemPrompt } from "./system-prompt";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

function buildContent(images: Base64Image[], prompt: string) {
  return [
    { type: "text" as const, text: prompt },
    ...images.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mediaType};base64,${img.data}`,
        detail: "low" as const,
      },
    })),
    {
      type: "text" as const,
      text: "Analyze these MRI images according to the provided instructions.",
    },
  ];
}

export const openaiProvider: AnalysisProvider = {
  name: "OpenAI",
  slug: "openai",
  model: MODEL,

  async analyze(images: Base64Image[], lang?: string): Promise<AnalysisResult> {
    const client = getClient();
    const start = Date.now();
    const response = await client.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: buildContent(images, getSystemPrompt(lang, images.length)),
        },
      ],
      temperature: 0.1,
      max_tokens: 12000,
    });

    return {
      provider: "OpenAI",
      model: MODEL,
      content: response.choices[0]?.message?.content || "No response.",
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
    const client = getClient();
    const start = Date.now();
    const response = await client.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: buildContent(images, customPrompt || getSystemPrompt(lang, images.length)),
        },
      ],
      temperature: 0.1,
      max_tokens: 12000,
    });
    const content = response.choices[0]?.message?.content || "No response.";
    onChunk(content);

    return {
      provider: "OpenAI",
      model: MODEL,
      content,
      duration: Date.now() - start,
      timestamp: new Date(),
    };
  },
};
