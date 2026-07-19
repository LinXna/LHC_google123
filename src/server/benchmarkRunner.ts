import * as fs from "fs";
import * as path from "path";
import { ZodiacPatternAnalyzer } from "./zodiacAnalyzer.js";
import { LotteryRecord } from "../types.js";

interface BenchmarkConfig {
  years: number[];
  baseZodiac: string;
  engineMode: "unified" | "dynamic";
  testLimit: number; // number of evaluation periods
  customWeights?: {
    w1: number;
    w2: number;
    calibrationMethod: "ma" | "wma" | "kalman";
    calibrationWindow: number;
    kalmanQ?: number;
    kalmanR?: number;
  };
}

export function runComprehensiveBenchmark(config: BenchmarkConfig) {
  const { years, baseZodiac, engineMode, testLimit, customWeights } = config;

  console.log(`\n========================================================================`);
  console.log(`🚀 开始 LHC 算法穿透质量自动化 Benchmark 质检对账`);
  console.log(`========================================================================`);
  console.log(`> 评估参比年份: ${years.join(", ")}`);
  console.log(`> 岁首本命基准: 【${baseZodiac}】`);
  console.log(`> 算法底盘模式: ${engineMode === "dynamic" ? "🟢 动态对冲生肖映射" : "🔵 统一固定生肖映射"}`);
  console.log(`> 质检评估样本: ${testLimit} 期历史递进交叉核验`);
  console.log(`------------------------------------------------------------------------`);

  // Load records from data folder
  let allRecords: LotteryRecord[] = [];
  const absoluteDataDir = "/data";
  const relativeDataDir = path.join(process.cwd(), "data");
  const dataDir = fs.existsSync(absoluteDataDir) ? absoluteDataDir : relativeDataDir;

  for (const year of years) {
    const filePath = path.join(dataDir, `${year}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ 警告: 数据文件未找到 ${filePath}，跳过`);
      continue;
    }
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const json = JSON.parse(content);
      const bodyList = json.result?.data?.bodyList || json.data?.bodyList;
      if (bodyList && Array.isArray(bodyList)) {
        // Parse records
        const list: LotteryRecord[] = bodyList.map((item: any) => {
          const nums = item.preDrawCode.split(",").map((n: string) => parseInt(n.trim(), 10));
          return {
            issue: parseInt(item.issue, 10),
            date: item.preDrawDate,
            numbers: nums,
            archive_year: year
          };
        });
        // Sort chronologically (oldest to newest)
        list.sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.issue - b.issue;
        });
        allRecords = [...allRecords, ...list];
      }
    } catch (e) {
      console.error(`❌ 解析数据文件出错 ${filePath}:`, e);
    }
  }

  // Final chronological sorting
  allRecords.sort((a, b) => {
    if (a.archive_year !== b.archive_year) {
      return (a.archive_year || 0) - (b.archive_year || 0);
    }
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.issue - b.issue;
  });

  if (allRecords.length < ZodiacPatternAnalyzer.MIN_PERIODS) {
    throw new Error(`❌ 质检终止: 样本数据期数不足，无法执行回溯。当前有效总期数: ${allRecords.length}`);
  }

  const totalLen = allRecords.length;
  const startBenchmarkIdx = Math.max(ZodiacPatternAnalyzer.MIN_PERIODS, totalLen - testLimit);

  // Baseline Config (W1=60, W2=40, calibration=wma, window=15)
  const baselineWeights = {
    w1: 60,
    w2: 40,
    calibrationMethod: "wma" as const,
    calibrationWindow: 15,
    isBenchmark: true
  };

  // Evaluation stats counters
  let baselineHotRec = 0;
  let baselineHotHits = 0;
  let baselineMidRec = 0;
  let baselineMidHits = 0;
  let baselineKillRec = 0;
  let baselineKillLeaks = 0;
  let baselineKillFails = 0;

  let currentHotRec = 0;
  let currentHotHits = 0;
  let currentMidRec = 0;
  let currentMidHits = 0;
  let currentKillRec = 0;
  let currentKillLeaks = 0;
  let currentKillFails = 0;

  let testedCount = 0;

  for (let i = startBenchmarkIdx; i < totalLen; i++) {
    const currentRecord = allRecords[i];
    const historicalSlice = allRecords.slice(0, i);
    if (historicalSlice.length < ZodiacPatternAnalyzer.MIN_PERIODS) continue;

    const sliceLatestRecord = historicalSlice[historicalSlice.length - 1];
    const sliceLatestYear = sliceLatestRecord.archive_year || 2026;
    const sliceBaseZodiac = baseZodiac || ZodiacPatternAnalyzer.getBaseZodiacByYear(sliceLatestYear);

    const sliceAnalyzer = new ZodiacPatternAnalyzer(sliceBaseZodiac, engineMode);
    const sliceReport = sliceAnalyzer.computePatterns(historicalSlice, true);

    // Baseline predictions
    const baselinePred = ZodiacPatternAnalyzer.generatePrediction(
      historicalSlice,
      sliceReport,
      sliceBaseZodiac,
      engineMode,
      baselineWeights
    );

    // Current config predictions
    const currentPred = ZodiacPatternAnalyzer.generatePrediction(
      historicalSlice,
      sliceReport,
      sliceBaseZodiac,
      engineMode,
      customWeights ? ({ ...customWeights, isBenchmark: true } as any) : undefined
    );

    // Actual target results
    const actualNums = currentRecord.numbers;
    let activeMap = sliceAnalyzer.zodiacMap;
    if (engineMode === "dynamic" && currentRecord.archive_year !== undefined) {
      const nextBase = ZodiacPatternAnalyzer.getBaseZodiacByYear(currentRecord.archive_year);
      activeMap = sliceAnalyzer._getZodiacMap(nextBase);
    }
    const actualZodiacs = actualNums.map((n: number) => activeMap[n] || "未知");

    // Evaluate Baseline
    const baseHotMatches = actualZodiacs.filter(z => baselinePred.tierHot.includes(z)).length;
    const baseMidMatches = actualZodiacs.filter(z => baselinePred.tierMid.includes(z)).length;
    const baseKillMatches = actualZodiacs.filter(z => baselinePred.tierKill.includes(z)).length;

    baselineHotRec += baselinePred.tierHot.length;
    baselineHotHits += baseHotMatches;
    baselineMidRec += baselinePred.tierMid.length;
    baselineMidHits += baseMidMatches;
    baselineKillRec += baselinePred.tierKill.length;
    baselineKillLeaks += baseKillMatches;
    if (baseKillMatches > 0) {
      baselineKillFails++;
    }

    // Evaluate Proposed
    const currHotMatches = actualZodiacs.filter(z => currentPred.tierHot.includes(z)).length;
    const currMidMatches = actualZodiacs.filter(z => currentPred.tierMid.includes(z)).length;
    const currKillMatches = actualZodiacs.filter(z => currentPred.tierKill.includes(z)).length;

    currentHotRec += currentPred.tierHot.length;
    currentHotHits += currHotMatches;
    currentMidRec += currentPred.tierMid.length;
    currentMidHits += currMidMatches;
    currentKillRec += currentPred.tierKill.length;
    currentKillLeaks += currKillMatches;
    if (currKillMatches > 0) {
      currentKillFails++;
    }

    testedCount++;
  }

  if (testedCount === 0) {
    throw new Error(`❌ 质检异常: 未对任何期数完成递进交叉评估。`);
  }

  // Calculate final performance rates
  const baseHotRate = baselineHotRec > 0 ? baselineHotHits / baselineHotRec : 0;
  const baseMidRate = baselineMidRec > 0 ? baselineMidHits / baselineMidRec : 0;
  const baseKillRate = baselineKillRec > 0 ? (baselineKillRec - baselineKillLeaks) / baselineKillRec : 1;
  const baselineWeighted = (baseHotRate * 0.5) + (baseMidRate * 0.3) + (baseKillRate * 0.2);

  const currHotRate = currentHotRec > 0 ? currentHotHits / currentHotRec : 0;
  const currMidRate = currentMidRec > 0 ? currentMidHits / currentMidRec : 0;
  const currKillRate = currentKillRec > 0 ? (currentKillRec - currentKillLeaks) / currentKillRec : 1;
  const currentWeighted = (currHotRate * 0.5) + (currMidRate * 0.3) + (currKillRate * 0.2);

  const weightedGain = currentWeighted - baselineWeighted;
  const hotGain = currHotRate - baseHotRate;
  const killFailDiff = baselineKillFails - currentKillFails;

  const isDegraded = (currentWeighted < baselineWeighted) || (currHotRate < baseHotRate) || (currentKillFails > baselineKillFails);

  console.log(`\n📊 质检对账结果汇总:`);
  console.log(`| 指标 | 历史默认基准 (Baseline) | 本次配置 (Proposed) | 偏振增益幅度 |`);
  console.log(`| :--- | :---: | :---: | :---: |`);
  console.log(`| 加权综合命中率 | ${(baselineWeighted * 100).toFixed(2)}% | ${(currentWeighted * 100).toFixed(2)}% | ${weightedGain >= 0 ? "+" : ""}${(weightedGain * 100).toFixed(2)}% |`);
  console.log(`| 重磅主攻命中率 | ${(baseHotRate * 100).toFixed(2)}% | ${(currHotRate * 100).toFixed(2)}% | ${hotGain >= 0 ? "+" : ""}${(hotGain * 100).toFixed(2)}% |`);
  console.log(`| 绝杀累计漏杀次数 | ${baselineKillFails} 次 | ${currentKillFails} 次 | ${killFailDiff > 0 ? `减少 ${killFailDiff}` : killFailDiff < 0 ? `增加 ${Math.abs(killFailDiff)}` : "持平"} 次 |`);
  console.log(`------------------------------------------------------------------------`);

  if (isDegraded) {
    console.log(`🚨 【质量预警】模型发生逆向劣化 (Negative Gain)！`);
    console.log(`🚫 拦截上线决策：测试集存在指标劣化，本配置不符合安全质检上线标准！`);
  } else {
    console.log(`✅ 【质量通关】模型整体拟合增益为正 (Positive Gain)！`);
    console.log(`🎉 科学对账结论：本次调优参数已通过自动化多维安全围栏测试，可以安全上线。`);
  }
  console.log(`========================================================================\n`);

  return {
    testedCount,
    isDegraded,
    baseline: {
      weighted: baselineWeighted,
      hotRate: baseHotRate,
      midRate: baseMidRate,
      killRate: baseKillRate,
      killFails: baselineKillFails
    },
    current: {
      weighted: currentWeighted,
      hotRate: currHotRate,
      midRate: currMidRate,
      killRate: currKillRate,
      killFails: currentKillFails
    },
    gains: {
      weightedGain,
      hotGain,
      killFailDiff
    }
  };
}

// Support running directly via CLI (e.g. "npx tsx src/server/benchmarkRunner.ts")
if (import.meta.url.endsWith(process.argv[1]) || (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname))) {
  // Read target configurations from command line or default values
  try {
    runComprehensiveBenchmark({
      years: [2024, 2025, 2026],
      baseZodiac: "马",
      engineMode: "dynamic",
      testLimit: 20,
      customWeights: {
        w1: 65,
        w2: 35,
        calibrationMethod: "wma",
        calibrationWindow: 15
      }
    });
  } catch (err) {
    console.error("Benchmark runner failed to execute:", err);
  }
}
