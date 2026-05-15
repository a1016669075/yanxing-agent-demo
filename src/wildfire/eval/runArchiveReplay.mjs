import fs from "node:fs/promises";
import path from "node:path";

import { loadArchiveBundleManifest, loadArchiveCasePayloads, buildArchiveSourceLogs } from "./archiveBundle.mjs";
import { wildfireCaseManifestVersion } from "./caseManifest.mjs";
import { renderReplayReportHtml } from "./replayReport.mjs";
import {
  buildAggregateBeforeAfterComparison,
  buildAggregateMetrics,
  buildAggregateProviderParityReport,
  buildAggregateStaticSourceReport,
  buildAggregateTransactionBudgetReport,
  buildKnownLimitationsMarkdown,
  buildReplayCaseResult,
  buildReplayRequest,
  timestampLabel,
  writeCaseReplayArtifacts,
  writeJson,
  writeText,
} from "./replayArtifacts.mjs";
import { baseRunMetadata, collectGitMetadata, hashConfig, withArtifactMetadata } from "./replayMetadata.mjs";

function parseArgs(argv = []) {
  const parsed = {
    bundleDir: "",
    outDir: path.resolve("artifacts", "wildfire-archive", timestampLabel()),
    caseIds: [],
    manifestOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--bundle") {
      parsed.bundleDir = path.resolve(String(argv[index + 1] || ""));
      index += 1;
      continue;
    }
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
    if (token === "--manifest-only") {
      parsed.manifestOnly = true;
    }
  }

  return parsed;
}

async function ensureFreshOutputDirectory(outDir) {
  try {
    await fs.access(outDir);
    throw new Error(`Output directory already exists: ${outDir}`);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

async function replayArchiveCase(bundleDir, caseDefinition = {}, outDir = "", runMetadata = {}) {
  if (caseDefinition.time_semantics !== "archive_sp") {
    throw new Error(`Case ${caseDefinition.id} is not marked archive_sp and should not be replayed in archive mode.`);
  }
  const request = buildReplayRequest(caseDefinition, { includeLowConfidence: true });
  const payloads = await loadArchiveCasePayloads(bundleDir, caseDefinition);
  const logs = await buildArchiveSourceLogs(bundleDir, caseDefinition);
  const caseArtifactMetadata = {
    ...runMetadata,
    case_id: caseDefinition.id,
    case_type: caseDefinition.case_type,
    time_semantics: caseDefinition.time_semantics,
    archive_source: caseDefinition.archive_source || null,
    bundle_version: caseDefinition.bundle_version || null,
    sensor_coverage: caseDefinition.sensor_coverage || caseDefinition.sensor_priority || [],
    config_hash: hashConfig({
      caseId: caseDefinition.id,
      bundleDir,
      request,
      caseDefinition,
      manifestVersion: wildfireCaseManifestVersion,
    }),
  };
  const replayResult = buildReplayCaseResult(caseDefinition, request, payloads, {
    requestLog: logs.requestLog,
    responseLog: logs.responseLog,
    transactionBudget: logs.transactionBudget,
    sourceMode: "archive_sp",
    artifactMetadata: caseArtifactMetadata,
  });
  const caseDir = path.join(outDir, caseDefinition.id);
  await writeCaseReplayArtifacts(caseDir, caseDefinition, replayResult, { metadata: caseArtifactMetadata });

  return {
    ...replayResult,
    outputDir: caseDir,
  };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.bundleDir) {
    throw new Error("Archive replay requires --bundle <bundleDir>.");
  }

  const manifest = await loadArchiveBundleManifest(options.bundleDir);
  const selectedCases = options.caseIds.length
    ? manifest.filter((entry) => options.caseIds.includes(entry.id))
    : manifest;

  if (options.caseIds.length && selectedCases.length !== options.caseIds.length) {
    throw new Error("One or more requested archive case ids were not found in the bundle manifest.");
  }

  if (options.manifestOnly) {
    process.stdout.write(`${JSON.stringify(selectedCases, null, 2)}\n`);
    return;
  }

  await ensureFreshOutputDirectory(options.outDir);
  const stagingOutDir = `${options.outDir}.tmp-${timestampLabel()}`;
  await fs.mkdir(stagingOutDir, { recursive: true });
  const timestampUtc = new Date().toISOString();
  const git = collectGitMetadata();
  const bundleVersions = [...new Set(selectedCases.map((entry) => entry.bundle_version).filter(Boolean))];
  const archiveSources = [...new Set(selectedCases.map((entry) => entry.archive_source).filter(Boolean))];
  const runMetadata = baseRunMetadata({
    runnerName: "archive-benchmark-replay",
    configHash: hashConfig({
      bundleVersion: bundleVersions,
      archiveSource: archiveSources,
      cases: selectedCases,
      manifestVersion: wildfireCaseManifestVersion,
    }),
    timestampUtc,
    git,
  });
  runMetadata.bundle_version = bundleVersions.length === 1 ? bundleVersions[0] : bundleVersions;
  runMetadata.archive_source = archiveSources.length === 1 ? archiveSources[0] : archiveSources;

  try {
    await writeJson(path.join(stagingOutDir, "manifest.json"), withArtifactMetadata({ cases: selectedCases }, runMetadata));
    const caseResults = [];
    for (const caseDefinition of selectedCases) {
      const result = await replayArchiveCase(options.bundleDir, caseDefinition, stagingOutDir, runMetadata);
      caseResults.push(result);
    }

    await writeJson(path.join(stagingOutDir, "metrics.json"), withArtifactMetadata(buildAggregateMetrics(caseResults), runMetadata));
    await writeJson(
      path.join(stagingOutDir, "provider_parity_report.json"),
      withArtifactMetadata(buildAggregateProviderParityReport(caseResults), runMetadata)
    );
    await writeJson(
      path.join(stagingOutDir, "before_after_cluster_comparison.json"),
      withArtifactMetadata(buildAggregateBeforeAfterComparison(caseResults), runMetadata)
    );
    await writeJson(
      path.join(stagingOutDir, "static_source_report.json"),
      withArtifactMetadata(buildAggregateStaticSourceReport(caseResults), runMetadata)
    );
    await writeJson(
      path.join(stagingOutDir, "transaction_budget_report.json"),
      withArtifactMetadata(buildAggregateTransactionBudgetReport(caseResults), runMetadata)
    );
    await writeJson(
      path.join(stagingOutDir, "report_data.json"),
      withArtifactMetadata(
        {
          aggregateMetrics: buildAggregateMetrics(caseResults),
          cases: caseResults.map((entry) => ({
            caseId: entry.caseId,
            label: entry.label,
            case_type: entry.case_type,
            time_semantics: entry.time_semantics,
            outputDir: entry.outputDir,
          })),
        },
        runMetadata
      )
    );
    await writeText(
      path.join(stagingOutDir, "known_limitations.md"),
      buildKnownLimitationsMarkdown(caseResults, { metadata: runMetadata })
    );
    await writeText(
      path.join(stagingOutDir, "report.html"),
      renderReplayReportHtml({
        title: "Wildfire Archive Replay Report",
        metadata: runMetadata,
        aggregateMetrics: buildAggregateMetrics(caseResults),
        caseResults,
      })
    );

    await fs.rename(stagingOutDir, options.outDir);

    process.stdout.write(
      `${JSON.stringify(
        {
          outputDir: options.outDir,
          caseCount: caseResults.length,
          cases: caseResults.map((entry) => ({
            caseId: entry.caseId,
            case_type: entry.case_type,
            time_semantics: entry.time_semantics,
            status: entry.overlay.status,
            outputDir: entry.outputDir.replace(stagingOutDir, options.outDir),
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
