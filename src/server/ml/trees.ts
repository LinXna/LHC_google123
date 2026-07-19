import { MLSample, SeededRandom, clampProbability, safeMean, sigmoid } from "./common.js";

export interface TreeNode {
  feature?: string;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  value?: number;
  isLeaf: boolean;
}

export class TSDecisionTree {
  public root: TreeNode | null = null;
  private rng: SeededRandom;
  constructor(public maxDepth = 4, public minSamplesSplit = 12, public randomSplit = false, seed = 1) {
    this.rng = new SeededRandom(seed);
  }
  private gini(samples: MLSample[]): number {
    const p = safeMean(samples.map(sample => sample.label));
    return 2 * p * (1 - p);
  }
  private split(samples: MLSample[], feature: string, threshold: number): [MLSample[], MLSample[]] {
    const left: MLSample[] = [], right: MLSample[] = [];
    for (const sample of samples) ((sample.features[feature] || 0) <= threshold ? left : right).push(sample);
    return [left, right];
  }
  private thresholds(values: number[]): number[] {
    const unique = Array.from(new Set(values)).sort((a, b) => a - b);
    if (unique.length < 2) return [];
    if (this.randomSplit) {
      const index = this.rng.int(unique.length - 1);
      return [(unique[index] + unique[index + 1]) / 2];
    }
    const count = Math.min(8, unique.length - 1);
    return Array.from(new Set(Array.from({ length: count }, (_, i) => {
      const index = Math.min(unique.length - 2, Math.floor(((i + 1) * unique.length) / (count + 1)));
      return (unique[index] + unique[index + 1]) / 2;
    })));
  }
  private build(samples: MLSample[], features: string[], depth: number): TreeNode {
    const probability = clampProbability(safeMean(samples.map(sample => sample.label)));
    const positives = samples.filter(sample => sample.label === 1).length;
    if (depth >= this.maxDepth || samples.length < this.minSamplesSplit || positives === 0 || positives === samples.length) {
      return { isLeaf: true, value: probability };
    }
    const base = this.gini(samples);
    const subset = this.rng.shuffle(features).slice(0, Math.max(1, Math.floor(Math.sqrt(features.length))));
    let bestGain = 0, bestFeature = "", bestThreshold = 0;
    let best: [MLSample[], MLSample[]] | null = null;
    for (const feature of subset) {
      const values = samples.map(sample => sample.features[feature] || 0);
      for (const threshold of this.thresholds(values)) {
        const split = this.split(samples, feature, threshold);
        if (split[0].length < 2 || split[1].length < 2) continue;
        const impurity = (split[0].length * this.gini(split[0]) + split[1].length * this.gini(split[1])) / samples.length;
        const gain = base - impurity;
        if (gain > bestGain + 1e-10) {
          bestGain = gain;
          bestFeature = feature;
          bestThreshold = threshold;
          best = split;
        }
      }
    }
    if (!best || bestGain < 1e-5) return { isLeaf: true, value: probability };
    return {
      isLeaf: false,
      feature: bestFeature,
      threshold: bestThreshold,
      left: this.build(best[0], features, depth + 1),
      right: this.build(best[1], features, depth + 1)
    };
  }
  public fit(samples: MLSample[], features: string[]): void { this.root = samples.length ? this.build(samples, features, 0) : null; }
  private walk(node: TreeNode, sample: MLSample): number {
    if (node.isLeaf) return node.value ?? 0.5;
    return this.walk((sample.features[node.feature!] || 0) <= node.threshold! ? node.left! : node.right!, sample);
  }
  public predictProb(sample: MLSample): number { return this.root ? clampProbability(this.walk(this.root, sample)) : 0.5; }
}

export class TSRandomForest {
  public trees: TSDecisionTree[] = [];
  constructor(public numTrees = 18, public maxDepth = 5, public minSplit = 12, public seed = 1) {}
  public fit(samples: MLSample[], features: string[]): void {
    this.trees = [];
    if (!samples.length) return;
    const rng = new SeededRandom(this.seed);
    for (let index = 0; index < this.numTrees; index++) {
      const bootstrap = Array.from({ length: samples.length }, () => samples[rng.int(samples.length)]);
      const tree = new TSDecisionTree(this.maxDepth, this.minSplit, false, this.seed + index * 9973);
      tree.fit(bootstrap, features);
      this.trees.push(tree);
    }
  }
  public predictProb(sample: MLSample): number {
    return this.trees.length ? clampProbability(safeMean(this.trees.map(tree => tree.predictProb(sample)))) : 0.5;
  }
}

export class TSExtraTrees {
  public trees: TSDecisionTree[] = [];
  constructor(public numTrees = 18, public maxDepth = 5, public minSplit = 12, public seed = 17) {}
  public fit(samples: MLSample[], features: string[]): void {
    this.trees = [];
    for (let index = 0; index < this.numTrees; index++) {
      const tree = new TSDecisionTree(this.maxDepth, this.minSplit, true, this.seed + index * 7919);
      tree.fit(samples, features);
      this.trees.push(tree);
    }
  }
  public predictProb(sample: MLSample): number {
    return this.trees.length ? clampProbability(safeMean(this.trees.map(tree => tree.predictProb(sample)))) : 0.5;
  }
}

export interface BoostedStump {
  feature: string;
  threshold: number;
  leftValue: number;
  rightValue: number;
  root: TreeNode;
}

export class TSGradientBoosting {
  public trees: BoostedStump[] = [];
  public learningRate: number;
  public baseValue = 0;
  constructor(public numTrees = 16, public maxDepth = 1, public lr = 0.08) { this.learningRate = lr; }
  private stump(samples: MLSample[], residuals: number[], features: string[]): BoostedStump | null {
    let best: BoostedStump | null = null, bestLoss = Infinity;
    for (const feature of features) {
      const values = samples.map(sample => sample.features[feature] || 0);
      const unique = Array.from(new Set(values)).sort((a, b) => a - b);
      if (unique.length < 2) continue;
      const count = Math.min(8, unique.length - 1);
      for (let i = 0; i < count; i++) {
        const pos = Math.min(unique.length - 2, Math.floor(((i + 1) * unique.length) / (count + 1)));
        const threshold = (unique[pos] + unique[pos + 1]) / 2;
        const left: number[] = [], right: number[] = [];
        values.forEach((value, index) => (value <= threshold ? left : right).push(index));
        if (left.length < 2 || right.length < 2) continue;
        const leftValue = safeMean(left.map(index => residuals[index]));
        const rightValue = safeMean(right.map(index => residuals[index]));
        const loss = left.reduce((sum, index) => sum + (residuals[index] - leftValue) ** 2, 0)
          + right.reduce((sum, index) => sum + (residuals[index] - rightValue) ** 2, 0);
        if (loss < bestLoss) {
          bestLoss = loss;
          best = {
            feature,
            threshold,
            leftValue,
            rightValue,
            root: {
              isLeaf: false,
              feature,
              threshold,
              left: { isLeaf: true, value: leftValue },
              right: { isLeaf: true, value: rightValue }
            }
          };
        }
      }
    }
    return best;
  }
  public fit(samples: MLSample[], features: string[]): void {
    this.trees = [];
    if (!samples.length) return;
    const prevalence = clampProbability(safeMean(samples.map(sample => sample.label)));
    this.baseValue = Math.log(prevalence / (1 - prevalence));
    const scores = new Array(samples.length).fill(this.baseValue);
    for (let iteration = 0; iteration < this.numTrees; iteration++) {
      const residuals = samples.map((sample, index) => sample.label - sigmoid(scores[index]));
      const stump = this.stump(samples, residuals, features);
      if (!stump) break;
      this.trees.push(stump);
      samples.forEach((sample, index) => {
        scores[index] += this.learningRate * ((sample.features[stump.feature] || 0) <= stump.threshold ? stump.leftValue : stump.rightValue);
      });
    }
  }
  public predictProb(sample: MLSample): number {
    let score = this.baseValue;
    for (const tree of this.trees) {
      score += this.learningRate * ((sample.features[tree.feature] || 0) <= tree.threshold ? tree.leftValue : tree.rightValue);
    }
    return clampProbability(sigmoid(score));
  }
}
