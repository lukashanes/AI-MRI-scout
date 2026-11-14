import { AnalysisProvider } from "./types";
import { geminiProvider } from "./gemini";

export type ProviderSlug = "gemini";

const providers: Record<ProviderSlug, AnalysisProvider> = {
  gemini: geminiProvider,
};

export function getProvider(slug: ProviderSlug): AnalysisProvider {
  return providers[slug];
}

export function isProviderConfigured(slug: ProviderSlug): boolean {
  return slug === "gemini" && !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

export function getConfiguredProviders(): AnalysisProvider[] {
  return (Object.keys(providers) as ProviderSlug[])
    .filter((slug) => isProviderConfigured(slug))
    .map((slug) => providers[slug]);
}
