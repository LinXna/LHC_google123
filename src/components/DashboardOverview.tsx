import React from "react";
import { 
  Database, 
  Calendar, 
  RefreshCw, 
  Hash, 
  Layers, 
  CheckSquare, 
  Award,
  Download
} from "lucide-react";

interface YearItem {
  filename: string;
  year: number;
}

interface DashboardOverviewProps {
  years: YearItem[];
  selectedYears: string[];
  setSelectedYears: (years: string[]) => void;
  baseZodiac: string;
  setBaseZodiac: (zodiac: string) => void;
  engineMode: "unified" | "dynamic";
  setEngineMode: (mode: "unified" | "dynamic") => void;
  appliedYears: string[];
  appliedBaseZodiac: string;
  appliedEngineMode: "unified" | "dynamic";
  onApplySettings: () => void;
  loading: boolean;
  onRefresh: () => void;
  totalRecords: number;
  latestYear: number;
  latestRecord: {
    issue: number;
    date: string;
    numbers: number[];
    zodiacs: string[];
    diversity: number;
  } | null;
  report: any | null;
  prediction: any | null;
  freshnessEnabled: boolean;
  setFreshnessEnabled: (enabled: boolean) => void;
  freshnessYears: number;
  setFreshnessYears: (years: number) => void;
  appliedFreshnessEnabled: boolean;
  appliedFreshnessYears: number;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  years,
  selectedYears,
  setSelectedYears,
  baseZodiac,
  setBaseZodiac,
  engineMode,
  setEngineMode,
  appliedYears,
  appliedBaseZodiac,
  appliedEngineMode,
  onApplySettings,
  loading,
  onRefresh,
  totalRecords,
  latestYear,
  latestRecord,
  report,
  prediction,
  freshnessEnabled,
  setFreshnessEnabled,
  freshnessYears,
  setFreshnessYears,
  appliedFreshnessEnabled,
  appliedFreshnessYears,
}) => {
  const zodiacList = ["马", "蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊"];

  const hasChanges = 
    JSON.stringify([...selectedYears].sort()) !== JSON.stringify([...appliedYears].sort()) ||
    baseZodiac !== appliedBaseZodiac ||
    engineMode !== appliedEngineMode ||
    freshnessEnabled !== appliedFreshnessEnabled ||
    freshnessYears !== appliedFreshnessYears;

  const exportReportToMarkdown = () => {
    if (!report) return;

    let md = "";
    md += `# LHC 生肖量化特征与多组合精准推演系统分析报告\n\n`;
    md += `> **导出时间**: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} (北京时间)\n`;
    md += `> **数据源配置**: ${appliedYears.map(y => y.replace(".json", "")).join(", ")} 年\n`;
    md += `> **引擎模式**: ${appliedEngineMode === "dynamic" ? "动态生肖模式 (按年份岁次自动查表)" : `统一生肖模式 (固定本命肖: ${appliedBaseZodiac})`}\n`;
    md += `> **数据期数**: 累计 ${totalRecords} 期\n\n`;

    if (latestRecord) {
      md += `## 📊 最新开奖数据审计\n\n`;
      md += `- **最新期号**: ${latestRecord.issue} 期\n`;
      md += `- **开奖日期**: ${latestRecord.date}\n`;
      md += `- **去重后生肖多样性**: ${latestRecord.diversity} 种生肖\n`;
      md += `- **开奖号码与生肖对应**:\n`;
      latestRecord.numbers.forEach((num: number, idx: number) => {
        md += `  - **${num.toString().padStart(2, "0")}**: ${latestRecord.zodiacs[idx] || "未知"}\n`;
      });
      md += `\n`;
    }

    if (report.zodiac_ranking && report.zodiac_ranking.length > 0) {
      md += `## 🏆 核心生肖最新算法评分与排名\n\n`;
      md += `| 排名 | 生肖 | 综合评分 | 判定依据与量化特征 |\n`;
      md += `| :---: | :---: | :---: | :--- |\n`;
      report.zodiac_ranking.forEach(([z, detail]: any, idx: number) => {
        md += `| ${idx + 1} | **${z}** | ${detail.score.toFixed(1)} | ${detail.reasons.join("；")} |\n`;
      });
      md += `\n`;
    }

    if (prediction) {
      md += `## 🎯 决策推演预测 (下期: ${prediction.nextIssue}期)\n\n`;
      md += `- **分析基准期**: ${prediction.latestIssue} 期\n`;
      md += `- **推演难度指数**: **${prediction.difficultyScore}** / 100 分\n`;
      md += `- **重磅主攻生肖 (核心组合)**: \`${prediction.tierHot.join(" ")}\`\n`;
      md += `- **稳健防守生肖 (次要组合)**: \`${prediction.tierMid.join(" ")}\`\n`;
      md += `- **绝对死穴规避 (绝杀拦截)**: \`${prediction.tierKill.join(" ")}\`\n`;
      md += `- **精选特码弹药配置**: \`${prediction.premiumHotNums.map(n => n.toString().padStart(2, "0")).join(" ")}\`\n`;
      md += `- **备用特码推荐**: \`${prediction.hotNums.map(n => n.toString().padStart(2, "0")).join(" ")}\`\n\n`;
      md += `### 💡 决策结论与实战指引\n\n`;
      md += `> **推演结论**:\n> ${prediction.conclusion}\n\n`;
      md += `> **战术配置建议**:\n> ${prediction.actionAdvice}\n\n`;
    }

    if (report.rule2_kills && report.rule2_kills.length > 0) {
      md += `## 🛡️ 100% 概率强绝杀规律审计 (Rule 2 Kills)\n\n`;
      md += `| 当期触发生肖 | 绝杀下期生肖 | 历史强杀概率 | 触发次数 |\n`;
      md += `| :---: | :---: | :---: | :---: |\n`;
      report.rule2_kills.forEach((item: any) => {
        md += `| ${item.curr} | **${item.kill}** | ${(item.prob * 100).toFixed(1)}% | ${item.trigger_p} 次 |\n`;
      });
      md += `\n`;
    }

    md += `## ⚙️ 系统审计声明\n\n`;
    md += `1. 本报告由 LHC 自动化双特征共振智能推演系统底层高维穿透算法自动计算生成。\n`;
    md += `2. 所有规律均为历史统计拟合成果，不代表任何绝对性预测保证，请合理配置战术弹药。\n`;

    try {
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.href = url;
      const filename = `LHC_Zodiac_Analysis_Report_${new Date().toISOString().slice(0, 10)}.md`;
      downloadAnchor.download = filename;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export Markdown report failed:", e);
    }
  };

  const toggleYear = (filename: string) => {
    if (selectedYears.includes(filename)) {
      setSelectedYears(selectedYears.filter(f => f !== filename));
    } else {
      setSelectedYears([...selectedYears, filename]);
    }
  };

  const selectAllYears = () => {
    setSelectedYears(years.map(y => y.filename));
  };

  const selectNoneYears = () => {
    setSelectedYears([]);
  };

  const selectRecentYears = (num: number) => {
    const sorted = [...years].sort((a, b) => b.year - a.year);
    const recent = sorted.slice(0, num).map(y => y.filename);
    setSelectedYears(recent);
  };

  const renderFormattedDate = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parts[0];
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      
      // Get week day if possible
      let weekDayStr = "";
      try {
        const d = new Date(year + "/" + parts[1] + "/" + parts[2]);
        if (!isNaN(d.getTime())) {
          const weekDays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
          weekDayStr = ` (${weekDays[d.getDay()]})`;
        }
      } catch (err) {}
      
      return (
        <span className="flex items-center gap-1 font-semibold text-gray-700">
          <span className="font-mono font-bold text-indigo-700">{year}</span>年
          <span className="font-mono font-bold text-indigo-700">{month}</span>月
          <span className="font-mono font-bold text-indigo-700">{day}</span>日
          <span className="text-gray-500 text-[11px] font-normal">{weekDayStr}</span>
        </span>
      );
    }
    return dateStr;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Year Filter and Engine Settings */}
      <div className="lg:col-span-1 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-600" />
              数据源配置与引擎
            </h2>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors disabled:opacity-50"
              title="重新计算"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">选择历史年份</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button 
                  onClick={() => selectRecentYears(3)}
                  className="text-[11px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-0.5 rounded-md font-medium transition-colors"
                >
                  最近3年
                </button>
                <button 
                  onClick={() => selectRecentYears(5)}
                  className="text-[11px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-0.5 rounded-md font-medium transition-colors"
                >
                  最近5年
                </button>
                <span className="text-gray-300 text-xs">|</span>
                <button 
                  onClick={selectAllYears}
                  className="text-[11px] text-indigo-650 hover:text-indigo-850 font-semibold"
                >
                  全选
                </button>
                <span className="text-gray-300 text-xs">|</span>
                <button 
                  onClick={selectNoneYears}
                  className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold"
                >
                  清空
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2 max-h-[140px] overflow-y-auto border border-gray-100 rounded-xl p-3 bg-gray-50/50">
              {years.map(y => {
                const isSelected = selectedYears.includes(y.filename);
                return (
                  <button
                    key={y.filename}
                    onClick={() => toggleYear(y.filename)}
                    className={`px-2 py-1 text-xs font-medium rounded-lg border transition-all text-center ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {y.year}年
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5">
              提示: 多选年份将自动合并进行跨年度对齐统计。
            </p>
          </div>

          {/* 规律保鲜度 Toggle and Parameter Slider */}
          <div className="border-t border-gray-100 pt-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-gray-700">规律保鲜度优先权衡</span>
                <span className="text-[10px] text-gray-400">优先强特征，弱化久远过载数据</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={freshnessEnabled}
                  onChange={(e) => setFreshnessEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
            
            {freshnessEnabled && (
              <div className="mt-3 bg-indigo-50/40 border border-indigo-100/50 rounded-xl p-3 animate-fade-in space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-950">
                  <span>优先保留强特征年份 (X年内)</span>
                  <span className="bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-md font-bold">{freshnessYears} 年</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={freshnessYears}
                  onChange={(e) => setFreshnessYears(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <p className="text-[10px] text-gray-500 leading-normal">
                  * <strong>最近 {freshnessYears} 年：</strong>100% 完整保留历史拟合权重。<br />
                  * <strong>大于 {freshnessYears} 年：</strong>以指数衰退重采样弱化，解决数据过载引起的预测拟合误差。
                </p>
              </div>
            )}
          </div>

          {engineMode === "unified" && (
            <div className="border-t border-gray-100 pt-4 mb-4 animate-fade-in">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                统一生肖推演引擎本命肖
              </label>
              {selectedYears.length === 0 ? (
                <div className="text-[11px] text-amber-600 bg-amber-50/50 border border-amber-100 rounded-lg p-2.5 font-medium leading-relaxed">
                  ⚠️ 请先在上方选择历史年份，方可设定统一生肖引擎本命肖。
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {zodiacList.map(z => {
                    const isSelected = baseZodiac === z;
                    return (
                      <button
                        key={z}
                        onClick={() => setBaseZodiac(z)}
                        className={`py-1 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? "bg-indigo-50 border-indigo-500 text-indigo-700 ring-1 ring-indigo-500/10"
                            : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        {z}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-gray-100 pt-4 mb-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              生肖映射计算引擎
            </label>
            {selectedYears.length === 0 ? (
              <div className="text-[11px] text-amber-600 bg-amber-50/50 border border-amber-100 rounded-lg p-2.5 font-medium leading-relaxed">
                ⚠️ 请先在上方选择历史年份，以启用生肖映射引擎切换。
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setEngineMode("unified")}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all text-center flex flex-col justify-center items-center gap-0.5 cursor-pointer ${
                      engineMode === "unified"
                        ? "bg-indigo-50 border-indigo-500 text-indigo-700 ring-1 ring-indigo-500/10"
                        : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <span className="font-bold">统一生肖模式</span>
                    <span className="text-[9px] text-gray-400 font-normal">固定使用上方选择的本命肖</span>
                  </button>
                  <button
                    onClick={() => setEngineMode("dynamic")}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all text-center flex flex-col justify-center items-center gap-0.5 cursor-pointer ${
                      engineMode === "dynamic"
                        ? "bg-indigo-50 border-indigo-500 text-indigo-700 ring-1 ring-indigo-500/10"
                        : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <span className="font-bold">动态生肖模式</span>
                    <span className="text-[9px] text-gray-400 font-normal">依年份自动计算对应本命肖</span>
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                  * <strong>统一生肖：</strong>所有历史年份均套用同一个选定本命肖（如“马”），寻找绝对对应关系的共振规律。<br />
                  * <strong>动态生肖：</strong>按真实 calendar 年份（如2026年马、2025年蛇、2024年龙）自动查表转换本命肖，进行时序推演。
                </p>
              </>
            )}
          </div>

          {/* Confirm Apply / Calculate Button */}
          <div className="border-t border-gray-100 pt-4 mt-4 space-y-2">
            <button
              onClick={onApplySettings}
              disabled={loading || selectedYears.length === 0}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                selectedYears.length === 0
                  ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                  : hasChanges 
                  ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-100 border border-indigo-600 animate-pulse" 
                  : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              {selectedYears.length === 0 ? "请先选择数据年份" : loading ? "算法引擎计算中..." : hasChanges ? "确认应用参数并重新计算" : "已应用当前最新参数"}
            </button>
            {hasChanges && selectedYears.length > 0 && (
              <p className="text-[10px] text-amber-600 font-semibold text-center mt-1.5 animate-pulse">
                ⚠️ 检测到参数有变动，请点击上方按钮重新应用计算
              </p>
            )}
            {report && (
              <button
                onClick={exportReportToMarkdown}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md border border-slate-800"
                id="export-md-report-btn"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                导出当前 Markdown 分析报告
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-400">当前合并总期数</div>
            <div className="text-2xl font-bold font-mono text-gray-900">{totalRecords} <span className="text-xs font-normal text-gray-500">期</span></div>
          </div>
          <div>
            <div className="text-xs text-gray-400">最新年份</div>
            <div className="text-2xl font-bold font-mono text-gray-900">{latestYear} <span className="text-xs font-normal text-gray-500">年</span></div>
          </div>
        </div>
      </div>

      {/* Latest Draw Details */}
      {appliedYears.length === 0 ? (
        <div className="lg:col-span-2 bg-amber-50/40 border border-amber-200/60 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-4 animate-bounce">
            <Database className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-amber-800 mb-2">⚠️ 未激活任何数据源年份配置</h3>
          <p className="text-xs text-amber-600/95 max-w-md leading-relaxed">
            检测到当前数据源的选择年份已被完全清空。算法推演引擎需要至少一个年份的数据集参与映射和共振统计。请在左侧<strong>【选择历史年份】</strong>中勾选年份，并点击<strong>【确认应用参数并重新计算】</strong>以重新激活大盘计算。
          </p>
        </div>
      ) : latestRecord ? (
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Award className="w-5 h-5 text-indigo-600" />
                最新开奖信息审计
              </h2>
              <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100/80 flex items-center gap-1.5 shadow-2xs">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                {renderFormattedDate(latestRecord.date)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
                <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">最新期号</div>
                <div className="text-lg font-bold text-gray-800 font-mono flex items-center gap-1 mt-0.5">
                  <Hash className="w-4 h-4 text-gray-400" />
                  {latestRecord.issue}
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
                <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">去重后生肖多样性</div>
                <div className="text-lg font-bold text-gray-800 font-mono flex items-center gap-1 mt-0.5">
                  <Layers className="w-4 h-4 text-gray-400" />
                  {latestRecord.diversity} 种生肖
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
                <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">引擎推演本命</div>
                <div className="text-lg font-bold text-indigo-600 font-mono flex items-center gap-1 mt-0.5">
                  <CheckSquare className="w-4 h-4 text-indigo-400" />
                  【{appliedBaseZodiac}】
                </div>
              </div>
            </div>

            {/* Balls Visualization */}
            <div className="mb-6">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">当期开奖奖号 & 生肖对应</div>
              <div className="flex flex-wrap gap-3">
                {latestRecord.numbers.map((num, i) => {
                  const z = latestRecord.zodiacs[i];
                  return (
                    <div key={i} className="flex flex-col items-center gap-1.5">
                      <div className="w-12 h-12 rounded-full bg-linear-to-b from-indigo-500 to-indigo-600 text-white font-mono font-bold text-base flex items-center justify-center shadow-md shadow-indigo-200">
                        {num.toString().padStart(2, "0")}
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">
                        {z}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 text-xs text-gray-500 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {appliedEngineMode === "dynamic" ? (
              <span>当前对齐规则：<strong>动态生肖引擎已激活。</strong>各年份开奖分别使用该年天干地支对应的本命肖进行高精穿透解析与特征归纳。</span>
            ) : (
              <span>当前对齐规则：<strong>统一生肖引擎已激活。</strong>全盘历史数据统一映射并对齐至选定本命肖【{appliedBaseZodiac}】下的 1-49 对应生肖。</span>
            )}
          </div>
        </div>
      ) : (
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center text-gray-400 gap-3 min-h-[300px]">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
          <span className="text-xs font-semibold text-gray-500">推演引擎数据加载计算中...</span>
        </div>
      )}
    </div>
  );
};
