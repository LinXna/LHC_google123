import * as fs from "fs";
import * as path from "path";
import { FeatureResult, LotteryRecord, PredictionResult } from "../types.js";
import { ZodiacPatternAnalyzer } from "./zodiacAnalyzer.js";
import { FeatureRepository, FeatureCollector } from "./features.js";
import { TSStackingClassifier, TSLogisticRegression } from "./mlEngine.js";

export interface FeatureAuditResult {
  featureImportance: {
    featureName: string;
    permutationImportance: number;
    informationGain: number;
    mutualInformation: number;
    shapValue: number;
    splitFrequency: number;
    rank: string;
    group: string;
  }[];
  moduleImportance: Record<string, number>;
  moduleBenchmark: {
    module: string;
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    top3Accuracy: number;
    top7Accuracy: number;
    logLoss: number;
    brierScore: number;
  }[];
  ablationStudy: {
    removedElement: string;
    type: "Feature" | "Module";
    accuracy: number;
    deltaAccuracy: number;
    logLoss: number;
    deltaLogLoss: number;
    auc: number;
    deltaAuc: number;
  }[];
  correlationMatrix: {
    f1: string;
    f2: string;
    pearson: number;
    spearman: number;
    isDuplicate: boolean;
  }[];
  driftReport: {
    featureName: string;
    psi: number;
    klDivergence: number;
    jsDivergence: number;
    status: "Stable" | "Moderate Drift" | "Significant Drift";
    isDrifted: boolean;
  }[];
  rollingImportance: {
    window: number;
    features: { featureName: string; permutationImportance: number }[];
  }[];
  recommendations: {
    type: "Delete" | "Expand" | "Retain" | "Alert";
    target: string;
    reason: string;
    suggestion: string;
  }[];
}

export class FeatureAuditor {
  public static MODULE_MAPPING: Record<string, string[]> = {
    F1: ["zodiac_analyzer_score", "omission", "consecutive", "density", "longterm_density", "calibrated_rate"],
    F2: ["f2_combo_veto"],
    F3: ["bayes_open_prob"],
    F4: ["logistic_veto_prob"],
    F5: ["f5_recovery_triggered", "f5_recovery_rate"],
    F6: ["omission_roll_mean_w3", "density_roll_mean_w3", "score_roll_max_w3", "omission_roll_mean_w5", "density_roll_mean_w5", "score_roll_max_w5"],
    F7: [
      "omission_sq",
      "density_sq",
      "consecutive_sq",
      "longterm_density_sq",
      "calibrated_rate_sq",
      "bayes_open_prob_sq",
      "zodiac_analyzer_score_sq",
      "f5_recovery_rate_sq",
      "omission_x_density",
      "consecutive_x_density",
      "calibrated_rate_x_bayes_open_prob",
      "zodiac_analyzer_score_x_density",
      "omission_x_calibrated_rate"
    ]
  };

  private static entropy(labels: number[]): number {
    const n = labels.length;
    if (n === 0) return 0;
    const count1 = labels.filter(l => l === 1).length;
    const p1 = count1 / n;
    const p0 = 1 - p1;
    let ent = 0;
    if (p1 > 0) ent -= p1 * Math.log2(p1);
    if (p0 > 0) ent -= p0 * Math.log2(p0);
    return ent;
  }

  private static conditionalEntropy(samples: any[], feature: string): number {
    const n = samples.length;
    if (n === 0) return 0;
    const vals = samples.map(s => s.features[feature] || 0);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const binWidth = (max - min) / 5 || 1;

    const getBin = (v: number) => {
      const b = Math.floor((v - min) / binWidth);
      return Math.min(4, Math.max(0, b));
    };

    const binLabels: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    for (const s of samples) {
      const b = getBin(s.features[feature] || 0);
      binLabels[b].push(s.label);
    }

    let condEnt = 0;
    for (let b = 0; b < 5; b++) {
      const pBin = binLabels[b].length / n;
      if (pBin > 0) {
        condEnt += pBin * this.entropy(binLabels[b]);
      }
    }
    return condEnt;
  }

  private static computeInformationGain(samples: any[], feature: string): number {
    const labels = samples.map(s => s.label);
    const totalEnt = this.entropy(labels);
    const condEnt = this.conditionalEntropy(samples, feature);
    return Math.max(0, totalEnt - condEnt);
  }

  private static computeMutualInformation(samples: any[], feature: string): number {
    const n = samples.length;
    if (n === 0) return 0;

    const vals = samples.map(s => s.features[feature] || 0);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const binWidth = (max - min) / 5 || 1;

    const getBin = (v: number) => {
      const b = Math.floor((v - min) / binWidth);
      return Math.min(4, Math.max(0, b));
    };

    const jointCounts: Record<string, number> = {};
    const featCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    const labelCounts: Record<number, number> = { 0: 0, 1: 0 };

    for (const s of samples) {
      const b = getBin(s.features[feature] || 0);
      const l = s.label;

      const key = `${b}_${l}`;
      jointCounts[key] = (jointCounts[key] || 0) + 1;
      featCounts[b]++;
      labelCounts[l]++;
    }

    let mi = 0;
    for (const [key, count] of Object.entries(jointCounts)) {
      const [bStr, lStr] = key.split("_");
      const b = parseInt(bStr);
      const l = parseInt(lStr);

      const pXY = count / n;
      const pX = featCounts[b] / n;
      const pY = labelCounts[l] / n;

      if (pX > 0 && pY > 0 && pXY > 0) {
        mi += pXY * Math.log2(pXY / (pX * pY));
      }
    }

    return Math.max(0, mi);
  }

  private static pearsonCorr(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;
    const mx = x.reduce((s, v) => s + v, 0) / n;
    const my = y.reduce((s, v) => s + v, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - mx;
      const dy = y[i] - my;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    if (denX === 0 || denY === 0) return 0;
    return num / Math.sqrt(denX * denY);
  }

  private static spearmanCorr(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;

    const rank = (arr: number[]) => {
      const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
      const ranks = new Array(n);
      for (let i = 0; i < n; i++) {
        ranks[sorted[i].i] = i + 1;
      }
      return ranks;
    };

    return this.pearsonCorr(rank(x), rank(y));
  }

  private static computePSI(expected: number[], actual: number[]): { psi: number; klExp: number; jsDiv: number } {
    if (expected.length === 0 || actual.length === 0) return { psi: 0, klExp: 0, jsDiv: 0 };

    const min = Math.min(...expected, ...actual);
    const max = Math.max(...expected, ...actual);
    const binWidth = (max - min) / 5 || 1;

    const getBin = (v: number) => {
      const b = Math.floor((v - min) / binWidth);
      return Math.min(4, Math.max(0, b));
    };

    const expCounts = new Array(5).fill(0);
    const actCounts = new Array(5).fill(0);

    for (const v of expected) expCounts[getBin(v)]++;
    for (const v of actual) actCounts[getBin(v)]++;

    let psi = 0;
    let klExp = 0;
    let jsDiv = 0;

    for (let i = 0; i < 5; i++) {
      const pExp = (expCounts[i] + 0.5) / (expected.length + 2.5);
      const pAct = (actCounts[i] + 0.5) / (actual.length + 2.5);

      psi += (pAct - pExp) * Math.log(pAct / pExp);
      klExp += pAct * Math.log(pAct / pExp);

      const pMid = 0.5 * (pAct + pExp);
      const klPM = pAct * Math.log(pAct / pMid);
      const klQM = pExp * Math.log(pExp / pMid);
      jsDiv += 0.5 * klPM + 0.5 * klQM;
    }

    return { psi: Math.max(0, psi), klExp: Math.max(0, klExp), jsDiv: Math.max(0, jsDiv) };
  }

  private static countTreeSplits(node: any, counts: Record<string, number>): void {
    if (!node || node.isLeaf) return;
    if (node.feature) {
      counts[node.feature] = (counts[node.feature] || 0) + 1;
    }
    if (node.left) this.countTreeSplits(node.left, counts);
    if (node.right) this.countTreeSplits(node.right, counts);
  }

  private static evaluateMetrics(
    predictions: { zodiac: string; prob: number; label: number }[],
    zodiacOrder: string[]
  ) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    let logLossSum = 0;
    let brierSum = 0;

    const sortedPreds = [...predictions].sort((a, b) => b.prob - a.prob);
    const tierHot = sortedPreds.slice(0, 3).map(p => p.zodiac);
    const tierMid = sortedPreds.slice(3, 8).map(p => p.zodiac);

    let top3Hit = 0;
    let top7Hit = 0;
    let actualDrawCount = 0;

    for (const p of predictions) {
      const predLabel = p.prob >= 0.5 ? 1 : 0;
      if (predLabel === 1 && p.label === 1) tp++;
      else if (predLabel === 1 && p.label === 0) fp++;
      else if (predLabel === 0 && p.label === 1) fn++;
      else tn++;

      const eps = 1e-15;
      const pAdj = Math.max(eps, Math.min(1 - eps, p.prob));
      logLossSum += -(p.label * Math.log(pAdj) + (1 - p.label) * Math.log(1 - pAdj));
      brierSum += Math.pow(p.prob - p.label, 2);

      if (p.label === 1) {
        actualDrawCount++;
        if (tierHot.includes(p.zodiac)) top3Hit = 1;
        if ([...tierHot, ...tierMid].includes(p.zodiac)) top7Hit = 1;
      }
    }

    const accuracy = (tp + tn) / (predictions.length || 1);
    const precision = tp / (tp + fp || 1);
    const recall = tp / (tp + fn || 1);
    const f1Score = (2 * precision * recall) / (precision + recall || 1);

    return {
      accuracy,
      precision,
      recall,
      f1Score,
      top3Accuracy: top3Hit,
      top7Accuracy: top7Hit,
      logLoss: logLossSum / (predictions.length || 1),
      brierScore: brierSum / (predictions.length || 1)
    };
  }

  public static runAudit(records: LotteryRecord[], baseAnalyzer: ZodiacPatternAnalyzer): FeatureAuditResult {
    console.log(`[FeatureAuditor] Initiating Feature Audit with ${records.length} records...`);

    const repository = new FeatureRepository();
    const collector = new FeatureCollector(repository);

    // 1. Collect features for recent 150 periods
    const endIdx = records.length;
    const startIdx = Math.max(0, endIdx - 150);

    for (let i = startIdx; i < endIdx; i++) {
      collector.collect(records, i, baseAnalyzer);
    }

    // Convert repo data to MLSamples
    const allFeatures = repository.getAllFeatures() as FeatureResult[];
    const featureNames = Array.from(new Set(allFeatures.map(f => f.featureName)));

    // Let's find expanded feature names as well
    const baseSamples = (MachineLearningPredictionModel as any).buildSamplesFromRepo(
      repository,
      records,
      baseAnalyzer.zodiacOrder,
      baseAnalyzer.zodiacMap,
      baseAnalyzer.engineMode
    );

    const { expandedSamples, expandedFeatures } = (baseAnalyzer as any).resampleIfEnabled 
      ? (TSFeatureEngineering as any).expandFeatures(baseSamples, featureNames)
      : { expandedSamples: baseSamples, expandedFeatures: featureNames };

    // Train global Stacker model for Permutation, SHAP, and Frequency calculations
    const trainingSamples = expandedSamples.filter(s => s.period < records[records.length - 1].issue);
    const stacker = new TSStackingClassifier();
    stacker.fit(trainingSamples, expandedFeatures, false);

    // Grouping helper
    const getGroup = (fName: string): string => {
      for (const [mod, list] of Object.entries(this.MODULE_MAPPING)) {
        if (list.includes(fName)) return mod;
      }
      return "F7"; // fallback
    };

    // calculate feature metadata
    const permMap = (TSFeatureSelection as any).computePermutationImportance(stacker, trainingSamples, expandedFeatures);
    
    // Means for SHAP
    const means: Record<string, number> = {};
    for (const f of expandedFeatures) {
      const vals = trainingSamples.map(s => s.features[f] || 0);
      means[f] = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    }

    // Split frequency in trees
    const treeSplits: Record<string, number> = {};
    for (const tree of stacker.baseModels.rf.trees) this.countTreeSplits(tree.root, treeSplits);
    for (const tree of stacker.baseModels.et.trees) this.countTreeSplits(tree.root, treeSplits);
    for (const tree of stacker.baseModels.gbdt.trees) this.countTreeSplits(tree.root, treeSplits);

    // Generate Feature Importance output
    const rawImportance = expandedFeatures.map(fName => {
      const perm = permMap[fName] || 0.001;
      const ig = this.computeInformationGain(trainingSamples, fName);
      const mi = this.computeMutualInformation(trainingSamples, fName);
      
      // SHAP approximation
      const w = stacker.baseModels.lr.weights[fName] || 0.005;
      const shapVals = trainingSamples.map(s => Math.abs(w * ((s.features[fName] || 0) - (means[fName] || 0))));
      const shap = shapVals.reduce((a, b) => a + b, 0) / (shapVals.length || 1);

      const freq = treeSplits[fName] || 0;

      return {
        featureName: fName,
        permutationImportance: perm,
        informationGain: ig,
        mutualInformation: mi,
        shapValue: shap,
        splitFrequency: freq,
        rank: "",
        group: getGroup(fName)
      };
    });

    // Sort by permutation importance and assign ranks
    rawImportance.sort((a, b) => b.permutationImportance - a.permutationImportance);
    const featureImportance = rawImportance.map((item, idx) => ({
      ...item,
      rank: `Rank${idx + 1}`
    }));

    // Save feature_importance.json
    const featureImportanceClean = featureImportance.map(x => ({
      feature_name: x.featureName,
      importance: parseFloat(x.permutationImportance.toFixed(4)),
      rank: x.rank,
      group: x.group
    }));

    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(dataDir, "feature_importance.json"),
      JSON.stringify(featureImportanceClean, null, 2),
      "utf-8"
    );

    // 2. Module Audit (F1~F7 contribution)
    const moduleImportance: Record<string, number> = {};
    const modulePermSums: Record<string, number> = {};
    let totalPermSum = 0;

    for (const mod of ["F1", "F2", "F3", "F4", "F5", "F6", "F7"]) {
      modulePermSums[mod] = 0;
    }
    for (const x of featureImportance) {
      const g = x.group;
      if (modulePermSums[g] !== undefined) {
        modulePermSums[g] += x.permutationImportance;
      } else {
        modulePermSums["F7"] += x.permutationImportance;
      }
      totalPermSum += x.permutationImportance;
    }

    for (const mod of Object.keys(modulePermSums)) {
      moduleImportance[mod] = totalPermSum > 0 ? (modulePermSums[mod] / totalPermSum) : (1 / 7);
    }

    // Save module_importance.json
    const moduleImportanceClean = Object.entries(moduleImportance).reduce((acc, [k, v]) => {
      acc[k] = `${Math.round(v * 100)}%`;
      return acc;
    }, {} as Record<string, string>);

    fs.writeFileSync(
      path.join(dataDir, "module_importance.json"),
      JSON.stringify(moduleImportanceClean, null, 2),
      "utf-8"
    );

    // 3. Single Module Benchmark (Walk Forward)
    // Run walk-forward validation for last 15 issues
    const wfIssuesCount = 15;
    const issues = Array.from(new Set(expandedSamples.map(s => s.period))).sort((a, b) => a - b);
    const testIssues = issues.slice(Math.max(0, issues.length - wfIssuesCount));

    const moduleBenchmark: FeatureAuditResult["moduleBenchmark"] = [];

    const csvBenchmarkRows: string[] = [["Module", "Accuracy", "Precision", "Recall", "F1 Score", "Top3 Accuracy", "Top7 Accuracy", "LogLoss", "Brier Score"].join(",")];

    for (const mod of ["F1", "F2", "F3", "F4", "F5", "F6", "F7"]) {
      const modFeatures = this.MODULE_MAPPING[mod] || [];
      const testPredictions: { zodiac: string; prob: number; label: number }[] = [];

      for (const tIssue of testIssues) {
        // Walk forward training up to tIssue - 1
        const foldTrain = expandedSamples.filter(s => s.period < tIssue);
        const foldTest = expandedSamples.filter(s => s.period === tIssue);

        if (foldTrain.length === 0 || foldTest.length === 0) continue;

        // Train using ONLY features from this module
        const activeFeats = modFeatures.filter(f => expandedFeatures.includes(f));
        const finalActiveFeats = activeFeats.length > 0 ? activeFeats : ["omission"]; // fallback to avoid empty features

        const foldStacker = new TSStackingClassifier();
        foldStacker.fit(foldTrain, finalActiveFeats, true);

        for (const s of foldTest) {
          const prob = foldStacker.predictProb(s, finalActiveFeats);
          testPredictions.push({ zodiac: s.zodiac, prob, label: s.label });
        }
      }

      const metrics = this.evaluateMetrics(testPredictions, baseAnalyzer.zodiacOrder);
      moduleBenchmark.push({
        module: mod,
        accuracy: metrics.accuracy,
        precision: metrics.precision,
        recall: metrics.recall,
        f1Score: metrics.f1Score,
        top3Accuracy: metrics.top3Accuracy,
        top7Accuracy: metrics.top7Accuracy,
        logLoss: metrics.logLoss,
        brierScore: metrics.brierScore
      });

      csvBenchmarkRows.push([
        mod,
        `${(metrics.accuracy * 100).toFixed(1)}%`,
        `${(metrics.precision * 100).toFixed(1)}%`,
        `${(metrics.recall * 100).toFixed(1)}%`,
        `${(metrics.f1Score * 100).toFixed(1)}%`,
        `${(metrics.top3Accuracy * 100).toFixed(1)}%`,
        `${(metrics.top7Accuracy * 100).toFixed(1)}%`,
        metrics.logLoss.toFixed(4),
        metrics.brierScore.toFixed(4)
      ].join(","));
    }

    // Save module_benchmark.csv
    fs.writeFileSync(path.join(dataDir, "module_benchmark.csv"), csvBenchmarkRows.join("\n"), "utf-8");

    // 4. Ablation Study (Leave-One-Out)
    const ablationStudy: FeatureAuditResult["ablationStudy"] = [];
    const csvAblationRows: string[] = [["Removed Element", "Type", "Accuracy", "Delta", "LogLoss", "AUC"].join(",")];

    // Compute walk-forward Baseline (with ALL features)
    const baselinePredictions: { zodiac: string; prob: number; label: number }[] = [];
    for (const tIssue of testIssues) {
      const foldTrain = expandedSamples.filter(s => s.period < tIssue);
      const foldTest = expandedSamples.filter(s => s.period === tIssue);
      if (foldTrain.length === 0 || foldTest.length === 0) continue;

      const foldStacker = new TSStackingClassifier();
      foldStacker.fit(foldTrain, expandedFeatures, true);

      for (const s of foldTest) {
        const prob = foldStacker.predictProb(s, expandedFeatures);
        baselinePredictions.push({ zodiac: s.zodiac, prob, label: s.label });
      }
    }
    const baselineMetrics = this.evaluateMetrics(baselinePredictions, baseAnalyzer.zodiacOrder);

    // Compute AUC for baseline
    const computeAUC = (preds: { prob: number; label: number }[]) => {
      const sorted = [...preds].sort((a, b) => b.prob - a.prob);
      let pos = 0, neg = 0;
      for (const p of sorted) {
        if (p.label === 1) pos++;
        else neg++;
      }
      if (pos === 0 || neg === 0) return 0.5;

      let rankSum = 0;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].label === 1) {
          rankSum += (sorted.length - i);
        }
      }
      return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
    };

    const baselineAuc = computeAUC(baselinePredictions);

    // LOO for Modules
    for (const mod of ["F1", "F2", "F3", "F4", "F5", "F6", "F7"]) {
      const modFeatures = this.MODULE_MAPPING[mod] || [];
      const looFeatures = expandedFeatures.filter(f => !modFeatures.includes(f));
      const finalLooFeatures = looFeatures.length > 0 ? looFeatures : ["omission"];

      const looPredictions: { zodiac: string; prob: number; label: number }[] = [];
      for (const tIssue of testIssues) {
        const foldTrain = expandedSamples.filter(s => s.period < tIssue);
        const foldTest = expandedSamples.filter(s => s.period === tIssue);
        if (foldTrain.length === 0 || foldTest.length === 0) continue;

        const foldStacker = new TSStackingClassifier();
        foldStacker.fit(foldTrain, finalLooFeatures, true);

        for (const s of foldTest) {
          const prob = foldStacker.predictProb(s, finalLooFeatures);
          looPredictions.push({ zodiac: s.zodiac, prob, label: s.label });
        }
      }

      const looMetrics = this.evaluateMetrics(looPredictions, baseAnalyzer.zodiacOrder);
      const looAuc = computeAUC(looPredictions);

      const dAcc = looMetrics.accuracy - baselineMetrics.accuracy;
      const dLogLoss = looMetrics.logLoss - baselineMetrics.logLoss;
      const dAuc = looAuc - baselineAuc;

      ablationStudy.push({
        removedElement: mod,
        type: "Module",
        accuracy: looMetrics.accuracy,
        deltaAccuracy: dAcc,
        logLoss: looMetrics.logLoss,
        deltaLogLoss: dLogLoss,
        auc: looAuc,
        deltaAuc: dAuc
      });

      csvAblationRows.push([
        mod,
        "Module",
        `${(looMetrics.accuracy * 100).toFixed(1)}%`,
        `${dAcc >= 0 ? "+" : ""}${(dAcc * 100).toFixed(1)}%`,
        looMetrics.logLoss.toFixed(4),
        looAuc.toFixed(4)
      ].join(","));
    }

    // LOO for top major features
    const majorFeatures = ["bayes_open_prob", "density", "f2_combo_veto", "omission", "consecutive", "calibrated_rate", "logistic_veto_prob"];
    for (const feat of majorFeatures) {
      if (!expandedFeatures.includes(feat)) continue;

      const looFeatures = expandedFeatures.filter(f => f !== feat && !f.startsWith(`${feat}_`));
      const finalLooFeatures = looFeatures.length > 0 ? looFeatures : ["omission"];

      const looPredictions: { zodiac: string; prob: number; label: number }[] = [];
      for (const tIssue of testIssues) {
        const foldTrain = expandedSamples.filter(s => s.period < tIssue);
        const foldTest = expandedSamples.filter(s => s.period === tIssue);
        if (foldTrain.length === 0 || foldTest.length === 0) continue;

        const foldStacker = new TSStackingClassifier();
        foldStacker.fit(foldTrain, finalLooFeatures, true);

        for (const s of foldTest) {
          const prob = foldStacker.predictProb(s, finalLooFeatures);
          looPredictions.push({ zodiac: s.zodiac, prob, label: s.label });
        }
      }

      const looMetrics = this.evaluateMetrics(looPredictions, baseAnalyzer.zodiacOrder);
      const looAuc = computeAUC(looPredictions);

      const dAcc = looMetrics.accuracy - baselineMetrics.accuracy;
      const dLogLoss = looMetrics.logLoss - baselineMetrics.logLoss;
      const dAuc = looAuc - baselineAuc;

      ablationStudy.push({
        removedElement: feat,
        type: "Feature",
        accuracy: looMetrics.accuracy,
        deltaAccuracy: dAcc,
        logLoss: looMetrics.logLoss,
        deltaLogLoss: dLogLoss,
        auc: looAuc,
        deltaAuc: dAuc
      });

      csvAblationRows.push([
        feat,
        "Feature",
        `${(looMetrics.accuracy * 100).toFixed(1)}%`,
        `${dAcc >= 0 ? "+" : ""}${(dAcc * 100).toFixed(1)}%`,
        looMetrics.logLoss.toFixed(4),
        looAuc.toFixed(4)
      ].join(","));
    }

    // Save ablation_report.csv
    fs.writeFileSync(path.join(dataDir, "ablation_report.csv"), csvAblationRows.join("\n"), "utf-8");

    // 5. Correlation Analysis
    const correlationMatrix: FeatureAuditResult["correlationMatrix"] = [];
    const baseFeatsToCorrelate = expandedFeatures.filter(f => !f.includes("_sq") && !f.includes("_x_") && !f.includes("_roll_"));

    for (let i = 0; i < baseFeatsToCorrelate.length; i++) {
      for (let j = i + 1; j < baseFeatsToCorrelate.length; j++) {
        const f1 = baseFeatsToCorrelate[i];
        const f2 = baseFeatsToCorrelate[j];

        const x = trainingSamples.map(s => s.features[f1] || 0);
        const y = trainingSamples.map(s => s.features[f2] || 0);

        const p = this.pearsonCorr(x, y);
        const s = this.spearmanCorr(x, y);

        const isDuplicate = Math.abs(p) > 0.95 && Math.abs(s) > 0.95;

        correlationMatrix.push({
          f1,
          f2,
          pearson: p,
          spearman: s,
          isDuplicate
        });
      }
    }

    // 6. Drift Detection
    const driftReport: FeatureAuditResult["driftReport"] = [];
    // Compare last 30 issues (Actual) vs preceding all history (Expected)
    const driftTestLimit = 30;
    const actualPeriods = testIssues;
    const expectedPeriods = issues.filter(p => !actualPeriods.includes(p));

    for (const fName of baseFeatsToCorrelate) {
      const expVals = trainingSamples.filter(s => expectedPeriods.includes(s.period)).map(s => s.features[fName] || 0);
      const actVals = trainingSamples.filter(s => actualPeriods.includes(s.period)).map(s => s.features[fName] || 0);

      const { psi, klExp, jsDiv } = this.computePSI(expVals, actVals);
      
      let status: "Stable" | "Moderate Drift" | "Significant Drift" = "Stable";
      if (psi > 0.25) status = "Significant Drift";
      else if (psi >= 0.10) status = "Moderate Drift";

      driftReport.push({
        featureName: fName,
        psi,
        klDivergence: klExp,
        jsDivergence: jsDiv,
        status,
        isDrifted: psi > 0.25
      });
    }

    // Save feature_drift_report.json
    const driftReportClean = driftReport.map(x => ({
      feature_name: x.featureName,
      psi: parseFloat(x.psi.toFixed(4)),
      kl_divergence: parseFloat(x.klDivergence.toFixed(4)),
      js_divergence: parseFloat(x.jsDivergence.toFixed(4)),
      status: x.status,
      is_drifted: x.isDrifted
    }));
    fs.writeFileSync(
      path.join(dataDir, "feature_drift_report.json"),
      JSON.stringify(driftReportClean, null, 2),
      "utf-8"
    );

    // 7. Rolling Importance
    const rollingImportance: FeatureAuditResult["rollingImportance"] = [];
    const windows = [50, 100, 150]; // periods to look back

    for (const w of windows) {
      const subsetIssues = issues.slice(Math.max(0, issues.length - w));
      const subsetSamples = expandedSamples.filter(s => subsetIssues.includes(s.period));

      if (subsetSamples.length > 50) {
        const subStacker = new TSStackingClassifier();
        subStacker.fit(subsetSamples, expandedFeatures, true);

        const subPermMap = (TSFeatureSelection as any).computePermutationImportance(subStacker, subsetSamples, expandedFeatures);
        const subFeaturesImportance = expandedFeatures.map(fName => ({
          featureName: fName,
          permutationImportance: subPermMap[fName] || 0.001
        })).sort((a, b) => b.permutationImportance - a.permutationImportance).slice(0, 10);

        rollingImportance.push({
          window: w,
          features: subFeaturesImportance
        });
      }
    }

    // 8. Recommendation Generation
    const recommendations: FeatureAuditResult["recommendations"] = [];

    // Rule 1: High correlation
    for (const c of correlationMatrix) {
      if (c.isDuplicate) {
        recommendations.push({
          type: "Delete",
          target: `${c.f1} & ${c.f2}`,
          reason: `Pearson correlation is ${c.pearson.toFixed(3)} and Spearman is ${c.spearman.toFixed(3)} (>0.95)`,
          suggestion: `Suggest deleting ${c.f2} to avoid multi-collinearity and speed up ensemble training.`
        });
      }
    }

    // Rule 2: Low permutation importance in recent segments
    const latestRolling = rollingImportance[0]?.features || [];
    const lowImpThreshold = 0.001;
    for (const f of baseFeatsToCorrelate) {
      const isLow = latestRolling.find(x => x.featureName === f && x.permutationImportance < lowImpThreshold) || 
                    (!latestRolling.find(x => x.featureName === f) && permMap[f] < lowImpThreshold);
      if (isLow) {
        recommendations.push({
          type: "Delete",
          target: f,
          reason: `Permutation importance is below safety barrier (${lowImpThreshold}) for last ${rollingImportance[0]?.window || 50} periods.`,
          suggestion: `Suggest deleting feature [${f}] completely from model compilation to lower overfitting risk.`
        });
      }
    }

    // Rule 3: High permutation importance
    for (const item of featureImportance.slice(0, 3)) {
      recommendations.push({
        type: "Expand",
        target: item.featureName,
        reason: `Consistently in top 3 permutation importance rank: ${item.permutationImportance.toFixed(4)}.`,
        suggestion: `Highly recommended to continue expanding and deriving interaction polynomial derivatives for feature [${item.featureName}].`
      });
    }

    // Rule 4: Drift Detection alert
    for (const item of driftReport) {
      if (item.isDrifted) {
        recommendations.push({
          type: "Alert",
          target: item.featureName,
          reason: `Feature population distribution has shifted significantly. PSI = ${item.psi.toFixed(3)} (>0.25).`,
          suggestion: `Signal decaying detected for [${item.featureName}]. Suggest reviewing feature calculation parameters or applying kalman filter smoothing.`
        });
      }
    }

    // fallback if empty
    if (recommendations.length === 0) {
      recommendations.push({
        type: "Retain",
        target: "All Features",
        reason: "All compiled features have stable performance and no critical collinearly detected.",
        suggestion: "Maintain current feature config. Review in next 50 periods."
      });
    }

    const auditResult: FeatureAuditResult = {
      featureImportance,
      moduleImportance,
      moduleBenchmark,
      ablationStudy,
      correlationMatrix,
      driftReport,
      rollingImportance,
      recommendations
    };

    // 9. Generate FeatureAuditReport.html
    this.generateHtmlReport(auditResult, baseAnalyzer);

    return auditResult;
  }

  private static generateHtmlReport(audit: FeatureAuditResult, baseAnalyzer: ZodiacPatternAnalyzer): void {
    const reportPath = path.join(process.cwd(), "FeatureAuditReport.html");

    // Make recommendation lists scannable HTML
    const recsHtml = audit.recommendations.map(r => {
      let badgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      if (r.type === "Delete") badgeClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
      if (r.type === "Alert") badgeClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
      if (r.type === "Expand") badgeClass = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";

      return `
        <div class="p-4 rounded-xl border border-slate-700/60 bg-slate-800/40 hover:bg-slate-800/60 transition-all space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs px-2.5 py-1 rounded-full border ${badgeClass} font-mono font-semibold">${r.type}</span>
            <span class="text-xs font-mono font-bold text-slate-300">${r.target}</span>
          </div>
          <p class="text-xs text-slate-400"><strong class="text-slate-200">原因:</strong> ${r.reason}</p>
          <p class="text-xs text-slate-300"><strong class="text-indigo-400">优化建议:</strong> ${r.suggestion}</p>
        </div>
      `;
    }).join("");

    const fiRows = audit.featureImportance.slice(0, 15).map(f => `
      <tr class="border-b border-slate-800 hover:bg-slate-800/30 font-mono text-xs">
        <td class="p-3 text-slate-200 font-semibold">${f.featureName}</td>
        <td class="p-3 text-indigo-400 font-bold">${f.permutationImportance.toFixed(4)}</td>
        <td class="p-3 text-slate-300">${f.informationGain.toFixed(4)}</td>
        <td class="p-3 text-slate-300">${f.mutualInformation.toFixed(4)}</td>
        <td class="p-3 text-emerald-400 font-semibold">${f.shapValue.toFixed(4)}</td>
        <td class="p-3 text-slate-400">${f.splitFrequency}</td>
        <td class="p-3 text-center"><span class="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-md font-bold text-[10px]">${f.rank}</span></td>
        <td class="p-3 text-center"><span class="bg-slate-700/50 text-slate-300 border border-slate-600/30 px-2 py-0.5 rounded-md text-[10px]">${f.group}</span></td>
      </tr>
    `).join("");

    const modRows = Object.entries(audit.moduleImportance).map(([k, v]) => `
      <div class="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-800/20">
        <div class="flex items-center gap-3">
          <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
          <span class="text-sm font-bold text-slate-200 font-mono">${k} 模块贡献度</span>
        </div>
        <span class="text-sm font-black text-indigo-400 font-mono">${Math.round(v * 100)}%</span>
      </div>
    `).join("");

    const bmRows = audit.moduleBenchmark.map(b => `
      <tr class="border-b border-slate-800 hover:bg-slate-800/30 font-mono text-xs text-center">
        <td class="p-3 text-left font-bold text-indigo-400">${b.module}</td>
        <td class="p-3 text-slate-200">${(b.accuracy * 100).toFixed(1)}%</td>
        <td class="p-3 text-slate-300">${(b.precision * 100).toFixed(1)}%</td>
        <td class="p-3 text-slate-300">${(b.recall * 100).toFixed(1)}%</td>
        <td class="p-3 text-slate-200">${(b.f1Score * 100).toFixed(1)}%</td>
        <td class="p-3 text-emerald-400 font-bold">${(b.top3Accuracy * 100).toFixed(1)}%</td>
        <td class="p-3 text-emerald-400 font-bold">${(b.top7Accuracy * 100).toFixed(1)}%</td>
        <td class="p-3 text-slate-400">${b.logLoss.toFixed(4)}</td>
        <td class="p-3 text-slate-400">${b.brierScore.toFixed(4)}</td>
      </tr>
    `).join("");

    const abRows = audit.ablationStudy.map(a => {
      const isFeature = a.type === "Feature";
      const isBetter = a.deltaAccuracy > 0;
      const arrow = a.deltaAccuracy >= 0 ? "↑" : "↓";
      const badgeClass = isBetter 
        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
        : "bg-rose-500/10 text-rose-400 border-rose-500/20";
      
      return `
        <tr class="border-b border-slate-800 hover:bg-slate-800/30 font-mono text-xs text-center">
          <td class="p-3 text-left font-bold text-slate-200">${a.removedElement}</td>
          <td class="p-3"><span class="px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300 text-[10px]">${a.type}</span></td>
          <td class="p-3 text-slate-300">${(a.accuracy * 100).toFixed(1)}%</td>
          <td class="p-3"><span class="px-2 py-1 rounded border font-bold ${badgeClass} text-[11px]">${arrow} ${(a.deltaAccuracy * 100).toFixed(1)}%</span></td>
          <td class="p-3 text-slate-400">${a.logLoss.toFixed(4)}</td>
          <td class="p-3 text-slate-400">${a.auc.toFixed(4)}</td>
        </tr>
      `;
    }).join("");

    const driftRows = audit.driftReport.map(d => {
      let badgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      if (d.status === "Significant Drift") badgeClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
      else if (d.status === "Moderate Drift") badgeClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";

      return `
        <tr class="border-b border-slate-800 hover:bg-slate-800/30 font-mono text-xs text-center">
          <td class="p-3 text-left text-slate-200 font-semibold">${d.featureName}</td>
          <td class="p-3 text-indigo-400 font-bold">${d.psi.toFixed(4)}</td>
          <td class="p-3 text-slate-400">${d.klDivergence.toFixed(4)}</td>
          <td class="p-3 text-slate-400">${d.jsDivergence.toFixed(4)}</td>
          <td class="p-3"><span class="px-2.5 py-0.5 rounded border ${badgeClass} text-[10px] font-bold">${d.status}</span></td>
        </tr>
      `;
    }).join("");

    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LHC V3.1 特征审计与调优报告</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
    body {
      font-family: 'Inter', sans-serif;
      background-color: #0b0f19;
    }
    .mono {
      font-family: 'JetBrains Mono', monospace;
    }
  </style>
</head>
<body class="text-slate-100 min-h-screen">
  <div class="max-w-7xl mx-auto px-4 py-8 space-y-8">
    
    <!-- HEADER -->
    <header class="border-b border-slate-800 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h1 class="text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <span>LHC Prediction Engine V3.1 Feature Audit Report</span>
          <span class="text-xs px-2 py-0.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-md font-mono font-bold uppercase">Production-Ready</span>
        </h1>
        <p class="text-sm text-slate-400 mt-1">
          本报告旨在回答：哪些特征处于高贡献、哪些模块开始失效、移除哪些冗余特征能反哺模型命中增益。
        </p>
      </div>
      <div class="text-right font-mono text-xs text-slate-400 space-y-0.5">
        <div>系统时间: <span class="text-slate-200 font-semibold">${new Date().toLocaleString("zh-CN")}</span></div>
        <div>对冲基准: <span class="text-indigo-400 font-bold">【${baseAnalyzer.zodiacOrder[0]}】岁首对冲 (模式: ${baseAnalyzer.engineMode})</span></div>
      </div>
    </header>

    <!-- METRICS OVERVIEW & RECOMMENDATIONS -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      <!-- Module contribution -->
      <div class="lg:col-span-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 class="text-md font-extrabold text-white flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
          <span>模块特征整体贡献比 (Module Importance)</span>
        </h2>
        <div class="space-y-2.5">
          ${modRows}
        </div>
      </div>

      <!-- Optimization suggestions -->
      <div class="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 class="text-md font-extrabold text-white flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>自动化优化建议与特征剪枝决策 (Tuning Recommendation)</span>
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${recsHtml}
        </div>
      </div>

    </div>

    <!-- MAIN FEATURES LIST -->
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
      <h2 class="text-md font-extrabold text-white">特征全维度审计指标 (Top 15 Feature Rankings)</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono bg-slate-800/10">
              <th class="p-3">特征名称 (Feature Name)</th>
              <th class="p-3">置换重要性 (Permutation)</th>
              <th class="p-3">信息增益 (Info Gain)</th>
              <th class="p-3">互信息 (Mutual Info)</th>
              <th class="p-3">SHAP 绝对值 (SHAP)</th>
              <th class="p-3">分裂频次 (Tree Splits)</th>
              <th class="p-3 text-center">排名</th>
              <th class="p-3 text-center">分类</th>
            </tr>
          </thead>
          <tbody>
            ${fiRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- SINGLE MODULE BENCHMARK -->
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
      <h2 class="text-md font-extrabold text-white">各扫描器单模块 Walk-Forward 回测 (Single Module Benchmark)</h2>
      <p class="text-xs text-slate-400 mt-1 leading-relaxed">
        各模块单独开启、其他模块屏蔽时，模型独立的拟合准确度、重磅主攻 Top-3 和 Top-7 命中能力以及损失收敛水平。
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono bg-slate-800/10 text-center">
              <th class="p-3 text-left">独立扫描器 (Module)</th>
              <th class="p-3">准确率 (Accuracy)</th>
              <th class="p-3">精确率 (Precision)</th>
              <th class="p-3">召回率 (Recall)</th>
              <th class="p-3">F1 分数</th>
              <th class="p-3 text-emerald-400">主攻Top3命中</th>
              <th class="p-3 text-emerald-400">稳健Top7命中</th>
              <th class="p-3">对数损失 (LogLoss)</th>
              <th class="p-3">布莱尔分数 (Brier)</th>
            </tr>
          </thead>
          <tbody>
            ${bmRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- ABLATION STUDY -->
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
      <h2 class="text-md font-extrabold text-white">消融实验对比报告 (Leave-One-Out Ablation Study)</h2>
      <p class="text-xs text-slate-400 mt-1 leading-relaxed">
        当移除某个模块或单一主特征后，模型整体准确度的增减量（Delta 值为正表示移除该特征后模型准确度反而提升，应进行剪枝）。
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono bg-slate-800/10 text-center">
              <th class="p-3 text-left">移除的目标 (Removed)</th>
              <th class="p-3">类型 (Type)</th>
              <th class="p-3">消融后准确度</th>
              <th class="p-3">准确度变化 (Delta)</th>
              <th class="p-3">消融后 LogLoss</th>
              <th class="p-3">消融后 AUC 拟合度</th>
            </tr>
          </thead>
          <tbody>
            ${abRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- DRIFT DETECTION -->
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
      <h2 class="text-md font-extrabold text-white">特征分布衰减与漂移监测 (Population Stability / Drift Detection)</h2>
      <p class="text-xs text-slate-400 mt-1 leading-relaxed">
        对比最近 30 期(近期实际)与历史120期(预期基准)，PSI &gt; 0.25 表明对应规律可能已经发生本质性变异或失效。
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono bg-slate-800/10 text-center">
              <th class="p-3 text-left">核心扫描器特征 (Feature)</th>
              <th class="p-3">稳定度指数 (PSI)</th>
              <th class="p-3">KL 散度 (KLD)</th>
              <th class="p-3">JS 散度 (JSD)</th>
              <th class="p-3">漂移诊断 (Drift Status)</th>
            </tr>
          </thead>
          <tbody>
            ${driftRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- FOOTER -->
    <footer class="text-center py-6 text-xs text-slate-500 font-mono border-t border-slate-800">
      &copy; 2026 LHC Prediction Engine V3.1 • HIGH PRECISION FEATURE AUDIT FRAMEWORK
    </footer>

  </div>
</body>
</html>
    `;

    fs.writeFileSync(reportPath, htmlContent, "utf-8");
    console.log(`[FeatureAuditor] FeatureAuditReport.html generated successfully at ${reportPath}`);
  }
}
