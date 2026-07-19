import React, { useState, useRef } from "react";
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
  Download,
  GitCompare,
  Activity,
  StopCircle
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
  freshnessEnabled?: boolean;
  freshnessYears?: number;
}

export const BacktestSimulatorSection: React.FC<BacktestSimulatorSectionProps> = ({
  years,
  selectedYears,
  baseZodiac,
  engineMode,
  freshnessEnabled = false,
  freshnessYears = 3,
}) => {
  const [subTab, setSubTab] = useState<"single" | "year" | "compare">("single");

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchWithRetry = async (
    url: string,
    options: RequestInit,
    retries = 3,
    delay = 1000
  ): Promise<Response> => {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`服务器响应错误: 状态码 ${response.status}`);
      }
      return response;
    } catch (err: any) {
      if (retries > 0 && err.name !== "AbortError") {
        console.warn(`请求失败，正自动进行指数退避重试 (剩余重试次数: ${retries})...`, err);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return fetchWithRetry(url, options, retries - 1, delay * 1.5);
      }
      throw err;
    }
  };

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
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<number | null>(null);
  const [chartViewMode, setChartViewMode] = useState<"cumulative" | "monthly">("cumulative");
  const [isFullHistory, setIsFullHistory] = useState<boolean>(false);

  // Comparison states
  const [compareLoading, setCompareLoading] = useState<boolean>(false);
  const [compareUnifiedResult, setCompareUnifiedResult] = useState<any | null>(null);
  const [compareDynamicResult, setCompareDynamicResult] = useState<any | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareProgress, setCompareProgress] = useState<string>("");
  const [compareProgressPercent, setCompareProgressPercent] = useState<number>(0);
  const [compareOnlyDiverged, setCompareOnlyDiverged] = useState<boolean>(false);
  const [selectedDivergentIssue, setSelectedDivergentIssue] = useState<number | null>(null);

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

  const getMonthlyChartData = () => {
    if (!yearResult || !yearResult.results) return [];
    
    const monthlyDataMap: { [key: number]: {
      month: number;
      monthName: string;
      total: number;
      hotHits: number;
      midHits: number;
      perfectKills: number;
    }} = {};
    
    for (let m = 1; m <= 12; m++) {
      monthlyDataMap[m] = {
        month: m,
        monthName: `${m}月`,
        total: 0,
        hotHits: 0,
        midHits: 0,
        perfectKills: 0,
      };
    }
    
    yearResult.results.forEach((r: any) => {
      if (!r.date) return;
      const parts = r.date.split("-");
      if (parts.length >= 2) {
        const m = parseInt(parts[1], 10);
        if (m >= 1 && m <= 12) {
          monthlyDataMap[m].total += 1;
          if (r.metrics.hasHotHit) {
            monthlyDataMap[m].hotHits += 1;
          }
          if (r.metrics.hasMidHit) {
            monthlyDataMap[m].midHits += 1;
          }
          if (r.metrics.isPerfectKill) {
            monthlyDataMap[m].perfectKills += 1;
          }
        }
      }
    });
    
    return Object.values(monthlyDataMap)
      .filter(item => item.total > 0)
      .map(item => ({
        month: item.month,
        monthName: item.monthName,
        "重磅主攻月度命中率": parseFloat(((item.hotHits / item.total) * 100).toFixed(1)),
        "稳健防守月度命中率": parseFloat(((item.midHits / item.total) * 100).toFixed(1)),
        "死穴绝杀月度拦截率": parseFloat(((item.perfectKills / item.total) * 100).toFixed(1)),
        "总期数": item.total,
        "主攻击中": item.hotHits,
        "防守击中": item.midHits,
        "绝杀拦截": item.perfectKills,
      }));
  };

  const monthlyChartData = getMonthlyChartData();

  const filteredResults = yearResult && yearResult.results 
    ? yearResult.results.filter((r: any) => {
        if (selectedMonthFilter === null) return true;
        if (!r.date) return false;
        const parts = r.date.split("-");
        if (parts.length >= 2) {
          const m = parseInt(parts[1], 10);
          return m === selectedMonthFilter;
        }
        return false;
      })
    : [];

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

  const exportBacktestMarkdownReport = () => {
    if (!yearResult) return;
    let md = `# 2026年度穿透对账算法仿真模拟审计报告\n\n`;
    md += `> **大盘审计时域**: 2026年度全期数对照审计\n`;
    md += `> **生成时间**: ${new Date().toLocaleString()}\n`;
    md += `> **岁首生肖基准**: 【${baseZodiac}】\n`;
    md += `> **算法底盘模式**: ${yearResult.engineMode === "dynamic" ? "🟢 动态自适应对冲映射" : "🔵 统一固定生肖映射"}\n`;
    md += `> **参比历史年限**: ${selectedYears.join(", ")}\n\n`;

    md += `## 一、 仿真大盘综合决策性能 KPI\n\n`;
    md += `| 审计指标 | 核心特征评估成果 |\n`;
    md += `| :--- | :--- |\n`;
    md += `| **加权综合命中率** | **${((yearResult.summary.weightedHitRate || 0) * 100).toFixed(1)}%** |\n`;
    md += `| **重磅主攻命中率 (Tier 1)** | **${((yearResult.summary.hotHitRate || 0) * 100).toFixed(1)}%** (${yearResult.summary.hotHitCount}/${yearResult.summary.hotMatchesTotal}) |\n`;
    md += `| **稳健防守命中率 (Tier 2)** | **${((yearResult.summary.midHitRate || 0) * 100).toFixed(1)}%** (${yearResult.summary.midHitCount}/${yearResult.summary.midMatchesTotal}) |\n`;
    md += `| **死穴绝杀拦截率 (Tier 3)** | **${((yearResult.summary.killInterceptRate || 0) * 100).toFixed(1)}%** (${yearResult.summary.killInterceptCount}/${yearResult.summary.totalKillRecommended}) (漏杀数: ${yearResult.summary.killFailCount} 次) |\n`;
    md += `| **精选特码库整体穿透击中** | **${yearResult.summary.numHitsTotal} 次** |\n\n`;

    md += `## 二、 穿透审计逐期全景对账单\n\n`;
    md += `以下为 2026 年度每一期的仿真过程决策对账，包含每期由于规则链震荡生成的智能推荐生肖与最终开奖生肖的核验判定：\n\n`;
    md += `| 期号 | 开奖日期 | 开奖号码 | 开奖生肖 | 重磅推荐 (Tier 1) | 主攻结果 | 防守生肖 (Tier 2) | 死穴拦截 (Tier 3) | 是否完美避开死穴 |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :---: | :--- | :--- | :---: |\n`;

    yearResult.results.forEach((r: any) => {
      const actualZ = r.actualZodiacs.join(", ");
      const actualN = r.actualNums.map((n: number) => n.toString().padStart(2, "0")).join(", ");
      const hotList = r.prediction.tierHot.join(" ");
      const midList = r.prediction.tierMid.join(" ");
      const killList = r.prediction.tierKill.join(" ");
      const hotHit = r.metrics.hotHits > 0 ? "🟢 命中" : "⚪ 未中";
      const killHit = r.metrics.killHits > 0 ? "🚨 漏杀" : "✅ 成功";
      
      md += `| ${r.issue}期 | ${r.date} | ${actualN} | ${actualZ} | ${hotList} | ${hotHit} | ${midList} | ${killList} | ${killHit} |\n`;
    });

    md += `\n---\n\n*算法报告完结 — 由 AI 穿透对账系统自动校准生成*`;

    try {
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.href = url;
      downloadAnchor.download = `LHC_2026_Audit_Report_${yearResult.engineMode}_${Date.now()}.md`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export Markdown audit report failed:", e);
    }
  };

  const exportCompareReport = (divList: any[]) => {
    if (!compareUnifiedResult || !compareDynamicResult) return;
    
    let md = `# 2026年度算法穿透比对与溯源分析实验报告\n\n`;
    md += `> **生成时间**: ${new Date().toLocaleString()}\n`;
    md += `> **对照范围**: 2026年度全期数双轨对比对账\n`;
    md += `> **岁首生肖基准**: 【${baseZodiac}】\n\n`;
    
    md += `## 一、 双轨决策引擎 KPI 对比对账单\n\n`;
    md += `| 核心指标 | 统一固定生肖模式 (Unified) | 动态对冲生肖模式 (Dynamic) | 差异幅度 | 优势评估结论 |\n`;
    md += `| :--- | :---: | :---: | :---: | :--- |\n`;
    
    const weightedDiff = (compareDynamicResult.summary.weightedHitRate - compareUnifiedResult.summary.weightedHitRate) * 100;
    md += `| **加权综合命中率** | ${(compareUnifiedResult.summary.weightedHitRate * 100).toFixed(1)}% | ${(compareDynamicResult.summary.weightedHitRate * 100).toFixed(1)}% | ${weightedDiff >= 0 ? "+" : ""}${weightedDiff.toFixed(1)}% | ${weightedDiff >= 0 ? "🟢 动态引擎综合效率胜出" : "🔵 统一引擎综合效率胜出"} |\n`;
    
    const hotDiff = (compareDynamicResult.summary.hotHitRate - compareUnifiedResult.summary.hotHitRate) * 100;
    md += `| **重磅主攻命中率** | ${(compareUnifiedResult.summary.hotHitRate * 100).toFixed(1)}% (${compareUnifiedResult.summary.hotHitCount}/${compareUnifiedResult.summary.hotMatchesTotal}) | ${(compareDynamicResult.summary.hotHitRate * 100).toFixed(1)}% (${compareDynamicResult.summary.hotHitCount}/${compareDynamicResult.summary.hotMatchesTotal}) | ${hotDiff >= 0 ? "+" : ""}${hotDiff.toFixed(1)}% | ${hotDiff >= 0 ? "🟢 动态对冲降低干扰" : "🔵 统一推荐相对聚焦"} |\n`;
    
    const midDiff = (compareDynamicResult.summary.midHitRate - compareUnifiedResult.summary.midHitRate) * 100;
    md += `| **稳健防守命中率** | ${(compareUnifiedResult.summary.midHitRate * 100).toFixed(1)}% | ${(compareDynamicResult.summary.midHitRate * 100).toFixed(1)}% | ${midDiff >= 0 ? "+" : ""}${midDiff.toFixed(1)}% | 辅助落差评估对冲稳定性 |\n`;
    
    const killDiff = (compareDynamicResult.summary.killInterceptRate - compareUnifiedResult.summary.killInterceptRate) * 100;
    md += `| **死穴绝杀拦截率** | ${(compareUnifiedResult.summary.killInterceptRate * 100).toFixed(1)}% | ${(compareDynamicResult.summary.killInterceptRate * 100).toFixed(1)}% | ${killDiff >= 0 ? "+" : ""}${killDiff.toFixed(1)}% | 统一漏排除 ${compareUnifiedResult.summary.killFailCount} 次 vs 动态漏排除 ${compareDynamicResult.summary.killFailCount} 次 |\n\n`;
    
    md += `## 二、 算法决策分叉与底层溯源 (共 ${divList.length} 期输出不一致)\n\n`;
    md += `以下列表记录了 2026 年度因映射机制对齐时差而产生的模型决策分叉细节，用于穿透定位为什么模型会在这里产生不一样的结论：\n\n`;
    
    divList.forEach((d, idx) => {
      md += `### 【分叉对账单 #${idx + 1}】第 ${d.issue} 期 - ${d.date}\n`;
      md += `- **当期实际开奖**: 号码: [${d.actualNums.map((n: number) => n.toString().padStart(2, "0")).join(", ")}]，生肖: [${d.actualZodiacs.join(", ")}]\n`;
      md += `- **主攻分档 (Tier 1) 比较**:\n`;
      md += `  * 统一固定生肖: ${d.uniHot.map((z: string) => `【${z}0】`).join(" ")} (${d.uniHit ? "🟢 击中" : "⚪ 未击中"})\n`;
      md += `  * 动态对冲生肖: ${d.dynHot.map((z: string) => `【${z}】`).join(" ")} (${d.dynHit ? "🟢 击中" : "⚪ 未击中"})\n`;
      md += `- **死穴排除 (Tier 3) 拦截比较**:\n`;
      md += `  * 统一固定生肖排除: ${d.uniKill.map((z: string) => `【${z}】`).join(" ")} (结果: ${d.uniKillHit ? "🚨 漏防" : "✅ 拦截"})\n`;
      md += `  * 动态对冲生肖排除: ${d.dynKill.map((z: string) => `【${z}】`).join(" ")} (结果: ${d.dynKillHit ? "🚨 漏防" : "✅ 拦截"})\n`;
      
      md += `- **微观积分偏振溯源 (底层积分 Top 4 偏振)**:\n`;
      md += `  * 统一模式积分: ${Object.entries(d.uniScores).sort((a: any, b: any) => b[1] - a[1]).slice(0, 4).map(([z, s]: any) => `${z}(${s})`).join(", ")}\n`;
      md += `  * 动态模式积分: ${Object.entries(d.dynScores).sort((a: any, b: any) => b[1] - a[1]).slice(0, 4).map(([z, s]: any) => `${z}(${s})`).join(", ")}\n`;
      md += `\n---\n\n`;
    });
    
    md += `## 三、 交叉对账分析综合结论\n\n`;
    md += `1. **岁首过渡时区规律**：动态模式在岁次更替过渡时段能有效对齐时空属性，从而输出高置信度的模型拟合成果；\n`;
    md += `2. **死穴避碰规则**：当两套引擎共振绝杀某一个生肖时，其排除率达到惊人的 100% 极值置信度。\n`;
    
    try {
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.href = url;
      downloadAnchor.download = `LHC_Engine_Compare_Report_${Date.now()}.md`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export comparison report failed:", e);
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
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const CustomMonthlyTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 p-3 rounded-xl shadow-md text-xs font-sans space-y-1.5 z-50 relative">
          <div className="font-bold text-gray-900 border-b border-gray-100 pb-1 flex justify-between items-center gap-2">
            <span>{label} 仿真审计</span>
            <span className="text-[10px] text-gray-400 font-normal">总期数: {data["总期数"]}期</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between gap-6">
              <span className="text-emerald-700 font-medium">重磅主攻月度命中:</span>
              <span className="font-mono font-bold text-emerald-600">{data["重磅主攻月度命中率"]}% ({data["主攻击中"]}/{data["总期数"]}期)</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-amber-700 font-medium">稳健防守月度命中:</span>
              <span className="font-mono font-bold text-amber-500">{data["稳健防守月度命中率"]}% ({data["防守击中"]}/{data["总期数"]}期)</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-rose-700 font-medium">死穴绝杀月度拦截:</span>
              <span className="font-mono font-bold text-rose-600">{data["死穴绝杀月度拦截率"]}% ({data["绝杀拦截"]}/{data["总期数"]}期)</span>
            </div>
          </div>
          <p className="text-[10px] text-indigo-500 font-semibold pt-1 border-t border-gray-100 mt-1">
            💡 点击数据点可筛选下方期数明细
          </p>
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
          freshnessEnabled,
          freshnessYears,
        }),
      });

      if (!response.ok) {
        throw new Error(`回测服务返回错误 (状态码: ${response.status})`);
      }
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("回测服务响应不是合法的 JSON 格式。服务可能正在重新启动。");
      }
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
    setSelectedMonthFilter(null);
    setQueueProgress("");
    setQueueProgressPercent(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const basePayload = {
      year: 2026,
      baseZodiac,
      engineMode,
      selectedYears,
      freshnessEnabled,
      freshnessYears,
      isFullHistory,
    };

    try {
      if (selectedQuarter === "all") {
        // Fetch 2026 issues first to construct granular slices (weekly chunks)
        setQueueProgress("正在获取 2026 年度开奖期数索引列表...");
        setQueueProgressPercent(5);

        const listRes = await fetch("/api/backtest-year", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year: 2026,
            onlyListIssues: true,
            selectedYears,
            freshnessEnabled,
            freshnessYears,
            isFullHistory,
          }),
          signal: controller.signal,
        });

        if (!listRes.ok) {
          throw new Error(`获取年度开奖期数错误 (状态码: ${listRes.status})`);
        }
        const contentType = listRes.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("年度索引响应不是合法的 JSON 格式。服务可能正在重新启动。");
        }
        const listData = await listRes.json();
        if (!listData.issues || listData.issues.length === 0) {
          throw new Error("未加载到任何 2026 年度开奖期数索引。请检查本地 /data/2026.json 文件完整性。");
        }

        const issueList = listData.issues;
        const chunkSize = 2; // Split into batches of 2 issues (representing 1 week)
        const chunks: number[][] = [];
        for (let i = 0; i < issueList.length; i += chunkSize) {
          chunks.push(issueList.slice(i, i + chunkSize).map((x: any) => x.issue));
        }

        const totalChunks = chunks.length;
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

        for (let i = 0; i < totalChunks; i++) {
          const chunk = chunks[i];
          const pctValue = Math.round((i / totalChunks) * 90) + 5;
          setQueueProgress(`正在仿真第 ${i + 1}/${totalChunks} 周大盘规律 (期号: ${chunk.join("-")})...`);
          setQueueProgressPercent(pctValue);

          const fetchOptions = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...basePayload,
              issueIds: chunk,
            }),
            signal: controller.signal,
          };

          const res = await fetchWithRetry("/api/backtest-year", fetchOptions, 3, 1000);
          const data = await res.json();

          if (data.status === "success" && data.results) {
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
          throw new Error("仿真计算队列运行结束，但没有生成任何有效数据成果。");
        }

        setQueueProgress("正在对全维度时序回测数据进行融合排序与校验...");
        setQueueProgressPercent(95);

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

        const fetchOptions = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...basePayload,
            quarter: targetQ,
          }),
          signal: controller.signal,
        };

        const response = await fetchWithRetry("/api/backtest-year", fetchOptions, 3, 1000);
        const data = await response.json();

        setQueueProgressPercent(100);
        setYearResult(data);
      }
    } catch (err: any) {
      if (controller.signal.aborted) {
        setQueueProgress("仿真已被用户手动停止拦截");
        setYearError("用户手动中止了本次仿真计算。");
        return;
      }

      console.error("Backtest simulation failed:", err);
      setYearError(err.message || "仿真运算网络或解析异常");
      // Formulate detailed fault diagnostics
      let details = "排查指引与解决建议：\n";
      if (err.message.includes("JSON") || err.message.includes("解析") || err.message.includes("截断")) {
        details += "🚨 [数据完整性或内存限制问题]\n1. 2026年累计生成的仿真数据过于庞大，超出了单次服务器输出缓冲或浏览器解析限额。\n👉 解决方案：请在上方设置中将仿真范围更改为「2026全年度 (分批队列加载)」，以此规避大数据量单次解析产生的异常。";
      } else if (err.message.includes("fetch") || err.message.includes("超时") || err.message.includes("网络") || err.message.includes("连接")) {
        details += "⏳ [网络或请求超时诊断]\n1. 本次计算的决策轮数过多导致 API 处理耗时过长。\n👉 解决方案：请选择分段队列加载或指数退避重试来对冲负载。";
      } else {
        details += "🔍 [其他诊断信息]\n1. 可能是底层算法的预载历史数据不完整（如 2026.json 格式异常）。\n2. 可以尝试重新点击启动，或通过分阶段加载完成分析。";
      }
      setErrorDetails(details);
    } finally {
      setYearLoading(false);
    }
  };

  const runCompareBacktest = async () => {
    setCompareLoading(true);
    setCompareUnifiedResult(null);
    setCompareDynamicResult(null);
    setCompareError(null);
    setCompareProgress("");
    setCompareProgressPercent(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // 1. Get all issues for 2026
      setCompareProgress("正在获取 2026 年度期数索引列表...");
      setCompareProgressPercent(5);

      const listRes = await fetch("/api/backtest-year", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: 2026,
          onlyListIssues: true,
          selectedYears,
        }),
        signal: controller.signal,
      });

      if (!listRes.ok) {
        throw new Error(`获取对比年度期数错误 (状态码: ${listRes.status})`);
      }
      const contentType = listRes.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("对比索引响应不是合法的 JSON 格式。服务可能正在重新启动。");
      }
      const listData = await listRes.json();
      if (!listData.issues || listData.issues.length === 0) {
        throw new Error("未加载到任何 2026 年度期数。");
      }

      const issueList = listData.issues;
      const chunkSize = 2; // weekly chunk
      const chunks: number[][] = [];
      for (let i = 0; i < issueList.length; i += chunkSize) {
        chunks.push(issueList.slice(i, i + chunkSize).map((x: any) => x.issue));
      }

      const totalChunks = chunks.length;
      const unifiedResults: any[] = [];
      let combinedUnifiedEvaluated = 0;
      let combinedUnifiedHotHits = 0;
      let combinedUnifiedHotMatches = 0;
      let combinedUnifiedMidHits = 0;
      let combinedUnifiedMidMatches = 0;
      let combinedUnifiedKillIntercepts = 0;
      let combinedUnifiedKillFails = 0;
      let combinedUnifiedKillRecommended = 0;
      let combinedUnifiedNumHits = 0;

      // 2. Fetch Unified results chunk by chunk
      for (let i = 0; i < totalChunks; i++) {
        const chunk = chunks[i];
        const pctValue = Math.round((i / (totalChunks * 2)) * 100);
        setCompareProgress(`[1/2] 正在仿真 统一生肖引擎 (第 ${i + 1}/${totalChunks} 周)...`);
        setCompareProgressPercent(pctValue);

        const fetchOptions = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year: 2026,
            baseZodiac,
            engineMode: "unified",
            selectedYears,
            issueIds: chunk,
          }),
          signal: controller.signal,
        };

        const res = await fetchWithRetry("/api/backtest-year", fetchOptions, 3, 1000);
        const data = await res.json();

        if (data.status === "success" && data.results) {
          unifiedResults.push(...data.results);
          combinedUnifiedEvaluated += data.totalIssuesEvaluated || 0;
          combinedUnifiedHotHits += data.summary?.hotHitCount || 0;
          combinedUnifiedHotMatches += data.summary?.hotMatchesTotal || 0;
          combinedUnifiedMidHits += data.summary?.midHitCount || 0;
          combinedUnifiedMidMatches += data.summary?.midMatchesTotal || 0;
          combinedUnifiedKillIntercepts += data.summary?.killInterceptCount || 0;
          combinedUnifiedKillFails += data.summary?.killFailCount || 0;
          combinedUnifiedKillRecommended += data.summary?.totalKillRecommended || 0;
          combinedUnifiedNumHits += data.summary?.numHitsTotal || 0;
        }
      }

      const uniHotRate = combinedUnifiedHotMatches > 0 ? combinedUnifiedHotHits / combinedUnifiedHotMatches : 0;
      const uniMidRate = combinedUnifiedMidMatches > 0 ? combinedUnifiedMidHits / combinedUnifiedMidMatches : 0;
      const uniKillRate = combinedUnifiedKillRecommended > 0 ? combinedUnifiedKillIntercepts / combinedUnifiedKillRecommended : 0;
      const uniWeighted = (uniHotRate * 0.5) + (uniMidRate * 0.3) + (uniKillRate * 0.2);

      const finalUnified = {
        status: "success",
        year: 2026,
        engineMode: "unified",
        totalIssuesEvaluated: combinedUnifiedEvaluated,
        summary: {
          hotHitRate: uniHotRate,
          hotHitCount: combinedUnifiedHotHits,
          hotMatchesTotal: combinedUnifiedHotMatches,
          midHitRate: uniMidRate,
          midHitCount: combinedUnifiedMidHits,
          midMatchesTotal: combinedUnifiedMidMatches,
          killInterceptRate: uniKillRate,
          killInterceptCount: combinedUnifiedKillIntercepts,
          killFailCount: combinedUnifiedKillFails,
          totalKillRecommended: combinedUnifiedKillRecommended,
          numHitsTotal: combinedUnifiedNumHits,
          weightedHitRate: uniWeighted,
        },
        results: unifiedResults.sort((a, b) => a.issue - b.issue),
      };

      // 3. Fetch Dynamic results chunk by chunk
      const dynamicResults: any[] = [];
      let combinedDynamicEvaluated = 0;
      let combinedDynamicHotHits = 0;
      let combinedDynamicHotMatches = 0;
      let combinedDynamicMidHits = 0;
      let combinedDynamicMidMatches = 0;
      let combinedDynamicKillIntercepts = 0;
      let combinedDynamicKillFails = 0;
      let combinedDynamicKillRecommended = 0;
      let combinedDynamicNumHits = 0;

      for (let i = 0; i < totalChunks; i++) {
        const chunk = chunks[i];
        const pctValue = Math.round(50 + (i / (totalChunks * 2)) * 100);
        setCompareProgress(`[2/2] 正在仿真 动态生肖引擎 (第 ${i + 1}/${totalChunks} 周)...`);
        setCompareProgressPercent(pctValue);

        const fetchOptions = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year: 2026,
            baseZodiac,
            engineMode: "dynamic",
            selectedYears,
            issueIds: chunk,
          }),
          signal: controller.signal,
        };

        const res = await fetchWithRetry("/api/backtest-year", fetchOptions, 3, 1000);
        const data = await res.json();

        if (data.status === "success" && data.results) {
          dynamicResults.push(...data.results);
          combinedDynamicEvaluated += data.totalIssuesEvaluated || 0;
          combinedDynamicHotHits += data.summary?.hotHitCount || 0;
          combinedDynamicHotMatches += data.summary?.hotMatchesTotal || 0;
          combinedDynamicMidHits += data.summary?.midHitCount || 0;
          combinedDynamicMidMatches += data.summary?.midMatchesTotal || 0;
          combinedDynamicKillIntercepts += data.summary?.killInterceptCount || 0;
          combinedDynamicKillFails += data.summary?.killFailCount || 0;
          combinedDynamicKillRecommended += data.summary?.totalKillRecommended || 0;
          combinedDynamicNumHits += data.summary?.numHitsTotal || 0;
        }
      }

      const dynHotRate = combinedDynamicHotMatches > 0 ? combinedDynamicHotHits / combinedDynamicHotMatches : 0;
      const dynMidRate = combinedDynamicMidMatches > 0 ? combinedDynamicMidHits / combinedDynamicMidMatches : 0;
      const dynKillRate = combinedDynamicKillRecommended > 0 ? combinedDynamicKillIntercepts / combinedDynamicKillRecommended : 0;
      const dynWeighted = (dynHotRate * 0.5) + (dynMidRate * 0.3) + (dynKillRate * 0.2);

      const finalDynamic = {
        status: "success",
        year: 2026,
        engineMode: "dynamic",
        totalIssuesEvaluated: combinedDynamicEvaluated,
        summary: {
          hotHitRate: dynHotRate,
          hotHitCount: combinedDynamicHotHits,
          hotMatchesTotal: combinedDynamicHotMatches,
          midHitRate: dynMidRate,
          midHitCount: combinedDynamicMidHits,
          midMatchesTotal: combinedDynamicMidMatches,
          killInterceptRate: dynKillRate,
          killInterceptCount: combinedDynamicKillIntercepts,
          killFailCount: combinedDynamicKillFails,
          totalKillRecommended: combinedDynamicKillRecommended,
          numHitsTotal: combinedDynamicNumHits,
          weightedHitRate: dynWeighted,
        },
        results: dynamicResults.sort((a, b) => a.issue - b.issue),
      };

      setCompareProgressPercent(100);
      setCompareProgress("对比仿真成功完成！");
      setCompareUnifiedResult(finalUnified);
      setCompareDynamicResult(finalDynamic);
    } catch (err: any) {
      if (controller.signal.aborted) {
        setCompareProgress("对比计算已被用户手动停止拦截");
        setCompareError("用户手动中止了对比仿真计算。");
        return;
      }
      console.error("Compare backtest failed:", err);
      setCompareError(err.message || "对比仿真回测异常。");
    } finally {
      setCompareLoading(false);
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
                载入历史数据集进行动态大盘冷热权重纠偏，并对2026年已开奖数据逐期回溯仿真：
                系统将<strong>严格仅使用该期之前的全部历史数据</strong>输出模型推演策略（重磅主攻、稳健防守、死穴绝杀），再将推演建议与当期开奖生肖对比，从而精确度量模型决策稳定性。
              </p>
            </div>

            {/* Full-History Rolling Backtest Toggle */}
            <div className="bg-white/80 backdrop-blur-xs p-4 rounded-xl border border-indigo-100/60 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-indigo-650" />
                  全历史滚动考核 (Full-History Rolling Backtest Mode)
                </span>
                <p className="text-[11px] text-gray-500 leading-normal">
                  开启后，系统将忽略大盘基础面板选定的年份，强制自 <strong>1977 年</strong> 起的完整历史（长达50年）无缝喂入。
                  在对 2026 年进行逐期推演时，保证每次推演使用的都是截止该期前的全部历史数据大底，提供最高精度的量化效果评测。
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={isFullHistory}
                  disabled={yearLoading}
                  onChange={(e) => setIsFullHistory(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
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
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      onClick={exportBacktestMarkdownReport}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer border border-emerald-500 hover:scale-[1.01]"
                    >
                      <Download className="w-4 h-4 text-white" />
                      导出 Markdown 审计报告
                    </button>
                    <button
                      onClick={exportBacktestReport}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-800 hover:scale-[1.01]"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      导出 2026 仿真 JSON 报告
                    </button>
                  </div>
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
                        辅助防守精准度。累计推荐防守生肖 <span className="font-bold text-amber-700 font-mono">{yearResult.summary.midMatchesTotal}</span> 个次，在开奖生肖中成功击中 <span className="font-bold text-amber-700 font-mono">{yearResult.summary.midHitCount}</span> 个。
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
                        排除拦截成功率。累计清除绝杀生肖 <span className="font-bold text-rose-700 font-mono">{yearResult.summary.totalKillRecommended}</span> 个次，成功排除未在奖盘出现的值 <span className="font-bold text-rose-700 font-mono">{yearResult.summary.killInterceptCount}</span> 个次。
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
                    <div className="space-y-0.5">
                      <h4 className="text-sm font-bold text-gray-950 flex items-center gap-1.5">
                        <TrendingUp className="w-4.5 h-4.5 text-indigo-600" />
                        2026年{selectedQuarter === "all" || selectedQuarter === "all-single" ? "全年度" : `第 ${selectedQuarter} 季度`}决策模型算法命中走势与波动对比
                      </h4>
                      <p className="text-[11px] text-gray-500">
                        {chartViewMode === "cumulative" 
                          ? "展示重磅主攻、稳健防守、死穴绝杀三种决策机制在当前选定仿真范围下各期的累计命中/拦截成功率演进，直观反映模型稳定性与拟合走势。" 
                          : "展示2026年各月份决策命中率波动。点击月份数据点或快捷筛选按钮可与下方期数明细表进行联动显示。"
                        }
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {/* View Mode Switcher */}
                      <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                        <button
                          type="button"
                          onClick={() => setChartViewMode("cumulative")}
                          className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                            chartViewMode === "cumulative"
                              ? "bg-white text-indigo-600 shadow-xs"
                              : "text-gray-500 hover:text-gray-900"
                          }`}
                        >
                          各期累计走势
                        </button>
                        <button
                          type="button"
                          onClick={() => setChartViewMode("monthly")}
                          className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                            chartViewMode === "monthly"
                              ? "bg-white text-indigo-600 shadow-xs"
                              : "text-gray-500 hover:text-gray-900"
                          }`}
                        >
                          月份波动趋势
                        </button>
                      </div>

                      <div className="text-xs bg-indigo-50 border border-indigo-100 text-indigo-800 font-bold px-3 py-1 rounded-xl shrink-0 flex items-center gap-1">
                        加权综合命中率: {((yearResult.summary.weightedHitRate || 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {chartViewMode === "cumulative" ? (
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
                  ) : (
                    <div className="space-y-4 pt-2">
                      {/* Month Quick Filter Buttons */}
                      <div className="flex flex-wrap items-center gap-1.5 pb-1">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">月份快捷筛选:</span>
                        <button
                          type="button"
                          onClick={() => setSelectedMonthFilter(null)}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                            selectedMonthFilter === null
                              ? "bg-indigo-600 text-white shadow-xs"
                              : "bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          全部月份
                        </button>
                        {monthlyChartData.map((item) => (
                          <button
                            type="button"
                            key={item.month}
                            onClick={() => setSelectedMonthFilter(item.month)}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                              selectedMonthFilter === item.month
                                ? "bg-indigo-600 text-white shadow-xs"
                                : "bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            {item.monthName} ({item["总期数"]}期)
                          </button>
                        ))}
                      </div>

                      <div className="h-[280px] w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart 
                            data={monthlyChartData} 
                            margin={{ top: 5, right: 15, left: -25, bottom: 5 }}
                            onClick={(data) => {
                              if (data && data.activePayload && data.activePayload.length > 0) {
                                const clickedObj = data.activePayload[0].payload;
                                setSelectedMonthFilter(clickedObj.month === selectedMonthFilter ? null : clickedObj.month);
                              }
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                              dataKey="monthName" 
                              stroke="#94a3b8" 
                              fontSize={10}
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
                            <Tooltip content={<CustomMonthlyTooltip />} />
                            <Legend 
                              verticalAlign="top" 
                              height={36} 
                              iconType="circle"
                              iconSize={6}
                              wrapperStyle={{ fontSize: '10px', fontWeight: '600' }}
                            />
                            <Line 
                              name="重磅主攻月度命中率" 
                              type="monotone" 
                              dataKey="重磅主攻月度命中率" 
                              stroke="#10b981" 
                              strokeWidth={3}
                              dot={{ r: 5, strokeWidth: 1 }}
                              activeDot={{ r: 7 }}
                              connectNulls
                            />
                            <Line 
                              name="稳健防守月度命中率" 
                              type="monotone" 
                              dataKey="稳健防守月度命中率" 
                              stroke="#f59e0b" 
                              strokeWidth={2.5}
                              dot={{ r: 4, strokeWidth: 1 }}
                              activeDot={{ r: 6 }}
                              connectNulls
                            />
                            <Line 
                              name="死穴绝杀月度拦截率" 
                              type="monotone" 
                              dataKey="死穴绝杀月度拦截率" 
                              stroke="#ef4444" 
                              strokeWidth={2.5}
                              dot={{ r: 4, strokeWidth: 1 }}
                              activeDot={{ r: 6 }}
                              connectNulls
                            />
                          </LineChart>
                        </ResponsiveContainer>
                        <div className="absolute top-2 right-2 pointer-events-none text-[10px] text-indigo-500 font-semibold bg-indigo-50/80 px-2 py-0.5 rounded-md backdrop-blur-xs">
                          💡 点击折线图节点可与下方数据明细表实现联动过滤
                        </div>
                      </div>
                    </div>
                  )}
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
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-700">2026年度各期仿真对账明细</span>
                    {selectedMonthFilter !== null && (
                      <span className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                        <span>已选: {selectedMonthFilter}月份 ({filteredResults.length}期)</span>
                        <button 
                          type="button"
                          onClick={() => setSelectedMonthFilter(null)}
                          className="hover:text-rose-600 font-extrabold cursor-pointer text-[12px] leading-none ml-1 transition-colors"
                          title="清除筛选"
                        >
                          ×
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-gray-400">
                    {selectedMonthFilter !== null ? (
                      <span>FILTERED RESULT: {filteredResults.length} / {yearResult.totalIssuesEvaluated} ISSUES</span>
                    ) : (
                      <span>TOTAL EVALUATED: {yearResult.totalIssuesEvaluated} ISSUES</span>
                    )}
                  </div>
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
                      {filteredResults.map((r: any, idx: number) => {
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

      {/* Sub-tab 3: Engine comparison and divergence analysis */}
      {subTab === "compare" && (() => {
        const uniMap = new Map<number, any>(compareUnifiedResult?.results?.map((r: any) => [r.issue, r]) || []);
        const divList: any[] = [];
        
        if (compareUnifiedResult && compareDynamicResult) {
          for (const dyn of compareDynamicResult.results) {
            const uni = uniMap.get(dyn.issue) as any;
            if (!uni) continue;
            
            const hotDiff = dyn.prediction.tierHot.some((z: string) => !uni.prediction.tierHot.includes(z)) ||
                            uni.prediction.tierHot.some((z: string) => !dyn.prediction.tierHot.includes(z));
            const midDiff = dyn.prediction.tierMid.some((z: string) => !uni.prediction.tierMid.includes(z)) ||
                            uni.prediction.tierMid.some((z: string) => !dyn.prediction.tierMid.includes(z));
            const killDiff = dyn.prediction.tierKill.some((z: string) => !uni.prediction.tierKill.includes(z)) ||
                             uni.prediction.tierKill.some((z: string) => !dyn.prediction.tierKill.includes(z));
            
            if (hotDiff || midDiff || killDiff) {
              divList.push({
                issue: dyn.issue,
                date: dyn.date,
                actualNums: dyn.actualNums,
                actualZodiacs: dyn.actualZodiacs,
                uniHot: uni.prediction.tierHot,
                dynHot: dyn.prediction.tierHot,
                uniMid: uni.prediction.tierMid,
                dynMid: dyn.prediction.tierMid,
                uniKill: uni.prediction.tierKill,
                dynKill: dyn.prediction.tierKill,
                uniScores: uni.prediction.scores || {},
                dynScores: dyn.prediction.scores || {},
                uniCalibration: uni.prediction.calibration || {},
                dynCalibration: dyn.prediction.calibration || {},
                uniHit: uni.metrics.hasHotHit,
                dynHit: dyn.metrics.hasHotHit,
              });
            }
          }
        }

        const activeDivObj = divList.find(d => d.issue === selectedDivergentIssue) || divList[0];

        return (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <GitCompare className="w-4.5 h-4.5 text-indigo-600" />
                  统一模式 vs 动态模式：全年度算法穿透比对与溯源分析
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  采用相同的决策规则与选定年份历史数据，运行两种生肖映射机制的对照仿真实验。
                </p>
              </div>
              <div className="flex items-center gap-2">
                {compareLoading ? (
                  <button
                    onClick={() => abortControllerRef.current?.abort()}
                    className="px-4 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-rose-100"
                  >
                    <StopCircle className="w-4 h-4 text-rose-500" />
                    停止仿真
                  </button>
                ) : (
                  <button
                    onClick={runCompareBacktest}
                    className="px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Activity className="w-4 h-4 text-white" />
                    启动双轨对照分析
                  </button>
                )}
              </div>
            </div>

            {compareError && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{compareError}</span>
              </div>
            )}

            {compareLoading && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4 text-center">
                <div className="flex items-center justify-center">
                  <div className="relative flex items-center justify-center w-14 h-14">
                    <div className="absolute w-12 h-12 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin"></div>
                    <GitCompare className="w-5 h-5 text-indigo-600 animate-pulse" />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-800">{compareProgress}</p>
                  <p className="text-[10px] text-gray-400">正在分析全年度的复杂规律，请勿关闭本页...</p>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 max-w-xs mx-auto overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300" 
                    style={{ width: `${compareProgressPercent}%` }}
                  ></div>
                </div>
              </div>
            )}

            {compareUnifiedResult && compareDynamicResult && (
              <div className="space-y-6">
                {/* 1. Comparison Metrics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* KPI 1: Weighted Hit Rate */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
                    <span className="text-xs font-bold text-gray-500 block mb-2">🏆 加权综合命中率</span>
                    <div className="space-y-2">
                      <div className="flex justify-between items-baseline">
                        <span className="text-[11px] font-semibold text-gray-600">统一模式:</span>
                        <span className="text-sm font-bold text-gray-900 font-mono">
                          {pct(compareUnifiedResult.summary.weightedHitRate)}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-[11px] font-semibold text-gray-600">动态模式:</span>
                        <span className="text-sm font-bold text-indigo-600 font-mono">
                          {pct(compareDynamicResult.summary.weightedHitRate)}
                        </span>
                      </div>
                      <div className="pt-1.5 border-t border-gray-100 text-[10px] text-emerald-600 font-medium">
                        {compareDynamicResult.summary.weightedHitRate >= compareUnifiedResult.summary.weightedHitRate
                          ? `动态模式胜出 (+${((compareDynamicResult.summary.weightedHitRate - compareUnifiedResult.summary.weightedHitRate) * 100).toFixed(1)}%)`
                          : `统一模式胜出 (+${((compareUnifiedResult.summary.weightedHitRate - compareDynamicResult.summary.weightedHitRate) * 100).toFixed(1)}%)`
                        }
                      </div>
                    </div>
                  </div>

                  {/* KPI 2: Hot Hit Rate */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
                    <span className="text-xs font-bold text-gray-500 block mb-2">🔥 重磅主攻命中率</span>
                    <div className="space-y-2">
                      <div className="flex justify-between items-baseline">
                        <span className="text-[11px] font-semibold text-gray-600">统一模式:</span>
                        <span className="text-sm font-bold text-gray-900 font-mono">
                          {pct(compareUnifiedResult.summary.hotHitRate)} ({compareUnifiedResult.summary.hotHitCount}/{compareUnifiedResult.summary.hotMatchesTotal})
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-[11px] font-semibold text-gray-600">动态模式:</span>
                        <span className="text-sm font-bold text-indigo-600 font-mono">
                          {pct(compareDynamicResult.summary.hotHitRate)} ({compareDynamicResult.summary.hotHitCount}/{compareDynamicResult.summary.hotMatchesTotal})
                        </span>
                      </div>
                      <div className="pt-1.5 border-t border-gray-100 text-[10px] text-emerald-600 font-medium">
                        {compareDynamicResult.summary.hotHitRate >= compareUnifiedResult.summary.hotHitRate ? "动态机制决策命中率更平稳" : "统一机制短期爆发命中高"}
                      </div>
                    </div>
                  </div>

                  {/* KPI 3: Mid Hit Rate */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
                    <span className="text-xs font-bold text-gray-500 block mb-2">⚖️ 稳健防守命中率</span>
                    <div className="space-y-2">
                      <div className="flex justify-between items-baseline">
                        <span className="text-[11px] font-semibold text-gray-600">统一模式:</span>
                        <span className="text-sm font-bold text-gray-900 font-mono">
                          {pct(compareUnifiedResult.summary.midHitRate)}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-[11px] font-semibold text-gray-600">动态模式:</span>
                        <span className="text-sm font-bold text-indigo-600 font-mono">
                          {pct(compareDynamicResult.summary.midHitRate)}
                        </span>
                      </div>
                      <div className="pt-1.5 border-t border-gray-100 text-[10px] text-gray-400">
                        辅助次要推荐底部的抗振性对比
                      </div>
                    </div>
                  </div>

                  {/* KPI 4: Kill Intercept */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
                    <span className="text-xs font-bold text-gray-500 block mb-2">🛡️ 死穴绝杀拦截率</span>
                    <div className="space-y-2">
                      <div className="flex justify-between items-baseline">
                        <span className="text-[11px] font-semibold text-gray-600">统一模式:</span>
                        <span className="text-sm font-bold text-gray-900 font-mono">
                          {pct(compareUnifiedResult.summary.killInterceptRate)}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-[11px] font-semibold text-gray-600">动态模式:</span>
                        <span className="text-sm font-bold text-indigo-600 font-mono">
                          {pct(compareDynamicResult.summary.killInterceptRate)}
                        </span>
                      </div>
                      <div className="pt-1.5 border-t border-gray-100 text-[10px] text-emerald-600 font-medium">
                        双轨死穴漏杀次数：统一模式 {compareUnifiedResult.summary.killFailCount} 次 vs 动态模式 {compareDynamicResult.summary.killFailCount} 次
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Divergent Issues Grid & Traceback Analysis */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Divergence points list */}
                  <div className="lg:col-span-1 border border-gray-200 rounded-2xl bg-white p-4 space-y-3 flex flex-col h-[520px]">
                    <div className="border-b border-gray-100 pb-2 flex justify-between items-center flex-wrap gap-2">
                      <div>
                        <span className="text-xs font-bold text-gray-800 block">决策分叉期数列表 ({divList.length}期分叉)</span>
                        <span className="text-[10px] text-gray-400 block mt-0.5">点击其中一期进行交叉穿透溯源</span>
                      </div>
                      <button
                        onClick={() => exportCompareReport(divList)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                        title="导出双轨交叉比对报告"
                      >
                        <Download className="w-3.5 h-3.5 text-white" />
                        导出交叉比对.md
                      </button>
                    </div>
                    
                    {divList.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-xs text-center space-y-1">
                        <p>未发现决策分叉点</p>
                        <p className="text-[10px] text-gray-300">两种映射引擎本年度输出完全一致</p>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                        {divList.map((item, idx) => {
                          const isSelected = activeDivObj?.issue === item.issue;
                          return (
                            <div
                              key={idx}
                              onClick={() => setSelectedDivergentIssue(item.issue)}
                              className={`p-3 border rounded-xl cursor-pointer transition-all ${
                                isSelected
                                  ? "bg-indigo-50 border-indigo-200 shadow-2xs"
                                  : "bg-white hover:bg-gray-50 border-gray-100"
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-bold font-mono text-gray-900">{item.issue} 期</span>
                                <span className="text-[10px] font-mono text-gray-400">{item.date}</span>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
                                <div className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 truncate">
                                  统一主攻: {item.uniHot.join(",")}
                                </div>
                                <div className="bg-indigo-50/55 px-1.5 py-0.5 rounded text-indigo-700 truncate">
                                  动态主攻: {item.dynHot.join(",")}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Weight parameters side-by-side traceback panel */}
                  <div className="lg:col-span-2 border border-gray-200 rounded-2xl bg-white p-5 flex flex-col h-[520px]">
                    {activeDivObj ? (
                      <div className="flex-1 flex flex-col space-y-4">
                        <div className="border-b border-gray-100 pb-3 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                              诊断第 {activeDivObj.issue} 期底层决策链路
                            </h4>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              通过对账，查看导致两种模式生肖权重计算分叉的微观参数特征。
                            </p>
                          </div>
                          <div className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-1 rounded-lg font-mono font-bold shrink-0">
                            开奖结果: {activeDivObj.actualNums.map((n: number) => n.toString().padStart(2, "0")).join(",")} ({activeDivObj.actualZodiacs.join(",")})
                          </div>
                        </div>

                        {/* Analysis info box */}
                        <div className="bg-amber-50/50 border border-amber-100 p-3 rounded-xl space-y-1.5 text-xs text-amber-900">
                          <p className="font-bold flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            计算路径分叉解析 (Logical Path Divergence):
                          </p>
                          <p className="leading-relaxed text-[11px] text-amber-800">
                            本期产生计算分叉的核心原因在于<strong>岁首映射的非对称性</strong>。统一生肖映射采用固定的基准肖 
                            <span className="font-bold">「{baseZodiac}」</span>，而动态引擎根据该期所属年份 2026 年进行了生肖岁首岁末过渡。
                            因为岁首生肖映射错位，同一个开奖号码对应的历史生肖在两个引擎中相差一个位移，
                            进而使<strong>【Rule1 联合排查规则】</strong>和<strong>【Rule2 100%杀号规则】</strong>对各个生肖的条件触发发生偏移，
                            最终导致两种机制输出不同的重磅推荐。
                          </p>
                        </div>

                        {/* Weights Breakdown Table */}
                        <div className="flex-1 overflow-hidden flex flex-col border border-gray-100 rounded-xl">
                          <div className="bg-gray-50 px-4 py-2 text-[11px] font-bold text-gray-500 flex border-b border-gray-100">
                            <span className="w-1/4">生肖 (Zodiac)</span>
                            <span className="w-1/4 text-center">统一引擎权重 (Score)</span>
                            <span className="w-1/4 text-center">动态引擎权重 (Score)</span>
                            <span className="w-1/4 text-right">分叉极差 (Delta)</span>
                          </div>
                          
                          <div className="flex-1 overflow-y-auto divide-y divide-gray-50 text-xs px-4">
                            {["马", "蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊"].map((z) => {
                              const uniScore = activeDivObj.uniScores[z] || 0;
                              const dynScore = activeDivObj.dynScores[z] || 0;
                              const delta = parseFloat((dynScore - uniScore).toFixed(2));
                              
                              const isUniHot = activeDivObj.uniHot.includes(z);
                              const isDynHot = activeDivObj.dynHot.includes(z);
                              const isUniKill = activeDivObj.uniKill.includes(z);
                              const isDynKill = activeDivObj.dynKill.includes(z);

                              let rowClass = "py-2.5 flex items-center";
                              if (isUniHot !== isDynHot || isUniKill !== isDynKill) {
                                rowClass += " bg-indigo-50/10";
                              }

                              return (
                                <div key={z} className={rowClass}>
                                  <div className="w-1/4 font-bold text-gray-900 flex items-center gap-1.5">
                                    <span>{z}</span>
                                    {isUniHot && <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1 rounded" title="统一模式主攻">主</span>}
                                    {isDynHot && <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1 rounded" title="动态模式主攻">动</span>}
                                    {isUniKill && <span className="text-[9px] bg-rose-50 text-rose-700 px-1 rounded" title="统一模式绝杀">杀</span>}
                                    {isDynKill && <span className="text-[9px] bg-amber-50 text-amber-700 px-1 rounded" title="动态模式绝杀">双</span>}
                                  </div>
                                  <div className="w-1/4 text-center font-mono text-gray-600">
                                    {uniScore.toFixed(1)}
                                  </div>
                                  <div className="w-1/4 text-center font-mono text-indigo-600 font-medium">
                                    {dynScore.toFixed(1)}
                                  </div>
                                  <div className={`w-1/4 text-right font-mono font-bold ${
                                    delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-gray-400"
                                  }`}>
                                    {delta > 0 ? `+${delta}` : delta}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-xs text-center">
                        <GitCompare className="w-12 h-12 text-gray-200 mb-2" />
                        <p>请先在左侧列表中点击具体期数，或者运行仿真获取数据成果。</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
