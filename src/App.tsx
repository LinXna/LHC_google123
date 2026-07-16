import React, { useState, useEffect } from "react";
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

  // Applied/Active settings - used for backend API requests and reports display
  const [appliedYears, setAppliedYears] = useState<string[]>([]);
  const [appliedBaseZodiac, setAppliedBaseZodiac] = useState<string>("马");
  const [appliedEngineMode, setAppliedEngineMode] = useState<"unified" | "dynamic">("dynamic");
  const [appliedFreshnessEnabled, setAppliedFreshnessEnabled] = useState<boolean>(false);
  const [appliedFreshnessYears, setAppliedFreshnessYears] = useState<number>(3);

  const [loading, setLoading] = useState<boolean>(false);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [latestYear, setLatestYear] = useState<number>(2026);
  const [latestRecord, setLatestRecord] = useState<any | null>(null);
  const [report, setReport] = useState<AnalyzerReport | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);

  const hasChanges = 
    JSON.stringify([...selectedYears].sort()) !== JSON.stringify([...appliedYears].sort()) ||
    baseZodiac !== appliedBaseZodiac ||
    engineMode !== appliedEngineMode ||
    freshnessEnabled !== appliedFreshnessEnabled ||
    freshnessYears !== appliedFreshnessYears;

  // Initial Fetch: List of available years
  useEffect(() => {
    const fetchYears = async () => {
      try {
        const res = await fetch("/api/years");
        const data = await res.json();
        if (data.status === "success") {
          setYears(data.years);
          // 优化默认策略：按年份倒序排列，默认仅选中最近 5 年数据，避免久远历史规律稀释近期强特征行为
          const sortedYears = [...data.years].sort((a: any, b: any) => b.year - a.year);
          const defaultSelectFiles = sortedYears.slice(0, 5).map((y: any) => y.filename);
          setSelectedYears(defaultSelectFiles);
          setAppliedYears(defaultSelectFiles);
        }
      } catch (err) {
        console.error("Failed to fetch years:", err);
      }
    };
    fetchYears();
  }, []);

  // Fallback to dashboard tab if no years are applied
  useEffect(() => {
    if (appliedYears.length === 0 && activeTab !== "dashboard") {
      setActiveTab("dashboard");
    }
  }, [appliedYears, activeTab]);

  // When applied settings change, run analysis
  useEffect(() => {
    if (appliedYears.length > 0) {
      runAnalysis();
    }
  }, [appliedYears, appliedBaseZodiac, appliedEngineMode, appliedFreshnessEnabled, appliedFreshnessYears]);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        setReport(data.report);
        setTotalRecords(data.totalRecords);
        setLatestYear(data.latestYear);
        if (!appliedBaseZodiac && data.baseZodiac) {
          setAppliedBaseZodiac(data.baseZodiac);
          setBaseZodiac(data.baseZodiac);
        }

        // Derive latest draw info from report data
        if (data.report && data.report.last_issue_data) {
          const l = data.report.last_issue_data;
          setLatestRecord({
            issue: l.issue,
            date: l.date,
            numbers: l.numbers,
            zodiacs: l.zodiacs,
            diversity: l.diversity
          });
        }
      }
    } catch (err) {
      console.error("Analysis request failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleApplySettings = () => {
    setAppliedYears(selectedYears);
    setAppliedBaseZodiac(baseZodiac);
    setAppliedEngineMode(engineMode);
    setAppliedFreshnessEnabled(freshnessEnabled);
    setAppliedFreshnessYears(freshnessYears);
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
          customWeights,
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
            />

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
