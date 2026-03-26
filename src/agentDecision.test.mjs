import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgentDecisionSnapshot,
  buildDecisionMemoryCueSummary,
  buildSpatialStrategy,
} from "./agentDecision.mjs";

const scenario = {
  type: "dust",
  title: "Global dust mission",
  mission: "Prioritize likely dust hotspots inside the selected region.",
  sensor: "VIIRS / MODIS global context chain",
  rois: [{ id: "R1" }, { id: "R2" }, { id: "R3" }, { id: "R4" }],
  anomalyDensity: 0.18,
  imagery: {
    sourceLabel: "VIIRS NOAA-21 true color",
  },
  analysis: {
    sourceLabel: "MODIS Terra AOD 3km",
  },
  focusSelection: {
    scaleLabel: "Regional scale",
    strategyText: "Screen with mid-low resolution first, then refine only the key subregions.",
  },
};

test("global focus strategy prefers focusSelection guidance", () => {
  const strategy = buildSpatialStrategy(scenario);
  assert.equal(strategy.title, "Regional scale");
  assert.match(strategy.detail, /mid-low resolution/i);
});

test("decision snapshot highlights valid-area gating and the main workflow", () => {
  const snapshot = buildAgentDecisionSnapshot({
    scenario,
    options: {
      budgetMin: 6,
      downlinkPolicy: "focused",
    },
    gate: {
      state: "warn",
      label: "Need cloud removal before inversion",
      recommendedAction: "Cloud contamination is elevated, so cloud masking should run first.",
    },
    plan: {
      workflowLabel: "Dust priority retrieval flow",
      steps: ["Read scene", "Quality gate", "Detect anomalies", "Prioritize ROIs"],
    },
    model: {
      label: "Local continuous inversion network",
      description: "Prototype continuous retrieval model.",
      runtimeStatus: {
        label: "Local weights ready",
      },
    },
    report: null,
    memoryCue: {
      strong: "Recent 2 similar cases",
      detail: "Regional case · Continuous retrieval · 79% confidence · Similar scenes already succeeded before.",
    },
    labels: {
      typeLabel: () => "Dust task",
      downlinkLabel: (value) => value,
      productLabel: (value) => value,
    },
  });

  assert.equal(snapshot.cards.length, 7);
  assert.equal(snapshot.cards[6].title, "经验回写");
  assert.match(snapshot.cards[2].detail, /valid area|去云后/i);
  assert.match(snapshot.cards[3].detail, /Read scene/);
  assert.match(snapshot.cards[6].detail, /Continuous retrieval|Continuous/i);
  assert.match(snapshot.note.detail, /6|预算/);
});

test("planning reports do not require agentResult", () => {
  const snapshot = buildAgentDecisionSnapshot({
    scenario,
    options: {
      budgetMin: 8,
      downlinkPolicy: "focused",
    },
    gate: {
      state: "ready",
      label: "Planning can proceed",
      recommendedAction: "Current conditions support planning mode output.",
    },
    plan: {
      workflowLabel: "Planning mode mission chain",
      steps: [{ title: "Data discovery" }, { title: "Cloud and quality gate" }, { title: "Result packaging" }],
    },
    model: {
      label: "Planning toolchain",
      description: "Planning-oriented route only.",
      runtimeStatus: {
        label: "Planning mode",
      },
    },
    report: {
      mode: "planning",
      planning: {
        steps: [{ title: "Data discovery" }, { title: "Cloud and quality gate" }, { title: "Result packaging" }],
      },
    },
    memoryCue: null,
  });

  assert.match(snapshot.note.detail, /求解方案|规划步骤/);
  assert.match(snapshot.note.detail, /3/);
});

test("memory cue summary explains how the current strategy differs from past cases", () => {
  const cue = buildDecisionMemoryCueSummary({
    episodes: [
      {
        scenarioTitle: "Regional case",
        outputProduct: "quantitative-retrieval",
        confidence: 79,
        insight: "The last similar case completed continuous retrieval successfully.",
        options: {
          budgetMin: 8,
          downlinkPolicy: "balanced",
        },
        workflow: {
          label: "Historic continuous retrieval flow",
        },
        focusSelection: {
          label: "Regional case",
          scaleLabel: "Regional scale",
        },
      },
    ],
    scenario: {
      focusSelection: {
        scaleLabel: "Local scale",
      },
    },
    options: {
      budgetMin: 6,
      downlinkPolicy: "focused",
    },
    plan: {
      workflowLabel: "Current fast retrieval flow",
    },
    labels: {
      productLabel: (value) => (value === "quantitative-retrieval" ? "Continuous retrieval" : value),
      downlinkLabel: (value) => value,
    },
  });

  assert.equal(cue.strong, "最近 1 个相似案例");
  assert.match(cue.detail, /Continuous retrieval/);
  assert.match(cue.detail, /budget|2/);
  assert.match(cue.detail, /Historic continuous retrieval flow/);
});
