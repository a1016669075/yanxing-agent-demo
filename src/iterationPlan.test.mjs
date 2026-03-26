import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPhaseGroups,
  getCurrentIterationModule,
  getNextIterationModules,
  iterationModules,
  summarizeIterationPlan,
  validateIterationPlan,
} from "./iterationPlan.mjs";

test("iteration plan passes base validation rules", () => {
  const validation = validateIterationPlan();
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

test("current module is the offline eval harness", () => {
  const current = getCurrentIterationModule();
  assert.ok(current);
  assert.equal(current.id, "offline-eval-harness");
});

test("next queued modules follow the current roadmap order", () => {
  const nextModules = getNextIterationModules(3);
  assert.equal(nextModules.length, 0);
  assert.deepEqual(nextModules.map((module) => module.id), []);
});

test("phase counts match the total module count", () => {
  const summary = summarizeIterationPlan();
  const phaseGroups = buildPhaseGroups();

  assert.equal(summary.total, iterationModules.length);
  assert.equal(
    phaseGroups.reduce((total, phase) => total + phase.counts.total, 0),
    iterationModules.length
  );
  assert.equal(phaseGroups[0].modules[0].id, "roi-schema-validation");
});

test("validation catches duplicate ids and multiple current modules", () => {
  const brokenModules = [
    ...iterationModules,
    {
      ...iterationModules[0],
      title: "duplicate-module",
      status: "current",
    },
  ];

  const validation = validateIterationPlan(brokenModules);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((message) => message.includes("id")));
  assert.ok(validation.errors.length >= 2);
});
