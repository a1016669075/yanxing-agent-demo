import test from "node:test";
import assert from "node:assert/strict";

import { capabilityForTask, getTaskById, summarizeTaskCatalog, taskCatalog } from "./taskCatalog.mjs";

test("任务目录摘要能统计 ready / adapting / planned 和数据能力规模", () => {
  const summary = summarizeTaskCatalog(taskCatalog);
  assert.equal(summary.total >= 8, true);
  assert.equal(summary.ready >= 3, true);
  assert.equal(summary.dataSourceCount >= 8, true);
  assert.equal(summary.modelToolCount >= 8, true);
});

test("可以按 id 读取任务能力", () => {
  const task = getTaskById("dust");
  assert.equal(task?.label, "沙尘异常");
  assert.equal(task?.status, "ready");
});

test("森林火任务已经提升为可运行状态", () => {
  const task = getTaskById("wildfire");
  assert.equal(task?.status, "ready");
  assert.match(task?.note || "", /热点确认闭环/);
});

test("局地尺度下的任务建议会偏向精细处理", () => {
  const capability = capabilityForTask("pollution", "local");
  assert.equal(capability?.supportedAtScale, true);
  assert.match(capability?.recommendedStrategy || "", /高分辨率|局部精细/);
});

test("未覆盖尺度会被明确标记为不支持", () => {
  const capability = capabilityForTask("building-damage", "global");
  assert.equal(capability?.supportedAtScale, false);
});
