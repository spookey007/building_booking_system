export function formatUnitLabel(towerCode: string, unitNo: string, prefix?: string | null) {
  const tower = towerCode.trim().toUpperCase();
  const displayPrefix = (prefix ?? "").trim().toUpperCase();
  const unit = unitNo.trim().toUpperCase();
  const lead = displayPrefix || tower;
  if (!lead) return unit;
  if (!unit) return lead;
  return `${lead}-${unit}`;
}

export function normalizeUnitNoForStorage(towerCode: string, rawUnitNo: string, prefix?: string | null) {
  const tower = towerCode.trim().toUpperCase();
  const displayPrefix = (prefix ?? "").trim().toUpperCase();
  const value = rawUnitNo.trim().toUpperCase().replace(/\s+/g, "");
  const lead = displayPrefix || tower;
  if (!lead || !value) return value;

  // Accept uploads like A101, A-101, SF101, SF-101 and strip when
  // the value starts with the active display prefix (prefix or tower code).
  if (value.startsWith(`${lead}-`)) {
    return value.slice(lead.length + 1);
  }
  if (value.startsWith(lead)) {
    return value.slice(lead.length);
  }
  return value;
}
