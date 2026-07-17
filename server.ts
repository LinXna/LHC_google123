import express from "express";
import path from "path";
import * as fs from "fs";
import { createServer as createViteServer } from "vite";
import { ZodiacPatternAnalyzer } from "./src/server/zodiacAnalyzer.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const DATA_DIR = path.join(process.cwd(), "data");

  // Helper to get available JSON files
  function getAvailableDataFiles(): string[] {
    if (!fs.existsSync(DATA_DIR)) return [];
    return fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith(".json"))
      .sort();
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
        : files.map(f => path.join(DATA_DIR, f));

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

      // --- NEW: Run Automatic Quality Benchmark comparing Baseline vs Current Weights on recent 20 periods ---
      let benchmark: any = undefined;
      if (processedRecords.length >= ZodiacPatternAnalyzer.MIN_PERIODS) {
        const benchmarkLimit = 20; // 20 historical periods for evaluation
        const totalLen = processedRecords.length;
        const startBenchmarkIdx = Math.max(ZodiacPatternAnalyzer.MIN_PERIODS, totalLen - benchmarkLimit);

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
          const currentRecord = processedRecords[i];
          const historicalSlice = processedRecords.slice(0, i);
          if (historicalSlice.length < ZodiacPatternAnalyzer.MIN_PERIODS) continue;

          const sliceLatestRecord = historicalSlice[historicalSlice.length - 1];
          const sliceLatestYear = sliceLatestRecord.archive_year || 2026;
          const sliceBaseZodiac = baseZodiac || ZodiacPatternAnalyzer.getBaseZodiacByYear(sliceLatestYear);

          const sliceAnalyzer = new ZodiacPatternAnalyzer(sliceBaseZodiac, engineMode);
          const sliceReport = sliceAnalyzer.computePatterns(historicalSlice, true);

          // Baseline Prediction (Default standard weights)
          const baselinePred = ZodiacPatternAnalyzer.generatePrediction(
            historicalSlice,
            sliceReport,
            sliceBaseZodiac,
            engineMode,
            { w1: 60, w2: 40, calibrationMethod: "wma", calibrationWindow: 15 }
          );

          // Current Config Prediction
          const currentPred = ZodiacPatternAnalyzer.generatePrediction(
            historicalSlice,
            sliceReport,
            sliceBaseZodiac,
            engineMode,
            customWeights
          );

          // Actual target results
          const actualNums = currentRecord.numbers;
          let activeMap = sliceAnalyzer.zodiacMap;
          if (engineMode === "dynamic" && currentRecord.archive_year !== undefined) {
            const nextBase = ZodiacPatternAnalyzer.getBaseZodiacByYear(currentRecord.archive_year);
            activeMap = sliceAnalyzer._getZodiacMap(nextBase);
          }
          const actualZodiacs = actualNums.map(n => activeMap[n] || "未知");

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

          // Evaluate Current
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

      // --- NEW: Calculate "Tier 3 Kill/Exclusion" Intercept History for the last 10 periods ---
      let killInterceptHistory: any[] = [];
      if (processedRecords.length >= ZodiacPatternAnalyzer.MIN_PERIODS) {
        const historyLimit = 10;
        const totalLen = processedRecords.length;
        const startHistoryIdx = Math.max(ZodiacPatternAnalyzer.MIN_PERIODS, totalLen - historyLimit);

        for (let i = startHistoryIdx; i < totalLen; i++) {
          const currentRecord = processedRecords[i];
          const historicalSlice = processedRecords.slice(0, i);
          if (historicalSlice.length < ZodiacPatternAnalyzer.MIN_PERIODS) continue;

          const sliceLatestRecord = historicalSlice[historicalSlice.length - 1];
          const sliceLatestYear = sliceLatestRecord.archive_year || 2026;
          const sliceBaseZodiac = baseZodiac || ZodiacPatternAnalyzer.getBaseZodiacByYear(sliceLatestYear);

          const sliceAnalyzer = new ZodiacPatternAnalyzer(sliceBaseZodiac, engineMode);
          const sliceReport = sliceAnalyzer.computePatterns(historicalSlice, true);

          // Predict using current config
          const currentPred = ZodiacPatternAnalyzer.generatePrediction(
            historicalSlice,
            sliceReport,
            sliceBaseZodiac,
            engineMode,
            customWeights
          );

          // Get actual winning zodiacs
          const actualNums = currentRecord.numbers;
          let activeMap = sliceAnalyzer.zodiacMap;
          if (engineMode === "dynamic" && currentRecord.archive_year !== undefined) {
            const nextBase = ZodiacPatternAnalyzer.getBaseZodiacByYear(currentRecord.archive_year);
            activeMap = sliceAnalyzer._getZodiacMap(nextBase);
          }
          const actualZodiacs = actualNums.map(n => activeMap[n] || "未知");

          // Find leaks/fails (winning zodiacs that were mistakenly put into tierKill)
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
      }
      prediction.killInterceptHistory = killInterceptHistory;

      res.json({
        status: "success",
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
        const actualZodiacs = actualNums.map(n => activeMap[n]);
        const actualZSet = new Set(actualZodiacs);

        const hotHits = tierMatchHits(prediction.tierHot, actualZodiacs);
        const midHits = tierMatchHits(prediction.tierMid, actualZodiacs);
        const killHits = tierMatchHits(prediction.tierKill, actualZodiacs);

        const numHits = actualNums.filter(n => prediction.premiumHotNums.includes(n));

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
      const { year = 2026, baseZodiac, engineMode = "dynamic", customWeights, quarter, selectedYears, onlyListIssues, issueIds, freshnessEnabled = false, freshnessYears = 3 } = req.body;
      const files = getAvailableDataFiles();
      
      const targetYear = parseInt(year) || 2026;
      let targetFiles: string[] = [];

      if (Array.isArray(selectedYears) && selectedYears.length > 0) {
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
          freshnessYears: actualFreshnessYears
        });

        // Check actual draw details of the predicted issue
        const actualNums = currentRecord.numbers;
        let activeMap = analyzer.zodiacMap;
        if (engineMode === "dynamic" && currentRecord.archive_year !== undefined) {
          const nextBase = ZodiacPatternAnalyzer.getBaseZodiacByYear(currentRecord.archive_year);
          activeMap = analyzer._getZodiacMap(nextBase);
        }
        const actualZodiacs = actualNums.map(n => activeMap[n] || "未知");

        const hotHits = tierMatchHits(prediction.tierHot, actualZodiacs);
        const midHits = tierMatchHits(prediction.tierMid, actualZodiacs);
        const killHits = tierMatchHits(prediction.tierKill, actualZodiacs);
        const numHits = actualNums.filter(n => prediction.premiumHotNums.includes(n));

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
            premiumHotNums: prediction.premiumHotNums,
            difficultyScore: prediction.difficultyScore,
            conclusion: prediction.conclusion,
            scores: prediction.scores,
            calibration: prediction.calibration
          },
          metrics: {
            hotHits,
            midHits,
            killHits,
            numHits,
            hasHotHit,
            hasMidHit,
            isPerfectKill
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
          weightedHitRate
        },
        results
      });
    } catch (e: any) {
      console.error("Year backtest failed:", e);
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
