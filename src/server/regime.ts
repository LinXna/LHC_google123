export interface RegimeState {
  averageDiversity: number;
  repeatRate: number;
  diversityVolatility: number;
  concentration: number;
}

export interface RegimeSimilarityResult {
  state: RegimeState;
  regime: string;
  openRates: Record<string, number>;
  lifts: Record<string, number>;
  confidence: number;
  neighborCount: number;
}

const emptyState = (): RegimeState => ({
  averageDiversity: 0,
  repeatRate: 0,
  diversityVolatility: 0,
  concentration: 0
});

export function computeRegimeState(matrix: string[][], endExclusive = matrix.length, windowSize = 12): RegimeState {
  const end = Math.max(0, Math.min(matrix.length, endExclusive));
  const start = Math.max(0, end - windowSize);
  const rows = matrix.slice(start, end).map(row => new Set(row.filter(zodiac => zodiac !== "未知")));
  if (rows.length === 0) return emptyState();

  const diversities = rows.map(row => row.size);
  const averageDiversity = diversities.reduce((sum, value) => sum + value, 0) / diversities.length;
  const variance = diversities.reduce((sum, value) => sum + (value - averageDiversity) ** 2, 0) / diversities.length;

  let repeatTotal = 0;
  let repeatDenominator = 0;
  for (let i = 1; i < rows.length; i++) {
    for (const zodiac of rows[i]) {
      if (rows[i - 1].has(zodiac)) repeatTotal++;
    }
    repeatDenominator += rows[i].size;
  }

  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const zodiac of row) counts[zodiac] = (counts[zodiac] || 0) + 1;
  }
  const concentration = Math.max(0, ...Object.values(counts)) / rows.length;

  return {
    averageDiversity,
    repeatRate: repeatDenominator > 0 ? repeatTotal / repeatDenominator : 0,
    diversityVolatility: Math.sqrt(variance),
    concentration
  };
}

export function classifyRegimeState(state: RegimeState): string {
  if (state.averageDiversity < 4.2) return "Sparse";
  if (state.diversityVolatility >= 1.0) return "Burst";
  if (state.repeatRate >= 0.62 && state.concentration >= 0.75) return "Hot";
  if (state.averageDiversity >= 5.5 && state.repeatRate <= 0.42) return "Dense";
  if (state.repeatRate <= 0.35) return "Cold";
  return "Random";
}

export function regimeDistance(a: RegimeState, b: RegimeState): number {
  const components = [
    (a.averageDiversity - b.averageDiversity) / 2,
    (a.repeatRate - b.repeatRate) / 0.3,
    (a.diversityVolatility - b.diversityVolatility) / 0.8,
    (a.concentration - b.concentration) / 0.3
  ];
  return Math.sqrt(components.reduce((sum, value) => sum + value * value, 0) / components.length);
}

export function computeRegimeSimilarity(
  matrix: string[][],
  zodiacOrder: string[],
  windowSize = 12,
  maxNeighbors = 30
): RegimeSimilarityResult {
  const rowSets = matrix.map(row => new Set(row.filter(zodiac => zodiac !== "未知")));
  const diversityPrefix = new Array(matrix.length + 1).fill(0);
  const diversitySquaredPrefix = new Array(matrix.length + 1).fill(0);
  const repeatHitsPrefix = new Array(matrix.length + 1).fill(0);
  const repeatDenominatorPrefix = new Array(matrix.length + 1).fill(0);
  const presencePrefix: Record<string, number[]> = Object.fromEntries(
    zodiacOrder.map(zodiac => [zodiac, new Array(matrix.length + 1).fill(0)])
  );

  for (let index = 0; index < matrix.length; index++) {
    const diversity = rowSets[index].size;
    diversityPrefix[index + 1] = diversityPrefix[index] + diversity;
    diversitySquaredPrefix[index + 1] = diversitySquaredPrefix[index] + diversity * diversity;
    let repeatHits = 0;
    if (index > 0) {
      for (const zodiac of rowSets[index]) {
        if (rowSets[index - 1].has(zodiac)) repeatHits++;
      }
    }
    repeatHitsPrefix[index + 1] = repeatHitsPrefix[index] + repeatHits;
    repeatDenominatorPrefix[index + 1] = repeatDenominatorPrefix[index] + (index > 0 ? diversity : 0);
    for (const zodiac of zodiacOrder) {
      presencePrefix[zodiac][index + 1] = presencePrefix[zodiac][index] + (rowSets[index].has(zodiac) ? 1 : 0);
    }
  }

  const stateAt = (endExclusive: number): RegimeState => {
    const end = Math.max(0, Math.min(matrix.length, endExclusive));
    const start = Math.max(0, end - windowSize);
    const count = end - start;
    if (count === 0) return emptyState();
    const diversitySum = diversityPrefix[end] - diversityPrefix[start];
    const diversitySquaredSum = diversitySquaredPrefix[end] - diversitySquaredPrefix[start];
    const averageDiversity = diversitySum / count;
    const variance = Math.max(0, diversitySquaredSum / count - averageDiversity * averageDiversity);
    const transitionStart = Math.min(end, start + 1);
    const repeatHits = repeatHitsPrefix[end] - repeatHitsPrefix[transitionStart];
    const repeatDenominator = repeatDenominatorPrefix[end] - repeatDenominatorPrefix[transitionStart];
    let concentration = 0;
    for (const zodiac of zodiacOrder) {
      concentration = Math.max(
        concentration,
        (presencePrefix[zodiac][end] - presencePrefix[zodiac][start]) / count
      );
    }
    return {
      averageDiversity,
      repeatRate: repeatDenominator > 0 ? repeatHits / repeatDenominator : 0,
      diversityVolatility: Math.sqrt(variance),
      concentration
    };
  };

  const state = stateAt(matrix.length);
  const globalCounts: Record<string, number> = Object.fromEntries(zodiacOrder.map(zodiac => [zodiac, 0]));
  const outcomeRows = rowSets.slice(1);
  for (const row of outcomeRows) {
    for (const zodiac of zodiacOrder) {
      if (row.has(zodiac)) globalCounts[zodiac]++;
    }
  }
  const globalRates: Record<string, number> = {};
  for (const zodiac of zodiacOrder) {
    globalRates[zodiac] = (globalCounts[zodiac] + 1) / (outcomeRows.length + 2);
  }

  const candidates: Array<{ distance: number; recency: number; outcome: Set<string> }> = [];
  for (let anchor = windowSize - 1; anchor <= matrix.length - 2; anchor++) {
    candidates.push({
      distance: regimeDistance(state, stateAt(anchor + 1)),
      recency: matrix.length > 1 ? (anchor + 1) / (matrix.length - 1) : 1,
      outcome: rowSets[anchor + 1]
    });
  }
  candidates.sort((a, b) => a.distance - b.distance || b.recency - a.recency);
  const neighbors = candidates.slice(0, Math.min(maxNeighbors, candidates.length));

  const weightedHits: Record<string, number> = Object.fromEntries(zodiacOrder.map(zodiac => [zodiac, 0]));
  let totalWeight = 0;
  for (const neighbor of neighbors) {
    const weight = Math.exp(-2.5 * neighbor.distance) * (0.75 + 0.25 * neighbor.recency);
    totalWeight += weight;
    for (const zodiac of zodiacOrder) {
      if (neighbor.outcome.has(zodiac)) weightedHits[zodiac] += weight;
    }
  }

  const priorStrength = 8;
  const openRates: Record<string, number> = {};
  const lifts: Record<string, number> = {};
  for (const zodiac of zodiacOrder) {
    openRates[zodiac] = (priorStrength * globalRates[zodiac] + weightedHits[zodiac]) / (priorStrength + totalWeight);
    lifts[zodiac] = openRates[zodiac] - globalRates[zodiac];
  }

  return {
    state,
    regime: classifyRegimeState(state),
    openRates,
    lifts,
    confidence: totalWeight / (priorStrength + totalWeight),
    neighborCount: neighbors.length
  };
}
