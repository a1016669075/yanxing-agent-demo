import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import zlib from "node:zlib";

import { wildfireCaseManifestVersion } from "./caseManifest.mjs";

export const wildfireReplayRunnerVersion = "2026-04-13-replay-v2";
export const rawLogSizeLimitBytes = 256 * 1024;

function safeGit(args = []) {
  try {
    return String(execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) || "").trim();
  } catch {
    return null;
  }
}

export function collectGitMetadata() {
  const gitSha = safeGit(["rev-parse", "HEAD"]);
  const gitBranch = safeGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const porcelain = safeGit(["status", "--porcelain"]) || "";
  return {
    git_sha: gitSha || "unknown",
    git_branch: gitBranch || "unknown",
    worktree_dirty: Boolean(porcelain.trim()),
  };
}

export function hashConfig(value = {}) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function baseRunMetadata({
  runnerName = "wildfire-replay",
  configHash = "",
  timestampUtc = new Date().toISOString(),
  git = collectGitMetadata(),
} = {}) {
  return {
    git_sha: git.git_sha || "unknown",
    git_branch: git.git_branch || "unknown",
    worktree_dirty: Boolean(git.worktree_dirty),
    case_manifest_version: wildfireCaseManifestVersion,
    config_hash: String(configHash || ""),
    runner_version: `${wildfireReplayRunnerVersion}:${runnerName}`,
    timestamp_utc: timestampUtc,
  };
}

export function withArtifactMetadata(payload, metadata = {}) {
  if (Array.isArray(payload)) {
    return {
      metadata,
      entries: payload,
    };
  }
  if (payload && typeof payload === "object") {
    return {
      ...payload,
      metadata,
    };
  }
  return {
    metadata,
    value: payload,
  };
}

export function sanitizeUrl(url = "", { mapKey = "" } = {}) {
  const raw = String(url || "");
  if (!raw) {
    return raw;
  }

  const redactString = (value = "") => {
    let next = String(value || "");
    if (mapKey) {
      next = next.split(mapKey).join("<REDACTED_MAP_KEY>");
      next = next.split(encodeURIComponent(mapKey)).join("<REDACTED_MAP_KEY>");
    }
    next = next.replace(/(\/api\/area\/csv\/)([^/]+)(\/)/i, "$1<REDACTED_MAP_KEY>$3");
    next = next.replace(/(\/api\/area\/json\/)([^/]+)(\/)/i, "$1<REDACTED_MAP_KEY>$3");
    return next;
  };

  try {
    const parsed = new URL(raw);
    for (const key of [...parsed.searchParams.keys()]) {
      parsed.searchParams.set(key, "<REDACTED>");
    }
    return redactString(parsed.toString());
  } catch {
    return redactString(raw.replace(/([?&][^=]+=)[^&]*/g, "$1<REDACTED>"));
  }
}

export function sanitizeHeaders(headers = {}) {
  const sensitiveKeys = new Set(["authorization", "cookie", "set-cookie", "x-api-key", "proxy-authorization"]);
  return Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [
      key,
      sensitiveKeys.has(String(key).toLowerCase()) ? "<REDACTED>" : value,
    ])
  );
}

export function sanitizeValue(value, { mapKey = "" } = {}) {
  if (typeof value === "string") {
    return sanitizeUrl(value, { mapKey });
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, { mapKey }));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        /authorization|cookie|api[-_]?key|token/i.test(key)
          ? "<REDACTED>"
          : sanitizeValue(entryValue, { mapKey }),
      ])
    );
  }
  return value;
}

export function buildRawResponseArtifact(segment = {}, { mapKey = "" } = {}) {
  const rawText = typeof segment.rawText === "string" ? sanitizeValue(segment.rawText, { mapKey }) : "";
  const rawTextBytes = Buffer.byteLength(rawText, "utf8");
  const baseName = segment.fileName;
  if (rawTextBytes > rawLogSizeLimitBytes) {
    return {
      fileName: `${baseName}.gz`,
      buffer: zlib.gzipSync(Buffer.from(rawText, "utf8")),
      compressed: true,
      rawTextBytes,
    };
  }
  return {
    fileName: baseName,
    content: rawText,
    compressed: false,
    rawTextBytes,
  };
}
