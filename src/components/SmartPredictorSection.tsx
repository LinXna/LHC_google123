import React, { useState, useEffect } from "react";
import { 
  Compass, 
  Settings, 
  HelpCircle, 
  Copy, 
  Check, 
  Download, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  ShieldX,
  Plus,
  Sliders,
  Zap,
  Sparkles,
  X,
  ShieldAlert,
  Eye,
  History
} from "lucide-react";
import { PredictionResult } from "../types.js";

interface WatchHistoryAudit {
  summary: {
    periods: number;
    totalCandidates: number;
    openedCandidates: number;
    candidateOpenRate: number;
    anyOpenPeriods: number;
    anyOpenRate: number;
    fullyAvoidedPeriods: number;
    fullyAvoidedRate: number;
  };
  rows: Array<{
    issue: number;
    date: string;
    watchedZodiacs: string[];
    actualZodiacs: string[];
    openedZodiacs: string[];
    anyOpened: boolean;
    displayed: boolean;
    numericallySeparated: boolean;
    watchSeparation: PredictionResult["watchSeparation"] | null;
  }>;
  separationAudit: {
    numericallyQualifiedPeriods: number;
    displayedPeriods: number;
    suppressedPeriods: number;
    numericallyQualified: WatchHistoryAudit["summary"];
    displayed: WatchHistoryAudit["summary"];
    suppressed: WatchHistoryAudit["summary"];
  };
  continuousValidation: {
    throughIssue: number;
    periods: number;
    top3Precision: number;
    precisionLiftVsRandom: number;
    brierGain: number;
    logLossGain: number;
    signalPeriods: number;
    rankingStable: boolean;
    probabilityStable: boolean;
    status: "stable_signal" | "keep_low_signal";
  };
  note: string;
}

interface SmartPredictorSectionProps {
  prediction: PredictionResult | null;
  loading: boolean;
  selectedYears: string[];
  baseZodiac: string;
  engineMode: string;
  freshnessEnabled: boolean;
  freshnessYears: number;
  onRunPredict: (customWeights?: {
    w1?: number;
    w2?: number;
    calibrationMethod?: "wma" | "kalman" | "none";
    calibrationWindow?: number;
    kalmanQ?: number;
    kalmanR?: number;
  }) => void;
}

export const SmartPredictorSection: React.FC<SmartPredictorSectionProps> = ({
  prediction,
  loading,
  selectedYears,
  baseZodiac,
  engineMode,
  freshnessEnabled,
  freshnessYears,
  onRunPredict,
}) => {
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [w1, setW1] = useState<number>(60);
  const [w2, setW2] = useState<number>(40);
  const [calibrationMethod, setCalibrationMethod] = useState<"wma" | "kalman" | "none">("wma");
  const [calibrationWindow, setCalibrationWindow] = useState<number>(15);
  const [kalmanQ, setKalmanQ] = useState<number>(0.01);
  const [kalmanR, setKalmanR] = useState<number>(0.1);
  const [copied, setCopied] = useState<boolean>(false);
  const [dismissAlert, setDismissAlert] = useState<boolean>(false);
  const [watchAudit, setWatchAudit] = useState<WatchHistoryAudit | null>(null);
  const [watchAuditLoading, setWatchAuditLoading] = useState<boolean>(false);
  const [watchAuditError, setWatchAuditError] = useState<string | null>(null);

  useEffect(() => {
    setDismissAlert(false);
  }, [prediction]);

  useEffect(() => {
    if (prediction) {
      if (prediction.calibration) {
        if (prediction.calibration.method) {
          setCalibrationMethod(prediction.calibration.method as any);
        }
        if (prediction.calibration.windowSize !== undefined) {
          setCalibrationWindow(prediction.calibration.windowSize);
        }
        if (prediction.calibration.q !== undefined) {
          setKalmanQ(prediction.calibration.q);
        }
        if (prediction.calibration.r !== undefined) {
          setKalmanR(prediction.calibration.r);
        }
      }
    }
  }, [prediction]);

  useEffect(() => {
    if (!prediction) {
      setWatchAudit(null);
      setWatchAuditError(null);
      setWatchAuditLoading(false);
      return;
    }

    const controller = new AbortController();
    setWatchAudit(null);
    setWatchAuditError(null);
    setWatchAuditLoading(true);
    fetch("/api/watch-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        year: Math.max(
          2026,
          ...selectedYears
            .map(file => Number.parseInt(file.replace(".json", ""), 10))
            .filter(year => Number.isInteger(year))
        ),
        latestIssue: prediction.latestIssue,
        periods: 20,
        selectedYears,
        baseZodiac,
        engineMode,
        freshnessEnabled,
        freshnessYears,
        customWeights: {
          w1: w1 / 100,
          w2: w2 / 100,
          calibrationMethod,
          calibrationWindow,
          kalmanQ,
          kalmanR
        }
      })
    })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok || payload.status !== "success") {
          throw new Error(payload.message || "观察候选历史追踪失败");
        }
        return payload as WatchHistoryAudit & { status: string };
      })
      .then(payload => setWatchAudit(payload))
      .catch(error => {
        if (error.name !== "AbortError") setWatchAuditError(error.message || "观察候选历史追踪失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setWatchAuditLoading(false);
      });

    return () => controller.abort();
  }, [prediction, selectedYears, baseZodiac, engineMode, freshnessEnabled, freshnessYears]);

  if (loading && !prediction) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm text-center">
        <Compass className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-3" />
        <p className="text-sm font-semibold text-gray-700">正在调用智能推演引擎...</p>
        <p className="text-xs text-gray-400 mt-1">深度匹配微观行为、风险分层与多样性惯性重组对冲机制中...</p>
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm text-center">
        <Compass className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <h3 className="text-base font-bold text-gray-900 mb-1">推演预测决策舱未就绪</h3>
        <p className="text-xs text-gray-500 mb-4">推演引擎需要整合当前加载的历史大底与对齐生肖规则，请点击下方进行首次智能推算。</p>
        <button
          onClick={() => onRunPredict()}
          className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all flex items-center gap-1.5 mx-auto"
        >
          <Compass className="w-4 h-4" />
          运行第 2 代自动化特征共振推演
        </button>
      </div>
    );
  }

  // Compile download text report
  const compileReportText = (): string => {
    const text: string[] = [];
    text.push("==================================================");
    text.push(`   ★ LHC 第 ${prediction.nextIssue} 期全闭环自动智能推荐报告 ★   `);
    text.push("==================================================");
    text.push(`最新一期开奖 (第 ${prediction.latestIssue} 期) : [${prediction.lastNums.join(", ")}] -> [${prediction.lastZodiacs.join(", ")}]`);
    text.push(`💡 【特征形态分析】: 本期开奖生肖去重后，独特多样性数量为: 【${prediction.currentDiversity}】`);
    text.push(prediction.currentDiversity <= 4 
      ? "   ==> 形态评估：生肖多样性较低（集中度高），模型已自动激活[临期生肖惯性连庄增益机制]。"
      : "   ==> 形态评估：生肖多样性较为分散，模型已自动压制临期生肖的连庄概率。"
    );
    text.push(`推演引擎生成时间 : ${new Date().toLocaleString()}\n`);
    
    text.push("【🔴 第一板块：生肖多梯度组合推荐】");
    text.push(`  🔥 核心精选生肖组合 (重磅主攻) : ${prediction.tierHot.map(z => `【${z}】`).join(", ")}`);
    text.push(`  ⚖️ 稳健防守生肖组合 (次要防守) : ${prediction.tierMid.map(z => `【${z}】`).join(", ")}`);
    if (prediction.tierKill.length > 0) {
      text.push(`  🛑 历史死穴绝杀生肖 (一键清除) : ${prediction.tierKill.map(z => `【${z}】`).join(", ")}`);
    } else {
      text.push("  🛡️ 历史死穴绝杀生肖 : 已由低信号保护关闭");
    }
    if ((prediction.tierWatch || []).length > 0) {
      text.push(`  👁️ 低分观察候选 (不可绝杀) : ${(prediction.tierWatch || []).map(z => `【${z}】${prediction.scores[z] ?? 0}分`).join(", ")}`);
    } else if (prediction.modelValidation?.watchCandidatesSuppressed) {
      text.push(`  👁️ 低分观察候选 : 本期不展示（${prediction.watchSeparation?.reason || "末位边界分差不足"}）`);
    }
    text.push("  --------------------------------------------------");
    text.push("  📊 评分细节参考 (Rule6已关闭，Rule1+多样性形态占权重60%) :");
    Object.entries(prediction.scores)
      .sort((a, b) => b[1] - a[1])
      .forEach(([z, score]) => {
        text.push(`    * 【${z}】: ${score} 分`);
      });

    text.push("\n【🔵 第二板块：号码精选矩阵推荐】");
    text.push("  🎯 【主攻核心特码弹药库】(源于核心生肖，爆发率最高)：");
    text.push("    ==> " + prediction.premiumHotNums.map(n => n.toString().padStart(2, "0")).join(" "));
    text.push("\n  🎯 【全盘防守特码大底】(核心生肖号源全开)：");
    text.push("    ==> " + prediction.hotNums.map(n => n.toString().padStart(2, "0")).join(" "));
    text.push("\n  📐 【空间拦截定胆参考】(区间 10-19 绝不断档之黄金槽码)：");
    text.push("    ==> " + prediction.spaceCore.map(n => n.toString().padStart(2, "0")).join(" "));
    text.push("\n  🛡️ 【平稳防守兜底号源】(防守生肖对应号码)：");
    text.push("    ==> " + prediction.midNums.map(n => n.toString().padStart(2, "0")).join(" "));
    
    text.push("\n==================================================");
    text.push("  【🌟 全功能自动化大盘推演预测难易度量化评估面板】");
    text.push("==================================================");
    text.push(`  - 综合指标量化总分 : 【${prediction.difficultyScore} 分】 (分数越高越混乱，超过70分即判定为不可测期)`);
    text.push(`  - 预测难易度结论评级: ${prediction.conclusion}`);
    text.push("  - 底层大盘状态审计日志 :");
    prediction.evalReasons.forEach(r => {
      text.push(`    * ${r}`);
    });
    text.push(`  - 💡 实战决策执行指令: \n    ${prediction.actionAdvice}`);
    text.push("\n==================================================");

    return text.join("\n");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(compileReportText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = compileReportText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `final_auto_prediction_${prediction.nextIssue}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleApplyConfig = () => {
    onRunPredict({
      w1: w1 / 100,
      w2: w2 / 100,
      calibrationMethod,
      calibrationWindow,
      kalmanQ,
      kalmanR,
    });
  };

  const handleApplyTuning = (params: {
    w1: number;
    w2: number;
    method: "wma" | "kalman" | "none";
    window: number;
    q: number;
    r: number;
  }) => {
    setW1(params.w1);
    setW2(params.w2);
    setCalibrationMethod(params.method);
    setCalibrationWindow(params.window);
    setKalmanQ(params.q);
    setKalmanR(params.r);

    // Call onRunPredict with the parameters directly
    onRunPredict({
      w1: params.w1 / 100,
      w2: params.w2 / 100,
      calibrationMethod: params.method,
      calibrationWindow: params.window,
      kalmanQ: params.q,
      kalmanR: params.r,
    });
  };

  // Status color helpers
  const getDifficultyColor = (score: number) => {
    if (score >= 70) return "text-rose-600 bg-rose-50 border-rose-200";
    if (score <= 40) return "text-emerald-600 bg-emerald-50 border-emerald-200";
    return "text-amber-600 bg-amber-50 border-amber-200";
  };

  const getDifficultyProgressColor = (score: number) => {
    if (score >= 70) return "bg-rose-500";
    if (score <= 40) return "bg-emerald-500";
    return "bg-amber-500";
  };

  const hasLeaksInHistory = prediction?.killInterceptHistory?.some(item => item.leaks && item.leaks.length > 0);

  return (
    <div className="relative">
      {/* Floating Alert for Leaks in the last 10 periods */}
      {hasLeaksInHistory && !dismissAlert && (
        <div id="floating_leak_warning" className="fixed top-6 right-6 z-[100] max-w-sm w-[90%] bg-linear-to-r from-rose-50 to-red-100 border border-rose-200 rounded-2xl shadow-2xl p-4 flex gap-3 items-start animate-pulse">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs font-extrabold text-rose-900 flex items-center gap-1">
              ⚠️ 死穴绝杀重大漏杀警报！
            </h4>
            <p className="text-[10.5px] text-rose-800 leading-relaxed mt-1">
              警告：最近 10 期实战回测中，部分被判定为<strong>【坚决清除】</strong>的绝杀生肖或号码在最终开奖中漏网跑出（出现漏杀）。
            </p>
            <div className="mt-2 text-[10px] font-semibold bg-rose-100 border border-rose-200 text-rose-950 px-2 py-0.5 rounded-lg inline-block">
              💡 建议微调偏振权重或校准模式以消除漏防
            </div>
          </div>
          <button 
            onClick={() => setDismissAlert(true)}
            className="p-1 hover:bg-rose-100 rounded-lg text-rose-700 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Prediction Left: Stats, rating & advice */}
      <div className="xl:col-span-1 space-y-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Compass className="w-5 h-5 text-indigo-600" />
                实战推演决策中心
              </h2>
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                title="高级调参"
              >
                <Settings className={`w-4 h-4 ${showConfig ? "text-indigo-600 animate-spin" : ""}`} />
              </button>
            </div>

            {/* Custom config panel */}
            {showConfig && (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-4 space-y-3.5">
                <div className="text-xs font-bold text-gray-700 flex items-center gap-1 border-b border-gray-100 pb-1.5">
                  <Settings className="w-3.5 h-3.5 text-indigo-500" />
                  智能决策权重微调
                </div>
                
                <div>
                  <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                    <span>F1 (大样本比例特征):</span>
                    <span className="font-mono font-bold text-indigo-600">{w1}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    value={w1}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setW1(val);
                      setW2(100 - val);
                    }}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                    <span>F2 (历史排除风险线):</span>
                    <span className="font-mono font-bold text-indigo-600">{w2}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    value={w2}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setW2(val);
                      setW1(100 - val);
                    }}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                <div className="text-xs font-bold text-gray-700 flex items-center gap-1 border-t border-gray-100 pt-2 pb-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                  动态概率偏差校准
                </div>

                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">校准算法选择 (Algorithm):</label>
                  <select
                    value={calibrationMethod}
                    onChange={(e) => setCalibrationMethod(e.target.value as any)}
                    className="w-full text-xs bg-white border border-gray-200 rounded-lg p-1.5 focus:outline-hidden focus:border-indigo-500"
                  >
                    <option value="wma">加权移动平均 (WMA - 优先近期)</option>
                    <option value="kalman">卡尔曼滤波 (Kalman Filter - 概率自适应)</option>
                    <option value="none">关闭校准 (原始频率)</option>
                  </select>
                </div>

                {calibrationMethod === "wma" && (
                  <div>
                    <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                      <span>移动平均窗口大小 (W):</span>
                      <span className="font-mono font-bold text-indigo-600">{calibrationWindow} 期</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="40"
                      value={calibrationWindow}
                      onChange={(e) => setCalibrationWindow(parseInt(e.target.value))}
                      className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                )}

                {calibrationMethod === "kalman" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">过程噪声 Q:</label>
                      <input
                        type="number"
                        step="0.001"
                        min="0.0001"
                        max="1"
                        value={kalmanQ}
                        onChange={(e) => setKalmanQ(parseFloat(e.target.value) || 0.01)}
                        className="w-full text-xs font-mono bg-white border border-gray-200 rounded-lg p-1"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">测量噪声 R:</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.001"
                        max="10"
                        value={kalmanR}
                        onChange={(e) => setKalmanR(parseFloat(e.target.value) || 0.1)}
                        className="w-full text-xs font-mono bg-white border border-gray-200 rounded-lg p-1"
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={handleApplyConfig}
                  className="w-full py-1.5 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  应用修改并重推
                </button>
              </div>
            )}

            {/* Gauges */}
            <div className={`border rounded-2xl p-4 mb-4 ${getDifficultyColor(prediction.difficultyScore)}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">自动化预测难易度评级</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white font-mono font-bold border">
                  {prediction.difficultyScore} / 100 分
                </span>
              </div>
              <div className="text-lg font-bold mb-3">{prediction.conclusion}</div>
              
              <div className="w-full h-2 bg-gray-200/60 rounded-full overflow-hidden mb-2">
                <div 
                  className={`h-full rounded-full ${getDifficultyProgressColor(prediction.difficultyScore)}`}
                  style={{ width: `${prediction.difficultyScore}%` }}
                ></div>
              </div>
              <p className="text-[11px] opacity-85 leading-relaxed">
                提示：得分超过 70 即触发对冲内耗预警，判定为混乱盲区期，实战决策倾向空仓。
              </p>
            </div>

            {/* Action Advice */}
            <div className="border border-gray-100 rounded-xl p-4 bg-indigo-50/50 mb-4">
              <div className="text-xs font-semibold text-indigo-900 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                实战决策执行指令
              </div>
              <p className="text-xs text-indigo-950 font-medium leading-relaxed">
                {prediction.actionAdvice}
              </p>
            </div>
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={handleCopy}
              className="flex-1 py-2 text-xs font-semibold border border-gray-200 hover:border-gray-300 rounded-xl flex items-center justify-center gap-1.5 transition-colors bg-white text-gray-700"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">已复制报告</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-gray-400" />
                  复制推演文本
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="py-2 px-3 border border-gray-200 hover:border-gray-300 rounded-xl bg-white text-gray-700 transition-colors flex items-center justify-center"
              title="下载 TXT 推荐报告"
            >
              <Download className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Audit Log */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2 mb-3">
            🎯 底层大盘状态审计日志
          </div>
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {prediction.evalReasons.map((reason, idx) => {
              const isRisk = reason.includes("【风险】") || reason.includes("【极度危险】") || reason.includes("【强风险】");
              return (
                <div 
                  key={idx} 
                  className={`text-xs p-2.5 rounded-xl border leading-relaxed ${
                    isRisk 
                      ? "bg-rose-50 border-rose-100 text-rose-800" 
                      : "bg-emerald-50 border-emerald-100 text-emerald-800"
                  }`}
                >
                  {reason}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Prediction Right: Recommendations */}
      <div className="xl:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4">
            LHC 第 {prediction.nextIssue} 期 精密生肖与号码推荐结果
          </h2>

          {/* 🔮 下期去重数决策对冲与生肖恒定约束看板 */}
          {prediction.predictedCount !== undefined && (
            <div className="mb-6 p-4.5 rounded-2xl bg-slate-900 border border-slate-800 text-white shadow-md relative overflow-hidden">
              <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-2 -translate-y-2">
                <Sparkles className="w-24 h-24 text-amber-300" />
              </div>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-amber-400 text-slate-950 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full font-mono uppercase tracking-wider animate-pulse">
                      🔮 联动：下期去重数观测机制
                    </span>
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                      已与主控审计舱高精度同步
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 font-sans flex items-center gap-1.5 flex-wrap">
                    预计下期开奖生肖去重数：
                    <span className="text-base font-black text-amber-300 font-mono underline decoration-wavy decoration-amber-400/50">
                      {prediction.predictedCount}
                    </span>
                    种不同生肖 
                    <span className="text-xs text-slate-400 font-normal">
                      ({prediction.predictedCount <= 5 ? "重叠聚集特征" : prediction.predictedCount === 7 ? "零重复全铺展" : "标准单组重叠"})
                    </span>
                  </h3>
                  <p className="text-[11.5px] text-slate-300 leading-relaxed font-sans">
                    ⚠️ <strong>【无损数学还原：恢复极差自适应精准门槛】当前推荐数量：{prediction.tierHot.length} 肖。</strong>
                    之前硬性执行 1:1 数量强制绑定（强制推荐 {prediction.predictedCount} 肖）会迫使引擎混入低分干扰生肖或裁剪高置信度生肖，导致命中率降低。为了<strong>确保原汁原味的高精准率</strong>，系统已切回纯净自适应极差算法（严格控制在 2-5 肖），仅对最高概率生肖予以重磅推荐！
                  </p>
                </div>
                <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-2 shrink-0 border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-4">
                  <div className="text-left md:text-right">
                    <div className="text-[10px] text-slate-400 font-sans">核心精选生肖</div>
                    <div className="text-base font-black text-amber-300 font-mono mt-0.5">
                      {prediction.tierHot.length} 肖
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 交叉验证与一致性自适应校验舱 (Cross-Validation Module) */}
          {(() => {
            const hotSet = new Set(prediction.tierHot);
            const midSet = new Set(prediction.tierMid);
            const killSet = new Set(prediction.tierKill);
            
            const hotMidOverlap = prediction.tierHot.filter(z => midSet.has(z));
            const hotKillOverlap = prediction.tierHot.filter(z => killSet.has(z));
            const midKillOverlap = prediction.tierMid.filter(z => killSet.has(z));
            const allOverlaps = Array.from(new Set([...hotMidOverlap, ...hotKillOverlap, ...midKillOverlap]));
            
            const hasOverlap = allOverlaps.length > 0;
            
            // Check even distribution tendency
            const hLen = prediction.tierHot.length;
            const mLen = prediction.tierMid.length;
            const kLen = prediction.tierKill.length;
            const isEvenSize = hLen === mLen && mLen === kLen && hLen > 0;
            
            // Calculate score standard deviation to evaluate entropy
            const scoreValues = Object.values(prediction.scores);
            const mean = scoreValues.reduce((sum, v) => sum + v, 0) / (scoreValues.length || 1);
            const variance = scoreValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (scoreValues.length || 1);
            const stdDev = Math.sqrt(variance);
            const isLowVariance = stdDev < 15.0; // low variance means uniform fallback
            
            return (
              <div className={`mb-6 border rounded-2xl p-4.5 text-xs transition-all ${
                hasOverlap 
                  ? "bg-rose-50 border-rose-200 text-rose-900 shadow-sm shadow-rose-100" 
                  : isEvenSize || isLowVariance
                    ? "bg-amber-50 border-amber-200 text-amber-900 shadow-xs"
                    : "bg-emerald-50/50 border-emerald-100 text-emerald-900"
              }`}>
                <div className="flex items-center justify-between border-b pb-2.5 mb-2.5 border-current/10">
                  <span className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
                    <AlertTriangle className={`w-4 h-4 ${hasOverlap ? "text-rose-600 animate-bounce" : isEvenSize || isLowVariance ? "text-amber-600" : "text-emerald-600"}`} />
                    🔍 智能推演多轨交叉验证校验中心 (Cross-Validation Guard)
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border bg-white ${
                    hasOverlap 
                      ? "text-rose-700 border-rose-200" 
                      : isEvenSize || isLowVariance
                        ? "text-amber-700 border-amber-200"
                        : "text-emerald-700 border-emerald-200"
                  }`}>
                    {hasOverlap ? "⚠️ 校验冲突重叠" : isEvenSize || isLowVariance ? "⚠️ 信号均分倾向" : "✅ 校验高分化过关"}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {/* Overlap Alarm */}
                  {hasOverlap ? (
                    <div className="bg-white/60 border border-rose-200/50 rounded-xl p-3 space-y-1.5">
                      <div className="font-bold text-rose-800 flex items-center gap-1">
                        ⚠️ 严重：检测到决策组存在重叠泄漏！
                      </div>
                      <p className="leading-relaxed text-rose-950">
                        检测到生肖 <strong className="text-rose-700 underline">{allOverlaps.map(z => `【${z}】`).join(", ")}</strong> 同时出现在不同倾向组（主攻、防守、绝杀）中。由于模型在这些属性上的正面多级共振分与反面拦截绝对值完全对称，导致了信号对称性泄漏，这会严重稀释预测纯度！
                      </p>
                      <div className="text-[10.5px] text-rose-900 font-semibold bg-rose-100/50 p-2 rounded-lg border border-rose-200/30">
                        💡 实战优化建议：请点击左上角齿轮图标，微调<strong>「智能决策权重」</strong>（如将 F1 大样本权重拉高到 70% 或 80%），或者在算法微调里开启<strong>「卡尔曼滤波」</strong>偏差自适应调节，以打破属性对称平摊，获取高分化的精确指示！
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      三大决策组（重磅、稳健、绝杀）逻辑彻底排他隔离，无任何生肖重叠泄漏冲突。
                    </div>
                  )}

                  {/* Even Distribution Entropy Alarm */}
                  {isEvenSize || isLowVariance ? (
                    <div className="bg-white/60 border border-amber-200/50 rounded-xl p-3 space-y-1.5">
                      <div className="font-bold text-amber-800 flex items-center gap-1">
                        ⚠️ 警告：检测到决策倾向存在“生肖均匀分配（平摊）”的均分倾向！
                      </div>
                      <p className="leading-relaxed text-amber-950">
                        当前重磅主攻({hLen})、稳健防守({mLen})、死穴绝杀({kLen})三大决策组生肖数量呈现严格对称分布 (或历史大盘评分标准差 stdDev = {stdDev.toFixed(1)} 偏低)。这说明历史统计特征过于发散均衡，容易丧失主攻聚焦度，在实战中容易被平摊！
                      </p>
                      <div className="text-[10.5px] text-amber-900 font-semibold bg-amber-100/50 p-2 rounded-lg border border-amber-200/30">
                        💡 实战均分对冲建议：强烈建议微调<strong>「加权移动平均(WMA)的移动平均窗口」</strong>或微调<strong>「Kalman 滤波的过程噪声 Q」</strong>（如适当减小过程噪声 Q 到 0.001），使模型对近期波动的偏振反应更激进，进而拉开分数极值分化，破除均分平摊倾斜！
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white/40 border border-emerald-100/30 rounded-xl p-3 flex flex-col gap-1 text-[11px] text-emerald-800 leading-relaxed">
                      <div className="font-bold flex items-center gap-1">
                        ✅ 多轨特征高度分化审计合格 (Entropy Check Green)
                      </div>
                      <p>
                        各决策组生肖分配比具备天然阶梯（主攻 {hLen} 只 / 防守 {mLen} 只 / 绝杀 {kLen} 只，大盘极值分化标准差 stdDev = {stdDev.toFixed(1)}，处于高分化高置信度健康区间）。决策主次极度鲜明，实战极强，平摊倾向降为最低！
                      </p>
                    </div>
                  )}

                </div>
              </div>
            );
          })()}

          {/* --- NEW: Benchmark Comparison & Quality Assurance Panel --- */}
          {prediction.benchmark && (
            <div id="benchmark_qa_panel" className="mb-6 border border-gray-200 rounded-2xl p-5 bg-linear-to-b from-gray-50/50 to-white/30 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-600 animate-pulse" />
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">📊 智能调参历史基准 Benchmark 科学质检对账单</h3>
                    <p className="text-[10px] text-gray-400 mt-0.5">回溯评估最近 20 期历史开奖，对比【本次调参配置】与【历史基准配置】的实战拟合效能</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
                  评估样本数: {prediction.benchmark.testedCount} 期
                </span>
              </div>

              {/* Error rate comparison table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-400 text-[10px] uppercase font-bold tracking-wider">
                      <th className="py-2">核心评估指标 (KPI)</th>
                      <th className="py-2 text-center">历史默认基准 (Baseline)</th>
                      <th className="py-2 text-center">本次调参配置 (Proposed)</th>
                      <th className="py-2 text-center">科学质检偏振幅度</th>
                      <th className="py-2 text-right">优化评估结论</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-gray-700">
                    {/* 1. Weighted Hit Rate */}
                    <tr className="hover:bg-gray-50/30">
                      <td className="py-2.5 font-semibold text-gray-800">
                        加权综合命中率 (Weighted Hit Rate)
                        <span className="block text-[9px] text-gray-400 font-normal">权重配比: 主攻50% / 防守30% / 绝杀20%</span>
                      </td>
                      <td className="py-2.5 text-center font-mono text-gray-600">
                        {(prediction.benchmark.baseline.weightedHitRate * 100).toFixed(1)}%
                      </td>
                      <td className={`py-2.5 text-center font-mono font-bold ${prediction.benchmark.current.weightedHitRate >= prediction.benchmark.baseline.weightedHitRate ? "text-emerald-600" : "text-rose-600"}`}>
                        {(prediction.benchmark.current.weightedHitRate * 100).toFixed(1)}%
                      </td>
                      <td className={`py-2.5 text-center font-mono font-bold ${prediction.benchmark.gains.weightedHitRateGain >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {prediction.benchmark.gains.weightedHitRateGain >= 0 ? "+" : ""}{(prediction.benchmark.gains.weightedHitRateGain * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 text-right font-medium">
                        {prediction.benchmark.gains.weightedHitRateGain >= 0 ? (
                          <span className="text-emerald-600 flex items-center justify-end gap-1 text-[11px]">
                            <CheckCircle className="w-3.5 h-3.5" /> 正向拟合优化
                          </span>
                        ) : (
                          <span className="text-rose-600 flex items-center justify-end gap-1 text-[11px] font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 animate-bounce" /> 逆向负优化 (误差增加)
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* 2. Tier 1 Hit Rate */}
                    <tr className="hover:bg-gray-50/30">
                      <td className="py-2.5 font-semibold text-gray-800">
                        重磅主攻命中率 (Tier 1 Hit Rate)
                        <span className="block text-[9px] text-gray-400 font-normal">评估主攻生肖的平均推荐精确命中度</span>
                      </td>
                      <td className="py-2.5 text-center font-mono text-gray-600">
                        {(prediction.benchmark.baseline.hotHitRate * 100).toFixed(1)}%
                      </td>
                      <td className={`py-2.5 text-center font-mono font-bold ${prediction.benchmark.current.hotHitRate >= prediction.benchmark.baseline.hotHitRate ? "text-emerald-600" : "text-rose-600"}`}>
                        {(prediction.benchmark.current.hotHitRate * 100).toFixed(1)}%
                      </td>
                      <td className={`py-2.5 text-center font-mono font-bold ${prediction.benchmark.gains.hotHitRateGain >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {prediction.benchmark.gains.hotHitRateGain >= 0 ? "+" : ""}{(prediction.benchmark.gains.hotHitRateGain * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 text-right font-medium">
                        {prediction.benchmark.gains.hotHitRateGain >= 0 ? (
                          <span className="text-emerald-600 text-[11px]">🟢 推荐浓度提升</span>
                        ) : (
                          <span className="text-rose-600 text-[11px] font-bold">🚨 推荐纯度稀释</span>
                        )}
                      </td>
                    </tr>

                    {/* 3. Tier 3 Fail Count */}
                    <tr className="hover:bg-gray-50/30">
                      <td className="py-2.5 font-semibold text-gray-800">
                        绝杀绝对漏杀次数 (Tier 3 Fail Count)
                        <span className="block text-[9px] text-gray-400 font-normal">死穴绝杀生肖开出的总期数（越少越优）</span>
                      </td>
                      <td className="py-2.5 text-center font-mono text-gray-600">
                        {prediction.benchmark.baseline.killFailCount} 次漏杀
                      </td>
                      <td className={`py-2.5 text-center font-mono font-bold ${prediction.benchmark.current.killFailCount <= prediction.benchmark.baseline.killFailCount ? "text-emerald-600" : "text-rose-600"}`}>
                        {prediction.benchmark.current.killFailCount} 次漏杀
                      </td>
                      <td className={`py-2.5 text-center font-mono font-bold ${prediction.benchmark.gains.killFailCountGain >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {prediction.benchmark.gains.killFailCountGain > 0 ? `减少 ${prediction.benchmark.gains.killFailCountGain} 次` : prediction.benchmark.gains.killFailCountGain < 0 ? `增加 ${Math.abs(prediction.benchmark.gains.killFailCountGain)} 次` : "无变化"}
                      </td>
                      <td className="py-2.5 text-right font-medium">
                        {prediction.benchmark.gains.killFailCountGain >= 0 ? (
                          <span className="text-emerald-600 text-[11px]">🛡️ 安全防御过关</span>
                        ) : (
                          <span className="text-rose-600 text-[11px] font-bold">💀 防护盾漏穿透</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Alert Message for Degraded Parameters (高亮预警) */}
              {prediction.benchmark.isDegraded ? (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3 items-start animate-pulse">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-rose-800">🚨 警告：参数配置引发模型拟合劣化（误差扩大）！</h4>
                    <p className="text-[11px] text-rose-700 leading-relaxed mt-1">
                      当前调优参数在测试集上的<strong>「加权综合命中率」</strong>或<strong>「主攻命中率」</strong>下滑，或者<strong>「绝杀漏杀次数增加」</strong>。根据系统硬性拦截阈值保护：
                    </p>
                    <div className="mt-2 text-[10.5px] font-semibold bg-rose-100 text-rose-950 p-2 rounded-lg border border-rose-200 inline-block">
                      🚫 【一键熔断警告】不建议部署上线当前规则链配置，强烈建议恢复至默认基准配置。
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 flex gap-2.5 items-center">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-emerald-800">✅ 质检合格：当前推荐算法与调参整体表现优于历史基准！</h4>
                    <p className="text-[10.5px] text-emerald-700 mt-0.5">
                      本次微调在测试样本中实现了正向增益，满足模型自适应安全上线条件（加权增益：{(prediction.benchmark.gains.weightedHitRateGain * 100).toFixed(1)}%）。
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {prediction.modelValidation?.killTierSuppressed && (
            <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 flex items-start gap-2.5">
              <ShieldAlert className="w-4.5 h-4.5 text-sky-700 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-sky-900">低信号保护已开启：绝杀推荐为空</div>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-sky-800">
                  下方末位生肖仅为相对低分观察候选，不参与绝杀拦截率，不可作为排除或投注依据。
                </p>
              </div>
            </div>
          )}

          {prediction.modelValidation && !prediction.modelValidation.top3Reliable && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4.5 h-4.5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-amber-900">Top‑3 跨窗口稳定性尚未达标</div>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-amber-800">
                  当前使用 {prediction.modelValidation.historyWindow ?? 75} 期动态记忆；主攻排序仅作研究观察，不应视为高置信推荐。
                </p>
              </div>
            </div>
          )}

          {watchAudit?.continuousValidation && (
            <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-[10.5px] leading-relaxed text-indigo-900">
              自动持续验证截至第 {watchAudit.continuousValidation.throughIssue} 期：最近 {watchAudit.continuousValidation.periods} 期
              Top‑3 命中率 {(watchAudit.continuousValidation.top3Precision * 100).toFixed(1)}%，
              随机基线提升 {watchAudit.continuousValidation.precisionLiftVsRandom.toFixed(3)} 倍；
              当前状态为{watchAudit.continuousValidation.status === "stable_signal" ? "稳定信号" : "继续低信号保护"}。
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="border border-emerald-200 bg-emerald-50/55 rounded-2xl p-4">
              <div className="text-[11px] text-emerald-800 font-bold uppercase tracking-wider flex items-center gap-1">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                重磅主攻 (核心精选)
              </div>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {prediction.tierHot.length > 0 ? (
                  prediction.tierHot.map(z => (
                    <span key={z} className="px-2.5 py-1 text-sm font-bold bg-emerald-600 text-white rounded-lg shadow-xs">
                      【{z}】
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400">无</span>
                )}
              </div>
            </div>

            <div className="border border-amber-200 bg-amber-50/55 rounded-2xl p-4">
              <div className="text-[11px] text-amber-800 font-bold uppercase tracking-wider flex items-center gap-1">
                <CheckCircle className="w-4 h-4 text-amber-600" />
                稳健防守 (次要防守)
              </div>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {prediction.tierMid.length > 0 ? (
                  prediction.tierMid.map(z => (
                    <span key={z} className="px-2.5 py-1 text-sm font-bold bg-amber-500 text-white rounded-lg shadow-xs">
                      【{z}】
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400">无</span>
                )}
              </div>
            </div>

            {prediction.tierKill.length > 0 ? (
              <div className="border border-rose-200 bg-rose-50/55 rounded-2xl p-4">
                <div className="text-[11px] text-rose-800 font-bold uppercase tracking-wider flex items-center gap-1">
                  <ShieldX className="w-4 h-4 text-rose-600" />
                  死穴绝杀 (坚决清除)
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {prediction.tierKill.map(z => (
                    <span key={z} className="px-2 py-0.5 text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200 rounded-md">
                      【{z}】
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border border-slate-200 bg-slate-50/80 rounded-2xl p-4">
                <div className="text-[11px] text-slate-700 font-bold uppercase tracking-wider flex items-center gap-1">
                  <ShieldAlert className="w-4 h-4 text-slate-600" />
                  低分观察 (不可绝杀)
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {(prediction.tierWatch || []).length > 0 ? (
                    (prediction.tierWatch || []).map(z => (
                      <span key={z} className="px-2 py-0.5 text-xs font-semibold bg-white text-slate-700 border border-slate-300 rounded-md">
                        【{z}】 {prediction.scores[z] ?? 0}分
                      </span>
                    ))
                  ) : (
                    <span className="text-xs font-semibold text-slate-600">本期无法形成可靠低分观察组</span>
                  )}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                  {prediction.watchSeparation
                    ? `${prediction.watchSeparation.reason}；边界分差 ${prediction.watchSeparation.boundaryGap.toFixed(2)} 分，整体标准差 ${prediction.watchSeparation.scoreStdDev.toFixed(2)} 分。`
                    : "只反映模型内部相对排名，不代表不会开出。"}
                </p>
              </div>
            )}
          </div>

          {(prediction.tierWatchCandidates || prediction.tierWatch || []).length > 0 && (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-slate-700" />
                    低分观察候选历史风险追踪
                  </h4>
                  <p className="mt-0.5 text-[10px] text-slate-500">最近20期严格滚动回放，每期只使用开奖前数据。</p>
                </div>
                <span className="self-start sm:self-auto inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">
                  <History className="w-3.5 h-3.5" />
                  风险揭示，不是绝杀验证
                </span>
              </div>

              {watchAuditLoading ? (
                <div className="p-6 text-center">
                  <Compass className="w-5 h-5 animate-spin text-slate-500 mx-auto" />
                  <p className="mt-2 text-xs text-slate-500">正在后台回放最近20期观察候选...</p>
                </div>
              ) : watchAuditError ? (
                <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {watchAuditError}
                </div>
              ) : watchAudit ? (
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-[10px] font-bold text-slate-500">观察生肖实际开出率</div>
                      <div className="mt-1 text-xl font-black font-mono text-slate-900">{(watchAudit.summary.candidateOpenRate * 100).toFixed(1)}%</div>
                      <div className="text-[10px] text-slate-500">{watchAudit.summary.openedCandidates}/{watchAudit.summary.totalCandidates} 个候选实际开出</div>
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                      <div className="text-[10px] font-bold text-rose-700">至少开出一肖的期数</div>
                      <div className="mt-1 text-xl font-black font-mono text-rose-800">{(watchAudit.summary.anyOpenRate * 100).toFixed(1)}%</div>
                      <div className="text-[10px] text-rose-700">{watchAudit.summary.anyOpenPeriods}/{watchAudit.summary.periods} 期发生观察候选开出</div>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <div className="text-[10px] font-bold text-emerald-700">观察组全部避开</div>
                      <div className="mt-1 text-xl font-black font-mono text-emerald-800">{(watchAudit.summary.fullyAvoidedRate * 100).toFixed(1)}%</div>
                      <div className="text-[10px] text-emerald-700">仅 {watchAudit.summary.fullyAvoidedPeriods}/{watchAudit.summary.periods} 期全部未开</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10.5px] leading-relaxed text-amber-900">
                    {watchAudit.note}。只要“至少开出一肖”的比例较高，就不能把观察组升级为绝杀。
                  </div>

                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10.5px] leading-relaxed text-sky-900">
                    数值分差仅在 {watchAudit.separationAudit.numericallyQualifiedPeriods}/{watchAudit.summary.periods} 期达标，
                    历史验证门槛允许展示 {watchAudit.separationAudit.displayedPeriods} 期；
                    因同类样本不足，其余 {watchAudit.separationAudit.suppressedPeriods} 期均隐藏具名候选。
                  </div>

                  <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[560px] text-left text-[10.5px]">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500">
                        <tr>
                          <th className="p-2.5">期号</th>
                          <th className="p-2.5">观察候选</th>
                          <th className="p-2.5">其中实际开出</th>
                          <th className="p-2.5">边界分差</th>
                          <th className="p-2.5 text-right">结果</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {watchAudit.rows.slice().reverse().map(row => (
                          <tr key={row.issue} className={row.anyOpened ? "bg-rose-50/40" : "bg-emerald-50/30"}>
                            <td className="p-2.5 font-semibold text-slate-800">第 {row.issue} 期<span className="block text-[9px] font-normal text-slate-400">{row.date}</span></td>
                            <td className="p-2.5 text-slate-700">{row.watchedZodiacs.map(z => `【${z}】`).join(" ")}</td>
                            <td className="p-2.5 font-semibold text-rose-700">{row.openedZodiacs.length > 0 ? row.openedZodiacs.map(z => `【${z}】`).join(" ") : "无"}</td>
                            <td className="p-2.5 text-slate-600">
                              {row.watchSeparation ? `${row.watchSeparation.boundaryGap.toFixed(2)}分 · ${row.displayed ? "展示" : row.numericallySeparated ? "待验证" : "隐藏"}` : "-"}
                            </td>
                            <td className={`p-2.5 text-right font-bold ${row.anyOpened ? "text-rose-700" : "text-emerald-700"}`}>{row.anyOpened ? "有开出" : "全部避开"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Number recommendations */}
        <div className="border-t border-gray-100 pt-5 space-y-5">
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              🎯 【主攻核心特码弹药库】(源于核心生肖 + 黄金过滤，爆发率最高)
            </div>
            <div className="flex flex-wrap gap-2">
              {prediction.premiumHotNums.length > 0 ? (
                prediction.premiumHotNums.map(n => (
                  <span key={n} className="w-10 h-10 rounded-full bg-linear-to-b from-rose-500 to-rose-600 text-white font-mono font-bold text-sm flex items-center justify-center shadow-md shadow-rose-100">
                    {n.toString().padStart(2, "0")}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-400">无对应号码</span>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              🎯 【全盘防守特码大底】(核心生肖号源全开)
            </div>
            <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto border border-gray-50 bg-gray-50/30 p-3 rounded-xl">
              {prediction.hotNums.length > 0 ? (
                prediction.hotNums.map(n => (
                  <span key={n} className="w-8 h-8 rounded-full bg-linear-to-b from-indigo-500 to-indigo-600 text-white font-mono font-bold text-xs flex items-center justify-center shadow-xs">
                    {n.toString().padStart(2, "0")}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-400">无对应号码</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/40">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                📐 【空间拦截定胆参考】(区间 10-19 黄金槽码)
              </div>
              <div className="flex flex-wrap gap-2">
                {prediction.spaceCore.map(n => (
                  <span key={n} className="w-8 h-8 rounded-full bg-white border border-gray-200 text-indigo-600 font-mono font-bold text-xs flex items-center justify-center shadow-xs">
                    {n.toString().padStart(2, "0")}
                  </span>
                ))}
              </div>
            </div>

            <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/40">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                🛡️ 【平稳防守兜底号源】(防守生肖对应号)
              </div>
              <div className="flex flex-wrap gap-2 max-h-[50px] overflow-y-auto pr-1">
                {prediction.midNums.map(n => (
                  <span key={n} className="text-xs font-mono font-bold text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-lg">
                    {n.toString().padStart(2, "0")}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Model Bias Calibration Display */}
        {prediction.calibration && (
          <div className="border-t border-gray-100 pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                模型偏差自适应校准率 (偏振调节因子)
              </div>
              <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full uppercase">
                {prediction.calibration.method === "kalman" ? "卡尔曼滤波 (Kalman)" : prediction.calibration.method === "wma" ? "加权移动平均 (WMA)" : "已关闭"}
              </span>
            </div>
            
            <p className="text-[11px] text-gray-500 leading-relaxed">
              基于 {prediction.calibration.method === "kalman" ? `过程噪声 Q=${prediction.calibration.q} / 测量噪声 R=${prediction.calibration.r}` : `时间衰减窗口 W=${prediction.calibration.windowSize} 期`} 计算。该校准因子用于对冲并修正大盘由于近期偏振而产生的历史偏差，自适应调整各生肖的基础权重。
            </p>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-1">
              {Object.entries(prediction.calibration.rates || {}).map(([zodiac, rate]) => {
                const multiplier = 0.8 + rate * 0.4;
                const pct = Math.round(rate * 100);
                const isHot = multiplier > 1.05;
                const isCold = multiplier < 0.95;
                return (
                  <div key={zodiac} className="bg-gray-50/50 border border-gray-100 rounded-xl p-2.5 flex flex-col items-center justify-center">
                    <span className="text-xs font-bold text-gray-800">{zodiac}</span>
                    <span className={`text-[10px] font-mono font-bold mt-1 ${isHot ? "text-rose-600" : isCold ? "text-emerald-600" : "text-gray-500"}`}>
                      x{multiplier.toFixed(2)}
                    </span>
                    <div className="w-full bg-gray-200 h-1 rounded-full mt-1.5 overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${isHot ? "bg-rose-500" : isCold ? "bg-emerald-500" : "bg-gray-400"}`}
                        style={{ width: `${Math.min(100, Math.max(10, pct))}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* --- NEW: Tier 3 Kill/Exclusion Dedicated Radar Intercept Cockpit --- */}
        {prediction.tierKill.length > 0 && prediction.killInterceptHistory && (
          <div id="kill_intercept_cockpit" className="border-t border-gray-100 pt-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-600 animate-pulse" />
                🛡️ 主控审计舱「死穴绝杀」雷达拦截专设监控视图
              </div>
              <span className="text-[9px] font-mono bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200 font-semibold">
                最近 10 期实战回测拦截跟踪
              </span>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              实时跟踪和对账过去 10 期，由系统<strong>「死穴绝杀高精密过滤器插件」</strong>标记的【100%坚决清除】生肖拦截质量。若出现由于历史极端偏振导致的漏杀（漏防），系统将立即高亮亮网警报。
            </p>

            <div className="overflow-hidden border border-gray-100 rounded-xl bg-gray-50/30">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] border-collapse min-w-[500px]">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-100 text-[9px]">
                      <th className="p-2.5">期数 / 录入日期</th>
                      <th className="p-2.5">死穴绝杀拦截名册 (Tier 3)</th>
                      <th className="p-2.5">实际开出生肖</th>
                      <th className="p-2.5 text-center">拦截拦截率</th>
                      <th className="p-2.5 text-right">对账核验状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-700 bg-white">
                    {prediction.killInterceptHistory.slice().reverse().map((item, idx) => {
                      const hasLeak = item.leaks.length > 0;
                      return (
                        <tr key={idx} className={`hover:bg-gray-50/50 transition-colors ${hasLeak ? "bg-rose-50/30" : ""}`}>
                          <td className="p-2.5 font-semibold text-gray-900">
                            第 {item.issue} 期
                            <span className="block text-[9px] text-gray-400 font-normal">{item.date}</span>
                          </td>
                          <td className="p-2.5">
                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                              {item.killedZodiacs.map(z => (
                                <span key={z} className="px-1.5 py-0.5 text-[9px] font-mono bg-rose-50 text-rose-700 border border-rose-100 rounded-sm">
                                  {z}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-2.5">
                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                              {item.actualZodiacs.slice(0, 7).map((z, sIdx) => {
                                const isLeaked = item.leaks.includes(z);
                                return (
                                  <span key={sIdx} className={`px-1.5 py-0.5 text-[9px] rounded-sm font-semibold ${
                                    isLeaked 
                                      ? "bg-rose-600 text-white animate-pulse" 
                                      : "bg-gray-100 text-gray-600 border border-gray-200"
                                  }`}>
                                    {z}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold">
                            {hasLeak ? (
                              <span className="text-rose-600">
                                {(((item.killedZodiacs.length - item.leaks.length) / item.killedZodiacs.length) * 100).toFixed(0)}%
                              </span>
                            ) : (
                              <span className="text-emerald-600">100%</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right">
                            {hasLeak ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                🚨 出现漏杀: {item.leaks.map(z => `【${z}】`).join(", ")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-600" /> 100% 完美拦截
                              </span>
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
    </div>
  </div>
  );
};
