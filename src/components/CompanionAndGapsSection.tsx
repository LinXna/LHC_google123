import React, { useState } from "react";
import { 
  Users, 
  RefreshCcw, 
  Clock, 
  HelpCircle, 
  Info,
  ArrowLeft
} from "lucide-react";
import { AnalyzerReport } from "../types.js";

interface CompanionAndGapsSectionProps {
  report: AnalyzerReport | null;
}

export const CompanionAndGapsSection: React.FC<CompanionAndGapsSectionProps> = ({
  report,
}) => {
  const [activeTab, setActiveTab] = useState<string>("comp");

  if (!report) return null;

  const pct = (num: number) => `${(num * 100).toFixed(1)}%`;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-gray-100 pb-4 mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            生肖伴生羁绊与跨期时间轴引擎
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            探寻生肖组合之间的深度磁吸效应（共现），以及在空窗时间轴演化下的回弹几率。
          </p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("comp")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "comp"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            黄金对 & 逆向追溯
          </button>
          <button
            onClick={() => setActiveTab("time")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "time"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            跨期时间轴演化
          </button>
        </div>
      </div>

      {/* Tab: Companion & Reverse Trace */}
      {activeTab === "comp" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Companion Gold Pairs */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                <Users className="w-4.5 h-4.5 text-indigo-500" />
                ① 黄金伴生配对 Top 15 (核心伴生)
              </h3>
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-3 text-xs text-indigo-800 flex items-start gap-1.5">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>反映生肖共现频率。两个生肖在同一个七码奖盘中被同时开出的跨年共振分布。</span>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs text-left">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-gray-500 font-semibold">排位</th>
                      <th className="px-4 py-2 text-gray-500 font-semibold">黄金搭档</th>
                      <th className="px-4 py-2 text-gray-500 font-semibold">共现频次</th>
                      <th className="px-4 py-2 text-gray-500 font-semibold">共现概率</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100 font-mono text-gray-700">
                    {report.top_15_pairs.map(([pair, freq, rate], idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-bold text-indigo-600">Top {(idx + 1).toString().padStart(2, "0")}</td>
                        <td className="px-4 py-2.5 text-sm font-sans font-medium text-gray-900">
                          【{pair.split("-")[0]}】 🧬 【{pair.split("-")[1]}】
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-gray-800">{freq} 期</td>
                        <td className="px-4 py-2.5 text-indigo-600 font-bold">{pct(rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Reverse Trace */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                <RefreshCcw className="w-4.5 h-4.5 text-indigo-500" />
                ② 查找器 8：逆向追溯前兆特征
              </h3>
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-3 text-xs text-indigo-800 flex items-start gap-1.5">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>逆向关联法。当某种极高频伴生对形成出开时，逆推它们的前一期，寻找在盲盒中必定会出现的前兆生肖痕迹。</span>
              </div>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {report.reverse_trace.length > 0 ? (
                  report.reverse_trace.map((item, idx) => (
                    <div key={idx} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50 text-xs">
                      <div className="flex justify-between font-bold text-gray-800 mb-2">
                        <span>当期开出搭档: 【{item.pair[0]}】 + 【{item.pair[1]}】</span>
                        <span className="text-indigo-600 font-mono">共触发 {item.trig} 次</span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-gray-400 font-semibold">🔍 逆向关联：其前一期 100% 出现的前兆生肖</div>
                        <div className="flex flex-wrap gap-2">
                          {item.hints.map(([z, rate]: [string, number]) => (
                            <span key={z} className="bg-white border border-indigo-100 rounded-lg px-2 py-1 flex items-center gap-1">
                              <ArrowLeft className="w-3 h-3 text-indigo-500" />
                              <span className="font-bold text-indigo-900">【{z}】</span>
                              <span className="text-[10px] font-mono text-gray-400">({pct(rate)})</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-400 text-center py-12 font-sans border border-gray-100 rounded-xl bg-gray-50/30">
                    当前伴生对的触发样本偏少，暂未挖掘出置信度 &ge; 75% 的极强前驱标志生肖。
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Timeline Gap return */}
      {activeTab === "time" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Timeline miss and return */}
            <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5 border-b border-gray-100 pb-2">
                <Clock className="w-4.5 h-4.5 text-indigo-500" />
                ① 上期在盘 &rarr; 本期断层 &rarr; 下期反弹回补
              </h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {report.timeline.prev_miss_return ? (
                  Object.entries(report.timeline.prev_miss_return)
                    .sort((a, b) => b[1].return_rate - a[1].return_rate)
                    .map(([z, data]) => (
                      <div key={z} className="bg-white border border-gray-100 rounded-xl p-2.5 flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-gray-700 text-sm font-sans">【{z}】</span>
                        <div className="flex gap-4 text-gray-500 text-right">
                          <span>触发 {data.trigger} 次</span>
                          <span>回弹 {data.return} 次</span>
                          <span className="text-indigo-600 font-bold font-sans">{pct(data.return_rate)}</span>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="text-gray-400 text-center py-4">数据为空</div>
                )}
              </div>
            </div>

            {/* Gap returns */}
            <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5 border-b border-gray-100 pb-2">
                <HelpCircle className="w-4.5 h-4.5 text-indigo-500" />
                ② 连续空窗 (未出) X 期 &rarr; 下一期反冲率
              </h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {report.timeline.gap_return ? (
                  Object.entries(report.timeline.gap_return)
                    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                    .map(([gap, data]) => (
                      <div key={gap} className="bg-white border border-gray-100 rounded-xl p-2.5 flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-gray-700">连续空窗 {gap} 期未出</span>
                        <div className="flex gap-4 text-gray-500 text-right">
                          <span>触发 {data.trigger} 次</span>
                          <span>下期立即回弹 {data.return} 次</span>
                          <span className="text-indigo-600 font-bold">{pct(data.return_rate)}</span>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="text-gray-400 text-center py-4">数据为空</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
