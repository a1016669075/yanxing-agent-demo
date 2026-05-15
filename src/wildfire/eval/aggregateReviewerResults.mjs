import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseCsv } = require("../../../firmsSearch.cjs");

function parseArgs(argv = []) {
  const parsed = {
    inputJson: "",
    inputCsv: "",
    outDir: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-json") {
      parsed.inputJson = path.resolve(String(argv[index + 1] || ""));
      index += 1;
      continue;
    }
    if (token === "--input-csv") {
      parsed.inputCsv = path.resolve(String(argv[index + 1] || ""));
      index += 1;
      continue;
    }
    if (token === "--out-dir") {
      parsed.outDir = path.resolve(String(argv[index + 1] || ""));
      index += 1;
    }
  }

  if (!parsed.inputJson && !parsed.inputCsv) {
    throw new Error("Either --input-json or --input-csv is required");
  }
  if (!parsed.outDir) {
    parsed.outDir = path.dirname(parsed.inputJson || parsed.inputCsv);
  }
  return parsed;
}

function csvEscape(value = "") {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function normalizeVote(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (["yes", "y", "true", "pass", "1"].includes(normalized)) {
    return true;
  }
  if (["no", "n", "false", "fail", "0"].includes(normalized)) {
    return false;
  }
  return null;
}

function normalizeRow(row = {}) {
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
    source_file: String(row.source_file || "").trim(),
  };
}

function average(values = []) {
  const filtered = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!filtered.length) {
    return null;
  }
  return Math.round((filtered.reduce((sum, value) => sum + value, 0) / filtered.length) * 10000) / 10000;
}

function agreementRate(values = []) {
  const normalized = values.filter((value) => value === true || value === false);
  if (!normalized.length) {
    return null;
  }
  const yesCount = normalized.filter(Boolean).length;
  const noCount = normalized.length - yesCount;
  return Math.max(yesCount, noCount) / normalized.length;
}

function buildPerTaskSummary(rows = []) {
  const fields = [
    "task_pass",
    "status_semantics_clear",
    "time_semantics_clear",
    "evidence_classification_clear",
    "active_fire_semantics_clear",
  ];
  const byCase = new Map();

  rows.forEach((row) => {
    if (!byCase.has(row.case_id)) {
      byCase.set(row.case_id, []);
    }
    byCase.get(row.case_id).push(row);
  });

  return [...byCase.entries()].map(([caseId, caseRows]) => {
    const fieldAgreement = Object.fromEntries(
      fields.map((field) => [field, agreementRate(caseRows.map((row) => normalizeVote(row[field])))])
    );
    const followUpCount = caseRows.filter((row) => normalizeVote(row.needs_follow_up) === true).length;
    return {
      case_id: caseId,
      reviewer_count: [...new Set(caseRows.map((row) => row.reviewer_id))].length,
      agreement: fieldAgreement,
      per_task_agreement_rate: average(Object.values(fieldAgreement).filter((value) => value !== null)),
      follow_up_count: followUpCount,
      disagreement: Object.entries(fieldAgreement)
        .filter(([, value]) => value !== null && value < 1)
        .map(([field]) => field),
    };
  });
}

function buildDisagreementHotspots(perTask = []) {
  return perTask
    .filter((entry) => entry.follow_up_count > 0 || entry.disagreement.length > 0)
    .sort(
      (left, right) =>
        (right.follow_up_count - left.follow_up_count) ||
        (right.disagreement.length - left.disagreement.length) ||
        String(left.case_id).localeCompare(String(right.case_id))
    )
    .map((entry) => ({
      case_id: entry.case_id,
      follow_up_count: entry.follow_up_count,
      disagreement_fields: entry.disagreement,
      per_task_agreement_rate: entry.per_task_agreement_rate,
    }));
}

async function readRows(args = {}) {
  if (args.inputJson) {
    const payload = JSON.parse(await fs.readFile(args.inputJson, "utf8"));
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    return rows.map((row) => normalizeRow(row)).filter((row) => row.reviewer_id && row.case_id);
  }
  const parsed = parseCsv(await fs.readFile(args.inputCsv, "utf8"));
  return parsed.map((row) => normalizeRow(row)).filter((row) => row.reviewer_id && row.case_id);
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
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

function buildDisagreementMarkdown(summary = {}) {
  const hotspots = Array.isArray(summary?.reviewer_disagreement_hotspots) ? summary.reviewer_disagreement_hotspots : [];
  const lines = [
    "# Reviewer Disagreement Summary",
    "",
    `- status: ${summary.status || "unknown"}`,
    `- reviewer_count: ${summary.reviewer_count ?? "n/a"}`,
    `- case_count: ${summary.case_count ?? "n/a"}`,
    `- overall_agreement_rate: ${summary.overall_agreement_rate ?? "n/a"}`,
    "",
    "## Hotspots",
    "",
  ];

  if (!hotspots.length) {
    lines.push("- No disagreement hotspots detected in the imported reviewer rows.");
  } else {
    hotspots.forEach((hotspot) => {
      lines.push(`### ${hotspot.case_id}`);
      lines.push("");
      lines.push(`- per_task_agreement_rate: ${hotspot.per_task_agreement_rate ?? "n/a"}`);
      lines.push(`- follow_up_count: ${hotspot.follow_up_count ?? 0}`);
      lines.push(`- disagreement_fields: ${(hotspot.disagreement_fields || []).join(", ") || "none"}`);
      lines.push("");
    });
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await readRows(args);
  if (!rows.length) {
    throw new Error("No valid reviewer rows found");
  }

  const reviewerIds = [...new Set(rows.map((row) => row.reviewer_id))];
  const caseIds = [...new Set(rows.map((row) => row.case_id))];
  const perTask = buildPerTaskSummary(rows);
  const overallAgreementRate = average(perTask.map((entry) => entry.per_task_agreement_rate).filter((value) => value !== null));
  const summary = {
    status: reviewerIds.length >= 3 ? "executed" : "partial_input",
    reviewer_count: reviewerIds.length,
    case_count: caseIds.length,
    per_task_agreement_rate: Object.fromEntries(perTask.map((entry) => [entry.case_id, entry.per_task_agreement_rate])),
    overall_agreement_rate: overallAgreementRate,
    reviewer_disagreement_hotspots: buildDisagreementHotspots(perTask),
    per_case: perTask,
  };

  await writeCsv(path.join(args.outDir, "internal_review_results.csv"), rows);
  await writeJson(path.join(args.outDir, "review_agreement_summary.json"), summary);
  await writeText(path.join(args.outDir, "reviewer_disagreement_summary.md"), buildDisagreementMarkdown(summary));

  process.stdout.write(
    `${JSON.stringify(
      {
        outDir: args.outDir,
        reviewer_count: reviewerIds.length,
        case_count: caseIds.length,
        status: summary.status,
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack || error?.message || error)}\n`);
  process.exitCode = 1;
});
