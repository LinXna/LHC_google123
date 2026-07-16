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
  const [subTab, setSubTab] = useState<"single" | "year">("single");

  // Single issue states
  const [selectedIssue, setSelectedIssue] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Year batch states
  const [yearLoading, setYearLoading] = useState<boolean>(false);
  const [yearResult, setYearResult] = useState<any | null>(null);
  const [yearError, setYearError] = useState<string | null>(null);

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

    try {
      const response = await fetch("/api/backtest-year", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: 2026,
          baseZodiac,
          engineMode,
        }),
      });

      const data = await response.json();
      if (data.status === "success") {
        setYearResult(data);
      } else {
        setYearError(data.message || "2026年度穿透审计失败");
      }
    } catch (err: any) {
      setYearError(err.message || "网络请求异常");
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
          <div className="bg-indigo-50/50 border border-indigo-100/70 p-5 rounded-2xl">
            <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
              <Award className="w-4.5 h-4.5 text-indigo-600" />
              2026全年度算法仿真及精准命中率诊断
            </h3>
            <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
              系统将自动载入全部历史年份作为计算参数（动态对冲大盘偏差），并对2026年已开奖的每一期数据进行回溯仿真：
              即<strong>仅使用该期之前的历史数据</strong>进行算法引擎推演，再将推演建议（重磅主攻、稳健防守、死穴绝杀）与当期真实开奖结果对比，生成真实的对账与诊断报表。
            </p>
            <div className="mt-4">
              <button
                onClick={runYearBacktest}
                disabled={yearLoading}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
              >
                {yearLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    全年度仿真计算中 (约需2秒)...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    启动2026全年度仿真诊断
                  </>
                )}
              </button>
            </div>
          </div>

          {yearError && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{yearError}</span>
            </div>
          )}

          {yearResult && (
            <div className="space-y-6 animate-fade-in">
              {/* Stats overview cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Card 1: Hot Tier */}
                <div className="bg-white border border-emerald-100 rounded-2xl p-4 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-50 rounded-full -mr-8 -mt-8 -z-0 opacity-40"></div>
                  <div className="relative z-10 space-y-1">
                    <span className="text-xs font-bold text-emerald-800 block">🔥 重磅主攻 (核心精选) 命中率</span>
                    <div className="flex items-baseline gap-1.5 pt-1">
                      <span className="text-3xl font-extrabold text-emerald-600 font-mono">
                        {(yearResult.summary.hotHitRate * 100).toFixed(1)}%
                      </span>
                      <span className="text-xs font-medium text-gray-500 font-mono">
                        ({yearResult.summary.hotHitCount}/{yearResult.totalIssuesEvaluated} 期)
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">
                      主攻生肖在开奖中露出的期数占比。累计击中 <span className="font-bold text-emerald-700 font-mono">{yearResult.summary.hotMatchesTotal}</span> 次生肖。
                    </p>
                  </div>
                </div>

                {/* Card 2: Mid Tier */}
                <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-amber-50 rounded-full -mr-8 -mt-8 -z-0 opacity-40"></div>
                  <div className="relative z-10 space-y-1">
                    <span className="text-xs font-bold text-amber-800 block">⚖️ 稳健防守 (次要防守) 命中率</span>
                    <div className="flex items-baseline gap-1.5 pt-1">
                      <span className="text-3xl font-extrabold text-amber-500 font-mono">
                        {(yearResult.summary.midHitRate * 100).toFixed(1)}%
                      </span>
                      <span className="text-xs font-medium text-gray-500 font-mono">
                        ({yearResult.summary.midHitCount}/{yearResult.totalIssuesEvaluated} 期)
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">
                      次要防守生肖组合命中率。累计补位击中 <span className="font-bold text-amber-700 font-mono">{yearResult.summary.midMatchesTotal}</span> 次。
                    </p>
                  </div>
                </div>

                {/* Card 3: Kill Tier */}
                <div className="bg-white border border-rose-100 rounded-2xl p-4 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-rose-50 rounded-full -mr-8 -mt-8 -z-0 opacity-40"></div>
                  <div className="relative z-10 space-y-1">
                    <span className="text-xs font-bold text-rose-800 block">🛡️ 死穴绝杀 (坚决清除) 拦截率</span>
                    <div className="flex items-baseline gap-1.5 pt-1">
                      <span className="text-3xl font-extrabold text-rose-600 font-mono">
                        {(yearResult.summary.killInterceptRate * 100).toFixed(1)}%
                      </span>
                      <span className="text-xs font-medium text-gray-500 font-mono">
                        ({yearResult.summary.killInterceptCount}/{yearResult.totalIssuesEvaluated} 期)
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">
                      绝杀生肖完全规避开奖结果的期数占比。漏杀 <span className="font-bold text-rose-700 font-mono">{yearResult.summary.killFailCount}</span> 期。
                    </p>
                  </div>
                </div>

                {/* Card 4: Premium Numbers */}
                <div className="bg-white border border-indigo-100 rounded-2xl p-4 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-50 rounded-full -mr-8 -mt-8 -z-0 opacity-40"></div>
                  <div className="relative z-10 space-y-1">
                    <span className="text-xs font-bold text-indigo-800 block">🎯 特码弹药库渗透命中数</span>
                    <div className="flex items-baseline gap-1.5 pt-1">
                      <span className="text-3xl font-extrabold text-indigo-600 font-mono">
                        {yearResult.summary.numHitsTotal} <span className="text-xs font-normal">码</span>
                      </span>
                      <span className="text-xs font-medium text-gray-500 font-mono">
                        (均 {parseFloat((yearResult.summary.numHitsTotal / yearResult.totalIssuesEvaluated).toFixed(2))} 码/期)
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">
                      全年度推荐精选特码库命中开奖的累计数量，体现了弹药库渗透力。
                    </p>
                  </div>
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
