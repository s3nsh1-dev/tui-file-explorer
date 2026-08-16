const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

/**
 * Human-readable file size, kept narrow because it shares a row with the
 * filename and every cell it takes is a cell the name loses.
 *
 * One decimal below 100, none above — "3.1 KB" is useful, "999.4 KB" is just
 * wider. Caps at 8 cells for any plausible size, asserted in the tests.
 */
export const formatSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const label = UNITS[unit] ?? 'B';
  if (unit === 0) return `${String(Math.round(value))} ${label}`;
  return value < 100 ? `${value.toFixed(1)} ${label}` : `${String(Math.round(value))} ${label}`;
};
