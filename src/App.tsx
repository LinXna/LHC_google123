import React, { useState, useEffect, useRef } from "react";
import { 
  Database, 
  Compass, 
  BarChart2, 
  History, 
  GitMerge, 
  Brain,
  Layers,
  Award
} from "lucide-react";
import { DashboardOverview } from "./components/DashboardOverview.tsx";
import { PatternFinderSection } from "./components/PatternFinderSection.tsx";
import { CompanionAndGapsSection } from "./components/CompanionAndGapsSection.tsx";
import { SmartPredictorSection } from "./components/SmartPredictorSection.tsx";
import { BacktestSimulatorSection } from "./components/BacktestSimulatorSection.tsx";
import { PerformanceMonitorPanel } from "./components/PerformanceMonitorPanel.tsx";
import { AnalyzerReport, PredictionResult } from "./types.js";

function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [years, setYears] = useState<{ filename: string; year: number }[]>([]);
  
  // Pending settings - edited by user in UI but NOT yet applied for computation
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [baseZodiac, setBaseZodiac] = useState<string>("马");
  const [engineMode, setEngineMode] = useState<"unified" | "dynamic">("dynamic");
  const [freshnessEnabled, setFreshnessEnabled] = useState<boolean>(false);
  const [freshnessYears, setFreshnessYears] = useState<number>(3);
  const [deathBlowFilterEnabled, setDeathBlowFilterEnabled] = useState<boolean>(true);
  const [autoSave, setAutoSave] = useState<boolean>(true);

  // Applied/Active settings - used for backend API requests and reports display
  const [appliedYears, setAppliedYears] = useState<string[]>([]);
  const [appliedBaseZodiac, setAppliedBaseZodiac] = useState<string>("马");
  const [appliedEngineMode, setAppliedEngineMode] = useState<"unified" | "dynamic">("dynamic");
  const [appliedFreshnessEnabled, setAppliedFreshnessEnabled] = useState<boolean>(false);
  const [appliedFreshnessYears, setAppliedFreshnessYears] = useState<number>(3);
  const [appliedDeathBlowFilterEnabled, setAppliedDeathBlowFilterEnabled] = useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(false);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [latestYear, setLatestYear] = useState<number>(2026);
  const [latestRecord, setLatestRecord] = useState<any | null>(null);
  const [report, setReport] = useState<AnalyzerReport | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [calcDuration, setCalcDuration] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Local cache for analysis results mapping parameter string to result object
  const cacheRef = useRef<Record<string, {
    report: AnalyzerReport;
    totalRecords: number;
    latestYear: number;
    baseZodiac: string;
    latestRecord: any;
    prediction: PredictionResult;
  }>>({});

  const getCacheKey = (
    yrs: string[],
    baseZod: string,
    mode: string,
    freshEnabled: boolean,
    freshYrs: number,
    deathBlowEnabled: boolean
  ) => {
    return JSON.stringify({
      years: [...yrs].sort(),
      baseZod,
      mode,
      freshEnabled,
      freshYrs,
      deathBlowEnabled,
    });
  };

  const hasChanges = 
    JSON.stringify([...selectedYears].sort()) !== JSON.stringify([...appliedYears].sort()) ||
    baseZodiac !== appliedBaseZodiac ||
    engineMode !== appliedEngineMode ||
    freshnessEnabled !== appliedFreshnessEnabled ||
    freshnessYears !== appliedFreshnessYears ||
    deathBlowFilterEnabled !== appliedDeathBlowFilterEnabled;

  // Initial Fetch: List of available years
  useEffect(() => {
    const fetchYears = async () => {
      try {
        const res = await fetch("/api/years");
        const data = await res.json();
        if (data.status === "success") {
          // Keep years descending so recent years are on top!
          const sortedYears = [...data.years].sort((a: any, b: any) => b.year - a.year);
          setYears(sortedYears);
          // 历史数据默认搜索2001年到2026年数据，更早的数据默认不选中，可以手动选择
          const defaultSelectFiles = sortedYears
            .filter((y: any) => y.year >= 2001 && y.year <= 2026)
            .map((y: any) => y.filename);
          setSelectedYears(defaultSelectFiles);
          setAppliedYears(defaultSelectFiles);
        }
      } catch (err) {
        console.error("Failed to fetch years:", err);
      }
    };
    fetchYears();
  }, []);

  // Dynamically bound freshnessYears within 1 to maxYear - minYear when selectedYears changes
  useEffect(() => {
    const selectedYearNumbers = selectedYears
      .map(f => {
        const yr = parseInt(f.split(".")[0]);
        return isNaN(yr) ? null : yr;
      })
      .filter((yr): yr is number => yr !== null)
      .sort((a, b) => b - a);
    
    if (selectedYearNumbers.length > 1) {
      const maxYear = selectedYearNumbers[0];
      const minYear = selectedYearNumbers[selectedYearNumbers.length - 1];
      const maxAllowed = maxYear - minYear;
      if (freshnessYears > maxAllowed) {
        setFreshnessYears(Math.max(1, Math.min(3, maxAllowed)));
      }
    } else {
      setFreshnessYears(1);
    }
  }, [selectedYears, freshnessYears]);

  // Fallback to dashboard tab if no years are applied
  useEffect(() => {
    if (appliedYears.length === 0 && activeTab !== "dashboard") {
      setActiveTab("dashboard");
    }
  }, [appliedYears, activeTab]);

  // Debounce logic for parameter auto-save under dynamic zodiac mode (delay 500ms before automatic validation & calculation)
  useEffect(() => {
    if (autoSave && engineMode === "dynamic") {
      const changed = 
        JSON.stringify([...selectedYears].sort()) !== JSON.stringify([...appliedYears].sort()) ||
        baseZodiac !== appliedBaseZodiac ||
        engineMode !== appliedEngineMode ||
        freshnessEnabled !== appliedFreshnessEnabled ||
        freshnessYears !== appliedFreshnessYears ||
        deathBlowFilterEnabled !== appliedDeathBlowFilterEnabled;

      if (changed && selectedYears.length > 0) {
        const handler = setTimeout(() => {
          handleApplySettings();
        }, 500);
        return () => clearTimeout(handler);
      }
    }
  }, [
    selectedYears,
    baseZodiac,
    engineMode,
    freshnessEnabled,
    freshnessYears,
    deathBlowFilterEnabled,
    autoSave,
    appliedYears,
    appliedBaseZodiac,
    appliedEngineMode,
    appliedFreshnessEnabled,
    appliedFreshnessYears,
    appliedDeathBlowFilterEnabled
  ]);

  // When applied settings change, run analysis
  useEffect(() => {
    if (appliedYears.length > 0) {
      runAnalysis();
    }
  }, [
    appliedYears,
    appliedBaseZodiac,
    appliedEngineMode,
    appliedFreshnessEnabled,
    appliedFreshnessYears,
    appliedDeathBlowFilterEnabled
  ]);

  const runAnalysis = async () => {
    const cacheKey = getCacheKey(
      appliedYears,
      appliedBaseZodiac,
      appliedEngineMode,
      appliedFreshnessEnabled,
      appliedFreshnessYears,
      appliedDeathBlowFilterEnabled
    );

    // 1. Check local cache state to avoid redundant calls
    if (cacheRef.current[cacheKey]) {
      const cached = cacheRef.current[cacheKey];
      setReport(cached.report);
      setTotalRecords(cached.totalRecords);
      setLatestYear(cached.latestYear);
      if (!appliedBaseZodiac && cached.baseZodiac) {
        setAppliedBaseZodiac(cached.baseZodiac);
        setBaseZodiac(cached.baseZodiac);
      }
      setLatestRecord(cached.latestRecord);
      setPrediction(cached.prediction);
      setCalcDuration(0.1); // Extremely fast indicator
      return;
    }

    // 2. Cancel pending requests via AbortController
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const startTime = performance.now();
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          selectedYears: appliedYears,
          baseZodiac: appliedBaseZodiac,
          engineMode: appliedEngineMode,
          freshnessEnabled: appliedFreshnessEnabled,
          freshnessYears: appliedFreshnessYears,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        let currentBaseZodiac = appliedBaseZodiac;
        if (!appliedBaseZodiac && data.baseZodiac) {
          setAppliedBaseZodiac(data.baseZodiac);
          setBaseZodiac(data.baseZodiac);
          currentBaseZodiac = data.baseZodiac;
        }

        let lRecord: any = null;
        if (data.report && data.report.last_issue_data) {
          const l = data.report.last_issue_data;
          lRecord = {
            issue: l.issue,
            date: l.date,
            numbers: l.numbers,
            zodiacs: l.zodiacs,
            diversity: l.diversity
          };
        }
        
        // Fetch prediction using the same abort signal
        const predRes = await fetch("/api/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            selectedYears: appliedYears,
            baseZodiac: currentBaseZodiac,
            engineMode: appliedEngineMode,
            customWeights: {
              deathBlowFilterEnabled: appliedDeathBlowFilterEnabled
            },
            freshnessEnabled: appliedFreshnessEnabled,
            freshnessYears: appliedFreshnessYears,
          }),
        });
        const predData = await predRes.json();
        if (predData.status === "success") {
          setReport(data.report);
          setTotalRecords(data.totalRecords);
          setLatestYear(data.latestYear);
          if (lRecord) setLatestRecord(lRecord);
          setPrediction(predData.prediction);

          // Store in local cache state
          cacheRef.current[cacheKey] = {
            report: data.report,
            totalRecords: data.totalRecords,
            latestYear: data.latestYear,
            baseZodiac: currentBaseZodiac,
            latestRecord: lRecord,
            prediction: predData.prediction
          };

          const endTime = performance.now();
          setCalcDuration(endTime - startTime);
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Analysis or prediction request was cancelled because parameters changed.");
      } else {
        console.error("Analysis request failed:", err);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handleApplySettings = () => {
    setAppliedYears(selectedYears);
    setAppliedBaseZodiac(baseZodiac);
    setAppliedEngineMode(engineMode);
    setAppliedFreshnessEnabled(freshnessEnabled);
    setAppliedFreshnessYears(freshnessYears);
    setAppliedDeathBlowFilterEnabled(deathBlowFilterEnabled);
  };

  const handleRunPrediction = async (customWeights?: { w1: number; w2: number }) => {
    setLoading(true);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedYears: appliedYears,
          baseZodiac: appliedBaseZodiac,
          engineMode: appliedEngineMode,
          customWeights: {
            ...customWeights,
            deathBlowFilterEnabled: appliedDeathBlowFilterEnabled
          },
          freshnessEnabled: appliedFreshnessEnabled,
          freshnessYears: appliedFreshnessYears
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setPrediction(data.prediction);
        setActiveTab("predictor"); // Auto transition to predictor tab
      }
    } catch (err) {
      console.error("Prediction request failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Upper Navigation Rail */}
      <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-linear-to-b from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Brain className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                LHC 自动化双特征共振智能推演大盘
              </h1>
              <p className="text-[10px] text-slate-400 font-mono">
                ENGINE V2.1.0 • SWISS ARCHITECTURE
              </p>
            </div>
          </div>

          <div className="flex gap-1.5 bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "dashboard"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-slate-700"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              主控审计舱
            </button>
            <button
              onClick={() => appliedYears.length > 0 && setActiveTab("pattern")}
              disabled={appliedYears.length === 0}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                appliedYears.length === 0
                  ? "text-slate-600 cursor-not-allowed opacity-40"
                  : activeTab === "pattern"
                  ? "bg-indigo-600 text-white shadow-xs cursor-pointer"
                  : "text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
              }`}
              title={appliedYears.length === 0 ? "请先选择数据年份并确认应用参数" : "高频规律挖掘"}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              高频规律挖掘
            </button>
            <button
              onClick={() => appliedYears.length > 0 && setActiveTab("predictor")}
              disabled={appliedYears.length === 0}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                appliedYears.length === 0
                  ? "text-slate-600 cursor-not-allowed opacity-40"
                  : activeTab === "predictor"
                  ? "bg-indigo-600 text-white shadow-xs cursor-pointer"
                  : "text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
              }`}
              title={appliedYears.length === 0 ? "请先选择数据年份并确认应用参数" : "推演预测决策"}
            >
              <Compass className="w-3.5 h-3.5" />
              推演预测决策
            </button>
            <button
              onClick={() => appliedYears.length > 0 && setActiveTab("simulator")}
              disabled={appliedYears.length === 0}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                appliedYears.length === 0
                  ? "text-slate-600 cursor-not-allowed opacity-40"
                  : activeTab === "simulator"
                  ? "bg-indigo-600 text-white shadow-xs cursor-pointer"
                  : "text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
              }`}
              title={appliedYears.length === 0 ? "请先选择数据年份并确认应用参数" : "穿透回测"}
            >
              <History className="w-3.5 h-3.5" />
              穿透回测
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {loading && (
          <div className="fixed top-20 right-8 z-50 bg-white border border-gray-100 shadow-xl rounded-2xl p-4 flex items-center gap-3 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></span>
            <span className="text-xs font-semibold text-gray-700">算法引擎计算中...</span>
          </div>
        )}

        {/* Tab 1: Dashboard Overview */}
        {activeTab === "dashboard" && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
              <div className="xl:col-span-3">
                <DashboardOverview
                  years={years}
                  selectedYears={selectedYears}
                  setSelectedYears={setSelectedYears}
                  baseZodiac={baseZodiac}
                  setBaseZodiac={setBaseZodiac}
                  engineMode={engineMode}
                  setEngineMode={setEngineMode}
                  appliedYears={appliedYears}
                  appliedBaseZodiac={appliedBaseZodiac}
                  appliedEngineMode={appliedEngineMode}
                  onApplySettings={handleApplySettings}
                  loading={loading}
                  onRefresh={runAnalysis}
                  totalRecords={totalRecords}
                  latestYear={latestYear}
                  latestRecord={latestRecord}
                  report={report}
                  prediction={prediction}
                  freshnessEnabled={freshnessEnabled}
                  setFreshnessEnabled={setFreshnessEnabled}
                  freshnessYears={freshnessYears}
                  setFreshnessYears={setFreshnessYears}
                  appliedFreshnessEnabled={appliedFreshnessEnabled}
                  appliedFreshnessYears={appliedFreshnessYears}
                  deathBlowFilterEnabled={deathBlowFilterEnabled}
                  setDeathBlowFilterEnabled={setDeathBlowFilterEnabled}
                  appliedDeathBlowFilterEnabled={appliedDeathBlowFilterEnabled}
                  autoSave={autoSave}
                  setAutoSave={setAutoSave}
                />
              </div>
              <div className="xl:col-span-1 h-full">
                <PerformanceMonitorPanel
                  loading={loading}
                  calcDuration={calcDuration}
                  report={report}
                  prediction={prediction}
                  appliedYears={appliedYears}
                  appliedEngineMode={appliedEngineMode}
                  appliedFreshnessEnabled={appliedFreshnessEnabled}
                  appliedFreshnessYears={appliedFreshnessYears}
                  hasChanges={hasChanges}
                  onTriggerCalculation={() => {
                    if (hasChanges) {
                      handleApplySettings();
                    } else {
                      runAnalysis();
                    }
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900 mb-2">自动化智能推荐快捷发起</h2>
                  <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                    无需手动审视高频规律，直接对冲当前最新大底指标，一键生成契合《zodiac_advanced_report.txt》的高精度推演建议与实战特码弹药配置。
                  </p>
                </div>
                <div>
                  <button
                    onClick={() => handleRunPrediction()}
                    disabled={loading || hasChanges}
                    className={`w-full px-5 py-2.5 text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      loading || hasChanges
                        ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md border border-indigo-600"
                    }`}
                  >
                    <Compass className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    {hasChanges ? "请先点击上方“确认应用参数并重新计算”" : "立即激活一键推演预测决策"}
                  </button>
                  {hasChanges && (
                    <p className="text-[11px] text-amber-600 font-semibold mt-2.5 flex items-center gap-1.5">
                      ⚠️ 警告: 请先点击上方“确认应用参数并重新计算”重新加载。
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900 mb-2">2026全年度真实命中诊断与穿透回测</h2>
                  <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                    使用全部历史年份作为计算参数，对2026年已开奖的每一期进行严密回溯仿真，审计核心主攻与稳健防守的综合命中率，自动出具SWOT优势与局限性分析。
                  </p>
                </div>
                <div>
                  <button
                    onClick={() => setActiveTab("simulator")}
                    className="w-full px-5 py-2.5 text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer bg-slate-900 hover:bg-slate-800 text-white border border-slate-900"
                  >
                    <History className="w-4 h-4 text-indigo-400" />
                    进入“穿透回测”舱启动年度审计
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Pattern Finder Section */}
        {activeTab === "pattern" && (
          <div className="space-y-8">
            <PatternFinderSection 
              report={report} 
              baseZodiac={appliedBaseZodiac} 
              latestRecord={latestRecord} 
              years={years}
              engineMode={appliedEngineMode}
            />
            <CompanionAndGapsSection report={report} />
          </div>
        )}

        {/* Tab 3: Smart Predictor Section */}
        {activeTab === "predictor" && (
          <div className="space-y-8">
            <SmartPredictorSection
              prediction={prediction}
              loading={loading}
              onRunPredict={handleRunPrediction}
            />
          </div>
        )}

        {/* Tab 4: Backtest Simulator Section */}
        {activeTab === "simulator" && (
          <div className="space-y-8">
            <BacktestSimulatorSection
              years={years}
              selectedYears={appliedYears}
              baseZodiac={appliedBaseZodiac}
              engineMode={appliedEngineMode}
              freshnessEnabled={appliedFreshnessEnabled}
              freshnessYears={appliedFreshnessYears}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-400">
          <div>
            &copy; 2026 LHC 自动化双特征共振推演系统. All rights reserved.
          </div>
          <div className="flex gap-4 font-mono">
            <span>UNIFIED SYSTEM FRAMEWORK</span>
            <span>•</span>
            <span>TYPESCRIPT HIGH PRECISION ENG</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
