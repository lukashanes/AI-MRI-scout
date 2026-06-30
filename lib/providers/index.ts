import { AnalysisProvider } from "./types";
import { geminiProvider } from "./gemini";
import { openaiProvider } from "./openai";

export type ProviderSlug = "gemini" | "openai";

const providers: Record<ProviderSlug, AnalysisProvider> = {
  gemini: geminiProvider,
  openai: openaiProvider,
};

export function getProvider(slug: ProviderSlug): AnalysisProvider {
  return providers[slug];
}
