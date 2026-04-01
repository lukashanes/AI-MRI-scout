import { AnalysisProvider } from "./types";
import { geminiProvider } from "./gemini";

export type ProviderSlug = "gemini";

const providers: Record<ProviderSlug, AnalysisProvider> = {
  gemini: geminiProvider,
};

export function getProvider(slug: ProviderSlug): AnalysisProvider {
  return providers[slug];
}
