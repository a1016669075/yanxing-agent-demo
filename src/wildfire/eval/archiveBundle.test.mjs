import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildArchiveSourceLogs, loadArchiveBundleManifest, loadArchiveCasePayloads } from "./archiveBundle.mjs";

const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__", "archiveBundle");

test("archive bundle loader reads manifest contract and source payloads", async () => {
  const manifest = await loadArchiveBundleManifest(fixtureDir);

  assert.equal(manifest.length, 2);
  assert.equal(manifest[0].time_semantics, "archive_sp");
  assert.equal(manifest[0].expectedPositive, true);
  assert.equal(manifest[1].case_type, "empty");

  const positivePayloads = await loadArchiveCasePayloads(fixtureDir, manifest[0]);
  assert.equal(positivePayloads.length, 1);
  assert.equal(positivePayloads[0].segments[0].product, "VIIRS_SNPP_SP");
  assert.equal(positivePayloads[0].segments[0].rows.length, 2);

  const emptyPayloads = await loadArchiveCasePayloads(fixtureDir, manifest[1]);
  assert.equal(emptyPayloads.length, 1);
  assert.equal(emptyPayloads[0].segments[0].rows.length, 0);
});

test("archive source logs expose local-ingest accounting without fabricating network calls", async () => {
  const manifest = await loadArchiveBundleManifest(fixtureDir);
  const logs = await buildArchiveSourceLogs(fixtureDir, manifest[0]);

  assert.equal(logs.requestLog.length, 1);
  assert.equal(logs.responseLog.length, 1);
  assert.equal(logs.transactionBudget.requestCount, 1);
  assert.equal(logs.transactionBudget.errorCount, 0);
  assert.ok(logs.transactionBudget.totalResponseBytes > 0);
});
