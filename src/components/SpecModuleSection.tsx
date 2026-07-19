import React, { useState } from "react";
import { Copy, Check, FileText, Server, Database, TrendingUp, HelpCircle } from "lucide-react";

export const SpecModuleSection: React.FC = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const specifications = [
    {
      title: "1. 🌌 LHC Prediction Engine 系统背景与整体架构 (V2.5 -> V3 升级指南)",
      icon: <Server className="w-4 h-4 text-indigo-400" />,
      description: "包含系统的核心业务逻辑、从规则型专家系统向机器学习驱动系统的演进背景及完整的服务层文件结构。",
      content: `======================================================================
🌌 LHC PREDICTION ENGINE SYSTEM BACKGROUND & ARCHITECTURE SPECIFICATION
======================================================================

【1. 系统背景与升级目标】
本系统是针对 LHC（六合彩）开奖数据的自动化高精度规律挖掘与智能预测引擎。
- V2 阶段（当前生产态兼容）：基于传统统计学和启发式专家系统的规则模型（Heuristic Expert System）。通过对遗漏值、连出、密度、伴随概率等手工设定的统计特征进行条件叠加和评分（如 score+=5，multiplier*=0.8），生成预测大底与特码避险推荐。
- V2.5 阶段（当前已实现）：完成从“手写专家规则”向“特征驱动（Feature-Driven）架构”的过渡。引入了特征收集器（FeatureCollector）、特征仓库（FeatureRepository）、特征集自动导出器（FeatureDatasetBuilder）以及预测管道（PredictionPipeline）。该阶段在完美兼容 V2 指标评分的基础上，将每一个统计指标彻底实体化、规范化为统一格式的特征。
- V3 阶段（目标升级方向）：完全剥离手写专家分值逻辑，接入真正的机器学习分类模型（如 LightGBM / CatBoost / XGBoost / 随机森林等），将其升级为由 ML 模型自动从生成的 "feature_dataset.csv" 数据集中学习最优权重组合的“纯机器学习预测引擎”。

【2. 当前服务端文件结构与核心职责】
- /server.ts
  - 职责：核心 Web 接口，暴露 API 路由，调度 zodiacAnalyzer。
- /src/server/zodiacAnalyzer.ts (V2 核心逻辑，已注入 V2.5 管道钩子)
  - 职责：加载原始历史数据，执行各维度的统计扫描（遗漏值、冷热度、大周期伴随率、F5回补、特码杀肖过滤等），并生成 100% 还原 V2 的结果大底。在调用预测时，会自动触发 FeatureCollector、FeatureAudit，并调用 FeatureDatasetBuilder 异步在后台编译全量训练集，生成特征快照与 Dump。
- /src/server/features.ts (V2.5 新增特征驱动管道)
  - 职责：
    1. FeatureRepository: 特征持久化与查询总线。
    2. FeatureCollector: 从历史 LotteryRecords 和 Pattern 扫描矩阵中，提取全量时间序列特征（11大核心特征）。
    3. FeatureDatasetBuilder: 自动对齐期数与下期开奖标签（Label: 下期是否开出，1表示开出，0表示未开出），编译生成用于机器学习训练的“一键全量训练集 CSV (feature_dataset.csv)”和当期特征快照。
    4. PredictionPipeline: 数据流总调度器，连接收集、审计、预测模型和快照存储。
    5. CurrentPredictionModel & CurrentRecommendationAdapter: 桥接层。读取特征仓库并完美还原 V2 预测得分，实现 100% 精准无缝的前后端兼容。

【3. 目标 V3 机器学习升级逻辑】
1. 替代 CurrentPredictionModel: 升级为使用加载训练好的机器学习分类器。由于在 Node.js 中加载原生 LightGBM 较为复杂，可以考虑：
   - 方式 A (轻量级/全栈 TS): 编写一个轻量级的 TypeScript 随机森林或逻辑回归/梯度提升决策树（如 xgboost-node 绑定，或纯 JS 实现的 RandomForest 库），直接在 Server 端读取 \`feature_dataset.csv\` 进行 Walk-Forward 回测与推理。
   - 方式 B (Python 独立微服务): 编写一个 Python 微服务运行 LightGBM / CatBoost，暴露接口，Node 接收请求时发送 CSV 过去，返回预测概率。
2. 概率校准层 (Calibration Layer): 机器学习模型的原始输出概率往往不具备物理置信度。V3 规格书要求在模型后端加入 Platt Scaling (通过 Logistic Regression 对模型 margins 进行拟合) 或保序回归 (Isotonic Regression) 进行校准，使模型预测的概率与真实命中率一致。
3. 在线学习与更新 (Online Learning): 每当有最新一期（T+1）开奖结果到达时，自动根据新数据和收集的当期特征生成 Label，追加写入 \`feature_dataset.csv\`，并触发模型的小步长（增量式）在线更新（Fine-tune）。`
    },
    {
      title: "2. 📊 LHC Prediction Engine 核心数据格式与 schema 定义",
      icon: <Database className="w-4 h-4 text-indigo-400" />,
      description: "包含 LotteryRecord 数据源、FeatureResult 定义、以及导出数据集 CSV 结构。",
      content: `======================================================================
LHC PREDICTION ENGINE DATA SCHEMAS & DATASET SPECIFICATIONS
======================================================================

【1. 原始开奖数据源 (LotteryRecord)】
单期历史开奖数据的 TypeScript 接口定义与 JSON 格式：
\`\`\`typescript
export interface LotteryRecord {
  issue: number;          // 期数，如 2026001
  numbers: number[];      // 7个开奖号码，前6个为正码，第7个为特码，例如 [12, 18, 35, 4, 49, 21, 8]
  archive_year?: number;  // 归档年份，如 2026
  date: string;           // 开奖日期，格式：'YYYY-MM-DD'
  zodiacs?: string[];     // 开奖生肖映射数组，长度为 7，如 ["虎", "猪", "牛", "龙", "猴", "兔", "狗"]
}
\`\`\`

【2. 收集特征对象 (FeatureResult)】
统一的特征度量与审计格式：
\`\`\`typescript
export interface FeatureResult {
  featureName: string;    // 特征名称（如: omission, density, consecutive, bayes_open_prob）
  value: number;          // 特征数值（例如: 0.8524）
  zodiac: string;         // 生肖名称（鼠、牛、虎、兔、龙、蛇、马、羊、猴、鸡、狗、猪）
  issue: number;          // 该特征提取时的基准期数（表示基于第 T 期及之前的数据计算出来的特征，预测第 T+1 期）
  metadata?: any;         // 附加元数据（如 F2 组合 Veto 的平滑率、F1 判定的原因列表）
}
\`\`\`

【3. 一键全量机器学习训练集 CSV (feature_dataset.csv)】
- 存放位置: \`/data/feature_dataset.csv\`
- 文件结构：
  - 每一行对应：**[某一历史基准期 T] 对 [某一个生肖] 的 11 大核心特征指标**，并以 **[该生肖在第 T+1 期是否开出] 作为真实 Label**。
  - 总共有 12 个生肖，因此对于每个有效历史期 T，会有 12 行训练数据。
- 核心 Header 列：
  \`Period,Zodiac,Label,omission,consecutive,density,longterm_density,calibrated_rate,bayes_open_prob,logistic_veto_prob,zodiac_analyzer_score,f2_combo_veto,f5_recovery_triggered,f5_recovery_rate\`
- 样例行（真实导出格式）：
  \`2026015,鼠,0,12.0000,0.0000,1.0000,11.0000,0.5833,0.3421,0.7654,0.0000,0.0000,0.0000,0.0000\`
  \`2026015,牛,1,0.0000,1.0000,3.0000,18.0000,0.6120,0.8521,0.1120,8.5000,1.0000,1.0000,0.7250\`

【4. 单期特征快照 Dump ([period].csv)】
- 存放位置: \`/data/dumps/[period].csv\`
- 职责：记录当前基准预测期 T 的 12 生肖特征值，用于离线部署、直接加载推理，或与其他模型横向比对。
- 格式：
  \`Zodiac,omission,consecutive,density,longterm_density,calibrated_rate,bayes_open_prob,logistic_veto_prob,zodiac_analyzer_score,f2_combo_veto,f5_recovery_triggered,f5_recovery_rate\`

【5. 决策预测快照 ([period]_snapshot.json)】
- 存放位置: \`/data/snapshots/[period]_snapshot.json\`
- 格式：包含最终的 PredictionResult JSON。
  - 核心预测格式：
    \`\`\`json
    {
      "issue": 2026016,
      "baseZodiac": "马",
      "engineMode": "dynamic",
      "recommendations": {
        "killer_zodiacs": ["蛇", "猴"], 
        "defense_zodiacs": ["羊"],
        "recommended_zodiacs": ["兔", "牛", "虎", "狗", "龙", "猪", "鸡", "鼠", "马"]
      },
      "metrics": {
        "score_matrix": { "鼠": 15, "牛": 20 },
        "weights": { "deathBlowFilterEnabled": true, "f5Enabled": true }
      }
    }
    \`\`\``
    },
    {
      title: "3. 🚀 LHC Prediction Engine 查找器/预测引擎升级步骤详解",
      icon: <TrendingUp className="w-4 h-4 text-indigo-400" />,
      description: "手把手教 AI 怎么从现在的 V2.5 基础（特征仓库 + CSV 导出）升级到 V3（真实 ML 预测与动态校准）。",
      content: `======================================================================
LHC PREDICTION ENGINE UPGRADE ROADMAP: V2.5 -> V3 MACHINE LEARNING
======================================================================

本规范为后续接手的 AI 助手提供可直接执行的 V3 升级施工蓝图。
请按照以下四大模块逐步迭代升级查找器（Pattern Finder）和推演决策器：

【第一步：引入轻量级或外部机器学习推理引擎】
1. 轻量级全栈方案：
   - 使用 npm 安装轻量级回归/分类工具，例如 \`ml-random-forest\` 或 \`ml-logistic-regression\`。
   - 在 \`/src/server/features.ts\` 中，新增一个 \`MachineLearningPredictionModel\` 类实现 \`PredictionModel\` 接口。
2. 远程微服务方案：
   - 建立外部 Python (FastAPI + LightGBM/CatBoost) 服务。
   - 当调用 API 时，将最新的 \`feature_dataset.csv\` 或最近一期的 12*11 特征矩阵通过 POST 请求发送给 Python 端。
   - Python 运用训练好的模型预测下期每个生肖的开出概率（Open Probability），并反馈给 Node 服务端。

【第二步：添加概率校准器 (Probability Calibration)】
1. 现状痛点：分类模型输出的原始概率（如 0.65）往往并不反映真实的发生频次。
2. V3 解决方案：
   - 实现 Platt Scaling (普拉特校准)：利用 Sigmoid 函数：P(y=1|f(x)) = 1 / (1 + exp(A * f(x) + B))。
   - 使用历史期数的“模型打分margins / 预测概率”作为自变量，开奖“Label (1/0)”作为因变量，在服务器端自动运行一轮极小化的 Logistic Regression，求得校准系数 A 和 B。
   - 最终呈现给用户的预测生肖概率，必须是通过校准后的真实置信度值，避免模型虚高或虚低。

【第三步：引入前向滚动时序验证 (Walk-Forward Validation) 与时间衰减 (Time Decay)】
1. 严禁使用普通 K-Fold 交叉验证：开奖数据是高度相关的非平稳时间序列。使用普通交叉验证会造成严重的时间穿越（Data Leakage）。
2. Walk-Forward 实现：
   - 分割训练：以第 1 期至第 N 期为训练集，预测第 N+1 期。
   - 步进滑动：将第 N+1 期加入训练集，重新拟合，预测第 N+2 期。依次往复。
   - 计算 2026 年度穿透模拟的全局精确率、召回率、F1 分数以及 AUC 曲线。
3. 时间衰减 (Time Decay)：
   - 鉴于彩票规律存在大周期的阶段性漂移（如生肖与年份天干地支对应发生改变，或历史权重失效）。
   - 在训练损失函数中，为每行数据赋予时间权重 Weight_T = exp(-lambda * (T_latest - T))。
   - 使最近 50 期的特征对模型训练贡献最大，而 10 年前的历史特征权重指数级递减。

【第四步：开发 SHAP 归因解释器面板】
1. 现状痛点：机器学习黑盒模型预测缺乏说服力，用户不知道为什么某个生肖被判定为“杀肖”或“主防”。
2. V3 解决方案：
   - 编写简易的可加性解释算法（或利用 Python 的 SHAP 库），量化 11 大核心特征（如 omission, density, combo_veto）对当期预测生肖总得分的影响。
   - 返回每个生肖的特征贡献值：
     \`Feature Contribution Map: { "兔": { "omission": +15.2, "f2_combo_veto": -35.4 } }\`
   - 前端界面据此渲染“推演逻辑归因可视化图表（瀑布图或条形图）”，让用户一目了然看懂算法的决策支撑。

【第五步：在线学习 (Online Incremental Learning)】
1. 机制设计：
   - 在后台添加开奖记录监听器。每当触发 \`/api/add-record\` 录入最新一期开奖结果时，PredictionPipeline 自动拉起当期保存的 Snapshot。
   - 补全这一期的 Label（1 或 0），追加到 \`feature_dataset.csv\` 底部。
   - 触发对已加载模型的增量梯度更新（如 Mini-batch 逻辑回归、增量树分裂），实现系统的自主闭环演进！`
    },
    {
      title: "4. 📋 一键完整复制指令（送往下一个 AI 开发的最佳 Prompt）",
      icon: <FileText className="w-4 h-4 text-indigo-400" />,
      description: "专为下一个 AI 助手定制的高效上下文 Prompt。包含完整的系统架构、当前文件位置、现有代码和升级目标，复制即可开始 V3 机器学习开发。",
      content: `你现在是 LHC Prediction Engine 的顶级资深 AI 架构师。用户目前拥有一个完整的 TypeScript / React / Express 全栈开奖特征分析与决策系统，该系统已处于 V2.5（特征驱动架构）就绪状态。

请基于以下完整系统上下文和规范，帮我继续实现从【V2.5 特征驱动】向【V3 纯机器学习决策引擎】的终极升级：

=========================================
LHC PREDICTION ENGINE V2.5 -> V3 CONTEXT
=========================================

1. 【核心文件及代码位置】：
   - \`src/types.ts\`: 定义了原始开奖记录 \`LotteryRecord\`、特征规格 \`FeatureResult\` 及预测响应 \`PredictionResult\` 等。
   - \`src/server/features.ts\`: 当前已实现的核心特征驱动总线：
     - \`FeatureRepository\`: 特征存储与查询核心。
     - \`FeatureCollector\`: 从开奖历史提取 11 大核心时间序列特征（包含遗漏值 omission, 连出 consecutive, 近5期密度 density, 50期长期密度 longterm_density, 加权马尔可夫校准率 calibrated_rate, 朴素贝叶斯打开概率 bayes_open_prob, 逻辑回归杀肖概率 logistic_veto_prob, 规则专家系统得分 zodiac_analyzer_score, 联合 F2 组合 Veto 判定 f2_combo_veto, F5 规律回补触发 f5_recovery_triggered / f5_recovery_rate 等）。
     - \`FeatureDatasetBuilder\`: 自动将特征与下期开奖结果对齐，自动生成 0/1 Label，并将全量训练集在后台编译写入到 \`/data/feature_dataset.csv\` 中；同时保存单期 CSV 快照。
     - \`PredictionPipeline\`: 调度数据收集、特征审计、当期预测快照保存。
   - \`src/server/zodiacAnalyzer.ts\`: 预测引擎计算入口。在执行 \`generatePrediction\` 前，已被完美注入 V2.5 的特征驱动钩子，可在计算任意期预测时自动生成该期的特征数据并追加编译数据集。

2. 【你要做的事情（升级目标）】：
   请为我开发完成 V3 机器学习升级。你需要：
   - 实现一个新的 PredictionModel，名为 \`MachineLearningPredictionModel\`，替换现在的 \`CurrentPredictionModel\`。
   - 机制：
     A. 在 Node 端读取 \`/data/feature_dataset.csv\` 作为训练集。
     B. 编写或引入一个机器学习分类算法（如轻量级随机森林 RandomForest、梯度提升回归、或者手写高维 Logistic Regression），使其可以在 \`MachineLearningPredictionModel\` 中执行自动模型训练、超参数调优，并对当期的生肖开奖进行概率预测（输出 0 到 1 之间的概率值）。
     C. 添加【概率校准器 (Probability Calibration)】：实现 Platt Scaling (普拉特校准)，将模型原始输出概率拟合到实际真实发生的置信度中。
     D. 加入【时间衰减 (Time Decay) 训练权重】：最近期数的训练行具有更高权重。
     E. 输出【SHAP 特征贡献归因】：计算 11 个特征在当前预测期对于每个生肖的贡献值，方便前端渲染。
     F. 支持【在线增量更新 (Online Learning)】：每当输入新开奖数据，自动追加训练行并微调模型。

请在编写完代码后，提供清晰的实现说明，并确保 100% 保证 TypeScript 类型安全、不留任何空实现！`
    }
  ];

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden" id="spec-module-section">
      {/* Glow decorative background */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5 mb-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 font-mono text-xs font-bold uppercase tracking-widest mb-1">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
            LHC Engine Upgrade specifications Center
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            AI 升级一键复制规格书中心 (复制模块)
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            专为多 AI 协同和深度重构设计。您可以通过复制以下高精度、无损的业务和数据规格，让任意 AI 助手瞬间掌握当前 V2.5 的特征驱动实现，并一键无阻碍升级至 V3 机器学习引擎！
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-[10px] text-slate-400">
          <span>Active Status:</span>
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            V2.5 Feature-Driven Ready
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {specifications.map((spec, idx) => (
          <div key={idx} className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 hover:border-slate-700/80 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  {spec.icon}
                  {spec.title}
                </h3>
                <button
                  onClick={() => handleCopy(spec.content, idx)}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-md border transition-all flex items-center gap-1.5 cursor-pointer ${
                    copiedIndex === idx
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white"
                  }`}
                >
                  {copiedIndex === idx ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      复制此规格
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-3.5 leading-relaxed">
                {spec.description}
              </p>
            </div>
            
            <div className="relative">
              <textarea
                readOnly
                value={spec.content}
                className="w-full h-44 bg-slate-950 border border-slate-800/50 rounded-lg p-3 text-xs font-mono text-slate-300 focus:outline-hidden resize-none scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent"
              />
              <div className="absolute bottom-2.5 right-2.5 bg-slate-900/90 backdrop-blur-xs border border-slate-800/60 rounded px-2 py-0.5 text-[9px] text-slate-500 font-mono pointer-events-none select-none">
                UTF-8 • 无损格式
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-slate-900 pt-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
          <span>不知道如何使用？复制第 4 模块的指令，开启任意 AI 助手的 V3 大模型对话即可！</span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono">
          © 2026 LHC ENGINE V2.5 SPECIFICATION CENTER
        </div>
      </div>
    </div>
  );
};
