import React, { useState } from "react";
import { 
  ShieldAlert, 
  Settings, 
  ArrowDownToLine, 
  CheckCircle, 
  Activity, 
  TrendingUp, 
  Trash2, 
  Plus, 
  AlertTriangle, 
  Info,
  BarChart,
  GitBranch,
  RefreshCw,
  Award
} from "lucide-react";

interface FeatureAuditSectionProps {
  selectedYears: string[];
  baseZodiac: string;
  engineMode: "unified" | "dynamic";
  freshnessEnabled: boolean;
  freshnessYears: number;
}

export function FeatureAuditSection({
  selectedYears,
  baseZodiac,
  engineMode,
  freshnessEnabled,
  freshnessYears
}: FeatureAuditSectionProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [auditResult, setAuditResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/feature-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedYears,
          baseZodiac,
          engineMode,
          freshnessEnabled,
          freshnessYears
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP 错误! 状态: ${res.status}`);
      }

      const data = await res.json();
      if (data.status === "success") {
        setAuditResult(data.auditResult);
      } else {
        throw new Error(data.message || "未知错误");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "连接服务器失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8" id="feature-audit-section">
      {/* Overview Intro Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-mono font-bold">
            <Award className="w-3.5 h-3.5" />
            V3.1 FEATURE AUDIT FRAMEWORK
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            LHC 特征审计舱：穿透特征有效性与自动推荐剪枝
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            本阶段唯一且最核心的任务——科学对账，全面审计系统中所有特征的重要性。
            无需盲目增加规则，通过本系统可准确判定：<strong>哪个特征最重要、哪个扫描器已经失效、删除哪个特征反而能使准确度提升、高相关的信号该如何剪枝。</strong>
          </p>
          <div className="pt-2 flex flex-wrap gap-4 items-center">
            <button
              onClick={triggerAudit}
              disabled={loading}
              className={`px-5 py-3 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
                loading
                  ? "bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg hover:shadow-indigo-600/20"
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "深度分析与回测审计中 (预计需要3-5秒)..." : "一键执行特征量化审计舱评估"}
            </button>
            <span className="text-xs text-slate-500">
              * 将使用当前主板选定的 <strong>{selectedYears.length}</strong> 年份进行 Walk Forward 核验。
            </span>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -z-0"></div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex gap-3 items-center text-rose-300 text-xs">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span><strong>审计失败：</strong>{error}</span>
        </div>
      )}

      {loading && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4">
          <div className="w-10 h-10 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-xs text-slate-400 max-w-sm">
            特征审计舱正在分别针对七大模块（F1~F7）进行 Walk-Forward 交叉验证，并计算置换重要性、互信息、SHAP值、分布PSI衰退、特征相关性……请稍等片刻。
          </p>
        </div>
      )}

      {auditResult && !loading && (
        <div className="space-y-8 animate-fade-in">
          
          {/* Quick Notice */}
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs">
              <CheckCircle className="w-4 h-4" />
              <span><strong>审计对账完毕！</strong> 详细的全量静态报告已自动编译并成功写出至根目录：<code className="bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono">FeatureAuditReport.html</code></span>
            </div>
          </div>

            {/* SECTION 1: TUNING RECOMMENDATIONS */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-indigo-400" />
              <span>调优建议与剪枝优化指令集</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {auditResult.recommendations.map((r: any, idx: number) => {
                let badgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                let Icon = CheckCircle;
                if (r.type === "Delete") {
                  badgeClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
                  Icon = Trash2;
                } else if (r.type === "Alert") {
                  badgeClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                  Icon = AlertTriangle;
                } else if (r.type === "Expand") {
                  badgeClass = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
                  Icon = Plus;
                }

                return (
                  <div key={idx} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between hover:border-slate-700 transition-all">
                    <div className="space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-bold flex items-center gap-1 ${badgeClass}`}>
                          <Icon className="w-3 h-3" />
                          {r.type}
                        </span>
                        <span className="text-xs font-mono font-extrabold text-slate-300 truncate max-w-[150px]">{r.target}</span>
                      </div>
                      <p className="text-xs text-slate-400 font-medium leading-relaxed">
                        <span className="text-slate-300 font-semibold">诊断: </span> {r.reason}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80">
                      <p className="text-xs text-indigo-300 font-bold leading-relaxed">
                        👉 {r.suggestion}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: MODULE IMPORTANCE & MAIN LIST GRID */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            
            {/* Left: Module Importance bar list */}
            <div className="xl:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 h-full">
              <div>
                <h3 className="text-sm font-bold text-slate-200">七大扫描器模块特征总体贡献比</h3>
                <p className="text-[10px] text-slate-500 mt-1">Based on global Permutation Importance summation</p>
              </div>
              <div className="space-y-4 pt-2">
                {Object.entries(auditResult.moduleImportance).map(([k, v]: any) => {
                  const pct = Math.round(v * 100);
                  return (
                    <div key={k} className="space-y-1">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-300 font-bold">{k} 独立扫描器</span>
                        <span className="text-indigo-400 font-extrabold">{pct}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Feature Importance Rank List Table */}
            <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-200">特征维度全功能重要性审计排行 (Top 10 Feature Rank)</h3>
                <p className="text-[10px] text-slate-500 mt-1">The multidimensional parameters from training the fitted Stacking Ensemble Stacker Model</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] text-slate-500 font-bold uppercase tracking-wider bg-slate-800/20">
                      <th className="p-2.5">特征名称</th>
                      <th className="p-2.5">置换重要性</th>
                      <th className="p-2.5">信息增益</th>
                      <th className="p-2.5">互信息</th>
                      <th className="p-2.5 text-emerald-400">SHAP 绝对值</th>
                      <th className="p-2.5">分裂频次</th>
                      <th className="p-2.5 text-center">排名</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditResult.featureImportance.slice(0, 10).map((f: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="p-2.5 text-slate-200 font-bold">{f.featureName}</td>
                        <td className="p-2.5 text-indigo-400 font-bold">{f.permutationImportance.toFixed(4)}</td>
                        <td className="p-2.5 text-slate-300">{f.informationGain.toFixed(4)}</td>
                        <td className="p-2.5 text-slate-300">{f.mutualInformation.toFixed(4)}</td>
                        <td className="p-2.5 text-emerald-400 font-semibold">{f.shapValue.toFixed(4)}</td>
                        <td className="p-2.5 text-slate-400">{f.splitFrequency}</td>
                        <td className="p-2.5 text-center">
                          <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded text-[9px] font-bold">
                            {f.rank}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* SECTION 3: SINGLE MODULE BENCHMARK & ABLATION STUDY */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Left: Walk-Forward Benchmark for each module independently */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-200">
                  各模块独立 Walk-Forward 回测性能 (Single Module Benchmarking)
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">
                  只开启对应独立模块的特征、关闭其他特征，模型在测试集上的预测质量。
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] text-slate-500 font-bold uppercase tracking-wider bg-slate-800/20 text-center">
                      <th className="p-2.5 text-left">独立模块</th>
                      <th className="p-2.5">准确度</th>
                      <th className="p-2.5">精密度</th>
                      <th className="p-2.5 text-emerald-400">主攻Top3命中</th>
                      <th className="p-2.5 text-emerald-400">稳健Top7命中</th>
                      <th className="p-2.5">LogLoss</th>
                      <th className="p-2.5">Brier Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditResult.moduleBenchmark.map((b: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-800 hover:bg-slate-800/30 text-center">
                        <td className="p-2.5 text-left text-indigo-400 font-bold">{b.module}</td>
                        <td className="p-2.5 text-slate-200">{(b.accuracy * 100).toFixed(1)}%</td>
                        <td className="p-2.5 text-slate-300">{(b.precision * 100).toFixed(1)}%</td>
                        <td className="p-2.5 text-emerald-400 font-bold">{(b.top3Accuracy * 100).toFixed(1)}%</td>
                        <td className="p-2.5 text-emerald-400 font-bold">{(b.top7Accuracy * 100).toFixed(1)}%</td>
                        <td className="p-2.5 text-slate-400">{b.logLoss.toFixed(3)}</td>
                        <td className="p-2.5 text-slate-400">{b.brierScore.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: Ablation LOO Study */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-200">
                  消融对比实验 (Leave-One-Out Ablation Analysis)
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">
                  移除某一模块或主特征后模型预测指标的变化。<strong>Delta 为正数(↑)说明移除该特征能提高准确度，应立刻剪枝！</strong>
                </p>
              </div>
              <div className="overflow-x-auto text-center">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] text-slate-500 font-bold uppercase tracking-wider bg-slate-800/20">
                      <th className="p-2.5">移除目标</th>
                      <th className="p-2.5">类型</th>
                      <th className="p-2.5">消融后准确率</th>
                      <th className="p-2.5 text-center">准确度偏差 (Delta)</th>
                      <th className="p-2.5 text-center">消融后 LogLoss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditResult.ablationStudy.map((a: any, idx: number) => {
                      const isBetter = a.deltaAccuracy > 0;
                      const arrow = a.deltaAccuracy >= 0 ? "↑" : "↓";
                      const badgeClass = isBetter 
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-bold" 
                        : "bg-rose-500/10 text-rose-400 border-rose-500/20";

                      return (
                        <tr key={idx} className="border-b border-slate-800 hover:bg-slate-800/30">
                          <td className="p-2.5 text-slate-200 font-semibold">{a.removedElement}</td>
                          <td className="p-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800/50 text-slate-400">{a.type}</span></td>
                          <td className="p-2.5 text-slate-300">{(a.accuracy * 100).toFixed(1)}%</td>
                          <td className="p-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] border ${badgeClass}`}>
                              {arrow} {(a.deltaAccuracy * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-400 text-center">{a.logLoss.toFixed(4)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* SECTION 4: DRIFT MONITORING */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-amber-400 animate-pulse" />
                <span>特征稳定度与趋势衰减漂移监视器 (Drift Detection)</span>
              </h3>
              <p className="text-[10px] text-slate-500 mt-1">
                采用人口稳定性指数 (PSI) 检测近期开奖中各规律扫描器是否与历史基准发生偏离。<strong>PSI &gt; 0.25 意味着特征严重偏析或极度衰退，必须关注。</strong>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] text-slate-500 font-bold uppercase tracking-wider bg-slate-800/20 text-center">
                    <th className="p-2.5 text-left">特征名称</th>
                    <th className="p-2.5">稳定度指数 (PSI)</th>
                    <th className="p-2.5">KL 散度 (KLD)</th>
                    <th className="p-2.5">JS 散度 (JSD)</th>
                    <th className="p-2.5">诊断诊断状态</th>
                  </tr>
                </thead>
                <tbody>
                  {auditResult.driftReport.map((d: any, idx: number) => {
                    let badgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                    if (d.status === "Significant Drift") badgeClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
                    else if (d.status === "Moderate Drift") badgeClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";

                    return (
                      <tr key={idx} className="border-b border-slate-800 hover:bg-slate-800/30 text-center">
                        <td className="p-2.5 text-left text-slate-300 font-bold">{d.featureName}</td>
                        <td className="p-2.5 text-indigo-400 font-bold">{d.psi.toFixed(4)}</td>
                        <td className="p-2.5 text-slate-400">{d.klDivergence.toFixed(4)}</td>
                        <td className="p-2.5 text-slate-400">{d.jsDivergence.toFixed(4)}</td>
                        <td className="p-2.5">
                          <span className={`px-2.5 py-0.5 rounded border text-[10px] font-bold ${badgeClass}`}>
                            {d.status}
                          </span>
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
  );
}
