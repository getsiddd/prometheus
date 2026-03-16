"use client";

export default function ProjectWorkflowSection({ data, actions, refs }) {
  const {
    projectOpenPath,
    projectStatus,
    projectName,
    projectDescription,
    projectSharedDwgPath,
    projectSharedDwgFileName,
    projectDraftName,
    projectDraftDescription,
    projectDraftSharedDwgPath,
    projectDraftCameras,
    projectConfigPath,
    projectCameras,
    sharedMarkers,
    activeProjectCameraId,
    projectRunStageChain,
    projectAutoTriangulate,
    projectSequenceRunning,
    projectSequenceStatus,
    triangulationStatus,
    projectSequenceLogs,
    triangulationResult,
  } = data;

  const {
    setProjectOpenPath,
    setProjectDraftName,
    setProjectDraftDescription,
    addProjectDraftCamera,
    updateProjectDraftCamera,
    removeProjectDraftCamera,
    uploadDwg,
    useCurrentDwgForDraft,
    createProjectFromDraft,
    saveCurrentProjectConfig,
    uploadProjectConfig,
    openProjectByPath,
    openProjectCamera,
    syncCurrentPairsToSharedMarkers,
    beginSharedMarkerCapture,
    stopSharedMarkerCapture,
    setProjectRunStageChain,
    setProjectAutoTriangulate,
    runProjectSequence,
    runProjectTriangulation,
  } = actions;

  const { projectConfigInputRef, projectSharedDwgInputRef } = refs;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <h2 className="text-lg font-medium">Project Workflow: Multi-Camera + Multi-View</h2>
      <p className="text-xs text-zinc-400">
        Create project JSON directly from dashboard, save progress, and reopen later. One shared DWG is used as source of truth for all cameras.
      </p>
      <input
        ref={projectConfigInputRef}
        type="file"
        accept=".json,application/json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            uploadProjectConfig(file);
          }
        }}
        className="hidden"
      />
      <input
        ref={projectSharedDwgInputRef}
        type="file"
        accept=".dwg,.dxf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            uploadDwg(file);
          }
        }}
        className="hidden"
      />

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="space-y-2 rounded border border-zinc-700 p-3">
          <div className="text-sm font-medium text-zinc-200">Create Project</div>
          <label className="block text-xs">
            Project Name
            <input
              value={projectDraftName}
              onChange={(e) => setProjectDraftName(e.target.value)}
              placeholder="warehouse-zone-a"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
            />
          </label>
          <label className="block text-xs">
            Project Description
            <input
              value={projectDraftDescription}
              onChange={(e) => setProjectDraftDescription(e.target.value)}
              placeholder="Zone A multi-camera calibration"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
            />
          </label>
          <label className="block text-xs">
            Shared DWG Path (from uploaded file)
            <div className="mt-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-300 break-all">
              {projectDraftSharedDwgPath || "No shared DWG uploaded yet."}
            </div>
          </label>
          <div className="text-[11px] text-zinc-500">
            Current project DWG: {projectSharedDwgPath || "n/a"}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => projectSharedDwgInputRef.current?.click()}
              className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-1.5 text-xs hover:bg-cyan-800/50"
            >
              Upload Shared DWG/DXF
            </button>
            <button
              onClick={useCurrentDwgForDraft}
              className="rounded border border-zinc-600 px-3 py-1.5 text-xs hover:bg-zinc-800"
            >
              Use Current DWG
            </button>
            <button
              onClick={createProjectFromDraft}
              className="rounded border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-xs hover:bg-emerald-800/50"
            >
              Create + Save Project
            </button>
            <button
              onClick={saveCurrentProjectConfig}
              disabled={!projectCameras.length}
              className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-1.5 text-xs hover:bg-cyan-800/50 disabled:opacity-40"
            >
              Save Current Progress
            </button>
          </div>
        </div>

        <div className="space-y-2 rounded border border-zinc-700 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-zinc-200">Project Cameras</div>
            <button
              onClick={addProjectDraftCamera}
              className="rounded border border-zinc-600 px-2.5 py-1 text-xs hover:bg-zinc-800"
            >
              Add Camera
            </button>
          </div>
          <div className="max-h-80 space-y-2 overflow-auto pr-1">
            {(Array.isArray(projectDraftCameras) ? projectDraftCameras : []).map((camera, index) => (
              <div key={`${camera.id || "cam"}-${index}`} className="rounded border border-zinc-800 bg-zinc-950/40 p-2 space-y-2">
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="block text-xs">
                    Camera ID
                    <input
                      value={camera.id || ""}
                      onChange={(e) => updateProjectDraftCamera(index, "id", e.target.value)}
                      className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                    />
                  </label>
                  <label className="block text-xs">
                    Camera Name
                    <input
                      value={camera.name || ""}
                      onChange={(e) => updateProjectDraftCamera(index, "name", e.target.value)}
                      className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                    />
                  </label>
                  <label className="block text-xs">
                    Location
                    <input
                      value={camera.location || ""}
                      onChange={(e) => updateProjectDraftCamera(index, "location", e.target.value)}
                      className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                    />
                  </label>
                  <label className="block text-xs">
                    Camera Type
                    <select
                      value={camera.cameraType || "cctv"}
                      onChange={(e) => updateProjectDraftCamera(index, "cameraType", e.target.value)}
                      className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                    >
                      <option value="pinhole">PinHole</option>
                      <option value="fisheye">Fish Eye</option>
                      <option value="wide-angle">Wide Angle</option>
                      <option value="cctv">CCTV</option>
                    </select>
                  </label>
                  <label className="block text-xs">
                    Source Mode
                    <select
                      value={camera.sourceMode || "rtsp"}
                      onChange={(e) => updateProjectDraftCamera(index, "sourceMode", e.target.value)}
                      className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                    >
                      <option value="rtsp">RTSP / File URL</option>
                      <option value="webcam">Browser Webcam</option>
                    </select>
                  </label>
                  <label className="block text-xs md:col-span-2">
                    Source URL
                    <input
                      value={camera.sourceUrl || ""}
                      onChange={(e) => updateProjectDraftCamera(index, "sourceUrl", e.target.value)}
                      className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                    />
                  </label>
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Camera {index + 1}</span>
                  <button
                    onClick={() => removeProjectDraftCamera(index)}
                    disabled={projectDraftCameras.length <= 1}
                    className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => projectConfigInputRef.current?.click()}
          className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-sm hover:bg-cyan-800/50"
        >
          Upload Project Config (.json)
        </button>
        <label className="text-xs text-zinc-400">
          Open Project Path
          <input
            value={projectOpenPath}
            onChange={(e) => setProjectOpenPath(e.target.value)}
            placeholder="/absolute/path/to/project.json"
            className="ml-2 w-[26rem] rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
          />
        </label>
        <button
          onClick={openProjectByPath}
          className="rounded border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800"
        >
          Open
        </button>
      </div>

      <div className="text-xs text-zinc-400 space-y-1">
        <div>{projectStatus}</div>
        <div>Project: {projectName || "n/a"}</div>
        <div>Description: {projectDescription || "n/a"}</div>
        <div>Config: {projectConfigPath || "n/a"}</div>
        <div>Shared DWG: {projectSharedDwgPath || "n/a"}</div>
        <div>Shared DWG File: {projectSharedDwgFileName || "n/a"}</div>
        <div>Cameras: {projectCameras.length}</div>
        <div>Shared markers: {sharedMarkers.length}</div>
      </div>

      {projectCameras.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2 rounded border border-zinc-700 p-3">
            <label className="block text-xs">
              Active Camera
              <select
                value={activeProjectCameraId || projectCameras[0]?.id || ""}
                onChange={(e) => openProjectCamera(e.target.value)}
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
              >
                {projectCameras.map((camera) => (
                  <option key={camera.id} value={camera.id}>
                    {camera.name} ({camera.id}) {camera.location || camera.area ? `- ${camera.location || camera.area}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button onClick={syncCurrentPairsToSharedMarkers} className="rounded border border-emerald-700 bg-emerald-900/30 px-3 py-1.5 text-xs hover:bg-emerald-800/40">
                Sync Current Pairs → Shared Markers
              </button>
              <button onClick={beginSharedMarkerCapture} className="rounded border border-amber-700 bg-amber-900/30 px-3 py-1.5 text-xs hover:bg-amber-800/40">
                Capture Shared Markers for This Camera
              </button>
              <button onClick={stopSharedMarkerCapture} className="rounded border border-zinc-600 px-3 py-1.5 text-xs hover:bg-zinc-800">
                Stop Shared Capture
              </button>
            </div>
            <div className="text-xs text-zinc-500">
              Marker reuse flow: calibrate camera 1 and sync markers, open camera 2, run shared capture, then solve camera 2.
            </div>
          </div>

          <div className="space-y-2 rounded border border-zinc-700 p-3">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={projectRunStageChain} onChange={(e) => setProjectRunStageChain(e.target.checked)} />
              Run full stage chain after solvePnP for each camera
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={projectAutoTriangulate} onChange={(e) => setProjectAutoTriangulate(e.target.checked)} />
              Auto-run multi-view triangulation after all cameras
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={runProjectSequence}
                disabled={projectSequenceRunning}
                className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-sm hover:bg-cyan-800/50 disabled:opacity-40"
              >
                {projectSequenceRunning ? "Running Project Sequence..." : "Run Project Sequence (All Cameras)"}
              </button>
              <button
                onClick={() => runProjectTriangulation()}
                className="rounded border border-violet-700 bg-violet-900/40 px-3 py-2 text-sm hover:bg-violet-800/50"
              >
                Run Multi-View Triangulation
              </button>
            </div>
            <div className="text-xs text-zinc-400">{projectSequenceStatus}</div>
            <div className="text-xs text-zinc-400">{triangulationStatus}</div>
          </div>
        </div>
      ) : null}

      {projectSequenceLogs.length ? (
        <pre className="max-h-40 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">
          {projectSequenceLogs.join("\n")}
        </pre>
      ) : null}

      {sharedMarkers.length ? (
        <div className="max-h-48 overflow-auto rounded border border-zinc-700 p-2 text-xs space-y-1">
          {sharedMarkers.slice(0, 120).map((marker, idx) => {
            const obsCount = Object.keys(marker.observations || {}).length;
            return (
              <div key={`${marker.id || "m"}-${idx}`} className="flex items-center justify-between gap-2">
                <span>
                  {marker.id} W[
                  {Array.isArray(marker.world) && marker.world.length === 3
                    ? marker.world.map((v) => Number(v).toFixed(2)).join(",")
                    : "n/a"}
                  ]
                </span>
                <span className="text-zinc-500">observed by {obsCount} camera(s)</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {triangulationResult?.points?.length ? (
        <pre className="max-h-48 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">
          {JSON.stringify(triangulationResult, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}
