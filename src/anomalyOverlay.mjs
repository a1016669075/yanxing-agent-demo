function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pointStrength(value, fallback = 0.55) {
  return round(clamp(Number(value) || fallback, 0.18, 0.98));
}

function normalizeValidRegion(validRegion = null) {
  const width = Math.max(0, Number(validRegion?.width) || 0);
  const height = Math.max(0, Number(validRegion?.height) || 0);
  const expectedPixels = width * height;
  const validMask =
    validRegion?.validMask instanceof Uint8Array && validRegion.validMask.length === expectedPixels
      ? validRegion.validMask
      : validRegion?.mask instanceof Uint8Array && validRegion.mask.length === expectedPixels
        ? validRegion.mask
        : null;

  if (!width || !height || !validMask) {
    return null;
  }

  return {
    width,
    height,
    validMask,
  };
}

function pointMaskIndex(point = {}, validRegion = null) {
  if (!validRegion) {
    return -1;
  }

  const x = clamp(Number(point?.x) || 0, 0, 99.999);
  const y = clamp(Number(point?.y) || 0, 0, 99.999);
  const pixelX = clamp(Math.floor((x / 100) * validRegion.width), 0, validRegion.width - 1);
  const pixelY = clamp(Math.floor((y / 100) * validRegion.height), 0, validRegion.height - 1);

  return pixelY * validRegion.width + pixelX;
}

function pointFallsInValidRegion(point = {}, validRegion = null) {
  const maskIndex = pointMaskIndex(point, validRegion);
  return maskIndex >= 0 ? validRegion.validMask[maskIndex] === 1 : true;
}

export function clipOverlayPointsToValidRegion(
  points = [],
  validRegion = null,
  { minPointsPerRoi = 1 } = {}
) {
  const sourcePoints = Array.isArray(points) ? points : [];
  const normalizedRegion = normalizeValidRegion(validRegion);
  const fallbackVisibleRoiIds = [...new Set(sourcePoints.map((point) => point?.roiId).filter(Boolean))];

  if (!normalizedRegion || !sourcePoints.length) {
    return {
      points: sourcePoints.slice(),
      clipApplied: false,
      sourcePointCount: sourcePoints.length,
      retainedPoints: sourcePoints.length,
      hiddenPoints: 0,
      visibleRoiIds: fallbackVisibleRoiIds,
      droppedRoiIds: [],
      visiblePointsAllValid: true,
    };
  }

  const groupedPoints = new Map();
  const passthrough = [];
  let hiddenPoints = 0;

  for (const point of sourcePoints) {
    if (!pointFallsInValidRegion(point, normalizedRegion)) {
      hiddenPoints += 1;
      continue;
    }

    if (!point?.roiId) {
      passthrough.push(point);
      continue;
    }

    const bucket = groupedPoints.get(point.roiId) ?? [];
    bucket.push(point);
    groupedPoints.set(point.roiId, bucket);
  }

  const filteredPoints = passthrough.slice();
  const visibleRoiIds = [];
  const droppedRoiIds = [];
  const sparseThreshold = Math.max(1, Math.round(Number(minPointsPerRoi) || 1));

  for (const [roiId, roiPoints] of groupedPoints.entries()) {
    if (roiPoints.length < sparseThreshold) {
      hiddenPoints += roiPoints.length;
      droppedRoiIds.push(roiId);
      continue;
    }

    visibleRoiIds.push(roiId);
    filteredPoints.push(...roiPoints);
  }

  return {
    points: filteredPoints,
    clipApplied: true,
    sourcePointCount: sourcePoints.length,
    retainedPoints: filteredPoints.length,
    hiddenPoints,
    visibleRoiIds,
    droppedRoiIds,
    visiblePointsAllValid: filteredPoints.every((point) => pointFallsInValidRegion(point, normalizedRegion)),
  };
}

export function buildOverlayPointsFromComponents(
  components = [],
  width,
  height,
  { maxPointsPerRoi = 160 } = {}
) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);

  return components.flatMap((component, index) => {
    const roiId = `R${index + 1}`;
    const samples = Array.isArray(component?.samples) ? component.samples.slice(0, maxPointsPerRoi) : [];
    const fallbackStrength = pointStrength(component?.meanScore, 0.52);

    return samples.map((sample) => ({
      roiId,
      x: round((((sample.x ?? 0) + 0.5) / safeWidth) * 100),
      y: round((((sample.y ?? 0) + 0.5) / safeHeight) * 100),
      strength: pointStrength(sample?.score, fallbackStrength),
    }));
  });
}

export function buildOverlayPointsFromScoreWindows(
  rois = [],
  scores,
  validMask,
  width,
  height,
  { maxPointsPerRoi = 72, minPointsPerRoi = 3, minScore = 0 } = {}
) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const scoreValues = ArrayBuffer.isView(scores) ? scores : null;
  const maskValues = validMask instanceof Uint8Array ? validMask : null;

  if (!scoreValues || !maskValues || scoreValues.length !== safeWidth * safeHeight || maskValues.length !== safeWidth * safeHeight) {
    return [];
  }

  const maxPoints = clamp(Math.round(Number(maxPointsPerRoi) || 72), 8, 160);
  const minPoints = clamp(Math.round(Number(minPointsPerRoi) || 3), 1, maxPoints);
  const normalizedMinScore = Math.max(0, Number(minScore) || 0);

  return rois.flatMap((roi, index) => {
    const roiId = roi?.id || `R${index + 1}`;
    const box = roi?.box || {};
    const left = clamp(Number(box.left) || 0, 0, 100);
    const top = clamp(Number(box.top) || 0, 0, 100);
    const widthPercent = clamp(Number(box.width) || 0, 4, 100 - left);
    const heightPercent = clamp(Number(box.height) || 0, 4, 100 - top);
    const startX = clamp(Math.floor((left / 100) * safeWidth), 0, safeWidth - 1);
    const endX = clamp(Math.ceil(((left + widthPercent) / 100) * safeWidth), startX + 1, safeWidth);
    const startY = clamp(Math.floor((top / 100) * safeHeight), 0, safeHeight - 1);
    const endY = clamp(Math.ceil(((top + heightPercent) / 100) * safeHeight), startY + 1, safeHeight);

    const preferred = [];
    const fallback = [];

    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const pixelIndex = y * safeWidth + x;
        if (maskValues[pixelIndex] !== 1) {
          continue;
        }
        const score = Number(scoreValues[pixelIndex]) || 0;
        const sample = {
          x,
          y,
          score,
          centerDistance:
            Math.abs((x + 0.5) / safeWidth * 100 - (left + widthPercent / 2)) +
            Math.abs((y + 0.5) / safeHeight * 100 - (top + heightPercent / 2)),
        };
        fallback.push(sample);
        if (score >= normalizedMinScore) {
          preferred.push(sample);
        }
      }
    }

    const candidates = (preferred.length >= minPoints ? preferred : fallback)
      .slice()
      .sort((leftSample, rightSample) => {
        if (rightSample.score !== leftSample.score) {
          return rightSample.score - leftSample.score;
        }
        return leftSample.centerDistance - rightSample.centerDistance;
      })
      .slice(0, maxPoints);

    return candidates.map((sample) => ({
      roiId,
      x: round((((sample.x ?? 0) + 0.5) / safeWidth) * 100),
      y: round((((sample.y ?? 0) + 0.5) / safeHeight) * 100),
      strength: pointStrength(sample.score, roi?.risk),
    }));
  });
}

export function buildOverlayPointsFromRois(rois = [], { validRegion = null, minPointsPerRoi = 3 } = {}) {
  const points = rois.flatMap((roi, index) => {
    const id = roi?.id || `R${index + 1}`;
    const box = roi?.box || {};
    const left = clamp(Number(box.left) || 0, 0, 100);
    const top = clamp(Number(box.top) || 0, 0, 100);
    const width = clamp(Number(box.width) || 0, 4, 80);
    const height = clamp(Number(box.height) || 0, 4, 80);
    const cols = clamp(Math.round(width / 3.2), 4, 12);
    const rows = clamp(Math.round(height / 3.2), 4, 10);
    const risk = pointStrength(roi?.risk, 0.56);

    const points = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x =
          left +
          (((col + 0.5 + (row % 2 === 0 ? 0 : 0.22)) / cols) * width);
        const y = top + (((row + 0.5) / rows) * height);
        const centerBias =
          1 -
          Math.abs((col + 0.5) / cols - 0.5) * 0.35 -
          Math.abs((row + 0.5) / rows - 0.5) * 0.35;

        points.push({
          roiId: id,
          x: round(clamp(x, left, left + width)),
          y: round(clamp(y, top, top + height)),
          strength: pointStrength(risk * centerBias, risk),
        });
      }
    }

    return points;
  });

  return clipOverlayPointsToValidRegion(points, validRegion, {
    minPointsPerRoi,
  }).points;
}
