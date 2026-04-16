import { MeritUnit } from "../../accounting-provider-types";

export function normalizeMeritUnitLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function meritUnitAliases(value: string | undefined): string[] {
  const normalized = value ? normalizeMeritUnitLabel(value) : "";
  if (!normalized) {
    return [];
  }

  const pieceAliases = ["pc", "pcs", "piece", "pieces", "tk", "unit", "units"];
  const hourAliases = ["h", "hr", "hrs", "hour", "hours", "tund", "tundi"];
  const monthAliases = ["month", "months", "kuu", "kuud"];
  const literAliases = ["l", "liter", "liters", "litre", "litres", "ltr"];

  if (pieceAliases.includes(normalized)) {
    return pieceAliases;
  }
  if (hourAliases.includes(normalized)) {
    return hourAliases;
  }
  if (monthAliases.includes(normalized)) {
    return monthAliases;
  }
  if (literAliases.includes(normalized)) {
    return literAliases;
  }

  return [normalized];
}

export function selectMeritUnitName(
  units: MeritUnit[],
  requestedUnit: string | undefined,
): string | null {
  const aliases = meritUnitAliases(requestedUnit);
  if (!aliases.length) {
    return null;
  }

  const normalizedUnits = units.map((unit) => ({
    name: unit.name,
    normalizedCode: normalizeMeritUnitLabel(unit.code),
    normalizedName: normalizeMeritUnitLabel(unit.name),
  }));

  for (const alias of aliases) {
    const match = normalizedUnits.find(
      (unit) => unit.normalizedCode === alias || unit.normalizedName === alias,
    );
    if (match) {
      return match.name;
    }
  }

  return null;
}
