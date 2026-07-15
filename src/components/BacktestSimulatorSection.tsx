import React, { useState } from "react";
import { 
  History, 
  Play, 
  HelpCircle, 
  AlertCircle, 
  CheckCircle, 
  XCircle,
  Award,
  TrendingUp
} from "lucide-react";
import { PredictionResult } from "../types.js";

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
  const [selectedIssue, setSelectedIssue] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const pct = (num: number) => `${(num * 100).toFixed(1)}%`;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="border-b border-gray-100 pb-4 mb-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <History className="w-5 h-5 text-indigo-600" />
          历史回测及真实命中诊断舱
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          选择历史上的任意一期作为“基准期”，模拟当期算法的推演结论，并与随后的真实开奖结果直接进行穿透审计与精准对账。
        </p>
      </div>

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
          className="px-6 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 h-[41px]"
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
  );
};
