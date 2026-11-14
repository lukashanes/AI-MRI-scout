import { describe, it, expect } from "vitest";
import { AnalysisResponseSchema } from "@/lib/schema";

describe("AnalysisResponseSchema", () => {
  it("validates a correct response", () => {
    const input = {
      summary: "Test summary",
      recommendation: "none",
      recommendation_text: "No action needed",
      images: [
        {
          index: 0,
          finding: "Normal appearance",
          status: "normal",
          detail: "No abnormality",
          marker_x: 50,
          marker_y: 50,
        },
      ],
      disclaimer: "Not medical advice",
    };
    const result = AnalysisResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.images[0].marker_x).toBe(50);
    }
  });

  it("clamps marker values to 0-100", () => {
    const input = {
      summary: "Test",
      recommendation: "none",
      recommendation_text: "OK",
      images: [
        {
          index: 0,
          finding: "Finding",
          status: "abnormal",
          detail: "Detail",
          marker_x: 150,
          marker_y: -20,
        },
      ],
      disclaimer: "Disclaimer",
    };
    const result = AnalysisResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.images[0].marker_x).toBe(100);
      expect(result.data.images[0].marker_y).toBe(0);
    }
  });

  it("handles missing optional fields with defaults", () => {
    const input = {
      summary: "Test",
      recommendation: "routine",
      recommendation_text: "Follow up",
      images: [],
      disclaimer: "Disclaimer",
    };
    const result = AnalysisResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.structures_affected).toEqual([]);
      expect(result.data.injury_pattern).toBeNull();
      expect(result.data.needs_more_slices).toBe(false);
      expect(result.data.series_requests).toEqual([]);
    }
  });

  it("falls back on invalid recommendation", () => {
    const input = {
      summary: "Test",
      recommendation: "invalid_value",
      recommendation_text: "Whatever",
      images: [],
      disclaimer: "Disclaimer",
    };
    const result = AnalysisResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendation).toBe("routine"); // catch default
    }
  });

  it("falls back on invalid status", () => {
    const input = {
      summary: "Test",
      recommendation: "none",
      recommendation_text: "OK",
      images: [
        {
          index: 0,
          finding: "Something",
          status: "weird_status",
          detail: "Detail",
        },
      ],
      disclaimer: "Disclaimer",
    };
    const result = AnalysisResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.images[0].status).toBe("normal"); // catch default
    }
  });

  it("handles confidence field", () => {
    const input = {
      summary: "Test",
      recommendation: "advised",
      recommendation_text: "See doctor",
      images: [
        {
          index: 0,
          finding: "ACL tear",
          status: "abnormal",
          detail: "Complete disruption",
          confidence: 92,
        },
      ],
      disclaimer: "Disclaimer",
    };
    const result = AnalysisResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.images[0].confidence).toBe(92);
    }
  });

  it("handles series_requests", () => {
    const input = {
      summary: "Test",
      recommendation: "advised",
      recommendation_text: "More data needed",
      needs_more_slices: true,
      series_requests: [
        { series_prefix: "401_S002", from_slice: 20, to_slice: 35, reason: "Suspected tear" },
      ],
      images: [],
      disclaimer: "Disclaimer",
    };
    const result = AnalysisResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.series_requests?.length).toBe(1);
      expect(result.data.series_requests?.[0].series_prefix).toBe("401_S002");
    }
  });
});
