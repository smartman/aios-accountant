import Papa from "papaparse";
import { parse } from "date-fns";
import { Transaction } from "./types";

// Helper to find a matching column from a row given some keywords
const findColumn = (
  row: Record<string, unknown>,
  keywords: string[],
): string | undefined => {
  const keys = Object.keys(row);
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    if (keywords.some((kw) => lowerKey.includes(kw))) {
      return key;
    }
  }
  return undefined;
};

// Extremely naive date parser for varying formats
const parseFlexibleDate = (dateStr: string): Date => {
  if (!dateStr) return new Date(NaN);

  // Try DD.MM.YYYY
  if (dateStr.match(/^\d{2}\.\d{2}\.\d{4}/)) {
    return parse(dateStr.substring(0, 10), "dd.MM.yyyy", new Date());
  }
  // Try YYYY-MM-DD
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
    return new Date(dateStr.substring(0, 10));
  }

  return new Date(dateStr);
};

export const parseCSV = async (
  file: File,
  source: "LHV" | "SmartAccounts",
): Promise<Transaction[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const transactions: Transaction[] = [];

        for (const row of results.data as Record<string, unknown>[]) {
          // Identify columns
          const dateCol = findColumn(row, ["date", "kuupäev", "aeg"]);
          const amountCol = findColumn(row, [
            "amount",
            "summa",
            "credit",
            "debit",
          ]);
          const descCol = findColumn(row, [
            "description",
            "selgitus",
            "details",
            "name",
            "nimi",
            "saaja",
          ]);

          if (dateCol && amountCol && row[amountCol]) {
            // Clean amount - remove spaces and convert comma to dot
            const rawAmount = String(row[amountCol])
              .replace(/\s/g, "")
              .replace(",", ".");
            const amount = parseFloat(rawAmount);

            // Only add valid numbers (some rows might be summaries)
            if (!isNaN(amount)) {
              transactions.push({
                date: parseFlexibleDate(String(row[dateCol] ?? "")),
                amount: amount,
                description: descCol ? String(row[descCol]) : "Unknown",
                source,
                originalRow: row,
              });
            }
          }
        }
        resolve(transactions);
      },
      error: (error) => {
        reject(error);
      },
    });
  });
};
