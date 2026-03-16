"use client";

import ProjectedCadViewer from "../ProjectedCadViewer";

export default function Cad3dStepSection({ data, actions, renderStageStatus }) {
  const {
    cadReadiness,
    correspondences,
    zMappings,
    segments,
    stageOutputCad,
    jobLoading,
    sequenceRunning,
    cameraPosition = null,
    cameraIntrinsic = null,
  } = data;

  const { setStageOutput, runStageCard } = actions;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
      <h2 className="text-xl font-semibold">Step 4: cad-3d-dwg</h2>
      <p className={`text-xs ${cadReadiness.enabled ? "text-emerald-300" : "text-amber-300"}`}>
        {cadReadiness.status}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">Using uploaded CAD with highlighted Ground points + Z-direction points from previous steps.</p>
          <p className="text-xs text-zinc-300">Ground points: {correspondences.length} | Z points: {zMappings.length}</p>
        </div>
        <div className="space-y-3">
          <ProjectedCadViewer
            segments={segments}
            pickedWorldPoints={[
              ...correspondences.map((c) => c.world),
              ...zMappings.map((z) => z.worldZ),
            ]}
            title="CAD with ground-plane + Z-direction highlights"
            cameraPosition={cameraPosition}
            cameraIntrinsic={cameraIntrinsic}
          />
          <label className="block text-xs">CAD-3D-DWG Output Path
            <input value={stageOutputCad || ""} onChange={(e) => setStageOutput("cad-3d-dwg", e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
          </label>
          <button
            disabled={jobLoading || sequenceRunning || !cadReadiness.enabled}
            onClick={() => runStageCard("cad-3d-dwg")}
            className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-sm hover:bg-cyan-800/50 disabled:opacity-40"
          >
            Run cad-3d-dwg Stage
          </button>
          {renderStageStatus("cad-3d-dwg")}
        </div>
      </div>
    </section>
  );
}
