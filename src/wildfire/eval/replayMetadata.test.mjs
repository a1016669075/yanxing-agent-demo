import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRawResponseArtifact,
  rawLogSizeLimitBytes,
  sanitizeHeaders,
  sanitizeUrl,
  withArtifactMetadata,
} from "./replayMetadata.mjs";

test("sanitizeUrl redacts FIRMS map key and query params", () => {
  const sanitized = sanitizeUrl(
    "https://firms.modaps.eosdis.nasa.gov/api/area/csv/SECRETKEY/VIIRS_SNPP_NRT/1,2,3,4/1?foo=bar",
    { mapKey: "SECRETKEY" }
  );

  assert.equal(sanitized.includes("SECRETKEY"), false);
  assert.equal(sanitized.includes("<REDACTED_MAP_KEY>"), true);
  assert.equal(sanitized.includes("foo=%3CREDACTED%3E") || sanitized.includes("foo=<REDACTED>"), true);
});

test("sanitizeHeaders redacts sensitive headers", () => {
  const headers = sanitizeHeaders({
    Authorization: "Bearer x",
    "x-api-key": "abc",
    Accept: "text/csv",
  });

  assert.equal(headers.Authorization, "<REDACTED>");
  assert.equal(headers["x-api-key"], "<REDACTED>");
  assert.equal(headers.Accept, "text/csv");
});

test("buildRawResponseArtifact compresses oversized raw text", () => {
  const artifact = buildRawResponseArtifact(
    {
      fileName: "raw_response.csv",
      rawText: "x".repeat(rawLogSizeLimitBytes + 1024),
    },
    { mapKey: "" }
  );

  assert.equal(artifact.fileName, "raw_response.csv.gz");
  assert.equal(Boolean(artifact.buffer), true);
  assert.equal(artifact.compressed, true);
});

test("withArtifactMetadata wraps arrays into metadata envelope", () => {
  const wrapped = withArtifactMetadata([{ ok: true }], { runner_version: "v" });
  assert.equal(wrapped.metadata.runner_version, "v");
  assert.equal(Array.isArray(wrapped.entries), true);
});
