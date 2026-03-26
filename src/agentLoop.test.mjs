import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentLoopSnapshot } from "./agentLoop.mjs";

test("agent loop emphasizes planning mode for tasks that are not yet fully wired", () => {
  const snapshot = buildAgentLoopSnapshot({
    task: {
      label: "洪水 / 积水",
      status: "adapting",
    },
    scenario: {
      title: "珠江三角洲区域",
      imagery: {
        sourceLabel: "VIIRS NOAA-21 真彩色",
      },
      analysis: {
        sourceLabel: "AOD 异常先验",
      },
    },
    gate: {
      label: "需先去云再进入推理",
    },
    model: {
      label: "水体分割模型 / 变化检测工具链",
    },
    plan: {
      steps: ["数据发现", "去云与质量门禁", "模型与工具组织"],
    },
    options: {
      budgetMin: 7,
    },
  });

  assert.equal(snapshot.mode, "planning");
  assert.equal(snapshot.stages.length, 4);
  assert.equal(snapshot.stages[1].state, "planned");
  assert.match(snapshot.stages[2].detail, /7/);
});

test("agent loop reflects operational success and writes back memory-oriented feedback", () => {
  const snapshot = buildAgentLoopSnapshot({
    task: {
      label: "沙尘异常",
      status: "ready",
    },
    scenario: {
      title: "河西走廊沙尘任务",
      imagery: {
        sourceLabel: "VIIRS NOAA-21 真彩色",
      },
      analysis: {
        sourceLabel: "MODIS Terra AOD 3km",
      },
    },
    gate: {
      label: "允许进入定量反演",
    },
    model: {
      label: "本地连续反演模型",
    },
    plan: {
      steps: ["cloud_mask", "hotspot_retrieval", "quality_check"],
    },
    report: {
      mode: "operational",
      agentResult: {
        success: true,
        metrics: {
          confidence: 88,
        },
        state: {
          repairs: ["cloud_mask"],
          outputProduct: "quantitative-retrieval",
        },
      },
    },
    options: {
      budgetMin: 6,
    },
  });

  assert.equal(snapshot.mode, "operational");
  assert.equal(snapshot.stages[2].state, "success");
  assert.match(snapshot.stages[3].detail, /88/);
});
