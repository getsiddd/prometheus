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
    autoGroundDetections = [],
    autoGroundModelInfo = null,
    autoGroundLogs = [],
    autoGroundImageSize = { width: 1, height: 1 },
    autoGroundStatus,
    autoGroundLoading = false,
    pendingAutoGroundIndex = null,
    pendingImagePoint,
    groundMappingModes = { imageCad: true, imageCoords: false, imageDistances: false, polygonCad: false },
    manualWorldInput = { x: "", y: "", z: "0" },
    distanceConstraints = [],
    distanceDraft = { from: "", to: "", distance: "" },
    polygonCaptureActive = false,
    polygonImagePoints = [],
    polygonCadPoints = [],
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
    autoPlaceMarkersFromSolvedCameras,
    onFeedError,
    clearFeedError,
    captureSnapshotWeb,
    detectAutoGroundPoints,
    setGroundMappingMode,
    setManualWorldInput,
    addManualCoordinatePair,
    setDistanceDraft,
    addDistanceConstraint,
    deleteDistanceConstraint,
    beginPolygonCadMapping,
    finalizePolygonCadMapping,
    clearPolygonCadMapping,
    onSnapshotImageLoad,
    onLiveFeedLoad,
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

  const { groundVideoRef, snapshotImgRef, snapshotOverlayRef, liveFeedImgRef, dwgInputRef } = refs;

  // Shared interactive picking overlay: placed directly on the live feed
  const pickingOverlay = (
    <svg
      ref={snapshotOverlayRef}
      onClick={onSnapshotPick}
      className="absolute inset-0 h-full w-full cursor-crosshair"
      viewBox={`0 0 ${snapshotNaturalSize.width || 1} ${snapshotNaturalSize.height || 1}`}
      preserveAspectRatio="none"
    >
      {polygonImagePoints.length >= 2 ? (
        <polyline
          points={polygonImagePoints.map((p) => `${p[0]},${p[1]}`).join(" ")}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="2"
          strokeDasharray="6 4"
        />
      ) : null}
      {polygonImagePoints.map((p, idx) => (
        <g key={`poly-img-${idx}`}>
          <circle cx={p[0]} cy={p[1]} r="6" fill="#06b6d4" stroke="#164e63" strokeWidth="2" />
          <text x={p[0] + 8} y={p[1] - 8} fill="#67e8f9" fontSize="12" fontWeight="700">P{idx + 1}</text>
        </g>
      ))}
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
          <circle cx={p.pixel[0]} cy={p.pixel[1]} r="8" fill="#f59e0b" stroke="#7c2d12" strokeWidth="2" />
          <text x={p.pixel[0] + 10} y={p.pixel[1] - 10} fill="#f59e0b" fontSize="14" fontWeight="700">V{idx + 1}</text>
        </g>
      ))}
      {autoGroundDetections.map((detection, idx) => {
        const box = Array.isArray(detection.box) && detection.box.length === 4 ? detection.box : null;
        const groundPoint = Array.isArray(detection.ground_point) && detection.ground_point.length === 2 ? detection.ground_point : null;
        const leftAnkle = Array.isArray(detection.left_ankle) && detection.left_ankle.length === 2 ? detection.left_ankle : null;
        const rightAnkle = Array.isArray(detection.right_ankle) && detection.right_ankle.length === 2 ? detection.right_ankle : null;
        return (
          <g key={detection.id || `det-${idx}`} opacity={0.85} pointerEvents="none">
            {box ? (
              <rect
                x={box[0]} y={box[1]}
                width={Math.max(0, box[2] - box[0])} height={Math.max(0, box[3] - box[1])}
                fill="rgba(250,204,21,0.04)"
                stroke={detection.passes_person_threshold ? "#eab308" : "#a3a3a3"}
                strokeWidth="2"
              />
            ) : null}
            {leftAnkle ? <circle cx={leftAnkle[0]} cy={leftAnkle[1]} r="4" fill="#fde047" /> : null}
            {rightAnkle ? <circle cx={rightAnkle[0]} cy={rightAnkle[1]} r="4" fill="#fde047" /> : null}
            {groundPoint ? <circle cx={groundPoint[0]} cy={groundPoint[1]} r="5" fill="#facc15" stroke="#713f12" strokeWidth="1.5" /> : null}
            <text
              x={(box ? box[0] : (groundPoint ? groundPoint[0] : 12)) + 6}
              y={(box ? box[1] : (groundPoint ? groundPoint[1] : 18)) - 6}
              fill="#facc15" fontSize="12" fontWeight="700"
            >
              H{idx + 1}
            </text>
          </g>
        );
      })}
      {autoGroundSuggestions.map((suggestion, idx) => {
        const active = pendingAutoGroundIndex === idx;
        const box = Array.isArray(suggestion.box) && suggestion.box.length === 4 ? suggestion.box : null;
        return (
          <g key={suggestion.id || `auto-ground-${idx}`} opacity={active ? 1 : 0.95} pointerEvents="none">
            {box ? (
              <rect
                x={box[0]} y={box[1]}
                width={Math.max(0, box[2] - box[0])} height={Math.max(0, box[3] - box[1])}
                fill="rgba(14,165,233,0.05)"
                stroke={active ? "#0ea5e9" : "#38bdf8"}
                strokeDasharray="8 6" strokeWidth="2"
              />
            ) : null}
            <circle
              cx={suggestion.pixel[0]} cy={suggestion.pixel[1]}
              r={active ? "10" : "8"}
              fill={active ? "#0ea5e9" : "#38bdf8"}
              stroke="#082f49" strokeWidth="2"
            />
            <text x={suggestion.pixel[0] + 10} y={suggestion.pixel[1] - 10} fill={active ? "#7dd3fc" : "#38bdf8"} fontSize="14" fontWeight="700">
              A{idx + 1}
            </text>
          </g>
        );
      })}
      {pendingImagePoint ? (
        <g>
          <circle cx={pendingImagePoint[0]} cy={pendingImagePoint[1]} r="7" fill="#f59e0b" />
          <text x={pendingImagePoint[0] + 10} y={pendingImagePoint[1] - 10} fill="#f59e0b" fontSize="14" fontWeight="700">
            {imagePickMode === "validation" ? "V" : imagePickMode === "shared-marker" ? "S" : "P"}
          </text>
        </g>
      ) : null}
    </svg>
  );

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
          <div className="rounded border border-zinc-700 bg-zinc-950/50 p-2 text-xs space-y-2">
            <div className="text-zinc-300">Ground mapping method (single mode):</div>
            <label className="flex items-center gap-2"><input type="radio" name="ground-mapping-method" checked={groundMappingModes.imageCad !== false} onChange={() => setGroundMappingMode("imageCad", true)} /> Image + AutoCAD points (existing)</label>
            <label className="flex items-center gap-2"><input type="radio" name="ground-mapping-method" checked={!!groundMappingModes.imageCoords} onChange={() => setGroundMappingMode("imageCoords", true)} /> Image + manual world coordinates</label>
            <label className="flex items-center gap-2"><input type="radio" name="ground-mapping-method" checked={!!groundMappingModes.imageDistances} onChange={() => setGroundMappingMode("imageDistances", true)} /> Image + distances between markers</label>
            <label className="flex items-center gap-2"><input type="radio" name="ground-mapping-method" checked={!!groundMappingModes.polygonCad} onChange={() => setGroundMappingMode("polygonCad", true)} /> Image polygon + AutoCAD polygon vectors</label>
          </div>
          {groundMappingModes.imageCoords ? (
            <div className="rounded border border-zinc-700 bg-zinc-950/50 p-2 text-xs space-y-2">
              <div className="text-zinc-300">Manual world coordinates for selected image point</div>
              <div className="grid grid-cols-3 gap-2">
                <input value={manualWorldInput.x} onChange={(e) => setManualWorldInput((prev) => ({ ...prev, x: e.target.value }))} placeholder="X" className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
                <input value={manualWorldInput.y} onChange={(e) => setManualWorldInput((prev) => ({ ...prev, y: e.target.value }))} placeholder="Y" className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
                <input value={manualWorldInput.z} onChange={(e) => setManualWorldInput((prev) => ({ ...prev, z: e.target.value }))} placeholder="Z" className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
              </div>
              <button onClick={addManualCoordinatePair} disabled={!pendingImagePoint} className="rounded border border-emerald-700 bg-emerald-900/40 px-2 py-1 text-xs hover:bg-emerald-800/50 disabled:opacity-40">Add Manual Coordinate Pair</button>
            </div>
          ) : null}
          {groundMappingModes.imageDistances ? (
            <div className="rounded border border-zinc-700 bg-zinc-950/50 p-2 text-xs space-y-2">
              <div className="text-zinc-300">Distance constraints between marker IDs</div>
              <div className="grid grid-cols-3 gap-2">
                <input value={distanceDraft.from || ""} onChange={(e) => setDistanceDraft((prev) => ({ ...prev, from: e.target.value }))} placeholder="From marker (e.g. m1)" className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
                <input value={distanceDraft.to || ""} onChange={(e) => setDistanceDraft((prev) => ({ ...prev, to: e.target.value }))} placeholder="To marker (e.g. m2)" className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
                <input value={distanceDraft.distance || ""} onChange={(e) => setDistanceDraft((prev) => ({ ...prev, distance: e.target.value }))} placeholder="Distance (meters)" className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
              </div>
              <button onClick={addDistanceConstraint} className="rounded border border-amber-700 bg-amber-900/40 px-2 py-1 text-xs hover:bg-amber-800/50">Add Distance Constraint</button>
              {distanceConstraints.length ? (
                <div className="max-h-24 overflow-auto space-y-1">
                  {distanceConstraints.map((item, idx) => (
                    <div key={item.id || idx} className="flex items-center justify-between gap-2 rounded border border-zinc-800 px-2 py-1">
                      <span>{item.from} ↔ {item.to}: {Number(item.distance).toFixed(3)} m</span>
                      <button onClick={() => deleteDistanceConstraint(idx)} className="rounded border border-zinc-600 px-2 py-0.5 text-[11px] hover:bg-zinc-800">Delete</button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {groundMappingModes.polygonCad ? (
            <div className="rounded border border-zinc-700 bg-zinc-950/50 p-2 text-xs space-y-2">
              <div className="text-zinc-300">Polygon vector mapping</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={beginPolygonCadMapping} className="rounded border border-cyan-700 bg-cyan-900/40 px-2 py-1 text-xs hover:bg-cyan-800/50">Start Polygon Mapping</button>
                <button onClick={finalizePolygonCadMapping} disabled={!polygonCaptureActive} className="rounded border border-emerald-700 bg-emerald-900/40 px-2 py-1 text-xs hover:bg-emerald-800/50 disabled:opacity-40">Finalize Polygon Mapping</button>
                <button onClick={clearPolygonCadMapping} disabled={!polygonCaptureActive} className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-40">Clear Polygon</button>
              </div>
              <div className="text-zinc-400">Polygon active: {polygonCaptureActive ? "yes" : "no"} · image vertices: {polygonImagePoints.length} · CAD vertices: {polygonCadPoints.length}</div>
            </div>
          ) : null}
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
            <button onClick={autoPlaceMarkersFromSolvedCameras} className="rounded border border-violet-700 bg-violet-900/30 px-2 py-1 text-xs hover:bg-violet-800/40">Auto-Place Markers (LoFTR/AI)</button>
          </div>
          <div className={`text-xs ${groundValidationReadiness?.enabled ? "text-emerald-300" : "text-amber-300"}`}>
            Validation unlock: {groundValidationReadiness?.status || "Not ready"}
          </div>
          {sourceMode === "webcam" ? (
            <div className="relative">
              <video
                ref={groundVideoRef}
                autoPlay playsInline muted
                onLoadedMetadata={onLiveFeedLoad}
                className="w-full max-h-[320px] rounded border border-zinc-700 object-contain bg-black"
              />
              {pickingOverlay}
            </div>
          ) : feedEnabled ? (
            <div className="relative">
              <img
                ref={liveFeedImgRef}
                src={liveFeedSrc}
                onError={onFeedError}
                onLoad={(e) => { clearFeedError(e); onLiveFeedLoad(e); }}
                alt="Ground feed"
                className="w-full max-h-[320px] rounded border border-zinc-700 object-contain bg-black"
              />
              {pickingOverlay}
            </div>
          ) : null}
          <div className="text-xs text-zinc-400">Click directly on the live feed above to pick ground points. Use <em>Capture Reference Frame</em> only when running AI detection.</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={captureSnapshotWeb} className="rounded border border-indigo-700 bg-indigo-900/40 px-3 py-2 text-sm hover:bg-indigo-800/50">Capture Reference Frame</button>
            <button
              onClick={detectAutoGroundPoints}
              disabled={autoGroundLoading}
              className="rounded border border-sky-700 bg-sky-900/40 px-3 py-2 text-sm hover:bg-sky-800/50 disabled:opacity-40"
            >
              {autoGroundLoading ? "Detecting Human Ground Points..." : "Detect Human Ground Points"}
            </button>
          </div>
          <p className="text-xs text-zinc-400">{snapshotStatus}</p>
          <p className={`text-xs ${autoGroundSuggestions.length ? "text-sky-300" : "text-zinc-400"}`}>{autoGroundStatus}</p>
          {autoGroundModelInfo ? (
            <div className="rounded border border-zinc-700 bg-zinc-950/50 p-2 text-[11px] text-zinc-300 space-y-1">
              <div>
                Model status: <span className="text-sky-300">{autoGroundModelInfo.status || "ready"}</span>
                {autoGroundModelInfo.download_percent != null ? ` · ${autoGroundModelInfo.download_percent}%` : ""}
              </div>
              {autoGroundModelInfo.weights_url ? <div className="break-all">Source: {autoGroundModelInfo.weights_url}</div> : null}
              {autoGroundModelInfo.weights_cache_path ? <div className="break-all">Cache: {autoGroundModelInfo.weights_cache_path}</div> : null}
            </div>
          ) : null}
          {autoGroundLogs?.length ? (
            <div className="max-h-24 overflow-auto rounded border border-zinc-700 bg-zinc-950/50 p-2 text-[11px] text-zinc-300 space-y-1">
              {autoGroundLogs.map((line, idx) => (
                <div key={`auto-ground-log-${idx}`} className="break-all">{line}</div>
              ))}
            </div>
          ) : null}
          {snapshotDataUrl ? (
            <details className="rounded border border-zinc-700 bg-zinc-950/30 p-2 text-[11px] text-zinc-400">
              <summary className="cursor-pointer">Reference frame (for AI detection)</summary>
              <img ref={snapshotImgRef} src={snapshotDataUrl} onLoad={onSnapshotImageLoad} alt="Reference frame" className="mt-2 w-full max-h-[180px] rounded object-contain bg-black" />
            </details>
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
          <div className="max-h-40 overflow-auto rounded border border-zinc-700 p-2 text-xs space-y-1">
            <div className="text-zinc-300">Detected humans (latest snapshot): {autoGroundDetections.length}</div>
            {autoGroundDetections.map((detection, idx) => (
              <div key={`det-row-${detection.id || idx}`} className="rounded border border-zinc-800 bg-zinc-950/40 px-2 py-1">
                H{idx + 1} · score {typeof detection.person_score === "number" ? detection.person_score.toFixed(2) : "n/a"}
                {Array.isArray(detection.ground_point) ? ` · ground [${detection.ground_point.map((v) => Number(v).toFixed(1)).join(",")}]` : " · no ground point"}
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
            pickedWorldPoints={[...correspondences.map((c) => c.world), ...polygonCadPoints]}
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
