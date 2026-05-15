export const GEO_MEMORY_KEY = "sat-atmo-agent-geo-memory";
export const GEO_MEMORY_VERSION = "2026.04.12-tile-time-v1";

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeBBox(rawBbox = null) {
  if (!Array.isArray(rawBbox) || rawBbox.length !== 4) {
    return null;
  }
  const bbox = rawBbox.map((value) => Number(value));
  return bbox.every((value) => Number.isFinite(value)) ? bbox : null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function dateBucket(value, bucketDays = 1) {
  if (!value) {
    return "unknown-time";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown-time";
  }

  const safeBucketDays = Math.max(1, Math.round(Number(bucketDays) || 1));
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const bucketMs = safeBucketDays * 24 * 60 * 60 * 1000;
  const bucketStart = Math.floor(utc / bucketMs) * bucketMs;
  const bucketDate = new Date(bucketStart);
  const month = String(bucketDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(bucketDate.getUTCDate()).padStart(2, "0");
  return `${bucketDate.getUTCFullYear()}-${month}-${day}`;
}

function bboxCenter(bbox = null) {
  if (!bbox) {
    return null;
  }
  return {
    lon: (bbox[0] + bbox[2]) / 2,
    lat: (bbox[1] + bbox[3]) / 2,
  };
}

export function buildTileKey(bbox, resolution = "coarse") {
  const normalized = normalizeBBox(bbox);
  if (!normalized) {
    return `unknown-${resolution}`;
  }

  const center = bboxCenter(normalized);
  const lonStep = resolution === "fine" ? 2 : resolution === "medium" ? 5 : 10;
  const latStep = resolution === "fine" ? 2 : resolution === "medium" ? 5 : 10;
  const tileLon = Math.floor(center.lon / lonStep) * lonStep;
  const tileLat = Math.floor(center.lat / latStep) * latStep;
  return `${resolution}:${round(tileLon, 1)}:${round(tileLat, 1)}`;
}

export function buildGeoMemoryKey({
  task = "unknown",
  bbox = null,
  timeAnchor = null,
  resolution = "coarse",
  bucketDays = 1,
} = {}) {
  return {
    task,
    tileKey: buildTileKey(bbox, resolution),
    timeBucket: dateBucket(timeAnchor, bucketDays),
    resolution,
  };
}

export function createGeoMemory() {
  return {
    version: GEO_MEMORY_VERSION,
    staticEntries: [],
    dynamicEntries: [],
    episodicEntries: [],
  };
}

function normalizeEntry(entry = {}) {
  const bbox = normalizeBBox(entry.bbox);
  const key = entry.key && typeof entry.key === "object"
    ? {
        task: entry.key.task || entry.task || "unknown",
        tileKey: entry.key.tileKey || buildTileKey(bbox, entry.key.resolution || "coarse"),
        timeBucket: entry.key.timeBucket || dateBucket(entry.timeAnchor, 1),
        resolution: entry.key.resolution || "coarse",
      }
    : buildGeoMemoryKey({
        task: entry.task,
        bbox,
        timeAnchor: entry.timeAnchor,
      });

  return {
    id: entry.id || `${key.task}:${key.tileKey}:${key.timeBucket}:${entry.kind || "unknown"}`,
    key,
    task: entry.task || key.task,
    bbox,
    timeAnchor: entry.timeAnchor || null,
    kind: entry.kind || "unknown",
    uncertainty: clamp(Number(entry.uncertainty) || 0.5, 0, 1),
    provenance: entry.provenance ? clone(entry.provenance) : null,
    payload: clone(entry.payload),
    writtenAt: entry.writtenAt || new Date().toISOString(),
  };
}

export function normalizeGeoMemory(memory = {}) {
  const source = memory && typeof memory === "object" ? memory : {};
  return {
    version: source.version || GEO_MEMORY_VERSION,
    staticEntries: Array.isArray(source.staticEntries) ? source.staticEntries.map(normalizeEntry) : [],
    dynamicEntries: Array.isArray(source.dynamicEntries) ? source.dynamicEntries.map(normalizeEntry) : [],
    episodicEntries: Array.isArray(source.episodicEntries) ? source.episodicEntries.map(normalizeEntry) : [],
  };
}

function bucketDistance(leftBucket = "", rightBucket = "") {
  if (!leftBucket || !rightBucket || leftBucket === "unknown-time" || rightBucket === "unknown-time") {
    return Number.POSITIVE_INFINITY;
  }

  const left = new Date(`${leftBucket}T00:00:00Z`).getTime();
  const right = new Date(`${rightBucket}T00:00:00Z`).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(right - left) / (24 * 60 * 60 * 1000);
}

function collectionKey(scope = "dynamic") {
  if (scope === "static") {
    return "staticEntries";
  }
  if (scope === "episodic") {
    return "episodicEntries";
  }
  return "dynamicEntries";
}

export function writeGeoMemory(memoryInput, scope = "dynamic", entry = {}) {
  const memory = normalizeGeoMemory(memoryInput);
  const key = collectionKey(scope);
  const normalizedEntry = normalizeEntry(entry);
  const remaining = memory[key].filter((item) => item.id !== normalizedEntry.id);
  memory[key] = [normalizedEntry, ...remaining];
  return memory;
}

export function readGeoMemory(memoryInput, {
  scope = null,
  task = null,
  bbox = null,
  timeAnchor = null,
  timeWindowDays = 2,
  kinds = null,
} = {}) {
  const memory = normalizeGeoMemory(memoryInput);
  const requestedBbox = normalizeBBox(bbox);
  const requestedTimeBucket = dateBucket(timeAnchor, 1);
  const kindSet = Array.isArray(kinds) ? new Set(kinds) : null;
  const pools = scope ? [memory[collectionKey(scope)]] : [memory.staticEntries, memory.dynamicEntries, memory.episodicEntries];

  return pools
    .flat()
    .filter((entry) => {
      if (task && entry.task !== task) {
        return false;
      }
      if (kindSet && !kindSet.has(entry.kind)) {
        return false;
      }
      if (requestedBbox) {
        const requestedCoarse = buildTileKey(requestedBbox, "coarse");
        const requestedFine = buildTileKey(requestedBbox, "fine");
        if (![requestedCoarse, requestedFine].includes(entry.key.tileKey)) {
          return false;
        }
      }
      if (timeAnchor) {
        const distance = bucketDistance(requestedTimeBucket, entry.key.timeBucket);
        if (distance > Math.max(0, Number(timeWindowDays) || 0)) {
          return false;
        }
      }
      return true;
    })
    .sort((left, right) => String(right.writtenAt).localeCompare(String(left.writtenAt)));
}

export function compactGeoMemory(memoryInput, {
  staticLimit = 48,
  dynamicLimit = 64,
  episodicLimit = 32,
} = {}) {
  const memory = normalizeGeoMemory(memoryInput);
  return {
    ...memory,
    staticEntries: memory.staticEntries.slice(0, staticLimit),
    dynamicEntries: memory.dynamicEntries.slice(0, dynamicLimit),
    episodicEntries: memory.episodicEntries.slice(0, episodicLimit),
  };
}

export function summarizeGeoMemory(memoryInput) {
  const memory = normalizeGeoMemory(memoryInput);
  return {
    version: memory.version,
    staticCount: memory.staticEntries.length,
    dynamicCount: memory.dynamicEntries.length,
    episodicCount: memory.episodicEntries.length,
  };
}
