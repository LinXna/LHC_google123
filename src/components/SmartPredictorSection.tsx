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
  Plus
} from "lucide-react";
import { PredictionResult } from "../types.js";

interface SmartPredictorSectionProps {
  prediction: PredictionResult | null;
  loading: boolean;
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

  if (loading && !prediction) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm text-center">
        <Compass className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-3" />
        <p className="text-sm font-semibold text-gray-700">正在调用智能推演引擎...</p>
        <p className="text-xs text-gray-400 mt-1">深度匹配微观行为、100%绝杀拦截与多样性惯性重组对冲机制中...</p>
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
    text.push(`  🛑 历史死穴绝杀生肖 (一键清除) : ${prediction.tierKill.map(z => `【${z}】`).join(", ")}`);
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

  return (
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
                    <span>F2 (100%绝杀硬截线):</span>
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

            <div className="border border-rose-200 bg-rose-50/55 rounded-2xl p-4">
              <div className="text-[11px] text-rose-800 font-bold uppercase tracking-wider flex items-center gap-1">
                <ShieldX className="w-4 h-4 text-rose-600" />
                死穴绝杀 (坚决清除)
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {prediction.tierKill.length > 0 ? (
                  prediction.tierKill.map(z => (
                    <span key={z} className="px-2 py-0.5 text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200 rounded-md">
                      【{z}】
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400">无</span>
                )}
              </div>
            </div>
          </div>
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
      </div>
    </div>
  );
};
