import { ReconciliationResult, Transaction } from "./types";
import { differenceInDays } from "date-fns";

export const reconcile = (
  lhv: Transaction[],
  smartAccounts: Transaction[],
): ReconciliationResult => {
  const unmatchedLhv = [...lhv];
  const unmatchedSa = [...smartAccounts];
  let matchedCount = 0;

  // Simple greedy matching
  // Sort both arrays by amount or time first?
  // Let's just iterate and find best match (same amount, very close date)

  for (let i = unmatchedLhv.length - 1; i >= 0; i--) {
    const lTx = unmatchedLhv[i];

    // Find closest match in SA: exact same amount, date diff within 3 days
    let bestMatchIdx = -1;
    let bestDateDiff = Infinity;

    for (let j = 0; j < unmatchedSa.length; j++) {
      const sTx = unmatchedSa[j];

      // Strict equality on amount is usually required, but signs might be inverted?
      // Let's assume standard formatting where both are negative or both are positive for the same event
      if (Math.abs(lTx.amount) === Math.abs(sTx.amount)) {
        // Amount matches or is inverse
        const dateDiff = Math.abs(differenceInDays(lTx.date, sTx.date));
        if (dateDiff <= 3 && dateDiff < bestDateDiff) {
          bestMatchIdx = j;
          bestDateDiff = dateDiff;
        }
      }
    }

    if (bestMatchIdx !== -1) {
      // It's a match!
      unmatchedSa.splice(bestMatchIdx, 1);
      unmatchedLhv.splice(i, 1);
      matchedCount++;
    }
  }

  const lhvTotal = lhv.reduce((sum, tx) => sum + tx.amount, 0);
  const smartAccountsTotal = smartAccounts.reduce(
    (sum, tx) => sum + tx.amount,
    0,
  );

  return {
    lhvTotal,
    smartAccountsTotal,
    balanceDifference: lhvTotal - smartAccountsTotal, // Rough estimate, may need sign adjust
    missingInSmartAccounts: unmatchedLhv,
    missingInLHV: unmatchedSa,
    matchedCount,
  };
};
