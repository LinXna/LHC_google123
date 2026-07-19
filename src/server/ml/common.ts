export interface MLSample {
  period: number;
  zodiac: string;
  label: number;
  features: Record<string, number>;
}

export interface ExperimentMetrics {
  logLoss: number;
  accuracy: number;
  auc: number;
  precision: number;
  brierScore?: number;
  sampleCount?: number;
}

export type BaseProbabilities = { p_lr: number; p_rf: number; p_et: number; p_gb: number };

export class SeededRandom {
  private state: number;
  constructor(seed: number) { this.state = (seed >>> 0) || 0x6d2b79f5; }
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  public int(maxExclusive: number): number { return maxExclusive <= 1 ? 0 : Math.floor(this.next() * maxExclusive); }
  public shuffle<T>(values: T[]): T[] {
    const out = [...values];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

export function clampProbability(value: number): number {
  return Math.max(1e-6, Math.min(1 - 1e-6, Number.isFinite(value) ? value : 0.5));
}
export function sigmoid(value: number): number {
  const z = Math.max(-30, Math.min(30, value));
  return 1 / (1 + Math.exp(-z));
}
export function safeMean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
export function uniqueSortedPeriods(samples: MLSample[]): number[] {
  return Array.from(new Set(samples.map(sample => sample.period))).sort((a, b) => a - b);
}

export class TSLogisticRegression {
  public weights: Record<string, number> = {};
  public bias = 0;
  private means: Record<string, number> = {};
  private scales: Record<string, number> = {};

  constructor(public lr = 0.08, public l1 = 0.002, public l2 = 0.02, public epochs = 180) {}

  private value(sample: MLSample, feature: string): number {
    return ((sample.features[feature] || 0) - (this.means[feature] || 0)) / (this.scales[feature] || 1);
  }

  public fit(samples: MLSample[], features: string[]): void {
    this.weights = {};
    this.means = {};
    this.scales = {};
    this.bias = 0;
    if (samples.length === 0 || features.length === 0) return;
    for (const feature of features) {
      const values = samples.map(sample => sample.features[feature] || 0);
      const mean = safeMean(values);
      const variance = safeMean(values.map(value => (value - mean) ** 2));
      this.means[feature] = mean;
      this.scales[feature] = Math.sqrt(variance) > 1e-8 ? Math.sqrt(variance) : 1;
      this.weights[feature] = 0;
    }
    const prevalence = clampProbability(safeMean(samples.map(sample => sample.label)));
    this.bias = Math.log(prevalence / (1 - prevalence));
    const ordered = [...samples].sort((a, b) => a.period - b.period || a.zodiac.localeCompare(b.zodiac));
    for (let epoch = 0; epoch < this.epochs; epoch++) {
      const gradients: Record<string, number> = Object.fromEntries(features.map(feature => [feature, 0]));
      let biasGradient = 0;
      for (const sample of ordered) {
        let linear = this.bias;
        for (const feature of features) linear += this.value(sample, feature) * (this.weights[feature] || 0);
        const error = sigmoid(linear) - sample.label;
        biasGradient += error;
        for (const feature of features) gradients[feature] += error * this.value(sample, feature);
      }
      const rate = this.lr / Math.sqrt(1 + epoch * 0.03);
      this.bias -= rate * biasGradient / ordered.length;
      for (const feature of features) {
        const weight = this.weights[feature] || 0;
        const next = weight - rate * (gradients[feature] / ordered.length + this.l2 * weight);
        this.weights[feature] = Math.sign(next) * Math.max(0, Math.abs(next) - rate * this.l1);
      }
    }
  }

  public predictProb(sample: MLSample, features: string[]): number {
    let linear = this.bias;
    for (const feature of features) linear += this.value(sample, feature) * (this.weights[feature] || 0);
    return clampProbability(sigmoid(linear));
  }
}
