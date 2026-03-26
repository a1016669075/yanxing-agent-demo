function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function bboxWidthKm(bbox) {
  const [west, south, east] = bbox;
  const lat = south;
  return Math.abs(east - west) * 111.32 * Math.cos((lat * Math.PI) / 180);
}

function bboxHeightKm(bbox) {
  const [, south, , north] = bbox;
  return Math.abs(north - south) * 111.32;
}

function sourceResolutionFromFeature(feature) {
  const collection = String(feature?.collection || "").toLowerCase();
  if (collection.includes("sentinel-2")) {
    return 10;
  }
  if (collection.includes("landsat")) {
    return 30;
  }
  if (collection.includes("myd04") || collection.includes("modis")) {
    return 1000;
  }
  return 500;
}

export function buildAlignmentPlan({
  scenario,
  bbox,
  stacResult,
  laadsResult,
  targetResolutionMeters = 500,
  method = "bilinear",
}) {
  const sources = [];

  if (stacResult?.features?.length) {
    const feature = stacResult.features[0];
    sources.push({
      id: feature.id,
      kind: "stac",
      collection: feature.collection,
      nativeResolutionMeters: sourceResolutionFromFeature(feature),
    });
  }

  if (laadsResult?.items?.length) {
    sources.push({
      id: laadsResult.items[0].id || laadsResult.items[0].name,
      kind: "laads",
      collection: laadsResult.productId,
      nativeResolutionMeters: 1000,
    });
  }

  if (!sources.length) {
    sources.push({
      id: `${scenario.id}-basemap`,
      kind: "scene",
      collection: scenario.sensor,
      nativeResolutionMeters: 1000,
    });
  }

  const widthKm = bboxWidthKm(bbox);
  const heightKm = bboxHeightKm(bbox);
  const gridWidth = Math.max(1, Math.round((widthKm * 1000) / targetResolutionMeters));
  const gridHeight = Math.max(1, Math.round((heightKm * 1000) / targetResolutionMeters));
  const nativeAverage =
    sources.reduce((sum, source) => sum + source.nativeResolutionMeters, 0) / sources.length;
  const alignmentScore = clamp(
    1 - Math.abs(nativeAverage - targetResolutionMeters) / Math.max(nativeAverage, targetResolutionMeters),
    0.24,
    0.98
  );

  return {
    state: "ready",
    targetResolutionMeters,
    method,
    stackDepth: sources.length,
    gridShape: [gridWidth, gridHeight],
    expectedPixels: gridWidth * gridHeight,
    alignmentScore: round(alignmentScore),
    steps: [
      "统一投影到 EPSG:4326",
      `按 ${targetResolutionMeters}m 重采样`,
      "裁剪到当前 ROI 或场景范围",
      "按时间和来源顺序堆叠",
    ],
    sources,
  };
}
