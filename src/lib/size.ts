/** 141 The size a phone sent for a layer or a region, or null where it sent none or holds nothing yet. */
export function heldSize(bytes: number | undefined): string | null {
  return bytes != null && bytes > 0 ? sizeText(bytes) : null;
}

/** A byte count as a person reads it: 263 MB, 5.3 MB, 1.5 GB. */
export function sizeText(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${unit === 0 ? Math.round(value) : value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
