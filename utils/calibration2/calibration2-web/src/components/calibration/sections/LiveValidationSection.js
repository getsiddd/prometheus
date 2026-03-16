"use client";

export default function LiveValidationSection({ data, actions }) {
  const {
    latestCalibrationYamlPath,
    validationStatus,
    validationPairs,
    validationResult,
  } = data;

  const {
    setLatestCalibrationYamlPath,
    runLiveValidation,
    clearValidationPairs,
  } = actions;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
      <h2 className="text-xl font-semibold">Live Validation: Pixel ↔ World Accuracy</h2>
      <p className="text-xs text-zinc-400">
        Real-world test flow: capture snapshot, switch to Validation pick mode, add known test points, run validation, then review world and reprojection errors.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-xs">Calibration YAML Path
            <input value={latestCalibrationYamlPath} onChange={(e) => setLatestCalibrationYamlPath(e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button onClick={runLiveValidation} className="rounded border border-emerald-700 bg-emerald-900/40 px-3 py-2 text-sm hover:bg-emerald-800/50">Run Live Validation</button>
            <button onClick={clearValidationPairs} className="rounded border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800">Clear Validation Points</button>
          </div>
          <p className="text-xs text-zinc-300">{validationStatus}</p>
        </div>
        <div className="space-y-2 rounded border border-zinc-700 p-3 text-xs">
          <div>Validation points: {validationPairs.length}</div>
          <div>Samples used: {validationResult?.sample_count ?? 0}</div>
          <div>World mean error (m): {typeof validationResult?.metrics?.world_error?.mean === "number" ? validationResult.metrics.world_error.mean.toFixed(4) : "n/a"}</div>
          <div>World RMSE (m): {typeof validationResult?.metrics?.world_error?.rmse === "number" ? validationResult.metrics.world_error.rmse.toFixed(4) : "n/a"}</div>
          <div>World max error (m): {typeof validationResult?.metrics?.world_error?.max === "number" ? validationResult.metrics.world_error.max.toFixed(4) : "n/a"}</div>
          <div>Reprojection mean (px): {typeof validationResult?.metrics?.reprojection_error_px?.mean === "number" ? validationResult.metrics.reprojection_error_px.mean.toFixed(2) : "n/a"}</div>
          <div>Reprojection RMSE (px): {typeof validationResult?.metrics?.reprojection_error_px?.rmse === "number" ? validationResult.metrics.reprojection_error_px.rmse.toFixed(2) : "n/a"}</div>
          <div>Reprojection max (px): {typeof validationResult?.metrics?.reprojection_error_px?.max === "number" ? validationResult.metrics.reprojection_error_px.max.toFixed(2) : "n/a"}</div>
        </div>
      </div>
      {validationResult?.details?.length ? (
        <pre className="max-h-48 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">
          {JSON.stringify(validationResult.details.slice(0, 20), null, 2)}
        </pre>
      ) : null}
    </section>
  );
}
