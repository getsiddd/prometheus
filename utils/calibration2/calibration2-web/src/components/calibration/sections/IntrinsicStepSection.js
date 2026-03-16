"use client";

export default function IntrinsicStepSection({ data, actions, refs, renderStageStatus }) {
  const {
    intrinsicAllowed,
    intrinsicSessionId,
    checkerboard,
    squareSize,
    checkerboardSquareMm,
    checkerboardPdfStatus,
    stageOutputIntrinsic,
    intrinsicSampleCount,
    minSamples,
    intrinsicStatus,
    intrinsicsPath,
    intrinsicSolveResult,
    intrinsicDownloadHref,
    intrinsicSamples,
    intrinsicActiveIndex,
    sourceMode,
    feedEnabled,
    liveFeedSrc,
    snapshotDataUrl,
    jobLoading,
    sequenceRunning,
  } = data;

  const {
    setIntrinsicSessionId,
    setCheckerboard,
    setSquareSize,
    setCheckerboardSquareMm,
    setStageOutput,
    captureIntrinsicSample,
    solveIntrinsicWeb,
    runStageCard,
    setIntrinsicActiveIndex,
    deleteIntrinsicSample,
    loadIntrinsicSamples,
    downloadCheckerboardPdf,
    downloadIntrinsicSummary,
    onFeedError,
    clearFeedError,
  } = actions;

  const { intrinsicVideoRef } = refs;
  const K = intrinsicSolveResult?.K;
  const D = intrinsicSolveResult?.D;
  const fx = typeof K?.[0]?.[0] === "number" ? K[0][0] : null;
  const fy = typeof K?.[1]?.[1] === "number" ? K[1][1] : null;
  const cx = typeof K?.[0]?.[2] === "number" ? K[0][2] : null;
  const cy = typeof K?.[1]?.[2] === "number" ? K[1][2] : null;
  const validImageCount = Number.isFinite(intrinsicSolveResult?.validImageCount)
    ? intrinsicSolveResult.validImageCount
    : Number.isFinite(intrinsicSolveResult?.valid_image_count)
      ? intrinsicSolveResult.valid_image_count
      : null;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
      <h2 className="text-xl font-semibold">Step 1: Intrinsic Calibration</h2>
      {!intrinsicAllowed ? <p className="text-xs text-amber-300">Complete previous stage first.</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs">Session ID
              <input value={intrinsicSessionId} onChange={(e) => setIntrinsicSessionId(e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm" />
            </label>
            <label className="text-xs">Checkerboard
              <input value={checkerboard} onChange={(e) => setCheckerboard(e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm" />
            </label>
            <label className="text-xs">Square (m)
              <input type="number" step="0.001" value={squareSize} onChange={(e) => setSquareSize(Number(e.target.value))} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm" />
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs">Print Square (mm)
              <input type="number" min={5} step="1" value={checkerboardSquareMm} onChange={(e) => setCheckerboardSquareMm(Number(e.target.value))} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm" />
            </label>
            <div className="sm:col-span-2 flex items-end">
              <button onClick={downloadCheckerboardPdf} className="rounded border border-emerald-700 bg-emerald-900/40 px-3 py-2 text-sm hover:bg-emerald-800/50">
                Download A3 Landscape Checkerboard PDF
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-400">{checkerboardPdfStatus}</p>
          <label className="block text-xs">Stage Output Path
            <input value={stageOutputIntrinsic || ""} onChange={(e) => setStageOutput("intrinsic", e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button onClick={captureIntrinsicSample} className="rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm hover:bg-blue-800/50">Capture Sample</button>
            {intrinsicSampleCount >= minSamples ? (
              <button onClick={solveIntrinsicWeb} className="rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm hover:bg-blue-800/50">Solve Intrinsic</button>
            ) : null}
            <button
              disabled={jobLoading || sequenceRunning || !intrinsicAllowed}
              onClick={() => runStageCard("intrinsic")}
              className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-sm hover:bg-cyan-800/50 disabled:opacity-40"
            >
              Run Intrinsic Stage
            </button>
          </div>
          <p className="text-xs text-zinc-300">{intrinsicStatus} (Samples: {intrinsicSampleCount}/{minSamples})</p>
          <p className="text-xs text-zinc-400 break-all">Intrinsics: {intrinsicsPath || "not solved yet"}</p>
          {intrinsicSolveResult ? (
            <div className="rounded border border-zinc-700 p-3 space-y-2 text-xs">
              <div className="text-zinc-300 font-medium">Solved intrinsic parameters</div>
              <div className="grid gap-1 sm:grid-cols-2">
                <div>RMS: {typeof intrinsicSolveResult?.rms === "number" ? intrinsicSolveResult.rms.toFixed(4) : "n/a"}</div>
                <div>Valid images: {Number.isFinite(validImageCount) ? validImageCount : "n/a"}</div>
                <div>fx: {typeof fx === "number" ? fx.toFixed(3) : "n/a"}</div>
                <div>fy: {typeof fy === "number" ? fy.toFixed(3) : "n/a"}</div>
                <div>cx: {typeof cx === "number" ? cx.toFixed(3) : "n/a"}</div>
                <div>cy: {typeof cy === "number" ? cy.toFixed(3) : "n/a"}</div>
              </div>
              {Array.isArray(K) ? (
                <div className="space-y-1">
                  <div className="text-zinc-400">K matrix</div>
                  <pre className="max-h-28 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">{JSON.stringify(K, null, 2)}</pre>
                </div>
              ) : null}
              {Array.isArray(D) ? (
                <div className="space-y-1">
                  <div className="text-zinc-400">D matrix / coefficients</div>
                  <pre className="max-h-24 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">{JSON.stringify(D, null, 2)}</pre>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {intrinsicDownloadHref ? (
                  <a
                    href={intrinsicDownloadHref}
                    className="rounded border border-emerald-700 bg-emerald-900/30 px-2 py-1 text-xs hover:bg-emerald-800/40"
                  >
                    Download Intrinsics NPZ
                  </a>
                ) : null}
                <button
                  onClick={downloadIntrinsicSummary}
                  className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800"
                >
                  Download Summary JSON
                </button>
              </div>
            </div>
          ) : null}
          <div className="rounded border border-zinc-700 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span>Sample Preview Carousel</span>
              <span>{intrinsicSamples.length ? `${intrinsicActiveIndex + 1}/${intrinsicSamples.length}` : "0/0"}</span>
            </div>
            {intrinsicSamples.length ? (
              <>
                <img
                  src={intrinsicSamples[intrinsicActiveIndex]?.dataUrl}
                  alt={intrinsicSamples[intrinsicActiveIndex]?.name || "intrinsic sample"}
                  className="w-full max-h-[220px] rounded border border-zinc-700 object-contain bg-black"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setIntrinsicActiveIndex((i) => Math.max(0, i - 1))}
                    disabled={intrinsicActiveIndex <= 0}
                    className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setIntrinsicActiveIndex((i) => Math.min(intrinsicSamples.length - 1, i + 1))}
                    disabled={intrinsicActiveIndex >= intrinsicSamples.length - 1}
                    className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => deleteIntrinsicSample(intrinsicSamples[intrinsicActiveIndex]?.name)}
                    className="rounded border border-rose-700 bg-rose-900/30 px-2 py-1 text-xs hover:bg-rose-800/40"
                  >
                    Delete Current
                  </button>
                  <button
                    onClick={loadIntrinsicSamples}
                    className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800"
                  >
                    Refresh
                  </button>
                </div>
                <p className="text-xs text-zinc-500 break-all">{intrinsicSamples[intrinsicActiveIndex]?.name}</p>
              </>
            ) : (
              <p className="text-xs text-zinc-400">No intrinsic samples captured yet.</p>
            )}
          </div>
          {renderStageStatus("intrinsic")}
        </div>
        <div className="space-y-2">
          <div className="text-sm text-zinc-300">Live Camera Feed</div>
          {sourceMode === "webcam" ? (
            <video ref={intrinsicVideoRef} autoPlay playsInline muted className="w-full max-h-[360px] rounded border border-zinc-700 object-contain bg-black" />
          ) : feedEnabled ? (
            <img src={liveFeedSrc} onError={onFeedError} onLoad={clearFeedError} alt="Intrinsic feed" className="w-full max-h-[360px] rounded border border-zinc-700 object-contain bg-black" />
          ) : (
            <div className="rounded border border-zinc-700 p-6 text-sm text-zinc-400">Start camera feed to preview intrinsic capture.</div>
          )}
          {snapshotDataUrl ? <img src={snapshotDataUrl} alt="Intrinsic snapshot" className="w-full max-h-[220px] rounded border border-zinc-700 object-contain bg-black" /> : null}
        </div>
      </div>
    </section>
  );
}
