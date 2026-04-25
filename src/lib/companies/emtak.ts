import emtakData from "./emtak-2025.json";
import type { EmtakRecord } from "./types";

const data = emtakData as {
  source: string;
  verifiedAt: string;
  records: EmtakRecord[];
};

export const EMTAK_SOURCE = data.source;
export const EMTAK_VERIFIED_AT = data.verifiedAt;
export const EMTAK_RECORDS: EmtakRecord[] = data.records;

export function findEmtakRecord(code: string): EmtakRecord | null {
  const normalizedCode = code.trim();
  return EMTAK_RECORDS.find((record) => record.code === normalizedCode) ?? null;
}

export function assertEmtakRecord(code: string): EmtakRecord {
  const record = findEmtakRecord(code);
  if (!record) {
    throw new Error("Choose a valid EMTAK activity.");
  }

  return record;
}
