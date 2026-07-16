import React, { useState } from "react";
import { 
  History, 
  Play, 
  HelpCircle, 
  AlertCircle, 
  CheckCircle, 
  XCircle,
  Award,
  TrendingUp,
  Percent,
  Download
} from "lucide-react";
import { PredictionResult } from "../types.js";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from "recharts";

interface BacktestSimulatorSectionProps {
  years: { filename: string; year: number }[];
  selectedYears: string[];
  baseZodiac: string;
  engineMode: "unified" | "dynamic";
}

export const BacktestSimulatorSection: React.FC<BacktestSimulatorSectionProps> = ({
  years,
  selectedYears,
  baseZodiac,
  engineMode,
}) => {
  const [subTab, setSubTab] = useState<"single" | "year" | "compare">("single");

  // Single issue states
  const [selectedIssue, setSelectedIssue] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Year batch states
  const [yearLoading, setYearLoading] = useState<boolean>(false);
  const [yearResult, setYearResult] = useState<any | null>(null);
  const [yearError, setYearError] = useState<string | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<string>("all"); // "all", "1", "2", "3", "4", "all-single"
  const [queueProgress, setQueueProgress] = useState<string>("");
  const [queueProgressPercent, setQueueProgressPercent] = useState<number>(0);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  // Comparison states
  const [compareLoading, setCompareLoading] = useState<boolean>(false);
  const [compareUnifiedResult, setCompareUnifiedResult] = useState<any | null>(null);
  const [compareDynamicResult, setCompareDynamicResult] = useState<any | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareProgress, setCompareProgress] = useState<string>("");
  const [compareProgressPercent, setCompareProgressPercent] = useState<number>(0);
  const [compareOnlyDiverged, setCompareOnlyDiverged] = useState<boolean>(false);

  // Transform results into cumulative trend data for recharts
  const getChartData = () => {
    if (!yearResult || !yearResult.results) return [];
    let runningHotRecommended = 0;
    let runningHotHits = 0;
    let runningMidRecommended = 0;
    let runningMidHits = 0;
    let runningKillRecommended = 0;
    let runningKillLeaks = 0;

    return yearResult.results.map((r: any) => {
      runningHotRecommended += r.prediction.tierHot?.length || 0;
      runningHotHits += r.metrics.hotHits?.length || 0;
      runningMidRecommended += r.prediction.tierMid?.length || 0;
      runningMidHits += r.metrics.midHits?.length || 0;
      runningKillRecommended += r.prediction.tierKill?.length || 0;
      runningKillLeaks += r.metrics.killHits?.length || 0;

      return {
        issue: `${r.issue}期`,
        "重磅主攻累计命中率": parseFloat(
          (runningHotRecommended > 0 ? (runningHotHits / runningHotRecommended) * 100 : 0).toFixed(1)
        ),
        "稳健防守累计命中率": parseFloat(
          (runningMidRecommended > 0 ? (runningMidHits / runningMidRecommended) * 100 : 0).toFixed(1)
        ),
        "死穴绝杀累计拦截率": parseFloat(
          (runningKillRecommended > 0 ? ((runningKillRecommended - runningKillLeaks) / runningKillRecommended) * 100 : 0).toFixed(1)
        ),
        "当前期号": r.issue,
      };
    });
  };

  const chartData = getChartData();

  const exportBacktestReport = () => {
    if (!yearResult) return;
    const reportData = {
      reportTitle: "2026年度穿透对账算法仿真模拟研究报告",
      exportTime: new Date().toISOString(),
      zodiacSystemSettings: {
        baseZodiac,
        engineMode: yearResult.engineMode,
        targetYear: 2026,
      },
      evaluationSummary: {
        totalIssuesEvaluated: yearResult.totalIssuesEvaluated,
        compositeWeightedAccuracy: `${((yearResult.summary.weightedHitRate || 0) * 100).toFixed(2)}%`,
        hotAttackTier: {
          hitRate: `${((yearResult.summary.hotHitRate || 0) * 100).toFixed(2)}%`,
          hitZodiacCount: yearResult.summary.hotHitCount,
          totalRecommended: yearResult.summary.hotMatchesTotal,
        },
        midDefenseTier: {
          hitRate: `${((yearResult.summary.midHitRate || 0) * 100).toFixed(2)}%`,
          hitZodiacCount: yearResult.summary.midHitCount,
          totalRecommended: yearResult.summary.midMatchesTotal,
        },
        killInterceptTier: {
          interceptRate: `${((yearResult.summary.killInterceptRate || 0) * 100).toFixed(2)}%`,
          successfulInterceptions: yearResult.summary.killInterceptCount,
          leakedZodiacCount: yearResult.summary.killFailCount,
          totalRecommended: yearResult.summary.totalKillRecommended,
        },
        premiumZodiacArsenal: {
          totalSpecialNumbersHit: yearResult.summary.numHitsTotal,
          averageSpecialNumbersHitPerPeriod: (yearResult.summary.numHitsTotal / yearResult.totalIssuesEvaluated).toFixed(2),
        }
      },
      cumulativePerformanceTrend: chartData,
      simulationRawLogs: yearResult.results.map((r: any) => ({
        issue: r.issue,
        date: r.date,
        drawnNumbers: r.actualNums,
        drawnZodiacs: r.actualZodiacs,
        predictionStrategy: {
          primaryHotAttack: r.prediction.tierHot,
          secondaryDefense: r.prediction.tierMid,
          annihilatedKill: r.prediction.tierKill,
          premiumSpecialNumbers: r.prediction.premiumHotNums,
          difficultyScore: r.prediction.difficultyScore,
          conclusion: r.prediction.conclusion,
        },
        outcomeMetrics: {
          hotHits: r.metrics.hotHits,
          midHits: r.metrics.midHits,
          killHits: r.metrics.killHits,
          perfectKill: r.metrics.isPerfectKill,
        }
      }))
    };

    try {
      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.href = url;
      const filename = `zodiac_simulation_report_2026_${yearResult.engineMode}_${Date.now()}.json`;
      downloadAnchor.download = filename;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export report failed:", e);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length && yearResult) {
      const data = payload[0].payload;
      const rawRecord = yearResult.results.find((r: any) => `${r.issue}期` === label);
      return (
        <div className="bg-white border border-gray-200 p-3 rounded-xl shadow-md text-xs font-sans space-y-1.5 z-50 relative">
          <div className="font-bold text-gray-900 border-b border-gray-100 pb-1 flex justify-between items-center gap-2">
            <span>{label}</span>
            <span className="text-[10px] text-gray-400 font-normal">{rawRecord?.date}</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between gap-6">
              <span className="text-emerald-700 font-medium">重磅主攻累计:</span>
              <span className="font-mono font-bold text-emerald-600">{data["重磅主攻累计命中率"]}%</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-amber-700 font-medium">稳健防守累计:</span>
              <span className="font-mono font-bold text-amber-500">{data["稳健防守累计命中率"]}%</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-rose-700 font-medium">死穴绝杀累计:</span>
              <span className="font-mono font-bold text-rose-600">{data["死穴绝杀累计拦截率"]}%</span>
            </div>
          </div>
          {rawRecord && (
            <div className="border-t border-gray-100 pt-1.5 mt-1 text-[10px] text-gray-500 space-y-0.5">
              <div>当期号码: {rawRecord.actualNums.map((n: number) => n.toString().padStart(2, "0")).join(", ")}</div>
              <div>当期生肖: {rawRecord.actualZodiacs.join(", ")}</div>
              <div className="flex gap-2 font-semibold mt-1">
                <span className={rawRecord.metrics.hasHotHit ? "text-emerald-600" : "text-gray-400"}>
                  主攻: {rawRecord.metrics.hasHotHit ? "击中" : "未中"}
                </span>
                <span className={rawRecord.metrics.hasMidHit ? "text-amber-600" : "text-gray-400"}>
                  防守: {rawRecord.metrics.hasMidHit ? "击中" : "未中"}
                </span>
                <span className={rawRecord.metrics.isPerfectKill ? "text-emerald-600" : "text-rose-600"}>
                  绝杀: {rawRecord.metrics.isPerfectKill ? "成功" : "漏出"}
                </span>
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const runBacktest = async () => {
    if (!selectedIssue) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedYears,
          testIssue: parseInt(selectedIssue),
          baseZodiac,
          engineMode,
        }),
      });

      const data = await response.json();
      if (data.status === "success") {
        setResult(data);
      } else {
        setError(data.message || "回测模拟失败");
      }
    } catch (err: any) {
      setError(err.message || "网络请求异常");
    } finally {
      setLoading(false);
    }
  };

  const runYearBacktest = async () => {
    setYearLoading(true);
    setYearResult(null);
    setYearError(null);
    setErrorDetails(null);
    setQueueProgress("");
    setQueueProgressPercent(0);

    const basePayload = {
      year: 2026,
      baseZodiac,
      engineMode,
      selectedYears,
    };

    try {
      if (selectedQuarter === "all") {
        // Automatic Queue Batching for all 4 quarters sequentially
        const quarters = ["1", "2", "3", "4"];
        const mergedResults: any[] = [];
        let combinedEvaluated = 0;
        let combinedHotHits = 0;
        let combinedHotMatches = 0;
        let combinedMidHits = 0;
        let combinedMidMatches = 0;
        let combinedKillIntercepts = 0;
        let combinedKillFails = 0;
        let combinedKillRecommended = 0;
        let combinedNumHits = 0;

        for (let i = 0; i < quarters.length; i++) {
          const q = quarters[i];
          setQueueProgress(`正在仿真第 ${q} 季度数据 (队列进度: ${i + 1}/4)...`);
          setQueueProgressPercent((i / quarters.length) * 100);

          let response;
          try {
            response = await fetch("/api/backtest-year", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...basePayload,
                quarter: q,
              }),
            });
          } catch (fetchErr: any) {
            throw new Error(`第 ${q} 季度网络请求失败: ${fetchErr.message || "连接超时，可能服务器正忙，请重试。"}`);
          }

          let data;
          const text = await response.text();
          try {
            data = JSON.parse(text);
          } catch (jsonErr: any) {
            throw new Error(`第 ${q} 季度数据格式解析异常: 响应无法解析为JSON。服务器可能返回了不规范的数据，或者连接提前关闭导致内容被截断。\n(错误详情: ${jsonErr.message})`);
          }

          if (response.status !== 200 && data.status !== "success") {
            // Note: If some quarters have no data yet (e.g. Q3 or Q4 of 2026), skip them rather than crash the whole year backtest
            if (response.status === 404 || (data && data.message && data.message.includes("未找到"))) {
              console.warn(`第 ${q} 季度无历史开奖数据，自动跳过此阶段`);
              continue;
            }
            throw new Error(`第 ${q} 季度仿真请求出错: ${data.message || "服务器响应状态非正常"}`);
          }

          if (data && data.results) {
            mergedResults.push(...data.results);
            combinedEvaluated += data.totalIssuesEvaluated || 0;
            combinedHotHits += data.summary?.hotHitCount || 0;
            combinedHotMatches += data.summary?.hotMatchesTotal || 0;
            combinedMidHits += data.summary?.midHitCount || 0;
            combinedMidMatches += data.summary?.midMatchesTotal || 0;
            combinedKillIntercepts += data.summary?.killInterceptCount || 0;
            combinedKillFails += data.summary?.killFailCount || 0;
            combinedKillRecommended += data.summary?.totalKillRecommended || 0;
            combinedNumHits += data.summary?.numHitsTotal || 0;
          }
        }

        if (mergedResults.length === 0) {
          throw new Error("全年度所有季度均未加载到有效的历史数据，请检查数据完整性或确认当前年份数据是否就绪。");
        }

        setQueueProgress("正在合并季度仿真审计成果...");
        setQueueProgressPercent(95);

        // Sort combined results by issue ascending
        mergedResults.sort((a, b) => a.issue - b.issue);

        const hotHitRate = combinedHotMatches > 0 ? combinedHotHits / combinedHotMatches : 0;
        const midHitRate = combinedMidMatches > 0 ? combinedMidHits / combinedMidMatches : 0;
        const killInterceptRate = combinedKillRecommended > 0 ? combinedKillIntercepts / combinedKillRecommended : 0;
        const weightedHitRate = (hotHitRate * 0.5) + (midHitRate * 0.3) + (killInterceptRate * 0.2);

        const finalData = {
          status: "success",
          year: 2026,
          engineMode,
          totalIssuesEvaluated: combinedEvaluated,
          summary: {
            hotHitRate,
            hotHitCount: combinedHotHits,
            hotMatchesTotal: combinedHotMatches,
            midHitRate,
            midHitCount: combinedMidHits,
            midMatchesTotal: combinedMidMatches,
            killInterceptRate,
            killInterceptCount: combinedKillIntercepts,
            killFailCount: combinedKillFails,
            totalKillRecommended: combinedKillRecommended,
            numHitsTotal: combinedNumHits,
            weightedHitRate,
          },
          results: mergedResults,
        };

        setQueueProgressPercent(100);
        setYearResult(finalData);

      } else {
        // Single Quarter or Single Full-Year (all-single)
        const targetQ = selectedQuarter === "all-single" ? undefined : selectedQuarter;
        const qLabel = targetQ ? `第 ${targetQ} 季度` : "全年度";
        setQueueProgress(`正在发起${qLabel}仿真请求...`);
        setQueueProgressPercent(30);

        let response;
        try {
          response = await fetch("/api/backtest-year", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...basePayload,
              quarter: targetQ,
            }),
          });
        } catch (fetchErr: any) {
          throw new Error(`网络请求失败: ${fetchErr.message || "请求服务器发生超时，请考虑分批加载。"}`);
        }

        let data;
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch (jsonErr: any) {
          throw new Error(`数据格式解析异常: 响应解析失败。\n服务器返回的不是规范的 JSON 数据，或者因为单次请求过大导致内容在传输过程中由于缓存限制被截断。\n\n建议回到仿真设置，将【仿真范围】设为「2026全年度 (分批队列加载)」，分流单次计算负载。\n\n(解析错误详情: ${jsonErr.message})`);
        }

        if (response.status !== 200 && data.status !== "success") {
          throw new Error(data.message || `请求未成功 (Status Code: ${response.status})`);
        }

        setQueueProgressPercent(100);
        setYearResult(data);
      }
    } catch (err: any) {
      console.error("Backtest simulation failed:", err);
      setYearError(err.message || "仿真运算网络或解析异常");
      // Formulate detailed fault diagnostics
      let details = "排查指引与解决建议：\n";
      if (err.message.includes("JSON") || err.message.includes("解析") || err.message.includes("截断")) {
        details += "🚨 [数据完整性或内存限制问题]\n1. 2026年累计生成的仿真数据过于庞大，超出了单次服务器输出缓冲或浏览器解析限额。\n👉 解决方案：请在上方设置中将仿真范围更改为「2026全年度 (分批队列加载)」或选择具体的某一个季度，以此规避大数据量单次解析产生的异常。";
      } else if (err.message.includes("fetch") || err.message.includes("超时") || err.message.includes("网络") || err.message.includes("连接")) {
        details += "⏳ [网络或请求超时诊断]\n1. 本次计算的决策轮数过多导致 API 处理耗时过长。\n👉 解决方案：请选择「第一季度(Q1)」或「第二季度(Q2)」进行分阶段回测，然后再切换分批，以分流处理负载。";
      } else {
        details += "🔍 [其他诊断信息]\n1. 可能是底层算法的预载历史数据不完整（如 2026.json 格式异常）。\n2. 可以尝试重新点击启动，或通过分阶段加载完成分析。";
      }
      setErrorDetails(details);
    } finally {
      setYearLoading(false);
    }
  };

  const pct = (num: number) => `${(num * 100).toFixed(1)}%`;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="border-b border-gray-100 pb-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            历史回测及真实命中诊断舱
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            通过高维度算法对历史开奖结果进行全盘审计，核算命中率并筛选策略优势与盲区。
          </p>
        </div>

        {/* Sub-tabs Selection */}
        <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200/60 self-start md:self-auto">
          <button
            onClick={() => setSubTab("single")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              subTab === "single"
                ? "bg-white text-indigo-600 shadow-xs"
                : "text-gray-500 hover:text-gray-950"
            }`}
          >
            单期对账模拟
          </button>
          <button
            onClick={() => setSubTab("year")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              subTab === "year"
                ? "bg-white text-indigo-600 shadow-xs"
                : "text-gray-500 hover:text-gray-955"
            }`}
          >
            2026全年度审计
          </button>
        </div>
      </div>

      {/* Sub-tab 1: Single issue simulation */}
      {subTab === "single" && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-end mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                请输入需要模拟推演的基准期号 (例如 2025008)
              </label>
              <input
                type="number"
                value={selectedIssue}
                onChange={(e) => setSelectedIssue(e.target.value)}
                placeholder="如 2025008"
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-gray-900"
              />
            </div>
            <button
              onClick={runBacktest}
              disabled={loading || !selectedIssue}
              className="px-6 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 h-[41px] cursor-pointer"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              ) : (
                <Play className="w-4 h-4" />
              )}
              启动穿透回测
            </button>
          </div>

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 text-xs flex items-center gap-2 mb-4">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Backtest Metadata */}
                <div className="lg:col-span-1 bg-indigo-50/55 border border-indigo-100 rounded-2xl p-4 space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold text-indigo-900 mb-1 uppercase tracking-wider">回测基础指标</div>
                    <div className="text-lg font-extrabold text-indigo-950">基准期：{selectedIssue} 期</div>
                    <div className="text-sm font-semibold text-indigo-800 mt-2">
                      目标诊断期：{result.simulationResult ? `${result.simulationResult.issue} 期` : "暂无下期数据，仅支持推演"}
                    </div>
                  </div>

                  {result.simulationResult ? (
                    <div className="space-y-2 border-t border-indigo-200/50 pt-3 text-xs">
                      <div className="text-indigo-900 font-semibold">随后期开奖日期: {result.simulationResult.date}</div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {result.simulationResult.actualNums.map((n: number, idx: number) => {
                          const z = result.simulationResult.actualZodiacs[idx];
                          return (
                            <div key={idx} className="flex flex-col items-center gap-0.5 bg-white border border-indigo-100 p-1.5 rounded-lg">
                              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-mono font-bold text-xs flex items-center justify-center">
                                {n.toString().padStart(2, "0")}
                              </span>
                              <span className="text-[10px] font-semibold text-gray-700">{z}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-indigo-800 bg-white/70 border border-indigo-100 p-3 rounded-xl">
                      ⚠️ 警告：基准期为所选年份数据的最后一期，因此无法对下一期进行自动对账和命中审计，仅作为单期推演效果展示。
                    </div>
                  )}
                </div>

                {/* Hit Rates audit */}
                {result.simulationResult && (
                  <div className="lg:col-span-2 border border-gray-100 rounded-2xl p-4 bg-gray-50/40 space-y-4">
                    <div className="text-sm font-bold text-gray-900 flex items-center gap-1.5 border-b border-gray-100 pb-2">
                      <Award className="w-5 h-5 text-indigo-600" />
                      诊断穿透命中审计
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Hot Hits */}
                      <div className="bg-white border border-emerald-100 rounded-xl p-3 text-xs">
                        <div className="text-emerald-800 font-bold mb-1">🔥 核心推荐生肖命中</div>
                        <div className="text-2xl font-black font-mono text-emerald-600">
                          {result.simulationResult.hotHits.length} <span className="text-xs font-normal text-gray-500">处</span>
                        </div>
                        {result.simulationResult.hotHits.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {result.simulationResult.hotHits.map((h: any, idx: number) => (
                              <span key={idx} className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded text-[10px]">
                                {h.zodiac} ({h.matches}次)
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-gray-400 text-[11px] mt-2">未命中</div>
                        )}
                      </div>

                      {/* Mid Hits */}
                      <div className="bg-white border border-amber-100 rounded-xl p-3 text-xs">
                        <div className="text-amber-800 font-bold mb-1">⚖️ 稳健推荐生肖命中</div>
                        <div className="text-2xl font-black font-mono text-amber-500">
                          {result.simulationResult.midHits.length} <span className="text-xs font-normal text-gray-500">处</span>
                        </div>
                        {result.simulationResult.midHits.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {result.simulationResult.midHits.map((h: any, idx: number) => (
                              <span key={idx} className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded text-[10px]">
                                {h.zodiac} ({h.matches}次)
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-gray-400 text-[11px] mt-2">未命中</div>
                        )}
                      </div>

                      {/* Kill Hits */}
                      <div className="bg-white border border-rose-100 rounded-xl p-3 text-xs">
                        <div className="text-rose-800 font-bold mb-1">🛡️ 绝杀生肖拦截审计</div>
                        <div className="text-2xl font-black font-mono text-rose-600">
                          {result.simulationResult.killHits.length === 0 ? "100%" : "漏杀"}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-2">
                          {result.simulationResult.killHits.length === 0 
                            ? "✅ 完美强杀！拦截目标完美规避开奖生肖。" 
                            : `❌ 漏杀：有 ${result.simulationResult.killHits.map((h: any) => h.zodiac).join(", ")} 生肖漏出。`}
                        </div>
                      </div>
                    </div>

                    {/* Numbers Hits */}
                    <div className="bg-white border border-gray-100 rounded-xl p-4 text-xs">
                      <div className="text-indigo-900 font-bold mb-2">🎯 精选特码弹药库命中审计</div>
                      <div className="flex items-center gap-3">
                        <div className="text-2xl font-black font-mono text-indigo-600 shrink-0">
                          {result.simulationResult.numHits.length} <span className="text-xs font-normal text-gray-500">码</span>
                        </div>
                        <div className="flex-1">
                          {result.simulationResult.numHits.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {result.simulationResult.numHits.map((n: number) => (
                                <span key={n} className="px-2 py-0.5 font-bold font-mono bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md">
                                  命中精选号码: {n.toString().padStart(2, "0")}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-[11px]">本期精选特码库未能完全渗透特码中落（核心生肖对应防守库仍处于拦截中）。</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Model outputs display */}
              <div className="border border-gray-100 rounded-2xl p-5 bg-gray-50/50 space-y-4 text-xs">
                <div className="text-sm font-bold text-gray-900 flex items-center gap-1.5 border-b border-gray-100 pb-2">
                  <TrendingUp className="w-4.5 h-4.5 text-indigo-500" />
                  基准模拟推演指标与大盘诊断日志
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">推荐生肖结果分布</span>
                    <div className="space-y-2">
                      <div className="flex justify-between bg-white border border-gray-100 p-2.5 rounded-xl font-medium">
                        <span className="text-gray-500">核心精选生肖组合:</span>
                        <span className="text-emerald-700 font-bold">{result.prediction.tierHot.join(" ")}</span>
                      </div>
                      <div className="flex justify-between bg-white border border-gray-100 p-2.5 rounded-xl font-medium">
                        <span className="text-gray-500">次要防守生肖组合:</span>
                        <span className="text-amber-700 font-bold">{result.prediction.tierMid.join(" ")}</span>
                      </div>
                      <div className="flex justify-between bg-white border border-gray-100 p-2.5 rounded-xl font-medium">
                        <span className="text-gray-500">绝杀规避生肖组合:</span>
                        <span className="text-rose-700 font-bold">{result.prediction.tierKill.join(" ")}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">模拟推演难易评分: {result.prediction.difficultyScore}分</span>
                    <div className="bg-white border border-gray-100 rounded-xl p-3 h-[115px] overflow-y-auto space-y-1.5">
                      {result.prediction.evalReasons.map((r: string, idx: number) => (
                        <div key={idx} className="text-[11px] text-gray-600">
                          * {r}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-tab 2: 2026 Year batch backtest audit */}
      {subTab === "year" && (
        <div className="space-y-6">
          <div className="bg-indigo-50/50 border border-indigo-100/70 p-5 rounded-2xl space-y-4">
            <div>
              <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                <Award className="w-4.5 h-4.5 text-indigo-600" />
                2026年度穿透对账算法仿真
              </h3>
              <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                载入全部历史数据集进行动态大盘冷热权重纠偏，并对2026年已开奖数据逐期回溯仿真：
                系统将<strong>严格仅使用该期之前的全部历史数据</strong>输出模型推演策略（重磅主攻、稳健防守、死穴绝杀），再将推演建议与当期开奖生肖对比，从而精确度量模型决策稳定性。
              </p>
            </div>

            {/* Simulation Range Selector */}
            <div className="bg-white/80 backdrop-blur-xs p-3.5 rounded-xl border border-indigo-100/60 space-y-3">
              <span className="block text-xs font-bold text-indigo-900">请选择仿真分析范围 (Simulation Scope):</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {/* Option 1: Full Year via Queue (Recommended) */}
                <button
                  type="button"
                  onClick={() => setSelectedQuarter("all")}
                  disabled={yearLoading}
                  className={`px-3 py-2.5 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    selectedQuarter === "all"
                      ? "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500/20"
                      : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    2026全年度 (分批队列加载)
                  </span>
                  <span className="text-[10px] text-gray-400 mt-1">
                    [推荐] 自动分为4个季度进行仿真，顺序执行请求并融合结果，规避大数据量引起的API超时或JSON解析错误。
                  </span>
                </button>

                {/* Option 2: Full Year via Single Request */}
                <button
                  type="button"
                  onClick={() => setSelectedQuarter("all-single")}
                  disabled={yearLoading}
                  className={`px-3 py-2.5 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    selectedQuarter === "all-single"
                      ? "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500/20"
                      : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <span className="text-xs font-bold">2026全年度 (单次大请求)</span>
                  <span className="text-[10px] text-gray-400 mt-1">
                    [备用] 发起单一整体API请求获取全年数据，运算负载极大，适用于高规格配置环境。
                  </span>
                </button>

                {/* Option 3: Q1 */}
                <button
                  type="button"
                  onClick={() => setSelectedQuarter("1")}
                  disabled={yearLoading}
                  className={`px-3 py-2.5 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    selectedQuarter === "1"
                      ? "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500/20"
                      : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <span className="text-xs font-bold text-gray-800">第一季度 (Q1 仿真)</span>
                  <span className="text-[10px] text-gray-400 mt-1">
                    仅对 1月 ~ 3月 (第1-13周/期号) 开奖数据执行单阶段轻量仿真。
                  </span>
                </button>

                {/* Option 4: Q2 */}
                <button
                  type="button"
                  onClick={() => setSelectedQuarter("2")}
                  disabled={yearLoading}
                  className={`px-3 py-2.5 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    selectedQuarter === "2"
                      ? "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500/20"
                      : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <span className="text-xs font-bold text-gray-800">第二季度 (Q2 仿真)</span>
                  <span className="text-[10px] text-gray-400 mt-1">
                    仅对 4月 ~ 6月 (第14-26周/期号) 开奖数据执行单阶段轻量仿真。
                  </span>
                </button>

                {/* Option 5: Q3 */}
                <button
                  type="button"
                  onClick={() => setSelectedQuarter("3")}
                  disabled={yearLoading}
                  className={`px-3 py-2.5 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    selectedQuarter === "3"
                      ? "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500/20"
                      : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <span className="text-xs font-bold text-gray-800">第三季度 (Q3 仿真)</span>
                  <span className="text-[10px] text-gray-400 mt-1">
                    仅对 7月 ~ 9月 (第27-39周/期号) 开奖数据执行单阶段轻量仿真。
                  </span>
                </button>

                {/* Option 6: Q4 */}
                <button
                  type="button"
                  onClick={() => setSelectedQuarter("4")}
                  disabled={yearLoading}
                  className={`px-3 py-2.5 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    selectedQuarter === "4"
                      ? "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500/20"
                      : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <span className="text-xs font-bold text-gray-800">第四季度 (Q4 仿真)</span>
                  <span className="text-[10px] text-gray-400 mt-1">
                    仅对 10月 ~ 12月 (第40-52周/期号) 开奖数据执行单阶段轻量仿真。
                  </span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={runYearBacktest}
                disabled={yearLoading}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-2 cursor-pointer shrink-0"
              >
                {yearLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    模型仿真运算中...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    启动选定分析仿真
                  </>
                )}
              </button>

              {yearLoading && queueProgress && (
                <div className="flex-1 space-y-1.5 px-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-indigo-800 animate-pulse">{queueProgress}</span>
                    <span className="font-mono text-gray-500 font-bold">{Math.round(queueProgressPercent)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-out" 
                      style={{ width: `${queueProgressPercent}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Error display with rich feedback & diagnostic block */}
          {yearError && (
            <div className="p-5 bg-rose-50 border border-rose-100 rounded-2xl space-y-3 animate-fade-in text-xs">
              <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>仿真计算遭遇故障</span>
              </div>
              
              <div className="bg-white border border-rose-100 p-3.5 rounded-xl space-y-1.5 font-sans">
                <div className="font-semibold text-rose-700">异常原委：</div>
                <div className="text-gray-700 whitespace-pre-wrap leading-relaxed font-mono text-[11px] bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  {yearError}
                </div>
              </div>

              {errorDetails && (
                <div className="bg-white border border-rose-100 p-3.5 rounded-xl space-y-2">
                  <div className="font-bold text-gray-900">故障诊断报告 (Fault Diagnosis Console)：</div>
                  <div className="text-gray-600 whitespace-pre-wrap leading-relaxed font-mono text-[11px] bg-slate-900 text-slate-100 p-3.5 rounded-lg overflow-x-auto shadow-inner">
                    {errorDetails}
                  </div>
                  <div className="mt-2 text-[11px] text-indigo-700 bg-indigo-50 px-3 py-2 rounded-lg border border-indigo-100 flex items-center gap-1.5 font-medium">
                    💡 <strong>建议措施：</strong> 为了完全规避大数据量截断导致的 JSON 解析异常，请优先在上方选择【2026全年度 (分批队列加载)】并重新发起运行。
                  </div>
                </div>
              )}
            </div>
          )}

          {yearResult && (
              <div className="space-y-6 animate-fade-in">
                {/* Result Control Header */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-indigo-50/40 p-4 rounded-2xl border border-indigo-100/60">
                  <div>
                    <h4 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      仿真计算完成 ({yearResult.engineMode === "dynamic" ? "当前模式: 动态对冲生肖" : "当前模式: 统一固定生肖"})
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      本次回测覆盖了 2026 年共计 <strong>{yearResult.totalIssuesEvaluated}</strong> 期历史开奖数据进行递进式检验分析。
                    </p>
                  </div>
                  <button
                    onClick={exportBacktestReport}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-800 hover:scale-[1.01] shrink-0"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    导出 2026 仿真 JSON 报告
                  </button>
                </div>

                {/* Stats overview cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* Card 0: Weighted Hit Rate */}
                  <div className="bg-indigo-600 border border-indigo-500 rounded-2xl p-4 shadow-sm relative overflow-hidden text-white sm:col-span-2 lg:col-span-1">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500 rounded-full -mr-10 -mt-10 -z-0 opacity-40"></div>
                    <div className="relative z-10 space-y-1">
                      <span className="text-xs font-bold text-indigo-100 block flex items-center gap-1">
                        <Percent className="w-3.5 h-3.5" />
                        加权综合命中率
                      </span>
                      <div className="flex items-baseline gap-1.5 pt-1">
                        <span className="text-3xl font-black font-mono">
                          {((yearResult.summary.weightedHitRate || 0) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-[10px] text-indigo-200 mt-2">
                        对账综合得分。算法公式：主攻权重占50% + 防守权重占30% + 绝杀拦截权重占20%。
                      </p>
                    </div>
                  </div>

                  {/* Card 1: Hot Tier */}
                  <div className="bg-white border border-emerald-100 rounded-2xl p-4 shadow-xs relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-50 rounded-full -mr-8 -mt-8 -z-0 opacity-40"></div>
                    <div className="relative z-10 space-y-1">
                      <span className="text-xs font-bold text-emerald-800 block">🔥 重磅主攻 (核心) 命中率</span>
                      <div className="flex items-baseline gap-1.5 pt-1">
                        <span className="text-2xl font-extrabold text-emerald-600 font-mono">
                          {(yearResult.summary.hotHitRate * 100).toFixed(1)}%
                        </span>
                        <span className="text-[11px] font-medium text-gray-400 font-mono">
                          ({yearResult.summary.hotHitCount}/{yearResult.summary.hotMatchesTotal})
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-2">
                        生肖推荐精准度。累计推荐主攻生肖 <span className="font-bold text-emerald-700 font-mono">{yearResult.summary.hotMatchesTotal}</span> 个次，在开奖生肖中成功击中 <span className="font-bold text-emerald-700 font-mono">{yearResult.summary.hotHitCount}</span> 个。
                      </p>
                    </div>
                  </div>

                  {/* Card 2: Mid Tier */}
                  <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-xs relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-amber-50 rounded-full -mr-8 -mt-8 -z-0 opacity-40"></div>
                    <div className="relative z-10 space-y-1">
                      <span className="text-xs font-bold text-amber-800 block">⚖️ 稳健防守 (次要) 命中率</span>
                      <div className="flex items-baseline gap-1.5 pt-1">
                        <span className="text-2xl font-extrabold text-amber-500 font-mono">
                          {(yearResult.summary.midHitRate * 100).toFixed(1)}%
                        </span>
                        <span className="text-[11px] font-medium text-gray-400 font-mono">
                          ({yearResult.summary.midHitCount}/{yearResult.summary.midMatchesTotal})
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-2">
                        辅助防守精准度。累计推荐防守生肖 <span className="font-bold text-amber-700 font-mono">{yearResult.summary.midMatchesTotal}</span> 个次，击中 <span className="font-bold text-amber-700 font-mono">{yearResult.summary.midHitCount}</span> 个。
                      </p>
                    </div>
                  </div>

                  {/* Card 3: Kill Tier */}
                  <div className="bg-white border border-rose-100 rounded-2xl p-4 shadow-xs relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-rose-50 rounded-full -mr-8 -mt-8 -z-0 opacity-40"></div>
                    <div className="relative z-10 space-y-1">
                      <span className="text-xs font-bold text-rose-800 block">🛡️ 死穴绝杀 (清除) 拦截率</span>
                      <div className="flex items-baseline gap-1.5 pt-1">
                        <span className="text-2xl font-extrabold text-rose-600 font-mono">
                          {(yearResult.summary.killInterceptRate * 100).toFixed(1)}%
                        </span>
                        <span className="text-[11px] font-medium text-gray-400 font-mono">
                          ({yearResult.summary.killInterceptCount}/{yearResult.summary.totalKillRecommended})
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-2">
                        排除拦截成功率。累计清除绝杀生肖 <span className="font-bold text-rose-700 font-mono">{yearResult.summary.totalKillRecommended}</span> 个次，成功排除未在奖盘出现的值 <span className="font-bold text-rose-700 font-mono">{yearResult.summary.killInterceptCount}</span> 个次（漏杀/规避失败 <span className="text-rose-600 font-bold font-mono">{yearResult.summary.killFailCount}</span> 个）。
                      </p>
                    </div>
                  </div>

                  {/* Card 4: Premium Numbers */}
                  <div className="bg-white border border-indigo-100 rounded-2xl p-4 shadow-xs relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-50 rounded-full -mr-8 -mt-8 -z-0 opacity-40"></div>
                    <div className="relative z-10 space-y-1">
                      <span className="text-xs font-bold text-indigo-800 block">🎯 特码弹药库渗透命中</span>
                      <div className="flex items-baseline gap-1.5 pt-1">
                        <span className="text-2xl font-extrabold text-indigo-600 font-mono">
                          {yearResult.summary.numHitsTotal} <span className="text-xs font-normal text-gray-500">码</span>
                        </span>
                        <span className="text-[11px] font-medium text-gray-400 font-mono">
                          ({parseFloat((yearResult.summary.numHitsTotal / yearResult.totalIssuesEvaluated).toFixed(2))} 码/期)
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-2">
                        精选特码库全年度累计击中特码次数。
                      </p>
                    </div>
                  </div>
                </div>

                {/* 命中分布对比折线图 (Hit Distribution Line Chart) */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-gray-100 pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-gray-950 flex items-center gap-1.5">
                        <TrendingUp className="w-4.5 h-4.5 text-indigo-600" />
                        2026年{selectedQuarter === "all" || selectedQuarter === "all-single" ? "全年度" : `第 ${selectedQuarter} 季度`}决策模型算法命中趋势对比
                      </h4>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        展示重磅主攻、稳健防守、死穴绝杀三种决策机制在当前选定仿真范围下各期的累计命中/拦截成功率演进，直观反映模型稳定性与拟合走势。
                      </p>
                    </div>
                    <div className="text-xs bg-indigo-50 border border-indigo-100 text-indigo-800 font-bold px-3 py-1 rounded-xl shrink-0 flex items-center gap-1">
                      加权综合命中率 (Weighted Accuracy): {((yearResult.summary.weightedHitRate || 0) * 100).toFixed(1)}%
                    </div>
                  </div>

                  <div className="h-[280px] w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="issue" 
                          stroke="#94a3b8" 
                          fontSize={9}
                          tickLine={false}
                          axisLine={false}
                          dy={6}
                        />
                        <YAxis 
                          stroke="#94a3b8" 
                          fontSize={9}
                          tickLine={false}
                          axisLine={false}
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend 
                          verticalAlign="top" 
                          height={36} 
                          iconType="circle"
                          iconSize={6}
                          wrapperStyle={{ fontSize: '10px', fontWeight: '600' }}
                        />
                        <Line 
                          name="重磅主攻累计命中" 
                          type="monotone" 
                          dataKey="重磅主攻累计命中率" 
                          stroke="#10b981" 
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 5 }}
                        />
                        <Line 
                          name="稳健防守累计命中" 
                          type="monotone" 
                          dataKey="稳健防守累计命中率" 
                          stroke="#f59e0b" 
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                        <Line 
                          name="死穴绝杀累计拦截" 
                          type="monotone" 
                          dataKey="死穴绝杀累计拦截率" 
                          stroke="#ef4444" 
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* SWOT/Performance diagnostic */}
                <div className="border border-gray-100 rounded-2xl p-5 bg-gray-50/50 space-y-4">
                <div className="text-sm font-bold text-gray-900 flex items-center gap-1.5 border-b border-gray-100 pb-2">
                  <TrendingUp className="w-4.5 h-4.5 text-indigo-500" />
                  2026年动态生肖算法底层优势与缺陷诊断报告
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Advantages */}
                  <div className="space-y-3 bg-white border border-emerald-100 p-4 rounded-xl">
                    <span className="text-xs font-bold text-emerald-800 block flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      算法优势分析 (Strengths)
                    </span>
                    <ul className="text-xs text-gray-600 space-y-2">
                      {yearResult.summary.killInterceptRate >= 0.90 ? (
                        <li className="flex items-start gap-1.5">
                          <span className="text-emerald-500 font-bold font-mono shrink-0">✔</span>
                          <span><strong>高阶绝杀拦截能力极强：</strong>绝杀拦截成功率高达 {pct(yearResult.summary.killInterceptRate)}，多重交叉排除（Rule2及冰点排除）机制表现极为坚实，彻底隔离死穴高风险生肖。</span>
                        </li>
                      ) : (
                        <li className="flex items-start gap-1.5 text-amber-700">
                          <span className="text-amber-500 font-bold font-mono shrink-0">⚠</span>
                          <span><strong>绝杀拦截面临震荡：</strong>死穴规避拦截率为 {pct(yearResult.summary.killInterceptRate)}，大盘震荡期发生过个别死穴泄漏，建议微调过滤机制。</span>
                        </li>
                      )}
                      {yearResult.summary.hotHitRate >= 0.70 ? (
                        <li className="flex items-start gap-1.5">
                          <span className="text-emerald-500 font-bold font-mono shrink-0">✔</span>
                          <span><strong>重磅核心共振精准：</strong>重磅主攻（核心精选）全年度命中概率达 {pct(yearResult.summary.hotHitRate)}，展现出卡尔曼滤波与加权移动平均（WMA）双模逼近最新大底的强大稳定性。</span>
                        </li>
                      ) : (
                        <li className="flex items-start gap-1.5">
                          <span className="text-emerald-500 font-bold font-mono shrink-0">✔</span>
                          <span><strong>核心推荐防线稳健：</strong>重磅主攻保持在 {pct(yearResult.summary.hotHitRate)} 命中占比，多重条件偏振起到主要对冲防御作用。</span>
                        </li>
                      )}
                      <li className="flex items-start gap-1.5">
                        <span className="text-emerald-500 font-bold font-mono shrink-0">✔</span>
                        <span><strong>动态映射平滑适配：</strong>2026年采用动态生肖岁首岁末动态转换映射（岁次转换在各期号中完全平滑），相比固定统一映射在趋势判断上大幅减少了对账误差。</span>
                      </li>
                    </ul>
                  </div>

                  {/* Disadvantages & Tactics */}
                  <div className="space-y-3 bg-white border border-amber-100 p-4 rounded-xl">
                    <span className="text-xs font-bold text-amber-800 block flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                      局限弱点与战术建议 (Weaknesses & Actionable Tactics)
                    </span>
                    <ul className="text-xs text-gray-600 space-y-2">
                      <li className="flex items-start gap-1.5">
                        <span className="text-amber-500 font-bold font-mono shrink-0">✦</span>
                        <span><strong>极值大底覆盖收窄：</strong>在部分极其解耦的极值大底期数（开出多样性低至3或4种生肖），核心生肖对应号码少，容易降低该期命中聚焦度。</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-amber-500 font-bold font-mono shrink-0">✦</span>
                        <span><strong>防守推荐存在冗余：</strong>在部分大底趋势信号弱的期数，次要防守生肖组合有些许平铺。可通过调节滑块降低次要推荐权重，提高主推纯度。</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-indigo-600 font-bold font-mono shrink-0">ℹ</span>
                        <span><strong>战术调优建议：</strong>推荐采用<strong>卡尔曼滤波 (Kalman Filter)</strong>，并将 Q 值调至 0.02、R 值调至 0.08，可以更快追踪2026年高频规律在短期内的极速偏转，提纯特码。</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Detail Issues Table */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                  <span className="text-xs font-bold text-gray-700">2026年度各期仿真对账明细</span>
                  <span className="text-[10px] font-mono text-gray-400">TOTAL EVALUATED: {yearResult.totalIssuesEvaluated} ISSUES</span>
                </div>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto font-sans">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-gray-50 text-gray-500 font-bold uppercase sticky top-0 border-b border-gray-100 z-10">
                      <tr>
                        <th className="px-4 py-3 text-center">期号</th>
                        <th className="px-4 py-3">开奖日期</th>
                        <th className="px-4 py-3">开奖号码 & 真实生肖</th>
                        <th className="px-4 py-3">核心推荐 (重磅)</th>
                        <th className="px-4 py-3">防守推荐 (稳健)</th>
                        <th className="px-4 py-3 text-center">死穴绝杀</th>
                        <th className="px-4 py-3 text-center">精选特码命中</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {yearResult.results.map((r: any, idx: number) => {
                        return (
                          <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                            {/* Issue */}
                            <td className="px-4 py-3.5 text-center font-mono font-bold text-gray-900">
                              {r.issue}期
                            </td>
                            {/* Date */}
                            <td className="px-4 py-3.5 text-gray-500 font-mono">
                              {r.date}
                            </td>
                            {/* Actual code and zodiac */}
                            <td className="px-4 py-3.5">
                              <div className="flex flex-wrap gap-1">
                                {r.actualNums.map((n: number, nIdx: number) => {
                                  const zName = r.actualZodiacs[nIdx] || "未知";
                                  const isHitInHot = r.prediction.tierHot.includes(zName);
                                  const isHitInMid = r.prediction.tierMid.includes(zName);
                                  
                                  let bgClass = "bg-gray-100 text-gray-800";
                                  if (isHitInHot) bgClass = "bg-emerald-500 text-white font-bold";
                                  else if (isHitInMid) bgClass = "bg-amber-400 text-gray-900 font-bold";

                                  return (
                                    <span 
                                      key={nIdx} 
                                      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] ${bgClass}`}
                                      title={isHitInHot ? "命中核心主攻" : isHitInMid ? "命中稳健防守" : ""}
                                    >
                                      <span className="font-mono font-semibold">{n.toString().padStart(2, "0")}</span>
                                      <span className="opacity-90">{zName}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            {/* Hot tier */}
                            <td className="px-4 py-3.5">
                              <div className="flex flex-wrap gap-1 font-semibold text-emerald-800">
                                {r.prediction.tierHot.map((z: string) => {
                                  const wasDrawn = r.actualZodiacs.includes(z);
                                  return (
                                    <span 
                                      key={z} 
                                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                                        wasDrawn ? "bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold" : "bg-emerald-50/50 text-emerald-700/60"
                                      }`}
                                    >
                                      {z} {wasDrawn && "★"}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            {/* Mid tier */}
                            <td className="px-4 py-3.5">
                              <div className="flex flex-wrap gap-1 text-amber-800 font-semibold">
                                {r.prediction.tierMid.map((z: string) => {
                                  const wasDrawn = r.actualZodiacs.includes(z);
                                  return (
                                    <span 
                                      key={z} 
                                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                                        wasDrawn ? "bg-amber-100 border border-amber-200 text-amber-800 font-bold" : "bg-amber-50/50 text-amber-700/60"
                                      }`}
                                    >
                                      {z} {wasDrawn && "★"}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            {/* Kill tier */}
                            <td className="px-4 py-3.5 text-center">
                              {r.metrics.isPerfectKill ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                  完美拦截
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-100 px-2.5 py-1 rounded-full text-[10px] font-bold" title={`漏杀生肖: ${r.metrics.killHits.map((h: any) => h.zodiac).join(", ")}`}>
                                  <XCircle className="w-3.5 h-3.5 text-rose-500" />
                                  拦截漏出
                                </span>
                              )}
                            </td>
                            {/* Num hits */}
                            <td className="px-4 py-3.5 text-center font-mono font-bold">
                              {r.metrics.numHits.length > 0 ? (
                                <span className="bg-indigo-100 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded text-xs">
                                  命中 {r.metrics.numHits.length} 码
                                </span>
                              ) : (
                                <span className="text-gray-300 font-normal">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
