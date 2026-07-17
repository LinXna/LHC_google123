import * as fs from "fs";
import * as path from "path";
import { 
  LotteryRecord, 
  AnalyzerReport, 
  PredictionResult, 
  Rule1ReportItem, 
  Rule1PairItem,
  DiversityRepeatItem,
  Rule2KillItem,
  Rule3RangeItem,
  SpecialNumRecord,
  TraceRecoveryItem,
  TraceRecoveryHotItem,
  TimelineData,
  TimelineReport,
  ZodiacScoreDetail,
  SlotStat,
  SequentialMatchItem
} from "../types.js";

export class ZodiacPatternAnalyzer {
  public static EXT_PERIODS = 5;
  public static MAX_LOOKBACK = 30;
  public static MIN_PERIODS = 4;
  public static MAX_GAP_STAT = 30;
  public static HOT_THRESHOLD = 0.12;

  public zodiacOrder = ["马", "蛇", "龙", "兔", "虎", "牛", "鼠", "猪", "狗", "鸡", "猴", "羊"];
  public zodiacMap: Record<number, string>;
  public engineMode: "unified" | "dynamic" = "unified";
  public freshnessEnabled: boolean = false;
  public freshnessYears: number = 3;
  private _zodiacMapCache: Record<string, Record<number, string>> = {};

  constructor(
    baseZodiac: string = "马", 
    engineMode: "unified" | "dynamic" = "unified",
    freshnessEnabled: boolean = false,
    freshnessYears: number = 3
  ) {
    if (!this.zodiacOrder.includes(baseZodiac)) {
      throw new Error(`无效本命肖: ${baseZodiac}，可选: ${this.zodiacOrder.join(", ")}`);
    }
    this.engineMode = engineMode;
    this.zodiacMap = this._getZodiacMap(baseZodiac);
    this.freshnessEnabled = freshnessEnabled;
    this.freshnessYears = freshnessYears;
  }

  public static resampleRecords(records: LotteryRecord[], freshnessYears: number): LotteryRecord[] {
    if (records.length === 0) return [];
    
    // Find the latest archive_year to measure freshness difference
    let latestYear = 2026;
    for (const r of records) {
      const yr = r.archive_year || (r.date ? parseInt(r.date.slice(0, 4)) : null);
      if (yr && yr > latestYear) {
        latestYear = yr;
      }
    }

    const getDeterministicRandom = (issue: number) => {
      const x = Math.sin(issue) * 10000;
      return x - Math.floor(x);
    };

    const resampled: LotteryRecord[] = [];
    for (const record of records) {
      const yr = record.archive_year || (record.date ? parseInt(record.date.slice(0, 4)) : 2026);
      const yearsDiff = latestYear - yr;
      if (yearsDiff < freshnessYears) {
        // Within X years: keep 100% of strong features
        resampled.push(record);
      } else {
        // Older than X years: dynamically weaken (decay keep probability)
        const yearsOver = yearsDiff - freshnessYears;
        const keepProb = Math.max(0.15, Math.pow(0.5, yearsOver + 1));
        if (getDeterministicRandom(record.issue) < keepProb) {
          resampled.push(record);
        }
      }
    }
    return resampled;
  }

  public resampleIfEnabled(records: LotteryRecord[]): LotteryRecord[] {
    if (!this.freshnessEnabled) return records;
    return ZodiacPatternAnalyzer.resampleRecords(records, this.freshnessYears);
  }

  private _validateDrawNumbers(nums: any): boolean {
    if (!Array.isArray(nums) || nums.length !== 7) return false;
    const normalized = nums.map(n => parseInt(n));
    if (normalized.some(isNaN)) return false;
    const unique = new Set(normalized);
    if (unique.size !== 7) return false;
    return normalized.every(n => n >= 1 && n <= 49);
  }

  public static getBaseZodiacByYear(yearInt: number): string {
    const zodiacList = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];
    const remainder = ((yearInt - 4) % 12 + 12) % 12;
    return zodiacList[remainder];
  }

  private _safeIssueKey(record: any): number | null {
    const issue = record.issue;
    if (issue === undefined || issue === null) return null;
    const num = parseInt(issue);
    if (isNaN(num)) return null;
    return num;
  }

  private _getZodiacMap(baseZodiac: string): Record<number, string> {
    if (!this.zodiacOrder.includes(baseZodiac)) {
      throw new Error(`无效本命肖: ${baseZodiac}，可选: ${this.zodiacOrder.join(", ")}`);
    }
    if (!this._zodiacMapCache[baseZodiac]) {
      this._zodiacMapCache[baseZodiac] = this._buildMap(baseZodiac);
    }
    return this._zodiacMapCache[baseZodiac];
  }

  private _buildMap(baseZodiac: string): Record<number, string> {
    const idx = this.zodiacOrder.indexOf(baseZodiac);
    const aligned = [...this.zodiacOrder.slice(idx), ...this.zodiacOrder.slice(0, idx)];
    const map: Record<number, string> = {};
    for (let i = 1; i <= 49; i++) {
      map[i] = aligned[(i - 1) % 12];
    }
    return map;
  }

  public static getCombinations<T>(array: T[], size: number): T[][] {
    const result: T[][] = [];
    function helper(start: number, combo: T[]) {
      if (combo.length === size) {
        result.push([...combo]);
        return;
      }
      for (let i = start; i < array.length; i++) {
        combo.push(array[i]);
        helper(i + 1, combo);
        combo.pop();
      }
    }
    helper(0, []);
    return result;
  }

  public static bisectLeft(array: number[], x: number): number {
    let low = 0;
    let high = array.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (array[mid] < x) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  public loadJsonData(filePath: string | null = null, dataDir: string = "data"): LotteryRecord[] {
    const allRecords: LotteryRecord[] = [];
    if (!fs.existsSync(dataDir)) {
      console.error(`数据目录不存在: ${dataDir}`);
      return [];
    }

    let targetFiles: string[] = [];
    if (filePath) {
      targetFiles = [filePath];
    } else {
      try {
        targetFiles = fs.readdirSync(dataDir)
          .filter(f => f.endsWith(".json"))
          .map(f => path.join(dataDir, f))
          .sort();
      } catch (e) {
        console.error(`读取数据目录失败: ${e}`);
        return [];
      }
    }

    for (const p of targetFiles) {
      try {
        const raw = fs.readFileSync(p, "utf-8");
        const payload = JSON.parse(raw);
        if (typeof payload !== "object" || payload === null) continue;
        
        const bodyList = payload.result?.data?.bodyList;
        if (!Array.isArray(bodyList)) continue;

        const fileName = path.basename(p);
        let fileYear = parseInt(fileName.split(".")[0]) || 2026;
        if (bodyList.length > 0 && bodyList[0].preDrawDate) {
          fileYear = parseInt(bodyList[0].preDrawDate.slice(0, 4)) || fileYear;
        }

        const fileRecords: LotteryRecord[] = [];
        for (const item of bodyList) {
          const codeStr = item.preDrawCode;
          if (!codeStr) continue;

          const nums = codeStr.split(",")
            .map((x: string) => x.trim())
            .filter((x: string) => x !== "")
            .map((x: string) => parseInt(x));

          if (this._validateDrawNumbers(nums)) {
            const issueKey = this._safeIssueKey(item);
            if (issueKey === null) continue;
            fileRecords.push({
              issue: issueKey,
              date: item.preDrawDate || "",
              numbers: nums,
              archive_year: fileYear,
            });
          }
        }
        fileRecords.sort((a, b) => a.issue - b.issue);
        allRecords.push(...fileRecords);
      } catch (e) {
        console.warn(`读取文件 ${p} 失败: ${e}`);
        continue;
      }
    }

    allRecords.sort((a, b) => {
      const yrA = a.archive_year || 0;
      const yrB = b.archive_year || 0;
      if (yrA !== yrB) return yrA - yrB;
      return a.issue - b.issue;
    });
    return allRecords;
  }

  private buildZodiacRelationRule(
    relationSource: Record<string, string[]>,
    size: number = 2,
    hotThreshold: number = ZodiacPatternAnalyzer.HOT_THRESHOLD,
    coldZero: boolean = false,
    allowedKeys?: Set<string>
  ): Record<string, Rule1PairItem> {
    const result: Record<string, Rule1PairItem> = {};
    for (const [key, nextList] of Object.entries(relationSource)) {
      if (allowedKeys && !allowedKeys.has(key)) continue;
      const counts: Record<string, number> = {};
      for (const z of nextList) counts[z] = (counts[z] || 0) + 1;
      const total = nextList.length;
      if (total === 0) continue;

      const hot: [string, number, number][] = [];
      for (const [z, c] of Object.entries(counts)) {
        const pct = c / total;
        if (pct >= hotThreshold) {
          hot.push([z, c, pct]);
        }
      }
      hot.sort((a, b) => b[1] - a[1]);

      let cold: [string, number, number][] = [];
      if (coldZero) {
        cold = this.zodiacOrder
          .filter(z => !counts[z])
          .map(z => [z, 0, 0] as [string, number, number]);
      } else {
        cold = this.zodiacOrder
          .map(z => [z, counts[z] || 0, (counts[z] || 0) / total] as [string, number, number])
          .filter(item => item[2] < 0.05);
      }

      result[key] = {
        periods: Math.floor(total / 7),
        hot,
        cold,
      };
    }
    return result;
  }

  public computePatterns(sortedRecords: LotteryRecord[], isBacktest: boolean = false): AnalyzerReport {
    if (!sortedRecords) throw new Error("sortedRecords 不能为 null");
    if (!Array.isArray(sortedRecords)) throw new Error("sortedRecords 必须是 array");

    if (sortedRecords.length === 0) {
      return {
        total: 0,
        latest_issue: null,
        rule1: {},
        rule1_pairs: {},
        diversity_repeat_rule: {},
        rule2_kills: [],
        rule3_report: {},
        top_special_expanded: [],
        top_15_pairs: [],
        bottom_15_pairs: [],
        combo_linkage: [],
        reverse_trace: [],
        trace_recovery: {},
        trace_recovery_hot: {},
        zodiac_score: {},
        zodiac_ranking: [],
        rule1_triplets: {},
        timeline: {}
      };
    }

    const totalPeriodsRaw = sortedRecords.length;
    if (totalPeriodsRaw < ZodiacPatternAnalyzer.MIN_PERIODS) {
      return {
        total: totalPeriodsRaw,
        latest_issue: null,
        rule1: {},
        rule1_pairs: {},
        diversity_repeat_rule: {},
        rule2_kills: [],
        rule3_report: {},
        top_special_expanded: [],
        top_15_pairs: [],
        bottom_15_pairs: [],
        combo_linkage: [],
        reverse_trace: [],
        trace_recovery: {},
        trace_recovery_hot: {},
        zodiac_score: {},
        zodiac_ranking: [],
        rule1_triplets: {},
        timeline: {}
      };
    }

    const historyData: number[][] = [];
    const validRecords: LotteryRecord[] = [];
    for (const record of sortedRecords) {
      if (!record || !this._validateDrawNumbers(record.numbers)) continue;
      historyData.push(record.numbers);
      validRecords.push(record);
    }

    const totalPeriodsFiltered = historyData.length;
    if (totalPeriodsFiltered < ZodiacPatternAnalyzer.MIN_PERIODS) {
      return {
        total: totalPeriodsFiltered,
        latest_issue: null,
        rule1: {},
        rule1_pairs: {},
        diversity_repeat_rule: {},
        rule2_kills: [],
        rule3_report: {},
        top_special_expanded: [],
        top_15_pairs: [],
        bottom_15_pairs: [],
        combo_linkage: [],
        reverse_trace: [],
        trace_recovery: {},
        trace_recovery_hot: {},
        zodiac_score: {},
        zodiac_ranking: [],
        rule1_triplets: {},
        timeline: {}
      };
    }

    const zodiacMatrix: string[][] = [];
    const alignedRecords: LotteryRecord[] = [];
    const alignedHistory: number[][] = [];

    for (let i = 0; i < validRecords.length; i++) {
      const record = validRecords[i];
      const group = historyData[i];
      try {
        const year = record.archive_year;
        let zmap = this.zodiacMap;
        if (this.engineMode === "dynamic" && year !== undefined && year !== null) {
          const base = ZodiacPatternAnalyzer.getBaseZodiacByYear(year);
          zmap = this._getZodiacMap(base);
        }
        zodiacMatrix.push(group.map(n => zmap[n]));
        alignedRecords.push(record);
        alignedHistory.push(group);
      } catch (e) {
        console.warn(`生肖映射失败，已跳过一期: ${e}`);
        continue;
      }
    }

    const currentHistoryData = alignedHistory;
    const totalPeriods = zodiacMatrix.length;
    if (totalPeriods < ZodiacPatternAnalyzer.MIN_PERIODS) {
      return {
        total: totalPeriods,
        latest_issue: null,
        rule1: {},
        rule1_pairs: {},
        diversity_repeat_rule: {},
        rule2_kills: [],
        rule3_report: {},
        top_special_expanded: [],
        top_15_pairs: [],
        bottom_15_pairs: [],
        combo_linkage: [],
        reverse_trace: [],
        trace_recovery: {},
        trace_recovery_hot: {},
        zodiac_score: {},
        zodiac_ranking: [],
        rule1_triplets: {},
        timeline: {}
      };
    }

    const totalValidP = Math.max(totalPeriods - 1, 1);

    const latestZList = zodiacMatrix[zodiacMatrix.length - 1] || [];
    const latestZSet = new Set(latestZList);
    const latestDiv = latestZSet.size;

    const latestZListSorted = Array.from(latestZSet).sort();
    const latestPairs = ZodiacPatternAnalyzer.getCombinations(latestZListSorted, 2);
    const activePairKeys = new Set(latestPairs.map(pair => `(${latestDiv}, ('${pair[0]}', '${pair[1]}'))`));

    const latestTriplets = ZodiacPatternAnalyzer.getCombinations(latestZListSorted, 3);
    const activeTripletKeys = new Set(latestTriplets.map(triplet => `(${latestDiv}, ('${triplet[0]}', '${triplet[1]}', '${triplet[2]}'))`));

    // =========================================================================
    // 查找器7：前三期轨迹回补规则
    // =========================================================================
    const traceDisappearPool: Record<string, string[]> = {};
    for (let i = 3; i < totalPeriods - 1; i++) {
      const last1 = new Set(zodiacMatrix[i - 1]);
      const last2 = new Set(zodiacMatrix[i - 2]);
      const curr = new Set(zodiacMatrix[i]);
      
      const disappeared: string[] = [];
      for (const z of last1) {
        if (last2.has(z) && !curr.has(z)) {
          disappeared.push(z);
        }
      }
      if (disappeared.length === 0) continue;

      const nextPeriod = zodiacMatrix[i + 1];
      for (const z of disappeared) {
        if (!traceDisappearPool[z]) traceDisappearPool[z] = [];
        traceDisappearPool[z].push(...nextPeriod);
      }
    }

    const traceRecoveryHot: Record<string, TraceRecoveryHotItem> = {};
    for (const [z, pool] of Object.entries(traceDisappearPool)) {
      const counts: Record<string, number> = {};
      for (const x of pool) counts[x] = (counts[x] || 0) + 1;
      const total = pool.length;
      if (total === 0) continue;

      const hot: [string, number, number][] = [];
      for (const [name, cnt] of Object.entries(counts)) {
        const rate = cnt / total;
        if (rate >= 0.10) {
          hot.push([name, cnt, rate]);
        }
      }
      hot.sort((a, b) => b[2] - a[2]);
      traceRecoveryHot[z] = {
        samples: Math.floor(total / 7),
        hot,
      };
    }

    // =========================================================================
    // 统一生肖评分池
    // =========================================================================
    const zodiacScore: Record<string, ZodiacScoreDetail> = {};
    for (const z of this.zodiacOrder) {
      zodiacScore[z] = { score: 0, reasons: [], confidence: 0 };
    }

    const addScore = (zodiac: string, score: number, reason: string, confidence = 1) => {
      if (!zodiacScore[zodiac]) return;
      zodiacScore[zodiac].score += score;
      zodiacScore[zodiac].confidence += confidence;
      zodiacScore[zodiac].reasons.push(reason);
    };

    // =========================================================================
    // 1 & 2. 单生肖交叉 + 多对组合
    // =========================================================================
    const diversityHistory = zodiacMatrix.map(zList => new Set(zList).size);
    const rule1Detail: Record<string, string[]> = {};
    const rule1PairDetail: Record<string, string[]> = {};
    const rule1TripletDetail: Record<string, string[]> = {};

    const repeatStatsByDiv: Record<number, { total_cases: number; repeated_cases: number; repeat_counts: Record<number, number> }> = {};

    for (let i = 0; i < totalValidP; i++) {
      const currZSet = new Set(zodiacMatrix[i]);
      const currDiv = diversityHistory[i];
      const nextZList = zodiacMatrix[i + 1];
      const nextZSet = new Set(nextZList);

      let intersectCnt = 0;
      for (const z of currZSet) {
        if (nextZSet.has(z)) intersectCnt++;
      }

      if (!repeatStatsByDiv[currDiv]) {
        repeatStatsByDiv[currDiv] = { total_cases: 0, repeated_cases: 0, repeat_counts: {} };
      }
      repeatStatsByDiv[currDiv].total_cases++;
      if (intersectCnt > 0) {
        repeatStatsByDiv[currDiv].repeated_cases++;
        repeatStatsByDiv[currDiv].repeat_counts[intersectCnt] = (repeatStatsByDiv[currDiv].repeat_counts[intersectCnt] || 0) + 1;
      }

      if (isBacktest && currDiv !== latestDiv) {
        continue;
      }

      for (const z of currZSet) {
        const condKey = `当期多样性[${currDiv}种生肖]且含【${z}】`;
        if (!isBacktest || (currDiv === latestDiv && latestZSet.has(z))) {
          if (!rule1Detail[condKey]) rule1Detail[condKey] = [];
          rule1Detail[condKey].push(...nextZList);
        }
      }

      const currZList = Array.from(currZSet).sort();
      const pairs = ZodiacPatternAnalyzer.getCombinations(currZList, 2);
      for (const pair of pairs) {
        const condKey = `(${currDiv}, ('${pair[0]}', '${pair[1]}'))`;
        if (!isBacktest || activePairKeys.has(condKey)) {
          if (!rule1PairDetail[condKey]) rule1PairDetail[condKey] = [];
          rule1PairDetail[condKey].push(...nextZList);
        }
      }

      const triplets = ZodiacPatternAnalyzer.getCombinations(currZList, 3);
      for (const triplet of triplets) {
        const condKey = `(${currDiv}, ('${triplet[0]}', '${triplet[1]}', '${triplet[2]}'))`;
        if (!isBacktest || activeTripletKeys.has(condKey)) {
          if (!rule1TripletDetail[condKey]) rule1TripletDetail[condKey] = [];
          rule1TripletDetail[condKey].push(...nextZList);
        }
      }
    }

    const rule1Report: Record<string, Rule1ReportItem> = {};
    for (const [condition, nxtList] of Object.entries(rule1Detail)) {
      const counts: Record<string, number> = {};
      for (const z of nxtList) counts[z] = (counts[z] || 0) + 1;
      const totalNext = nxtList.length;

      const hotZ: [string, number, number][] = [];
      for (const [zn, c] of Object.entries(counts)) {
        const pct = c / totalNext;
        if (pct >= 0.10) {
          hotZ.push([zn, c, pct]);
        }
      }
      hotZ.sort((a, b) => b[1] - a[1]);

      const coldZ: [string, number, number][] = [];
      for (const zAll of this.zodiacOrder) {
        const pct = (counts[zAll] || 0) / totalNext;
        if (pct < 0.05) {
          coldZ.push([zAll, counts[zAll] || 0, pct]);
        }
      }
      coldZ.sort((a, b) => a[2] - b[2]);

      // Check if this condition matches the latest draw's state (diversity + zodiac presence)
      const isActiveCondition = Array.from(latestZSet).some(
        z => condition === `当期多样性[${latestDiv}种生肖]且含【${z}】`
      );

      if (isActiveCondition) {
        for (const [zName, cnt, pct] of hotZ) {
          const conf = Math.floor(totalNext / 7);
          if (pct >= 0.15) {
            addScore(zName, 3.5, `F1单点共振高频(${(pct * 100).toFixed(1)}%)`, conf);
          } else if (pct >= 0.10) {
            addScore(zName, 2.0, `F1单点共振热点(${(pct * 100).toFixed(1)}%)`, conf);
          }
        }

        for (const [zName, cnt, pct] of coldZ) {
          const conf = Math.floor(totalNext / 7);
          if (pct === 0) {
            addScore(zName, -4.5, "F1单点共振绝对排除绝杀", conf);
          } else if (pct < 0.03) {
            addScore(zName, -2.5, `F1单点共振冷门排斥(${(pct * 100).toFixed(1)}%)`, conf);
          }
        }
      }

      let morphologyType = "正常形态";
      const divCntMatch = condition.match(/\[(\d+)种生肖\]/);
      const divCnt = divCntMatch ? parseInt(divCntMatch[1]) : 4;
      if (divCnt <= 3) {
        morphologyType = "低多样性聚集形态";
      } else if (divCnt >= 6) {
        morphologyType = "高多样性饱和形态";
      }

      rule1Report[condition] = {
        periods: Math.floor(totalNext / 7),
        morphology: morphologyType,
        hot: hotZ,
        cold: coldZ,
      };
    }

    const rule1PairReport = this.buildZodiacRelationRule(
      rule1PairDetail,
      2,
      0.12,
      true,
      activePairKeys
    );

    const rule1TripletReport = this.buildZodiacRelationRule(
      rule1TripletDetail,
      3,
      0.12,
      true,
      activeTripletKeys
    );

    // =========================================================================
    // F1 升级：高阶组合（双元与三元）状态共振评分
    // =========================================================================
    // 双元组合共振 scoring (仅保留关联置信度最高的 top 2 组合，防止评分过度通胀)
    const matchedPairsList: { pair: string[]; pData: any; scoreMetric: number }[] = [];
    for (const pair of latestPairs) {
      const condKey = `(${latestDiv}, ('${pair[0]}', '${pair[1]}'))`;
      if (rule1PairReport[condKey]) {
        const pData = rule1PairReport[condKey];
        const maxPct = Math.max(...(pData.hot || []).map((x: any) => x[2]), 0.01);
        matchedPairsList.push({ pair, pData, scoreMetric: pData.periods * maxPct });
      }
    }
    matchedPairsList.sort((a, b) => b.scoreMetric - a.scoreMetric);

    for (const item of matchedPairsList.slice(0, 2)) {
      const { pair, pData } = item;
      const conf = pData.periods;
      for (const [zName, cnt, pct] of pData.hot || []) {
        if (pct >= 0.18) {
          addScore(zName, 3.0, `F1二元组合共振利好(${pair[0]}+${pair[1]}, 概率${(pct * 100).toFixed(0)}%)`, conf);
        } else if (pct >= 0.12) {
          addScore(zName, 1.5, `F1二元组合共振热点(${pair[0]}+${pair[1]}, 概率${(pct * 100).toFixed(0)}%)`, conf);
        }
      }
      for (const [zName, cnt, pct] of pData.cold || []) {
        if (pct === 0) {
          addScore(zName, -4.0, `F1二元组合绝杀排除(${pair[0]}+${pair[1]})`, conf);
        } else if (pct < 0.05) {
          addScore(zName, -2.0, `F1二元组合冷门排斥(${pair[0]}+${pair[1]})`, conf);
        }
      }
    }

    // 三元组合共振 scoring (仅保留最核心 of top 1 黄金共振，控制积分冗余)
    const matchedTripletsList: { triplet: string[]; tData: any; scoreMetric: number }[] = [];
    for (const triplet of latestTriplets) {
      const condKey = `(${latestDiv}, ('${triplet[0]}', '${triplet[1]}', '${triplet[2]}'))`;
      if (rule1TripletReport[condKey]) {
        const tData = rule1TripletReport[condKey];
        const maxPct = Math.max(...(tData.hot || []).map((x: any) => x[2]), 0.01);
        matchedTripletsList.push({ triplet, tData, scoreMetric: tData.periods * maxPct });
      }
    }
    matchedTripletsList.sort((a, b) => b.scoreMetric - a.scoreMetric);

    for (const item of matchedTripletsList.slice(0, 1)) {
      const { triplet, tData } = item;
      const conf = tData.periods;
      for (const [zName, cnt, pct] of tData.hot || []) {
        if (pct >= 0.20) {
          addScore(zName, 4.0, `F1三元组合共振黄金利好(${triplet.join("+")}, 概率${(pct * 100).toFixed(0)}%)`, conf);
        } else if (pct >= 0.12) {
          addScore(zName, 2.5, `F1三元组合共振利好(${triplet.join("+")}, 概率${(pct * 100).toFixed(0)}%)`, conf);
        }
      }
      for (const [zName, cnt, pct] of tData.cold || []) {
        if (pct === 0) {
          addScore(zName, -4.5, `F1三元组合绝杀排除(${triplet.join("+")})`, conf);
        }
      }
    }

    const diversityRepeatRule: Record<string, DiversityRepeatItem> = {};
    for (const [div, stat] of Object.entries(repeatStatsByDiv)) {
      diversityRepeatRule[div] = {
        total_occur: stat.total_cases,
        repeat_rate: stat.total_cases > 0 ? stat.repeated_cases / stat.total_cases : 0,
        repeat_counts: stat.repeat_counts,
      };
    }

    // =========================================================================
    // 3. 基础伴生矩阵
    // =========================================================================
    const pairPeriodDist: Record<string, number> = {};
    for (const g of zodiacMatrix) {
      const uniqueZ = Array.from(new Set(g)).sort();
      const pairs = ZodiacPatternAnalyzer.getCombinations(uniqueZ, 2);
      for (const pair of pairs) {
        const pKey = `${pair[0]}-${pair[1]}`;
        pairPeriodDist[pKey] = (pairPeriodDist[pKey] || 0) + 1;
      }
    }

    const pairList = Object.entries(pairPeriodDist).map(([p, freq]) => [p, freq, freq / totalPeriods] as [string, number, number]);
    pairList.sort((a, b) => b[1] - a[1]);
    const top15Pairs = pairList.slice(0, 15);
    const bottom15Pairs = [...pairList].reverse().slice(0, 15);

    // =========================================================================
    // 4. 微观强力杀号过滤器
    // =========================================================================
    const singleCrossKills: Rule2KillItem[] = [];
    for (const zCurr of this.zodiacOrder) {
      const idxList: number[] = [];
      for (let i = 0; i < totalValidP; i++) {
        if (zodiacMatrix[i].includes(zCurr)) {
          idxList.push(i);
        }
      }

      if (idxList.length < 20) continue;

      const nextPool: string[] = [];
      for (const idx of idxList) {
        nextPool.push(...zodiacMatrix[idx + 1]);
      }
      const nextTotal = nextPool.length;
      if (nextTotal === 0) continue;

      const counts: Record<string, number> = {};
      for (const z of nextPool) counts[z] = (counts[z] || 0) + 1;

      for (const zNext of this.zodiacOrder) {
        const prob = (counts[zNext] || 0) / nextTotal;
        if (prob <= 0.05) {
          singleCrossKills.push({
            curr: zCurr,
            kill: zNext,
            prob,
            trigger_p: idxList.length,
          });
        }
      }
    }
    singleCrossKills.sort((a, b) => {
      if (a.prob !== b.prob) return a.prob - b.prob;
      return b.trigger_p - a.trigger_p;
    });

    // =========================================================================
    // 5. 十进制区间空间局限性矩阵（升级：物理限位关联生肖落子规律）
    // =========================================================================
    const rangesConfig: Record<string, [number, number]> = {
      "0-9": [1, 9],
      "10-19": [10, 19],
      "20-29": [20, 29],
      "30-39": [30, 39],
      "40-49": [40, 49],
    };
    const rule3Report: Record<string, Rule3RangeItem> = {};
    for (const [rLabel, [rMin, rMax]] of Object.entries(rangesConfig)) {
      let rTrigP = 0;
      const slotsLinkage: Record<number, SlotStat> = {};
      const numCountDist: Record<number, number> = {};
      
      // 用以统计某槽位触发时，下一期出现的生肖总数及频次
      const slotsNextZTally: Record<number, Record<string, number>> = {};

      for (let i = 0; i < totalValidP; i++) {
        const currNums = currentHistoryData[i];
        const nextNums = currentHistoryData[i + 1];
        
        const inRangeNums = currNums.filter(n => n >= rMin && n <= rMax).sort((a, b) => a - b);
        const inCount = inRangeNums.length;
        numCountDist[inCount] = (numCountDist[inCount] || 0) + 1;

        if (inCount === 2) {
          rTrigP++;
          const n1 = inRangeNums[0];
          const n2 = inRangeNums[1];
          
          const availableIn = Array.from({ length: n2 - n1 - 1 }, (_, index) => n1 + 1 + index);
          const availableGreater = Array.from({ length: rMax - n2 }, (_, index) => n2 + 1 + index);
          const availableLess = Array.from({ length: n1 - rMin }, (_, index) => rMin + index);
          const slotsCount = availableIn.length;

          if (!slotsLinkage[slotsCount]) {
            slotsLinkage[slotsCount] = { total: 0, in_range: 0, out_greater: 0, out_less: 0, no_hit: 0 };
          }
          const sLink = slotsLinkage[slotsCount];
          sLink.total++;

          if (!slotsNextZTally[slotsCount]) {
            slotsNextZTally[slotsCount] = {};
            for (const z of this.zodiacOrder) {
              slotsNextZTally[slotsCount][z] = 0;
            }
          }
          // 统计此节点下一期实际开出的生肖
          for (const z of zodiacMatrix[i + 1]) {
            slotsNextZTally[slotsCount][z] = (slotsNextZTally[slotsCount][z] || 0) + 1;
          }

          const hitNums = nextNums.filter(n => n >= rMin && n <= rMax);
          if (hitNums.length === 0) {
            sLink.no_hit++;
          } else {
            const isIn = hitNums.some(hN => availableIn.includes(hN));
            const isGreater = hitNums.some(hN => availableGreater.includes(hN));
            const isLess = hitNums.some(hN => availableLess.includes(hN));
            
            if (isIn) sLink.in_range++;
            if (isGreater) sLink.out_greater++;
            if (isLess) sLink.out_less++;
            if (!isIn && !isGreater && !isLess) sLink.no_hit++;
          }
        }
      }

      // 后处理每个 slotsCount 的生肖规律
      for (const [slotsCountStr, sLink] of Object.entries(slotsLinkage)) {
        const slotsCount = parseInt(slotsCountStr, 10);
        const tally = slotsNextZTally[slotsCount];
        if (tally && sLink.total > 0) {
          // 最热生肖
          const zodiacRates = Object.entries(tally)
            .map(([z, cnt]) => [z, cnt / sLink.total] as [string, number])
            .sort((a, b) => b[1] - a[1]);
          
          sLink.next_z_hot = zodiacRates.slice(0, 3);
          
          // 绝对绝杀生肖 (历史从未开出 0% 概率)
          const kills = Object.entries(tally)
            .filter(([_, cnt]) => cnt === 0)
            .map(([z]) => z);
          sLink.next_z_kills = kills;

          // 若最新一期符合物理限位，进行预测模型影响加权
          const latestNums = currentHistoryData[totalValidP].filter(n => n >= rMin && n <= rMax).sort((a, b) => a - b);
          if (latestNums.length === 2) {
            const lGap = Math.abs(latestNums[1] - latestNums[0] - 1);
            if (lGap === slotsCount) {
              // 1. 利好最热
              for (const [z, rate] of sLink.next_z_hot) {
                if (rate >= 0.18) {
                  addScore(z, 2, `F3十进制物理卡槽利好(${rLabel}中夹${slotsCount}槽位, 概率${(rate*100).toFixed(0)}%)`, Math.floor(sLink.total / 3));
                }
              }
              // 2. 拦截绝对绝杀
              if (sLink.total >= 4) {
                for (const z of sLink.next_z_kills) {
                  addScore(z, -3, `F3十进制物理卡槽绝杀排除(${rLabel}中夹${slotsCount}槽位)`, Math.floor(sLink.total / 2));
                }
              }
            }
          }
        }
      }

      rule3Report[rLabel] = {
        periods_with_two: rTrigP,
        num_count_distribution: numCountDist,
        slots: slotsLinkage,
      };
    }

    // =========================================================================
    // 6. 查找器 4：特码隔离特征矩阵（加入回溯窗口限制 - 线性预计算优化）
    // =========================================================================
    const numPositions: Record<number, number[]> = {};
    for (let i = 0; i < currentHistoryData.length; i++) {
      for (const n of currentHistoryData[i]) {
        if (!numPositions[n]) numPositions[n] = [];
        numPositions[n].push(i);
      }
    }

    interface HistIProperties {
      isBias: boolean;
      topZ: string;
      oddCount: number;
      evenCount: number;
      bigCount: number;
      smallCount: number;
      tailCounts: number[];
    }

    const histProps: (HistIProperties | null)[] = [];
    for (let i = 0; i < totalPeriods; i++) {
      if (i + ZodiacPatternAnalyzer.EXT_PERIODS >= totalPeriods) {
        histProps.push(null);
        continue;
      }
      
      const fZodiacs: string[] = [];
      const fNums: number[] = [];
      for (let offset = 1; offset <= ZodiacPatternAnalyzer.EXT_PERIODS; offset++) {
        const nextZ = zodiacMatrix[i + offset];
        const nextN = currentHistoryData[i + offset];
        if (nextZ && nextN) {
          for (let j = 0; j < 7; j++) {
            fZodiacs.push(nextZ[j]);
            fNums.push(nextN[j]);
          }
        }
      }

      const zCounts: Record<string, number> = {};
      for (let j = 0; j < fZodiacs.length; j++) {
        const z = fZodiacs[j];
        zCounts[z] = (zCounts[z] || 0) + 1;
      }
      
      let topZ = "无";
      let topZC = 0;
      for (const [z, c] of Object.entries(zCounts)) {
        if (c > topZC) {
          topZC = c;
          topZ = z;
        }
      }

      const isBias = topZC >= 6;

      let oddCount = 0;
      let evenCount = 0;
      let bigCount = 0;
      let smallCount = 0;
      const tailCounts = new Array(10).fill(0);

      for (let j = 0; j < fNums.length; j++) {
        const fn = fNums[j];
        if (fn % 2 === 0) {
          evenCount++;
        } else {
          oddCount++;
        }
        if (fn >= 25) {
          bigCount++;
        } else {
          smallCount++;
        }
        tailCounts[fn % 10]++;
      }

      histProps.push({
        isBias,
        topZ,
        oddCount,
        evenCount,
        bigCount,
        smallCount,
        tailCounts
      });
    }

    const specialExpandedByNum: Record<number, SpecialNumRecord> = {};
    for (let num = 1; num <= 49; num++) {
      const positions = numPositions[num] || [];
      for (const targetIdx of positions) {
        const scanLimit = targetIdx - ZodiacPatternAnalyzer.EXT_PERIODS;
        if (scanLimit <= 0) continue;

        let appearCount = 0;
        let biasTriggerCount = 0;
        const targetZodiacPool: string[] = [];

        let oddC = 0;
        let evenC = 0;
        let bigC = 0;
        let smallC = 0;
        const tailDist: Record<number, number> = {};
        let totalFutureNumbers = 0;

        const cutoff = ZodiacPatternAnalyzer.bisectLeft(positions, scanLimit);
        const startPos = Math.max(0, cutoff - ZodiacPatternAnalyzer.MAX_LOOKBACK);
        const recentPositions = positions.slice(startPos, cutoff);

        for (const histI of recentPositions) {
          const props = histProps[histI];
          if (!props) continue;

          appearCount++;
          if (props.isBias) {
            biasTriggerCount++;
            targetZodiacPool.push(props.topZ);
          }
          oddC += props.oddCount;
          evenC += props.evenCount;
          bigC += props.bigCount;
          smallC += props.smallCount;
          for (let t = 0; t < 10; t++) {
            if (props.tailCounts[t] > 0) {
              tailDist[t] = (tailDist[t] || 0) + props.tailCounts[t];
            }
          }
          totalFutureNumbers += 35;
        }

        if (appearCount >= 1) {
          const bRate = biasTriggerCount / appearCount;
          let mostZ = "无";
          if (targetZodiacPool.length > 0) {
            const poolCounts: Record<string, number> = {};
            for (const z of targetZodiacPool) poolCounts[z] = (poolCounts[z] || 0) + 1;
            let maxZC = 0;
            for (const [z, c] of Object.entries(poolCounts)) {
              if (c > maxZC) {
                maxZC = c;
                mostZ = z;
              }
            }
          }

          const totFn = totalFutureNumbers > 0 ? totalFutureNumbers : 1;
          const sortedTails = Object.entries(tailDist).map(([t, c]) => [parseInt(t), c] as [number, number]);
          sortedTails.sort((a, b) => b[1] - a[1]);
          const topTails = sortedTails.slice(0, 2);

          const behaviorRule = {
            odd_ratio: parseFloat(((oddC / totFn) * 100).toFixed(1)),
            big_ratio: parseFloat(((bigC / totFn) * 100).toFixed(1)),
            hot_tails: topTails.map(([t]) => `${t}尾`),
          };

          const entry: SpecialNumRecord = [
            num,
            bRate * 100,
            bRate,
            mostZ,
            appearCount,
            behaviorRule,
          ];

          const existing = specialExpandedByNum[num];
          if (!existing || bRate > existing[2]) {
            specialExpandedByNum[num] = entry;
          }
        }
      }
    }

    const specialExpanded = Object.values(specialExpandedByNum);
    specialExpanded.sort((a, b) => b[1] - a[1]);

    // =========================================================================
    // 6-2. 查找器 4-Sub：特码生肖偏态特征分析（F4 升级：统计特码所属生肖对后续的偏振余波）
    // =========================================================================
    const specialZodiacBiasMap: Record<string, {
      zodiac: string;
      matchesCount: number;
      nextZodiacCounts: Record<string, number>;
    }> = {};

    for (const z of this.zodiacOrder) {
      const counts: Record<string, number> = {};
      for (const nz of this.zodiacOrder) counts[nz] = 0;
      specialZodiacBiasMap[z] = {
        zodiac: z,
        matchesCount: 0,
        nextZodiacCounts: counts
      };
    }

    for (let i = 0; i < totalValidP; i++) {
      const zRow = zodiacMatrix[i];
      if (zRow.length < 7) continue;
      const specZ = zRow[6];
      if (!specZ || !this.zodiacOrder.includes(specZ)) continue;

      const nextZRow = zodiacMatrix[i + 1];
      specialZodiacBiasMap[specZ].matchesCount++;
      for (const nz of nextZRow) {
        if (specialZodiacBiasMap[specZ].nextZodiacCounts[nz] !== undefined) {
          specialZodiacBiasMap[specZ].nextZodiacCounts[nz]++;
        }
      }
    }

    const specialZodiacBias: SpecialZodiacBiasRecord[] = [];
    for (const z of this.zodiacOrder) {
      const entry = specialZodiacBiasMap[z];
      const total = entry.matchesCount;
      const nextZodiacPercentages: Record<string, number> = {};
      const kills: string[] = [];
      const hotZList: [string, number][] = [];

      for (const [nz, count] of Object.entries(entry.nextZodiacCounts)) {
        const rate = total > 0 ? count / total : 0;
        nextZodiacPercentages[nz] = rate;
        if (total >= 4 && count === 0) {
          kills.push(nz);
        }
        if (rate >= 0.15) {
          hotZList.push([nz, rate]);
        }
      }

      hotZList.sort((a, b) => b[1] - a[1]);

      specialZodiacBias.push({
        zodiac: z,
        matchesCount: total,
        nextZodiacPercentages,
        nextZodiacKills: kills,
        hotZodiacs: hotZList
      });
    }

    // 偏振余波加权结合评分系统
    const latestRow = zodiacMatrix[totalPeriods - 1];
    const latestSpecZ = latestRow && latestRow.length >= 7 ? latestRow[6] : null;
    if (latestSpecZ && specialZodiacBiasMap[latestSpecZ]) {
      const bias = specialZodiacBiasMap[latestSpecZ];
      const total = bias.matchesCount;
      if (total >= 4) {
        for (const [nz, count] of Object.entries(bias.nextZodiacCounts)) {
          const rate = count / total;
          if (rate >= 0.16) {
            addScore(nz, 2, `F4特码生肖余波高引力利好(特码生肖【${latestSpecZ}】后置)`, Math.floor(total / 3));
          } else if (count === 0) {
            addScore(nz, -3, `F4特码生肖绝对排除绝杀(特码生肖【${latestSpecZ}】后置绝对为0)`, Math.floor(total / 2));
          }
        }
      }
    }

    // =========================================================================
    // 7. 查找器 7：三期轨迹回补矩阵 (升级：断层回补反弹催化原因分析)
    // =========================================================================
    const traceRecoveryMatrix: Record<string, Record<string, TraceRecoveryItem>> = {
      "prev1_missing": {},
      "prev2_missing": {},
      "prev3_missing": {},
      "multi_gap": {},
    };
 
    const gaps = [
      { name: "prev1_missing", size: 1 },
      { name: "prev2_missing", size: 2 },
      { name: "prev3_missing", size: 3 },
    ];
 
    for (const { name, size } of gaps) {
      const rawTriggers: Record<string, Array<{ recovered: number; gapZodiacs: string[]; gapDiversity: number }>> = {};
      for (let i = size; i < totalValidP; i++) {
        let consecutiveSet = new Set(zodiacMatrix[i - 1]);
        for (let back = 2; back <= size; back++) {
          const backSet = new Set(zodiacMatrix[i - back]);
          const intersect = new Set<string>();
          for (const z of consecutiveSet) {
            if (backSet.has(z)) intersect.add(z);
          }
          consecutiveSet = intersect;
        }
 
        const currentSet = new Set(zodiacMatrix[i]);
        const nextSet = new Set(zodiacMatrix[i + 1]);
 
        for (const z of consecutiveSet) {
          if (!currentSet.has(z)) {
            if (!rawTriggers[z]) rawTriggers[z] = [];
            rawTriggers[z].push({
              recovered: nextSet.has(z) ? 1 : 0,
              gapZodiacs: zodiacMatrix[i],
              gapDiversity: currentSet.size
            });
          }
        }
      }
 
      const res: Record<string, TraceRecoveryItem> = {};
      for (const [z, list] of Object.entries(rawTriggers)) {
        const total = list.length;
        if (total < 10) continue;
        
        const recoveredList = list.filter(item => item.recovered === 1);
        const recoverCount = recoveredList.length;
 
        // 提取催化因子
        let companions: [string, number][] = [];
        const divDist: Record<number, number> = {};
 
        if (recoverCount > 0) {
          const compTally: Record<string, number> = {};
          for (const item of recoveredList) {
            for (const gz of item.gapZodiacs) {
              if (gz !== z) {
                compTally[gz] = (compTally[gz] || 0) + 1;
              }
            }
            divDist[item.gapDiversity] = (divDist[item.gapDiversity] || 0) + 1;
          }
          companions = Object.entries(compTally)
            .map(([cz, cnt]) => [cz, cnt] as [string, number])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);
        }
 
        res[z] = {
          trigger: total,
          recover: recoverCount,
          rate: recoverCount / total,
          catalysts: {
            zodiac_companion: companions,
            diversity_distribution: divDist
          }
        };
      }
      traceRecoveryMatrix[name] = res;
    }
 
    // Multi gap
    const multiRawTriggers: Record<string, Array<{ recovered: number; gapZodiacs: string[]; gapDiversity: number }>> = {};
    for (let i = 3; i < totalValidP; i++) {
      let consecutiveThree = new Set(zodiacMatrix[i - 1]);
      for (let back = 2; back <= 3; back++) {
        const backSet = new Set(zodiacMatrix[i - back]);
        const intersect = new Set<string>();
        for (const z of consecutiveThree) {
          if (backSet.has(z)) intersect.add(z);
        }
        consecutiveThree = intersect;
      }
 
      const currentSet = new Set(zodiacMatrix[i]);
      const nextSet = new Set(zodiacMatrix[i + 1]);
 
      for (const z of consecutiveThree) {
        if (!currentSet.has(z)) {
          if (!multiRawTriggers[z]) multiRawTriggers[z] = [];
          multiRawTriggers[z].push({
            recovered: nextSet.has(z) ? 1 : 0,
            gapZodiacs: zodiacMatrix[i],
            gapDiversity: currentSet.size
          });
        }
      }
    }
 
    const multiResult: Record<string, TraceRecoveryItem> = {};
    for (const [z, list] of Object.entries(multiRawTriggers)) {
      const total = list.length;
      if (total < 10) continue;
 
      const recoveredList = list.filter(item => item.recovered === 1);
      const recoverCount = recoveredList.length;
 
      let companions: [string, number][] = [];
      const divDist: Record<number, number> = {};
 
      if (recoverCount > 0) {
        const compTally: Record<string, number> = {};
        for (const item of recoveredList) {
          for (const gz of item.gapZodiacs) {
            if (gz !== z) {
              compTally[gz] = (compTally[gz] || 0) + 1;
            }
          }
          divDist[item.gapDiversity] = (divDist[item.gapDiversity] || 0) + 1;
        }
        companions = Object.entries(compTally)
          .map(([cz, cnt]) => [cz, cnt] as [string, number])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4);
      }
 
      multiResult[z] = {
        trigger: total,
        recover: recoverCount,
        rate: recoverCount / total,
        catalysts: {
          zodiac_companion: companions,
          diversity_distribution: divDist
        }
      };
    }
    traceRecoveryMatrix["multi_gap"] = multiResult;

    // =========================================================================
    // F7 升级：前三期断层轨迹回补结合评分系统
    // =========================================================================
    const lastRow1 = zodiacMatrix[totalPeriods - 1] || []; // current
    const lastRow2 = totalPeriods >= 2 ? zodiacMatrix[totalPeriods - 2] : []; // prev 1
    const lastRow3 = totalPeriods >= 3 ? zodiacMatrix[totalPeriods - 3] : []; // prev 2
    const lastRow4 = totalPeriods >= 4 ? zodiacMatrix[totalPeriods - 4] : []; // prev 3

    const lastSet1 = new Set(lastRow1);
    const lastSet2 = new Set(lastRow2);
    const lastSet3 = new Set(lastRow3);
    const lastSet4 = new Set(lastRow4);

    for (const z of this.zodiacOrder) {
      // 1期断层: 之前有，当期断开
      if (lastSet2.has(z) && !lastSet1.has(z)) {
        const item = traceRecoveryMatrix["prev1_missing"]?.[z];
        if (item && item.trigger >= 5) {
          if (item.rate >= 0.50) {
            addScore(z, 2.5, `F7一期断层回补强拉升(历史回补率${(item.rate * 100).toFixed(0)}%)`, item.trigger);
          } else if (item.rate <= 0.25) {
            addScore(z, -2.0, `F7一期断层低回补排斥(历史回补率${(item.rate * 100).toFixed(0)}%)`, item.trigger);
          }
        }
      }
      // 2期断层: 连续两期有，当期断开
      if (lastSet3.has(z) && lastSet2.has(z) && !lastSet1.has(z)) {
        const item = traceRecoveryMatrix["prev2_missing"]?.[z];
        if (item && item.trigger >= 4) {
          if (item.rate >= 0.55) {
            addScore(z, 3.0, `F7二期连续断层回补重振(历史回补率${(item.rate * 100).toFixed(0)}%)`, item.trigger);
          } else if (item.rate <= 0.20) {
            addScore(z, -2.5, `F7二期连续断层低回补排斥(历史回补率${(item.rate * 100).toFixed(0)}%)`, item.trigger);
          }
        }
      }
      // 3期及以上断层: 连续三期有，当期断开
      if (lastSet4.has(z) && lastSet3.has(z) && lastSet2.has(z) && !lastSet1.has(z)) {
        const item = traceRecoveryMatrix["multi_gap"]?.[z] || traceRecoveryMatrix["prev3_missing"]?.[z];
        if (item && item.trigger >= 3) {
          if (item.rate >= 0.60) {
            addScore(z, 4.0, `F7多期共振回补黄金利好(历史回补率${(item.rate * 100).toFixed(0)}%)`, item.trigger);
          } else if (item.rate <= 0.15) {
            addScore(z, -3.5, `F7多期超低回补绝对绝杀(历史回补率${(item.rate * 100).toFixed(0)}%)`, item.trigger);
          }
        }
      }
    }

    // =========================================================================
    // 9. 查找器7：跨期时间轴引擎
    // =========================================================================
    const timelineReport: TimelineReport = {
      prev_miss_return: {},
      double_keep_break: {},
      gap_return: {},
      gap_finish: {},
    };

    const timelineRule1: Record<string, { trigger: number; return: number }> = {};
    const timelineRule2: Record<string, { trigger: number; return: number }> = {};
    for (const z of this.zodiacOrder) {
      timelineRule1[z] = { trigger: 0, return: 0 };
      timelineRule2[z] = { trigger: 0, return: 0 };
    }

    for (let i = 2; i < totalPeriods - 1; i++) {
      const prevSet = new Set(zodiacMatrix[i - 1]);
      const currSet = new Set(zodiacMatrix[i]);
      const nextSet = new Set(zodiacMatrix[i + 1]);
      const prev2Set = new Set(zodiacMatrix[i - 2]);

      for (const z of this.zodiacOrder) {
        if (prevSet.has(z) && !currSet.has(z)) {
          timelineRule1[z].trigger++;
          if (nextSet.has(z)) {
            timelineRule1[z].return++;
          }
        }
        if (prev2Set.has(z) && prevSet.has(z) && !currSet.has(z)) {
          timelineRule2[z].trigger++;
          if (nextSet.has(z)) {
            timelineRule2[z].return++;
          }
        }
      }
    }

    for (const z of this.zodiacOrder) {
      if (timelineRule1[z].trigger > 0) {
        timelineReport.prev_miss_return![z] = {
          trigger: timelineRule1[z].trigger,
          return: timelineRule1[z].return,
          return_rate: timelineRule1[z].return / timelineRule1[z].trigger,
        };
      }
      if (timelineRule2[z].trigger > 0) {
        timelineReport.double_keep_break![z] = {
          trigger: timelineRule2[z].trigger,
          return: timelineRule2[z].return,
          return_rate: timelineRule2[z].return / timelineRule2[z].trigger,
        };
      }
    }

    // Gap return & gap finish
    const timelineGapRule: Record<number, { trigger: number; return: number }> = {};
    for (const z of this.zodiacOrder) {
      let gap = 0;
      for (let i = 0; i < totalPeriods - 1; i++) {
        const currSet = new Set(zodiacMatrix[i]);
        const nextSet = new Set(zodiacMatrix[i + 1]);
        if (!currSet.has(z)) {
          gap++;
          const statGap = Math.min(gap, ZodiacPatternAnalyzer.MAX_GAP_STAT);
          if (!timelineGapRule[statGap]) timelineGapRule[statGap] = { trigger: 0, return: 0 };
          timelineGapRule[statGap].trigger++;
          if (nextSet.has(z)) {
            timelineGapRule[statGap].return++;
          }
        } else {
          gap = 0;
        }
      }
    }

    for (const [gap, stat] of Object.entries(timelineGapRule)) {
      const gNum = parseInt(gap);
      if (stat.trigger > 0) {
        timelineReport.gap_return![gNum] = {
          trigger: stat.trigger,
          return: stat.return,
          return_rate: stat.return / stat.trigger,
        };
      }
    }

    const timelineGapFinish: Record<number, { trigger: number; return: number }> = {};
    for (const z of this.zodiacOrder) {
      let gap = 0;
      for (let i = 0; i < totalPeriods; i++) {
        const currSet = new Set(zodiacMatrix[i]);
        if (!currSet.has(z)) {
          gap++;
        } else {
          if (gap > 0) {
            const statGap = Math.min(gap, ZodiacPatternAnalyzer.MAX_GAP_STAT);
            if (!timelineGapFinish[statGap]) timelineGapFinish[statGap] = { trigger: 0, return: 0 };
            timelineGapFinish[statGap].trigger++;
            if (i + 1 < totalPeriods && new Set(zodiacMatrix[i + 1]).has(z)) {
              timelineGapFinish[statGap].return++;
            }
          }
          gap = 0;
        }
      }
    }

    for (const [gap, stat] of Object.entries(timelineGapFinish)) {
      const gNum = parseInt(gap);
      if (stat.trigger > 0) {
        timelineReport.gap_finish![gNum] = {
          trigger: stat.trigger,
          return: stat.return,
          return_rate: stat.return / stat.trigger,
        };
      }
    }

    // =========================================================================
    // 10. 查找器 8：逆向追踪特征
    // =========================================================================
    const reverseTraceReport: any[] = [];
    const hotGroups = Object.entries(pairPeriodDist)
      .filter(([p, freq]) => freq >= 3)
      .map(([p]) => p.split("-") as [string, string]);

    for (const hPair of hotGroups) {
      const targetIndices: number[] = [];
      for (let idx = 1; idx < totalPeriods; idx++) {
        const currSet = new Set(zodiacMatrix[idx]);
        if (currSet.has(hPair[0]) && currSet.has(hPair[1])) {
          targetIndices.push(idx);
        }
      }

      if (targetIndices.length > 0) {
        const prevZPool: string[] = [];
        for (const idx of targetIndices) {
          prevZPool.push(...zodiacMatrix[idx - 1]);
        }
        
        const prevCounts: Record<string, number> = {};
        for (const z of prevZPool) prevCounts[z] = (prevCounts[z] || 0) + 1;

        const traceHits: [string, number][] = [];
        for (const [z, c] of Object.entries(prevCounts)) {
          const rate = c / targetIndices.length;
          if (rate >= 0.75) {
            traceHits.push([z, rate]);
          }
        }

        if (traceHits.length > 0) {
          reverseTraceReport.push({
            pair: hPair,
            trig: targetIndices.length,
            hints: traceHits,
          });
        }
      }
    }

    // =========================================================================
    // F1 & F2 升级：双特征多级序列共振匹配
    // (一：生肖个数序列比对；二：具体生肖组全包含/子集序列比对)
    // =========================================================================
    const count_resonance: SequentialMatchItem[] = [];
    const zodiac_resonance: SequentialMatchItem[] = [];

    const n_periods = zodiacMatrix.length;
    if (n_periods >= 5) {
      const all_diversities = zodiacMatrix.map(zList => new Set(zList).size);
      const all_zodiac_sets = zodiacMatrix.map(zList => new Set(zList));

      // 深度 2、3、4 期连续共振
      for (let depth = 2; depth <= 4; depth++) {
        // --- 1. 多样性生肖个数序列共振 ---
        const target_div_seq: number[] = [];
        for (let d = depth; d >= 1; d--) {
          target_div_seq.push(all_diversities[n_periods - d]);
        }

        let count_matches = 0;
        const count_next_z_tally: Record<string, number> = {};
        for (const z of this.zodiacOrder) {
          count_next_z_tally[z] = 0;
        }

        // 检索历史
        for (let i = depth - 1; i < n_periods - 1; i++) {
          let is_match = true;
          for (let step = 0; step < depth; step++) {
            const hist_idx = i - (depth - 1) + step;
            if (all_diversities[hist_idx] !== target_div_seq[step]) {
              is_match = false;
              break;
            }
          }

          if (is_match) {
            count_matches++;
            const next_draw_set = all_zodiac_sets[i + 1];
            for (const z of this.zodiacOrder) {
              if (next_draw_set.has(z)) {
                count_next_z_tally[z] = (count_next_z_tally[z] || 0) + 1;
              }
            }
          }
        }

        const count_percentages: Record<string, number> = {};
        const count_kills: string[] = [];
        for (const z of this.zodiacOrder) {
          const matched_freq = count_next_z_tally[z] || 0;
          const prob = count_matches > 0 ? matched_freq / count_matches : 0;
          count_percentages[z] = prob;
          // 若匹配期数 >= 3 且下一期从未开出该生肖，则归为绝杀拦截
          if (count_matches >= 3 && matched_freq === 0) {
            count_kills.push(z);
            addScore(z, -3, `F2数量共振绝对排他(深度${depth})`, Math.floor(count_matches / 2));
          }
          // 若开出率极高，则在预测评分中加分
          if (count_matches >= 3 && prob >= 0.25) {
            addScore(z, 2, `F1数量共振强热点(深度${depth}, 概率${(prob * 100).toFixed(0)}%)`, Math.floor(count_matches / 3));
          }
        }

        const countLabel = `连续 ${depth} 期多样性数量: ` + target_div_seq.join(" → ");
        count_resonance.push({
          depth,
          patternType: "count",
          patternLabel: countLabel,
          matchesCount: count_matches,
          nextZodiacCounts: count_next_z_tally,
          nextZodiacKills: count_kills,
          nextZodiacPercentages: count_percentages,
        });

        // --- 2. 具体生肖组全包含（子集）序列共振 ---
        const target_z_sets: Set<string>[] = [];
        for (let d = depth; d >= 1; d--) {
          target_z_sets.push(all_zodiac_sets[n_periods - d]);
        }

        let zodiac_matches = 0;
        const zodiac_next_z_tally: Record<string, number> = {};
        for (const z of this.zodiacOrder) {
          zodiac_next_z_tally[z] = 0;
        }

        // 检索历史 (子集全包含匹配)
        for (let i = depth - 1; i < n_periods - 1; i++) {
          let is_match = true;
          for (let step = 0; step < depth; step++) {
            const hist_idx = i - (depth - 1) + step;
            const hist_set = all_zodiac_sets[hist_idx];
            for (const tz of target_z_sets[step]) {
              if (!hist_set.has(tz)) {
                is_match = false;
                break;
              }
            }
            if (!is_match) break;
          }

          if (is_match) {
            zodiac_matches++;
            const next_draw_set = all_zodiac_sets[i + 1];
            for (const z of this.zodiacOrder) {
              if (next_draw_set.has(z)) {
                zodiac_next_z_tally[z] = (zodiac_next_z_tally[z] || 0) + 1;
              }
            }
          }
        }

        const zodiac_percentages: Record<string, number> = {};
        const zodiac_kills: string[] = [];
        for (const z of this.zodiacOrder) {
          const matched_freq = zodiac_next_z_tally[z] || 0;
          const prob = zodiac_matches > 0 ? matched_freq / zodiac_matches : 0;
          zodiac_percentages[z] = prob;
          // 若匹配到具体生肖组历史，杀号效果极高
          if (zodiac_matches >= 1 && matched_freq === 0) {
            zodiac_kills.push(z);
            addScore(z, -4, `F2生肖共振绝对排他(深度${depth})`, zodiac_matches);
          }
          if (zodiac_matches >= 1 && prob >= 0.30) {
            addScore(z, 3, `F1生肖共振极佳参考(深度${depth}, 概率${(prob * 100).toFixed(0)}%)`, zodiac_matches);
          }
        }

        const zodiacLabel = `连续 ${depth} 期生肖包络: ` + target_z_sets.map(s => `[${Array.from(s).join(",")}]`).join(" → ");
        zodiac_resonance.push({
          depth,
          patternType: "zodiac",
          patternLabel: zodiacLabel,
          matchesCount: zodiac_matches,
          nextZodiacCounts: zodiac_next_z_tally,
          nextZodiacKills: zodiac_kills,
          nextZodiacPercentages: zodiac_percentages,
        });
      }
    }

    // =========================================================================
    // F6 升级：生肖重叠与多重组合现象规律统计 (aa, bb, cc, d 等组合)
    // =========================================================================
    const getMultiplicitySignature = (zodiacs: string[]): { signature: string; label: string } => {
      const counts: Record<string, number> = {};
      for (const z of zodiacs) {
        counts[z] = (counts[z] || 0) + 1;
      }
      const freqList = Object.values(counts).sort((a, b) => b - a);
      const distinctCount = freqList.length;
      const duplicates = freqList.filter(f => f > 1);
      
      let signature = "无重叠";
      let label = "无重叠 (7个不同生肖)";
      
      if (duplicates.length > 0) {
        const parts: string[] = [];
        for (const d of duplicates) {
          if (d === 2) parts.push("aa");
          else if (d === 3) parts.push("aaa");
          else if (d === 4) parts.push("aaaa");
          else if (d === 5) parts.push("aaaaa");
          else if (d === 6) parts.push("aaaaaa");
          else if (d === 7) parts.push("aaaaaaa");
        }
        signature = parts.join(", ");
        
        if (signature === "aa") {
          label = "aa, b, c, d, e (1双重叠, 6个不同生肖)";
        } else if (signature === "aa, aa") {
          signature = "aa, bb";
          label = "aa, bb, c, d (2双重叠, 5个不同生肖)";
        } else if (signature === "aa, aa, aa") {
          signature = "aa, bb, cc";
          label = "aa, bb, cc, d (3双重叠, 4个不同生肖)";
        } else if (signature === "aaa") {
          label = "aaa, b, c, d (1三重叠, 5个不同生肖)";
        } else if (signature === "aaa, aa") {
          signature = "aaa, bb";
          label = "aaa, bb, c (1三叠1双叠, 4个不同生肖)";
        } else if (signature === "aaaa") {
          label = "aaaa, b, c (1四重叠, 4个不同生肖)";
        } else {
          label = `${signature} 复杂重叠组合 (${distinctCount}个不同生肖)`;
        }
      }
      return { signature, label };
    };

    // Gather history matches
    const multiplicityTally: Record<string, {
      label: string;
      totalCount: number;
      repeatMatches: number;
      nextZodiacCounts: Record<string, number>;
      nextDiversityCounts: Record<number, number>;
    }> = {};

    for (let i = 0; i < totalPeriods - 1; i++) {
      const currZ = zodiacMatrix[i];
      const nextZ = zodiacMatrix[i + 1];
      const { signature, label } = getMultiplicitySignature(currZ);
      
      if (!multiplicityTally[signature]) {
        const counts: Record<string, number> = {};
        for (const z of this.zodiacOrder) counts[z] = 0;
        multiplicityTally[signature] = {
          label,
          totalCount: 0,
          repeatMatches: 0,
          nextZodiacCounts: counts,
          nextDiversityCounts: {}
        };
      }
      
      const item = multiplicityTally[signature];
      item.totalCount++;
      
      // Check repeat
      const currSet = new Set(currZ);
      const nextSet = new Set(nextZ);
      let repeats = false;
      for (const z of currSet) {
        if (nextSet.has(z)) {
          repeats = true;
          break;
        }
      }
      if (repeats) {
        item.repeatMatches++;
      }
      
      // Next zodiac counts
      for (const nz of nextZ) {
        if (item.nextZodiacCounts[nz] !== undefined) {
          item.nextZodiacCounts[nz]++;
        }
      }
      
      // Next diversity count
      const nextDiv = nextSet.size;
      item.nextDiversityCounts[nextDiv] = (item.nextDiversityCounts[nextDiv] || 0) + 1;
    }

    const zodiacMultiplicityRules: any[] = [];
    for (const [sig, info] of Object.entries(multiplicityTally)) {
      const total = info.totalCount;
      if (total === 0) continue;
      
      const nextDiversityDistribution: Record<number, number> = {};
      for (const [div, cnt] of Object.entries(info.nextDiversityCounts)) {
        nextDiversityDistribution[parseInt(div)] = cnt / total;
      }
      
      const hotList: [string, number, number][] = [];
      for (const [z, count] of Object.entries(info.nextZodiacCounts)) {
        const pct = count / (total * 7); // average occurrence density
        const appearanceRate = count / total; // probability of appearing in next draw
        hotList.push([z, count, appearanceRate]);
      }
      
      // Sort and separate
      hotList.sort((a, b) => b[2] - a[2]);
      
      // Hottest next zodiacs: top 3
      const hottestZodiacs = hotList.slice(0, 3);
      
      // Coolest next zodiacs: bottom 3
      const coolestZodiacs = [...hotList].reverse().slice(0, 3);
      
      zodiacMultiplicityRules.push({
        signature: sig,
        label: info.label,
        totalCount: total,
        rate: total / (totalPeriods - 1),
        nextDiversityDistribution,
        nextRepeatRate: info.repeatMatches / total,
        hottestZodiacs,
        coolestZodiacs
      });
    }

    // Sort by totalCount descending so that popular ones appear first
    zodiacMultiplicityRules.sort((a, b) => b.totalCount - a.totalCount);

    // Apply scoring impact if the latest draw matches any pattern
    const latestRowZ = zodiacMatrix[totalPeriods - 1] || [];
    const { signature: latestSig } = getMultiplicitySignature(latestRowZ);
    const matchingMultiRule = zodiacMultiplicityRules.find(r => r.signature === latestSig);
    if (matchingMultiRule && matchingMultiRule.totalCount >= 4) {
      for (const [zName, cnt, pct] of matchingMultiRule.hottestZodiacs) {
        if (pct >= 0.70) {
          addScore(zName, 3.5, `F6最新重叠形态【${latestSig}】次期黄金强热点(历史概率${(pct * 100).toFixed(0)}%)`, matchingMultiRule.totalCount);
        } else if (pct >= 0.50) {
          addScore(zName, 2.0, `F6最新重叠形态【${latestSig}】次期热点(历史概率${(pct * 100).toFixed(0)}%)`, matchingMultiRule.totalCount);
        }
      }
      for (const [zName, cnt, pct] of matchingMultiRule.coolestZodiacs) {
        if (cnt === 0) {
          addScore(zName, -4.5, `F6最新重叠形态【${latestSig}】次期绝对排除绝杀`, matchingMultiRule.totalCount);
        } else if (pct < 0.20) {
          addScore(zName, -2.5, `F6最新重叠形态【${latestSig}】次期冷门偏振排斥(历史概率${(pct * 100).toFixed(0)}%)`, matchingMultiRule.totalCount);
        }
      }
    }

    const ranking = Object.entries(zodiacScore)
      .map(([z, info]) => [z, info] as [string, ZodiacScoreDetail])
      .sort((a, b) => b[1].score - a[1].score);

    // =========================================================================
    // 升级：下期生肖去重数量 (diversity) 预测引擎与特征推演
    // =========================================================================
    const globalDivCounts: Record<number, number> = { 4: 0, 5: 0, 6: 0, 7: 0 };
    const transitionMatrixCounts: Record<number, Record<number, number>> = {
      4: { 4: 0, 5: 0, 6: 0, 7: 0 },
      5: { 4: 0, 5: 0, 6: 0, 7: 0 },
      6: { 4: 0, 5: 0, 6: 0, 7: 0 },
      7: { 4: 0, 5: 0, 6: 0, 7: 0 }
    };

    // Fill counts and transitions
    for (let i = 0; i < totalPeriods; i++) {
      const d = diversityHistory[i];
      if (d >= 4 && d <= 7) {
        globalDivCounts[d]++;
      }
      if (i < totalPeriods - 1) {
        const nextD = diversityHistory[i + 1];
        if (d >= 4 && d <= 7 && nextD >= 4 && nextD <= 7) {
          transitionMatrixCounts[d][nextD]++;
        }
      }
    }

    // Convert counts to percentages for global distribution
    const totalDivs = Object.values(globalDivCounts).reduce((a, b) => a + b, 0) || 1;
    const globalDistribution: Record<number, number> = {};
    let globalSum = 0;
    for (const d of [4, 5, 6, 7]) {
      globalDistribution[d] = globalDivCounts[d] / totalDivs;
      globalSum += d * globalDistribution[d];
    }
    const globalAverage = globalSum;

    // Convert counts to percentages for transitions
    const transitionMatrix: Record<number, Record<number, number>> = {};
    for (const d of [4, 5, 6, 7]) {
      transitionMatrix[d] = {};
      const rowSum = Object.values(transitionMatrixCounts[d]).reduce((a, b) => a + b, 0);
      for (const nextD of [4, 5, 6, 7]) {
        transitionMatrix[d][nextD] = rowSum > 0 ? transitionMatrixCounts[d][nextD] / rowSum : globalDistribution[nextD];
      }
    }

    // Current State
    const currentDiversity = diversityHistory[diversityHistory.length - 1] || 6;
    const currentSignature = latestSig;

    // Recent average
    const recentCount = Math.min(10, diversityHistory.length);
    const recentDiversities = diversityHistory.slice(-recentCount);
    const recentAverage = recentDiversities.reduce((a, b) => a + b, 0) / recentCount;

    // Helper to calculate ensemble prediction for any historical index (for backtesting or latest prediction)
    const computeEnsemblePrediction = (idx: number) => {
      const dCurr = diversityHistory[idx];
      const zCurr = zodiacMatrix[idx] || [];
      const countsCurr: Record<string, number> = {};
      for (const z of zCurr) {
        countsCurr[z] = (countsCurr[z] || 0) + 1;
      }
      const freqListCurr = Object.values(countsCurr).sort((a, b) => b - a);
      const duplicatesCurr = freqListCurr.filter(f => f > 1);
      let sigCurr = "无重叠";
      if (duplicatesCurr.length > 0) {
        const partsCurr: string[] = [];
        for (const d of duplicatesCurr) {
          if (d === 2) partsCurr.push("aa");
          else if (d === 3) partsCurr.push("aaa");
          else if (d === 4) partsCurr.push("aaaa");
          else if (d === 5) partsCurr.push("aaaaa");
          else if (d === 6) partsCurr.push("aaaaaa");
          else if (d === 7) partsCurr.push("aaaaaaa");
        }
        sigCurr = partsCurr.join(", ");
        if (sigCurr === "aa, aa") sigCurr = "aa, bb";
        else if (sigCurr === "aa, aa, aa") sigCurr = "aa, bb, cc";
        else if (sigCurr === "aaa, aa") sigCurr = "aaa, bb";
      }

      // Model 1: Markov Prior
      const markovPrior = { ...globalDistribution };
      if (dCurr >= 4 && dCurr <= 7) {
        const row = transitionMatrix[dCurr];
        if (row) {
          for (const k of [4, 5, 6, 7]) markovPrior[k] = row[k];
        }
      }

      // Model 2: Signature Conditioned Prior
      const sigPrior = { ...globalDistribution };
      const matchedRule = zodiacMultiplicityRules.find(r => r.signature === sigCurr);
      if (matchedRule && matchedRule.totalCount >= 3) {
        for (const k of [4, 5, 6, 7]) {
          sigPrior[k] = matchedRule.nextDiversityDistribution[k] || 0;
        }
      }

      // Model 3: Recent Mean Reversion Adjuster
      // Look back 5 periods
      const lookBack = Math.min(5, idx + 1);
      const subHistory = diversityHistory.slice(idx + 1 - lookBack, idx + 1);
      const subAvg = subHistory.reduce((a, b) => a + b, 0) / lookBack;
      const deviation = subAvg - globalAverage; // positive means recent is higher than usual

      const meanReversionPrior = { ...globalDistribution };
      const mrBias: Record<number, number> = { 4: 1, 5: 1, 6: 1, 7: 1 };
      if (deviation > 0.1) {
        mrBias[4] = 1.3;
        mrBias[5] = 1.1;
        mrBias[6] = 0.9;
        mrBias[7] = 0.7;
      } else if (deviation < -0.1) {
        mrBias[4] = 0.7;
        mrBias[5] = 0.9;
        mrBias[6] = 1.1;
        mrBias[7] = 1.3;
      }

      const rawMR: Record<number, number> = {};
      let mrSum = 0;
      for (const k of [4, 5, 6, 7]) {
        rawMR[k] = globalDistribution[k] * mrBias[k];
        mrSum += rawMR[k];
      }
      for (const k of [4, 5, 6, 7]) meanReversionPrior[k] = mrSum > 0 ? rawMR[k] / mrSum : globalDistribution[k];

      // Combine weights
      // w1 = 0.45, w2 = 0.45, w3 = 0.10
      const ensembleProbabilities: Record<number, number> = {};
      let sumProb = 0;
      for (const k of [4, 5, 6, 7]) {
        ensembleProbabilities[k] = 0.45 * markovPrior[k] + 0.45 * sigPrior[k] + 0.10 * meanReversionPrior[k];
        sumProb += ensembleProbabilities[k];
      }

      // Normalize
      for (const k of [4, 5, 6, 7]) {
        ensembleProbabilities[k] = sumProb > 0 ? ensembleProbabilities[k] / sumProb : globalDistribution[k];
      }

      // Find winner
      let predictedCount = 6;
      let maxProb = 0;
      for (const k of [4, 5, 6, 7]) {
        if (ensembleProbabilities[k] > maxProb) {
          maxProb = ensembleProbabilities[k];
          predictedCount = k;
        }
      }

      return { ensembleProbabilities, predictedCount };
    };

    // Run historical backtest of this ensemble model on the past (totalPeriods - 1) transitions
    let backtestTotalCount = 0;
    let backtestMatches = 0;
    const backtestStartIdx = Math.min(20, Math.floor(totalPeriods / 3));
    for (let i = backtestStartIdx; i < totalPeriods - 1; i++) {
      const actualNext = diversityHistory[i + 1];
      if (actualNext >= 4 && actualNext <= 7) {
        const { predictedCount: predC } = computeEnsemblePrediction(i);
        if (predC === actualNext) {
          backtestMatches++;
        }
        backtestTotalCount++;
      }
    }
    const backtestAccuracy = backtestTotalCount > 0 ? backtestMatches / backtestTotalCount : 0.42;

    // Latest Prediction
    const { ensembleProbabilities, predictedCount } = computeEnsemblePrediction(totalPeriods - 1);

    // Calculate Confidence Score
    let confidenceScore = 60.0;
    const matchedRule = zodiacMultiplicityRules.find(r => r.signature === currentSignature);
    if (matchedRule) {
      if (matchedRule.totalCount >= 15) confidenceScore += 15;
      else if (matchedRule.totalCount >= 5) confidenceScore += 8;
    }
    const topProb = ensembleProbabilities[predictedCount] || 0;
    if (topProb > 0.50) confidenceScore += 20;
    else if (topProb > 0.40) confidenceScore += 10;
    
    confidenceScore = Math.min(98.5, Math.max(30.0, confidenceScore));

    // Implications translation
    const implications: string[] = [];
    if (predictedCount === 4 || predictedCount === 5) {
      implications.push(`🎯 预计下期生肖去重数量较低（【${predictedCount}】种），代表生肖重叠聚集程度极高（大概率伴随 aa, bb 两双重叠或 aaa 三重叠特征）。`);
      implications.push(`🛡️ 杀肖策略建议：由于生肖覆盖面较窄，空闲（未开出）生肖数量较多（7-8个生肖不落子），在 Finder 2 (绝杀拦截) 中，推荐多维度重叠的绝杀方案，挂错风险历史最低，可以大胆提高绝杀拦截比例。`);
      implications.push(`🔥 胆码与重复策略：下期大概率会有 2 组以上的生肖发生精确重复落子，建议对当期的开奖生肖（尤其是本期已经重合的生肖 ${currentSignature === "无重叠" ? "平码" : "如重叠肖"}）进行重点防守和回补投注。`);
    } else if (predictedCount === 6) {
      implications.push(`🎯 预计下期生肖去重数量适中（【${predictedCount}】种），属于标准形态（大概率伴随 aa 单双重叠特征，其余 5 个号码为独立生肖）。`);
      implications.push(`🛡️ 杀肖策略建议：重叠情况保持在标准期望值，Finder 2 (绝杀拦截) 推荐使用平稳、平缓评分绝杀，可杀 2-3 个高置信度生肖，不宜极度扩大绝杀范围。`);
      const repeatVal = diversityRepeatRule["6"] ? diversityRepeatRule["6"].repeat_rate : 0.62;
      implications.push(`🔥 胆码与重复策略：历史在此状态下，下期重号概率约为 ${(repeatVal * 100).toFixed(1)}%，通常伴随 1 组生肖重复。推荐结合 Finder 3 (区间槽) 和 F5 (轨迹断层) 提取 1-2 个平码作为重复胆肖防守。`);
    } else {
      implications.push(`🎯 预计下期生肖去重数量极高（【${predictedCount}】种），属于全铺展形态（7个开奖号码完全分布在 7 个不同生肖，零重复，没有 aa 形态）。`);
      implications.push(`🛡️ 杀肖策略建议：由于开出生肖数量高达 7 个，未开出（杀肖空间）的生肖仅剩 5 个。在此环境下，绝杀策略容错空间极窄，极易挂错失误！建议本期大幅收敛杀肖肖数，或转为分散防守态势，优先采用“胆码定肖”而不是“绝杀拦截”。`);
      implications.push(`🔥 胆码与重复策略：去重生肖数达到 7 的情况下，下期极少出现重叠号码，生肖多样性极度开散。不推荐追本期任何重肖，平码推荐分散选择历史大漏、轨迹断层（F5）等待回补的温冷肖。`);
    }

    const diversity_prediction: DiversityPrediction = {
      currentDiversity,
      currentSignature,
      globalDistribution,
      globalDivCounts,
      transitionMatrix,
      recentDiversities,
      recentAverage,
      globalAverage,
      ensembleProbabilities,
      predictedCount,
      confidenceScore,
      implications,
      backtestAccuracy,
      backtestTotalCount
    };

    const lastRec = alignedRecords[alignedRecords.length - 1];
    const last_issue_data = lastRec ? {
      issue: lastRec.issue,
      date: lastRec.date,
      numbers: lastRec.numbers,
      zodiacs: zodiacMatrix[zodiacMatrix.length - 1],
      diversity: new Set(zodiacMatrix[zodiacMatrix.length - 1]).size
    } : null;

    return {
      total: totalPeriods,
      latest_issue: lastRec ? lastRec.issue : null,
      last_issue_data,
      rule1: rule1Report,
      rule1_pairs: rule1PairReport,
      diversity_repeat_rule: diversityRepeatRule,
      diversity_prediction,
      rule2_kills: singleCrossKills.slice(0, 20),
      rule3_report: rule3Report,
      top_special_expanded: specialExpanded.slice(0, 15),
      top_15_pairs: top15Pairs,
      bottom_15_pairs: bottom15Pairs,
      combo_linkage: [],
      reverse_trace: reverseTraceReport,
      trace_recovery: traceRecoveryMatrix,
      trace_recovery_hot: traceRecoveryHot,
      zodiac_score: zodiacScore,
      zodiac_ranking: ranking,
      rule1_triplets: rule1TripletReport,
      timeline: timelineReport,
      sequence_resonance: {
        count_resonance,
        zodiac_resonance
      },
      special_zodiac_bias: specialZodiacBias,
      zodiac_multiplicity_rules: zodiacMultiplicityRules
    };
  }

  // =========================================================================
  // Predictions Engine (Ported from generate_predictions.py)
  // =========================================================================
  public static generatePrediction(
    records: LotteryRecord[],
    report: AnalyzerReport,
    customBaseZodiac: string = "马",
    engineMode: "unified" | "dynamic" = "unified",
    customWeights?: {
      w1: number;
      w2: number;
      calibrationMethod?: "wma" | "kalman" | "none";
      calibrationWindow?: number;
      kalmanQ?: number;
      kalmanR?: number;
    }
  ): PredictionResult {
    const analyzer = new ZodiacPatternAnalyzer(customBaseZodiac, engineMode);
    const zodiacOrder = analyzer.zodiacOrder;
    const numToZodiac = analyzer.zodiacMap;

    const zodiacToNums: Record<string, number[]> = {};
    for (const z of zodiacOrder) zodiacToNums[z] = [];
    for (const [num, zName] of Object.entries(numToZodiac)) {
      const n = parseInt(num);
      if (zodiacToNums[zName]) {
        zodiacToNums[zName].push(n);
      }
    }

    const lastRecord = records[records.length - 1];
    const lastNums = lastRecord.numbers;
    
    let activeNumToZodiac = numToZodiac;
    if (engineMode === "dynamic" && lastRecord.archive_year !== undefined) {
      const lastBase = ZodiacPatternAnalyzer.getBaseZodiacByYear(lastRecord.archive_year);
      activeNumToZodiac = analyzer._getZodiacMap(lastBase);
    }

    const lastZList = lastNums.map(n => activeNumToZodiac[n] || "未知");
    const lastZSet = new Set(lastZList);
    const currentDiversity = lastZSet.size;

    let difficultyScore = 50;
    const evalReasons: string[] = [];

    // Reconstruct sequential zodiac matrix from records to feed into calibration
    const matrixForCalibration: string[][] = [];
    for (const rec of records) {
      const yr = rec.archive_year;
      let zm = numToZodiac;
      if (engineMode === "dynamic" && yr !== undefined && yr !== null) {
        const base = ZodiacPatternAnalyzer.getBaseZodiacByYear(yr);
        zm = analyzer._getZodiacMap(base);
      }
      matrixForCalibration.push(rec.numbers.map(n => zm[n] || "未知"));
    }

    const calibrationMethod = customWeights?.calibrationMethod || "wma";
    const calibrationWindow = customWeights?.calibrationWindow !== undefined ? customWeights.calibrationWindow : 15;
    const kalmanQ = customWeights?.kalmanQ !== undefined ? customWeights.kalmanQ : 0.01;
    const kalmanR = customWeights?.kalmanR !== undefined ? customWeights.kalmanR : 0.1;

    let calibratedRates: Record<string, number>;
    if (calibrationMethod === "kalman") {
      calibratedRates = ZodiacPatternAnalyzer.computeKalman(matrixForCalibration, zodiacOrder, kalmanQ, kalmanR);
      evalReasons.push(`【卡尔曼滤波模型校准】Q=${kalmanQ} / R=${kalmanR}，动态逼近各生肖最新概率密度，消除大样本量化偏差。`);
    } else if (calibrationMethod === "wma") {
      calibratedRates = ZodiacPatternAnalyzer.computeWMA(matrixForCalibration, zodiacOrder, calibrationWindow);
      evalReasons.push(`【加权移动平均模型校准】滑动窗口=${calibrationWindow} 期，采用时间衰减增益，优先对冲近期热度偏差。`);
    } else {
      calibratedRates = {};
      for (const z of zodiacOrder) calibratedRates[z] = 7 / 12; // default neutral probability
    }

    const WEIGHT_RULE1 = customWeights?.w1 !== undefined ? customWeights.w1 : 0.60;
    const WEIGHT_RULE2 = customWeights?.w2 !== undefined ? customWeights.w2 : 0.40;

    const zodiacMultipliers: Record<string, number> = {};
    for (const z of zodiacOrder) {
      // 动态模型偏振校准系数：初始乘数围绕其动态概率自适应浮动，平衡大盘偏差
      const rate = calibratedRates[z] !== undefined ? calibratedRates[z] : 7 / 12;
      zodiacMultipliers[z] = 0.8 + rate * 0.4; // 均值为 1.0 左右的偏振调节因子
    }

    const vetoKillers = new Set<string>();

    // =========================================================================
    // 【死穴绝杀】高精密过滤器插件 (Tier 3 Dynamic Weighted Penalty Filter Plugin)
    // 专门针对特定的历史错误模式，通过直感大盘反馈与多维负向共振，通过动态加权惩罚机制进行100%剔除
    // =========================================================================
    const killPluginPenalties: Record<string, number> = {};
    const totalRecordsCount = records.length;

    // 1. Calculate overall historical frequency in recent 50 periods (long-term trend)
    const longTermSlice = records.slice(-50);
    const longTermCounts: Record<string, number> = {};
    for (const z of zodiacOrder) longTermCounts[z] = 0;
    for (const rec of longTermSlice) {
      let zm = numToZodiac;
      if (engineMode === "dynamic" && rec.archive_year !== undefined) {
        const base = ZodiacPatternAnalyzer.getBaseZodiacByYear(rec.archive_year);
        zm = analyzer._getZodiacMap(base);
      }
      const recZSet = new Set(rec.numbers.map(n => zm[n] || "未知"));
      for (const z of zodiacOrder) {
        if (recZSet.has(z)) longTermCounts[z]++;
      }
    }

    // 2. Calculate consecutive omission and recent density
    for (const z of zodiacOrder) {
      let omission = 0;
      let consecutiveOpens = 0; // opened consecutively at the very end
      
      // Determine consecutive omission
      for (let i = totalRecordsCount - 1; i >= 0; i--) {
        const rec = records[i];
        let zm = numToZodiac;
        if (engineMode === "dynamic" && rec.archive_year !== undefined) {
          const base = ZodiacPatternAnalyzer.getBaseZodiacByYear(rec.archive_year);
          zm = analyzer._getZodiacMap(base);
        }
        const recZSet = new Set(rec.numbers.map(n => zm[n] || "未知"));
        if (recZSet.has(z)) {
          break;
        }
        omission++;
      }

      // Determine consecutive opens at the end
      for (let i = totalRecordsCount - 1; i >= 0; i--) {
        const rec = records[i];
        let zm = numToZodiac;
        if (engineMode === "dynamic" && rec.archive_year !== undefined) {
          const base = ZodiacPatternAnalyzer.getBaseZodiacByYear(rec.archive_year);
          zm = analyzer._getZodiacMap(base);
        }
        const recZSet = new Set(rec.numbers.map(n => zm[n] || "未知"));
        if (recZSet.has(z)) {
          consecutiveOpens++;
        } else {
          break;
        }
      }

      let penalty = 0.0;
      const reasons: string[] = [];

      // Historical Error Pattern A: 极端长冷温态冰封 (Extreme Deep Freeze Omission)
      // If omission is extremely high (>= 12 periods), it has entered a deep historical valley
      if (omission >= 12) {
        penalty += 0.35 + (omission - 12) * 0.05;
        reasons.push(`连续遗漏达 ${omission} 期进入长周期冰封带`);
      }

      // Historical Error Pattern B: 短周期高饱和度排斥 (Short-term High Satiety Repulsion)
      // If opened 3+ times in recent 5 periods, immediate recurrence probability is extremely low
      const recent5Recs = records.slice(-5);
      let openInLast5 = 0;
      for (const rec of recent5Recs) {
        let zm = numToZodiac;
        if (engineMode === "dynamic" && rec.archive_year !== undefined) {
          const base = ZodiacPatternAnalyzer.getBaseZodiacByYear(rec.archive_year);
          zm = analyzer._getZodiacMap(base);
        }
        const recZSet = new Set(rec.numbers.map(n => zm[n] || "未知"));
        if (recZSet.has(z)) openInLast5++;
      }
      if (openInLast5 >= 3) {
        penalty += 0.40;
        reasons.push(`近 5 期高频饱和开出 ${openInLast5} 次`);
      }

      // Historical Error Pattern C: 连庄重力引力衰减 (Immediate Double-Streak Attenuation)
      // If opened consecutively for 2+ periods, immediate third streak is extremely rare
      if (consecutiveOpens >= 2) {
        penalty += 0.50;
        reasons.push(`已连续开出 ${consecutiveOpens} 期，触及连庄极值衰退`);
      }

      // Historical Error Pattern D: 长期弱信号休眠 (Long-term Weak Signal Hibernation)
      // If total hits in recent 50 periods is extremely low (e.g. <= 2 hits, under 4% probability)
      const ltFreq = longTermCounts[z] / 50;
      if (longTermCounts[z] <= 2) {
        penalty += 0.30;
        reasons.push(`长期 (50期) 均值命中偏低至 ${(ltFreq*100).toFixed(1)}% 进入休眠态`);
      }

      if (penalty > 0) {
        killPluginPenalties[z] = Math.min(1.0, penalty);
        evalReasons.push(`【死穴绝杀过滤器】生肖【${z}】因 [${reasons.join(" 且 ")}] 累计叠加惩罚系数 ${penalty.toFixed(2)}`);
      }
    }

    // Apply the dynamic weighted penalty and enforce 100% exclusion for severely penalized zodiacs
    for (const z of zodiacOrder) {
      const penalty = killPluginPenalties[z] || 0.0;
      if (penalty > 0) {
        zodiacMultipliers[z] = (zodiacMultipliers[z] || 1.0) * (1.0 - penalty);
        // If cumulative penalty >= 0.45, enforce 100% absolute exclusion from recommendation
        if (penalty >= 0.45) {
          vetoKillers.add(z);
          evalReasons.push(`【死穴绝杀过滤器-100%剔除】生肖【${z}】满足高危负向共振，执行死穴绝对拦截，从推荐池 100% 强行绝杀！`);
        }
      }
    }

    // A. Scanner 1 (Big sample hot & cold, filtered by active state only)
    if (report.rule1) {
      for (const [condition, data] of Object.entries(report.rule1)) {
        const isActiveCondition = condition.startsWith(`当期多样性[${currentDiversity}种生肖]`) && Array.from(lastZSet).some(z => condition.includes(`【${z}】`));
        if (isActiveCondition) {
          for (const [z_hot, , pct] of data.hot || []) {
            zodiacMultipliers[z_hot] = (zodiacMultipliers[z_hot] || 1.0) + pct * WEIGHT_RULE1;
          }
          for (const [z_cold, , pct] of data.cold || []) {
            if (pct === 0) {
              zodiacMultipliers[z_cold] = (zodiacMultipliers[z_cold] || 1.0) - 0.5 * WEIGHT_RULE1;
            }
          }
        }
      }
    }

    // Dynamic repeat modifier
    if (currentDiversity <= 4) {
      for (const z of lastZSet) {
        if (zodiacMultipliers[z] !== undefined) {
          zodiacMultipliers[z] *= 1.15;
        }
      }
    } else if (currentDiversity >= 6) {
      for (const z of lastZSet) {
        if (zodiacMultipliers[z] !== undefined) {
          zodiacMultipliers[z] *= 0.80;
        }
      }
    }

    // B. Scanner 2 (100% kills)
    if (report.rule2_kills) {
      for (const item of report.rule2_kills) {
        if (lastZSet.has(item.curr) && item.prob === 0) {
          const killZ = item.kill;
          if (zodiacMultipliers[killZ] !== undefined) {
            zodiacMultipliers[killZ] *= (1.0 - WEIGHT_RULE2);
            vetoKillers.add(killZ);
          }
        }
      }
    }

    // C. Integrate finder scores (F1, F2, F3, F4, F4-Sub, F7) from zodiac_score
    if (report.zodiac_score) {
      for (const z of zodiacOrder) {
        const detail = report.zodiac_score[z];
        if (detail) {
          if (detail.score <= -3) {
            vetoKillers.add(z);
            const killReason = detail.reasons.find(r => r.includes("排除") || r.includes("绝杀") || r.includes("冰点") || r.includes("绝对")) || detail.reasons[0] || "多重交叉绝杀";
            evalReasons.push(`【死穴排除】生肖【${z}】因触发 [${killReason}] 积分低至 ${detail.score.toFixed(1)} 分，系统执行绝对绝杀拦截`);
            difficultyScore -= 3;
          } else {
            // Apply finder score as multiplier modifier: each +1 score gets +8% weight
            zodiacMultipliers[z] += detail.score * 0.08;
            if (detail.score >= 4) {
              const hotReason = detail.reasons.find(r => r.includes("利好") || r.includes("共振") || r.includes("热点")) || detail.reasons[0] || "多维热点共振";
              evalReasons.push(`【重磅主攻】生肖【${z}】因触发 [${hotReason}] 积分高达 +${detail.score.toFixed(1)} 分，本期推荐评分获得高阶赋能增益`);
              difficultyScore -= 2;
            }
          }
        }
      }
    }

    // D. Extract predicted count as metadata only, without altering core mathematical multipliers
    const predictedCount = report.diversity_prediction?.predictedCount ?? 6;
    evalReasons.push(`【AI去重数联动机制】下一期预计开奖生肖去重数：【${predictedCount}】种。采用只读观察哨，不干扰核心精算算法。`);

    const scores: Record<string, number> = {};
    for (const z of zodiacOrder) {
      if (vetoKillers.has(z)) {
        scores[z] = 0.0;
      } else {
        const mult = zodiacMultipliers[z] || 1.0;
        scores[z] = parseFloat((Math.max(0.0, mult) * 100).toFixed(2));
      }
    }

    const sortedZodiacs = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    
    // 极差自适应多阈值决策引擎 (Adaptive Spreading Multi-Threshold Classifier)
    // 告别机械的 4-4-4 平均均分，基于信号强度（对冲偏差）进行动态智能划分
    const tierHot: string[] = [];
    const tierMid: string[] = [];
    const tierKill: string[] = [];

    // 1. 提取否决 or 零分生肖
    const vetoed = sortedZodiacs.filter(x => vetoKillers.has(x[0]) || x[1] === 0).map(x => x[0]);
    const activeCandidates = sortedZodiacs.filter(x => !vetoKillers.has(x[0]) && x[1] > 0);

    if (activeCandidates.length > 0) {
      const maxScore = activeCandidates[0][1];
      const minScore = activeCandidates[activeCandidates.length - 1][1];
      const avgScore = activeCandidates.reduce((sum, item) => sum + item[1], 0) / activeCandidates.length;

      // 动态计算核心主攻门槛：必须超过 neutral 基础线 (100) 且距离最高分有足够的信噪比
      // 若极差大，则精细筛选；若极差小（说明信号弱），则保留绝对前 2-3 个
      const scoreSpread = maxScore - 100;
      let hotThreshold = 103.0;
      if (scoreSpread > 5) {
        hotThreshold = Math.max(103.0, maxScore - scoreSpread * 0.35);
      }

      // 绝杀底线过滤门槛 (低于 97 分或底部的负面生肖，表明其统计概率呈明显的偏振抑制)
      const killThreshold = 97.0;

      // 分档归属
      for (const [zodiac, score] of activeCandidates) {
        if (score >= hotThreshold) {
          tierHot.push(zodiac);
        } else if (score < killThreshold) {
          tierKill.push(zodiac);
        } else {
          tierMid.push(zodiac);
        }
      }

      // 边界弹性保护：防止由于数据分布极端导致某个分档为空
      // 保证主攻（核心精选）至少有 2 个生肖，且不超过 5 个生肖，确保决策凝聚度
      if (tierHot.length === 0) {
        tierHot.push(...activeCandidates.slice(0, 2).map(x => x[0]));
      } else if (tierHot.length > 5) {
        const excess = tierHot.slice(5);
        tierHot.length = 5;
        tierMid.unshift(...excess);
      }

      // 如果 tierHot 只有 1 个，且存在次席高分者，适度吸收第 2 个
      if (tierHot.length === 1 && activeCandidates.length > 1) {
        const secondZ = activeCandidates[1][0];
        const idx = tierMid.indexOf(secondZ);
        if (idx !== -1) {
          tierMid.splice(idx, 1);
          tierHot.push(secondZ);
        }
      }

      // 保证死穴排除在没有硬性否决的情况下，至少保留 2 个评分最低 of 满足条件的进行对冲
      if (tierKill.length < 2 && activeCandidates.length > tierHot.length + 1) {
        const needed = 2 - tierKill.length;
        const potentialKills = activeCandidates.slice(-needed).map(x => x[0]);
        for (const pk of potentialKills) {
          if (!tierHot.includes(pk)) {
            const mIdx = tierMid.indexOf(pk);
            if (mIdx !== -1) {
              tierMid.splice(mIdx, 1);
            }
            if (!tierKill.includes(pk)) {
              tierKill.push(pk);
            }
          }
        }
      }
    }

    tierKill.push(...vetoed);
    // 去重保证各个 tier 的不相交和完备性
    const finalKillSet = new Set(tierKill);
    const finalHotSet = new Set(tierHot);
    const finalMid = tierMid.filter(z => !finalKillSet.has(z) && !finalHotSet.has(z));
    
    tierMid.length = 0;
    tierMid.push(...finalMid);

    evalReasons.push(`【自适应分档定级】采用偏振极差自适应分级，动态识别出【${tierHot.length}】个重磅主攻、【${tierMid.length}】个稳健防守、【${tierKill.length}】个死穴排除，科学对冲了人工均分造成的虚假平衡。`);

    const latestIssueNum = report.latest_issue || lastRecord.issue;
    let nextIssue = "下一";
    try {
      nextIssue = (latestIssueNum + 1).toString().padStart(3, "0");
    } catch {
      nextIssue = "下一";
    }

    // Advanced dynamic 49-number recommendation engine
    const numberScores: Record<number, number> = {};
    for (let n = 1; n <= 49; n++) {
      const zName = activeNumToZodiac[n] || "未知";
      let score = scores[zName] || 50.0;
      
      // 1. Incorporate historical special-number bias (percentage)
      const specialBias = report.top_special_expanded?.find(item => item[0] === n);
      if (specialBias) {
        score += specialBias[1] * 0.25; // Boost up to 25 points based on historical bias
      }
      
      numberScores[n] = score;
    }

    // 2. Incorporate Rule 3 physics limit gaps if active
    const rangesConfig: Record<string, [number, number]> = {
      "0-9": [1, 9],
      "10-19": [10, 19],
      "20-29": [20, 29],
      "30-39": [30, 39],
      "40-49": [40, 49],
    };
    for (const [rLabel, [rMin, rMax]] of Object.entries(rangesConfig)) {
      const inRangeNums = lastNums.filter(n => n >= rMin && n <= rMax).sort((a, b) => a - b);
      if (inRangeNums.length === 2) {
        const n1 = inRangeNums[0];
        const n2 = inRangeNums[1];
        const slotsCount = n2 - n1 - 1;
        const r3Data = report.rule3_report ? report.rule3_report[rLabel] : null;
        if (r3Data && r3Data.slots && r3Data.slots[slotsCount]) {
          const sStat = r3Data.slots[slotsCount];
          const tot = sStat.total || 1;
          const inPct = sStat.in_range / tot;
          if (inPct >= 0.50) {
            for (let gapN = n1 + 1; gapN < n2; gapN++) {
              if (numberScores[gapN] !== undefined) {
                numberScores[gapN] += 15.0; // Boost gap numbers directly!
              }
            }
          }
        }
      }
    }

    // 3. Select hotNums and midNums based on tier lists
    const hotNums: number[] = [];
    for (const z of tierHot) {
      hotNums.push(...(zodiacToNums[z] || []));
    }
    const uniqueHotNums = Array.from(new Set(hotNums)).sort((a, b) => a - b);

    const midNums: number[] = [];
    for (const z of tierMid) {
      midNums.push(...(zodiacToNums[z] || []));
    }
    const uniqueMidNums = Array.from(new Set(midNums)).sort((a, b) => a - b);

    // 4. Generate premiumHotNums dynamically from highest-scoring hot numbers
    let premiumHotCandidates = uniqueHotNums;
    if (premiumHotCandidates.length === 0) {
      premiumHotCandidates = uniqueMidNums;
    }
    const premiumHotNums = premiumHotCandidates
      .map(n => ({ num: n, score: numberScores[n] || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(x => x.num)
      .sort((a, b) => a - b);

    // 5. Generate spaceCore dynamically from range 10-19 based on highest scores
    const candidates10to19 = Array.from({ length: 10 }, (_, i) => 10 + i);
    const spaceCore = candidates10to19
      .map(n => ({ num: n, score: numberScores[n] || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(x => x.num)
      .sort((a, b) => a - b);

    // Calculate difficulty and action advice
    if (report.diversity_repeat_rule && report.diversity_repeat_rule[currentDiversity]) {
      const currentDivRate = report.diversity_repeat_rule[currentDiversity].repeat_rate;
      if (currentDivRate >= 0.70 || currentDivRate <= 0.30) {
        difficultyScore -= 15;
        evalReasons.push(`【利好】跨年大底重复概率明显偏向极端（${(currentDivRate * 100).toFixed(1)}%），大底极其好防守`);
      } else {
        difficultyScore += 10;
        evalReasons.push(`【风险】重复概率极其接近50%生死线（${(currentDivRate * 100).toFixed(1)}%），去留极难拿捏`);
      }
    }

    let matchedR1 = false;
    if (report.rule1) {
      for (const [condition, data] of Object.entries(report.rule1)) {
        if (condition.startsWith(`当期多样性[${currentDiversity}种生肖]`) && Array.from(lastZSet).some(z => condition.includes(`【${z}】`))) {
          matchedR1 = true;
          const coldStr = (data.cold || []).filter(c => c[2] === 0).map(c => `【${c[0]}】`).join(", ");
          if (coldStr && (data.periods || 0) >= 3) {
            difficultyScore -= 10;
            evalReasons.push(`【利好】触发跨年单点形态硬过滤线，稳杀生肖 ${coldStr}`);
          }
        }
      }
    }

    let matchedPairR1 = false;
    const lastZListSorted = Array.from(lastZSet).sort();
    const pairs = ZodiacPatternAnalyzer.getCombinations(lastZListSorted, 2);
    for (const pair of pairs) {
      const pairCondKey = `(${currentDiversity}, ('${pair[0]}', '${pair[1]}'))`;
      if (report.rule1_pairs && report.rule1_pairs[pairCondKey]) {
        matchedPairR1 = true;
        const pData = report.rule1_pairs[pairCondKey];
        const pColdStr = (pData.cold || []).map(c => `【${c[0]}】`).join(", ");
        if (pColdStr && (pData.periods || 0) >= 2) {
          difficultyScore -= 15;
          evalReasons.push(`【强利好】触发跨年高阶联合排查硬杀铁律，联合锁定斩杀生肖 ${pColdStr}`);
        }
      }
    }

    if (!matchedR1 && !matchedPairR1) {
      difficultyScore += 15;
      evalReasons.push("【强风险】当前微观交叉与高阶联合排查均未命中任何历史形态，处于规则盲区");
    }

    let matchedR2 = false;
    if (report.rule2_kills) {
      for (const item of report.rule2_kills) {
        if (lastZSet.has(item.curr) && item.prob === 0 && item.trigger_p >= 3) {
          matchedR2 = true;
          difficultyScore -= 12;
          evalReasons.push(`【利好】触发跨期高频100%杀号过滤器，强制绝杀 【${item.kill}】`);
        }
      }
    }

    let matchedR3 = false;
    for (const [rLabel, [rMin, rMax]] of Object.entries(rangesConfig)) {
      const inRangeNums = lastNums.filter(n => n >= rMin && n <= rMax).sort((a, b) => a - b);
      if (inRangeNums.length === 2) {
        matchedR3 = true;
        const n1 = inRangeNums[0];
        const n2 = inRangeNums[1];
        const slotsCount = n2 - n1 - 1;
        const r3Data = report.rule3_report ? report.rule3_report[rLabel] : null;
        if (r3Data && r3Data.slots && r3Data.slots[slotsCount]) {
          const sStat = r3Data.slots[slotsCount];
          const tot = sStat.total || 1;
          const inPct = sStat.in_range / tot;
          const noPct = sStat.no_hit / tot;
          if (inPct >= 0.65 || noPct >= 0.65) {
            difficultyScore -= 10;
            evalReasons.push(`【利好】区间 [${rLabel}] 跨年物理卡槽约束力极强，方向极度凝聚`);
          }
        }
      }
    }

    if (!matchedR3) {
      difficultyScore += 8;
      evalReasons.push("【风险】无任何区间触发双号空间局限性");
    }

    // Number behavior rules collision warning
    const numBehaviorLookup: Record<number, any> = {};
    if (report.top_special_expanded) {
      for (const item of report.top_special_expanded) {
        numBehaviorLookup[item[0]] = item[5];
      }
    }

    const oddBiases: number[] = [];
    const bigBiases: number[] = [];
    for (const n of lastNums) {
      if (numBehaviorLookup[n]) {
        const bh = numBehaviorLookup[n];
        oddBiases.push(bh.odd_ratio);
        bigBiases.push(bh.big_ratio);
      }
    }

    if (oddBiases.length >= 2) {
      const maxO = Math.max(...oddBiases);
      const minO = Math.min(...oddBiases);
      if (maxO > 60.0 && minO < 40.0) {
        difficultyScore += 20;
        evalReasons.push(`【极度危险】特码特征规则库产生剧烈对冲！多组单双概率（最大${maxO}% vs 最小${minO}%）相互矛盾，极易引发生肖偏振`);
      }
    }

    difficultyScore = Math.max(10, Math.min(95, difficultyScore));

    let conclusion = "🟡【常规波动（平稳过渡期）】";
    let actionAdvice = "⚠️ 谨慎按部就班。小仓位严格遵循跨年高低频截尾圈防守。";

    if (difficultyScore >= 70) {
      conclusion = "❌【极难预测（混乱撕裂/数据对冲期）】";
      actionAdvice = "🛑 战略性空仓！当前跨年多重微观行为规则发生剧烈内耗与对冲，资金不建议进场硬碰硬。";
    } else if (difficultyScore <= 40) {
      conclusion = "🟢【极易拦截（特征高聚能共振期）】";
      actionAdvice = "🎯 黄金出击时刻！单点/高阶联合特征与跨期绝杀线在大样本下产生多重锁死共振，防线极其稳固！";
    }

    return {
      nextIssue,
      latestIssue: latestIssueNum,
      lastNums,
      lastZocs: lastZList, // compatibility mapping if needed but standard lastZodiacs is returned below
      lastZodiacs: lastZList,
      currentDiversity,
      predictedCount,
      tierHot,
      tierMid,
      tierKill,
      scores,
      premiumHotNums,
      hotNums: uniqueHotNums,
      spaceCore,
      midNums: uniqueMidNums,
      difficultyScore,
      conclusion,
      actionAdvice,
      evalReasons,
      calibration: {
        method: calibrationMethod,
        windowSize: calibrationWindow,
        q: kalmanQ,
        r: kalmanR,
        rates: calibratedRates
      }
    };
  }

  public static computeWMA(
    zodiacMatrix: string[][],
    zodiacOrder: string[],
    windowSize: number = 15
  ): Record<string, number> {
    const results: Record<string, number> = {};
    const n = zodiacMatrix.length;
    const w = Math.min(windowSize, n);
    if (w <= 0) {
      for (const z of zodiacOrder) results[z] = 0;
      return results;
    }

    let denom = 0;
    for (let i = 1; i <= w; i++) denom += i;

    for (const z of zodiacOrder) {
      let sum = 0;
      for (let i = 0; i < w; i++) {
        const drawIdx = n - w + i;
        const hasZ = zodiacMatrix[drawIdx].includes(z) ? 1 : 0;
        sum += (i + 1) * hasZ;
      }
      results[z] = sum / denom;
    }
    return results;
  }

  public static computeKalman(
    zodiacMatrix: string[][],
    zodiacOrder: string[],
    q: number = 0.01,
    r: number = 0.1
  ): Record<string, number> {
    const results: Record<string, number> = {};
    const n = zodiacMatrix.length;

    for (const z of zodiacOrder) {
      let x = 0.5; // initial state (prior probability)
      let p = 1.0; // initial covariance
      for (let i = 0; i < n; i++) {
        p = p + q; // prediction step (P = P + Q)
        const y = zodiacMatrix[i].includes(z) ? 1 : 0; // measurement
        const k = p / (p + r); // update gain (K = P / (P + R))
        x = x + k * (y - x); // state update (x = x + K * (y - x))
        p = (1 - k) * p; // covariance update (P = (1 - K) * P)
      }
      results[z] = Math.max(0, Math.min(1, x));
    }
    return results;
  }
}
