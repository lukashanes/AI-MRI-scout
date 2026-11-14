import * as dicomParser from "dicom-parser";
import { Decoder as JpegLosslessDecoder } from "jpeg-lossless-decoder-js";

const JPEG_LOSSLESS_TRANSFER_SYNTAXES = new Set([
  "1.2.840.10008.1.2.4.57",
  "1.2.840.10008.1.2.4.70",
]);

const TARGET_LONGEST_SIDE = 1400;
const PANEL_LONGEST_SIDE = 680;
const PANEL_GAP = 12;
const JPEG_QUALITY = 0.78;

export interface DicomConversionResult {
  name: string;
  preview: string;
  base64: string;
  mediaType: "image/jpeg";
  metadata: {
    modality?: string;
    seriesDescription?: string;
    protocolName?: string;
    seriesNumber?: number;
    instanceNumber?: number;
    transferSyntax?: string;
    rows: number;
    cols: number;
  };
}

function slugify(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return ascii.slice(0, 64) || "Series";
}

function parseFirstNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const first = value.split("\\")[0]?.trim();
  if (!first) return undefined;
  const parsed = Number(first);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildDisplayName(dataSet: dicomParser.DataSet, fallbackName: string): string {
  const seriesNumber = dataSet.intString("x00200011");
  const instanceNumber = dataSet.intString("x00200013");
  const label = slugify(
    dataSet.string("x0008103e") ||
      dataSet.string("x00181030") ||
      dataSet.string("x00180024") ||
      "Series"
  );

  if (seriesNumber == null && instanceNumber == null) {
    return fallbackName;
  }

  const seriesPart = String(seriesNumber ?? 0).padStart(3, "0");
  const instancePart = String(instanceNumber ?? 0).padStart(4, "0");
  return `${seriesPart}_${label}_I${instancePart}.jpg`;
}

function getPixelDataElement(dataSet: dicomParser.DataSet): dicomParser.Element {
  const pixelData = dataSet.elements.x7fe00010;
  if (!pixelData) {
    throw new Error("Missing Pixel Data element.");
  }
  return pixelData;
}

function extractPixelBuffer(
  dataSet: dicomParser.DataSet,
  transferSyntax: string | undefined
): ArrayBuffer {
  const pixelData = getPixelDataElement(dataSet);

  if (transferSyntax && JPEG_LOSSLESS_TRANSFER_SYNTAXES.has(transferSyntax)) {
    const frame = dicomParser.readEncapsulatedPixelDataFromFragments(
      dataSet,
      pixelData,
      0,
      undefined,
      pixelData.fragments
    );
    const decoder = new JpegLosslessDecoder();
    const frameBytes = Uint8Array.from(frame);
    return decoder.decompress(frameBytes.buffer);
  }

  if (pixelData.encapsulatedPixelData) {
    throw new Error(`Unsupported compressed transfer syntax: ${transferSyntax || "unknown"}`);
  }

  const byteArray = dataSet.byteArray;
  const start = pixelData.dataOffset;
  const end = start + pixelData.length;
  return Uint8Array.from(byteArray.subarray(start, end)).buffer;
}

function getStoredPixelValues(
  buffer: ArrayBuffer,
  bitsAllocated: number,
  pixelRepresentation: number
): Uint8Array | Uint16Array | Int16Array {
  if (bitsAllocated <= 8) {
    return new Uint8Array(buffer);
  }

  if (pixelRepresentation === 1) {
    return new Int16Array(buffer);
  }

  return new Uint16Array(buffer);
}

function getPercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.round((sortedValues.length - 1) * percentile))
  );
  return sortedValues[index];
}

function sampleScaledValues(
  values: Uint8Array | Uint16Array | Int16Array,
  rescaleSlope: number,
  rescaleIntercept: number
): number[] {
  const stride = Math.max(1, Math.floor(values.length / 60000));
  const samples: number[] = [];

  for (let i = 0; i < values.length; i += stride) {
    samples.push(values[i] * rescaleSlope + rescaleIntercept);
  }

  samples.sort((a, b) => a - b);
  return samples;
}

function deriveForegroundBounds(
  values: Uint8Array | Uint16Array | Int16Array,
  rows: number,
  cols: number,
  threshold: number,
  rescaleSlope: number,
  rescaleIntercept: number
): { left: number; top: number; width: number; height: number } {
  let minX = cols;
  let maxX = -1;
  let minY = rows;
  let maxY = -1;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const scaled = values[y * cols + x] * rescaleSlope + rescaleIntercept;
      if (scaled <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return { left: 0, top: 0, width: cols, height: rows };
  }

  const marginX = Math.max(8, Math.round((maxX - minX + 1) * 0.08));
  const marginY = Math.max(8, Math.round((maxY - minY + 1) * 0.08));
  const left = Math.max(0, minX - marginX);
  const top = Math.max(0, minY - marginY);
  const right = Math.min(cols - 1, maxX + marginX);
  const bottom = Math.min(rows - 1, maxY + marginY);

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

function deriveWindowing(
  values: Uint8Array | Uint16Array | Int16Array,
  rows: number,
  cols: number,
  rescaleSlope: number,
  rescaleIntercept: number,
  windowCenter: number | undefined,
  windowWidth: number | undefined
): {
  lower: number;
  upper: number;
  crop: { left: number; top: number; width: number; height: number };
} {
  const sampled = sampleScaledValues(values, rescaleSlope, rescaleIntercept);
  const lowAll = getPercentile(sampled, 0.01);
  const highAll = getPercentile(sampled, 0.995);
  const dynamicRange = Math.max(highAll - lowAll, 1);
  const foregroundThreshold = lowAll + dynamicRange * 0.14;
  const crop = deriveForegroundBounds(
    values,
    rows,
    cols,
    foregroundThreshold,
    rescaleSlope,
    rescaleIntercept
  );

  const roiSamples: number[] = [];
  const rowStride = Math.max(1, Math.floor(crop.height / 220));
  const colStride = Math.max(1, Math.floor(crop.width / 220));

  for (let y = crop.top; y < crop.top + crop.height; y += rowStride) {
    for (let x = crop.left; x < crop.left + crop.width; x += colStride) {
      roiSamples.push(values[y * cols + x] * rescaleSlope + rescaleIntercept);
    }
  }

  roiSamples.sort((a, b) => a - b);

  const roiLow = roiSamples.length > 0 ? getPercentile(roiSamples, 0.02) : lowAll;
  const roiHigh = roiSamples.length > 0 ? getPercentile(roiSamples, 0.992) : highAll;
  const robustLower = roiLow;
  const robustUpper = Math.max(roiHigh, robustLower + 1);

  if (windowCenter != null && windowWidth != null && windowWidth > 1) {
    const dicomLower = windowCenter - windowWidth / 2;
    const dicomUpper = windowCenter + windowWidth / 2;
    const dicomRange = dicomUpper - dicomLower;
    if (dicomRange > 0 && dicomRange < dynamicRange * 4) {
      return { lower: dicomLower, upper: dicomUpper, crop };
    }
  }

  return { lower: robustLower, upper: robustUpper, crop };
}

function mapToGrayscale(
  raw: number,
  lower: number,
  upper: number,
  invert: boolean
): number {
  const normalized =
    raw <= lower ? 0 : raw >= upper ? 255 : Math.round(((raw - lower) / (upper - lower)) * 255);
  const gammaAdjusted = Math.round(Math.pow(normalized / 255, 0.9) * 255);
  return invert ? 255 - gammaAdjusted : gammaAdjusted;
}

function renderPanel(
  imageData: ImageData,
  values: Uint8Array | Uint16Array | Int16Array,
  cols: number,
  srcRect: { left: number; top: number; width: number; height: number },
  panelOffsetX: number,
  targetRows: number,
  targetCols: number,
  lower: number,
  upper: number,
  invert: boolean,
  rescaleSlope: number,
  rescaleIntercept: number
): void {
  for (let y = 0; y < targetRows; y++) {
    const srcY =
      srcRect.top +
      Math.min(
        srcRect.height - 1,
        Math.round((y / Math.max(targetRows - 1, 1)) * (srcRect.height - 1))
      );

    for (let x = 0; x < targetCols; x++) {
      const srcX =
        srcRect.left +
        Math.min(
          srcRect.width - 1,
          Math.round((x / Math.max(targetCols - 1, 1)) * (srcRect.width - 1))
        );
      const raw = values[srcY * cols + srcX] * rescaleSlope + rescaleIntercept;
      const grayscale = mapToGrayscale(raw, lower, upper, invert);
      const offset = (y * imageData.width + (panelOffsetX + x)) * 4;

      imageData.data[offset] = grayscale;
      imageData.data[offset + 1] = grayscale;
      imageData.data[offset + 2] = grayscale;
      imageData.data[offset + 3] = 255;
    }
  }
}

function renderMonochromeToDataUrl(
  values: Uint8Array | Uint16Array | Int16Array,
  rows: number,
  cols: number,
  photometricInterpretation: string | undefined,
  windowCenter: number | undefined,
  windowWidth: number | undefined,
  rescaleSlope: number,
  rescaleIntercept: number
): string {
  const panelScale = Math.min(1, PANEL_LONGEST_SIDE / Math.max(rows, cols));
  const targetRows = Math.max(1, Math.round(rows * panelScale));
  const targetCols = Math.max(1, Math.round(cols * panelScale));
  const { lower, upper, crop } = deriveWindowing(
    values,
    rows,
    cols,
    rescaleSlope,
    rescaleIntercept,
    windowCenter,
    windowWidth
  );
  const invert = photometricInterpretation === "MONOCHROME1";

  const canvas = document.createElement("canvas");
  canvas.width = Math.min(TARGET_LONGEST_SIDE, targetCols * 2 + PANEL_GAP);
  canvas.height = targetRows;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create preview canvas.");
  }

  const imageData = ctx.createImageData(canvas.width, canvas.height);
  renderPanel(
    imageData,
    values,
    cols,
    { left: 0, top: 0, width: cols, height: rows },
    0,
    targetRows,
    targetCols,
    lower,
    upper,
    invert,
    rescaleSlope,
    rescaleIntercept
  );

  renderPanel(
    imageData,
    values,
    cols,
    crop,
    targetCols + PANEL_GAP,
    targetRows,
    targetCols,
    lower,
    upper,
    invert,
    rescaleSlope,
    rescaleIntercept
  );

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export async function convertDicomFile(file: File): Promise<DicomConversionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const byteArray = new Uint8Array(arrayBuffer);
  const dataSet = dicomParser.parseDicom(byteArray);

  const rows = dataSet.uint16("x00280010");
  const cols = dataSet.uint16("x00280011");
  const bitsAllocated = dataSet.uint16("x00280100");
  const pixelRepresentation = dataSet.uint16("x00280103") ?? 0;
  const samplesPerPixel = dataSet.uint16("x00280002") ?? 1;
  const transferSyntax = dataSet.string("x00020010");
  const photometricInterpretation = dataSet.string("x00280004");

  if (!rows || !cols || !bitsAllocated) {
    throw new Error("Missing DICOM image dimensions.");
  }

  if (samplesPerPixel !== 1) {
    throw new Error("Only monochrome DICOM images are supported.");
  }

  const pixelBuffer = extractPixelBuffer(dataSet, transferSyntax);
  const values = getStoredPixelValues(pixelBuffer, bitsAllocated, pixelRepresentation);

  const previewUrl = renderMonochromeToDataUrl(
    values,
    rows,
    cols,
    photometricInterpretation,
    parseFirstNumber(dataSet.string("x00281050")),
    parseFirstNumber(dataSet.string("x00281051")),
    dataSet.floatString("x00281053") ?? 1,
    dataSet.floatString("x00281052") ?? 0
  );

  return {
    name: buildDisplayName(dataSet, file.name),
    preview: previewUrl,
    base64: previewUrl.split(",")[1],
    mediaType: "image/jpeg",
    metadata: {
      modality: dataSet.string("x00080060"),
      seriesDescription: dataSet.string("x0008103e"),
      protocolName: dataSet.string("x00181030"),
      seriesNumber: dataSet.intString("x00200011"),
      instanceNumber: dataSet.intString("x00200013"),
      transferSyntax,
      rows,
      cols,
    },
  };
}
