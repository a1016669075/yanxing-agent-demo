const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeAnchor(anchor = {}) {
  return {
    x: clamp(finiteNumber(anchor.x, 0.5), 0, 1),
    y: clamp(finiteNumber(anchor.y, 0.5), 0, 1),
  };
}

export function createGlobalViewportState(viewport = {}) {
  return clampGlobalViewport({
    zoom: viewport.zoom ?? 1,
    centerX: viewport.centerX ?? 0.5,
    centerY: viewport.centerY ?? 0.5,
  });
}

export function clampGlobalViewport(viewport = {}) {
  const zoom = clamp(finiteNumber(viewport.zoom, 1), MIN_ZOOM, MAX_ZOOM);
  const halfSpan = 0.5 / zoom;

  return {
    zoom: round(zoom, 3),
    centerX: round(clamp(finiteNumber(viewport.centerX, 0.5), halfSpan, 1 - halfSpan)),
    centerY: round(clamp(finiteNumber(viewport.centerY, 0.5), halfSpan, 1 - halfSpan)),
  };
}

export function globalViewportBounds(viewport = {}) {
  const normalized = clampGlobalViewport(viewport);
  const halfSpan = 0.5 / normalized.zoom;

  return {
    left: round(normalized.centerX - halfSpan),
    top: round(normalized.centerY - halfSpan),
    width: round(1 / normalized.zoom),
    height: round(1 / normalized.zoom),
  };
}

export function worldPointFromViewportPoint(point = {}, viewport = {}) {
  const normalized = clampGlobalViewport(viewport);
  const anchor = normalizeAnchor(point);

  return {
    x: round(clamp(normalized.centerX + (anchor.x - 0.5) / normalized.zoom, 0, 1), 6),
    y: round(clamp(normalized.centerY + (anchor.y - 0.5) / normalized.zoom, 0, 1), 6),
  };
}

export function zoomGlobalViewport(viewport = {}, nextZoom, anchor = { x: 0.5, y: 0.5 }) {
  const current = clampGlobalViewport(viewport);
  const targetZoom = clamp(Number(nextZoom) || current.zoom, MIN_ZOOM, MAX_ZOOM);
  if (targetZoom === current.zoom) {
    return current;
  }

  const safeAnchor = normalizeAnchor(anchor);
  const worldPoint = worldPointFromViewportPoint(safeAnchor, current);

  return clampGlobalViewport({
    zoom: targetZoom,
    centerX: worldPoint.x - (safeAnchor.x - 0.5) / targetZoom,
    centerY: worldPoint.y - (safeAnchor.y - 0.5) / targetZoom,
  });
}

export function scaleGlobalViewport(viewport = {}, factor = 1, anchor = { x: 0.5, y: 0.5 }) {
  const current = clampGlobalViewport(viewport);
  return zoomGlobalViewport(current, current.zoom * finiteNumber(factor, 1), anchor);
}

export function panGlobalViewport(viewport = {}, delta = { x: 0, y: 0 }) {
  const current = clampGlobalViewport(viewport);
  return clampGlobalViewport({
    ...current,
    centerX: current.centerX - finiteNumber(delta.x, 0) / current.zoom,
    centerY: current.centerY - finiteNumber(delta.y, 0) / current.zoom,
  });
}

export function globalViewportStyle(viewport = {}) {
  const normalized = clampGlobalViewport(viewport);
  const bounds = globalViewportBounds(normalized);

  return {
    widthPercent: round(normalized.zoom * 100, 3),
    heightPercent: round(normalized.zoom * 100, 3),
    leftPercent: round(-bounds.left * normalized.zoom * 100, 3),
    topPercent: round(-bounds.top * normalized.zoom * 100, 3),
  };
}
