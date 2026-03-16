"use client";

export default function RemainingStagesSection({ data, actions, refs, renderStageStatus }) {
  const {
    stages,
    stageOutputs,
    stageMessages,
    jobLoading,
    sequenceRunning,
    sfmMessage,
    overlayOpacity,
  } = data;

  const {
    getStageReadiness,
    uploadSfmImages,
    setOverlayOpacity,
    setStageOutput,
    runStageCard,
  } = actions;

  const { sfmInputRef } = refs;

  return (
    <>
      {stages.filter((s) => !["intrinsic", "ground-plane", "z-mapping", "cad-3d-dwg"].includes(s)).map((stage, idx) => {
        // Count how many of the "dedicated step" stages are included in the full stages list
        const dedicatedCount = ["intrinsic", "ground-plane", "z-mapping", "cad-3d-dwg"].filter((s) => stages.includes(s)).length;
        const stepNumber = dedicatedCount + idx + 1;
        return (
        <section key={stage} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Step {stepNumber}: {stage}</h2>
          <p className={`text-xs ${getStageReadiness(stage).enabled ? "text-emerald-300" : "text-amber-300"}`}>
            {getStageReadiness(stage).status}
          </p>
          {stage === "sfm" ? (
            <div className="space-y-2">
              <input
                ref={sfmInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => uploadSfmImages(e.target.files)}
                className="hidden"
              />
              <button onClick={() => sfmInputRef.current?.click()} className="rounded border border-violet-700 bg-violet-900/40 px-3 py-2 text-sm hover:bg-violet-800/50">
                Upload SfM Images
              </button>
              <p className="text-xs text-zinc-400">{sfmMessage}</p>
            </div>
          ) : null}
          {stage === "overlay" ? (
            <label className="block text-sm">
              Overlay Opacity: {overlayOpacity}%
              <input type="range" min={0} max={100} value={overlayOpacity} onChange={(e) => setOverlayOpacity(Number(e.target.value))} className="w-full" />
            </label>
          ) : null}
          <label className="block text-xs">Output Path
            <input value={stageOutputs[stage] || ""} onChange={(e) => setStageOutput(stage, e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
          </label>
          <button
            disabled={jobLoading || sequenceRunning || !getStageReadiness(stage).enabled}
            onClick={() => runStageCard(stage)}
            className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-sm capitalize hover:bg-cyan-800/50 disabled:opacity-40"
          >
            Run {stage} Stage
          </button>
          <p className="text-xs text-zinc-300">{stageMessages[stage] || "Ready"}</p>
          {renderStageStatus(stage)}
        </section>
        );
      })}
    </>
  );
}
