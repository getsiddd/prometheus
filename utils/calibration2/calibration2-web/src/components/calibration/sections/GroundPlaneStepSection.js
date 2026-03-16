"use client";

import CameraPositionPanel from "../CameraPositionPanel";
import ProjectedCadViewer from "../ProjectedCadViewer";

export default function GroundPlaneStepSection({ data, actions, refs, renderStageStatus }) {
  const {
    groundReadiness,
    groundValidationReadiness,
    imagePickMode,
    sourceMode,
    feedEnabled,
    liveFeedSrc,
    snapshotStatus,
    snapshotDataUrl,
    snapshotNaturalSize,
    correspondences,
    validationPairs,
    autoGroundSuggestions = [],
    autoGroundStatus,
    autoGroundLoading = false,
    pendingAutoGroundIndex = null,
    pendingImagePoint,
    solveStatus,
    jobLoading,
    sequenceRunning,
    allowCadUpload = true,
    dwgMessage,
    segments,
    stageOutputGroundPlane,
    pnpSolveResult = null,
    cameraPosition = null,
    cameraIntrinsic = null,
  } = data;

  const {
    setGroundPickMode,
    setValidationPickMode,
    beginSharedMarkerCapture,
    onFeedError,
    clearFeedError,
    captureSnapshotWeb,
    detectAutoGroundPoints,
    onSnapshotImageLoad,
    onSnapshotPick,
    onImagePointMouseDown,
    undoPair,
    clearPairs,
    deletePair,
    clearValidationPairs,
    deleteValidationPair,
    selectAutoGroundSuggestion,
    projectAutoGroundSuggestionToValidation,
    projectAllAutoGroundSuggestionsToValidation,
    deleteAutoGroundSuggestion,
    clearAutoGroundSuggestions,
    uploadDwg,
    runHeadlessSolve,
    runStageCard,
    setStageOutput,
    handleCadPick,
  } = actions;

  const { groundVideoRef, snapshotImgRef, snapshotOverlayRef, dwgInputRef } = refs;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
      <h2 className="text-xl font-semibold">Step 2: Ground Plane Calibration</h2>
      <p className={`text-xs ${groundReadiness.enabled ? "text-emerald-300" : "text-amber-300"}`}>
        {groundReadiness.status}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="text-sm text-zinc-300">Camera side (draw image points)</div>
          <div className="text-xs text-zinc-400">Workflow: Ground mode uses image point first then CAD pick. Validation mode is image-only and auto-projects clicked ground points onto CAD.</div>
          <div className="text-xs text-zinc-400">
            Pick mode: {imagePickMode === "validation" ? "Validation" : imagePickMode === "z" ? "Z Mapping" : imagePickMode === "shared-marker" ? "Shared Marker" : "Ground"}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={setGroundPickMode} className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800">Ground Pick Mode</button>
            <button
              onClick={setValidationPickMode}
              disabled={!groundValidationReadiness?.enabled}
              className="rounded border border-amber-700 bg-amber-900/30 px-2 py-1 text-xs hover:bg-amber-800/40 disabled:opacity-40"
            >
              Validation Pick Mode
            </button>
            <button onClick={beginSharedMarkerCapture} className="rounded border border-blue-700 bg-blue-900/30 px-2 py-1 text-xs hover:bg-blue-800/40">Shared Marker Mode</button>
          </div>
          <div className={`text-xs ${groundValidationReadiness?.enabled ? "text-emerald-300" : "text-amber-300"}`}>
            Validation unlock: {groundValidationReadiness?.status || "Not ready"}
          </div>
          {sourceMode === "webcam" ? (
            <video ref={groundVideoRef} autoPlay playsInline muted className="w-full max-h-[320px] rounded border border-zinc-700 object-contain bg-black" />
          ) : feedEnabled ? (
            <img src={liveFeedSrc} onError={onFeedError} onLoad={clearFeedError} alt="Ground feed" className="w-full max-h-[320px] rounded border border-zinc-700 object-contain bg-black" />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button onClick={captureSnapshotWeb} className="rounded border border-indigo-700 bg-indigo-900/40 px-3 py-2 text-sm hover:bg-indigo-800/50">Capture Snapshot for Point Mapping</button>
            <button
              onClick={detectAutoGroundPoints}
              disabled={!snapshotDataUrl || autoGroundLoading}
              className="rounded border border-sky-700 bg-sky-900/40 px-3 py-2 text-sm hover:bg-sky-800/50 disabled:opacity-40"
            >
              {autoGroundLoading ? "Detecting Human Ground Points..." : "Detect Human Ground Points"}
            </button>
          </div>
          <p className="text-xs text-zinc-400">{snapshotStatus}</p>
          <p className={`text-xs ${autoGroundSuggestions.length ? "text-sky-300" : "text-zinc-400"}`}>{autoGroundStatus}</p>
          {snapshotDataUrl ? (
            <div className="space-y-1">
              <div className="text-[11px] text-zinc-400">Left click to add image point. Drag green points to adjust. In Validation mode, each click is auto-projected onto CAD.</div>
              <div className="rounded border border-zinc-700">
                <div className="relative w-full">
                  <img
                    ref={snapshotImgRef}
                    src={snapshotDataUrl}
                    onLoad={onSnapshotImageLoad}
                    alt="Ground snapshot"
                    className="w-full max-h-[320px] rounded bg-black object-contain"
                  />
                  <svg
                    ref={snapshotOverlayRef}
                    onClick={onSnapshotPick}
                    className="absolute inset-0 h-full w-full cursor-crosshair"
                    viewBox={`0 0 ${snapshotNaturalSize.width} ${snapshotNaturalSize.height}`}
                    preserveAspectRatio="none"
                  >
                    {correspondences.length >= 2 ? (
                      <polygon
                        points={correspondences.map((p) => `${p.pixel[0]},${p.pixel[1]}`).join(" ")}
                        fill="rgba(34,197,94,0.15)"
                        stroke="#22c55e"
                        strokeWidth="2"
                      />
                    ) : null}
                    {correspondences.map((p, idx) => (
                      <g key={`img-p-${idx}`}>
                        <circle
                          cx={p.pixel[0]}
                          cy={p.pixel[1]}
                          r="9"
                          fill="#22c55e"
                          stroke="#052e16"
                          strokeWidth="2"
                          onMouseDown={(e) => onImagePointMouseDown(idx, e)}
                          style={{ cursor: "grab" }}
                        />
                        <text x={p.pixel[0] + 10} y={p.pixel[1] - 10} fill="#22c55e" fontSize="16" fontWeight="700">{p.markerId || idx + 1}</text>
                      </g>
                    ))}
                    {validationPairs.map((p, idx) => (
                      <g key={`val-p-${idx}`}>
                        <circle
                          cx={p.pixel[0]}
                          cy={p.pixel[1]}
                          r="8"
                          fill="#f59e0b"
                          stroke="#7c2d12"
                          strokeWidth="2"
                        />
                        <text x={p.pixel[0] + 10} y={p.pixel[1] - 10} fill="#f59e0b" fontSize="14" fontWeight="700">V{idx + 1}</text>
                      </g>
                    ))}
                    {autoGroundSuggestions.map((suggestion, idx) => {
                      const active = pendingAutoGroundIndex === idx;
                      const box = Array.isArray(suggestion.box) && suggestion.box.length === 4 ? suggestion.box : null;
                      return (
                        <g key={suggestion.id || `auto-ground-${idx}`} opacity={active ? 1 : 0.95} pointerEvents="none">
                          {box ? (
                            <rect
                              x={box[0]}
                              y={box[1]}
                              width={Math.max(0, box[2] - box[0])}
                              height={Math.max(0, box[3] - box[1])}
                              fill="rgba(14,165,233,0.05)"
                              stroke={active ? "#0ea5e9" : "#38bdf8"}
                              strokeDasharray="8 6"
                              strokeWidth="2"
                            />
                          ) : null}
                          <circle
                            cx={suggestion.pixel[0]}
                            cy={suggestion.pixel[1]}
                            r={active ? "10" : "8"}
                            fill={active ? "#0ea5e9" : "#38bdf8"}
                            stroke="#082f49"
                            strokeWidth="2"
                          />
                          <text
                            x={suggestion.pixel[0] + 10}
                            y={suggestion.pixel[1] - 10}
                            fill={active ? "#7dd3fc" : "#38bdf8"}
                            fontSize="14"
                            fontWeight="700"
                          >
                            A{idx + 1}
                          </text>
                        </g>
                      );
                    })}
                    {pendingImagePoint ? (
                      <g>
                        <circle cx={pendingImagePoint[0]} cy={pendingImagePoint[1]} r="7" fill="#f59e0b" />
                        <text x={pendingImagePoint[0] + 10} y={pendingImagePoint[1] - 10} fill="#f59e0b" fontSize="14" fontWeight="700">{imagePickMode === "validation" ? "V" : imagePickMode === "shared-marker" ? "S" : "P"}</text>
                      </g>
                    ) : null}
                  </svg>
                </div>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button onClick={undoPair} className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800">Undo Pair</button>
            <button onClick={clearPairs} className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800">Clear Pairs</button>
          </div>
          <div className="max-h-48 overflow-auto rounded border border-zinc-700 p-2 text-xs space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-zinc-300">Automatic human ground suggestions: {autoGroundSuggestions.length}</span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={projectAllAutoGroundSuggestionsToValidation}
                  disabled={!groundValidationReadiness?.enabled || !autoGroundSuggestions.length}
                  className="rounded border border-sky-700 px-2 py-0.5 text-[11px] hover:bg-zinc-800 disabled:opacity-40"
                >
                  Project All to Validation
                </button>
                <button
                  onClick={clearAutoGroundSuggestions}
                  disabled={!autoGroundSuggestions.length}
                  className="rounded border border-zinc-600 px-2 py-0.5 text-[11px] hover:bg-zinc-800 disabled:opacity-40"
                >
                  Clear Suggestions
                </button>
              </div>
            </div>
            {autoGroundSuggestions.map((suggestion, idx) => (
              <div
                key={`auto-ground-row-${suggestion.id || idx}`}
                className={`rounded border px-2 py-1 ${pendingAutoGroundIndex === idx ? "border-sky-500 bg-sky-950/30" : "border-zinc-800 bg-zinc-950/40"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    A{idx + 1} {suggestion.source === "ankles" ? "ankles" : "bbox"} → P[{suggestion.pixel.map((v) => Number(v).toFixed(1)).join(",")}] · score {typeof suggestion.score === "number" ? suggestion.score.toFixed(2) : "n/a"}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => selectAutoGroundSuggestion(idx)} className="rounded border border-sky-700 px-2 py-0.5 text-[11px] hover:bg-zinc-800">Use for Pair</button>
                    <button
                      onClick={() => projectAutoGroundSuggestionToValidation(idx)}
                      disabled={!groundValidationReadiness?.enabled}
                      className="rounded border border-amber-700 px-2 py-0.5 text-[11px] hover:bg-zinc-800 disabled:opacity-40"
                    >
                      Project to Validation
                    </button>
                    <button onClick={() => deleteAutoGroundSuggestion(idx)} className="rounded border border-zinc-600 px-2 py-0.5 text-[11px] hover:bg-zinc-800">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="max-h-44 overflow-auto rounded border border-zinc-700 p-2 text-xs space-y-1">
            {correspondences.map((p, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2">
                <span>{p.markerId || `m${idx + 1}`} W[{p.world.map((v) => Number(v).toFixed(2)).join(",")}] → P[{p.pixel.map((v) => Number(v).toFixed(1)).join(",")}]</span>
                <button onClick={() => deletePair(idx)} className="rounded border border-zinc-600 px-2 py-0.5 text-[11px] hover:bg-zinc-800">Delete</button>
              </div>
            ))}
          </div>
          <div className="max-h-40 overflow-auto rounded border border-zinc-700 p-2 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-300">Validation points (image → auto CAD): {validationPairs.length}</span>
              <button onClick={clearValidationPairs} className="rounded border border-zinc-600 px-2 py-0.5 text-[11px] hover:bg-zinc-800">Clear Validation</button>
            </div>
            {validationPairs.map((p, idx) => (
              <div key={`val-row-${idx}`} className="flex items-center justify-between gap-2">
                <span>V{idx + 1} W[{p.world.map((v) => Number(v).toFixed(2)).join(",")}] → P[{p.pixel.map((v) => Number(v).toFixed(1)).join(",")}]</span>
                <button onClick={() => deleteValidationPair(idx)} className="rounded border border-zinc-600 px-2 py-0.5 text-[11px] hover:bg-zinc-800">Delete</button>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-300">{solveStatus}</p>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {allowCadUpload ? (
              <>
                <input
                  ref={dwgInputRef}
                  type="file"
                  accept=".dwg,.dxf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadDwg(f);
                  }}
                  className="hidden"
                />
                <button onClick={() => dwgInputRef.current?.click()} className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-sm hover:bg-cyan-800/50">Upload CAD</button>
              </>
            ) : (
              <span className="rounded border border-zinc-700 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-300">
                Using shared project CAD
              </span>
            )}
            <button onClick={runHeadlessSolve} className="rounded border border-amber-700 bg-amber-900/40 px-3 py-2 text-sm hover:bg-amber-800/50">Solve PnP from Pairs</button>
            <button
              disabled={jobLoading || sequenceRunning || !groundReadiness.enabled}
              onClick={() => runStageCard("ground-plane")}
              className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-sm hover:bg-cyan-800/50 disabled:opacity-40"
            >
              Run Ground Plane Stage
            </button>
          </div>
          <p className="text-xs text-zinc-400">{dwgMessage}</p>
          <ProjectedCadViewer
            segments={segments}
            onPickWorld={handleCadPick}
            pickedWorldPoints={correspondences.map((c) => c.world)}
            validationWorldPoints={validationPairs.map((p) => p.world)}
            title={pendingImagePoint ? "Pick CAD point for selected image point" : "First select image point, then CAD point"}
            cameraPosition={cameraPosition}
            cameraIntrinsic={cameraIntrinsic}
          />
          <CameraPositionPanel pnpSolveResult={pnpSolveResult} />
          <label className="block text-xs">Ground Plane Output Path
            <input value={stageOutputGroundPlane || ""} onChange={(e) => setStageOutput("ground-plane", e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
          </label>
          {renderStageStatus("ground-plane")}
        </div>
      </div>
    </section>
  );
}
