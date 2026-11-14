import { describe, it, expect } from "vitest";
import { selectRepresentativeImages, getNeighboringSlices, getSliceRange } from "@/lib/image-selector";

function makeImages(series: string, count: number, startSlice = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${series}_I${String(startSlice + i).padStart(4, "0")}`,
    name: `${series}_I${String(startSlice + i).padStart(4, "0")}.jpg`,
  }));
}

describe("selectRepresentativeImages", () => {
  it("selects all images when count <= maxTotal", () => {
    const images = makeImages("401_S001", 10);
    const result = selectRepresentativeImages(images, 50);
    expect(result.selectedIds.length).toBe(10);
  });

  it("respects maxTotal limit", () => {
    const images = makeImages("401_S001", 100);
    const result = selectRepresentativeImages(images, 20);
    expect(result.selectedIds.length).toBeLessThanOrEqual(20);
  });

  it("distributes across multiple series", () => {
    const images = [
      ...makeImages("401_S001", 50),
      ...makeImages("401_S002", 50),
    ];
    const result = selectRepresentativeImages(images, 20);
    // Should have images from both series
    const s1 = result.selectedIds.filter((id) => id.startsWith("401_S001"));
    const s2 = result.selectedIds.filter((id) => id.startsWith("401_S002"));
    expect(s1.length).toBeGreaterThan(0);
    expect(s2.length).toBeGreaterThan(0);
  });

  it("trims outer slices for large series", () => {
    const images = makeImages("401_S001", 100);
    const result = selectRepresentativeImages(images, 20);
    // First and last few slices should be excluded (8% trim)
    const selectedSlices = result.selectedIds.map((id) => {
      const match = id.match(/_I(\d+)/);
      return match ? parseInt(match[1]) : 0;
    });
    // Outer 8% = 8 slices each side, so slices 1-8 and 93-100 should not be in selection
    expect(selectedSlices.every((s) => s >= 8 && s <= 93)).toBe(true);
  });

  it("handles empty array", () => {
    const result = selectRepresentativeImages([], 50);
    expect(result.selectedIds).toEqual([]);
    expect(result.series).toEqual([]);
  });

  it("handles single image", () => {
    const images = [{ id: "test_I0001", name: "test_I0001.jpg" }];
    const result = selectRepresentativeImages(images, 50);
    expect(result.selectedIds).toEqual(["test_I0001"]);
  });

  it("returns series info", () => {
    const images = makeImages("401_S001", 30);
    const result = selectRepresentativeImages(images, 50);
    expect(result.series.length).toBe(1);
    expect(result.series[0].total).toBe(30);
    expect(result.series[0].picked).toBeGreaterThan(0);
  });
});

describe("getNeighboringSlices", () => {
  it("returns neighboring slices not in selection", () => {
    const images = makeImages("401_S001", 20);
    const selected = ["401_S001_I0010"];
    const neighbors = getNeighboringSlices(images, selected, 20);
    expect(neighbors.length).toBeGreaterThan(0);
    expect(neighbors).not.toContain("401_S001_I0010");
  });

  it("respects count limit", () => {
    const images = makeImages("401_S001", 100);
    const selected = ["401_S001_I0050"];
    const neighbors = getNeighboringSlices(images, selected, 5);
    expect(neighbors.length).toBeLessThanOrEqual(5);
  });

  it("returns empty for empty input", () => {
    const neighbors = getNeighboringSlices([], [], 10);
    expect(neighbors).toEqual([]);
  });
});

describe("getSliceRange", () => {
  it("returns slices in range", () => {
    const images = makeImages("401_S002", 50);
    const result = getSliceRange(images, "401_S002", 20, 30);
    expect(result.length).toBe(11); // slices 20-30 inclusive
  });

  it("respects maxCount", () => {
    const images = makeImages("401_S002", 100);
    const result = getSliceRange(images, "401_S002", 1, 100, 10);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it("uses exact series matching with boundary check", () => {
    const images = [
      ...makeImages("401_S001", 10),
      ...makeImages("401_S002", 10),
    ];
    // "401_S001" should NOT match "401_S002"
    const result = getSliceRange(images, "401_S001", 1, 10);
    expect(result.every((id) => id.startsWith("401_S001"))).toBe(true);
    expect(result.length).toBe(10);
  });

  it("returns empty for non-existent series", () => {
    const images = makeImages("401_S001", 20);
    const result = getSliceRange(images, "999_S001", 1, 20);
    expect(result).toEqual([]);
  });
});
