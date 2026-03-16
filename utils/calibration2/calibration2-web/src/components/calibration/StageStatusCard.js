"use client";

export default function StageStatusCard({
  state,
  outputPath,
  fallbackStatus,
  computedSummary,
  outputDetails,
  outputDetailsLoading,
  onLoadOutputDetails,
  downloadHref,
}) {
  const effectiveLogs = (state?.logs && state.logs.length)
    ? state.logs
    : [fallbackStatus || "No logs yet"];

  const hasPreviewJson = outputDetails?.previewJson && typeof outputDetails.previewJson === "object";
  const hasTextPreview = Boolean(outputDetails?.textPreview);
  const sizeLabel = typeof outputDetails?.sizeBytes === "number"
    ? `${(outputDetails.sizeBytes / 1024).toFixed(1)} KB`
    : "n/a";

  return (
    <div className="space-y-2 rounded border border-zinc-700 p-3">
      <div className="flex items-center justify-between text-xs">
        <span>Status: {state?.status || "idle"}</span>
        <span>Progress: {state?.progress || 0}%</span>
      </div>
      <div className="h-2 rounded bg-zinc-800">
        <div className="h-2 rounded bg-cyan-500" style={{ width: `${state?.progress || 0}%` }} />
      </div>
      <pre className="max-h-40 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">
        {effectiveLogs.slice(-120).join("\n")}
      </pre>

      {computedSummary ? (
        <div className="space-y-1 rounded border border-zinc-800 bg-zinc-950 p-2">
          <div className="text-[11px] text-zinc-400">Computed result summary</div>
          <pre className="max-h-36 overflow-auto text-[11px] text-zinc-300">{JSON.stringify(computedSummary, null, 2)}</pre>
        </div>
      ) : null}

      {outputPath ? (
        <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950 p-2">
          <p className="text-xs text-zinc-400 break-all">Output: {outputPath}</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onLoadOutputDetails}
              disabled={outputDetailsLoading}
              className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-40"
            >
              {outputDetailsLoading ? "Loading preview..." : outputDetails ? "Refresh Preview" : "Load Preview"}
            </button>
            {downloadHref ? (
              <a
                href={downloadHref}
                className="rounded border border-emerald-700 bg-emerald-900/30 px-2 py-1 text-xs hover:bg-emerald-800/40"
              >
                Download Output
              </a>
            ) : null}
          </div>

          {outputDetails?.error ? (
            <p className="text-xs text-rose-300">{outputDetails.error}</p>
          ) : outputDetails ? (
            <>
              <div className="text-[11px] text-zinc-400">
                File: {outputDetails.fileName || "n/a"} | Type: {outputDetails.extension || "n/a"} | Size: {sizeLabel}
              </div>
              {outputDetails.isBinary ? (
                <p className="text-[11px] text-zinc-400">Binary file preview is not shown. Use Download Output.</p>
              ) : hasPreviewJson ? (
                <pre className="max-h-48 overflow-auto rounded border border-zinc-800 p-2 text-[11px] text-zinc-300">
                  {JSON.stringify(outputDetails.previewJson, null, 2)}
                </pre>
              ) : hasTextPreview ? (
                <pre className="max-h-48 overflow-auto rounded border border-zinc-800 p-2 text-[11px] text-zinc-300">
                  {outputDetails.textPreview}
                </pre>
              ) : (
                <p className="text-[11px] text-zinc-400">No preview available.</p>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
