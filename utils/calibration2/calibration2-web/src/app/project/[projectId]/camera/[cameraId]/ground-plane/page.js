"use client";

import { useRouter, useParams } from "next/navigation";
import { useCalibration } from "@/lib/CalibrationContext";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import ProjectedCadViewer from "@/components/calibration/ProjectedCadViewer";

function detectSourceType(sourceUrl) {
  const src = String(sourceUrl || "").trim().toLowerCase();
  if (!src) return "missing";
  if (/^\d+$/.test(src)) return "webcam";
  if (src.startsWith("rtsp://")) return "rtsp/cctv";
  if (src.startsWith("http://") || src.startsWith("https://")) return "http stream";
  if (/\.(mp4|mov|avi|mkv)$/i.test(src)) return "video file";
  return "custom";
}

function pointInPolygon(point, polygonPoints) {
  if (!point || !Array.isArray(polygonPoints) || polygonPoints.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
    const xi = Number(polygonPoints[i]?.x ?? 0);
    const yi = Number(polygonPoints[i]?.y ?? 0);
    const xj = Number(polygonPoints[j]?.x ?? 0);
    const yj = Number(polygonPoints[j]?.y ?? 0);
    const intersects = (yi > point.y) !== (yj > point.y)
      && point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function getImagePointFromCorrespondence(item) {
  if (!item || typeof item !== "object") return null;
  if (item?.image && Number.isFinite(Number(item.image.x)) && Number.isFinite(Number(item.image.y))) {
    return { x: Number(item.image.x), y: Number(item.image.y) };
  }
  if (Array.isArray(item?.imagePoint) && item.imagePoint.length >= 2) {
    return { x: Number(item.imagePoint[0]), y: Number(item.imagePoint[1]) };
  }
  if (Array.isArray(item?.pixel) && item.pixel.length >= 2) {
    return { x: Number(item.pixel[0]), y: Number(item.pixel[1]) };
  }
  if (Number.isFinite(Number(item?.x)) && Number.isFinite(Number(item?.y))) {
    return { x: Number(item.x), y: Number(item.y) };
  }
  return null;
}

function distance3(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) return null;
  const dx = Number(a[0]) - Number(b[0]);
  const dy = Number(a[1]) - Number(b[1]);
  const dz = Number(a[2]) - Number(b[2]);
  if (![dx, dy, dz].every((v) => Number.isFinite(v))) return null;
  return Math.hypot(dx, dy, dz);
}

function sameStringArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]) !== String(b[i])) return false;
  }
  return true;
}

function formatNum(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "n/a";
  return n.toFixed(digits);
}

export default function ProjectGroundPlanePage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId;
  const cameraId = params?.cameraId;

  const {
    feedEnabled,
    setFeedEnabled,
    liveFeedSrc,
    setLiveFeedSrc,
    correspondences,
    setCorrespondences,
    jobLoading,
    setJobLoading,
    projectCameras,
    syncedMatchFrames,
    setSyncedMatchFrames,
    syncedFrameIndex,
    setSyncedFrameIndex,
    stageOutputs,
    setStageOutput,
    stepStates,
    setStepState,
  } = useCalibration();

  const [groundPlaneStatus, setGroundPlaneStatus] = useState("Ready to calibrate ground plane");
  const [busyLoading, setBusyLoading] = useState(false);
  const [validationPairs, setValidationPairs] = useState([]);
  const [syncedCameras, setSyncedCameras] = useState([]);
  const [segments, setSegments] = useState([]);
  const [cameraInfo, setCameraInfo] = useState(null);
  const [cameraSourceUrl, setCameraSourceUrl] = useState("");
  const [sourceMode, setSourceMode] = useState("rtsp");
  const [planePolygons, setPlanePolygons] = useState([]);
  const [frameSize, setFrameSize] = useState({ width: 1280, height: 720 });
  const [containerSize, setContainerSize] = useState({ width: 960, height: 540 });
  const [mappingMode, setMappingMode] = useState("point-cad");
  const [lineMappings, setLineMappings] = useState([]);
  const [pendingImagePoint, setPendingImagePoint] = useState(null);
  const [pendingImageLine, setPendingImageLine] = useState([]);
  const [pendingCadLinePoints, setPendingCadLinePoints] = useState([]);
  const [manualWorldInput, setManualWorldInput] = useState({ x: "", y: "", z: "0" });
  const [manualLineDistance, setManualLineDistance] = useState("");
  const [groundLogs, setGroundLogs] = useState([]);
  const [calibrationResult, setCalibrationResult] = useState(null);
  const [homographyResult, setHomographyResult] = useState(null);
  const liveVideoRef = useRef(null);
  const liveImgRef = useRef(null);
  const feedWrapRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const restoredStepStateRef = useRef(false);

  const hasPlanePolygons = planePolygons.length > 0;

  useEffect(() => {
    const saved = stageOutputs?.["plane-mapping"];
    const items = Array.isArray(saved?.polygons) ? saved.polygons : [];
    const hydrated = items
      .map((poly, index) => ({
        id: Number.isFinite(Number(poly?.id)) ? Number(poly.id) : index,
        label: String(poly?.label || `P${index + 1}`),
        points: Array.isArray(poly?.points)
          ? poly.points
              .map((pt) => ({ x: Number(pt?.x), y: Number(pt?.y) }))
              .filter((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y))
          : [],
      }))
      .filter((poly) => poly.points.length >= 3);
    setPlanePolygons(hydrated);
    if (!hydrated.length) {
      setGroundPlaneStatus("Plane mapping polygons are missing. Complete Step 2 first.");
    }
  }, [stageOutputs]);

  useEffect(() => {
    const saved = stageOutputs?.["ground-plane"];
    if (!saved || typeof saved !== "object") return;
    if (saved?.calibrationResult && typeof saved.calibrationResult === "object") {
      setCalibrationResult(saved.calibrationResult);
    }
    if (saved?.homographyResult && typeof saved.homographyResult === "object") {
      setHomographyResult(saved.homographyResult);
    }
  }, [stageOutputs]);

  useEffect(() => {
    const savedState = stepStates?.["ground-plane"];
    if (restoredStepStateRef.current) return;
    if (!savedState || typeof savedState !== "object") return;
    if (
      typeof savedState.status === "string"
      && savedState.status.trim()
      && savedState.status !== groundPlaneStatus
    ) {
      setGroundPlaneStatus(savedState.status);
    }
    if (Array.isArray(savedState.logs) && savedState.logs.length > 0) {
      const nextLogs = savedState.logs.slice(-120);
      if (!sameStringArray(nextLogs, groundLogs)) {
        setGroundLogs(nextLogs);
      }
    }
    restoredStepStateRef.current = true;
  }, [stepStates, groundPlaneStatus, groundLogs]);

  useEffect(() => {
    if (!groundPlaneStatus) return;
    setGroundLogs((prev) => {
      const next = [...prev, `${new Date().toISOString()}  ${groundPlaneStatus}`];
      return next.slice(-160);
    });
  }, [groundPlaneStatus]);

  useEffect(() => {
    const setupFeed = async () => {
      try {
        const response = await fetch(`/api/calibration/web/projects/${projectId}`, { cache: "no-store" });
        const data = await response.json();
        const projectConfig = data?.projectConfig || {};
        const cameras = Array.isArray(projectConfig?.cameras) ? projectConfig.cameras : [];
        const activeCamera = cameras.find((camera) => String(camera?.id || "") === String(cameraId));
        setCameraInfo(activeCamera || null);
        const sourceUrl = String(activeCamera?.sourceUrl || "").trim();
        setCameraSourceUrl(sourceUrl);
        if (sourceUrl) {
          if (/^\d+$/.test(sourceUrl)) {
            setSourceMode("webcam");
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            webcamStreamRef.current = stream;
            if (liveVideoRef.current) {
              liveVideoRef.current.srcObject = stream;
              await liveVideoRef.current.play();
            }
            setFeedEnabled(true);
          } else {
            setSourceMode("rtsp");
            setLiveFeedSrc(
              `/api/feeds/mjpeg?source=${encodeURIComponent(sourceUrl)}&fps=12&width=960&nonce=${Date.now()}`
            );
            setFeedEnabled(true);
          }
        } else {
          setFeedEnabled(false);
        }

        const sharedDwgPath = String(projectConfig?.sharedDwgPath || "").trim();
        if (sharedDwgPath) {
          const previewRes = await fetch(`/api/uploads/dwg/preview`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: sharedDwgPath }),
          });
          const previewData = await previewRes.json();
          if (previewData?.ok) {
            setSegments(Array.isArray(previewData?.preview?.segments) ? previewData.preview.segments : []);
          }
        }
      } catch (err) {
        console.error("Failed to initialize feed:", err);
        setFeedEnabled(false);
      }
    };
    setupFeed();
    return () => {
      const stream = webcamStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        webcamStreamRef.current = null;
      }
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = null;
      }
    };
  }, [projectId, cameraId, setLiveFeedSrc, setFeedEnabled]);

  useEffect(() => {
    const available = projectCameras.filter((c) => String(c.id) !== String(cameraId));
    setSyncedCameras(available);
  }, [projectCameras, cameraId]);

  useEffect(() => {
    const node = feedWrapRef.current;
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
  }, [feedEnabled]);

  const updateFrameSizeFromVideo = () => {
    const video = liveVideoRef.current;
    if (video?.videoWidth > 0 && video?.videoHeight > 0) {
      const width = Math.round(video.videoWidth);
      const height = Math.round(video.videoHeight);
      setFrameSize((prev) => {
        if (prev.width === width && prev.height === height) return prev;
        return { width, height };
      });
    }
  };

  const updateFrameSizeFromImage = () => {
    const image = liveImgRef.current;
    if (image?.naturalWidth > 0 && image?.naturalHeight > 0) {
      const width = Math.round(image.naturalWidth);
      const height = Math.round(image.naturalHeight);
      setFrameSize((prev) => {
        if (prev.width === width && prev.height === height) return prev;
        return { width, height };
      });
    }
  };

  const overlayMetrics = useMemo(() => {
    const fw = Math.max(1, Number(frameSize.width || 1280));
    const fh = Math.max(1, Number(frameSize.height || 720));
    const ow = Math.max(1, Number(containerSize.width || 960));
    const oh = Math.max(1, Number(containerSize.height || 540));
    const scale = Math.min(ow / fw, oh / fh);
    const drawWidth = fw * scale;
    const drawHeight = fh * scale;
    return {
      scale,
      offsetX: (ow - drawWidth) / 2,
      offsetY: (oh - drawHeight) / 2,
      drawWidth,
      drawHeight,
    };
  }, [frameSize.width, frameSize.height, containerSize.width, containerSize.height]);

  const toDisplayPoint = useCallback((point) => ({
    x: overlayMetrics.offsetX + point.x * overlayMetrics.scale,
    y: overlayMetrics.offsetY + point.y * overlayMetrics.scale,
  }), [overlayMetrics]);

  const toFramePoint = useCallback((event) => {
    const node = feedWrapRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const insideX = localX >= overlayMetrics.offsetX && localX <= overlayMetrics.offsetX + overlayMetrics.drawWidth;
    const insideY = localY >= overlayMetrics.offsetY && localY <= overlayMetrics.offsetY + overlayMetrics.drawHeight;
    if (!insideX || !insideY) return null;
    return {
      x: (localX - overlayMetrics.offsetX) / overlayMetrics.scale,
      y: (localY - overlayMetrics.offsetY) / overlayMetrics.scale,
    };
  }, [overlayMetrics]);

  const handleSelectGroundPoint = (event) => {
    if (!hasPlanePolygons) {
      setGroundPlaneStatus("Create plane mapping polygons in Step 2 first, then select ground points in Step 3.");
      return;
    }
    const point = toFramePoint(event);
    if (!point) return;
    const polygon = planePolygons.find((poly) => pointInPolygon(point, poly.points));
    if (!polygon) {
      setGroundPlaneStatus("Selected point is outside mapped polygons. Pick only inside a Step 2 polygon.");
      return;
    }

    const normalizedPoint = { x: Number(point.x.toFixed(2)), y: Number(point.y.toFixed(2)) };

    if (mappingMode === "point-cad") {
      setPendingImagePoint(normalizedPoint);
      setGroundPlaneStatus(`Image point selected in ${polygon.label}. Pick corresponding CAD point.`);
      return;
    }

    if (mappingMode === "point-manual") {
      setPendingImagePoint(normalizedPoint);
      setGroundPlaneStatus(`Image point selected in ${polygon.label}. Enter world coordinates (X, Y, Z).`);
      return;
    }

    if (mappingMode === "line-cad" || mappingMode === "line-manual") {
      setPendingImageLine((prev) => {
        const next = prev.length >= 2 ? [normalizedPoint] : [...prev, normalizedPoint];
        if (next.length === 1) {
          setGroundPlaneStatus(`Line start selected in ${polygon.label}. Pick second image point.`);
        } else if (mappingMode === "line-cad") {
          setPendingCadLinePoints([]);
          setGroundPlaneStatus("Image line ready. Click the CAD line directly (or pick two CAD points).");
        } else {
          setGroundPlaneStatus("Image line ready. Enter real-world distance for this line.");
        }
        return next;
      });
      return;
    }

    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      source: "manual-step3",
      polygonId: polygon.id,
      polygonLabel: polygon.label,
      image: normalizedPoint,
      world: null,
      timestamp: new Date().toISOString(),
    };
    setCorrespondences((prev) => [...(Array.isArray(prev) ? prev : []), record]);
    setGroundPlaneStatus(`Point selected inside ${polygon.label}.`);
  };

  const handlePickWorldPoint = (world) => {
    if (!Array.isArray(world) || world.length < 3) return;
    const normalizedWorld = [Number(world[0]), Number(world[1]), Number(world[2])];

    if (mappingMode === "point-cad") {
      if (!pendingImagePoint) {
        setGroundPlaneStatus("Pick an image point first, then select CAD point.");
        return;
      }
      const record = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        source: "point-cad",
        image: pendingImagePoint,
        world: normalizedWorld,
        timestamp: new Date().toISOString(),
      };
      setCorrespondences((prev) => [...(Array.isArray(prev) ? prev : []), record]);
      setPendingImagePoint(null);
      setGroundPlaneStatus("Point mapping saved (image ↔ CAD). Pick next image point.");
      return;
    }

    if (mappingMode === "line-cad") {
      if (pendingImageLine.length < 2) {
        setGroundPlaneStatus("Define image line first (pick two image points). Then pick CAD line.");
        return;
      }
      setPendingCadLinePoints((prev) => {
        const next = prev.length >= 2 ? [normalizedWorld] : [...prev, normalizedWorld];
        if (next.length < 2) {
          setGroundPlaneStatus("First CAD point selected. Pick second CAD point for the line.");
          return next;
        }
        const lineRecord = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          source: "line-cad",
          imageLine: pendingImageLine,
          worldLine: next,
          worldDistance: distance3(next[0], next[1]),
          timestamp: new Date().toISOString(),
        };
        setLineMappings((prevLines) => [...prevLines, lineRecord]);
        setPendingImageLine([]);
        setGroundPlaneStatus("Line mapping saved (image line ↔ CAD line).");
        return [];
      });
    }
  };

  const handlePickWorldLine = (worldLine) => {
    if (mappingMode !== "line-cad") return;
    if (pendingImageLine.length < 2) {
      setGroundPlaneStatus("Define image line first (pick two image points). Then pick CAD line.");
      return;
    }
    if (!Array.isArray(worldLine) || worldLine.length < 2) return;
    const a = Array.isArray(worldLine[0]) ? worldLine[0] : null;
    const b = Array.isArray(worldLine[1]) ? worldLine[1] : null;
    if (!a || !b || a.length < 3 || b.length < 3) return;

    const normalizedLine = [
      [Number(a[0]), Number(a[1]), Number(a[2])],
      [Number(b[0]), Number(b[1]), Number(b[2])],
    ];
    const lineRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      source: "line-cad",
      imageLine: pendingImageLine,
      worldLine: normalizedLine,
      worldDistance: distance3(normalizedLine[0], normalizedLine[1]),
      timestamp: new Date().toISOString(),
    };
    setLineMappings((prevLines) => [...prevLines, lineRecord]);
    setPendingCadLinePoints([]);
    setPendingImageLine([]);
    setGroundPlaneStatus("Line mapping saved (image line ↔ CAD line). You can pick next image line.");
  };

  const handleAddManualPointMapping = () => {
    if (!pendingImagePoint) {
      setGroundPlaneStatus("Pick an image point first.");
      return;
    }
    const wx = Number(manualWorldInput.x);
    const wy = Number(manualWorldInput.y);
    const wz = Number(manualWorldInput.z);
    if (![wx, wy, wz].every((v) => Number.isFinite(v))) {
      setGroundPlaneStatus("Enter valid numeric world coordinates (X, Y, Z).");
      return;
    }
    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      source: "point-manual",
      image: pendingImagePoint,
      world: [wx, wy, wz],
      timestamp: new Date().toISOString(),
    };
    setCorrespondences((prev) => [...(Array.isArray(prev) ? prev : []), record]);
    setPendingImagePoint(null);
    setManualWorldInput({ x: "", y: "", z: manualWorldInput.z || "0" });
    setGroundPlaneStatus("Point mapping saved (image ↔ manual world coordinates).");
  };

  const handleAddManualLineMapping = () => {
    if (pendingImageLine.length < 2) {
      setGroundPlaneStatus("Pick two image points to define a line first.");
      return;
    }
    const distanceValue = Number(manualLineDistance);
    if (!(Number.isFinite(distanceValue) && distanceValue > 0)) {
      setGroundPlaneStatus("Enter a valid positive real-world distance for the line.");
      return;
    }
    const lineRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      source: "line-manual",
      imageLine: pendingImageLine,
      worldDistance: distanceValue,
      timestamp: new Date().toISOString(),
    };
    setLineMappings((prev) => [...prev, lineRecord]);
    setPendingImageLine([]);
    setManualLineDistance("");
    setGroundPlaneStatus("Line mapping saved (image line ↔ manual distance).");
  };

  const deletePointPair = (id) => {
    setCorrespondences((prev) => (Array.isArray(prev) ? prev.filter((item) => item?.id !== id) : []));
    setGroundPlaneStatus("Point pair deleted.");
  };

  const deleteLinePair = (id) => {
    setLineMappings((prev) => prev.filter((item) => item?.id !== id));
    setGroundPlaneStatus("Line pair deleted.");
  };

  const clearAllPairs = () => {
    setCorrespondences([]);
    setLineMappings([]);
    setPendingImagePoint(null);
    setPendingImageLine([]);
    setPendingCadLinePoints([]);
    setGroundPlaneStatus("All point/line pairs cleared.");
  };

  const downloadJson = (filename, payload) => {
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setGroundPlaneStatus("Failed to download JSON file.");
    }
  };

  const displayedCorrespondences = useMemo(
    () => (Array.isArray(correspondences) ? correspondences.map((item) => ({ item, image: getImagePointFromCorrespondence(item) })).filter((entry) => entry.image) : []),
    [correspondences]
  );

  const handleCaptureSyncedSnapshots = async () => {
    try {
      setBusyLoading(true);
      setGroundPlaneStatus("Capturing synced snapshots from all cameras...");

      const allCameraIds = [cameraId, ...syncedCameras.map((c) => c.id)];
      const frames = [];

      for (const camId of allCameraIds) {
        try {
          const response = await fetch(`/api/camera/${camId}/snapshot`, { method: "POST" });
          const data = await response.json();
          if (data.success) {
            frames.push({
              cameraId: camId,
              cameraName: `Camera ${camId}`,
              snapshotDataUrl: data.dataUrl,
              outputPath: data.path,
              source: "api",
              capturedAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.error(`Failed to capture from camera ${camId}:`, err);
        }
      }

      setSyncedMatchFrames(frames);
      setGroundPlaneStatus(`Captured ${frames.length} synced snapshots from all cameras`);
    } catch (err) {
      setGroundPlaneStatus(`Error: ${err.message}`);
    } finally {
      setBusyLoading(false);
    }
  };

  const handleMatchAcrossCameras = async () => {
    try {
      setBusyLoading(true);
      setGroundPlaneStatus("Matching features across synced cameras...");

      const response = await fetch(`/api/match-features-multiview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frames: syncedMatchFrames,
          cameraId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setValidationPairs(data.matches || []);
        setGroundPlaneStatus(`Matched ${data.matches?.length || 0} feature pairs across cameras`);
      } else {
        setGroundPlaneStatus(`Feature matching failed: ${data.error}`);
      }
    } catch (err) {
      setGroundPlaneStatus(`Error: ${err.message}`);
    } finally {
      setBusyLoading(false);
    }
  };

  const handleCompleteGroundPlane = async () => {
    try {
      setJobLoading(true);
      setGroundPlaneStatus("Saving ground-plane pairs and running calibration solve...");

      const rawPairs = Array.isArray(correspondences) ? correspondences : [];
      const solvePairs = rawPairs
        .map((item, index) => {
          const wx = Number(item?.world?.[0]);
          const wy = Number(item?.world?.[1]);
          const wz = Number(item?.world?.[2]);
          const px = Number(item?.image?.x ?? item?.pixel?.[0]);
          const py = Number(item?.image?.y ?? item?.pixel?.[1]);
          if (![wx, wy, wz, px, py].every((v) => Number.isFinite(v))) return null;
          return {
            markerId: String(item?.id || `m${index + 1}`),
            world: [wx, wy, wz],
            pixel: [px, py],
          };
        })
        .filter(Boolean);

      let solvePayload = null;
      let homographyPayload = null;
      const intrinsicsPath = String(stageOutputs?.intrinsic?.intrinsicsPath || "").trim();

      if (solvePairs.length >= 4 && intrinsicsPath) {
        const solveRes = await fetch("/api/calibration/web/solve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ correspondences: solvePairs, intrinsicsPath }),
        });
        const solveData = await solveRes.json();
        if (solveRes.ok) {
          solvePayload = {
            outputYaml: solveData?.outputYaml || "",
            result: solveData?.result || null,
          };
          setCalibrationResult(solvePayload);
        } else {
          setGroundPlaneStatus(`Saved pairs. Calibration solve failed: ${solveData?.error || "unknown"}`);
        }

      } else if (solvePairs.length < 4) {
        setGroundPlaneStatus("Pairs saved. Need ≥4 valid point pairs to compute calibration/homography.");
      } else {
        setGroundPlaneStatus("Pairs saved. Intrinsic result missing, so PnP solve skipped.");
      }

      if (solvePairs.length >= 4) {
        const hRes = await fetch("/api/calibration/web/homography", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ correspondences: solvePairs }),
        });
        const hData = await hRes.json();
        if (hRes.ok) {
          homographyPayload = hData?.homography || null;
          setHomographyResult(homographyPayload);
        }
      }

      setStageOutput("ground-plane", {
        completed: true,
        timestamp: new Date().toISOString(),
        mappingMode,
        correspondences,
        lineMappings,
        validationPairs,
        syncedFrames: syncedMatchFrames,
        calibrationResult: solvePayload,
        homographyResult: homographyPayload,
      });

      setStepState("ground-plane", {
        status: "Ground plane calibration complete!",
        progress: 100,
        logs: groundLogs.slice(-160),
        result: {
          mappingMode,
          pointMappings: Array.isArray(correspondences) ? correspondences.length : 0,
          lineMappings: lineMappings.length,
          validationPairs: validationPairs.length,
          syncedFrames: syncedMatchFrames.length,
          calibrationResult: solvePayload,
          homographyResult: homographyPayload,
        },
      });

      if (solvePayload || homographyPayload) {
        setGroundPlaneStatus("Ground plane saved. Calibration and homography results updated.");
      }
    } catch (err) {
      setGroundPlaneStatus(`Error: ${err.message}`);
    } finally {
      setJobLoading(false);
    }
  };

  useEffect(() => {
    const pointCount = Array.isArray(correspondences) ? correspondences.length : 0;
    const lineCount = Array.isArray(lineMappings) ? lineMappings.length : 0;
    const pairCount = Array.isArray(validationPairs) ? validationPairs.length : 0;
    const completed = Boolean(stageOutputs?.["ground-plane"]?.completed);
    const progress = completed
      ? 100
      : Math.min(95, Math.max(8, pointCount * 12 + lineCount * 14 + (pairCount > 0 ? 10 : 0)));

    setStepState("ground-plane", {
      status: groundPlaneStatus,
      progress,
      logs: groundLogs.slice(-160),
      result: {
        mappingMode,
        pointMappings: pointCount,
        lineMappings: lineCount,
        validationPairs: pairCount,
        pendingImageLinePoints: pendingImageLine.length,
      },
    });
  }, [
    groundPlaneStatus,
    correspondences,
    lineMappings,
    validationPairs,
    mappingMode,
    pendingImageLine.length,
    stageOutputs,
    groundLogs,
    setStepState,
  ]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Step 3: Ground Plane Calibration</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Image ↔ AutoCAD Coordinates • Project {projectId} • Camera {cameraId}
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
          <div>Source type: <span className="text-zinc-200">{detectSourceType(cameraSourceUrl)}</span></div>
          <div>Camera ID: <span className="text-zinc-200">{cameraId}</span></div>
          <div>Preview mode: <span className="text-zinc-200">{sourceMode === "webcam" ? "Browser webcam" : "MJPEG bridge"}</span></div>
          <div className="sm:col-span-2 break-all">Source URL: <span className="text-zinc-200">{cameraSourceUrl || "Not configured"}</span></div>
        </div>
      </div>

      {!hasPlanePolygons && (
        <div className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-xs text-amber-300">
          Ground plane polygons are not available. Please complete Step 2 Plane Mapping first.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
            <h2 className="text-lg font-semibold mb-3">Live Feed - {cameraId}</h2>
            {feedEnabled ? (
              <div
                ref={feedWrapRef}
                className="relative w-full bg-black rounded border border-zinc-700 aspect-video"
                onClick={handleSelectGroundPoint}
              >
                {sourceMode === "webcam" ? (
                  <video
                    ref={liveVideoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={updateFrameSizeFromVideo}
                    className="w-full h-full object-contain bg-black"
                  />
                ) : (
                  <img
                    ref={liveImgRef}
                    src={liveFeedSrc}
                    alt="Live feed"
                    className="w-full h-full object-contain"
                    onLoad={updateFrameSizeFromImage}
                    onError={() => setFeedEnabled(false)}
                  />
                )}

                <svg className="absolute inset-0 h-full w-full pointer-events-none">
                  {planePolygons.map((polygon, index) => {
                    const pts = polygon.points.map(toDisplayPoint);
                    const pointsAttr = pts.map((pt) => `${pt.x},${pt.y}`).join(" ");
                    return (
                      <g key={`plane-poly-${polygon.id}-${index}`}>
                        <polygon
                          points={pointsAttr}
                          fill="rgba(34,197,94,0.18)"
                          stroke="rgba(34,197,94,0.95)"
                          strokeWidth="2"
                        />
                        {pts[0] ? (
                          <text x={pts[0].x + 6} y={pts[0].y - 6} fill="#86efac" fontSize="11">
                            {polygon.label}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}

                  {displayedCorrespondences.map((entry, idx) => {
                    const point = toDisplayPoint(entry.image);
                    return (
                      <g key={`picked-${entry.item?.id || idx}`}>
                        <circle cx={point.x} cy={point.y} r="5" fill="#fbbf24" stroke="#fff" strokeWidth="1.5" />
                        <text x={point.x + 7} y={point.y - 7} fill="#fde68a" fontSize="10">{idx + 1}</text>
                      </g>
                    );
                  })}

                  {pendingImagePoint ? (() => {
                    const point = toDisplayPoint(pendingImagePoint);
                    return (
                      <g>
                        <circle cx={point.x} cy={point.y} r="6" fill="#60a5fa" stroke="#fff" strokeWidth="1.5" />
                        <text x={point.x + 8} y={point.y - 8} fill="#93c5fd" fontSize="10">pending</text>
                      </g>
                    );
                  })() : null}

                  {pendingImageLine.length === 2 ? (() => {
                    const p1 = toDisplayPoint(pendingImageLine[0]);
                    const p2 = toDisplayPoint(pendingImageLine[1]);
                    return (
                      <g>
                        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#60a5fa" strokeWidth="3" strokeDasharray="6 4" />
                        <circle cx={p1.x} cy={p1.y} r="5" fill="#60a5fa" />
                        <circle cx={p2.x} cy={p2.y} r="5" fill="#60a5fa" />
                      </g>
                    );
                  })() : null}

                  {lineMappings.map((line, index) => {
                    if (!Array.isArray(line?.imageLine) || line.imageLine.length < 2) return null;
                    const p1 = toDisplayPoint(line.imageLine[0]);
                    const p2 = toDisplayPoint(line.imageLine[1]);
                    return (
                      <g key={`line-map-${line.id || index}`}>
                        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#a78bfa" strokeWidth="2.5" />
                        <text x={(p1.x + p2.x) / 2 + 6} y={(p1.y + p2.y) / 2 - 6} fill="#ddd6fe" fontSize="10">L{index + 1}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            ) : (
              <div className="w-full bg-zinc-800 rounded border border-zinc-700 aspect-video flex items-center justify-center">
                <p className="text-xs text-zinc-400">Feed not available</p>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 mb-4 space-y-4">
            <h2 className="text-lg font-semibold">Settings</h2>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Status</h3>
              <div className="rounded border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-300">
                {groundPlaneStatus}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="space-y-3 rounded border border-zinc-800 bg-zinc-950/40 p-3">
                <h3 className="text-sm font-semibold">Mapping Method</h3>
                <select
                  value={mappingMode}
                  onChange={(e) => {
                    setMappingMode(e.target.value);
                    setPendingImagePoint(null);
                    setPendingImageLine([]);
                    setPendingCadLinePoints([]);
                    setGroundPlaneStatus("Mapping method updated.");
                  }}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                >
                  <option value="point-cad">1) Image point ↔ CAD point</option>
                  <option value="point-manual">2) Image point ↔ Manual real-world coordinates</option>
                  <option value="line-cad">3) Image line ↔ CAD line</option>
                  <option value="line-manual">4) Image line ↔ Manual real-world distance</option>
                </select>

                {mappingMode === "point-manual" && (
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={manualWorldInput.x}
                      onChange={(e) => setManualWorldInput((prev) => ({ ...prev, x: e.target.value }))}
                      placeholder="World X"
                      className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs"
                    />
                    <input
                      value={manualWorldInput.y}
                      onChange={(e) => setManualWorldInput((prev) => ({ ...prev, y: e.target.value }))}
                      placeholder="World Y"
                      className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs"
                    />
                    <input
                      value={manualWorldInput.z}
                      onChange={(e) => setManualWorldInput((prev) => ({ ...prev, z: e.target.value }))}
                      placeholder="World Z"
                      className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs"
                    />
                    <button
                      onClick={handleAddManualPointMapping}
                      className="col-span-3 rounded bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-700"
                    >
                      Save Point Mapping
                    </button>
                  </div>
                )}

                {mappingMode === "line-manual" && (
                  <div className="space-y-2">
                    <input
                      value={manualLineDistance}
                      onChange={(e) => setManualLineDistance(e.target.value)}
                      placeholder="Real-world distance for selected image line"
                      className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs"
                    />
                    <button
                      onClick={handleAddManualLineMapping}
                      className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-700"
                    >
                      Save Line Mapping
                    </button>
                  </div>
                )}

                <div className="text-xs text-zinc-400">
                  {mappingMode === "point-cad" && "Click image point on feed, then click corresponding CAD point."}
                  {mappingMode === "point-manual" && "Click image point, then enter world coordinates and save."}
                  {mappingMode === "line-cad" && "Click two image points to form a line, then click CAD line directly (or pick two CAD points)."}
                  {mappingMode === "line-manual" && "Click two image points to form a line, then enter measured real-world distance."}
                </div>
              </div>

              <div className="space-y-3 rounded border border-zinc-800 bg-zinc-950/40 p-3">
                <h3 className="text-sm font-semibold">Multi-Camera Coverage</h3>
                {syncedCameras.length > 0 ? (
                  <>
                    <p className="text-xs text-zinc-400">
                      Synced snapshots from {syncedCameras.length} other cameras
                    </p>
                    <button
                      onClick={handleCaptureSyncedSnapshots}
                      disabled={busyLoading}
                      className="w-full px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition text-sm font-medium"
                    >
                      {busyLoading ? "Capturing..." : "Capture Synced Snapshots"}
                    </button>

                    {syncedMatchFrames.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold">
                            Synced frame {syncedFrameIndex + 1}/{syncedMatchFrames.length} · {syncedMatchFrames[syncedFrameIndex]?.cameraName}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                setSyncedFrameIndex(
                                  (syncedFrameIndex - 1 + syncedMatchFrames.length) % syncedMatchFrames.length
                                )
                              }
                              className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"
                            >
                              ← Prev
                            </button>
                            <button
                              onClick={() => setSyncedFrameIndex((syncedFrameIndex + 1) % syncedMatchFrames.length)}
                              className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"
                            >
                              Next →
                            </button>
                          </div>
                        </div>

                        {syncedMatchFrames[syncedFrameIndex]?.snapshotDataUrl && (
                          <img
                            src={syncedMatchFrames[syncedFrameIndex].snapshotDataUrl}
                            alt={`Synced frame ${syncedFrameIndex + 1}`}
                            className="w-full rounded border border-zinc-700 max-h-60 object-cover"
                          />
                        )}

                        <button
                          onClick={handleMatchAcrossCameras}
                          disabled={busyLoading || syncedMatchFrames.length < 2}
                          className="w-full px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition text-sm font-medium"
                        >
                          Match Features Across Cameras
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-zinc-500">No synced camera feeds found for this project.</p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
            <h2 className="text-lg font-semibold mb-3">Shared CAD Model</h2>
            <ProjectedCadViewer
              segments={segments}
              onPickWorld={handlePickWorldPoint}
              onPickSegment={handlePickWorldLine}
              allowPointPick={mappingMode === "point-cad"}
              allowSegmentPick={mappingMode === "line-cad"}
              pickedWorldPoints={correspondences.map((item) => item?.world).filter(Boolean)}
              validationWorldPoints={[
                ...validationPairs.map((item) => item?.world).filter(Boolean),
                ...pendingCadLinePoints,
              ]}
              title="Shared project CAD"
            />
          </div>

          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 mt-4">
            <h3 className="text-sm font-semibold mb-2">Mapping Summary</h3>
            <div className="text-xs text-zinc-300 space-y-1">
              <p>Point mappings: {Array.isArray(correspondences) ? correspondences.length : 0}</p>
              <p>Line mappings: {lineMappings.length}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={clearAllPairs} className="rounded bg-rose-700/80 hover:bg-rose-700 px-3 py-2 text-xs">Delete All Pairs</button>
              <button onClick={() => setGroundPlaneStatus("Pair list updated.")} className="rounded bg-zinc-700 hover:bg-zinc-600 px-3 py-2 text-xs">Refresh Pair List</button>
            </div>
            <div className="mt-3 max-h-44 overflow-auto space-y-2">
              {Array.isArray(correspondences) && correspondences.map((entry, index) => (
                <div key={`pair-point-${entry?.id || index}`} className="flex items-center justify-between rounded bg-zinc-800 px-2 py-1 text-[11px]">
                  <span>
                    P{index + 1} • {entry?.source || "point"}
                    {entry?.image ? ` • img(${formatNum(entry.image.x)}, ${formatNum(entry.image.y)})` : ""}
                    {Array.isArray(entry?.world) ? ` • cad(${formatNum(entry.world[0])}, ${formatNum(entry.world[1])}, ${formatNum(entry.world[2])})` : ""}
                  </span>
                  <button onClick={() => deletePointPair(entry?.id)} className="text-rose-300 hover:text-rose-200">Delete</button>
                </div>
              ))}
              {lineMappings.map((entry, index) => (
                <div key={`pair-line-${entry?.id || index}`} className="flex items-center justify-between rounded bg-zinc-800 px-2 py-1 text-[11px]">
                  <span>
                    L{index + 1} • {entry?.source || "line"}
                    {Array.isArray(entry?.imageLine) && entry.imageLine.length === 2
                      ? ` • img(${formatNum(entry.imageLine[0]?.x)}, ${formatNum(entry.imageLine[0]?.y)})→(${formatNum(entry.imageLine[1]?.x)}, ${formatNum(entry.imageLine[1]?.y)})`
                      : ""}
                    {Array.isArray(entry?.worldLine) && entry.worldLine.length === 2
                      ? ` • cad(${formatNum(entry.worldLine[0]?.[0])}, ${formatNum(entry.worldLine[0]?.[1])}, ${formatNum(entry.worldLine[0]?.[2])})→(${formatNum(entry.worldLine[1]?.[0])}, ${formatNum(entry.worldLine[1]?.[1])}, ${formatNum(entry.worldLine[1]?.[2])})`
                      : ""}
                    {Number.isFinite(Number(entry?.worldDistance))
                      ? ` • len=${formatNum(entry.worldDistance, 3)}`
                      : ""}
                  </span>
                  <button onClick={() => deleteLinePair(entry?.id)} className="text-rose-300 hover:text-rose-200">Delete</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {(calibrationResult || homographyResult) && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 space-y-3">
          <h3 className="font-semibold">Calibration Results</h3>
          {calibrationResult ? (
            <div className="text-xs text-zinc-300">
              <div>Calibration YAML: <span className="text-zinc-200">{calibrationResult?.outputYaml || "n/a"}</span></div>
              <div>PnP result: <span className="text-zinc-200">{calibrationResult?.result ? "available" : "n/a"}</span></div>
              <div className="mt-2 flex flex-wrap gap-2">
                {calibrationResult?.outputYaml ? (
                  <a
                    href={`/api/calibration/web/output/download?path=${encodeURIComponent(calibrationResult.outputYaml)}`}
                    className="rounded bg-blue-700 hover:bg-blue-600 px-2 py-1 text-[11px] text-white"
                  >
                    Download YAML
                  </a>
                ) : null}
                <button
                  onClick={() => downloadJson(`ground-plane-pnp-${cameraId}.json`, calibrationResult?.result || {})}
                  className="rounded bg-zinc-700 hover:bg-zinc-600 px-2 py-1 text-[11px]"
                >
                  Download PnP JSON
                </button>
              </div>
            </div>
          ) : null}
          {homographyResult ? (
            <div className="text-xs text-zinc-300">
              <div>Homography mode: <span className="text-zinc-200">{homographyResult?.mode || "planar_homography"}</span></div>
              <div>Inliers: <span className="text-zinc-200">{Number(homographyResult?.inliers || 0)}</span></div>
              <div>RMSE(px): <span className="text-zinc-200">{Number(homographyResult?.rmse_px || 0).toFixed(3)}</span></div>
              <div className="mt-2">
                <button
                  onClick={() => downloadJson(`ground-plane-homography-${cameraId}.json`, homographyResult)}
                  className="rounded bg-zinc-700 hover:bg-zinc-600 px-2 py-1 text-[11px]"
                >
                  Download Homography JSON
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {groundLogs.length > 0 && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Step Command Logs</h3>
            <button
              onClick={() => downloadJson(`ground-plane-logs-${cameraId}.json`, { logs: groundLogs })}
              className="rounded bg-zinc-700 hover:bg-zinc-600 px-2 py-1 text-[11px]"
            >
              Download Logs JSON
            </button>
          </div>
          <pre className="max-h-48 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">
            {groundLogs.slice(-80).join("\n")}
          </pre>
        </div>
      )}

      {validationPairs.length > 0 && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <h3 className="font-semibold mb-3">Cross-Camera Feature Matches</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {validationPairs.slice(0, 5).map((pair, idx) => (
              <div key={idx} className="text-xs bg-zinc-800 p-2 rounded flex justify-between">
                <span>{pair.camera1} → {pair.camera2}</span>
                <span className="text-emerald-300">{pair.matchScore?.toFixed(2)} match score</span>
              </div>
            ))}
            {validationPairs.length > 5 && (
              <p className="text-xs text-zinc-400 p-2">+{validationPairs.length - 5} more matches</p>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-4">
        <button
          onClick={() => router.push(`/project/${projectId}/camera/${cameraId}/plane-mapping`)}
          className="flex-1 px-6 py-3 rounded bg-zinc-800 hover:bg-zinc-700 transition font-medium"
        >
          Back Plane Mapping
        </button>
        <button
          onClick={handleCompleteGroundPlane}
          className="flex-1 px-6 py-3 rounded bg-amber-600 hover:bg-amber-700 transition font-medium"
        >
          Save Ground Plane Calibration
        </button>
        <button
          onClick={() => router.push(`/project/${projectId}/camera/${cameraId}`)}
          className="flex-1 px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-700 transition font-medium"
        >
          Next Camera Steps
        </button>
      </div>
    </div>
  );
}
