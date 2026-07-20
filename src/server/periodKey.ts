import { LotteryRecord } from "../types.js";

const PERIOD_MULTIPLIER = 1000;

/**
 * Returns a sortable, cross-year unique id while preserving the raw issue for UI.
 * Historical issue numbers restart from 1 every year, so `issue` alone is not a
 * safe repository/cache/model key.
 */
export function getPeriodId(record: Pick<LotteryRecord, "issue" | "date" | "archive_year" | "periodId">): number {
  if (Number.isSafeInteger(record.periodId) && (record.periodId as number) > 0) {
    return record.periodId as number;
  }

  const dateYear = record.date ? Number.parseInt(record.date.slice(0, 4), 10) : Number.NaN;
  const year = Number.isInteger(record.archive_year)
    ? record.archive_year as number
    : dateYear;

  if (!Number.isInteger(year) || year <= 0) {
    return record.issue;
  }
  if (!Number.isInteger(record.issue) || record.issue < 0 || record.issue >= PERIOD_MULTIPLIER) {
    throw new Error(`期号超出唯一周期键范围: ${record.issue}`);
  }

  return year * PERIOD_MULTIPLIER + record.issue;
}

/** A small deterministic fingerprint used to isolate feature caches by dataset. */
export function getDatasetSignature(records: LotteryRecord[]): string {
  let hash = 2166136261;
  for (const record of records) {
    const values = [getPeriodId(record), ...record.numbers];
    for (const value of values) {
      hash ^= value;
      hash = Math.imul(hash, 16777619);
    }
  }
  return `${records.length}-${(hash >>> 0).toString(16)}`;
}
