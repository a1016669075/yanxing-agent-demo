export const PRECOMPUTE_QUEUE_KEY = "sat-atmo-agent-precompute-queue";

function stableJobKey(spec) {
  return [
    spec.artifactType,
    spec.sceneId,
    spec.dateValue,
    String(spec.zoom ?? ""),
    spec.modelId || "",
  ].join("|");
}

function makeJobId(key, createdAt) {
  return `job-${createdAt}-${key.replace(/[^a-z0-9|_-]/gi, "").replace(/\|/g, "-")}`;
}

export function normalizeJobSpec(spec = {}) {
  return {
    artifactType: spec.artifactType || "json-tiles",
    sceneId: spec.sceneId || "unknown-scene",
    dateValue: spec.dateValue || "unknown-date",
    zoom: Number(spec.zoom) || 0,
    modelId: spec.modelId || "unknown-model",
  };
}

export function enqueuePrecomputeJob(queue, rawSpec, createdAt = Date.now()) {
  const spec = normalizeJobSpec(rawSpec);
  const key = stableJobKey(spec);
  const existing = queue.find((job) => job.key === key && job.status !== "failed");

  if (existing) {
    return {
      queue,
      job: existing,
      created: false,
    };
  }

  const job = {
    id: makeJobId(key, createdAt),
    key,
    status: "queued",
    attempts: 0,
    createdAt,
    updatedAt: createdAt,
    spec,
    result: null,
    error: null,
  };

  return {
    queue: [job, ...queue].slice(0, 24),
    job,
    created: true,
  };
}

export function startNextPrecomputeJob(queue, startedAt = Date.now()) {
  const target = queue.find((job) => job.status === "queued");
  if (!target) {
    return { queue, job: null };
  }

  return {
    queue: queue.map((job) =>
      job.id === target.id
        ? {
            ...job,
            status: "running",
            attempts: job.attempts + 1,
            updatedAt: startedAt,
          }
        : job
    ),
    job: {
      ...target,
      status: "running",
      attempts: target.attempts + 1,
      updatedAt: startedAt,
    },
  };
}

export function completePrecomputeJob(queue, jobId, result, completedAt = Date.now()) {
  return queue.map((job) =>
    job.id === jobId
      ? {
          ...job,
          status: "done",
          updatedAt: completedAt,
          result,
          error: null,
        }
      : job
  );
}

export function failPrecomputeJob(queue, jobId, message, failedAt = Date.now()) {
  return queue.map((job) =>
    job.id === jobId
      ? {
          ...job,
          status: "failed",
          updatedAt: failedAt,
          error: message,
        }
      : job
  );
}

export function retryPrecomputeJob(queue, jobId, retriedAt = Date.now()) {
  return queue.map((job) =>
    job.id === jobId
      ? {
          ...job,
          status: "queued",
          updatedAt: retriedAt,
          error: null,
        }
      : job
  );
}

export function summarizePrecomputeQueue(queue = []) {
  return queue.reduce(
    (summary, job) => {
      summary.total += 1;
      summary.byStatus[job.status] = (summary.byStatus[job.status] || 0) + 1;
      summary.latest = !summary.latest || job.updatedAt > summary.latest.updatedAt ? job : summary.latest;
      return summary;
    },
    {
      total: 0,
      byStatus: {
        queued: 0,
        running: 0,
        done: 0,
        failed: 0,
      },
      latest: null,
    }
  );
}
