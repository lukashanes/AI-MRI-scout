export interface Base64Image {
  data: string;
  mediaType: string;
  name?: string;
  context?: string;
}

export interface AnalysisResult {
  provider: string;
  model: string;
  content: string;
  duration: number;
  timestamp: Date;
}

export interface AnalysisProvider {
  name: string;
  slug: "gemini";
  model: string;
  analyze(images: Base64Image[], lang?: string, customPrompt?: string): Promise<AnalysisResult>;
  analyzeStream(
    images: Base64Image[],
    onChunk: (text: string) => void,
    lang?: string,
    customPrompt?: string
  ): Promise<AnalysisResult>;
}
