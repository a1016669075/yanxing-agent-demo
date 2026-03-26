import test from "node:test";
import assert from "node:assert/strict";

import {
  completePrecomputeJob,
  enqueuePrecomputeJob,
  retryPrecomputeJob,
  startNextPrecomputeJob,
  summarizePrecomputeQueue,
} from "./asyncPrecomputeQueue.mjs";

test("相同规格的预计算任务会保持幂等", () => {
  const first = enqueuePrecomputeJob([], {
    artifactType: "json-tiles",
    sceneId: "urban-plume",
    dateValue: "2026-03-24",
    zoom: 6,
    modelId: "local-aod-inversion-net",
  });
  const second = enqueuePrecomputeJob(first.queue, first.job.spec);

  assert.equal(first.queue.length, 1);
  assert.equal(second.queue.length, 1);
  assert.equal(second.created, false);
});

test("任务可启动、完成并进入 done 状态", () => {
  const queued = enqueuePrecomputeJob([], {
    artifactType: "json-tiles",
    sceneId: "urban-plume",
    dateValue: "2026-03-24",
    zoom: 6,
    modelId: "local-aod-inversion-net",
  });
  const running = startNextPrecomputeJob(queued.queue);
  const completed = completePrecomputeJob(running.queue, running.job.id, { tileCount: 4 });
  const summary = summarizePrecomputeQueue(completed);

  assert.equal(summary.byStatus.done, 1);
});

test("失败任务可以重新进入 queued", () => {
  const queued = enqueuePrecomputeJob([], {
    artifactType: "json-tiles",
    sceneId: "urban-plume",
    dateValue: "2026-03-24",
    zoom: 6,
    modelId: "local-aod-inversion-net",
  });
  const retried = retryPrecomputeJob(
    queued.queue.map((job) => ({ ...job, status: "failed", error: "network" })),
    queued.job.id
  );

  assert.equal(retried[0].status, "queued");
  assert.equal(retried[0].error, null);
});
