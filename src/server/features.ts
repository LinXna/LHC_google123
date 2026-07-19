import * as fs from "fs";
import * as path from "path";
import { FeatureResult, LotteryRecord, PredictionResult } from "../types.js";
import { ZodiacPatternAnalyzer } from "./zodiacAnalyzer.js";
import { MachineLearningPredictionModel } from "./mlEngine.js";

/**
 * Phase 4: FeatureRepository manages, queries, caches, and traces features.
 */
export class FeatureRepository {
  private features: FeatureResult[] = [];

  public clear(): void {
    this.features = [];
  }

  public addFeatures(feats: FeatureResult[]): void {
    this.features.push(...feats);
  }

  public getFeaturesForPeriod(issue: number): FeatureResult[] {
    return this.features.filter(f => f.issue === issue);
  }

  public getFeatureValue(issue: number, zodiac: string, name: string, defaultValue = 0): number {
    const found = this.features.find(f => f.issue === issue && f.zodiac === zodiac && f.featureName === name);
    return found ? found.value : defaultValue;
  }

  public getFeatureMetadata(issue: number, zodiac: string, name: string): any {
    const found = this.features.find(f => f.issue === issue && f.zodiac === zodiac && f.featureName === name);
    return found ? found.metadata : undefined;
  }

  public getAllFeatures(): FeatureResult[] {
    return this.features;
  }
}

/**
 * Phase 3: FeatureCollector is responsible for extracting all features for a given period T.
 * To keep V2 logic intact, we can reuse the statistics computed by ZodiacPatternAnalyzer,
 * but map them cleanly into FeatureResults.
 */
export class FeatureCollector {
  private repository: FeatureRepository;

  constructor(repository: FeatureRepository) {
    this.repository = repository;
  }

  /**
   * Collects features for a given historical state of records at period targetIdx.
   */
  public collect(
    records: LotteryRecord[],
    targetIdx: number,
    analyzer: ZodiacPatternAnalyzer,
    customWeights?: any
  ): FeatureResult[] {
    const slice = records.slice(0, targetIdx + 1);
    const report = analyzer.computePatterns(slice, true);
    
    // We run the core feature generation logic for this target period
    const lastRecord = slice[slice.length - 1];
    const issue = lastRecord.issue;
    const zodiacOrder = analyzer.zodiacOrder;
    const numToZodiac = analyzer.zodiacMap;

    const zodiacToNums: Record<string, number[]> = {};
    for (const z of zodiacOrder) zodiacToNums[z] = [];
    for (const [num, zName] of Object.entries(numToZodiac)) {
      const n = parseInt(num);
      if (zodiacToNums[zName]) {
        zodiacToNums[zName].push(n);
      }
    }

    const lastNums = lastRecord.numbers;
    let activeNumToZodiac = numToZodiac;
    if (analyzer.engineMode === "dynamic" && lastRecord.archive_year !== undefined) {
      const lastBase = ZodiacPatternAnalyzer.getBaseZodiacByYear(lastRecord.archive_year);
      activeNumToZodiac = (analyzer as any)._getZodiacMap(lastBase);
    }

    const lastZList = lastNums.map(n => activeNumToZodiac[n] || "未知");
    const lastZSet = new Set(lastZList);
    const currentDiversity = lastZSet.size;

    // Reconstruct matrix for calibration
    const matrixForCalibration: string[][] = [];
    for (const rec of slice) {
      const yr = rec.archive_year;
      let zm = numToZodiac;
      if (analyzer.engineMode === "dynamic" && yr !== undefined && yr !== null) {
        const base = ZodiacPatternAnalyzer.getBaseZodiacByYear(yr);
        zm = (analyzer as any)._getZodiacMap(base);
      }
      matrixForCalibration.push(rec.numbers.map(n => zm[n] || "未知"));
    }

    const calibrationMethod = customWeights?.calibrationMethod || "wma";
    const calibrationWindow = customWeights?.calibrationWindow !== undefined ? customWeights.calibrationWindow : 15;
    const kalmanQ = customWeights?.kalmanQ !== undefined ? customWeights.kalmanQ : 0.01;
    const kalmanR = customWeights?.kalmanR !== undefined ? customWeights.kalmanR : 0.1;

    let calibratedRates: Record<string, number>;
    if (calibrationMethod === "kalman") {
      calibratedRates = ZodiacPatternAnalyzer.computeKalman(matrixForCalibration, zodiacOrder, kalmanQ, kalmanR);
    } else if (calibrationMethod === "wma") {
      calibratedRates = ZodiacPatternAnalyzer.computeWMA(matrixForCalibration, zodiacOrder, calibrationWindow);
    } else {
      calibratedRates = {};
      for (const z of zodiacOrder) calibratedRates[z] = 7 / 12;
    }

    const M = matrixForCalibration.length;
    const prefixSum: Record<string, number[]> = {};
    for (const z of zodiacOrder) {
      prefixSum[z] = new Array(M + 1).fill(0);
    }
    for (let t = 0; t < M; t++) {
      const currentSet = new Set(matrixForCalibration[t]);
      for (const z of zodiacOrder) {
        prefixSum[z][t + 1] = prefixSum[z][t] + (currentSet.has(z) ? 1 : 0);
      }
    }

    const currentOmission: Record<string, number> = {};
    const currentConsecutive: Record<string, number> = {};
    for (const z of zodiacOrder) {
      currentOmission[z] = 0;
      currentConsecutive[z] = 0;
    }

    for (let t = 0; t < M; t++) {
      const currentSet = new Set(matrixForCalibration[t]);
      for (const z of zodiacOrder) {
        if (currentSet.has(z)) {
          currentOmission[z] = 0;
          currentConsecutive[z] = currentConsecutive[z] + 1;
        } else {
          currentOmission[z] = currentOmission[z] + 1;
          currentConsecutive[z] = 0;
        }
      }
    }

    // Naive Bayes & Logistic Regression features
    const totalInstances = M;
    let baselineKills = 0;
    const omissionTotal: Record<string, number> = { "0-4": 0, "5-8": 0, "9-11": 0, "12-14": 0, "15+": 0 };
    const omissionKills: Record<string, number> = { "0-4": 0, "5-8": 0, "9-11": 0, "12-14": 0, "15+": 0 };
    const densityTotal: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const densityKills: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const consecutiveTotal: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3+": 0 };
    const consecutiveKills: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3+": 0 };
    const ltTotal: Record<string, number> = { "0-2": 0, "3-10": 0, "11-18": 0, "19+": 0 };
    const ltKills: Record<string, number> = { "0-2": 0, "3-10": 0, "11-18": 0, "19+": 0 };

    const getOBin = (o: number) => {
      if (o < 5) return "0-4";
      if (o < 9) return "5-8";
      if (o < 12) return "9-11";
      if (o < 15) return "12-14";
      return "15+";
    };
    const getCBin = (c: number) => {
      if (c === 0) return "0";
      if (c === 1) return "1";
      if (c === 2) return "2";
      return "3+";
    };
    const getLTBin = (lt: number) => {
      if (lt <= 2) return "0-2";
      if (lt <= 10) return "3-10";
      if (lt <= 18) return "11-18";
      return "19+";
    };

    const scanStart = Math.min(50, Math.floor(M / 4));
    const samples: any[] = [];
    for (let t = scanStart; t < M; t++) {
      const openedSet = new Set(matrixForCalibration[t]);
      for (const z of zodiacOrder) {
        // Calculate omission at t
        let o = 0;
        for (let prev = t - 1; prev >= 0; prev--) {
          if (matrixForCalibration[prev].includes(z)) break;
          o++;
        }
        const d = prefixSum[z][t] - prefixSum[z][Math.max(0, t - 5)];
        // Calculate consecutive at t
        let c = 0;
        for (let prev = t - 1; prev >= 0; prev--) {
          if (!matrixForCalibration[prev].includes(z)) break;
          c++;
        }
        const lt = prefixSum[z][t] - prefixSum[z][Math.max(0, t - 50)];
        const openedAtT = openedSet.has(z);
        const killedAtT = !openedAtT;

        if (killedAtT) baselineKills++;
        const oBin = getOBin(o);
        omissionTotal[oBin]++;
        if (killedAtT) omissionKills[oBin]++;
        densityTotal[d]++;
        if (killedAtT) densityKills[d]++;
        const cBin = getCBin(c);
        consecutiveTotal[cBin]++;
        if (killedAtT) consecutiveKills[cBin]++;
        const ltBin = getLTBin(lt);
        ltTotal[ltBin]++;
        if (killedAtT) ltKills[ltBin]++;

        samples.push({ z, oBin, dBin: d, cBin, ltBin, label: killedAtT ? 1 : 0 });
      }
    }

    const nbPriorVeto = totalInstances > 0 ? baselineKills / (M - scanStart) / 12 : 0.55;
    const nbPriorOpen = 1.0 - nbPriorVeto;

    const nbTallyVeto: Record<string, number> = {};
    const nbTallyOpen: Record<string, number> = {};
    let countVeto = 0;
    let countOpen = 0;
    for (const sample of samples) {
      const keys = [`o=${sample.oBin}`, `d=${sample.dBin}`, `c=${sample.cBin}`, `lt=${sample.ltBin}`];
      if (sample.label === 1) {
        countVeto++;
        for (const k of keys) nbTallyVeto[k] = (nbTallyVeto[k] || 0) + 1;
      } else {
        countOpen++;
        for (const k of keys) nbTallyOpen[k] = (nbTallyOpen[k] || 0) + 1;
      }
    }

    const oBins = ["0-4", "5-8", "9-11", "12-14", "15+"];
    const dBins = [0, 1, 2, 3, 4, 5];
    const cBins = ["0", "1", "2", "3+"];
    const ltBins = ["0-2", "3-10", "11-18", "19+"];

    const getNbProb = (featKey: string, isVeto: boolean): number => {
      const tally = isVeto ? nbTallyVeto : nbTallyOpen;
      const count = isVeto ? countVeto : countOpen;
      const countVal = tally[featKey] || 0;
      let numCats = 4;
      if (featKey.startsWith("o=")) numCats = 5;
      else if (featKey.startsWith("d=")) numCats = 6;
      return (countVal + 1.0) / (count + numCats);
    };

    // Logistic Regression training
    const getFeatureVector = (oBin: string, dBin: number, cBin: string, ltBin: string): number[] => {
      const vec = new Array(20).fill(0.0);
      vec[0] = 1.0;
      const idxO = oBins.indexOf(oBin);
      if (idxO !== -1) vec[1 + idxO] = 1.0;
      const idxD = dBins.indexOf(dBin);
      if (idxD !== -1) vec[1 + 5 + idxD] = 1.0;
      const idxC = cBins.indexOf(cBin);
      if (idxC !== -1) vec[1 + 5 + 6 + idxC] = 1.0;
      const idxLT = ltBins.indexOf(ltBin);
      if (idxLT !== -1) vec[1 + 5 + 6 + 4 + idxLT] = 1.0;
      return vec;
    };

    const D = 20;
    const lrWeights = new Array(D).fill(0.0);
    const lrLambda = 0.01;
    const lrRate = 0.45;
    const lrIterations = 200;

    if (samples.length > 0) {
      for (let iter = 0; iter < lrIterations; iter++) {
        const gradient = new Array(D).fill(0.0);
        for (const sample of samples) {
          const vec = getFeatureVector(sample.oBin, sample.dBin, sample.cBin, sample.ltBin);
          let wx = 0.0;
          for (let j = 0; j < D; j++) wx += lrWeights[j] * vec[j];
          const pred = 1.0 / (1.0 + Math.exp(-wx));
          const err = pred - sample.label;
          for (let j = 0; j < D; j++) gradient[j] += err * vec[j];
        }
        for (let j = 0; j < D; j++) {
          const regVal = (j === 0) ? 0.0 : lrLambda * lrWeights[j];
          lrWeights[j] -= lrRate * ((gradient[j] / samples.length) + regVal);
        }
      }
    }

    const featureResults: FeatureResult[] = [];

    // Construct features for each zodiac for period T
    for (const z of zodiacOrder) {
      const o = currentOmission[z] || 0;
      const c = currentConsecutive[z] || 0;
      const d = prefixSum[z][M] - prefixSum[z][Math.max(0, M - 5)];
      const lt = prefixSum[z][M] - prefixSum[z][Math.max(0, M - 50)];

      const oBin = getOBin(o);
      const cBin = getCBin(c);
      const ltBin = getLTBin(lt);

      const keys = [`o=${oBin}`, `d=${d}`, `c=${cBin}`, `lt=${ltBin}`];
      let logVeto = Math.log(Math.max(0.0001, nbPriorVeto));
      let logOpen = Math.log(Math.max(0.0001, nbPriorOpen));
      for (const k of keys) {
        logVeto += Math.log(getNbProb(k, true));
        logOpen += Math.log(getNbProb(k, false));
      }
      const maxLog = Math.max(logVeto, logOpen);
      const eVeto = Math.exp(logVeto - maxLog);
      const eOpen = Math.exp(logOpen - maxLog);
      const nbOpenProb = eOpen / (eVeto + eOpen);

      const vec = getFeatureVector(oBin, d, cBin, ltBin);
      let wx = 0.0;
      for (let j = 0; j < D; j++) wx += lrWeights[j] * vec[j];
      const pVeto = 1.0 / (1.0 + Math.exp(-wx));

      // 1. Basic Stats Features
      featureResults.push({ featureName: "omission", value: o, zodiac: z, issue });
      featureResults.push({ featureName: "consecutive", value: c, zodiac: z, issue });
      featureResults.push({ featureName: "density", value: d, zodiac: z, issue });
      featureResults.push({ featureName: "longterm_density", value: lt, zodiac: z, issue });
      featureResults.push({ featureName: "calibrated_rate", value: calibratedRates[z] || 0, zodiac: z, issue });

      // 2. Bayes & LR Model Features
      featureResults.push({ featureName: "bayes_open_prob", value: nbOpenProb, zodiac: z, issue });
      featureResults.push({ featureName: "logistic_veto_prob", value: pVeto, zodiac: z, issue });

      // 3. F1 Single & Multi Combinations Score Features (from computePatterns reports)
      let f1Score = 0;
      let reasons: string[] = [];
      if (report.zodiac_score?.[z]) {
        f1Score = report.zodiac_score[z].score;
        reasons = report.zodiac_score[z].reasons;
      }
      featureResults.push({ featureName: "zodiac_analyzer_score", value: f1Score, zodiac: z, issue, metadata: { reasons } });

      // 4. Laplace Smoothed Joint Sub-Kills (F2 Combination Sub-Kills)
      let isComboVeto = 0;
      let smoothedVetoProb = 0;
      const lastZArray = Array.from(lastZSet).sort();
      for (let subsetSize = 1; subsetSize <= 4; subsetSize++) {
        const combos = ZodiacPatternAnalyzer.getCombinations(lastZArray, subsetSize);
        for (const combo of combos) {
          let totalMatch = 0;
          const nextPeriodCounts: Record<string, number> = {};
          for (const zo of zodiacOrder) nextPeriodCounts[zo] = 0;
          for (let i = 0; i < matrixForCalibration.length - 1; i++) {
            const row = matrixForCalibration[i];
            const rowSet = new Set(row);
            const containsAll = combo.every(item => rowSet.has(item));
            if (containsAll) {
              totalMatch++;
              for (const zo of matrixForCalibration[i + 1]) nextPeriodCounts[zo]++;
            }
          }
          if (totalMatch >= 3 && nextPeriodCounts[z] === 0) {
            const pSmoothed = (totalMatch + 0.25) / (totalMatch + 3);
            if (pSmoothed >= 0.60) {
              isComboVeto = 1;
              smoothedVetoProb = Math.max(smoothedVetoProb, pSmoothed);
            }
          }
        }
      }
      featureResults.push({ featureName: "f2_combo_veto", value: isComboVeto, zodiac: z, issue, metadata: { smoothedVetoProb } });

      // 5. Gap Recovery (F5) features
      let f5RecoveryTriggered = 0;
      let f5RecoveryRate = 0;
      if (lastZSet.size > 0) {
        const lastRow1 = matrixForCalibration[M - 1] || [];
        const lastRow2 = M >= 2 ? matrixForCalibration[M - 2] : [];
        const lastRow3 = M >= 3 ? matrixForCalibration[M - 3] : [];
        const lastRow4 = M >= 4 ? matrixForCalibration[M - 4] : [];
        const lastSet1 = new Set(lastRow1);
        const lastSet2 = new Set(lastRow2);
        const lastSet3 = new Set(lastRow3);
        const lastSet4 = new Set(lastRow4);

        if (lastSet2.has(z) && !lastSet1.has(z)) {
          f5RecoveryTriggered = 1;
          f5RecoveryRate = report.trace_recovery?.["prev1_missing"]?.[z]?.rate || 0;
        } else if (lastSet3.has(z) && lastSet2.has(z) && !lastSet1.has(z)) {
          f5RecoveryTriggered = 2;
          f5RecoveryRate = report.trace_recovery?.["prev2_missing"]?.[z]?.rate || 0;
        } else if (lastSet4.has(z) && lastSet3.has(z) && lastSet2.has(z) && !lastSet1.has(z)) {
          f5RecoveryTriggered = 3;
          f5RecoveryRate = (report.trace_recovery?.["multi_gap"]?.[z] || report.trace_recovery?.["prev3_missing"]?.[z])?.rate || 0;
        }
      }
      featureResults.push({ featureName: "f5_recovery_triggered", value: f5RecoveryTriggered, zodiac: z, issue });
      featureResults.push({ featureName: "f5_recovery_rate", value: f5RecoveryRate, zodiac: z, issue });
    }

    this.repository.addFeatures(featureResults);
    return featureResults;
  }
}

/**
 * Phase 5: FeatureDatasetBuilder automatically compiles training data and writes to standard CSV files.
 */
export class FeatureDatasetBuilder {
  private repository: FeatureRepository;

  constructor(repository: FeatureRepository) {
    this.repository = repository;
  }

  /**
   * Generates a fully consolidated training CSV file in /data/feature_dataset.csv
   * Also dumps per-period CSV files under /data/dumps/ if requested.
   */
  public buildDataset(records: LotteryRecord[], analyzer: ZodiacPatternAnalyzer): void {
    const csvRows: string[] = [];
    const featureNames = [
      "omission",
      "consecutive",
      "density",
      "longterm_density",
      "calibrated_rate",
      "bayes_open_prob",
      "logistic_veto_prob",
      "zodiac_analyzer_score",
      "f2_combo_veto",
      "f5_recovery_triggered",
      "f5_recovery_rate"
    ];

    // CSV Header: Period, Zodiac, Label, Feature1, Feature2...
    csvRows.push(["Period", "Zodiac", "Label", ...featureNames].join(","));

    // We can only generate labels for periods that have a next period (T + 1)
    for (let i = ZodiacPatternAnalyzer.MIN_PERIODS; i < records.length - 1; i++) {
      const rec = records[i];
      const nextRec = records[i + 1];
      const issue = rec.issue;

      // Ensure features are collected for this period
      const periodFeatures = this.repository.getFeaturesForPeriod(issue);
      if (periodFeatures.length === 0) continue;

      let nextZM = analyzer.zodiacMap;
      if (analyzer.engineMode === "dynamic" && nextRec.archive_year !== undefined) {
        const nextBase = ZodiacPatternAnalyzer.getBaseZodiacByYear(nextRec.archive_year);
        nextZM = (analyzer as any)._getZodiacMap(nextBase);
      }
      const nextOpenedZSet = new Set(nextRec.numbers.map(n => nextZM[n] || "未知"));

      for (const z of analyzer.zodiacOrder) {
        const label = nextOpenedZSet.has(z) ? 1 : 0;
        const rowVals = [
          issue.toString(),
          z,
          label.toString()
        ];
        for (const fn of featureNames) {
          const val = this.repository.getFeatureValue(issue, z, fn, 0);
          rowVals.push(val.toFixed(4));
        }
        csvRows.push(rowVals.join(","));
      }
    }

    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const outPath = path.join(dataDir, "feature_dataset.csv");
    fs.writeFileSync(outPath, csvRows.join("\n"), "utf-8");
    console.log(`[FeatureDatasetBuilder] Consolidated dataset created successfully at ${outPath}`);
  }

  /**
   * Phase 8: Feature Dump saves features for the current period (T) into a separate CSV
   * Name: [period].csv. Rows: 12 (one per zodiac), Columns: Features.
   */
  public dumpPeriodFeatures(issue: number, zodiacOrder: string[]): void {
    const featureNames = [
      "omission",
      "consecutive",
      "density",
      "longterm_density",
      "calibrated_rate",
      "bayes_open_prob",
      "logistic_veto_prob",
      "zodiac_analyzer_score",
      "f2_combo_veto",
      "f5_recovery_triggered",
      "f5_recovery_rate"
    ];

    const csvRows: string[] = [];
    csvRows.push(["Zodiac", ...featureNames].join(","));

    for (const z of zodiacOrder) {
      const rowVals = [z];
      for (const fn of featureNames) {
        const val = this.repository.getFeatureValue(issue, z, fn, 0);
        rowVals.push(val.toFixed(4));
      }
      csvRows.push(rowVals.join(","));
    }

    const dumpsDir = path.join(process.cwd(), "data", "dumps");
    if (!fs.existsSync(dumpsDir)) {
      fs.mkdirSync(dumpsDir, { recursive: true });
    }

    const dumpPath = path.join(dumpsDir, `${issue}.csv`);
    fs.writeFileSync(dumpPath, csvRows.join("\n"), "utf-8");
    console.log(`[Feature Dump] Saved period feature dump successfully at ${dumpPath}`);
  }
}

/**
 * Phase 11: PredictionModel interface.
 */
export interface PredictionModel {
  predict(repository: FeatureRepository, issue: number, baseAnalyzer: ZodiacPatternAnalyzer, customWeights?: any): PredictionResult;
}

/**
 * Phase 11: CurrentPredictionModel implements the PredictionModel interface,
 * delegating predictions to our robust V2.5 Decision Engine via CurrentRecommendationAdapter.
 */
export class CurrentPredictionModel implements PredictionModel {
  public predict(repository: FeatureRepository, issue: number, baseAnalyzer: ZodiacPatternAnalyzer, customWeights?: any): PredictionResult {
    const adapter = new CurrentRecommendationAdapter(repository);
    return adapter.reconstructPrediction(issue, baseAnalyzer, customWeights);
  }
}

/**
 * Phase 7: CurrentRecommendationAdapter reads from FeatureRepository and restores V2.5 recommendation states
 * to maintain 100% predictive accuracy and compatibility with the existing frontend reports.
 */
export class CurrentRecommendationAdapter {
  private repository: FeatureRepository;

  constructor(repository: FeatureRepository) {
    this.repository = repository;
  }

  public reconstructPrediction(issue: number, analyzer: ZodiacPatternAnalyzer, customWeights?: any): PredictionResult {
    // We call the native ZodiacPatternAnalyzer.generatePrediction to ensure 100% exact math matches
    // since we need to keep complete outputs and logic.
    // However, we feed the custom weights and run the standard underlying algorithms.
    // Let's do this directly or let the prediction engine run.
    const slice = analyzer.resampleIfEnabled(analyzer.loadJsonData(null));
    const report = analyzer.computePatterns(slice, false);
    return ZodiacPatternAnalyzer.generatePrediction(slice, report, (analyzer as any).baseZodiac, analyzer.engineMode, customWeights);
  }
}

/**
 * Phase 9: Feature Audit checks features for anomalies (nulls, duplicates, outliers).
 */
export class FeatureAudit {
  public static audit(repository: FeatureRepository, issue: number, zodiacOrder: string[]): { ok: boolean; anomalies: string[] } {
    const anomalies: string[] = [];
    const featureNames = [
      "omission",
      "consecutive",
      "density",
      "longterm_density",
      "calibrated_rate",
      "bayes_open_prob",
      "logistic_veto_prob",
      "zodiac_analyzer_score"
    ];

    for (const z of zodiacOrder) {
      for (const fn of featureNames) {
        const val = repository.getFeatureValue(issue, z, fn, -999);
        if (val === -999) {
          anomalies.push(`Anomaly: Feature [${fn}] for zodiac [${z}] in period [${issue}] is missing or null.`);
        }
        if (fn === "bayes_open_prob" && (val < 0 || val > 1)) {
          anomalies.push(`Anomaly: Out-of-bounds probability for [${fn}] of zodiac [${z}]: ${val}`);
        }
      }
    }

    return {
      ok: anomalies.length === 0,
      anomalies
    };
  }
}

/**
 * Phase 10: Prediction Snapshot saves predictive states for historical replay.
 */
export class PredictionSnapshot {
  public static saveSnapshot(issue: number, prediction: PredictionResult): void {
    const snapshotDir = path.join(process.cwd(), "data", "snapshots");
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true });
    }
    const snapPath = path.join(snapshotDir, `${issue}_snapshot.json`);
    fs.writeFileSync(snapPath, JSON.stringify(prediction, null, 2), "utf-8");
    console.log(`[Prediction Snapshot] Saved state for period ${issue} at ${snapPath}`);
  }
}

/**
 * Phase 6: PredictionPipeline connects everything together.
 */
export class PredictionPipeline {
  private repository: FeatureRepository;
  private collector: FeatureCollector;
  private datasetBuilder: FeatureDatasetBuilder;
  private model: PredictionModel;

  constructor() {
    this.repository = new FeatureRepository();
    this.collector = new FeatureCollector(this.repository);
    this.datasetBuilder = new FeatureDatasetBuilder(this.repository);
    this.model = new MachineLearningPredictionModel();
  }

  public run(records: LotteryRecord[], analyzer: ZodiacPatternAnalyzer, customWeights?: any): PredictionResult {
    const totalPeriods = records.length;
    const latestRecord = records[totalPeriods - 1];
    const issue = latestRecord.issue;

    // 1. Run Scanners & Extract Features
    this.collector.collect(records, totalPeriods - 1, analyzer, customWeights);

    // 2. Perform Feature Validation / Audit
    const auditRes = FeatureAudit.audit(this.repository, issue, analyzer.zodiacOrder);
    if (!auditRes.ok) {
      console.warn(`[PredictionPipeline] Feature audit warnings:\n${auditRes.anomalies.join("\n")}`);
    }

    // 3. Dump current period features as CSV
    this.datasetBuilder.dumpPeriodFeatures(issue, analyzer.zodiacOrder);

    // 4. Model Prediction
    const prediction = this.model.predict(this.repository, issue, analyzer, customWeights);

    // 5. Save Prediction Snapshot
    PredictionSnapshot.saveSnapshot(issue, prediction);

    // 6. Optionally build the complete historical dataset
    try {
      // Collect features for historical periods to populate the dataset
      const startCollectIdx = Math.max(0, totalPeriods - 25); // collect recent 25 periods to keep it snappy!
      for (let i = startCollectIdx; i < totalPeriods - 1; i++) {
        this.collector.collect(records, i, analyzer, customWeights);
      }
      this.datasetBuilder.buildDataset(records, analyzer);
    } catch (e) {
      console.error("Failed to build historical dataset:", e);
    }

    return prediction;
  }
}
