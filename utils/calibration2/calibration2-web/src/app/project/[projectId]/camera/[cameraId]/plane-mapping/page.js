"use client";

import { useRouter, useParams } from "next/navigation";
import { useCalibration } from "@/lib/CalibrationContext";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";

function detectSourceType(sourceUrl) {
  const src = String(sourceUrl || "").trim().toLowerCase();
  if (!src) return "missing";
  if (/^\d+$/.test(src)) return "webcam";
  if (src.startsWith("rtsp://")) return "rtsp/cctv";
  if (src.startsWith("http://") || src.startsWith("https://")) return "http stream";
  if (/\.(mp4|mov|avi|mkv)$/i.test(src)) return "video file";
  return "custom";
}

const POLY_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#f59e0b",
];

function normalizePoint(value) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const point = [Number(value[0]), Number(value[1])];
  return point.every((entry) => Number.isFinite(entry)) ? point : null;
}

function normalizeBox(value) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const box = value.map((entry) => Number(entry));
  return box.every((entry) => Number.isFinite(entry)) ? box : null;
}

function normalizeAutoGroundSuggestions(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => ({
      id: String(item?.id || `auto-ground-${index + 1}`),
      pixel: normalizePoint(item?.pixel),
      score: Number.isFinite(Number(item?.score)) ? Number(item.score) : null,
      person_score: Number.isFinite(Number(item?.person_score ?? item?.personScore))
        ? Number(item?.person_score ?? item?.personScore)
        : null,
      source: String(item?.source || "bbox-bottom-center"),
      box: normalizeBox(item?.box),
    }))
    .filter((item) => item.pixel);
}

function normalizeAutoGroundDetections(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    id: String(item?.id || `person-${index + 1}`),
    label: String(item?.label || "person"),
    person_score: Number.isFinite(Number(item?.person_score ?? item?.personScore))
      ? Number(item?.person_score ?? item?.personScore)
      : null,
    source: String(item?.source || "bbox-bottom-center"),
    box: normalizeBox(item?.box),
    ground_point: normalizePoint(item?.ground_point ?? item?.groundPoint),
  }));
}

function sameStringArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]) !== String(b[i])) return false;
  }
  return true;
}

function buildPolygonFromDetection(detection, id) {
  const color = POLY_COLORS[id % POLY_COLORS.length];
  if (Array.isArray(detection?.box) && detection.box.length === 4) {
    const [x1, y1, x2, y2] = detection.box;
    const width = Math.max(8, x2 - x1);
    const height = Math.max(8, y2 - y1);
    const topY = y2 - height * 0.2;
    const inset = width * 0.2;
    return {
      id,
      label: `Auto-P${id + 1}`,
      points: [
        { x: x1 + inset, y: topY },
        { x: x2 - inset, y: topY },
        { x: x2, y: y2 },
        { x: x1, y: y2 },
      ],
      zHeight: 0,
      color,
      closed: true,
      source: "human-pose-auto",
    };
  }
  if (Array.isArray(detection?.ground_point) && detection.ground_point.length === 2) {
    const [cx, cy] = detection.ground_point;
    return {
      id,
      label: `Auto-P${id + 1}`,
      points: [
        { x: cx - 30, y: cy - 12 },
        { x: cx + 30, y: cy - 12 },
        { x: cx + 30, y: cy + 12 },
        { x: cx - 30, y: cy + 12 },
      ],
      zHeight: 0,
      color,
      closed: true,
      source: "human-pose-auto",
    };
  }
  return null;
}

export default function ProjectPlaneMappingPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId;
  const cameraId = params?.cameraId;

  const {
    feedEnabled,
    setFeedEnabled,
    liveFeedSrc,
    setLiveFeedSrc,
    stageOutputs,
    setStageOutput,
    stepStates,
    setStepState,
  } = useCalibration();

  const [sourceUrl, setSourceUrl] = useState("");
  const [cameraInfo, setCameraInfo] = useState(null);
  const [sourceMode, setSourceMode] = useState("rtsp");
  const [feedReady, setFeedReady] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Live feed ready for polygon mapping.");

  const [frameSize, setFrameSize] = useState({ width: 1280, height: 720 });
  const [containerSize, setContainerSize] = useState({ width: 960, height: 540 });

  const [polygons, setPolygons] = useState([]);
  const [currentPoints, setCurrentPoints] = useState([]);

  const [autoDetectLoading, setAutoDetectLoading] = useState(false);
  const [autoGroundSuggestions, setAutoGroundSuggestions] = useState([]);
  const [autoGroundDetections, setAutoGroundDetections] = useState([]);
  const [poseLogs, setPoseLogs] = useState([]);
  const [poseModel, setPoseModel] = useState(null);

  const overlayRef = useRef(null);
  const liveVideoRef = useRef(null);
  const liveImgRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const draggingRef = useRef(null);
  const suppressClickRef = useRef(false);
  const detectingRef = useRef(false);
  const sourceModeRef = useRef("rtsp");
  const feedReadyRef = useRef(false);
  const restoredStepStateRef = useRef(false);

  useEffect(() => {
    sourceModeRef.current = sourceMode;
  }, [sourceMode]);

  useEffect(() => {
    feedReadyRef.current = feedReady;
  }, [feedReady]);

  useEffect(() => {
    const saved = stageOutputs?.["plane-mapping"];
    if (!saved || typeof saved !== "object") return;
    if (Array.isArray(saved?.polygons)) {
      const hydrated = saved.polygons.map((poly, idx) => ({
        id: idx,
        label: String(poly?.label || `P${idx + 1}`),
        points: Array.isArray(poly?.points)
          ? poly.points.map((pt) => ({ x: Number(pt?.x || 0), y: Number(pt?.y || 0) }))
          : [],
        zHeight: Number(poly?.zHeight ?? 0),
        color: String(poly?.color || POLY_COLORS[idx % POLY_COLORS.length]),
        closed: true,
        source: String(poly?.source || "manual-live"),
      }));
      setPolygons(hydrated);
      setStatusMsg(`Loaded ${hydrated.length} saved polygon(s).`);
    }
  }, [stageOutputs]);

  useEffect(() => {
    const savedState = stepStates?.["plane-mapping"];
    if (restoredStepStateRef.current) return;
    if (!savedState || typeof savedState !== "object") return;
    if (
      typeof savedState.status === "string"
      && savedState.status.trim()
      && savedState.status !== statusMsg
    ) {
      setStatusMsg(savedState.status);
    }
    if (Array.isArray(savedState.logs) && savedState.logs.length > 0) {
      const nextLogs = savedState.logs.slice(-50);
      if (!sameStringArray(nextLogs, poseLogs)) {
        setPoseLogs(nextLogs);
      }
    }
    restoredStepStateRef.current = true;
  }, [stepStates, statusMsg, poseLogs]);

  useEffect(() => {
    let videoElement = null;
    const setup = async () => {
      try {
        const res = await fetch(`/api/calibration/web/projects/${projectId}`, { cache: "no-store" });
        const data = await res.json();
        const cameras = Array.isArray(data?.projectConfig?.cameras) ? data.projectConfig.cameras : [];
        const cam = cameras.find((c) => String(c?.id || "") === String(cameraId));
        setCameraInfo(cam || null);
        const src = String(cam?.sourceUrl || "").trim();
        if (!src) {
          setStatusMsg("No source URL configured for this camera.");
          return;
        }

        setSourceUrl(src);
        if (/^\d+$/.test(src)) {
          setSourceMode("webcam");
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          webcamStreamRef.current = stream;
          if (liveVideoRef.current) {
            videoElement = liveVideoRef.current;
            liveVideoRef.current.srcObject = stream;
            await liveVideoRef.current.play();
          }
          setFeedEnabled(true);
          setFeedReady(true);
          setStatusMsg("Webcam ready. Drawing is enabled. Human pose plane detection runs automatically.");
        } else {
          setSourceMode("rtsp");
          setLiveFeedSrc(`/api/feeds/mjpeg?source=${encodeURIComponent(src)}&fps=12&width=1280&nonce=${Date.now()}`);
          setFeedEnabled(true);
          setFeedReady(true);
          setStatusMsg("Feed ready. Drawing is enabled. Human pose plane detection runs automatically.");
        }
      } catch {
        setStatusMsg("Failed to load project config.");
      }
    };
    setup();

    return () => {
      const stream = webcamStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        webcamStreamRef.current = null;
      }
      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
  }, [projectId, cameraId, setLiveFeedSrc, setFeedEnabled]);

  useEffect(() => {
    const node = overlayRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        setContainerSize((prev) => {
          if (prev.width === width && prev.height === height) return prev;
          return { width, height };
        });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [feedReady]);

  const overlayMetrics = useMemo(() => {
    const frameWidth = Math.max(1, Number(frameSize.width || 1280));
    const frameHeight = Math.max(1, Number(frameSize.height || 720));
    const overlayWidth = Math.max(1, Number(containerSize.width || 960));
    const overlayHeight = Math.max(1, Number(containerSize.height || 540));
    const scale = Math.min(overlayWidth / frameWidth, overlayHeight / frameHeight);
    const drawWidth = frameWidth * scale;
    const drawHeight = frameHeight * scale;
    return {
      frameWidth,
      frameHeight,
      overlayWidth,
      overlayHeight,
      scale,
      drawWidth,
      drawHeight,
      offsetX: (overlayWidth - drawWidth) / 2,
      offsetY: (overlayHeight - drawHeight) / 2,
    };
  }, [frameSize.width, frameSize.height, containerSize.width, containerSize.height]);

  const toDisplayPoint = useCallback((point) => ({
    x: overlayMetrics.offsetX + point.x * overlayMetrics.scale,
    y: overlayMetrics.offsetY + point.y * overlayMetrics.scale,
  }), [overlayMetrics]);

  const toFramePoint = useCallback((event) => {
    const overlay = overlayRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const withinX = localX >= overlayMetrics.offsetX && localX <= overlayMetrics.offsetX + overlayMetrics.drawWidth;
    const withinY = localY >= overlayMetrics.offsetY && localY <= overlayMetrics.offsetY + overlayMetrics.drawHeight;
    if (!withinX || !withinY) return null;
    return {
      x: (localX - overlayMetrics.offsetX) / overlayMetrics.scale,
      y: (localY - overlayMetrics.offsetY) / overlayMetrics.scale,
    };
  }, [overlayMetrics]);

  const updateFrameSizeFromVideo = () => {
    const video = liveVideoRef.current;
    if (!video) return;
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      const width = Math.round(video.videoWidth);
      const height = Math.round(video.videoHeight);
      setFrameSize((prev) => {
        if (prev.width === width && prev.height === height) return prev;
        return { width, height };
      });
    }
  };

  const updateFrameSizeFromImage = () => {
    const img = liveImgRef.current;
    if (!img) return;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const width = Math.round(img.naturalWidth);
      const height = Math.round(img.naturalHeight);
      setFrameSize((prev) => {
        if (prev.width === width && prev.height === height) return prev;
        return { width, height };
      });
    }
  };

  const captureCurrentFrameDataUrl = useCallback(() => {
    const canvas = document.createElement("canvas");
    if (sourceMode === "webcam") {
      const video = liveVideoRef.current;
      if (!video || video.videoWidth < 1 || video.videoHeight < 1) {
        throw new Error("Webcam frame is not ready yet.");
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.9);
    }
    const img = liveImgRef.current;
    if (!img || img.naturalWidth < 1 || img.naturalHeight < 1) {
      throw new Error("Live feed frame is not ready yet.");
    }
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  }, [sourceMode]);

  const isNearFirst = (pt, pts, threshold = 18) =>
    pts.length >= 3 && Math.hypot(pt.x - pts[0].x, pt.y - pts[0].y) < threshold;

  const findNearestVertex = useCallback((pt, threshold = 14) => {
    let nearest = null;
    let bestDist = threshold;
    for (let polyIndex = 0; polyIndex < polygons.length; polyIndex += 1) {
      const poly = polygons[polyIndex];
      for (let pointIndex = 0; pointIndex < poly.points.length; pointIndex += 1) {
        const point = poly.points[pointIndex];
        const dist = Math.hypot(pt.x - point.x, pt.y - point.y);
        if (dist < bestDist) {
          bestDist = dist;
          nearest = { polyIndex, pointIndex };
        }
      }
    }
    return nearest;
  }, [polygons]);

  const handleOverlayClick = (event) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const pt = toFramePoint(event);
    if (!pt) return;
    if (isNearFirst(pt, currentPoints)) {
      const id = polygons.length;
      const poly = {
        id,
        label: `P${id + 1}`,
        points: [...currentPoints],
        zHeight: 0,
        color: POLY_COLORS[id % POLY_COLORS.length],
        closed: true,
        source: "manual-live",
      };
      setPolygons((prev) => [...prev, poly]);
      setCurrentPoints([]);
      setStatusMsg(`Polygon ${id + 1} created.`);
      return;
    }
    setCurrentPoints((prev) => [...prev, pt]);
  };

  const handleOverlayDoubleClick = (event) => {
    if (currentPoints.length < 2) return;
    event.preventDefault();
    const id = polygons.length;
    const poly = {
      id,
      label: `P${id + 1}`,
      points: [...currentPoints],
      zHeight: 0,
      color: POLY_COLORS[id % POLY_COLORS.length],
      closed: true,
      source: "manual-live",
    };
    setPolygons((prev) => [...prev, poly]);
    setCurrentPoints([]);
    setStatusMsg(`Polygon ${id + 1} created.`);
  };

  const handleOverlayMouseDown = (event) => {
    const pt = toFramePoint(event);
    if (!pt) return;
    const nearest = findNearestVertex(pt);
    if (nearest) {
      draggingRef.current = nearest;
      suppressClickRef.current = true;
    }
  };

  const handleOverlayMouseMove = (event) => {
    if (!draggingRef.current) return;
    const pt = toFramePoint(event);
    if (!pt) return;
    const { polyIndex, pointIndex } = draggingRef.current;
    setPolygons((prev) => prev.map((poly, idx) => {
      if (idx !== polyIndex) return poly;
      const nextPoints = poly.points.map((point, pIdx) => (pIdx === pointIndex ? { x: pt.x, y: pt.y } : point));
      return { ...poly, points: nextPoints };
    }));
  };

  const handleOverlayMouseUp = () => {
    draggingRef.current = null;
  };

  const handleAutoDetectGround = useCallback(async ({ background = false } = {}) => {
    if (detectingRef.current || !feedReadyRef.current) return;
    try {
      detectingRef.current = true;
      setAutoDetectLoading(true);
      if (!background) {
        setStatusMsg("Running human pose detection on current live frame...");
      }
      const imageDataUrl = captureCurrentFrameDataUrl();
      const res = await fetch("/api/calibration/web/ground/pose-detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl,
          maxSide: 960,
          minPersonScore: 0.65,
          minKeypointScore: 0.35,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Automatic human ground detection failed");
      }

      const result = data?.result || {};
      const suggestions = normalizeAutoGroundSuggestions(result?.suggestions);
      const detections = normalizeAutoGroundDetections(result?.detections);
      const generated = detections
        .map((detection, index) => buildPolygonFromDetection(detection, index))
        .filter(Boolean)
        .map((poly, idx) => ({ ...poly, id: idx }));

      if (generated.length > 0) {
        setPolygons((prev) => {
          const manual = (Array.isArray(prev) ? prev : []).filter((poly) => poly?.source !== "human-pose-auto");
          const auto = generated.map((poly, idx) => ({
            ...poly,
            id: manual.length + idx,
            label: `Auto-P${idx + 1}`,
          }));
          return [...manual, ...auto];
        });
      }

      setAutoGroundSuggestions(suggestions);
      setAutoGroundDetections(detections);
      setPoseLogs(Array.isArray(data?.logs) ? data.logs : []);
      setPoseModel(data?.model || result?.model || null);
      if (!background || generated.length > 0) {
        setStatusMsg(
          generated.length
            ? `Detected ${detections.length} human(s), generated ${generated.length} auto polygon(s), drawing remains enabled.`
            : `Detected ${detections.length} human(s), no auto polygons this cycle. Draw manually on live feed.`
        );
      }
    } catch (err) {
      if (!background) {
        setStatusMsg(err instanceof Error ? err.message : "Auto detection failed");
      }
    } finally {
      detectingRef.current = false;
      setAutoDetectLoading(false);
    }
  }, [captureCurrentFrameDataUrl]);

  useEffect(() => {
    if (!feedReady) return;
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await handleAutoDetectGround({ background: true });
    };
    run();
    const interval = setInterval(run, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [feedReady, sourceMode, handleAutoDetectGround]);

  const updateZHeight = (id, value) => {
    setPolygons((prev) => prev.map((poly) => (poly.id === id ? { ...poly, zHeight: value } : poly)));
  };

  const updateVertex = (polygonId, vertexIndex, axis, value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    setPolygons((prev) => prev.map((poly) => {
      if (poly.id !== polygonId) return poly;
      const nextPoints = poly.points.map((point, idx) => {
        if (idx !== vertexIndex) return point;
        return axis === "x" ? { ...point, x: num } : { ...point, y: num };
      });
      return { ...poly, points: nextPoints };
    }));
  };

  const deletePolygon = (id) => {
    setPolygons((prev) => prev.filter((poly) => poly.id !== id).map((poly, idx) => ({ ...poly, id: idx, label: `P${idx + 1}` })));
    setStatusMsg("Polygon deleted.");
  };

  const buildPolygonsForSave = useCallback(() => {
    const base = Array.isArray(polygons) ? [...polygons] : [];
    if (currentPoints.length >= 3) {
      base.push({
        id: base.length,
        label: `P${base.length + 1}`,
        points: [...currentPoints],
        zHeight: 0,
        color: POLY_COLORS[base.length % POLY_COLORS.length],
        closed: true,
        source: "manual-live",
      });
    }
    return base;
  }, [polygons, currentPoints]);

  const handleSave = useCallback(() => {
    const preparedPolygons = buildPolygonsForSave();
    if (preparedPolygons.length < 1) {
      setStatusMsg("No polygons to save yet. Draw at least one polygon first.");
      return false;
    }

    if (preparedPolygons.length !== polygons.length) {
      setPolygons(preparedPolygons);
      setCurrentPoints([]);
    }

    setStageOutput("plane-mapping", {
      completed: true,
      timestamp: new Date().toISOString(),
      polygons: preparedPolygons.map((poly) => ({
        id: poly.id,
        label: poly.label || `P${poly.id + 1}`,
        zHeight: Number(poly.zHeight || 0),
        color: poly.color,
        source: poly.source || "manual-live",
        points: poly.points,
      })),
      autoGroundSuggestions,
      autoGroundDetections,
      sourceUrl,
    });
    setStepState("plane-mapping", {
      status: `Saved ${preparedPolygons.length} polygon(s).`,
      progress: 100,
      logs: Array.isArray(poseLogs) ? poseLogs.slice(-120) : [],
      result: {
        polygonCount: preparedPolygons.length,
        detectionCount: autoGroundDetections.length,
        suggestionCount: autoGroundSuggestions.length,
      },
    });
    setStatusMsg(`Saved ${preparedPolygons.length} polygon(s).`);
    return true;
  }, [buildPolygonsForSave, polygons.length, setStageOutput, autoGroundSuggestions, autoGroundDetections, sourceUrl, setStepState, poseLogs]);

  useEffect(() => {
    const computedProgress = stageOutputs?.["plane-mapping"]?.completed
      ? 100
      : Math.min(95, Math.max(10, polygons.length * 20 + (currentPoints.length >= 2 ? 10 : 0)));
    setStepState("plane-mapping", {
      status: statusMsg,
      progress: computedProgress,
      logs: Array.isArray(poseLogs) ? poseLogs.slice(-120) : [],
      result: {
        polygonCount: polygons.length,
        inProgressVertices: currentPoints.length,
        detectionCount: autoGroundDetections.length,
        suggestionCount: autoGroundSuggestions.length,
      },
    });
  }, [statusMsg, polygons.length, currentPoints.length, autoGroundDetections.length, autoGroundSuggestions.length, poseLogs, stageOutputs, setStepState]);

  const handleSaveAndNext = () => {
    const ok = handleSave();
    if (!ok) return;
    router.push(`/project/${projectId}/camera/${cameraId}/ground-plane`);
  };

  const renderedPolygons = [
    ...polygons,
    ...(currentPoints.length
      ? [{
          id: polygons.length,
          label: `P${polygons.length + 1}`,
          points: currentPoints,
          zHeight: 0,
          color: POLY_COLORS[polygons.length % POLY_COLORS.length],
          closed: false,
          source: "manual-live",
        }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Step 2: Plane Mapping</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Live plane mapping with human-pose auto-detection • Project {projectId} • Camera {cameraId}
          </p>
        </div>
        <button
          onClick={() => router.push(`/project/${projectId}/camera/${cameraId}`)}
          className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition"
        >
          ← Back
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-200">Camera Information</h2>
        <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
          <div>Camera name: <span className="text-zinc-200">{cameraInfo?.name || cameraId}</span></div>
          <div>Source type: <span className="text-zinc-200">{detectSourceType(sourceUrl)}</span></div>
          <div>Camera ID: <span className="text-zinc-200">{cameraId}</span></div>
          <div>Preview mode: <span className="text-zinc-200">{sourceMode === "webcam" ? "Browser webcam" : "MJPEG bridge"}</span></div>
          <div className="sm:col-span-2 break-all">Source URL: <span className="text-zinc-200">{sourceUrl || "Not configured"}</span></div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
        <span className="text-xs text-zinc-400">{statusMsg}</span>
        <div className="mt-2 h-2 w-full rounded bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${Math.max(0, Math.min(100, Number(stepStates?.["plane-mapping"]?.progress || 0)))}%` }}
          />
        </div>
      </div>

      {feedReady && (
        <div className="bg-emerald-950 border border-emerald-800 rounded px-3 py-2 text-xs text-emerald-300">
          Draw directly on live feed immediately: click to add points, click near first point or double-click to close.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-zinc-900 rounded-lg border border-zinc-800 p-3">
          <div ref={overlayRef} className="relative w-full aspect-video bg-zinc-800 rounded border border-zinc-700 overflow-hidden">
            {sourceMode === "webcam" ? (
              <video
                ref={liveVideoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={updateFrameSizeFromVideo}
                className="w-full h-full object-contain bg-black"
              />
            ) : feedReady && liveFeedSrc ? (
              <img
                ref={liveImgRef}
                src={liveFeedSrc}
                alt="Live feed"
                className="w-full h-full object-contain"
                onLoad={updateFrameSizeFromImage}
                onError={() => setFeedReady(false)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <p className="text-xs text-zinc-500">Feed not available</p>
              </div>
            )}

            <svg
              className="absolute inset-0 h-full w-full cursor-crosshair"
              onClick={handleOverlayClick}
              onDoubleClick={handleOverlayDoubleClick}
              onMouseDown={handleOverlayMouseDown}
              onMouseMove={handleOverlayMouseMove}
              onMouseUp={handleOverlayMouseUp}
              onMouseLeave={handleOverlayMouseUp}
            >
              {autoGroundDetections.map((detection, index) => {
                if (!detection?.box) return null;
                const [x1, y1, x2, y2] = detection.box;
                const tl = toDisplayPoint({ x: x1, y: y1 });
                const br = toDisplayPoint({ x: x2, y: y2 });
                return (
                  <g key={detection.id || `det-${index}`}>
                    <rect x={tl.x} y={tl.y} width={br.x - tl.x} height={br.y - tl.y} fill="rgba(34,197,94,0.08)" stroke="rgba(34,197,94,0.9)" strokeWidth="2" />
                    <text x={tl.x + 5} y={tl.y + 14} fill="#86efac" fontSize="11">{detection.label || `person ${index + 1}`}</text>
                  </g>
                );
              })}

              {autoGroundSuggestions.map((suggestion, index) => {
                const point = toDisplayPoint({ x: suggestion.pixel[0], y: suggestion.pixel[1] });
                return (
                  <g key={suggestion.id || `s-${index}`}>
                    <circle cx={point.x} cy={point.y} r="5" fill="#22d3ee" stroke="#fff" strokeWidth="2" />
                    <text x={point.x + 8} y={point.y - 8} fill="#67e8f9" fontSize="10">g{index + 1}</text>
                  </g>
                );
              })}

              {renderedPolygons.map((poly) => {
                if (!Array.isArray(poly.points) || poly.points.length === 0) return null;
                const displayPoints = poly.points.map(toDisplayPoint);
                const pointsAttr = displayPoints.map((pt) => `${pt.x},${pt.y}`).join(" ");
                const centroid = displayPoints.reduce(
                  (acc, pt) => ({ x: acc.x + pt.x / displayPoints.length, y: acc.y + pt.y / displayPoints.length }),
                  { x: 0, y: 0 },
                );
                return (
                  <g key={`poly-${poly.id}-${poly.label}`}>
                    <polygon points={pointsAttr} fill={poly.closed ? `${poly.color}33` : "transparent"} stroke={poly.color} strokeWidth="2.5" />
                    {displayPoints.map((pt, pIdx) => (
                      <circle key={`${poly.id}-${pIdx}`} cx={pt.x} cy={pt.y} r={pIdx === 0 && !poly.closed ? 7 : 5} fill="#fff" stroke={poly.color} strokeWidth="1.5" />
                    ))}
                    {poly.closed ? (
                      <text x={centroid.x} y={centroid.y} fill="#fff" fontSize="12" textAnchor="middle">
                        {(poly.label || `P${poly.id + 1}`)} · Z={Number(poly.zHeight || 0)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
            <h2 className="text-base font-semibold mb-3">Plane Polygons</h2>
            {polygons.length === 0 ? (
              <p className="text-xs text-zinc-500">No polygons yet. Drawing is enabled on live feed and auto pose detection is running continuously.</p>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {polygons.map((poly) => (
                  <div key={poly.id} className="rounded border p-3 space-y-2" style={{ borderColor: `${poly.color}88` }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold" style={{ color: poly.color }}>{poly.label || `P${poly.id + 1}`}</span>
                      <button onClick={() => deletePolygon(poly.id)} className="text-xs text-rose-400 hover:text-rose-300">Delete</button>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {poly.points.length} vertices (drag directly on board) • {poly.source || "manual-live"}
                    </p>
                    <label className="block text-xs text-zinc-400">
                      Z Height (meters above ground)
                      <input
                        type="number"
                        step="0.1"
                        value={poly.zHeight}
                        onChange={(e) => updateZHeight(poly.id, e.target.value)}
                        className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"
                        placeholder="0 = ground"
                      />
                    </label>
                    <div className="space-y-1">
                      <div className="text-xs text-zinc-400">Vertices (editable)</div>
                      {poly.points.map((point, pointIndex) => (
                        <div key={`${poly.id}-v-${pointIndex}`} className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            step="1"
                            value={Number(point.x).toFixed(1)}
                            onChange={(e) => updateVertex(poly.id, pointIndex, "x", e.target.value)}
                            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-white"
                            placeholder={`V${pointIndex + 1} X`}
                          />
                          <input
                            type="number"
                            step="1"
                            value={Number(point.y).toFixed(1)}
                            onChange={(e) => updateVertex(poly.id, pointIndex, "y", e.target.value)}
                            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-white"
                            placeholder={`V${pointIndex + 1} Y`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-3 text-xs text-zinc-400 space-y-1">
            <div className="text-zinc-200 font-semibold">Human Pose Output</div>
            <div>Detected humans: <span className="text-zinc-200">{autoGroundDetections.length}</span></div>
            <div>Ground suggestions: <span className="text-zinc-200">{autoGroundSuggestions.length}</span></div>
            <div>Auto plane default Z: <span className="text-zinc-200">0</span></div>
            <div>Progress: <span className="text-zinc-200">{Math.round(Number(stepStates?.["plane-mapping"]?.progress || 0))}%</span></div>
            {poseModel ? <div>Model: <span className="text-zinc-200">{String(poseModel?.status || poseModel?.name || "ready")}</span></div> : null}
            {poseLogs.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-zinc-300">Detector logs</summary>
                <pre className="mt-2 max-h-28 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">{poseLogs.join("\n")}</pre>
              </details>
            ) : null}
          </div>

          {stageOutputs?.["plane-mapping"]?.completed ? (
            <div className="bg-zinc-900 rounded-lg border border-emerald-800 p-3 text-xs text-emerald-400">
              ✓ Saved {stageOutputs["plane-mapping"]?.polygons?.length || 0} polygon(s)
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => router.push(`/project/${projectId}/camera/${cameraId}/intrinsic`)}
          className="flex-1 px-6 py-3 rounded bg-zinc-800 hover:bg-zinc-700 transition font-medium"
        >
          Back Intrinsic Calibration
        </button>
        <button
          onClick={handleSave}
          className="flex-1 px-6 py-3 rounded bg-amber-600 hover:bg-amber-700 transition font-medium"
        >
          Save Plane Mapping
        </button>
        <button
          onClick={handleSaveAndNext}
          className="flex-1 px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-700 transition font-medium"
        >
          Next Ground Plane Calibration
        </button>
      </div>
    </div>
  );
}
