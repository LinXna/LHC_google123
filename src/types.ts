export interface LotteryRecord {
  issue: number;
  date: string;
  numbers: number[];
  archive_year?: number;
}

export interface HotColdZodiac {
  zodiac: string;
  count: number;
  percentage: number;
}

export interface Rule1ReportItem {
  periods: number;
  morphology: string;
  hot: [string, number, number][]; // [zodiac, count, percentage]
  cold: [string, number, number][]; // [zodiac, count, percentage]
}

export interface Rule1PairItem {
  periods: number;
  hot: [string, number, number][];
  cold: [string, number, number][];
}

export interface DiversityRepeatItem {
  total_occur: number;
  repeat_rate: number;
  repeat_counts: Record<string, number>;
}

export interface Rule2KillItem {
  curr: string;
  kill: string;
  prob: number;
  trigger_p: number;
}

export interface SlotStat {
  total: number;
  in_range: number;
  out_greater: number;
  out_less: number;
  no_hit: number;
  next_z_hot?: [string, number][]; // 槽位限位关联的下期最热生肖
  next_z_kills?: string[];         // 槽位限位下期绝对绝杀生肖 (0% 概率)
}

export interface Rule3RangeItem {
  periods_with_two: number;
  num_count_distribution: Record<string, number>;
  slots: Record<string, SlotStat>;
}

export interface SpecialNumBehavior {
  odd_ratio: number;
  big_ratio: number;
  hot_tails: string[];
}

export type SpecialNumRecord = [
  number, // num
  number, // score
  number, // b_rate
  string, // most_z
  number, // app_times
  SpecialNumBehavior // behavior
];

export interface TraceRecoveryItem {
  trigger: number;
  recover: number;
  rate: number;
  catalysts?: {
    zodiac_companion: [string, number][]; // 伴生催化剂生肖 (断层那一期高频出现的生肖及频次)
    diversity_distribution: Record<number, number>; // 断层那一期的多样性数量分布
  };
}

export interface TraceRecoveryHotItem {
  samples: number;
  hot: [string, number, number][]; // [zodiac, count, percentage]
}

export interface TimelineData {
  trigger: number;
  return: number;
  return_rate: number;
}

export interface TimelineReport {
  prev_miss_return?: Record<string, TimelineData>;
  double_keep_break?: Record<string, TimelineData>;
  gap_return?: Record<string, TimelineData>;
  gap_finish?: Record<string, TimelineData>;
}

export interface ZodiacScoreDetail {
  score: number;
  reasons: string[];
  confidence: number;
}

export interface AnalyzerReport {
  total: number;
  latest_issue: number | null;
  last_issue_data?: {
    issue: number;
    date: string;
    numbers: number[];
    zodiacs: string[];
    diversity: number;
  } | null;
  rule1: Record<string, Rule1ReportItem>;
  rule1_pairs: Record<string, Rule1PairItem>;
  diversity_repeat_rule: Record<string, DiversityRepeatItem>;
  rule2_kills: Rule2KillItem[];
  rule3_report: Record<string, Rule3RangeItem>;
  top_special_expanded: SpecialNumRecord[];
  top_15_pairs: [string, number, number][];
  bottom_15_pairs: [string, number, number][];
  combo_linkage: any[];
  reverse_trace: any[];
  trace_recovery: Record<string, Record<string, TraceRecoveryItem>>;
  trace_recovery_hot: Record<string, TraceRecoveryHotItem>;
  zodiac_score: Record<string, ZodiacScoreDetail>;
  zodiac_ranking: [string, ZodiacScoreDetail][];
  rule1_triplets: Record<string, Rule1PairItem>;
  timeline: TimelineReport;
  sequence_resonance?: {
    count_resonance: SequentialMatchItem[];
    zodiac_resonance: SequentialMatchItem[];
  };
  special_zodiac_bias?: SpecialZodiacBiasRecord[];
  zodiac_multiplicity_rules?: ZodiacMultiplicityRule[];
}

export interface ZodiacMultiplicityRule {
  signature: string;
  label: string;
  totalCount: number;
  rate: number;
  nextDiversityDistribution: Record<number, number>;
  nextRepeatRate: number;
  hottestZodiacs: [string, number, number][]; // [zodiac, count, percentage]
  coolestZodiacs: [string, number, number][]; // [zodiac, count, percentage]
}

export interface SpecialZodiacBiasRecord {
  zodiac: string;
  matchesCount: number;
  nextZodiacPercentages: Record<string, number>;
  nextZodiacKills: string[];
  hotZodiacs: [string, number][];
}

export interface SequentialMatchItem {
  depth: number;
  patternType: "count" | "zodiac";
  patternLabel: string;
  matchesCount: number;
  nextZodiacCounts: Record<string, number>;
  nextZodiacKills: string[];
  nextZodiacPercentages: Record<string, number>;
}

export interface PredictionResult {
  nextIssue: string;
  latestIssue: number;
  lastNums: number[];
  lastZodiacs: string[];
  currentDiversity: number;
  tierHot: string[];
  tierMid: string[];
  tierKill: string[];
  scores: Record<string, number>;
  premiumHotNums: number[];
  hotNums: number[];
  spaceCore: number[];
  midNums: number[];
  difficultyScore: number;
  conclusion: string;
  actionAdvice: string;
  evalReasons: string[];
  calibration?: {
    method: string;
    windowSize?: number;
    q?: number;
    r?: number;
    rates: Record<string, number>;
  };
}
