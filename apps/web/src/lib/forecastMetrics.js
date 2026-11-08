// Older runs saved planning-period pairs without their aggregate R². Recompute
// from the complete saved test, never from the separate next-day holdout score.
export function historicalFitScore(validation) {
  if (Number.isFinite(validation?.model?.r2)) return validation.model.r2;
  const windows = validation?.windows;
  if (!Array.isArray(windows) || windows.length < 2 || validation.window_count !== windows.length) return null;
  if (windows.some(row => !Number.isFinite(row?.actual_recorded_units) || !Number.isFinite(row?.predicted_units))) return null;
  const mean = windows.reduce((sum, row) => sum + row.actual_recorded_units, 0) / windows.length;
  const variance = windows.reduce((sum, row) => sum + (row.actual_recorded_units - mean) ** 2, 0);
  if (variance === 0) return null;
  const squaredError = windows.reduce((sum, row) => sum + (row.predicted_units - row.actual_recorded_units) ** 2, 0);
  const score = 1 - squaredError / variance;
  return Number.isFinite(score) ? score : null;
}
