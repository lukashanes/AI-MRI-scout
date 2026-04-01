/**
 * Automatically selects representative MRI slices from uploaded images.
 *
 * MRI scans slice side-to-side. Outer slices show skin/surface — not useful.
 * The interesting anatomy (ligaments, cartilage, internal structures) is in
 * the central portion of each series.
 *
 * Strategy:
 * 1. Group images by series (prefix before _IXXXX pattern)
 * 2. Sort each series by slice number
 * 3. Trim outer 20% on each side — keep central 60%
 * 4. Pick evenly spaced slices from the central range
 * 5. Distribute budget across series proportionally
 */

interface ImageFile {
  id: string;
  name: string;
}

interface SelectionResult {
  selectedIds: string[];
  summary: string;
  series: {
    name: string;
    total: number;
    centralRange: string;
    picked: number;
  }[];
}

function parseSeriesAndSlice(name: string): {
  series: string;
  slice: number;
} {
  // Limit filename length to prevent ReDoS
  const safeName = name.slice(0, 200);
  const base = safeName.replace(/\.[^.]+$/, "");

  // Common MRI naming: 201__S000_I0023, 301_S001_I0015
  const match = base.match(/^(.{1,100})_I(\d{1,6})$/);
  if (match) {
    return { series: match[1], slice: parseInt(match[2], 10) };
  }

  // Fallback: trailing number
  const numMatch = base.match(/^(.{1,100})(\d{1,6})$/);
  if (numMatch) {
    return { series: numMatch[1], slice: parseInt(numMatch[2], 10) };
  }

  return { series: "default", slice: 0 };
}

/**
 * Trim outer slices and return the central portion of a sorted series.
 * For a series of 47 slices, trimming 20% each side gives slices 10-37.
 */
function getCentralRange<T>(
  arr: T[],
  trimPercent: number = 0.08
): { central: T[]; startIdx: number; endIdx: number } {
  if (arr.length <= 5) {
    // Too few slices to trim meaningfully
    return { central: [...arr], startIdx: 0, endIdx: arr.length - 1 };
  }
  const trimCount = Math.floor(arr.length * trimPercent);
  const startIdx = trimCount;
  const endIdx = arr.length - 1 - trimCount;
  return {
    central: arr.slice(startIdx, endIdx + 1),
    startIdx,
    endIdx,
  };
}

function pickEvenly<T>(arr: T[], count: number): T[] {
  if (arr.length <= count) return [...arr];
  const result: T[] = [];
  const step = (arr.length - 1) / (count - 1);
  for (let i = 0; i < count; i++) {
    result.push(arr[Math.round(i * step)]);
  }
  return result;
}

export function selectRepresentativeImages(
  images: ImageFile[],
  maxTotal: number = 50
): SelectionResult {
  // Group by series
  const seriesMap = new Map<string, { id: string; slice: number }[]>();

  for (const img of images) {
    const { series, slice } = parseSeriesAndSlice(img.name);
    if (!seriesMap.has(series)) seriesMap.set(series, []);
    seriesMap.get(series)!.push({ id: img.id, slice });
  }

  // Sort each series by slice number
  for (const entries of seriesMap.values()) {
    entries.sort((a, b) => a.slice - b.slice);
  }

  const seriesNames = [...seriesMap.keys()].sort();
  const totalSeries = seriesNames.length;
  const totalImages = images.length;
  const selectedIds: string[] = [];
  const seriesInfo: SelectionResult["series"] = [];

  // Calculate allocations proportionally
  const allocations = new Map<string, number>();
  for (const name of seriesNames) {
    const count = seriesMap.get(name)!.length;
    const proportion = count / totalImages;
    allocations.set(name, Math.max(5, Math.round(proportion * maxTotal)));
  }

  // Normalize if over budget
  const totalAlloc = [...allocations.values()].reduce((a, b) => a + b, 0);
  if (totalAlloc > maxTotal) {
    const scale = maxTotal / totalAlloc;
    for (const [name, alloc] of allocations) {
      allocations.set(name, Math.max(1, Math.round(alloc * scale)));
    }
  }

  let remaining = maxTotal;

  for (const name of seriesNames) {
    const entries = seriesMap.get(name)!;
    const { central, startIdx, endIdx } = getCentralRange(entries);
    const budget = Math.min(allocations.get(name) || 2, remaining);
    const picked = pickEvenly(central, budget);

    for (const p of picked) {
      selectedIds.push(p.id);
      remaining--;
      if (remaining <= 0) break;
    }

    const displayName = name.length > 30 ? "..." + name.slice(-27) : name;
    seriesInfo.push({
      name: displayName,
      total: entries.length,
      centralRange: `${startIdx}-${endIdx}`,
      picked: picked.length,
    });

    if (remaining <= 0) break;
  }

  const summary =
    `Auto-selected ${selectedIds.length} slices from central region ` +
    `of ${totalSeries} series (${totalImages} total). ` +
    `Outer slices (skin/surface) skipped — focusing on internal structures.`;

  return { selectedIds, summary, series: seriesInfo };
}

/**
 * Get neighboring slices from the same series for deep-dive analysis.
 * Focuses on slices adjacent to the already-selected ones.
 */
export function getNeighboringSlices(
  allImages: ImageFile[],
  selectedIds: string[],
  count: number = 10
): string[] {
  const seriesMap = new Map<string, { id: string; slice: number }[]>();
  for (const img of allImages) {
    const { series, slice } = parseSeriesAndSlice(img.name);
    if (!seriesMap.has(series)) seriesMap.set(series, []);
    seriesMap.get(series)!.push({ id: img.id, slice });
  }
  for (const entries of seriesMap.values()) {
    entries.sort((a, b) => a.slice - b.slice);
  }

  const selectedSet = new Set(selectedIds);
  const neighbors = new Set<string>();

  for (const img of allImages) {
    if (!selectedSet.has(img.id)) continue;
    const { series } = parseSeriesAndSlice(img.name);
    const entries = seriesMap.get(series);
    if (!entries) continue;

    const idx = entries.findIndex((e) => e.id === img.id);
    if (idx === -1) continue;

    // ±5 neighboring slices for thorough deep dive
    for (
      let i = Math.max(0, idx - 5);
      i <= Math.min(entries.length - 1, idx + 5);
      i++
    ) {
      if (!selectedSet.has(entries[i].id)) {
        neighbors.add(entries[i].id);
      }
    }
  }

  return [...neighbors].slice(0, count);
}

/**
 * Get a specific slice range from a series for targeted deep-dive.
 * Used when AI requests specific slices via series_requests.
 */
export function getSliceRange(
  allImages: ImageFile[],
  seriesPrefix: string,
  fromSlice: number,
  toSlice: number,
  maxCount: number = 30
): string[] {
  const matching: { id: string; slice: number }[] = [];

  for (const img of allImages) {
    const { series, slice } = parseSeriesAndSlice(img.name);
    // Match series prefix (exact or partial match)
    if (series === seriesPrefix || series.startsWith(seriesPrefix) || seriesPrefix.startsWith(series)) {
      if (slice >= fromSlice && slice <= toSlice) {
        matching.push({ id: img.id, slice });
      }
    }
  }

  matching.sort((a, b) => a.slice - b.slice);
  return matching.slice(0, maxCount).map((m) => m.id);
}
