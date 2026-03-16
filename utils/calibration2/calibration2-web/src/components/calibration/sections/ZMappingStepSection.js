"use client";

import ProjectedCadViewer from "../ProjectedCadViewer";

/** SVG arrow from (x1,y1) to (x2,y2) with arrowhead */
function ArrowLine({ x1, y1, x2, y2, color = "#60a5fa", strokeWidth = 3, label }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return null;
  const ux = dx / len;
  const uy = dy / len;
  const headLen = Math.min(30, len * 0.28);
  const angle = 0.42;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const ax1 = x2 - headLen * (ux * cos + uy * sin);
  const ay1 = y2 - headLen * (-ux * sin + uy * cos);
  const ax2 = x2 - headLen * (ux * cos - uy * sin);
  const ay2 = y2 - headLen * (ux * sin + uy * cos);
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <polygon points={`${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}`} fill={color} />
      {label ? (
        <text x={x2 + 12} y={y2 - 12} fill={color} fontSize="16" fontWeight="700">{label}</text>
      ) : null}
    </g>
  );
}

export default function ZMappingStepSection({ data, actions, renderStageStatus }) {
  const {
    zReadiness,
    snapshotDataUrl,
    correspondences,
    zMappings,
    imagePickMode,
    pendingZGroundIndex,
    pendingZImageTip,
    snapshotNaturalSize,
    segments,
    stageResolvedGroundPlane,
    stageOutputGroundPlane,
    stageOutputZMapping,
    jobLoading,
    sequenceRunning,
  } = data;

  const {
    beginZPointCapture,
    setGroundPickMode,
    onZGroundMarkerClick,
    onSnapshotPick,
    handleCadPick,
    undoZMapping,
    clearZMappings,
    deleteZMapping,
    setStageOutput,
    runStageCard,
  } = actions;

  const isZMode = imagePickMode === "z" || imagePickMode === "z-tip";
  let stepIndex = 0;
  if (isZMode && pendingZGroundIndex !== null && pendingZImageTip === null) stepIndex = 1;
  if (isZMode && pendingZGroundIndex !== null && pendingZImageTip !== null) stepIndex = 2;

  const steps = ["① Click ground marker", "② Click Z-direction tip", "③ Pick matching CAD point"];

  const cadTitle = stepIndex === 2
    ? `Pick CAD point for Z-tip above ground pair #${pendingZGroundIndex + 1}`
    : stepIndex === 1 ? "Waiting for image tip click…"
    : "CAD pick needed after image tip is marked";

  const groundWorldPoints = correspondences.map((c) => c.world);
  const zTipWorldPoints = zMappings.map((z) => z.worldZ);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
      <h2 className="text-xl font-semibold">Step 3: Z-Direction Mapping</h2>
      <p className={`text-xs ${zReadiness.enabled ? "text-emerald-300" : "text-amber-300"}`}>
        {zReadiness.status}
      </p>

      {/* 3-step indicator */}
      {isZMode ? (
        <div className="flex flex-wrap gap-1 text-xs">
          {steps.map((s, i) => (
            <span
              key={i}
              className={`rounded px-2 py-1 ${
                i === stepIndex
                  ? "bg-blue-700 text-white font-semibold"
                  : i < stepIndex
                    ? "bg-emerald-900/50 text-emerald-300"
                    : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {s}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: image pick panel */}
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">
            Select an existing ground marker as anchor → click the Z-direction tip in the image (e.g. top of a pole or wall corner above that point) → pick that same point in the CAD viewer.
            The <span className="text-blue-300 font-medium">direction arrow</span> is what matters — the camera may not capture the full top view.
          </p>

          <div className="flex flex-wrap gap-2">
            {isZMode ? (
              <button onClick={setGroundPickMode} className="rounded border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800">
                Cancel Z Mode
              </button>
            ) : (
              <button
                onClick={beginZPointCapture}
                disabled={!correspondences.length}
                className="rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm hover:bg-blue-800/50 disabled:opacity-40"
              >
                Add Z-Direction Mapping
              </button>
            )}
            <button onClick={undoZMapping} className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800">Undo</button>
            <button onClick={clearZMappings} className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800">Clear All</button>
          </div>

          <div className="text-xs text-zinc-400">
            Ground pairs: <span className="text-zinc-200">{correspondences.length}</span>
            {" | "}Z mappings: <span className="text-blue-300 font-medium">{zMappings.length}</span>
          </div>

          {snapshotDataUrl ? (
            <div className="rounded border border-zinc-700">
              <div className="relative w-full">
                <img
                  src={snapshotDataUrl}
                  alt="Z mapping preview"
                  className="w-full max-h-[360px] rounded bg-black object-contain"
                />
                <svg
                  onClick={onSnapshotPick}
                  className="absolute inset-0 h-full w-full cursor-crosshair"
                  viewBox={`0 0 ${snapshotNaturalSize.width} ${snapshotNaturalSize.height}`}
                  preserveAspectRatio="none"
                >
                  {/* Confirmed Z direction arrows */}
                  {zMappings.map((z, idx) => (
                    <ArrowLine
                      key={`zarrow-${idx}`}
                      x1={z.pixelBase[0]}
                      y1={z.pixelBase[1]}
                      x2={z.pixelZ[0]}
                      y2={z.pixelZ[1]}
                      color="#60a5fa"
                      strokeWidth={3}
                      label={`Z${idx + 1}`}
                    />
                  ))}

                  {/* Ground markers — clickable in z mode */}
                  {correspondences.map((p, idx) => {
                    const isAnchor = pendingZGroundIndex === idx;
                    const isAvailable = imagePickMode === "z";
                    return (
                      <g
                        key={`zm-base-${idx}`}
                        onClick={(e) => {
                          if (isAvailable) {
                            e.stopPropagation();
                            onZGroundMarkerClick(idx);
                          }
                        }}
                        style={{ cursor: isAvailable ? "pointer" : "default" }}
                      >
                        {isAvailable && !isAnchor ? (
                          <circle
                            cx={p.pixel[0]} cy={p.pixel[1]} r="18"
                            fill="none" stroke="#22c55e" strokeWidth="1.5"
                            strokeDasharray="4 3" opacity="0.7"
                          />
                        ) : null}
                        {isAnchor ? (
                          <circle
                            cx={p.pixel[0]} cy={p.pixel[1]} r="18"
                            fill="rgba(245,158,11,0.2)" stroke="#f59e0b" strokeWidth="2.5"
                          />
                        ) : null}
                        <circle
                          cx={p.pixel[0]} cy={p.pixel[1]} r="9"
                          fill={isAnchor ? "#f59e0b" : "#22c55e"}
                          stroke={isAnchor ? "#7c2d12" : "#052e16"}
                          strokeWidth="2"
                        />
                        <text
                          x={p.pixel[0] + 11} y={p.pixel[1] - 11}
                          fill={isAnchor ? "#f59e0b" : "#22c55e"}
                          fontSize="16" fontWeight="700"
                        >
                          {p.markerId || `m${idx + 1}`}
                        </text>
                      </g>
                    );
                  })}

                  {/* Pending tip arrow (violet) */}
                  {pendingZGroundIndex !== null && correspondences[pendingZGroundIndex] && pendingZImageTip ? (
                    <>
                      <ArrowLine
                        x1={correspondences[pendingZGroundIndex].pixel[0]}
                        y1={correspondences[pendingZGroundIndex].pixel[1]}
                        x2={pendingZImageTip[0]}
                        y2={pendingZImageTip[1]}
                        color="#a78bfa"
                        strokeWidth={2}
                        label="tip?"
                      />
                      <circle cx={pendingZImageTip[0]} cy={pendingZImageTip[1]} r="8"
                        fill="#a78bfa" stroke="#4c1d95" strokeWidth="2" />
                    </>
                  ) : null}
                </svg>
              </div>
            </div>
          ) : (
            <div className="rounded border border-zinc-700 p-3 text-xs text-zinc-400">
              Capture a snapshot in Step 2 first.
            </div>
          )}

          {/* Z mapping list */}
          <div className="max-h-44 overflow-auto rounded border border-zinc-700 p-2 text-xs space-y-1">
            {zMappings.length === 0 ? (
              <span className="text-zinc-500">No Z mappings yet.</span>
            ) : zMappings.map((z, idx) => {
              const dx = z.pixelZ[0] - z.pixelBase[0];
              const dy = z.pixelZ[1] - z.pixelBase[1];
              const angleDeg = (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1);
              return (
                <div key={idx} className="flex items-center justify-between gap-2">
                  <span className="text-blue-300">
                    Z{idx + 1}: base m{z.baseIndex + 1}
                    {" | "}image dir {angleDeg}°
                    {" | "}CAD tip [{z.worldZ.map((v) => Number(v).toFixed(2)).join(", ")}]
                  </span>
                  <button onClick={() => deleteZMapping(idx)} className="rounded border border-zinc-600 px-2 py-0.5 text-[11px] hover:bg-zinc-800">Delete</button>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-zinc-500 break-all">Ground output: {stageResolvedGroundPlane || stageOutputGroundPlane}</p>
        </div>

        {/* Right: CAD viewer for world-point picking */}
        <div className="space-y-3">
          <div className="text-xs text-zinc-400">
            After marking the image tip (step ②), click the matching 3D point in the CAD below to complete the Z-direction mapping.
          </div>
          <ProjectedCadViewer
            segments={segments || []}
            onPickWorld={handleCadPick}
            pickedWorldPoints={groundWorldPoints}
            validationWorldPoints={zTipWorldPoints}
            title={cadTitle}
          />
          <label className="block text-xs">Z-Mapping Output Path
            <input
              value={stageOutputZMapping || ""}
              onChange={(e) => setStageOutput("z-mapping", e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
            />
          </label>
          <button
            disabled={jobLoading || sequenceRunning || !zReadiness.enabled}
            onClick={() => runStageCard("z-mapping")}
            className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-sm hover:bg-cyan-800/50 disabled:opacity-40"
          >
            Run Z-Mapping Stage
          </button>
          {renderStageStatus("z-mapping")}
        </div>
      </div>
    </section>
  );
}
