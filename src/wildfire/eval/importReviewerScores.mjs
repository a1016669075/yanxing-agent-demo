import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseCsv } = require("../../../firmsSearch.cjs");

function parseArgs(argv = []) {
  const parsed = {
    inputDir: "",
    outDir: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-dir") {
      parsed.inputDir = path.resolve(String(argv[index + 1] || ""));
      index += 1;
      continue;
    }
    if (token === "--out-dir") {
      parsed.outDir = path.resolve(String(argv[index + 1] || ""));
      index += 1;
    }
  }

  if (!parsed.inputDir) {
    throw new Error("--input-dir is required");
  }
  if (!parsed.outDir) {
    parsed.outDir = parsed.inputDir;
  }
  return parsed;
}

function csvEscape(value = "") {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function normalizeRow(row = {}, sourceFile = "") {
  return {
    reviewer_id: String(row.reviewer_id || "").trim(),
    case_id: String(row.case_id || "").trim(),
    source_type: String(row.source_type || "").trim(),
    task_prompt: String(row.task_prompt || "").trim(),
    task_pass: String(row.task_pass || "").trim().toLowerCase(),
    status_semantics_clear: String(row.status_semantics_clear || "").trim().toLowerCase(),
    time_semantics_clear: String(row.time_semantics_clear || "").trim().toLowerCase(),
    evidence_classification_clear: String(row.evidence_classification_clear || "").trim().toLowerCase(),
    active_fire_semantics_clear: String(row.active_fire_semantics_clear || "").trim().toLowerCase(),
    needs_follow_up: String(row.needs_follow_up || "").trim().toLowerCase(),
    notes: String(row.notes || "").trim(),
    source_file: sourceFile,
  };
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeCsv(filePath, rows = []) {
  const header = [
    "reviewer_id",
    "case_id",
    "source_type",
    "task_prompt",
    "task_pass",
    "status_semantics_clear",
    "time_semantics_clear",
    "evidence_classification_clear",
    "active_fire_semantics_clear",
    "needs_follow_up",
    "notes",
    "source_file",
  ];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        csvEscape(row.reviewer_id),
        csvEscape(row.case_id),
        csvEscape(row.source_type),
        csvEscape(row.task_prompt),
        csvEscape(row.task_pass),
        csvEscape(row.status_semantics_clear),
        csvEscape(row.time_semantics_clear),
        csvEscape(row.evidence_classification_clear),
        csvEscape(row.active_fire_semantics_clear),
        csvEscape(row.needs_follow_up),
        csvEscape(row.notes),
        csvEscape(row.source_file),
      ].join(",")
    ),
  ];
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = await fs.readdir(args.inputDir, { withFileTypes: true });
  const csvFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => entry.name)
    .filter((name) => !["reviewer_score_sheet.csv", "internal_review_results.csv", "imported_reviewer_scores.csv"].includes(name));

  if (!csvFiles.length) {
    throw new Error(`No reviewer CSV files found in ${args.inputDir}`);
  }

  const rows = [];
  for (const fileName of csvFiles) {
    const absolute = path.join(args.inputDir, fileName);
    const parsed = parseCsv(await fs.readFile(absolute, "utf8"));
    parsed
      .map((row) => normalizeRow(row, fileName))
      .filter((row) => row.reviewer_id && row.case_id)
      .forEach((row) => rows.push(row));
  }

  if (!rows.length) {
    throw new Error(`Reviewer CSV files were found in ${args.inputDir}, but none contained reviewer_id + case_id rows`);
  }

  const reviewerIds = [...new Set(rows.map((row) => row.reviewer_id))];
  const caseIds = [...new Set(rows.map((row) => row.case_id))];
  const payload = {
    status: reviewerIds.length >= 3 ? "ready_for_aggregation" : "partial_input",
    reviewer_count: reviewerIds.length,
    case_count: caseIds.length,
    imported_files: csvFiles,
    rows,
  };

  await writeJson(path.join(args.outDir, "imported_reviewer_scores.json"), payload);
  await writeCsv(path.join(args.outDir, "imported_reviewer_scores.csv"), rows);
  process.stdout.write(`${JSON.stringify({ outDir: args.outDir, reviewer_count: reviewerIds.length, case_count: caseIds.length }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack || error?.message || error)}\n`);
  process.exitCode = 1;
});
