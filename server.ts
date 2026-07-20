import express from "express";
import path from "path";
import * as fs from "fs";
import { createServer as createViteServer } from "vite";
import { ZodiacPatternAnalyzer } from "./src/server/zodiacAnalyzer.js";
import { FeatureAuditor } from "./src/server/featureAuditor.js";
import { aggregateEvaluations, aggregateWindowStability, evaluatePeriod, recommendAblation, structuralZodiacProbabilities, summarizeWatchHistory } from "./src/server/evaluation.js";
import { FeatureCollector } from "./src/server/features.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const DATA_DIR = path.join(process.cwd(), "data");

  // Helper to get available JSON files
  function getAvailableDataFiles(): string[] {
    if (!fs.existsSync(DATA_DIR)) return [];
    return fs.readdirSync(DATA_DIR)
      .filter(f => /^\d+\.json$/.test(f))
      .sort();
  }

  function getDefaultRecentDataFiles(files: string[], years = 4): string[] {
    const yearFiles = files
      .map(file => ({ file, year: Number.parseInt(path.basename(file, ".json"), 10) }))
      .filter(item => Number.isInteger(item.year));
    const latestYear = Math.max(...yearFiles.map(item => item.year));
    if (!Number.isFinite(latestYear)) return files;
    return yearFiles
      .filter(item => item.year >= latestYear - years + 1 && item.year <= latestYear)
      .map(item => item.file);
  }

  // 1. API: Get list of available years
  app.get("/api/years", (req, res) => {
    try {
      const files = getAvailableDataFiles();
      const years = files.map(f => {
        const yearStr = f.split(".")[0];
        return {
          filename: f,
          year: parseInt(yearStr) || 2026
        };
      });
      res.json({ status: "success", years });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // 2. API: Execute full pattern analysis
  app.post("/api/analyze", (req, res) => {
    try {
      const { selectedYears, baseZodiac, engineMode = "dynamic", freshnessEnabled = false, freshnessYears = 3 } = req.body; // array of filenames or null for all
      const files = getAvailableDataFiles();
      const targetFiles = Array.isArray(selectedYears) && selectedYears.length > 0
        ? selectedYears.map((y: string) => path.join(DATA_DIR, y))
        : getDefaultRecentDataFiles(files).map(f => path.join(DATA_DIR, f));

      const mergedRecords: any[] = [];

      for (const filePath of targetFiles) {
        const fileName = path.basename(filePath);
        try {
          const raw = fs.readFileSync(filePath, "utf-8");
          const payload = JSON.parse(raw);
          const bodyList = payload.result?.data?.bodyList;
          if (!Array.isArray(bodyList)) continue;

          let fileYear = parseInt(fileName.split(".")[0]) || 2026;
          if (bodyList.length > 0 && bodyList[0].preDrawDate) {
            fileYear = parseInt(bodyList[0].preDrawDate.slice(0, 4)) || fileYear;
          }

          const dynamicBase = ZodiacPatternAnalyzer.getBaseZodiacByYear(fileYear);
          const tempAnalyzer = new ZodiacPatternAnalyzer(dynamicBase);
          const yearRecords = tempAnalyzer.loadJsonData(filePath);

          for (const r of yearRecords) {
            r.archive_year = fileYear;
            mergedRecords.push(r);
          }
        } catch (err) {
          console.error(`Error loading year file ${fileName}:`, err);
        }
      }

      mergedRecords.sort((a, b) => {
        const yrA = a.archive_year || 0;
        const yrB = b.archive_year || 0;
        if (yrA !== yrB) return yrA - yrB;
        return a.issue - b.issue;
      });

      if (mergedRecords.length === 0) {
        return res.status(400).json({ status: "error", message: "未成功加载任何年份的历史数据" });
      }

      // Latest year's zodiac determines the unify engine logic
      const latestRecord = mergedRecords[mergedRecords.length - 1];
      const latestYear = latestRecord.archive_year || 2026;
      const finalBaseZodiac = baseZodiac || ZodiacPatternAnalyzer.getBaseZodiacByYear(latestYear);

      const analyzer = new ZodiacPatternAnalyzer(finalBaseZodiac, engineMode, freshnessEnabled, freshnessYears);
      const processedRecords = analyzer.resampleIfEnabled(mergedRecords);
      
      const report = analyzer.computePatterns(processedRecords);

      res.json({
        status: "success",
        baseZodiac: finalBaseZodiac,
        latestYear,
        totalRecords: processedRecords.length,
        report
      });
    } catch (e: any) {
      console.error("Analysis failed:", e);
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // 3. API: Generate smart predictions
  app.post("/api/predict", (req, res) => {
    try {
      const { selectedYears, baseZodiac, engineMode = "dynamic", customWeights, freshnessEnabled = false, freshnessYears = 3 } = req.body;
      const files = getAvailableDataFiles();
      const targetFiles = Array.isArray(selectedYears) && selectedYears.length > 0
        ? selectedYears.map((y: string) => path.join(DATA_DIR, y))
        : getDefaultRecentDataFiles(files).map(f => path.join(DATA_DIR, f));

      const mergedRecords: any[] = [];
      for (const filePath of targetFiles) {
        try {
          const raw = fs.readFileSync(filePath, "utf-8");
          const payload = JSON.parse(raw);
          const bodyList = payload.result?.data?.bodyList;
          if (!Array.isArray(bodyList)) continue;

          let fileYear = parseInt(path.basename(filePath).split(".")[0]) || 2026;
          if (bodyList.length > 0 && bodyList[0].preDrawDate) {
            fileYear = parseInt(bodyList[0].preDrawDate.slice(0, 4)) || fileYear;
          }

          const dynamicBase = ZodiacPatternAnalyzer.getBaseZodiacByYear(fileYear);
          const tempAnalyzer = new ZodiacPatternAnalyzer(dynamicBase);
          const yearRecords = tempAnalyzer.loadJsonData(filePath);

          for (const r of yearRecords) {
            r.archive_year = fileYear;
            mergedRecords.push(r);
          }
        } catch (err) {}
      }

      mergedRecords.sort((a, b) => {
        const yrA = a.archive_year || 0;
        const yrB = b.archive_year || 0;
        if (yrA !== yrB) return yrA - yrB;
        return a.issue - b.issue;
      });

      if (mergedRecords.length === 0) {
        return res.status(400).json({ status: "error", message: "数据为空，无法执行推演" });
      }

      const latestRecord = mergedRecords[mergedRecords.length - 1];
      const latestYear = latestRecord.archive_year || 2026;
      const finalBaseZodiac = baseZodiac || ZodiacPatternAnalyzer.getBaseZodiacByYear(latestYear);

      const actualFreshnessEnabled = freshnessEnabled || customWeights?.freshnessEnabled || false;
      const actualFreshnessYears = freshnessYears !== undefined ? freshnessYears : (customWeights?.freshnessYears !== undefined ? customWeights.freshnessYears : 3);

      const analyzer = new ZodiacPatternAnalyzer(finalBaseZodiac, engineMode, actualFreshnessEnabled, actualFreshnessYears);
      const processedRecords = analyzer.resampleIfEnabled(mergedRecords);
      
      const report = analyzer.computePatterns(processedRecords);

      const prediction = ZodiacPatternAnalyzer.generatePrediction(processedRecords, report, finalBaseZodiac, engineMode, {
        ...customWeights,
        freshnessEnabled: actualFreshnessEnabled,
        freshnessYears: actualFreshnessYears
      });

      // --- NEW: Run Automatic Quality Benchmark & Intercept History simultaneously in ONE unified loop ---
      let benchmark: any = undefined;
      let killInterceptHistory: any[] = [];

      const runInlineBenchmark = customWeights?.runBenchmark === true;
      if (runInlineBenchmark && processedRecords.length >= ZodiacPatternAnalyzer.MIN_PERIODS) {
        const loopLimit = (engineMode === "dynamic" || processedRecords.length > 150) ? 5 : 10;
        const totalLen = processedRecords.length;
        const startIdx = Math.max(ZodiacPatternAnalyzer.MIN_PERIODS, totalLen - loopLimit);

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

        for (let i = startIdx; i < totalLen; i++) {
          const currentRecord = processedRecords[i];
          const historicalSlice = processedRecords.slice(0, i);
          if (historicalSlice.length < ZodiacPatternAnalyzer.MIN_PERIODS) continue;

          const sliceLatestRecord = historicalSlice[historicalSlice.length - 1];
          const sliceLatestYear = sliceLatestRecord.archive_year || 2026;
          const sliceBaseZodiac = baseZodiac || ZodiacPatternAnalyzer.getBaseZodiacByYear(sliceLatestYear);

          const sliceAnalyzer = new ZodiacPatternAnalyzer(sliceBaseZodiac, engineMode);
          const sliceReport = sliceAnalyzer.computePatterns(historicalSlice, true);

          // 1. Current Config Prediction (Run once!)
          const currentPred = ZodiacPatternAnalyzer.generatePrediction(
            historicalSlice,
            sliceReport,
            sliceBaseZodiac,
            engineMode,
            { ...customWeights, isBenchmark: true }
          );

          // 2. Baseline Prediction (Only run if engineMode is not dynamic, otherwise reuse currentPred)
          const baselinePred = engineMode === "dynamic"
            ? currentPred
            : ZodiacPatternAnalyzer.generatePrediction(
                historicalSlice,
                sliceReport,
                sliceBaseZodiac,
                engineMode,
                { w1: 60, w2: 40, calibrationMethod: "wma", calibrationWindow: 15, isBenchmark: true }
              );

          // 3. Actual target results
          const actualNums = currentRecord.numbers;
          let activeMap = sliceAnalyzer.zodiacMap;
          if (engineMode === "dynamic" && currentRecord.archive_year !== undefined) {
            const nextBase = ZodiacPatternAnalyzer.getBaseZodiacByYear(currentRecord.archive_year);
            activeMap = sliceAnalyzer._getZodiacMap(nextBase);
          }
          const actualZodiacs = actualNums.map((n: number) => activeMap[n] || "未知");

          // Evaluate Baseline
          const actualUniqueZodiacs = Array.from(new Set(actualZodiacs));
          const baseHotMatches = actualUniqueZodiacs.filter(z => baselinePred.tierHot.includes(z)).length;
          const baseMidMatches = actualUniqueZodiacs.filter(z => baselinePred.tierMid.includes(z)).length;
          const baseKillMatches = actualUniqueZodiacs.filter(z => baselinePred.tierKill.includes(z)).length;

          baselineHotRec += baselinePred.tierHot.length;
          baselineHotHits += baseHotMatches;
          baselineMidRec += baselinePred.tierMid.length;
          baselineMidHits += baseMidMatches;
          baselineKillRec += baselinePred.tierKill.length;
          baselineKillLeaks += baseKillMatches;
          if (baseKillMatches > 0) {
            baselineKillFails++;
          }

          // Evaluate Current
          const currHotMatches = actualUniqueZodiacs.filter(z => currentPred.tierHot.includes(z)).length;
          const currMidMatches = actualUniqueZodiacs.filter(z => currentPred.tierMid.includes(z)).length;
          const currKillMatches = actualUniqueZodiacs.filter(z => currentPred.tierKill.includes(z)).length;

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

          // 4. Calculate leaks/fails for Kill Intercept History
          const leaks = actualZodiacs.filter(z => currentPred.tierKill.includes(z));
          killInterceptHistory.push({
            issue: currentRecord.issue,
            archive_year: currentRecord.archive_year || 2026,
            date: currentRecord.date,
            killedZodiacs: currentPred.tierKill,
            actualZodiacs,
            leaks,
            success: leaks.length === 0
          });
        }

        if (testedCount > 0) {
          const baseHotRate = baselineHotRec > 0 ? baselineHotHits / baselineHotRec : 0;
          const baseMidRate = baselineMidRec > 0 ? baselineMidHits / baselineMidRec : 0;
          const baseKillRate = baselineKillRec > 0 ? (baselineKillRec - baselineKillLeaks) / baselineKillRec : 1;
          const baselineWeighted = (baseHotRate * 0.5) + (baseMidRate * 0.3) + (baseKillRate * 0.2);

          const currHotRate = currentHotRec > 0 ? currentHotHits / currentHotRec : 0;
          const currMidRate = currentMidRec > 0 ? currentMidHits / currentMidRec : 0;
          const currKillRate = currentKillRec > 0 ? (currentKillRec - currentKillLeaks) / currentKillRec : 1;
          const currentWeighted = (currHotRate * 0.5) + (currMidRate * 0.3) + (currKillRate * 0.2);

          benchmark = {
            testedCount,
            baseline: {
              hotHitRate: baseHotRate,
              midHitRate: baseMidRate,
              killInterceptRate: baseKillRate,
              weightedHitRate: baselineWeighted,
              killFailCount: baselineKillFails
            },
            current: {
              hotHitRate: currHotRate,
              midHitRate: currMidRate,
              killInterceptRate: currKillRate,
              weightedHitRate: currentWeighted,
              killFailCount: currentKillFails
            },
            gains: {
              weightedHitRateGain: currentWeighted - baselineWeighted,
              hotHitRateGain: currHotRate - baseHotRate,
              killFailCountGain: baselineKillFails - currentKillFails
            },
            isDegraded: (currentWeighted < baselineWeighted) || (currHotRate < baseHotRate) || (currentKillFails > baselineKillFails)
          };
        }
      }

      prediction.benchmark = benchmark;
      prediction.killInterceptHistory = killInterceptHistory;

      res.json({
        status: "success",
        baseZodiac: finalBaseZodiac,
        latestYear,
        totalRecords: processedRecords.length,
        report,
        prediction
      });
    } catch (e: any) {
      console.error("Prediction failed:", e);
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // 4. API: Run Simulation/Backtest
  app.post("/api/simulate", (req, res) => {
    try {
      const { selectedYears, testIssue, baseZodiac, engineMode = "dynamic", customWeights, freshnessEnabled = false, freshnessYears = 3 } = req.body;
      const files = getAvailableDataFiles();
      const targetFiles = Array.isArray(selectedYears) && selectedYears.length > 0
        ? selectedYears.map((y: string) => path.join(DATA_DIR, y))
        : getDefaultRecentDataFiles(files).map(f => path.join(DATA_DIR, f));

      const mergedRecords: any[] = [];
      for (const filePath of targetFiles) {
        try {
          const raw = fs.readFileSync(filePath, "utf-8");
          const payload = JSON.parse(raw);
          const bodyList = payload.result?.data?.bodyList;
          if (!Array.isArray(bodyList)) continue;

          let fileYear = parseInt(path.basename(filePath).split(".")[0]) || 2026;
          if (bodyList.length > 0 && bodyList[0].preDrawDate) {
            fileYear = parseInt(bodyList[0].preDrawDate.slice(0, 4)) || fileYear;
          }

          const dynamicBase = ZodiacPatternAnalyzer.getBaseZodiacByYear(fileYear);
          const tempAnalyzer = new ZodiacPatternAnalyzer(dynamicBase);
          const yearRecords = tempAnalyzer.loadJsonData(filePath);

          for (const r of yearRecords) {
            r.archive_year = fileYear;
            mergedRecords.push(r);
          }
        } catch (err) {}
      }

      mergedRecords.sort((a, b) => {
        const yrA = a.archive_year || 0;
        const yrB = b.archive_year || 0;
        if (yrA !== yrB) return yrA - yrB;
        return a.issue - b.issue;
      });

      let testIdx = mergedRecords.findIndex(r => r.issue === testIssue);
      if (testIdx === -1 && testIssue > 100000) {
        const yearStr = testIssue.toString().slice(0, 4);
        const issueStr = testIssue.toString().slice(4);
        const targetYear = parseInt(yearStr);
        const targetIssue = parseInt(issueStr);
        testIdx = mergedRecords.findIndex(r => r.issue === targetIssue && r.archive_year === targetYear);
      }
      if (testIdx === -1) {
        return res.status(404).json({ status: "error", message: `未找到期号 ${testIssue}` });
      }

      if (testIdx < ZodiacPatternAnalyzer.MIN_PERIODS) {
        return res.status(400).json({ status: "error", message: "该期前面的历史期数不足，无法运行推演" });
      }

      // History data slice up to the selected issue (inclusive)
      const historicalSlice = mergedRecords.slice(0, testIdx + 1);
      const nextActualRecord = testIdx + 1 < mergedRecords.length ? mergedRecords[testIdx + 1] : null;

      const latestRecord = historicalSlice[historicalSlice.length - 1];
      const latestYear = latestRecord.archive_year || 2026;
      const finalBaseZodiac = baseZodiac || ZodiacPatternAnalyzer.getBaseZodiacByYear(latestYear);

      const actualFreshnessEnabled = freshnessEnabled || customWeights?.freshnessEnabled || false;
      const actualFreshnessYears = freshnessYears !== undefined ? freshnessYears : (customWeights?.freshnessYears !== undefined ? customWeights.freshnessYears : 3);

      const analyzer = new ZodiacPatternAnalyzer(finalBaseZodiac, engineMode, actualFreshnessEnabled, actualFreshnessYears);
      const processedSlice = analyzer.resampleIfEnabled(historicalSlice);
      const report = analyzer.computePatterns(processedSlice);
      const prediction = ZodiacPatternAnalyzer.generatePrediction(processedSlice, report, finalBaseZodiac, engineMode, {
        ...customWeights,
        freshnessEnabled: actualFreshnessEnabled,
        freshnessYears: actualFreshnessYears
      });

      // Check hits
      let matchedResults: any = null;
      if (nextActualRecord) {
        const actualNums = nextActualRecord.numbers;
        
        let activeMap = analyzer.zodiacMap;
        if (engineMode === "dynamic" && nextActualRecord.archive_year !== undefined) {
          const nextBase = ZodiacPatternAnalyzer.getBaseZodiacByYear(nextActualRecord.archive_year);
          activeMap = analyzer._getZodiacMap(nextBase);
        }
        const actualZodiacs = actualNums.map((n: number) => activeMap[n]);
        const actualZSet = new Set(actualZodiacs);

        const hotHits = tierMatchHits(prediction.tierHot, actualZodiacs);
        const midHits = tierMatchHits(prediction.tierMid, actualZodiacs);
        const killHits = tierMatchHits(prediction.tierKill, actualZodiacs);

        const numHits = actualNums.filter((n: number) => prediction.premiumHotNums.includes(n));

        matchedResults = {
          issue: nextActualRecord.issue,
          date: nextActualRecord.date,
          actualNums,
          actualZodiacs,
          hotHits,
          midHits,
          killHits,
          numHits
        };
      }

      res.json({
        status: "success",
        prediction,
        simulationResult: matchedResults
      });
    } catch (e: any) {
      console.error("Simulation failed:", e);
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // 5. API: Run Batch Backtest for a specific year (e.g. 2026)
  app.post("/api/backtest-year", (req, res) => {
    try {
      const { year = 2026, baseZodiac, engineMode = "dynamic", customWeights, quarter, selectedYears, onlyListIssues, issueIds, freshnessEnabled = false, freshnessYears = 3, isFullHistory = false } = req.body;
      const files = getAvailableDataFiles();
      
      const targetYear = parseInt(year) || 2026;
      let targetFiles: string[] = [];

      if (isFullHistory) {
        // Load all available files starting from 1977
        targetFiles = files.map(f => path.join(DATA_DIR, f));
      } else if (Array.isArray(selectedYears) && selectedYears.length > 0) {
        targetFiles = selectedYears
          .filter(f => files.includes(f))
          .map(f => path.join(DATA_DIR, f));
      } else {
        const yearsToLoad = [targetYear - 3, targetYear - 2, targetYear - 1, targetYear];
        targetFiles = yearsToLoad
          .map(y => `${y}.json`)
          .filter(f => files.includes(f))
          .map(f => path.join(DATA_DIR, f));
      }

      const mergedRecords: any[] = [];
      for (const filePath of targetFiles) {
        try {
          const raw = fs.readFileSync(filePath, "utf-8");
          const payload = JSON.parse(raw);
          const bodyList = payload.result?.data?.bodyList;
          if (!Array.isArray(bodyList)) continue;

          let fileYear = parseInt(path.basename(filePath).split(".")[0]) || 2026;
          if (bodyList.length > 0 && bodyList[0].preDrawDate) {
            fileYear = parseInt(bodyList[0].preDrawDate.slice(0, 4)) || fileYear;
          }

          const dynamicBase = ZodiacPatternAnalyzer.getBaseZodiacByYear(fileYear);
          const tempAnalyzer = new ZodiacPatternAnalyzer(dynamicBase);
          const yearRecords = tempAnalyzer.loadJsonData(filePath, DATA_DIR);

          for (const r of yearRecords) {
            r.archive_year = fileYear;
            mergedRecords.push(r);
          }
        } catch (err) {
          console.error(`Error reading ${filePath}:`, err);
        }
      }

      mergedRecords.sort((a, b) => {
        const yrA = a.archive_year || 0;
        const yrB = b.archive_year || 0;
        if (yrA !== yrB) return yrA - yrB;
        return a.issue - b.issue;
      });

      // Filter target records of the specified year
      let yearRecords = mergedRecords.filter(r => r.archive_year === targetYear);

      if (onlyListIssues) {
        yearRecords.sort((a, b) => a.issue - b.issue);
        return res.json({
          status: "success",
          issues: yearRecords.map(r => ({ issue: r.issue, date: r.date }))
        });
      }

      if (Array.isArray(issueIds)) {
        yearRecords = yearRecords.filter(r => issueIds.includes(r.issue));
      }
      
      // Support quarterly filtering
      if (quarter && quarter !== "all") {
        const q = parseInt(quarter);
        yearRecords = yearRecords.filter(r => {
          const dateStr = r.date || "";
          const parts = dateStr.split("-");
          if (parts.length >= 2) {
            const m = parseInt(parts[1], 10);
            if (q === 1) return m >= 1 && m <= 3;
            if (q === 2) return m >= 4 && m <= 6;
            if (q === 3) return m >= 7 && m <= 9;
            if (q === 4) return m >= 10 && m <= 12;
          }
          return false;
        });
      }
      
      if (yearRecords.length === 0) {
        const qText = quarter && quarter !== "all" ? `第 ${quarter} 季度` : "";
        return res.status(404).json({ 
          status: "error", 
          message: `未找到 ${targetYear} 年 ${qText} 的历史开奖数据，请确认数据源已就绪。` 
        });
      }

      // Sort yearRecords ascending by issue
      yearRecords.sort((a, b) => a.issue - b.issue);

      const results: any[] = [];
      let totalHotHits = 0;
      let totalHotMatches = 0;
      let totalMidHits = 0;
      let totalMidMatches = 0;
      let totalKillIntercepts = 0; // successfully cleared (no actual numbers drawn fall into kill tier)
      let totalKillFails = 0; // kill tier zodiac drawn
      let totalNumHits = 0;
      let totalIssuesEvaluated = 0;
      const probabilityEvaluations: ReturnType<typeof evaluatePeriod>[] = [];

      for (let i = 0; i < yearRecords.length; i++) {
        const currentRecord = yearRecords[i];
        const testIdx = mergedRecords.indexOf(currentRecord);
        if (testIdx < ZodiacPatternAnalyzer.MIN_PERIODS) continue;

        // Historical slice up to preceding issue
        const historicalSlice = mergedRecords.slice(0, testIdx);
        
        const latestRecord = historicalSlice[historicalSlice.length - 1];
        const latestYear = latestRecord.archive_year || 2026;
        const finalBaseZodiac = baseZodiac || ZodiacPatternAnalyzer.getBaseZodiacByYear(latestYear);

        const actualFreshnessEnabled = freshnessEnabled || customWeights?.freshnessEnabled || false;
        const actualFreshnessYears = freshnessYears !== undefined ? freshnessYears : (customWeights?.freshnessYears !== undefined ? customWeights.freshnessYears : 3);

        const analyzer = new ZodiacPatternAnalyzer(finalBaseZodiac, engineMode, actualFreshnessEnabled, actualFreshnessYears);
        const processedSlice = analyzer.resampleIfEnabled(historicalSlice);
        const report = analyzer.computePatterns(processedSlice, true);
        const prediction = ZodiacPatternAnalyzer.generatePrediction(processedSlice, report, finalBaseZodiac, engineMode, {
          ...customWeights,
          freshnessEnabled: actualFreshnessEnabled,
          freshnessYears: actualFreshnessYears,
          isBenchmark: true
        });

        // Check actual draw details of the predicted issue
        const actualNums = currentRecord.numbers;
        let activeMap = analyzer.zodiacMap;
        if (engineMode === "dynamic" && currentRecord.archive_year !== undefined) {
          const nextBase = ZodiacPatternAnalyzer.getBaseZodiacByYear(currentRecord.archive_year);
          activeMap = analyzer._getZodiacMap(nextBase);
        }
        const actualZodiacs = actualNums.map((n: number) => activeMap[n] || "未知");
        const probabilities = prediction.calibration?.rates || Object.fromEntries(
          Object.entries(prediction.scores).map(([zodiac, score]) => [zodiac, Math.max(0, Math.min(1, score / 100))])
        );
        const baselineProbabilities = structuralZodiacProbabilities(activeMap, analyzer.zodiacOrder);
        const probabilityEvaluation = evaluatePeriod(
          probabilities,
          baselineProbabilities,
          new Set(actualZodiacs),
          analyzer.zodiacOrder,
          3,
          prediction.scores
        );
        probabilityEvaluations.push(probabilityEvaluation);

        const hotHits = tierMatchHits(prediction.tierHot, actualZodiacs);
        const midHits = tierMatchHits(prediction.tierMid, actualZodiacs);
        const killHits = tierMatchHits(prediction.tierKill, actualZodiacs);
        const numHits = actualNums.filter((n: number) => prediction.premiumHotNums.includes(n));

        const hasHotHit = hotHits.length > 0;
        const hasMidHit = midHits.length > 0;
        const isPerfectKill = killHits.length === 0;

        if (hasHotHit) {
          totalHotHits++;
          totalHotMatches += hotHits.reduce((sum, h) => sum + h.matches, 0);
        }
        if (hasMidHit) {
          totalMidHits++;
          totalMidMatches += midHits.reduce((sum, h) => sum + h.matches, 0);
        }
        if (isPerfectKill) {
          totalKillIntercepts++;
        } else {
          totalKillFails++;
        }
        totalNumHits += numHits.length;
        totalIssuesEvaluated++;

        results.push({
          issue: currentRecord.issue,
          date: currentRecord.date,
          actualNums,
          actualZodiacs,
          prediction: {
            tierHot: prediction.tierHot,
            tierMid: prediction.tierMid,
            tierKill: prediction.tierKill,
            tierWatch: prediction.tierWatch,
            tierWatchCandidates: prediction.tierWatchCandidates,
            watchSeparation: prediction.watchSeparation,
            premiumHotNums: prediction.premiumHotNums,
            difficultyScore: prediction.difficultyScore,
            conclusion: prediction.conclusion,
            scores: prediction.scores,
            calibration: prediction.calibration,
            modelValidation: prediction.modelValidation
          },
          metrics: {
            hotHits,
            midHits,
            killHits,
            numHits,
            hasHotHit,
            hasMidHit,
            isPerfectKill,
            probability: {
              brierScore: probabilityEvaluation.brierScore,
              logLoss: probabilityEvaluation.logLoss,
              top3Precision: probabilityEvaluation.topKPrecision,
              top3Recall: probabilityEvaluation.topKRecall,
              bottom3Safe: probabilityEvaluation.bottomKSafe
            }
          }
        });
      }

      const totalHotRecommended = results.reduce((sum, r) => sum + (r.prediction.tierHot?.length || 0), 0);
      const totalHotHitZodiacs = results.reduce((sum, r) => sum + (r.metrics.hotHits?.length || 0), 0);
      const totalMidRecommended = results.reduce((sum, r) => sum + (r.prediction.tierMid?.length || 0), 0);
      const totalMidHitZodiacs = results.reduce((sum, r) => sum + (r.metrics.midHits?.length || 0), 0);
      const totalKillRecommended = results.reduce((sum, r) => sum + (r.prediction.tierKill?.length || 0), 0);
      const totalKillLeakZodiacs = results.reduce((sum, r) => sum + (r.metrics.killHits?.length || 0), 0);

      const hotHitRate = totalHotRecommended > 0 ? totalHotHitZodiacs / totalHotRecommended : 0;
      const midHitRate = totalMidRecommended > 0 ? totalMidHitZodiacs / totalMidRecommended : 0;
      const killInterceptRate = totalKillRecommended > 0 ? (totalKillRecommended - totalKillLeakZodiacs) / totalKillRecommended : 0;
      
      // Calculate composite weighted accuracy: Hot (50%), Mid (30%), Kill Intercept (20%)
      const weightedHitRate = (hotHitRate * 0.5) + (midHitRate * 0.3) + (killInterceptRate * 0.2);

      res.json({
        status: "success",
        year,
        engineMode,
        totalIssuesEvaluated,
        summary: {
          hotHitRate,
          hotHitCount: totalHotHitZodiacs,
          hotMatchesTotal: totalHotRecommended,
          midHitRate,
          midHitCount: totalMidHitZodiacs,
          midMatchesTotal: totalMidRecommended,
          killInterceptRate,
          killInterceptCount: totalKillRecommended - totalKillLeakZodiacs,
          killFailCount: totalKillLeakZodiacs, // Leak count
          totalKillRecommended,
          numHitsTotal: totalNumHits,
          weightedHitRate,
          outOfSample: aggregateEvaluations(probabilityEvaluations)
        },
        results
      });
    } catch (e: any) {
      console.error("Year backtest failed:", e);
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // 6. API: Sequential feature-group ablation using the exact same backtest route.
  app.post("/api/feature-ablation", async (req, res) => {
    try {
      const {
        issueIds,
        groups = ["state", "calibration", "bayes", "f1", "f2", "f5", "regime"],
        ...backtestPayload
      } = req.body || {};

      if (!Array.isArray(issueIds) || issueIds.length === 0 || issueIds.length > 20) {
        return res.status(400).json({
          status: "error",
          message: "特征消融必须提供1到20个 issueIds，以控制严格滚动计算范围"
        });
      }

      const allowedGroups = new Set(["state", "calibration", "bayes", "f1", "f2", "f5", "regime"]);
      const requestedGroups = Array.from(new Set((Array.isArray(groups) ? groups : []).map(String)))
        .filter(group => allowedGroups.has(group));
      const configurations = [
        { name: "baseline", disabledFeatureGroups: [] as string[] },
        ...requestedGroups.map(group => ({ name: `without_${group}`, disabledFeatureGroups: [group] }))
      ];

      const runs: any[] = [];
      for (const configuration of configurations) {
        const response = await fetch(`http://127.0.0.1:${PORT}/api/backtest-year`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...backtestPayload,
            issueIds,
            customWeights: {
              ...(backtestPayload.customWeights || {}),
              disabledFeatureGroups: configuration.disabledFeatureGroups
            }
          })
        });
        const payload: any = await response.json();
        if (!response.ok || payload.status !== "success") {
          throw new Error(payload.message || `消融配置 ${configuration.name} 回测失败`);
        }
        runs.push({
          name: configuration.name,
          disabledFeatureGroups: configuration.disabledFeatureGroups,
          totalIssuesEvaluated: payload.totalIssuesEvaluated,
          metrics: payload.summary.outOfSample
        });
      }

      const baseline = runs[0];
      const comparisons = runs.slice(1).map(run => {
        const brierImprovement = baseline.metrics.brierScore - run.metrics.brierScore;
        const logLossImprovement = baseline.metrics.logLoss - run.metrics.logLoss;
        const precisionLiftChange = run.metrics.precisionLiftVsRandom - baseline.metrics.precisionLiftVsRandom;
        const delta = { brierImprovement, logLossImprovement, precisionLiftChange };
        return {
          ...run,
          delta,
          recommendation: recommendAblation(run.totalIssuesEvaluated, delta)
        };
      }).sort((a, b) => b.delta.brierImprovement - a.delta.brierImprovement);

      res.json({
        status: "success",
        evaluatedIssues: issueIds,
        baseline,
        comparisons,
        note: issueIds.length < 20
          ? "样本少于20期，仅用于工程验证，不执行自动淘汰"
          : "仅当关闭模块后Brier、LogLoss与Top3排序均不劣化，才标记为淘汰候选"
      });
    } catch (e: any) {
      console.error("Feature ablation failed:", e);
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // 7. API: Cross-window walk-forward stability audit.
  app.post("/api/walk-forward-audit", async (req, res) => {
    try {
      // Range audits can use different dataset signatures. Do not retain every
      // range's feature matrix in the process-wide cache.
      FeatureCollector.clearCache();
      const { windows, ...backtestPayload } = req.body || {};
      if (!Array.isArray(windows) || windows.length < 3 || windows.length > 5) {
        return res.status(400).json({
          status: "error",
          message: "稳定性审计必须提供3到5个互不重叠的窗口"
        });
      }

      const normalizedWindows = windows.map((window: any, index: number) => ({
        name: String(window?.name || `window_${index + 1}`),
        issueIds: Array.from(new Set(
          (Array.isArray(window?.issueIds) ? window.issueIds : [])
            .map(Number)
            .filter((issue: number) => Number.isInteger(issue) && issue > 0)
        )) as number[]
      }));
      if (normalizedWindows.some(window => window.issueIds.length !== 20)) {
        return res.status(400).json({
          status: "error",
          message: "每个稳定性窗口必须恰好包含20个有效期号"
        });
      }
      const allIssues = normalizedWindows.flatMap(window => window.issueIds);
      if (new Set(allIssues).size !== allIssues.length) {
        return res.status(400).json({
          status: "error",
          message: "稳定性窗口之间不能包含重复期号"
        });
      }

      const runs: any[] = [];
      for (const window of normalizedWindows) {
        const response = await fetch(`http://127.0.0.1:${PORT}/api/backtest-year`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...backtestPayload,
            issueIds: window.issueIds
          })
        });
        const payload: any = await response.json();
        if (!response.ok || payload.status !== "success") {
          throw new Error(payload.message || `稳定性窗口 ${window.name} 回测失败`);
        }
        runs.push({
          name: window.name,
          issueIds: window.issueIds,
          metrics: payload.summary.outOfSample,
          signalPeriods: payload.results.filter((row: any) => row.prediction?.modelValidation?.signalDetected).length,
          killSuppressedPeriods: payload.results.filter((row: any) => row.prediction?.modelValidation?.killTierSuppressed).length
        });
      }

      const stability = aggregateWindowStability(runs.map(run => run.metrics));
      FeatureCollector.clearCache();
      res.json({
        status: "success",
        runs,
        stability,
        note: stability.stableSignal
          ? "跨窗口信号达到候选启用门槛，仍需在新增数据上继续验证"
          : "跨窗口信号不稳定，保持低信号模式并禁止强绝杀"
      });
    } catch (e: any) {
      FeatureCollector.clearCache();
      console.error("Walk-forward audit failed:", e);
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // 8. API: Strict rolling audit for low-score watch candidates.
  app.post("/api/watch-history", async (req, res) => {
    try {
      FeatureCollector.clearCache();
      const {
        latestIssue,
        periods = 20,
        issueIds,
        ...backtestPayload
      } = req.body || {};
      const normalizedPeriods = Math.max(1, Math.min(60, Number.parseInt(periods, 10) || 20));
      const normalizedLatestIssue = Number.parseInt(latestIssue, 10);
      const requestedIssues = Array.isArray(issueIds)
        ? Array.from(new Set(issueIds.map(Number).filter((issue: number) => Number.isInteger(issue) && issue > 0))).slice(-60)
        : Number.isInteger(normalizedLatestIssue) && normalizedLatestIssue > 0
          ? Array.from(
              { length: Math.min(normalizedPeriods, normalizedLatestIssue) },
              (_, index) => normalizedLatestIssue - Math.min(normalizedPeriods, normalizedLatestIssue) + index + 1
            )
          : [];
      if (requestedIssues.length === 0) {
        return res.status(400).json({ status: "error", message: "必须提供有效的 latestIssue 或 issueIds" });
      }

      const response = await fetch(`http://127.0.0.1:${PORT}/api/backtest-year`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...backtestPayload,
          issueIds: requestedIssues
        })
      });
      const payload: any = await response.json();
      if (!response.ok || payload.status !== "success") {
        throw new Error(payload.message || "观察候选历史回放失败");
      }

      const rows = payload.results.map((row: any) => {
        const watchedZodiacs = Array.from(new Set(
          row.prediction?.tierWatchCandidates || row.prediction?.tierWatch || []
        )) as string[];
        const actualZodiacs = Array.from(new Set(row.actualZodiacs || [])) as string[];
        const actualSet = new Set(actualZodiacs);
        const openedZodiacs = watchedZodiacs.filter(zodiac => actualSet.has(zodiac));
        return {
          issue: row.issue,
          date: row.date,
          watchedZodiacs,
          actualZodiacs,
          openedZodiacs,
          anyOpened: openedZodiacs.length > 0,
          displayed: Boolean(row.prediction?.watchSeparation?.meaningfulSeparation),
          numericallySeparated: Boolean(row.prediction?.watchSeparation?.numericalSeparation),
          watchSeparation: row.prediction?.watchSeparation || null
        };
      });
      const summary = summarizeWatchHistory(rows);
      const separatedRows = rows.filter((row: any) => row.displayed);
      const suppressedRows = rows.filter((row: any) => !row.displayed);
      const numericallySeparatedRows = rows.filter((row: any) => row.numericallySeparated);
      const separationAudit = {
        numericallyQualifiedPeriods: numericallySeparatedRows.length,
        displayedPeriods: separatedRows.length,
        suppressedPeriods: suppressedRows.length,
        numericallyQualified: summarizeWatchHistory(numericallySeparatedRows),
        displayed: summarizeWatchHistory(separatedRows),
        suppressed: summarizeWatchHistory(suppressedRows)
      };
      const outOfSample = payload.summary?.outOfSample || {};
      const probabilityStable = Number(outOfSample.brierGain) > 0 && Number(outOfSample.logLossGain) > 0;
      const rankingStable = Number(outOfSample.precisionLiftVsRandom) >= 1.05;
      const continuousValidation = {
        throughIssue: Math.max(...rows.map((row: any) => Number(row.issue) || 0)),
        periods: Number(outOfSample.periods) || rows.length,
        top3Precision: Number(outOfSample.topKPrecision) || 0,
        precisionLiftVsRandom: Number(outOfSample.precisionLiftVsRandom) || 0,
        brierGain: Number(outOfSample.brierGain) || 0,
        logLossGain: Number(outOfSample.logLossGain) || 0,
        signalPeriods: payload.results.filter((row: any) => row.prediction?.modelValidation?.signalDetected).length,
        rankingStable,
        probabilityStable,
        status: rankingStable && probabilityStable ? "stable_signal" : "keep_low_signal"
      };
      FeatureCollector.clearCache();
      res.json({
        status: "success",
        summary,
        separationAudit,
        continuousValidation,
        rows,
        note: "低分观察仅表示相对排名；开出率用于揭示其不可作为绝杀的历史风险"
      });
    } catch (e: any) {
      FeatureCollector.clearCache();
      console.error("Watch history audit failed:", e);
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  function tierMatchHits(tier: string[], actualZodiacs: string[]): { zodiac: string, matches: number }[] {
    const hits: { zodiac: string, matches: number }[] = [];
    const counts: Record<string, number> = {};
    for (const z of actualZodiacs) counts[z] = (counts[z] || 0) + 1;

    for (const z of tier) {
      if (counts[z] > 0) {
        hits.push({ zodiac: z, matches: counts[z] });
      }
    }
    return hits;
  }

  // 6. API: Run Feature Audit and Optimization Suggestions
  app.post("/api/feature-audit", (req, res) => {
    try {
      const { selectedYears, baseZodiac, engineMode = "dynamic", freshnessEnabled = false, freshnessYears = 3 } = req.body;
      const files = getAvailableDataFiles();
      const targetFiles = Array.isArray(selectedYears) && selectedYears.length > 0
        ? selectedYears.map((y: string) => path.join(DATA_DIR, y))
        : files.map(f => path.join(DATA_DIR, f));

      const mergedRecords: any[] = [];
      for (const filePath of targetFiles) {
        try {
          const raw = fs.readFileSync(filePath, "utf-8");
          const payload = JSON.parse(raw);
          const bodyList = payload.result?.data?.bodyList;
          if (!Array.isArray(bodyList)) continue;

          let fileYear = parseInt(path.basename(filePath).split(".")[0]) || 2026;
          if (bodyList.length > 0 && bodyList[0].preDrawDate) {
            fileYear = parseInt(bodyList[0].preDrawDate.slice(0, 4)) || fileYear;
          }

          const dynamicBase = ZodiacPatternAnalyzer.getBaseZodiacByYear(fileYear);
          const tempAnalyzer = new ZodiacPatternAnalyzer(dynamicBase);
          const yearRecords = tempAnalyzer.loadJsonData(filePath);

          for (const r of yearRecords) {
            r.archive_year = fileYear;
            mergedRecords.push(r);
          }
        } catch (err) {}
      }

      mergedRecords.sort((a, b) => {
        const yrA = a.archive_year || 0;
        const yrB = b.archive_year || 0;
        if (yrA !== yrB) return yrA - yrB;
        return a.issue - b.issue;
      });

      if (mergedRecords.length === 0) {
        return res.status(400).json({ status: "error", message: "数据为空，无法执行特征审计" });
      }

      const latestRecord = mergedRecords[mergedRecords.length - 1];
      const latestYear = latestRecord.archive_year || 2026;
      const finalBaseZodiac = baseZodiac || ZodiacPatternAnalyzer.getBaseZodiacByYear(latestYear);

      const analyzer = new ZodiacPatternAnalyzer(finalBaseZodiac, engineMode, freshnessEnabled, freshnessYears);
      const processedRecords = analyzer.resampleIfEnabled(mergedRecords);

      const auditResult = FeatureAuditor.runAudit(processedRecords, analyzer);

      res.json({
        status: "success",
        baseZodiac: finalBaseZodiac,
        latestYear,
        totalRecords: processedRecords.length,
        auditResult,
        reportHtmlPath: path.join(process.cwd(), "FeatureAuditReport.html")
      });
    } catch (e: any) {
      console.error("Feature audit failed:", e);
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // Vite development vs production asset serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
