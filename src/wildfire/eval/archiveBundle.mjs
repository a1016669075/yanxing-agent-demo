import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

import { buildWildfireCaseManifest } from "./caseManifest.mjs";

const require = createRequire(import.meta.url);
const { parseCsv } = require("../../../firmsSearch.cjs");
const shapefile = require("shapefile");

function normalizeBundleRoot(bundleDir = "") {
  return path.resolve(String(bundleDir || ""));
}

function relativeBundlePath(bundleRoot = "", absolutePath = "") {
  return path.relative(normalizeBundleRoot(bundleRoot), path.resolve(absolutePath)).replace(/\\/g, "/");
}

function ensureInsideBundle(bundleRoot = "", candidatePath = "") {
  const root = normalizeBundleRoot(bundleRoot).toLowerCase();
  const resolved = path.resolve(candidatePath).toLowerCase();
  if (!resolved.startsWith(root)) {
    throw new Error(`Archive source path escapes bundle root: ${candidatePath}`);
  }
}

function pickProperty(properties = {}, aliases = []) {
  const entries = Object.entries(properties || {});
  const lookup = new Map(entries.map(([key, value]) => [String(key).toLowerCase(), value]));
  for (const alias of aliases) {
    const lowerAlias = String(alias).toLowerCase();
    if (lookup.has(lowerAlias)) {
      return lookup.get(lowerAlias);
    }
  }
  return null;
}

function archiveFileUrl(filePath = "") {
  return `archive://${filePath.replace(/\\/g, "/")}`;
}

function rowsFromGeoJsonFeatures(features = [], source = {}) {
  return (Array.isArray(features) ? features : []).map((feature) => {
    const properties = feature?.properties || {};
    const coordinates = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
    const lon = Number(pickProperty(properties, ["longitude", "lon", "LONGITUDE"]) ?? coordinates[0]);
    const lat = Number(pickProperty(properties, ["latitude", "lat", "LATITUDE"]) ?? coordinates[1]);

    return {
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lon) ? lon : null,
      acq_date: String(
        pickProperty(properties, ["acq_date", "acqdate", "ACQ_DATE", "date", "DATE"]) || source.date || ""
      ),
      acq_time: String(
        pickProperty(properties, ["acq_time", "acqtime", "ACQ_TIME", "time", "TIME"]) || "0000"
      ).padStart(4, "0"),
      satellite: pickProperty(properties, ["satellite", "SATELLITE", "sat"]) || "",
      instrument: pickProperty(properties, ["instrument", "INSTRUMENT"]) || "",
      confidence: pickProperty(properties, ["confidence", "CONFIDENCE"]) || "",
      frp: pickProperty(properties, ["frp", "FRP"]) || "",
      daynight: pickProperty(properties, ["daynight", "DAYNIGHT", "day_night"]) || "",
      scan: pickProperty(properties, ["scan", "SCAN"]) || "",
      track: pickProperty(properties, ["track", "TRACK"]) || "",
    };
  });
}

async function readArchiveJsonSource(absolutePath, source = {}) {
  const rawText = await fs.readFile(absolutePath, "utf8");
  const payload = JSON.parse(rawText);
  if (Array.isArray(payload)) {
    return { rows: payload, rawFormat: "json", rawPayload: payload, rawText };
  }
  if (Array.isArray(payload?.rows)) {
    return { rows: payload.rows, rawFormat: "json", rawPayload: payload, rawText };
  }
  if (Array.isArray(payload?.features)) {
    return {
      rows: rowsFromGeoJsonFeatures(payload.features, source),
      rawFormat: "json",
      rawPayload: payload,
      rawText,
    };
  }
  return {
    rows: [],
    rawFormat: "json",
    rawPayload: payload,
    rawText,
  };
}

async function readArchiveShapefileSource(absolutePath, source = {}) {
  const reader = await shapefile.open(absolutePath);
  const features = [];
  while (true) {
    const step = await reader.read();
    if (step.done) {
      break;
    }
    features.push(step.value);
  }
  return {
    rows: rowsFromGeoJsonFeatures(features, source),
    rawFormat: "json",
    rawPayload: {
      type: "FeatureCollection",
      features,
    },
    rawText: JSON.stringify(
      {
        type: "FeatureCollection",
        features,
      },
      null,
      2
    ),
  };
}

async function readArchiveSourceRows(bundleDir = "", source = {}) {
  const bundleRoot = normalizeBundleRoot(bundleDir);
  const absolutePath = path.resolve(bundleRoot, String(source.path || ""));
  ensureInsideBundle(bundleRoot, absolutePath);

  const format = String(source.format || path.extname(absolutePath).slice(1)).trim().toLowerCase();
  if (format === "csv") {
    const rawText = await fs.readFile(absolutePath, "utf8");
    return {
      absolutePath,
      rows: parseCsv(rawText),
      rawFormat: "csv",
      rawPayload: null,
      rawText,
    };
  }
  if (format === "json" || format === "geojson") {
    return {
      absolutePath,
      ...(await readArchiveJsonSource(absolutePath, source)),
    };
  }
  if (format === "shp") {
    return {
      absolutePath,
      ...(await readArchiveShapefileSource(absolutePath, source)),
    };
  }
  throw new Error(`Unsupported archive source format: ${format}`);
}

function dedupeRows(rows = []) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const key = [
      row.latitude,
      row.longitude,
      row.acq_date,
      row.acq_time,
      row.satellite,
      row.instrument,
      row.product,
    ].join(":");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeArchiveRows(rows = [], source = {}, absolutePath = "") {
  const product = source.product || source.sensor || "";
  return dedupeRows(
    (Array.isArray(rows) ? rows : []).map((row) => ({
      ...row,
      product: row.product || product,
      requestedUrl: row.requestedUrl || archiveFileUrl(absolutePath),
    }))
  );
}

function rowInsideAoi(row = {}, aoi = null) {
  if (!Array.isArray(aoi) || aoi.length !== 4) {
    return true;
  }
  const lon = Number(row.longitude);
  const lat = Number(row.latitude);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return false;
  }
  return lon >= aoi[0] && lon <= aoi[2] && lat >= aoi[1] && lat <= aoi[3];
}

export async function loadArchiveBundleManifest(bundleDir = "") {
  const manifestPath = path.resolve(normalizeBundleRoot(bundleDir), "manifest.json");
  const rawText = await fs.readFile(manifestPath, "utf8");
  const payload = JSON.parse(rawText);
  const cases = Array.isArray(payload) ? payload : Array.isArray(payload?.cases) ? payload.cases : [];
  const bundleVersion = payload?.bundle_version ? String(payload.bundle_version) : null;
  const archiveSource = payload?.archive_source ? String(payload.archive_source) : null;
  return buildWildfireCaseManifest(
    cases.map((entry) => ({
      ...entry,
      bundle_version: entry.bundle_version || bundleVersion,
      archive_source: entry.archive_source || archiveSource,
    }))
  );
}

export async function loadArchiveCasePayloads(bundleDir = "", caseDefinition = {}) {
  const archiveSources = Array.isArray(caseDefinition.archive_sources) ? caseDefinition.archive_sources : [];
  if (!archiveSources.length) {
    throw new Error(`Archive case ${caseDefinition.id} is missing archive_sources`);
  }

  const payloads = [];
  for (const source of archiveSources) {
    const loaded = await readArchiveSourceRows(bundleDir, source);
    const rawRows = normalizeArchiveRows(loaded.rows, source, loaded.absolutePath);
    const rows = rawRows.filter((row) => rowInsideAoi(row, caseDefinition.aoi));
    payloads.push({
      provider: "firms",
      mode: "standard",
      dayRange: source.requestedWindowDays || caseDefinition.requestedWindowDays || 1,
      date: source.date || null,
      bbox: caseDefinition.aoi || null,
      products: [source.product || source.sensor],
      segments: [
        {
          sliceId: source.id,
          label: source.label,
          product: source.product || source.sensor,
          apiDayRange: source.apiDayRange || 1,
          date: source.date || null,
          requestedWindowDays: source.requestedWindowDays || caseDefinition.requestedWindowDays || 1,
          url: archiveFileUrl(loaded.absolutePath),
          sourcePath: relativeBundlePath(bundleDir, loaded.absolutePath),
          rawFormat: loaded.rawFormat,
          rawPayload: loaded.rawPayload,
          rawText: loaded.rawText,
          rawRowCount: rawRows.length,
          filteredRowCount: rows.length,
          rows,
        },
      ],
      rows,
    });
  }

  return payloads;
}

export async function buildArchiveSourceLogs(bundleDir = "", caseDefinition = {}) {
  const archiveSources = Array.isArray(caseDefinition.archive_sources) ? caseDefinition.archive_sources : [];
  const requestLog = [];
  const responseLog = [];
  let totalResponseBytes = 0;

  for (const [index, source] of archiveSources.entries()) {
    const absolutePath = path.resolve(normalizeBundleRoot(bundleDir), String(source.path || ""));
    ensureInsideBundle(bundleDir, absolutePath);
    const stats = await fs.stat(absolutePath);
    const requestId = `${caseDefinition.id}-archive-${index + 1}`;
    requestLog.push({
      requestId,
      mode: "archive_sp",
      sourcePath: relativeBundlePath(bundleDir, absolutePath),
      format: source.format || path.extname(absolutePath).slice(1).toLowerCase(),
      requestedAtUtc: new Date().toISOString(),
    });
    totalResponseBytes += Number(stats.size) || 0;
    responseLog.push({
      requestId,
      status: "loaded",
      failure_status: "ok",
      sourcePath: relativeBundlePath(bundleDir, absolutePath),
      bytes: Number(stats.size) || 0,
      product: source.product || source.sensor,
      loadedAtUtc: new Date().toISOString(),
    });
  }

  return {
    requestLog,
    responseLog,
    transactionBudget: {
      requestCount: archiveSources.length,
      responseCount: archiveSources.length,
      successCount: archiveSources.length,
      errorCount: 0,
      totalResponseBytes,
      totalLatencyMs: 0,
      maxLatencyMs: 0,
    },
  };
}
