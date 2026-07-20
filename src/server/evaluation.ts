export interface PeriodEvaluation {
  brierScore: number;
  logLoss: number;
  baselineBrierScore: number;
  baselineLogLoss: number;
  topKPrecision: number;
  topKRecall: number;
  topKHitAny: boolean;
  bottomKSafe: boolean;
  bottomKLeaks: number;
  randomPrecision: number;
  probabilityLabels: Array<{ probability: number; label: number }>;
}

export interface EvaluationSummary {
  periods: number;
  brierScore: number;
  baselineBrierScore: number;
  brierGain: number;
  logLoss: number;
  baselineLogLoss: number;
  logLossGain: number;
  topKPrecision: number;
  topKRecall: number;
  precisionLiftVsRandom: number;
  topKHitAnyRate: number;
  topKHitAny95CI: { lower: number; upper: number };
  bottomKSafeRate: number;
  calibrationError: number;
  beatsRandomBaseline: boolean;
}

export type AblationRecommendation = "disable_candidate" | "keep" | "insufficient_samples";

export interface WindowStabilitySummary {
  windows: number;
  periods: number;
  requiredWinningWindows: number;
  brierScore: number;
  baselineBrierScore: number;
  brierGain: number;
  logLoss: number;
  baselineLogLoss: number;
  logLossGain: number;
  topKPrecision: number;
  precisionLiftVsRandom: number;
  rankingWinningWindows: number;
  probabilityWinningWindows: number;
  rankingStable: boolean;
  probabilityStable: boolean;
  stableSignal: boolean;
  recommendation: "enable_signal_candidate" | "keep_low_signal";
}

export interface WatchHistoryRow {
  watchedZodiacs: string[];
  openedZodiacs: string[];
}

export interface WatchHistorySummary {
  periods: number;
  totalCandidates: number;
  openedCandidates: number;
  candidateOpenRate: number;
  anyOpenPeriods: number;
  anyOpenRate: number;
  fullyAvoidedPeriods: number;
  fullyAvoidedRate: number;
}

export function recommendAblation(
  periods: number,
  delta: { brierImprovement: number; logLossImprovement: number; precisionLiftChange: number },
  tolerance = 1e-9
): AblationRecommendation {
  if (periods < 20) return "insufficient_samples";
  const probabilityNotWorse = delta.brierImprovement >= -tolerance && delta.logLossImprovement >= -tolerance;
  const rankingNotWorse = delta.precisionLiftChange >= -tolerance;
  return probabilityNotWorse && rankingNotWorse ? "disable_candidate" : "keep";
}

export function aggregateWindowStability(windows: EvaluationSummary[]): WindowStabilitySummary {
  const windowCount = windows.length;
  const periods = windows.reduce((sum, window) => sum + window.periods, 0);
  const weightedAverage = (selector: (window: EvaluationSummary) => number): number =>
    periods > 0
      ? windows.reduce((sum, window) => sum + selector(window) * window.periods, 0) / periods
      : 0;
  const brierScore = weightedAverage(window => window.brierScore);
  const baselineBrierScore = weightedAverage(window => window.baselineBrierScore);
  const logLoss = weightedAverage(window => window.logLoss);
  const baselineLogLoss = weightedAverage(window => window.baselineLogLoss);
  const topKPrecision = weightedAverage(window => window.topKPrecision);
  const randomPrecision = weightedAverage(window =>
    window.precisionLiftVsRandom > 0 ? window.topKPrecision / window.precisionLiftVsRandom : 0
  );
  const precisionLiftVsRandom = randomPrecision > 0 ? topKPrecision / randomPrecision : 0;
  const brierGain = baselineBrierScore - brierScore;
  const logLossGain = baselineLogLoss - logLoss;
  const requiredWinningWindows = Math.ceil(windowCount * 2 / 3);
  const rankingWinningWindows = windows.filter(window => window.precisionLiftVsRandom > 1).length;
  const probabilityWinningWindows = windows.filter(window => window.brierGain > 0 && window.logLossGain > 0).length;
  const enoughWindows = windowCount >= 3;
  const rankingStable = enoughWindows
    && rankingWinningWindows >= requiredWinningWindows
    && precisionLiftVsRandom >= 1.05;
  const probabilityStable = enoughWindows
    && probabilityWinningWindows >= requiredWinningWindows
    && brierGain > 0
    && logLossGain > 0;
  const stableSignal = rankingStable && probabilityStable;

  return {
    windows: windowCount,
    periods,
    requiredWinningWindows,
    brierScore,
    baselineBrierScore,
    brierGain,
    logLoss,
    baselineLogLoss,
    logLossGain,
    topKPrecision,
    precisionLiftVsRandom,
    rankingWinningWindows,
    probabilityWinningWindows,
    rankingStable,
    probabilityStable,
    stableSignal,
    recommendation: stableSignal ? "enable_signal_candidate" : "keep_low_signal"
  };
}

export function summarizeWatchHistory(rows: WatchHistoryRow[]): WatchHistorySummary {
  const periods = rows.length;
  const totalCandidates = rows.reduce((sum, row) => sum + new Set(row.watchedZodiacs).size, 0);
  const openedCandidates = rows.reduce((sum, row) => sum + new Set(row.openedZodiacs).size, 0);
  const anyOpenPeriods = rows.filter(row => row.openedZodiacs.length > 0).length;
  const fullyAvoidedPeriods = periods - anyOpenPeriods;
  return {
    periods,
    totalCandidates,
    openedCandidates,
    candidateOpenRate: totalCandidates > 0 ? openedCandidates / totalCandidates : 0,
    anyOpenPeriods,
    anyOpenRate: periods > 0 ? anyOpenPeriods / periods : 0,
    fullyAvoidedPeriods,
    fullyAvoidedRate: periods > 0 ? fullyAvoidedPeriods / periods : 0
  };
}

const clampProbability = (value: number): number => Math.min(1 - 1e-9, Math.max(1e-9, value));

export function structuralZodiacProbabilities(
  numberToZodiac: Record<number, string>,
  zodiacOrder: string[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const z of zodiacOrder) counts[z] = 0;
  for (let n = 1; n <= 49; n++) {
    const zodiac = numberToZodiac[n];
    if (zodiac in counts) counts[zodiac]++;
  }

  const probabilities: Record<string, number> = {};
  for (const z of zodiacOrder) {
    const zodiacNumbers = counts[z];
    let noneProbability = 1;
    for (let draw = 0; draw < 7; draw++) {
      noneProbability *= (49 - zodiacNumbers - draw) / (49 - draw);
    }
    probabilities[z] = 1 - noneProbability;
  }
  return probabilities;
}

export function evaluatePeriod(
  probabilities: Record<string, number>,
  baselineProbabilities: Record<string, number>,
  actualZodiacs: Iterable<string>,
  zodiacOrder: string[],
  k = 3,
  rankingScores: Record<string, number> = probabilities
): PeriodEvaluation {
  const actual = new Set(actualZodiacs);
  const ranked = [...zodiacOrder].sort((a, b) => (rankingScores[b] ?? 0.5) - (rankingScores[a] ?? 0.5));
  const top = ranked.slice(0, k);
  const bottom = ranked.slice(-k);
  const topHits = top.filter(z => actual.has(z)).length;
  const bottomLeaks = bottom.filter(z => actual.has(z)).length;

  let brier = 0;
  let logLoss = 0;
  let baselineBrier = 0;
  let baselineLogLoss = 0;
  const probabilityLabels: Array<{ probability: number; label: number }> = [];

  for (const z of zodiacOrder) {
    const label = actual.has(z) ? 1 : 0;
    const probability = clampProbability(probabilities[z] ?? 0.5);
    const baseline = clampProbability(baselineProbabilities[z] ?? 0.5);
    brier += (probability - label) ** 2;
    baselineBrier += (baseline - label) ** 2;
    logLoss += -(label * Math.log(probability) + (1 - label) * Math.log(1 - probability));
    baselineLogLoss += -(label * Math.log(baseline) + (1 - label) * Math.log(1 - baseline));
    probabilityLabels.push({ probability, label });
  }

  const denominator = zodiacOrder.length || 1;
  return {
    brierScore: brier / denominator,
    logLoss: logLoss / denominator,
    baselineBrierScore: baselineBrier / denominator,
    baselineLogLoss: baselineLogLoss / denominator,
    topKPrecision: topHits / Math.max(1, top.length),
    topKRecall: topHits / Math.max(1, actual.size),
    topKHitAny: topHits > 0,
    bottomKSafe: bottomLeaks === 0,
    bottomKLeaks: bottomLeaks,
    randomPrecision: actual.size / denominator,
    probabilityLabels
  };
}

export function wilsonInterval(successes: number, total: number, z = 1.96): { lower: number; upper: number } {
  if (total <= 0) return { lower: 0, upper: 1 };
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p) / total) + (z * z) / (4 * total * total));
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

function expectedCalibrationError(items: Array<{ probability: number; label: number }>, bins = 10): number {
  if (items.length === 0) return 0;
  let error = 0;
  for (let bin = 0; bin < bins; bin++) {
    const lower = bin / bins;
    const upper = (bin + 1) / bins;
    const members = items.filter(item => item.probability >= lower && (bin === bins - 1 ? item.probability <= upper : item.probability < upper));
    if (members.length === 0) continue;
    const confidence = members.reduce((sum, item) => sum + item.probability, 0) / members.length;
    const accuracy = members.reduce((sum, item) => sum + item.label, 0) / members.length;
    error += (members.length / items.length) * Math.abs(confidence - accuracy);
  }
  return error;
}

export function aggregateEvaluations(rows: PeriodEvaluation[]): EvaluationSummary {
  const periods = rows.length;
  const average = (selector: (row: PeriodEvaluation) => number): number =>
    periods > 0 ? rows.reduce((sum, row) => sum + selector(row), 0) / periods : 0;
  const brierScore = average(row => row.brierScore);
  const baselineBrierScore = average(row => row.baselineBrierScore);
  const logLoss = average(row => row.logLoss);
  const baselineLogLoss = average(row => row.baselineLogLoss);
  const topKPrecision = average(row => row.topKPrecision);
  const randomPrecision = average(row => row.randomPrecision);
  const hitAnyCount = rows.filter(row => row.topKHitAny).length;
  const probabilityLabels = rows.flatMap(row => row.probabilityLabels);
  const precisionLiftVsRandom = randomPrecision > 0 ? topKPrecision / randomPrecision : 0;

  return {
    periods,
    brierScore,
    baselineBrierScore,
    brierGain: baselineBrierScore - brierScore,
    logLoss,
    baselineLogLoss,
    logLossGain: baselineLogLoss - logLoss,
    topKPrecision,
    topKRecall: average(row => row.topKRecall),
    precisionLiftVsRandom,
    topKHitAnyRate: periods > 0 ? hitAnyCount / periods : 0,
    topKHitAny95CI: wilsonInterval(hitAnyCount, periods),
    bottomKSafeRate: periods > 0 ? rows.filter(row => row.bottomKSafe).length / periods : 0,
    calibrationError: expectedCalibrationError(probabilityLabels),
    beatsRandomBaseline: brierScore < baselineBrierScore && logLoss < baselineLogLoss && precisionLiftVsRandom > 1
  };
}
