"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const STAGES = [
  "intrinsic",
  "ground-plane",
  "z-mapping",
  "cad-3d-dwg",
  "extrinsic",
  "sfm",
  "overlay",
];

function ProjectedCadViewer({ segments, onPickWorld, pickedWorldPoints = [], title = "" }) {
  const canvasRef = useRef(null);
  const [yaw, setYaw] = useState(35);
  const [pitch, setPitch] = useState(-28);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const dragRef = useRef({ dragging: false, mode: "rotate", x: 0, y: 0 });
  const projectedRef = useRef([]);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const points = useMemo(() => {
    const all = [];
    for (const s of segments) {
      all.push(s.a, s.b);
    }
    return all;
  }, [segments]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!segments.length || !points.length) {
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "14px sans-serif";
      ctx.fillText("No preview geometry", 20, 30);
      return;
    }

    const center = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
    center[0] /= points.length;
    center[1] /= points.length;
    center[2] /= points.length;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const p of points) {
      minX = Math.min(minX, p[0]);
      minY = Math.min(minY, p[1]);
      minZ = Math.min(minZ, p[2]);
      maxX = Math.max(maxX, p[0]);
      maxY = Math.max(maxY, p[1]);
      maxZ = Math.max(maxZ, p[2]);
    }

    const y = (yaw * Math.PI) / 180;
    const x = (pitch * Math.PI) / 180;

    const cy = Math.cos(y);
    const sy = Math.sin(y);
    const cx = Math.cos(x);
    const sx = Math.sin(x);

    const project = (p) => {
      const px = p[0] - center[0];
      const py = p[1] - center[1];
      const pz = p[2] - center[2];

      const yawX = px * cy - py * sy;
      const yawY = px * sy + py * cy;

      const pitchY = yawY * cx - pz * sx;
      const pitchZ = yawY * sx + pz * cx;

      const depth = 6 + pitchZ;
      const scale = (120 / Math.max(depth, 0.8)) * zoom;
      const sx2 = canvas.width / 2 + yawX * scale + panX;
      const sy2 = canvas.height / 2 - pitchY * scale + panY;
      return [sx2, sy2];
    };

    const projected = [];

    const boxCorners = [
      [minX, minY, minZ],
      [maxX, minY, minZ],
      [maxX, maxY, minZ],
      [minX, maxY, minZ],
      [minX, minY, maxZ],
      [maxX, minY, maxZ],
      [maxX, maxY, maxZ],
      [minX, maxY, maxZ],
    ];
    const boxEdges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    for (const [a, b] of boxEdges) {
      const p1 = project(boxCorners[a]);
      const p2 = project(boxCorners[b]);
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
    }

    const axisLen = Math.max(maxX - minX, maxY - minY, maxZ - minZ) * 0.35 || 1;
    const c0 = center;
    const xAxis = [c0[0] + axisLen, c0[1], c0[2]];
    const yAxis = [c0[0], c0[1] + axisLen, c0[2]];
    const zAxis = [c0[0], c0[1], c0[2] + axisLen];
    const c2 = project(c0);
    const x2 = project(xAxis);
    const y2 = project(yAxis);
    const z2 = project(zAxis);

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ef4444";
    ctx.beginPath(); ctx.moveTo(c2[0], c2[1]); ctx.lineTo(x2[0], x2[1]); ctx.stroke();
    ctx.strokeStyle = "#22c55e";
    ctx.beginPath(); ctx.moveTo(c2[0], c2[1]); ctx.lineTo(y2[0], y2[1]); ctx.stroke();
    ctx.strokeStyle = "#3b82f6";
    ctx.beginPath(); ctx.moveTo(c2[0], c2[1]); ctx.lineTo(z2[0], z2[1]); ctx.stroke();
    ctx.fillStyle = "#ef4444";
    ctx.fillText("X", x2[0] + 4, x2[1] - 4);
    ctx.fillStyle = "#22c55e";
    ctx.fillText("Y", y2[0] + 4, y2[1] - 4);
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("Z", z2[0] + 4, z2[1] - 4);

    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 1;
    for (const seg of segments) {
      const p1 = project(seg.a);
      const p2 = project(seg.b);
      projected.push({ world: seg.a, screen: p1 });
      projected.push({ world: seg.b, screen: p2 });
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
    }

    projectedRef.current = projected;

    if (pickedWorldPoints.length) {
      ctx.fillStyle = "#22c55e";
      ctx.strokeStyle = "#22c55e";
      for (let i = 0; i < pickedWorldPoints.length; i += 1) {
        const wp = pickedWorldPoints[i];
        const pp = project(wp);
        ctx.beginPath();
        ctx.arc(pp[0], pp[1], 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(String(i + 1), pp[0] + 7, pp[1] - 7);
      }
    }

    if (hoveredPoint?.world) {
      const hp = project(hoveredPoint.world);
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(hp[0], hp[1], 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText("preview", hp[0] + 8, hp[1] - 8);
    }

    if (title) {
      ctx.fillStyle = "#e5e7eb";
      ctx.font = "13px sans-serif";
      ctx.fillText(title, 12, 22);
    }
  }, [segments, yaw, pitch, points, zoom, panX, panY, pickedWorldPoints, hoveredPoint, title]);

  function onMouseDown(e) {
    const mode = e.button === 2 ? "pan" : "rotate";
    dragRef.current = {
      dragging: true,
      mode,
      x: e.clientX,
      y: e.clientY,
    };
  }

  function onMouseMove(e) {
    if (!dragRef.current.dragging) {
      return;
    }

    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;

    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;

    if (dragRef.current.mode === "rotate") {
      setYaw((v) => v - dx * 0.35);
      setPitch((v) => v - dy * 0.35);
    } else {
      setPanX((v) => v + dx);
      setPanY((v) => v + dy);
    }

    if (dragRef.current.dragging) {
      setHoveredPoint(null);
    }
  }

  function onMouseUp() {
    dragRef.current.dragging = false;
  }

  function onWheel(e) {
    e.preventDefault();
    const next = e.deltaY < 0 ? zoom * 1.08 : zoom / 1.08;
    setZoom(Math.max(0.2, Math.min(4, next)));
  }

  function onResetView() {
    setYaw(35);
    setPitch(-28);
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }

  function onCanvasClick(e) {
    if (typeof onPickWorld !== "function") {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const item of projectedRef.current) {
      const dx = item.screen[0] - x;
      const dy = item.screen[1] - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        best = item;
      }
    }

    if (best && bestDist <= 24) {
      onPickWorld(best.world);
    }
  }

  function onCanvasMove(e) {
    onMouseMove(e);
    if (dragRef.current.dragging) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const item of projectedRef.current) {
      const dx = item.screen[0] - x;
      const dy = item.screen[1] - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        best = item;
      }
    }

    if (best && bestDist <= 26) {
      setHoveredPoint(best);
    } else {
      setHoveredPoint(null);
    }
  }

  function applyPresetView(name) {
    if (name === "front") {
      setYaw(0);
      setPitch(0);
    } else if (name === "back") {
      setYaw(180);
      setPitch(0);
    } else if (name === "left") {
      setYaw(-90);
      setPitch(0);
    } else if (name === "right") {
      setYaw(90);
      setPitch(0);
    } else if (name === "top") {
      setYaw(0);
      setPitch(-90);
    } else if (name === "bottom") {
      setYaw(0);
      setPitch(90);
    } else {
      onResetView();
    }
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={620}
        height={360}
        onMouseDown={onMouseDown}
        onMouseMove={onCanvasMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={onWheel}
        onClick={onCanvasClick}
        className="w-full rounded border border-zinc-700 cursor-grab active:cursor-grabbing"
      />
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>Mouse: Left drag rotate | Right drag pan | Wheel zoom</span>
        <button onClick={onResetView} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Reset View</button>
      </div>
      <div className="text-xs text-zinc-500">Current view — Yaw: {yaw.toFixed(1)}°, Pitch: {pitch.toFixed(1)}°</div>
      <div className="flex flex-wrap gap-2 text-xs">
        <button onClick={() => applyPresetView("front")} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Front</button>
        <button onClick={() => applyPresetView("left")} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Left</button>
        <button onClick={() => applyPresetView("right")} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Right</button>
        <button onClick={() => applyPresetView("back")} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Back</button>
        <button onClick={() => applyPresetView("top")} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Top</button>
        <button onClick={() => applyPresetView("bottom")} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Bottom</button>
        <button onClick={() => applyPresetView("iso")} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Iso</button>
      </div>
    </div>
  );
}

export default function Home() {
  const [cameraType, setCameraType] = useState("cctv");
  const [sourceMode, setSourceMode] = useState("rtsp");
  const [sourceUrl, setSourceUrl] = useState("rtsp://camera-stream-url");
  const [useGroundPlane, setUseGroundPlane] = useState(true);
  const [useZDirection, setUseZDirection] = useState(true);
  const [useSfm, setUseSfm] = useState(true);
  const [useOverlay, setUseOverlay] = useState(true);

  const [currentJobId, setCurrentJobId] = useState(null);
  const [currentJob, setCurrentJob] = useState(null);
  const [jobLoading, setJobLoading] = useState(false);

  const [dwgMessage, setDwgMessage] = useState("No DWG/DXF uploaded yet.");
  const [dwgFileName, setDwgFileName] = useState(undefined);
  const [dwgPath, setDwgPath] = useState(undefined);
  const [segments, setSegments] = useState([]);
  const [sampleStatus, setSampleStatus] = useState("Sample setup not loaded.");

  const [checkerboard, setCheckerboard] = useState("9x6");
  const [squareSize, setSquareSize] = useState(0.024);
  const [minSamples, setMinSamples] = useState(18);

  const [sfmMessage, setSfmMessage] = useState("No SfM images uploaded yet.");
  const [overlayOpacity, setOverlayOpacity] = useState(65);
  const [feedEnabled, setFeedEnabled] = useState(false);
  const [feedNonce, setFeedNonce] = useState(0);
  const [feedError, setFeedError] = useState("");
  const [feedFps, setFeedFps] = useState(12);
  const [feedWidth, setFeedWidth] = useState(960);
  const [snapshotDataUrl, setSnapshotDataUrl] = useState("");
  const [snapshotStatus, setSnapshotStatus] = useState("No snapshot captured yet.");
  const [correspondenceText, setCorrespondenceText] = useState(
    '[\n  {"world":[0,0,0],"pixel":[100,100]},\n  {"world":[6,0,0],"pixel":[500,110]},\n  {"world":[6,4,0],"pixel":[520,320]},\n  {"world":[0,4,0],"pixel":[90,310]}\n]'
  );
  const [solveStatus, setSolveStatus] = useState("No headless solve run yet.");
  const [intrinsicSessionId, setIntrinsicSessionId] = useState("default");
  const [intrinsicStatus, setIntrinsicStatus] = useState("No intrinsic samples captured yet.");
  const [intrinsicSampleCount, setIntrinsicSampleCount] = useState(0);
  const [intrinsicsPath, setIntrinsicsPath] = useState("");
  const [intrinsicSamples, setIntrinsicSamples] = useState([]);
  const [intrinsicActiveIndex, setIntrinsicActiveIndex] = useState(0);
  const [checkerboardSquareMm, setCheckerboardSquareMm] = useState(30);
  const [checkerboardPdfStatus, setCheckerboardPdfStatus] = useState("No checkerboard PDF generated yet.");

  const [pendingWorldPoint, setPendingWorldPoint] = useState(null);
  const [pendingImagePoint, setPendingImagePoint] = useState(null);
  const [correspondences, setCorrespondences] = useState([]);
  const [imagePickMode, setImagePickMode] = useState("ground");
  const [zMappings, setZMappings] = useState([]);
  const [selectedGroundPairIndex, setSelectedGroundPairIndex] = useState(0);
  const [zOffsetMeters, setZOffsetMeters] = useState(1.5);
  const [pendingZGroundIndex, setPendingZGroundIndex] = useState(null);
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamStatus, setWebcamStatus] = useState("Webcam not started.");

  const [stageOutputs, setStageOutputs] = useState({
    intrinsic: "uploads/stages/intrinsic.npz",
    "ground-plane": "uploads/stages/ground-plane.yaml",
    "z-mapping": "uploads/stages/z-mapping.yaml",
    "cad-3d-dwg": "uploads/stages/cad-3d.json",
    extrinsic: "uploads/stages/extrinsic.yaml",
    sfm: "uploads/stages/sfm.json",
    overlay: "uploads/stages/overlay.json",
  });
  const [stageMessages, setStageMessages] = useState({
    intrinsic: "Ready",
    "ground-plane": "Ready",
    "z-mapping": "Ready",
    "cad-3d-dwg": "Ready",
    extrinsic: "Ready",
    sfm: "Ready",
    overlay: "Ready",
  });
  const [activeStage, setActiveStage] = useState("");
  const [completedStages, setCompletedStages] = useState({
    intrinsic: false,
    "ground-plane": false,
    "z-mapping": false,
    "cad-3d-dwg": false,
    extrinsic: false,
    sfm: false,
    overlay: false,
  });
  const [stageJobState, setStageJobState] = useState({
    intrinsic: { status: "idle", progress: 0, logs: [] },
    "ground-plane": { status: "idle", progress: 0, logs: [] },
    "z-mapping": { status: "idle", progress: 0, logs: [] },
    "cad-3d-dwg": { status: "idle", progress: 0, logs: [] },
    extrinsic: { status: "idle", progress: 0, logs: [] },
    sfm: { status: "idle", progress: 0, logs: [] },
    overlay: { status: "idle", progress: 0, logs: [] },
  });
  const [stageResolvedOutputs, setStageResolvedOutputs] = useState({});
  const [snapshotNaturalSize, setSnapshotNaturalSize] = useState({ width: 1, height: 1 });
  const [draggingImagePointIndex, setDraggingImagePointIndex] = useState(null);

  const dwgInputRef = useRef(null);
  const sfmInputRef = useRef(null);
  const snapshotImgRef = useRef(null);
  const snapshotOverlayRef = useRef(null);
  const webcamVideoRef = useRef(null);
  const intrinsicVideoRef = useRef(null);
  const groundVideoRef = useRef(null);

  useEffect(() => {
    if (!currentJobId) return;

    const timer = setInterval(async () => {
      const res = await fetch(`/api/calibration/jobs/${currentJobId}`);
      if (!res.ok) return;
      const data = await res.json();
      setCurrentJob(data.job);
      const stageName = data.job?.stage;
      if (stageName) {
        setStageJobState((prev) => ({
          ...prev,
          [stageName]: {
            status: data.job.status || "idle",
            progress: data.job.progress || 0,
            logs: Array.isArray(data.job.logs) ? data.job.logs : [],
          },
        }));

        const outPath = data.job?.result?.outputPath || data.job?.result?.calibrationFile || data.job?.result?.outputDir;
        if (outPath) {
          setStageResolvedOutputs((prev) => ({ ...prev, [stageName]: outPath }));
        }
      }
      if (data.job.status === "completed" || data.job.status === "failed") {
        if (data.job.status === "completed" && stageName) {
          setCompletedStages((prev) => ({ ...prev, [stageName]: true }));
          setStageMessage(stageName, "Completed");
        }
        if (data.job.status === "failed" && stageName) {
          setStageMessage(stageName, "Failed");
        }
        clearInterval(timer);
      }
    }, 700);

    return () => clearInterval(timer);
  }, [currentJobId]);

  useEffect(() => {
    loadIntrinsicSamples();
  }, [intrinsicSessionId]);

  useEffect(() => {
    return () => {
      const stream = webcamVideoRef.current?.srcObject;
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  async function startStage(stage) {
    const needsDwg = stage !== "intrinsic";
    if (needsDwg && !dwgPath) {
      const msg = "Upload DWG/DXF first. This stage needs CAD path.";
      setDwgMessage(msg);
      setStageMessage(stage, msg);
      return { ok: false, error: msg };
    }

    setJobLoading(true);
    try {
      const res = await fetch("/api/calibration/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          config: {
            cameraType,
            sourceMode,
            sourceUrl: sourceMode === "webcam" ? "__webcam__" : sourceUrl,
            dwgFileName,
            dwgPath,
            checkerboard,
            squareSize,
            minSamples,
            stageOutputPath: stageOutputs[stage] || "",
            webMode: true,
            options: {
              useGroundPlane,
              useZDirection,
              useSfm,
              useRealtimeOverlay: useOverlay,
            },
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to start stage");
      }
      setCurrentJobId(data.job.id);
      setCurrentJob(data.job);
      setActiveStage(stage);
      setDwgMessage(`Started stage '${stage}' with CAD: ${dwgFileName ?? dwgPath}`);
      setStageMessage(stage, `Started. Output: ${stageOutputs[stage] || "default"}`);
      setStageJobState((prev) => ({
        ...prev,
        [stage]: {
          status: data.job.status || "queued",
          progress: data.job.progress || 0,
          logs: Array.isArray(data.job.logs) ? data.job.logs : ["Job started"],
        },
      }));
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start stage";
      setDwgMessage(msg);
      setStageMessage(stage, msg);
      return { ok: false, error: msg };
    } finally {
      setJobLoading(false);
    }
  }

  async function runStageCard(stage) {
    const readiness = getStageReadiness(stage);
    if (!readiness.enabled) {
      const msg = readiness.status;
      setStageMessage(stage, msg);
      setStageJobState((prev) => ({
        ...prev,
        [stage]: { status: "blocked", progress: 0, logs: [msg] },
      }));
      return;
    }

    setStageMessage(stage, "Running...");
    setStageJobState((prev) => ({
      ...prev,
      [stage]: { status: "starting", progress: 0, logs: ["Starting stage..."] },
    }));
    const started = await startStage(stage);
    if (!started?.ok) {
      setStageJobState((prev) => ({
        ...prev,
        [stage]: { status: "failed", progress: 100, logs: [started?.error || "Stage did not start"] },
      }));
    }
  }

  function stageAllowed(stage) {
    const idx = STAGES.indexOf(stage);
    if (idx <= 0) {
      return true;
    }
    const prevStage = STAGES[idx - 1];
    return Boolean(completedStages[prevStage]);
  }

  function getStageReadiness(stage) {
    if (!stageAllowed(stage)) {
      return { enabled: false, status: "Complete previous stage first." };
    }

    if (stage === "intrinsic") {
      if (sourceMode !== "webcam" && !sourceUrl) {
        return { enabled: false, status: "Set source URL or switch to webcam." };
      }
      return { enabled: true, status: "Ready. Capture samples and run intrinsic stage." };
    }

    if (stage === "ground-plane") {
      if (!dwgPath) {
        return { enabled: false, status: "Upload CAD/DWG first." };
      }
      if (!snapshotDataUrl) {
        return { enabled: false, status: "Capture snapshot first." };
      }
      if (correspondences.length < 4) {
        return { enabled: false, status: `Add at least 4 image↔CAD point pairs (current: ${correspondences.length}).` };
      }
      return { enabled: true, status: "Ready. Run Ground Plane stage." };
    }

    if (stage === "z-mapping") {
      if (!stageAllowed(stage)) {
        return { enabled: false, status: "Complete Ground Plane stage first." };
      }
      if (!snapshotDataUrl) {
        return { enabled: false, status: "Capture snapshot first for Z preview." };
      }
      if (zMappings.length < 1) {
        return { enabled: false, status: "Add at least 1 Z-direction point from existing ground points." };
      }
      return { enabled: true, status: "Ready. Run Z Mapping stage." };
    }

    if (stage === "cad-3d-dwg") {
      if (!stageAllowed(stage)) {
        return { enabled: false, status: "Complete Z Mapping stage first." };
      }
      if (!dwgPath) {
        return { enabled: false, status: "Upload CAD/DWG first." };
      }
      return { enabled: true, status: "Ready. Review CAD with ground+Z highlights and run stage." };
    }

    return { enabled: true, status: "Ready. Run this stage." };
  }

  async function uploadDwg(file) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/uploads/dwg", { method: "POST", body: form });
    const data = await res.json();

    setDwgFileName(data.fileName);
    setDwgPath(data.path);
    setDwgMessage(data.note);
    setSegments(data.preview?.segments ?? []);
  }

  async function loadSampleArrangement() {
    try {
      const res = await fetch("/api/samples");
      const data = await res.json();

      if (!data?.sample) {
        setSampleStatus("Sample API returned no data.");
        return;
      }

      const sample = data.sample;
      setSourceUrl(sample.sourceUrl);
      setDwgPath(sample.dwgPath);
      setDwgFileName(sample.dwgPath?.split("/").pop());
      setSegments(sample.preview?.segments ?? []);
      setCheckerboard(sample.intrinsicDefaults?.checkerboard ?? "9x6");
      setSquareSize(sample.intrinsicDefaults?.squareSize ?? 0.024);
      setMinSamples(sample.intrinsicDefaults?.minSamples ?? 18);

      const info = `Loaded sample. CAD=${sample.dwgExists ? "OK" : "Missing"}, Video=${sample.videoExists ? "OK" : "Missing"}, Segments=${sample.preview?.segmentCount ?? 0}`;
      setSampleStatus(info);
      setDwgMessage(info);
    } catch (err) {
      setSampleStatus(err instanceof Error ? err.message : "Failed to load sample arrangement");
    }
  }

  async function uploadSfmImages(files) {
    if (!files?.length) return;
    const form = new FormData();
    [...files].forEach((file) => form.append("images", file));

    const res = await fetch("/api/uploads/images", { method: "POST", body: form });
    const data = await res.json();
    setSfmMessage(`${data.count} images uploaded. ${data.note}`);
  }

  async function loadIntrinsicSamples() {
    try {
      const res = await fetch(`/api/calibration/web/intrinsic/samples?sessionId=${encodeURIComponent(intrinsicSessionId)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load intrinsic samples");
      }
      const samples = Array.isArray(data.samples) ? data.samples : [];
      setIntrinsicSamples(samples);
      setIntrinsicSampleCount(samples.length);
      setIntrinsicActiveIndex((idx) => {
        if (!samples.length) return 0;
        return Math.max(0, Math.min(idx, samples.length - 1));
      });
    } catch (err) {
      setIntrinsicStatus(err instanceof Error ? err.message : "Failed to load intrinsic samples");
    }
  }

  async function deleteIntrinsicSample(fileName) {
    try {
      const res = await fetch("/api/calibration/web/intrinsic/samples", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: intrinsicSessionId, fileName }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete intrinsic sample");
      }
      await loadIntrinsicSamples();
      setIntrinsicStatus(`Deleted sample: ${fileName}`);
    } catch (err) {
      setIntrinsicStatus(err instanceof Error ? err.message : "Failed to delete intrinsic sample");
    }
  }

  function setStageMessage(stage, message) {
    setStageMessages((prev) => ({ ...prev, [stage]: message }));
  }

  function setStageOutput(stage, outputPath) {
    setStageOutputs((prev) => ({ ...prev, [stage]: outputPath }));
  }

  async function startWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
        await webcamVideoRef.current.play();
      }
      if (intrinsicVideoRef.current) {
        intrinsicVideoRef.current.srcObject = stream;
        await intrinsicVideoRef.current.play();
      }
      if (groundVideoRef.current) {
        groundVideoRef.current.srcObject = stream;
        await groundVideoRef.current.play();
      }
      setWebcamActive(true);
      setWebcamStatus("Webcam connected.");
    } catch (err) {
      setWebcamStatus(err instanceof Error ? err.message : "Webcam access failed");
    }
  }

  function stopWebcam() {
    const stream = webcamVideoRef.current?.srcObject;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = null;
    }
    if (intrinsicVideoRef.current) {
      intrinsicVideoRef.current.srcObject = null;
    }
    if (groundVideoRef.current) {
      groundVideoRef.current.srcObject = null;
    }
    setWebcamActive(false);
    setWebcamStatus("Webcam stopped.");
  }

  function captureWebcamFrame() {
    const video = webcamVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      throw new Error("Webcam is not ready");
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to capture webcam frame");
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  function startBrowserFeed() {
    if (sourceMode === "webcam") {
      startWebcam();
      return;
    }

    if (!sourceUrl) {
      setSfmMessage("Set Source URL first to start browser feed.");
      return;
    }
    setFeedError("");
    setFeedNonce(Date.now());
    setFeedEnabled(true);
  }

  function stopBrowserFeed() {
    if (sourceMode === "webcam") {
      stopWebcam();
      return;
    }
    setFeedEnabled(false);
    setFeedError("");
  }

  function onFeedError() {
    if (!feedEnabled) return;
    setFeedError("Unable to open source/camera or stream interrupted. Retrying...");
    setTimeout(() => {
      setFeedNonce(Date.now());
    }, 1500);
  }

  const liveFeedSrc = `/api/feeds/mjpeg?source=${encodeURIComponent(sourceUrl || "")}&fps=${feedFps}&width=${feedWidth}&nonce=${feedNonce}`;

  async function captureSnapshotWeb() {
    try {
      if (sourceMode === "webcam") {
        const imageDataUrl = captureWebcamFrame();
        const saveRes = await fetch("/api/calibration/web/snapshot-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl }),
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok) {
          throw new Error(saveData?.error || "Webcam snapshot save failed");
        }
        setSnapshotDataUrl(saveData.snapshotDataUrl || imageDataUrl);
        setSnapshotStatus(`Webcam snapshot captured: ${saveData.outputPath}`);
        return;
      }

      const res = await fetch("/api/calibration/web/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Snapshot capture failed");
      }
      setSnapshotDataUrl(data.snapshotDataUrl || "");
      setSnapshotStatus(`Snapshot captured from ${sourceUrl}`);
    } catch (err) {
      setSnapshotStatus(err instanceof Error ? err.message : "Snapshot capture failed");
    }
  }

  async function captureIntrinsicSample() {
    try {
      if (sourceMode === "webcam") {
        const imageDataUrl = captureWebcamFrame();
        const res = await fetch("/api/calibration/web/intrinsic/capture-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl, checkerboard, sessionId: intrinsicSessionId }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Webcam intrinsic sample capture failed");
        }
        setIntrinsicSampleCount(data.sampleCount || 0);
        setIntrinsicStatus(data.message || "Intrinsic sample updated");
        if (data.snapshotDataUrl) {
          setSnapshotDataUrl(data.snapshotDataUrl);
        }
        await loadIntrinsicSamples();
        return;
      }

      const res = await fetch("/api/calibration/web/intrinsic/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl,
          checkerboard,
          sessionId: intrinsicSessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Intrinsic sample capture failed");
      }

      setIntrinsicSampleCount(data.sampleCount || 0);
      setIntrinsicStatus(data.message || "Intrinsic sample updated");
      if (data.snapshotDataUrl) {
        setSnapshotDataUrl(data.snapshotDataUrl);
      }
      await loadIntrinsicSamples();
    } catch (err) {
      setIntrinsicStatus(err instanceof Error ? err.message : "Intrinsic sample capture failed");
    }
  }

  async function solveIntrinsicWeb() {
    try {
      const res = await fetch("/api/calibration/web/intrinsic/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: intrinsicSessionId,
          checkerboard,
          squareSize,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Intrinsic solve failed");
      }

      const rms = data?.result?.result?.rms;
      setIntrinsicsPath(data.outputNpz || "");
      setIntrinsicStatus(`Intrinsic solved. RMS=${typeof rms === "number" ? rms.toFixed(4) : "n/a"}`);
    } catch (err) {
      setIntrinsicStatus(err instanceof Error ? err.message : "Intrinsic solve failed");
    }
  }

  async function downloadCheckerboardPdf() {
    try {
      setCheckerboardPdfStatus("Generating A3 landscape checkerboard PDF...");
      const res = await fetch("/api/calibration/web/intrinsic/checkerboard-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkerboard,
          squareMm: Number(checkerboardSquareMm),
          marginMm: 10,
        }),
      });

      if (!res.ok) {
        let message = "Failed to generate checkerboard PDF";
        try {
          const data = await res.json();
          message = data?.error || message;
        } catch {
          // ignore json parse
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `checkerboard-${checkerboard}-${checkerboardSquareMm}mm-A3-landscape.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setCheckerboardPdfStatus("PDF generated. Print at 100% scale (disable Fit to Page).");
    } catch (err) {
      setCheckerboardPdfStatus(err instanceof Error ? err.message : "Checkerboard PDF generation failed");
    }
  }

  function handleCadPick(world) {
    if (!pendingImagePoint) {
      setSolveStatus("First click on snapshot image to choose pixel point, then pick CAD point.");
      return;
    }

    const pair = {
      world,
      pixel: pendingImagePoint,
    };

    setCorrespondences((prev) => {
      const next = [...prev, pair];
      setCorrespondenceText(JSON.stringify(next, null, 2));
      return next;
    });
    setPendingWorldPoint(null);
    setPendingImagePoint(null);
    setSolveStatus("Point pair added. Repeat: Image point first, then CAD point.");
  }

  function onSnapshotPick(e) {
    const overlayEl = snapshotOverlayRef.current;
    if (!overlayEl) {
      return;
    }

    const rect = overlayEl.getBoundingClientRect();
    const xView = e.clientX - rect.left;
    const yView = e.clientY - rect.top;

    const scaleX = snapshotNaturalSize.width / rect.width;
    const scaleY = snapshotNaturalSize.height / rect.height;

    const xPix = xView * scaleX;
    const yPix = yView * scaleY;

    if (imagePickMode === "z" && pendingZGroundIndex !== null) {
      const base = correspondences[pendingZGroundIndex];
      if (!base) {
        setSolveStatus("Selected ground point not found. Choose again.");
        setPendingZGroundIndex(null);
        return;
      }

      const wz = [
        Number(base.world[0]),
        Number(base.world[1]),
        Number(base.world[2]) + Number(zOffsetMeters),
      ];

      const item = {
        baseIndex: pendingZGroundIndex,
        worldBase: base.world,
        worldZ: wz,
        pixelBase: base.pixel,
        pixelZ: [xPix, yPix],
      };

      setZMappings((prev) => [...prev, item]);
      setPendingZGroundIndex(null);
      setSolveStatus("Z-direction point added.");
      return;
    }

    setPendingImagePoint([xPix, yPix]);
    setSolveStatus(`Image point selected: [${xPix.toFixed(1)}, ${yPix.toFixed(1)}]. Now pick CAD point.`);
  }

  function beginZPointCapture() {
    if (!correspondences.length) {
      setSolveStatus("Add ground-plane pairs first.");
      return;
    }
    const idx = Math.max(0, Math.min(correspondences.length - 1, selectedGroundPairIndex));
    setImagePickMode("z");
    setPendingZGroundIndex(idx);
    setSolveStatus(`Z-point capture armed for ground pair #${idx + 1}. Click image point above it.`);
  }

  function clearZMappings() {
    setZMappings([]);
    setPendingZGroundIndex(null);
  }

  function undoZMapping() {
    setZMappings((prev) => prev.slice(0, -1));
  }

  function deleteZMapping(index) {
    setZMappings((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDraggedImagePoint(clientX, clientY) {
    if (draggingImagePointIndex === null || !snapshotImgRef.current) {
      return;
    }
    const img = snapshotImgRef.current;
    const rect = img.getBoundingClientRect();
    const xView = clientX - rect.left;
    const yView = clientY - rect.top;
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const xPix = Math.max(0, Math.min(img.naturalWidth, xView * scaleX));
    const yPix = Math.max(0, Math.min(img.naturalHeight, yView * scaleY));

    setCorrespondences((prev) => {
      const next = prev.map((p, i) => (i === draggingImagePointIndex ? { ...p, pixel: [xPix, yPix] } : p));
      setCorrespondenceText(JSON.stringify(next, null, 2));
      return next;
    });
  }

  function onImagePointMouseDown(index, e) {
    e.preventDefault();
    e.stopPropagation();
    setDraggingImagePointIndex(index);
  }

  useEffect(() => {
    if (draggingImagePointIndex === null) {
      return;
    }

    const onMove = (ev) => {
      updateDraggedImagePoint(ev.clientX, ev.clientY);
    };
    const onUp = () => {
      setDraggingImagePointIndex(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingImagePointIndex]);

  function clearPairs() {
    setCorrespondences([]);
    setCorrespondenceText("[]");
    setPendingWorldPoint(null);
    setPendingImagePoint(null);
  }

  function undoPair() {
    setCorrespondences((prev) => {
      const next = prev.slice(0, -1);
      setCorrespondenceText(JSON.stringify(next, null, 2));
      return next;
    });
  }

  function deletePair(index) {
    setCorrespondences((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setCorrespondenceText(JSON.stringify(next, null, 2));
      return next;
    });
  }

  async function runHeadlessSolve() {
    try {
      const correspondences = JSON.parse(correspondenceText);
      const res = await fetch("/api/calibration/web/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correspondences,
          intrinsicsPath,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Headless solve failed");
      }
      setSolveStatus(`Headless solve OK. Output: ${data.outputYaml}`);
    } catch (err) {
      setSolveStatus(err instanceof Error ? err.message : "Headless solve failed");
    }
  }

  function renderStageStatus(stage) {
    const state = stageJobState[stage] || { status: "idle", progress: 0, logs: [] };
    const outputPath = stageResolvedOutputs[stage] || stageOutputs[stage] || "";
    const readiness = getStageReadiness(stage);
    const effectiveLogs = (state.logs && state.logs.length)
      ? state.logs
      : [readiness.status || "No logs yet"];
    return (
      <div className="space-y-2 rounded border border-zinc-700 p-3">
        <div className="flex items-center justify-between text-xs">
          <span>Status: {state.status}</span>
          <span>Progress: {state.progress}%</span>
        </div>
        <div className="h-2 rounded bg-zinc-800">
          <div className="h-2 rounded bg-cyan-500" style={{ width: `${state.progress}%` }} />
        </div>
        <pre className="max-h-40 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">
          {effectiveLogs.slice(-120).join("\n")}
        </pre>
        {outputPath ? <p className="text-xs text-zinc-400 break-all">Output: {outputPath}</p> : null}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Calibration2 Browser Console (Next.js - JS)</h1>
          <p className="text-sm text-zinc-400">
            Workflow covers camera model selection, intrinsic/extrinsic calibration, ground and Z mapping, 3D DWG alignment,
            SfM uploads, and CCTV-to-CAD overlay orchestration.
          </p>
        </header>

        <section className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 md:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-lg font-medium">Camera Setup</h2>
            <label className="block text-sm">
              Camera Type
              <select value={cameraType} onChange={(e) => setCameraType(e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2">
                <option value="pinhole">PinHole</option>
                <option value="fisheye">Fish Eye</option>
                <option value="wide-angle">Wide Angle</option>
                <option value="cctv">CCTV</option>
              </select>
            </label>
            <label className="block text-sm">
              Source Mode
              <select value={sourceMode} onChange={(e) => setSourceMode(e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2">
                <option value="rtsp">RTSP / File URL</option>
                <option value="webcam">Browser Webcam</option>
              </select>
            </label>
            <label className="block text-sm">
              Source URL / Stream
              <input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                disabled={sourceMode === "webcam"}
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 disabled:opacity-40"
              />
            </label>
            {sourceMode === "webcam" ? <p className="text-xs text-zinc-400">{webcamStatus}</p> : null}
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-medium">Calibration Features</h2>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useGroundPlane} onChange={(e) => setUseGroundPlane(e.target.checked)} /> Ground Plane Mapping</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useZDirection} onChange={(e) => setUseZDirection(e.target.checked)} /> Z Direction Mapping</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useSfm} onChange={(e) => setUseSfm(e.target.checked)} /> Structure from Motion</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useOverlay} onChange={(e) => setUseOverlay(e.target.checked)} /> CCTV ↔ 3D DWG Overlay</label>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={loadSampleArrangement} className="rounded border border-emerald-700 bg-emerald-900/40 px-3 py-2 text-sm hover:bg-emerald-800/50">
              Load Built-in Sample Arrangement
            </button>
            <span className="text-xs text-zinc-400">{sampleStatus}</span>
          </div>
        </section>


        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <h2 className="text-lg font-medium">Browser Feed (RTSP/CCTV/File)</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
            <label className="text-xs">FPS
              <input type="number" min={2} max={30} value={feedFps} onChange={(e) => setFeedFps(Number(e.target.value))} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm" />
            </label>
            <label className="text-xs">Width
              <input type="number" min={320} max={1920} value={feedWidth} onChange={(e) => setFeedWidth(Number(e.target.value))} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm" />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={startBrowserFeed} className="rounded border border-emerald-700 bg-emerald-900/40 px-3 py-2 text-sm hover:bg-emerald-800/50">
              {sourceMode === "webcam" ? "Start Webcam" : "Start Feed in Browser"}
            </button>
            <button onClick={stopBrowserFeed} className="rounded border border-rose-700 bg-rose-900/40 px-3 py-2 text-sm hover:bg-rose-800/50">
              {sourceMode === "webcam" ? "Stop Webcam" : "Stop Feed"}
            </button>
          </div>
          <p className="text-xs text-zinc-400 break-all">Source: {sourceMode === "webcam" ? "Browser webcam" : (sourceUrl || "not set")}</p>
          {feedError ? <p className="text-xs text-amber-300">{feedError}</p> : null}
          {sourceMode === "webcam" ? (
            <video
              ref={webcamVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full max-h-[420px] rounded border border-zinc-700 object-contain bg-black"
            />
          ) : feedEnabled ? (
            <img src={liveFeedSrc} onError={onFeedError} onLoad={() => setFeedError("")} alt="Live CCTV feed" className="w-full max-h-[420px] rounded border border-zinc-700 object-contain bg-black" />
          ) : (
            <div className="rounded border border-zinc-700 p-6 text-sm text-zinc-400">Feed is stopped. Click “Start Feed in Browser”.</div>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <h2 className="text-xl font-semibold">Step 1: Intrinsic Calibration</h2>
          {!stageAllowed("intrinsic") ? <p className="text-xs text-amber-300">Complete previous stage first.</p> : null}
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
                <input value={stageOutputs.intrinsic || ""} onChange={(e) => setStageOutput("intrinsic", e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button onClick={captureIntrinsicSample} className="rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm hover:bg-blue-800/50">Capture Sample</button>
                {intrinsicSampleCount >= minSamples ? (
                  <button onClick={solveIntrinsicWeb} className="rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm hover:bg-blue-800/50">Solve Intrinsic</button>
                ) : null}
                <button
                  disabled={jobLoading || !stageAllowed("intrinsic")}
                  onClick={() => runStageCard("intrinsic")}
                  className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-sm hover:bg-cyan-800/50 disabled:opacity-40"
                >
                  Run Intrinsic Stage
                </button>
              </div>
              <p className="text-xs text-zinc-300">{intrinsicStatus} (Samples: {intrinsicSampleCount}/{minSamples})</p>
              <p className="text-xs text-zinc-400 break-all">Intrinsics: {intrinsicsPath || "not solved yet"}</p>
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
                <img src={liveFeedSrc} onError={onFeedError} onLoad={() => setFeedError("")} alt="Intrinsic feed" className="w-full max-h-[360px] rounded border border-zinc-700 object-contain bg-black" />
              ) : (
                <div className="rounded border border-zinc-700 p-6 text-sm text-zinc-400">Start camera feed to preview intrinsic capture.</div>
              )}
              {snapshotDataUrl ? <img src={snapshotDataUrl} alt="Intrinsic snapshot" className="w-full max-h-[220px] rounded border border-zinc-700 object-contain bg-black" /> : null}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <h2 className="text-xl font-semibold">Step 2: Ground Plane Calibration</h2>
          <p className={`text-xs ${getStageReadiness("ground-plane").enabled ? "text-emerald-300" : "text-amber-300"}`}>
            {getStageReadiness("ground-plane").status}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="text-sm text-zinc-300">Camera side (draw image points)</div>
              <div className="text-xs text-zinc-400">Workflow: click image point first, then pick CAD point. Existing image points are draggable.</div>
              <div className="text-xs text-zinc-400">Ground mode active in this step.</div>
              {sourceMode === "webcam" ? (
                <video ref={groundVideoRef} autoPlay playsInline muted className="w-full max-h-[320px] rounded border border-zinc-700 object-contain bg-black" />
              ) : feedEnabled ? (
                <img src={liveFeedSrc} onError={onFeedError} onLoad={() => setFeedError("")} alt="Ground feed" className="w-full max-h-[320px] rounded border border-zinc-700 object-contain bg-black" />
              ) : null}
              <button onClick={captureSnapshotWeb} className="rounded border border-indigo-700 bg-indigo-900/40 px-3 py-2 text-sm hover:bg-indigo-800/50">Capture Snapshot for Point Mapping</button>
              <p className="text-xs text-zinc-400">{snapshotStatus}</p>
              {snapshotDataUrl ? (
                <div className="space-y-1">
                  <div className="text-[11px] text-zinc-400">Left click to add image point. Drag green points to adjust.</div>
                  <div className="rounded border border-zinc-700">
                    <div className="relative w-full">
                      <img
                        ref={snapshotImgRef}
                        src={snapshotDataUrl}
                        onLoad={(e) => {
                          setSnapshotNaturalSize({
                            width: e.currentTarget.naturalWidth || 1,
                            height: e.currentTarget.naturalHeight || 1,
                          });
                        }}
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
                        <text x={p.pixel[0] + 10} y={p.pixel[1] - 10} fill="#22c55e" fontSize="16" fontWeight="700">{idx + 1}</text>
                      </g>
                    ))}
                    {pendingImagePoint ? (
                      <g>
                        <circle cx={pendingImagePoint[0]} cy={pendingImagePoint[1]} r="7" fill="#f59e0b" />
                        <text x={pendingImagePoint[0] + 10} y={pendingImagePoint[1] - 10} fill="#f59e0b" fontSize="14" fontWeight="700">P</text>
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
              <div className="max-h-44 overflow-auto rounded border border-zinc-700 p-2 text-xs space-y-1">
                {correspondences.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2">
                    <span>#{idx + 1} W[{p.world.map((v) => Number(v).toFixed(2)).join(",")}] → P[{p.pixel.map((v) => Number(v).toFixed(1)).join(",")}]</span>
                    <button onClick={() => deletePair(idx)} className="rounded border border-zinc-600 px-2 py-0.5 text-[11px] hover:bg-zinc-800">Delete</button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-300">{solveStatus}</p>
            </div>
            <div className="space-y-3">
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
              <div className="flex flex-wrap gap-2">
                <button onClick={() => dwgInputRef.current?.click()} className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-sm hover:bg-cyan-800/50">Upload CAD</button>
                <button onClick={runHeadlessSolve} className="rounded border border-amber-700 bg-amber-900/40 px-3 py-2 text-sm hover:bg-amber-800/50">Solve PnP from Pairs</button>
                <button
                  disabled={jobLoading || !getStageReadiness("ground-plane").enabled}
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
                title={pendingImagePoint ? "Pick CAD point for selected image point" : "First select image point, then CAD point"}
              />
              <label className="block text-xs">Ground Plane Output Path
                <input value={stageOutputs["ground-plane"] || ""} onChange={(e) => setStageOutput("ground-plane", e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
              </label>
              {renderStageStatus("ground-plane")}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <h2 className="text-xl font-semibold">Step 3: z-mapping</h2>
          <p className={`text-xs ${getStageReadiness("z-mapping").enabled ? "text-emerald-300" : "text-amber-300"}`}>
            {getStageReadiness("z-mapping").status}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="text-xs text-zinc-400">Preview includes previous ground-plane mapping + Z direction preview lines.</p>
              {snapshotDataUrl ? (
                <div className="rounded border border-zinc-700 p-2 text-xs text-zinc-300">
                  Ground pairs: {correspondences.length} | Z pairs: {zMappings.length}
                </div>
              ) : (
                <div className="rounded border border-zinc-700 p-2 text-xs text-zinc-400">Capture snapshot in Step 2 for Z preview.</div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs">Base Ground Pair
                  <select value={selectedGroundPairIndex} onChange={(e) => setSelectedGroundPairIndex(Number(e.target.value))} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1">
                    {correspondences.map((_, idx) => (
                      <option key={idx} value={idx}>Ground #{idx + 1}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">Z Offset (m)
                  <input type="number" step="0.1" value={zOffsetMeters} onChange={(e) => setZOffsetMeters(Number(e.target.value))} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={beginZPointCapture} className="rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm hover:bg-blue-800/50">Add Z-Direction Point (Image)</button>
                <button onClick={undoZMapping} className="rounded border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800">Undo Z</button>
                <button onClick={clearZMappings} className="rounded border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800">Clear Z</button>
              </div>
              {snapshotDataUrl ? (
                <div className="rounded border border-zinc-700">
                  <div className="relative w-full">
                    <img src={snapshotDataUrl} alt="Z mapping preview" className="w-full max-h-[320px] rounded bg-black object-contain" />
                    <svg
                      onClick={onSnapshotPick}
                      className="absolute inset-0 h-full w-full cursor-crosshair"
                      viewBox={`0 0 ${snapshotNaturalSize.width} ${snapshotNaturalSize.height}`}
                      preserveAspectRatio="none"
                    >
                      {correspondences.map((p, idx) => (
                        <g key={`zg-base-${idx}`}>
                          <circle cx={p.pixel[0]} cy={p.pixel[1]} r="7" fill="#22c55e" />
                          <text x={p.pixel[0] + 10} y={p.pixel[1] - 10} fill="#22c55e" fontSize="14" fontWeight="700">{idx + 1}</text>
                        </g>
                      ))}
                      {zMappings.map((z, idx) => (
                        <g key={`zg-z-${idx}`}>
                          <line x1={z.pixelBase[0]} y1={z.pixelBase[1]} x2={z.pixelZ[0]} y2={z.pixelZ[1]} stroke="#60a5fa" strokeWidth="2" />
                          <circle cx={z.pixelZ[0]} cy={z.pixelZ[1]} r="7" fill="#2563eb" />
                          <text x={z.pixelZ[0] + 10} y={z.pixelZ[1] - 10} fill="#93c5fd" fontSize="14" fontWeight="700">Z{idx + 1}</text>
                        </g>
                      ))}
                      {pendingZGroundIndex !== null && correspondences[pendingZGroundIndex] ? (
                        <g>
                          <circle cx={correspondences[pendingZGroundIndex].pixel[0]} cy={correspondences[pendingZGroundIndex].pixel[1]} r="8" fill="none" stroke="#f59e0b" strokeWidth="2" />
                          <text x={correspondences[pendingZGroundIndex].pixel[0] + 10} y={correspondences[pendingZGroundIndex].pixel[1] - 10} fill="#f59e0b" fontSize="12" fontWeight="700">Base</text>
                        </g>
                      ) : null}
                    </svg>
                  </div>
                </div>
              ) : null}
              <div className="max-h-40 overflow-auto rounded border border-zinc-700 p-2 text-xs space-y-1">
                {zMappings.map((z, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2">
                    <span>Z#{idx + 1}: Base#{z.baseIndex + 1} Wz[{z.worldZ.map((v) => Number(v).toFixed(2)).join(",")}] → Pz[{z.pixelZ.map((v) => Number(v).toFixed(1)).join(",")}]</span>
                    <button onClick={() => deleteZMapping(idx)} className="rounded border border-zinc-600 px-2 py-0.5 text-[11px] hover:bg-zinc-800">Delete</button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-400 break-all">Ground output: {stageResolvedOutputs["ground-plane"] || stageOutputs["ground-plane"]}</p>
            </div>
            <div className="space-y-2">
              <label className="block text-xs">Z-Mapping Output Path
                <input value={stageOutputs["z-mapping"] || ""} onChange={(e) => setStageOutput("z-mapping", e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
              </label>
              <button
                disabled={jobLoading || !getStageReadiness("z-mapping").enabled}
                onClick={() => runStageCard("z-mapping")}
                className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-sm hover:bg-cyan-800/50 disabled:opacity-40"
              >
                Run z-mapping Stage
              </button>
              {renderStageStatus("z-mapping")}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <h2 className="text-xl font-semibold">Step 4: cad-3d-dwg</h2>
          <p className={`text-xs ${getStageReadiness("cad-3d-dwg").enabled ? "text-emerald-300" : "text-amber-300"}`}>
            {getStageReadiness("cad-3d-dwg").status}
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
              />
              <label className="block text-xs">CAD-3D-DWG Output Path
                <input value={stageOutputs["cad-3d-dwg"] || ""} onChange={(e) => setStageOutput("cad-3d-dwg", e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" />
              </label>
              <button
                disabled={jobLoading || !getStageReadiness("cad-3d-dwg").enabled}
                onClick={() => runStageCard("cad-3d-dwg")}
                className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-sm hover:bg-cyan-800/50 disabled:opacity-40"
              >
                Run cad-3d-dwg Stage
              </button>
              {renderStageStatus("cad-3d-dwg")}
            </div>
          </div>
        </section>

        {STAGES.filter((s) => !["intrinsic", "ground-plane", "z-mapping", "cad-3d-dwg"].includes(s)).map((stage, idx) => (
          <section key={stage} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
            <h2 className="text-xl font-semibold">Step {idx + 5}: {stage}</h2>
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
              disabled={jobLoading || !getStageReadiness(stage).enabled}
              onClick={() => runStageCard(stage)}
              className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-sm capitalize hover:bg-cyan-800/50 disabled:opacity-40"
            >
              Run {stage} Stage
            </button>
            <p className="text-xs text-zinc-300">{stageMessages[stage] || "Ready"}</p>
            {renderStageStatus(stage)}
          </section>
        ))}

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-2 text-lg font-medium">Current Job</h2>
          {!currentJob ? (
            <p className="text-sm text-zinc-400">No stage started yet.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-4">
                <span>ID: {currentJob.id}</span>
                <span>Stage: {currentJob.stage}</span>
                <span>Status: {currentJob.status}</span>
                <span>Progress: {currentJob.progress}%</span>
              </div>
              <div className="h-2 rounded bg-zinc-800">
                <div className="h-2 rounded bg-cyan-500" style={{ width: `${currentJob.progress}%` }} />
              </div>
              <pre className="max-h-52 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
                {JSON.stringify(currentJob, null, 2)}
              </pre>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
