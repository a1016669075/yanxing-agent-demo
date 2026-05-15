import fs from "node:fs/promises";
import path from "node:path";

import { buildWildfireCaseManifest, wildfireCaseManifestVersion } from "./caseManifest.mjs";
import { timestampLabel, writeJson, writeText } from "./replayArtifacts.mjs";
import { baseRunMetadata, collectGitMetadata, hashConfig, withArtifactMetadata } from "./replayMetadata.mjs";

const FIRMS_ARCHIVE_ROOT = "https://nrt3.modaps.eosdis.nasa.gov/archive/FIRMS";
const DEFAULT_BUNDLE_VERSION = "2026-04-13-official-nrt3-daily-v1";

const SENSOR_DOWNLOADS = {
  VIIRS_SNPP_NRT: {
    folder: "suomi-npp-viirs-c2",
    filePrefix: "SUOMI_VIIRS_C2",
    code: "VNP14IMGTDL_NRT",
  },
  VIIRS_NOAA20_NRT: {
    folder: "noaa-20-viirs-c2",
    filePrefix: "J1_VIIRS_C2",
    code: "VJ114IMGTDL_NRT",
  },
  VIIRS_NOAA21_NRT: {
    folder: "noaa-21-viirs-c2",
    filePrefix: "J2_VIIRS_C2",
    code: "VJ214IMGTDL_NRT",
  },
};

const CASE_REGION_MAP = {
  "indochina-hotspot-apr03-2026": "SouthEast_Asia",
  "crown-fire-acton-apr03-2026": "USA_contiguous_and_Hawaii",
  "springs-fire-moreno-valley-apr08-2026": "USA_contiguous_and_Hawaii",
  "lirquen-chile-jan20-2026": "South_America",
  "central-pacific-empty-apr2026": "Global",
  "greenland-ice-empty-apr2026": "Global",
  "permian-basin-static-source-trap": "USA_contiguous_and_Hawaii",
};

function parseArgs(argv = []) {
  const parsed = {
    outDir: path.resolve("benchmarks", "wildfire", `archive_bundle_${DEFAULT_BUNDLE_VERSION}`),
    caseIds: [],
    bundleVersion: DEFAULT_BUNDLE_VERSION,
    earthdataToken: process.env.EARTHDATA_TOKEN || process.env.LAADS_TOKEN || process.env.EARTHDATA_BEARER_TOKEN || "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--out") {
      parsed.outDir = path.resolve(String(argv[index + 1] || parsed.outDir));
      index += 1;
      continue;
    }
    if (token === "--case") {
      parsed.caseIds.push(String(argv[index + 1] || ""));
      index += 1;
      continue;
    }
    if (token === "--bundle-version") {
      parsed.bundleVersion = String(argv[index + 1] || parsed.bundleVersion);
      index += 1;
      continue;
    }
    if (token === "--earthdata-token") {
      parsed.earthdataToken = String(argv[index + 1] || "");
      index += 1;
    }
  }

  return parsed;
}

function dayOfYearString(isoString = "") {
  const date = new Date(isoString);
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const doy = Math.floor((current - start) / (24 * 60 * 60 * 1000)) + 1;
  return `${date.getUTCFullYear()}${String(doy).padStart(3, "0")}`;
}

function buildSourceUrl(sensor = "", region = "", anchorUtc = "") {
  const config = SENSOR_DOWNLOADS[sensor];
  if (!config) {
    return null;
  }
  const doy = dayOfYearString(anchorUtc);
  const fileName = `${config.filePrefix}_${region}_${config.code}_${doy}.txt`;
  return {
    fileName,
    url: `${FIRMS_ARCHIVE_ROOT}/${config.folder}/${region}/${fileName}`,
  };
}

function aoiFeature(caseDefinition = {}) {
  const [west, south, east, north] = caseDefinition.aoi || [];
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          case_id: caseDefinition.id,
          label: caseDefinition.label,
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [west, south],
              [east, south],
              [east, north],
              [west, north],
              [west, south],
            ],
          ],
        },
      },
    ],
  };
}

async function ensureFreshDirectory(outDir) {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
}

function looksLikeCsv(text = "") {
  const firstLine = String(text || "").split(/\r?\n/, 1)[0].trim().toLowerCase();
  return firstLine.includes("latitude") && firstLine.includes("longitude") && firstLine.includes("acq_date");
}

async function downloadText(url, { earthdataToken = "" } = {}) {
  const headers = earthdataToken
    ? {
        Authorization: `Bearer ${earthdataToken}`,
      }
    : {};
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const error = new Error(`Failed to download ${url}: HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const text = await response.text();
  if (!looksLikeCsv(text)) {
    const error = new Error(`Downloaded content for ${url} did not match FIRMS CSV format. Earthdata authorization may be required.`);
    error.status = response.status;
    error.failure_status = "invalid_csv_payload";
    throw error;
  }
  return {
    text,
    headers: typeof response.headers?.entries === "function" ? Object.fromEntries(response.headers.entries()) : {},
    status: response.status,
  };
}

async function buildBundleCase(caseDefinition = {}, outDir = "", bundleVersion = "", { earthdataToken = "" } = {}) {
  const region = CASE_REGION_MAP[caseDefinition.id] || "Global";
  const caseDir = path.join(outDir, "cases", caseDefinition.id);
  const officialDir = path.join(caseDir, "official");
  await fs.mkdir(officialDir, { recursive: true });

  const archiveSources = [];
  const sourceManifest = [];
  for (const sensor of caseDefinition.sensor_priority || []) {
    if (!SENSOR_DOWNLOADS[sensor]) {
      continue;
    }
    const source = buildSourceUrl(sensor, region, caseDefinition.anchorUtc);
    if (!source) {
      continue;
    }

    try {
      const downloaded = await downloadText(source.url, { earthdataToken });
      const outputName = `${sensor}__${dayOfYearString(caseDefinition.anchorUtc)}__${region}.csv`;
      const relativePath = path.join("cases", caseDefinition.id, "official", outputName).replace(/\\/g, "/");
      await fs.writeFile(path.join(officialDir, outputName), downloaded.text, "utf8");
      archiveSources.push({
        id: `${sensor.toLowerCase()}-${dayOfYearString(caseDefinition.anchorUtc)}`,
        label: `${sensor} official daily archive`,
        path: relativePath,
        format: "csv",
        sensor,
        product: sensor,
        date: caseDefinition.anchorUtc.slice(0, 10),
        apiDayRange: 1,
        requestedWindowDays: 1,
        source_url: source.url,
        source_filename: source.fileName,
      });
      sourceManifest.push({
        sensor,
        region,
        source_url: source.url,
        source_filename: source.fileName,
        output_path: relativePath,
        http_status: downloaded.status,
        content_length: Buffer.byteLength(downloaded.text, "utf8"),
        downloaded_at_utc: new Date().toISOString(),
        headers: {
          "content-length": downloaded.headers["content-length"] || null,
          "last-modified": downloaded.headers["last-modified"] || null,
          etag: downloaded.headers.etag || null,
        },
      });
    } catch (error) {
      sourceManifest.push({
        sensor,
        region,
        source_url: source.url,
        source_filename: source.fileName,
        output_path: null,
        http_status: Number(error?.status) || null,
        failure_status: "download_error",
        error: String(error?.message || error),
        downloaded_at_utc: new Date().toISOString(),
      });
    }
  }

  await writeJson(path.join(caseDir, "aoi.geojson"), aoiFeature(caseDefinition));
  await writeJson(
    path.join(caseDir, "expected_outcome.json"),
    {
      case_id: caseDefinition.id,
      case_type: caseDefinition.case_type,
      time_semantics: "archive_sp",
      expected_outcome: caseDefinition.expected_outcome,
      primary_eval_metric: caseDefinition.primary_eval_metric,
      acceptable_time_offset: caseDefinition.acceptable_time_offset,
    }
  );
  await writeJson(path.join(caseDir, "source_manifest.json"), sourceManifest);

  return {
    ...caseDefinition,
    time_semantics: "archive_sp",
    archive_source: "official_nrt3_daily_text_https",
    bundle_version: bundleVersion,
    sensor_coverage: archiveSources.map((entry) => entry.sensor),
    archive_sources: archiveSources,
  };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.earthdataToken) {
    throw new Error(
      "EARTHDATA_TOKEN (or --earthdata-token) is required to build the official archive bundle without downloading login HTML."
    );
  }
  const manifest = buildWildfireCaseManifest();
  const selectedCases = options.caseIds.length
    ? manifest.filter((entry) => options.caseIds.includes(entry.id))
    : manifest;

  if (options.caseIds.length && selectedCases.length !== options.caseIds.length) {
    throw new Error("One or more requested case ids were not found in the wildfire case manifest.");
  }

  const stagingOutDir = `${options.outDir}.tmp-${timestampLabel()}`;
  await ensureFreshDirectory(stagingOutDir);
  const timestampUtc = new Date().toISOString();
  const git = collectGitMetadata();
  const runMetadata = baseRunMetadata({
    runnerName: "build-official-archive-bundle",
    configHash: hashConfig({
      bundleVersion: options.bundleVersion,
      cases: selectedCases.map((entry) => entry.id),
      manifestVersion: wildfireCaseManifestVersion,
    }),
    timestampUtc,
    git,
  });

  const bundleCases = [];
  try {
    for (const caseDefinition of selectedCases) {
      const bundleCase = await buildBundleCase(caseDefinition, stagingOutDir, options.bundleVersion, {
        earthdataToken: options.earthdataToken,
      });
      bundleCases.push(bundleCase);
    }

    const topLevelManifest = {
      bundle_version: options.bundleVersion,
      archive_source: "official_nrt3_daily_text_https",
      cases: bundleCases,
    };

    await writeJson(path.join(stagingOutDir, "manifest.json"), withArtifactMetadata(topLevelManifest, runMetadata));
    await writeText(
      path.join(stagingOutDir, "README.md"),
      `# Wildfire Official Archive Benchmark Bundle\n\n- bundle_version: \`${options.bundleVersion}\`\n- archive_source: \`official_nrt3_daily_text_https\`\n- case_manifest_version: \`${wildfireCaseManifestVersion}\`\n- generated_at_utc: \`${timestampUtc}\`\n\nThis bundle stores official FIRMS HTTPS daily archive text files as CSV inputs under each case directory.\n`
    );
    await fs.rm(options.outDir, { recursive: true, force: true });
    await fs.rename(stagingOutDir, options.outDir);

    process.stdout.write(
      `${JSON.stringify(
        {
          outputDir: options.outDir,
          bundleVersion: options.bundleVersion,
          caseCount: bundleCases.length,
          cases: bundleCases.map((entry) => ({
            caseId: entry.id,
            sensorCoverage: entry.sensor_coverage,
            archiveSourceCount: entry.archive_sources.length,
          })),
        },
        null,
        2
      )}\n`
    );
  } catch (error) {
    await fs.rm(stagingOutDir, { recursive: true, force: true });
    throw error;
  }
}

run().catch((error) => {
  process.stderr.write(`${String(error?.stack || error?.message || error)}\n`);
  process.exitCode = 1;
});
