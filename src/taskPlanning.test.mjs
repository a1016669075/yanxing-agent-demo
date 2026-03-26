import test from "node:test";
import assert from "node:assert/strict";

import { buildPlanningMissionSnapshot } from "./taskPlanning.mjs";

test("规划模式会强调去云后有效区域和任务专用工作流", () => {
  const snapshot = buildPlanningMissionSnapshot({
    task: {
      label: "洪水 / 积水",
      statusLabel: "工具链待接入",
      dataSources: ["Sentinel-2 L2A", "Landsat 8/9", "云掩膜产品"],
      modelTools: ["水体分割模型", "变化检测工具链", "STAC + COG 资产读取"],
      cloudRule: "高分可见光链路必须先去云，再做局部变化检测与水体异常提取。",
    },
    scenario: {
      imagery: {
        sourceLabel: "VIIRS NOAA-21 真彩色",
      },
    },
    gate: {
      label: "需先去云再进入反演",
      validPixelRatio: 0.62,
    },
    options: {
      budgetMin: 7,
    },
    focusScaleLabel: "区域尺度",
  });

  assert.equal(snapshot.steps.length, 4);
  assert.match(snapshot.steps[1].detail, /去云/);
  assert.match(snapshot.metrics[3].strong, /62%/);
});
