import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateEvaluations,
  aggregateWindowStability,
  evaluatePeriod,
  recommendAblation,
  structuralZodiacProbabilities,
  summarizeWatchHistory,
  wilsonInterval
} from "../src/server/evaluation.js";
import {
  assessWatchSeparation,
  buildDecisionTiers,
  chooseAdaptiveHistoryWindow,
  filterDisabledFeatureGroups,
  MachineLearningPredictionModel,
  TSProbabilityCalibrator
} from "../src/server/mlEngine.js";
import { computeRegimeSimilarity, computeRegimeState, regimeDistance } from "../src/server/regime.js";
import { ZodiacPatternAnalyzer } from "../src/server/zodiacAnalyzer.js";

const zodiacs = ["马", "蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊"];

test("history tuning uses the validated 75-period default", () => {
  assert.equal(MachineLearningPredictionModel.DEFAULT_HISTORY_WINDOW, 75);
});

test("adaptive history selection requires a material past-only lift", () => {
  const baseAudit = {
    periods: 75,
    validationPeriods: 15,
    top3Precision: 0.5,
    randomPrecision: 0.48,
    precisionLift: 1.04,
    firstHalfLift: 1.02,
    secondHalfLift: 1.06,
    brierScore: 0.249,
    baselineBrier: 0.25,
    logLoss: 0.691,
    baselineLogLoss: 0.693
  };
  const selected = chooseAdaptiveHistoryWindow([
    { ...baseAudit, window: 75 },
    { ...baseAudit, window: 60, precisionLift: 1.09, firstHalfLift: 1.05, secondHalfLift: 1.1 }
  ]);
  assert.equal(selected.selectedWindow, 60);
  assert.equal(selected.stable, true);

  const marginal = chooseAdaptiveHistoryWindow([
    { ...baseAudit, window: 75 },
    { ...baseAudit, window: 90, precisionLift: 1.06 }
  ]);
  assert.equal(marginal.selectedWindow, 75);
});

test("Platt calibration stays monotonic after fitting", () => {
  const probabilities = [0.15, 0.25, 0.4, 0.6, 0.75, 0.85];
  const params = TSProbabilityCalibrator.plattScaling(probabilities, [0, 0, 0, 1, 1, 1]);
  const calibrated = probabilities.map(probability => TSProbabilityCalibrator.calibratePlatt(probability, params));
  assert.ok(params.A > 0);
  for (let index = 1; index < calibrated.length; index++) {
    assert.ok(calibrated[index] > calibrated[index - 1]);
  }
});

test("freshness resampling derives the latest year from the supplied dataset", () => {
  const records = Array.from({ length: 12 }, (_, index) => ({
    issue: index + 1,
    archive_year: 2022,
    date: `2022-01-${String(index + 1).padStart(2, "0")}`,
    numbers: [1, 2, 3, 4, 5, 6, 7]
  }));
  assert.equal(ZodiacPatternAnalyzer.resampleRecords(records, 1).length, records.length);
});

test("structural probabilities account for the zodiac with five numbers", () => {
  const numberMap: Record<number, string> = {};
  for (let n = 1; n <= 49; n++) numberMap[n] = zodiacs[(n - 1) % 12];
  const probabilities = structuralZodiacProbabilities(numberMap, zodiacs);
  assert.ok(probabilities["马"] > probabilities["蛇"]);
  assert.ok(probabilities["马"] > 0 && probabilities["马"] < 1);
});

test("perfect ranking beats the structural random baseline", () => {
  const actual = new Set(["马", "蛇", "龙"]);
  const probabilities = Object.fromEntries(zodiacs.map(z => [z, actual.has(z) ? 0.9 : 0.1]));
  const baseline = Object.fromEntries(zodiacs.map(z => [z, 0.5]));
  const row = evaluatePeriod(probabilities, baseline, actual, zodiacs, 3);
  const summary = aggregateEvaluations([row]);
  assert.equal(row.topKPrecision, 1);
  assert.equal(row.topKRecall, 1);
  assert.ok(summary.brierGain > 0);
  assert.ok(summary.logLossGain > 0);
  assert.equal(summary.beatsRandomBaseline, true);
});

test("Wilson interval is bounded and contains the observed rate", () => {
  const interval = wilsonInterval(8, 10);
  assert.ok(interval.lower >= 0 && interval.upper <= 1);
  assert.ok(interval.lower < 0.8 && interval.upper > 0.8);
});

test("feature ablation removes base, polynomial, rolling and interaction descendants", () => {
  const features = [
    "omission",
    "omission_sq",
    "omission_x_calibrated_rate",
    "score_roll_max_w5",
    "f2_combo_veto",
    "f5_recovery_rate",
    "bayes_open_prob"
  ];
  const filtered = filterDisabledFeatureGroups(features, ["state", "f5"]);
  assert.deepEqual(filtered, ["score_roll_max_w5", "f2_combo_veto", "bayes_open_prob"]);
  assert.deepEqual(filterDisabledFeatureGroups(features, []), features);
});

test("feature ablation keeps a group when probability is tied but ranking gets worse", () => {
  assert.equal(recommendAblation(20, {
    brierImprovement: 0,
    logLossImprovement: 0,
    precisionLiftChange: -0.03
  }), "keep");

  assert.equal(recommendAblation(20, {
    brierImprovement: 0,
    logLossImprovement: 0,
    precisionLiftChange: 0
  }), "disable_candidate");

  assert.equal(recommendAblation(19, {
    brierImprovement: 1,
    logLossImprovement: 1,
    precisionLiftChange: 1
  }), "insufficient_samples");
});

test("walk-forward stability requires repeatable probability and ranking gains", () => {
  const window = {
    periods: 20,
    brierScore: 0.22,
    baselineBrierScore: 0.25,
    brierGain: 0.03,
    logLoss: 0.64,
    baselineLogLoss: 0.69,
    logLossGain: 0.05,
    topKPrecision: 0.55,
    topKRecall: 0.3,
    precisionLiftVsRandom: 1.15,
    topKHitAnyRate: 0.9,
    topKHitAny95CI: { lower: 0.7, upper: 0.98 },
    bottomKSafeRate: 0.2,
    calibrationError: 0.02,
    beatsRandomBaseline: true
  };
  const stable = aggregateWindowStability([window, window, window]);
  assert.equal(stable.stableSignal, true);
  assert.equal(stable.recommendation, "enable_signal_candidate");

  const protectedWindow = {
    ...window,
    brierScore: window.baselineBrierScore,
    brierGain: 0,
    logLoss: window.baselineLogLoss,
    logLossGain: 0,
    precisionLiftVsRandom: 1.02,
    beatsRandomBaseline: false
  };
  const unstable = aggregateWindowStability([protectedWindow, protectedWindow, protectedWindow]);
  assert.equal(unstable.probabilityStable, false);
  assert.equal(unstable.rankingStable, false);
  assert.equal(unstable.recommendation, "keep_low_signal");
});

test("regime state uses normalized repetition and deterministic past neighbors", () => {
  const matrix = Array.from({ length: 45 }, (_, index) => [
    zodiacs[index % 12],
    zodiacs[(index + 1) % 12],
    zodiacs[(index + 3) % 12],
    zodiacs[(index + 5) % 12],
    zodiacs[(index + 7) % 12]
  ]);
  const state = computeRegimeState(matrix);
  assert.ok(state.repeatRate >= 0 && state.repeatRate <= 1);
  assert.equal(regimeDistance(state, state), 0);

  const first = computeRegimeSimilarity(matrix, zodiacs);
  const second = computeRegimeSimilarity(matrix, zodiacs);
  assert.deepEqual(first, second);
  assert.ok(Math.abs(first.state.averageDiversity - state.averageDiversity) < 1e-12);
  assert.ok(Math.abs(first.state.repeatRate - state.repeatRate) < 1e-12);
  assert.ok(Math.abs(first.state.diversityVolatility - state.diversityVolatility) < 1e-12);
  assert.ok(Math.abs(first.state.concentration - state.concentration) < 1e-12);
  assert.ok(first.neighborCount > 0 && first.neighborCount <= 30);
  assert.ok(first.confidence >= 0 && first.confidence <= 1);
  for (const zodiac of zodiacs) {
    assert.ok(first.openRates[zodiac] > 0 && first.openRates[zodiac] < 1);
  }
});

test("regime feature ablation removes all similarity descendants", () => {
  const features = [
    "regime_similarity_open_rate",
    "regime_similarity_open_rate_sq",
    "regime_similarity_lift_x_omission",
    "calibrated_rate"
  ];
  assert.deepEqual(filterDisabledFeatureGroups(features, ["regime"]), ["calibrated_rate"]);
});

test("low-signal tiers expose watch candidates without creating kill recommendations", () => {
  const ranked = zodiacs.slice();
  const protectedTiers = buildDecisionTiers(ranked, false);
  assert.deepEqual(protectedTiers.tierHot, ranked.slice(0, 3));
  assert.deepEqual(protectedTiers.tierMid, ranked.slice(3, 9));
  assert.deepEqual(protectedTiers.tierKill, []);
  assert.deepEqual(protectedTiers.tierWatch, ranked.slice(9, 12));
  assert.ok(protectedTiers.tierWatch.every(zodiac => !protectedTiers.tierMid.includes(zodiac)));
  assert.deepEqual(protectedTiers.tierWatchCandidates, ranked.slice(9, 12));

  const suppressedTiers = buildDecisionTiers(ranked, false, false);
  assert.deepEqual(suppressedTiers.tierWatch, []);
  assert.deepEqual(suppressedTiers.tierWatchCandidates, ranked.slice(9, 12));

  const activeTiers = buildDecisionTiers(ranked, true);
  assert.deepEqual(activeTiers.tierKill, ranked.slice(9, 12));
  assert.deepEqual(activeTiers.tierWatch, []);
  assert.deepEqual(activeTiers.tierWatchCandidates, []);
});

test("watch separation rejects false ties and keeps an unvalidated clear boundary hidden", () => {
  const tiedProbabilities = Object.fromEntries(zodiacs.map((zodiac, index) => [zodiac, index < 9 ? 0.55 : 0.45]));
  const tied = assessWatchSeparation(zodiacs, tiedProbabilities);
  assert.equal(tied.boundaryTied, false);
  assert.equal(tied.numericalSeparation, true);
  assert.equal(tied.historicalValidationPassed, false);
  assert.equal(tied.meaningfulSeparation, false);
  assert.match(tied.reason, /历史同类样本/);
  assert.ok(tied.boundaryGap >= 9.99);

  const falseTieProbabilities = Object.fromEntries(zodiacs.map((zodiac, index) => [zodiac, 0.55 - index * 0.00001]));
  const falseTie = assessWatchSeparation(zodiacs, falseTieProbabilities);
  assert.equal(falseTie.boundaryTied, true);
  assert.equal(falseTie.meaningfulSeparation, false);
  assert.match(falseTie.reason, /并列/);
});

test("watch history summary counts unique candidates and periods with leaks", () => {
  const summary = summarizeWatchHistory([
    { watchedZodiacs: ["鼠", "牛", "虎"], openedZodiacs: ["鼠"] },
    { watchedZodiacs: ["兔", "龙", "蛇"], openedZodiacs: [] },
    { watchedZodiacs: ["马", "羊", "猴"], openedZodiacs: ["马", "猴", "猴"] }
  ]);
  assert.equal(summary.periods, 3);
  assert.equal(summary.totalCandidates, 9);
  assert.equal(summary.openedCandidates, 3);
  assert.equal(summary.anyOpenPeriods, 2);
  assert.equal(summary.fullyAvoidedPeriods, 1);
  assert.equal(summary.candidateOpenRate, 1 / 3);
  assert.equal(summary.anyOpenRate, 2 / 3);
});
