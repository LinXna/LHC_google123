import test from "node:test";
import assert from "node:assert/strict";
import { FeatureRepository } from "../src/server/features.js";
import { TSLogisticRegression, setMLRandomSeed, type MLSample } from "../src/server/mlEngine.js";
import { getDatasetSignature, getPeriodId } from "../src/server/periodKey.js";
import { ZodiacPatternAnalyzer } from "../src/server/zodiacAnalyzer.js";
import type { LotteryRecord } from "../src/types.js";

const record = (year: number, issue: number, numbers = [1, 2, 3, 4, 5, 6, 7]): LotteryRecord => ({
  issue,
  date: `${year}-01-01`,
  archive_year: year,
  numbers
});

test("period id is unique and chronologically sortable across years", () => {
  const y2025 = getPeriodId(record(2025, 1));
  const y2026 = getPeriodId(record(2026, 1));
  assert.notEqual(y2025, y2026);
  assert.ok(y2025 < y2026);
  assert.equal(y2026, 2026001);
});

test("feature repository does not mix identical raw issue numbers from different years", () => {
  const repo = new FeatureRepository();
  repo.addFeatures([
    { featureName: "density", value: 1, zodiac: "马", issue: 1, periodId: 2025001 },
    { featureName: "density", value: 4, zodiac: "马", issue: 1, periodId: 2026001 }
  ]);

  assert.equal(repo.getFeatureValue(2025001, "马", "density"), 1);
  assert.equal(repo.getFeatureValue(2026001, "马", "density"), 4);
});

test("dataset signature changes when historical content changes", () => {
  const a = [record(2026, 1)];
  const b = [record(2026, 1, [1, 2, 3, 4, 5, 6, 8])];
  assert.notEqual(getDatasetSignature(a), getDatasetSignature(b));
});

test("F7 rules describe next-period association instead of same-period implication", () => {
  const matrix = Array.from({ length: 20 }, (_, index) => index % 2 === 0 ? ["马", "蛇"] : ["龙"]);
  const patterns = ZodiacPatternAnalyzer.mineFrequentPatterns(matrix, 0.2, 0.8);
  const pair = patterns.find(p => p.items.includes("马") && p.items.includes("蛇") && p.items.length === 2);
  assert.ok(pair);
  assert.ok(pair.rules.some(rule => rule.rhs === "龙" && rule.confidence === 1));
});

test("ML initialization is reproducible with a fixed seed", () => {
  const samples: MLSample[] = [
    { period: 1, zodiac: "马", label: 1, features: { x: 1 } },
    { period: 2, zodiac: "蛇", label: 0, features: { x: 0 } }
  ];

  setMLRandomSeed(42);
  const first = new TSLogisticRegression(0.1, 0, 0, 5);
  first.fit(samples, ["x"]);

  setMLRandomSeed(42);
  const second = new TSLogisticRegression(0.1, 0, 0, 5);
  second.fit(samples, ["x"]);

  assert.deepEqual(first.weights, second.weights);
  assert.equal(first.bias, second.bias);
});
