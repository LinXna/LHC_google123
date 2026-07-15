import React from "react";
import { 
  Database, 
  Calendar, 
  RefreshCw, 
  Hash, 
  Layers, 
  CheckSquare, 
  Award 
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
}) => {
  const zodiacList = ["马", "蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊"];

  const hasChanges = 
    JSON.stringify([...selectedYears].sort()) !== JSON.stringify([...appliedYears].sort()) ||
    baseZodiac !== appliedBaseZodiac ||
    engineMode !== appliedEngineMode;

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
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">选择历史年份</span>
              <div className="flex gap-2">
                <button 
                  onClick={selectAllYears}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  全选
                </button>
                <span className="text-gray-300 text-xs">|</span>
                <button 
                  onClick={selectNoneYears}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
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
          <div className="border-t border-gray-100 pt-4 mt-4">
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
