"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ProjectEntryPage from "@/components/project/ProjectEntryPage";
import StageStatusCard from "@/components/calibration/StageStatusCard";
import { deriveCameraPosition } from "@/components/calibration/CameraPositionPanel";
import CombinedSequenceSection from "@/components/calibration/sections/CombinedSequenceSection";
import CurrentJobSection from "@/components/calibration/sections/CurrentJobSection";
import Cad3dStepSection from "@/components/calibration/sections/Cad3dStepSection";
import GroundPlaneStepSection from "@/components/calibration/sections/GroundPlaneStepSection";
import IntrinsicStepSection from "@/components/calibration/sections/IntrinsicStepSection";
import LiveValidationSection from "@/components/calibration/sections/LiveValidationSection";
import ProjectWorkflowSection from "@/components/calibration/sections/ProjectWorkflowSection";
import RemainingStagesSection from "@/components/calibration/sections/RemainingStagesSection";
import ZMappingStepSection from "@/components/calibration/sections/ZMappingStepSection";

const STAGES = [
  "intrinsic",
  "ground-plane",
  "z-mapping",
  "cad-3d-dwg",
  "extrinsic",
  "sfm",
  "overlay",
];

const PROJECT_CALIBRATION_STAGES = [...STAGES];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function CalibrationConsole({
  routeProjectId = "",
  routeCameraId = "",
  projectHomeHref = "",
  nextCameraHref = "",
  hideProjectWorkflow = false,
}) {
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
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectSharedDwgPath, setProjectSharedDwgPath] = useState("");
  const [projectSharedDwgFileName, setProjectSharedDwgFileName] = useState("");
  const [projectStatus, setProjectStatus] = useState("No multi-camera project loaded.");
  const [projectConfigPath, setProjectConfigPath] = useState("");
  const [projectOpenPath, setProjectOpenPath] = useState("");
  const [loadedProjectId, setLoadedProjectId] = useState("");
  const [projectDraftName, setProjectDraftName] = useState("multi-camera-project");
  const [projectDraftDescription, setProjectDraftDescription] = useState("");
  const [projectDraftSharedDwgPath, setProjectDraftSharedDwgPath] = useState("");
  const [projectDraftCameras, setProjectDraftCameras] = useState([
    {
      id: "cam-1",
      name: "Camera 1",
      location: "",
      cameraType: "cctv",
      sourceMode: "rtsp",
      sourceUrl: "",
      intrinsicsPath: "",
      checkerboard: "9x6",
      squareSize: 0.024,
      minSamples: 18,
    },
  ]);
  const [projectCameras, setProjectCameras] = useState([]);
  const [activeProjectCameraId, setActiveProjectCameraId] = useState("");
  const [cameraWorkspaces, setCameraWorkspaces] = useState({});
  const [sharedMarkers, setSharedMarkers] = useState([]);
  const [pendingSharedMarkerIndex, setPendingSharedMarkerIndex] = useState(null);
  const [projectSequenceRunning, setProjectSequenceRunning] = useState(false);
  const [projectSequenceStatus, setProjectSequenceStatus] = useState("Project sequence idle.");
  const [projectSequenceLogs, setProjectSequenceLogs] = useState([]);
  const [projectRunStageChain, setProjectRunStageChain] = useState(false);
  const [projectAutoTriangulate, setProjectAutoTriangulate] = useState(true);
  const [triangulationStatus, setTriangulationStatus] = useState("No multi-camera triangulation run yet.");
  const [triangulationResult, setTriangulationResult] = useState(null);
  const [feedEnabled, setFeedEnabled] = useState(false);
  const [feedNonce, setFeedNonce] = useState(0);
  const [feedError, setFeedError] = useState("");
  const [feedFps, setFeedFps] = useState(12);
  const [feedWidth, setFeedWidth] = useState(960);
  const [snapshotDataUrl, setSnapshotDataUrl] = useState("");
  const [snapshotPath, setSnapshotPath] = useState("");
  const [snapshotStatus, setSnapshotStatus] = useState("No snapshot captured yet.");
  const [correspondenceText, setCorrespondenceText] = useState(
    '[\n  {"world":[0,0,0],"pixel":[100,100]},\n  {"world":[6,0,0],"pixel":[500,110]},\n  {"world":[6,4,0],"pixel":[520,320]},\n  {"world":[0,4,0],"pixel":[90,310]}\n]'
  );
  const [solveStatus, setSolveStatus] = useState("No headless solve run yet.");
  const [latestCalibrationYamlPath, setLatestCalibrationYamlPath] = useState("");
  const [validationPairs, setValidationPairs] = useState([]);
  const [validationStatus, setValidationStatus] = useState("No live validation run yet.");
  const [validationResult, setValidationResult] = useState(null);
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
  const [pendingZImageTip, setPendingZImageTip] = useState(null);
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamStatus, setWebcamStatus] = useState("Webcam not started.");

  const [stageOutputs, setStageOutputs] = useState({
    intrinsic: "",
    "ground-plane": "",
    "z-mapping": "",
    "cad-3d-dwg": "",
    extrinsic: "",
    sfm: "",
    overlay: "",
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
  const [sequenceRunning, setSequenceRunning] = useState(false);
  const [sequenceStatus, setSequenceStatus] = useState("Combined sequence is idle.");
  const [sequenceLogs, setSequenceLogs] = useState([]);
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
  const [stageOutputDetails, setStageOutputDetails] = useState({});
  const [stageOutputLoading, setStageOutputLoading] = useState({});
  const [intrinsicSolveResult, setIntrinsicSolveResult] = useState(null);
  const [pnpSolveResult, setPnpSolveResult] = useState(null);
  const cameraPosition = useMemo(() => deriveCameraPosition(pnpSolveResult), [pnpSolveResult]);
  const [snapshotNaturalSize, setSnapshotNaturalSize] = useState({ width: 1, height: 1 });
  const [draggingImagePointIndex, setDraggingImagePointIndex] = useState(null);

  const dwgInputRef = useRef(null);
  const sfmInputRef = useRef(null);
  const projectConfigInputRef = useRef(null);
  const projectSharedDwgInputRef = useRef(null);
  const snapshotImgRef = useRef(null);
  const snapshotOverlayRef = useRef(null);
  const webcamVideoRef = useRef(null);
  const intrinsicVideoRef = useRef(null);
  const groundVideoRef = useRef(null);
  const cadPreviewAttemptedPathRef = useRef("");

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeCorrespondenceList(pairs) {
    if (!Array.isArray(pairs)) {
      return [];
    }
    const normalized = [];
    for (let i = 0; i < pairs.length; i += 1) {
      const item = pairs[i];
      if (!item || !Array.isArray(item.world) || item.world.length !== 3 || !Array.isArray(item.pixel) || item.pixel.length !== 2) {
        continue;
      }
      normalized.push({
        markerId: String(item.markerId || `m${i + 1}`),
        world: [Number(item.world[0]), Number(item.world[1]), Number(item.world[2])],
        pixel: [Number(item.pixel[0]), Number(item.pixel[1])],
      });
    }
    return normalized;
  }

  function buildDefaultCompletedStages() {
    return {
      intrinsic: false,
      "ground-plane": false,
      "z-mapping": false,
      "cad-3d-dwg": false,
      extrinsic: false,
      sfm: false,
      overlay: false,
    };
  }

  function buildProjectDraftCamera(index = 1) {
    return {
      id: `cam-${index}`,
      name: `Camera ${index}`,
      location: "",
      cameraType: "cctv",
      sourceMode: "rtsp",
      sourceUrl: "",
      intrinsicsPath: "",
      checkerboard: "9x6",
      squareSize: 0.024,
      minSamples: 18,
    };
  }

  function resolveProjectDwgPath(camera = null, workspace = null, sharedPathOverride = "") {
    return String(
      sharedPathOverride ||
        projectSharedDwgPath ||
        workspace?.dwgPath ||
        camera?.dwgPath ||
        dwgPath ||
        ""
    );
  }

  function resolveProjectDwgFileName(camera = null, workspace = null, sharedFileOverride = "", sharedPathOverride = "") {
    const resolvedPath = resolveProjectDwgPath(camera, workspace, sharedPathOverride);
    return String(
      sharedFileOverride ||
        projectSharedDwgFileName ||
        workspace?.dwgFileName ||
        camera?.dwgFileName ||
        (resolvedPath ? resolvedPath.split("/").pop() : "") ||
        ""
    );
  }

  function buildWorkspaceForCamera(camera, workspace = {}, sharedPathOverride = "", sharedFileOverride = "") {
    return {
      cameraType: workspace.cameraType || camera?.cameraType || "cctv",
      sourceMode: workspace.sourceMode || camera?.sourceMode || "rtsp",
      sourceUrl: workspace.sourceUrl || camera?.sourceUrl || "",
      checkerboard: workspace.checkerboard || camera?.checkerboard || "9x6",
      squareSize: Number(workspace.squareSize ?? camera?.squareSize ?? 0.024),
      minSamples: Number(workspace.minSamples ?? camera?.minSamples ?? 18),
      dwgPath: resolveProjectDwgPath(camera, workspace, sharedPathOverride),
      dwgFileName: resolveProjectDwgFileName(camera, workspace, sharedFileOverride, sharedPathOverride),
      intrinsicsPath: workspace.intrinsicsPath || camera?.intrinsicsPath || "",
      correspondences: normalizeCorrespondenceList(workspace.correspondences),
      zMappings: Array.isArray(workspace.zMappings) ? workspace.zMappings : [],
      validationPairs: Array.isArray(workspace.validationPairs) ? workspace.validationPairs : [],
      snapshotDataUrl: workspace.snapshotDataUrl || "",
      snapshotPath: workspace.snapshotPath || "",
      segments: Array.isArray(workspace.segments) ? workspace.segments : [],
      stageResolvedOutputs:
        workspace.stageResolvedOutputs && typeof workspace.stageResolvedOutputs === "object" ? workspace.stageResolvedOutputs : {},
      completedStages:
        workspace.completedStages && typeof workspace.completedStages === "object"
          ? { ...buildDefaultCompletedStages(), ...workspace.completedStages }
          : buildDefaultCompletedStages(),
      stageOutputs:
        workspace.stageOutputs && typeof workspace.stageOutputs === "object" ? workspace.stageOutputs : deepClone(stageOutputs),
      latestCalibrationYamlPath: workspace.latestCalibrationYamlPath || "",
    };
  }

  function buildProjectConfigFromState() {
    const activeWorkspace = activeProjectCameraId ? { [activeProjectCameraId]: buildCurrentWorkspacePayload() } : {};
    const mergedWorkspaces = { ...cameraWorkspaces, ...activeWorkspace };
    const sharedPath = projectSharedDwgPath || dwgPath || "";
    const sharedFile = projectSharedDwgFileName || dwgFileName || (sharedPath ? sharedPath.split("/").pop() : "") || "";

    const cameras = projectCameras.map((camera) => {
      const location = String(camera.location || camera.area || "");
      return {
        id: String(camera.id || ""),
        name: String(camera.name || camera.id || "Camera"),
        location,
        area: location,
        cameraType: String(camera.cameraType || "cctv"),
        sourceMode: String(camera.sourceMode || "rtsp"),
        sourceUrl: String(camera.sourceUrl || ""),
        dwgPath: sharedPath,
        dwgFileName: sharedFile,
        intrinsicsPath: String(camera.intrinsicsPath || ""),
        checkerboard: String(camera.checkerboard || "9x6"),
        squareSize: Number(camera.squareSize ?? 0.024),
        minSamples: Number(camera.minSamples ?? 18),
      };
    });

    const nextWorkspaces = {};
    for (const camera of cameras) {
      nextWorkspaces[camera.id] = buildWorkspaceForCamera(camera, mergedWorkspaces[camera.id] || {}, sharedPath, sharedFile);
    }

    return {
      schemaVersion: 2,
      projectId: loadedProjectId || undefined,
      projectName: String(projectName || "multi-camera-project"),
      projectDescription: String(projectDescription || ""),
      sharedDwgPath: sharedPath,
      sharedDwgFileName: sharedFile,
      cameras,
      sharedMarkers: deepClone(Array.isArray(sharedMarkers) ? sharedMarkers : []),
      cameraWorkspaces: nextWorkspaces,
      activeProjectCameraId: activeProjectCameraId || cameras[0]?.id || "",
      updatedAt: new Date().toISOString(),
    };
  }

  function hydrateProjectState(config, outputPath = "", statusVerb = "Loaded") {
    const cameras = Array.isArray(config?.cameras) ? config.cameras : [];
    const markers = Array.isArray(config?.sharedMarkers) ? config.sharedMarkers : [];
    const sharedPath = String(config?.sharedDwgPath || config?.dwgPath || cameras.find((camera) => camera?.dwgPath)?.dwgPath || "");
    const sharedFile = String(
      config?.sharedDwgFileName ||
        config?.dwgFileName ||
        cameras.find((camera) => camera?.dwgFileName)?.dwgFileName ||
        (sharedPath ? sharedPath.split("/").pop() : "") ||
        ""
    );

    const workspaceInput =
      config?.cameraWorkspaces && typeof config.cameraWorkspaces === "object"
        ? config.cameraWorkspaces
        : config?.workspaces && typeof config.workspaces === "object"
          ? config.workspaces
          : {};

    const nextWorkspaces = {};
    for (const camera of cameras) {
      nextWorkspaces[camera.id] = buildWorkspaceForCamera(camera, workspaceInput[camera.id] || {}, sharedPath, sharedFile);
    }

    setLoadedProjectId(String(config?.projectId || routeProjectId || ""));
    setProjectName(config?.projectName || "multi-camera-project");
    setProjectDescription(config?.projectDescription || "");
    setProjectSharedDwgPath(sharedPath);
    setProjectSharedDwgFileName(sharedFile);
    setProjectConfigPath(outputPath || "");
    setProjectOpenPath(outputPath || "");
    setProjectCameras(cameras.map((camera) => ({ ...camera, dwgPath: sharedPath, dwgFileName: sharedFile })));
    setSharedMarkers(markers);
    setCameraWorkspaces(nextWorkspaces);
    setTriangulationResult(null);
    setTriangulationStatus("No multi-camera triangulation run yet.");

    setProjectDraftName(config?.projectName || "multi-camera-project");
    setProjectDraftDescription(config?.projectDescription || "");
    setProjectDraftSharedDwgPath(sharedPath || "");
    setProjectDraftCameras(
      cameras.length
        ? cameras.map((camera, index) => ({
            id: camera.id || `cam-${index + 1}`,
            name: camera.name || `Camera ${index + 1}`,
            location: camera.location || camera.area || "",
            cameraType: camera.cameraType || "cctv",
            sourceMode: camera.sourceMode || "rtsp",
            sourceUrl: camera.sourceUrl || "",
            intrinsicsPath: camera.intrinsicsPath || "",
            checkerboard: camera.checkerboard || "9x6",
            squareSize: Number(camera.squareSize ?? 0.024),
            minSamples: Number(camera.minSamples ?? 18),
          }))
        : [buildProjectDraftCamera(1)]
    );

    const preferredCameraId =
      String(config?.activeProjectCameraId || config?.lastActiveCameraId || "") || cameras[0]?.id || "";
    if (preferredCameraId) {
      const selectedCamera = cameras.find((camera) => camera.id === preferredCameraId) || cameras[0];
      setActiveProjectCameraId(selectedCamera.id);
      applyCameraWorkspace(selectedCamera, nextWorkspaces[selectedCamera.id] || {}, sharedPath, sharedFile);
    }

    setProjectStatus(`${statusVerb} project '${config?.projectName || "multi-camera-project"}' with ${cameras.length} cameras.`);
  }

  function withCameraSuffix(basePath, cameraId, stage) {
    const fallback = `uploads/stages/${stage}.json`;
    const raw = String(basePath || fallback).trim();
    if (!raw) {
      return `${fallback.replace(/\.json$/, "")}-${cameraId}.json`;
    }
    if (raw.includes("{cameraId}")) {
      return raw.replaceAll("{cameraId}", cameraId);
    }
    const extMatch = raw.match(/^(.*?)(\.[^./\\]+)$/);
    if (extMatch) {
      return `${extMatch[1]}-${cameraId}${extMatch[2]}`;
    }
    return `${raw}-${cameraId}`;
  }

  function appendProjectSequenceLog(message) {
    setProjectSequenceLogs((prev) => {
      const next = [...prev, message];
      return next.length > 240 ? next.slice(next.length - 240) : next;
    });
  }

  function getProjectCameraById(cameraId, fromList = projectCameras) {
    return fromList.find((camera) => camera.id === cameraId) || null;
  }

  function buildCurrentWorkspacePayload() {
    const resolvedDwgPath = projectSharedDwgPath || dwgPath || "";
    const resolvedDwgFileName =
      projectSharedDwgFileName ||
      dwgFileName ||
      (resolvedDwgPath ? resolvedDwgPath.split("/").pop() : "") ||
      "";

    return {
      cameraType,
      sourceMode,
      sourceUrl,
      checkerboard,
      squareSize,
      minSamples,
      dwgPath: resolvedDwgPath,
      dwgFileName: resolvedDwgFileName,
      segments: deepClone(Array.isArray(segments) ? segments : []),
      snapshotDataUrl: snapshotDataUrl || "",
      snapshotPath: snapshotPath || "",
      correspondences: deepClone(normalizeCorrespondenceList(correspondences)),
      zMappings: deepClone(Array.isArray(zMappings) ? zMappings : []),
      validationPairs: deepClone(Array.isArray(validationPairs) ? validationPairs : []),
      intrinsicsPath: intrinsicsPath || "",
      latestCalibrationYamlPath: latestCalibrationYamlPath || "",
      stageOutputs: deepClone(stageOutputs),
      stageResolvedOutputs: deepClone(stageResolvedOutputs),
      completedStages: deepClone(completedStages),
    };
  }

  function applyCameraWorkspace(camera, workspace = {}, sharedPathOverride = "", sharedFileOverride = "") {
    const defaultCompletedStages = buildDefaultCompletedStages();

    const loadedPairs = normalizeCorrespondenceList(workspace.correspondences);
    const loadedZmappings = Array.isArray(workspace.zMappings) ? workspace.zMappings : [];
    const loadedValidation = Array.isArray(workspace.validationPairs) ? workspace.validationPairs : [];

    setCameraType(workspace.cameraType || camera?.cameraType || "cctv");
    setSourceMode(workspace.sourceMode || camera?.sourceMode || "rtsp");
    setSourceUrl(workspace.sourceUrl || camera?.sourceUrl || "");
    setCheckerboard(workspace.checkerboard || camera?.checkerboard || "9x6");
    setSquareSize(Number(workspace.squareSize ?? camera?.squareSize ?? 0.024));
    setMinSamples(Number(workspace.minSamples ?? camera?.minSamples ?? 18));

    const loadedDwgPath = resolveProjectDwgPath(camera, workspace, sharedPathOverride);
    const loadedDwgFile = resolveProjectDwgFileName(camera, workspace, sharedFileOverride, sharedPathOverride);
    setDwgPath(loadedDwgPath);
    setDwgFileName(loadedDwgFile);
    setDwgMessage(loadedDwgPath ? `Shared CAD loaded: ${loadedDwgFile || loadedDwgPath}` : "No DWG/DXF uploaded yet.");

    const workspaceSegments = Array.isArray(workspace.segments) ? workspace.segments : [];
    setSegments((prevSegments) => {
      if (workspaceSegments.length) {
        return workspaceSegments;
      }
      if (loadedDwgPath && loadedDwgPath === dwgPath && Array.isArray(prevSegments) && prevSegments.length) {
        return prevSegments;
      }
      return [];
    });
    setSnapshotDataUrl(workspace.snapshotDataUrl || "");
    setSnapshotPath(workspace.snapshotPath || "");
    setCorrespondences(loadedPairs);
    setCorrespondenceText(JSON.stringify(loadedPairs, null, 2));
    setZMappings(loadedZmappings);
    setValidationPairs(loadedValidation);
    setIntrinsicsPath(workspace.intrinsicsPath || camera?.intrinsicsPath || "");
    setLatestCalibrationYamlPath(workspace.latestCalibrationYamlPath || "");
    setStageOutputs(workspace.stageOutputs || stageOutputs);
    setStageResolvedOutputs(workspace.stageResolvedOutputs || {});
    setCompletedStages({ ...defaultCompletedStages, ...(workspace.completedStages || {}) });
  }

  async function loadCadPreviewByPath(targetPath) {
    const normalizedPath = String(targetPath || "").trim();
    if (!normalizedPath) {
      return;
    }

    try {
      const res = await fetch("/api/uploads/dwg/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: normalizedPath }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load CAD preview");
      }

      const previewSegments = Array.isArray(data?.preview?.segments) ? data.preview.segments : [];
      setSegments(previewSegments);
      const loadedName = data?.fileName || normalizedPath.split("/").pop() || normalizedPath;
      setDwgMessage(data?.note || `Shared CAD loaded: ${loadedName}`);
    } catch (err) {
      setDwgMessage(err instanceof Error ? err.message : "Failed to load CAD preview");
    }
  }

  function openProjectCamera(cameraId, fromList = projectCameras, fromWorkspaces = cameraWorkspaces) {
    const targetCamera = getProjectCameraById(cameraId, fromList);
    if (!targetCamera) {
      setProjectStatus(`Camera '${cameraId}' not found in project.`);
      return;
    }

    let nextWorkspaces = fromWorkspaces;
    if (activeProjectCameraId && activeProjectCameraId !== cameraId) {
      nextWorkspaces = {
        ...fromWorkspaces,
        [activeProjectCameraId]: buildCurrentWorkspacePayload(),
      };
      setCameraWorkspaces(nextWorkspaces);
    }

    const savedWorkspace = nextWorkspaces[cameraId] || {};
    setActiveProjectCameraId(cameraId);
    applyCameraWorkspace(targetCamera, savedWorkspace, projectSharedDwgPath, projectSharedDwgFileName);
    setProjectStatus(`Opened camera '${targetCamera.name}' (${targetCamera.id}).`);
  }

  function syncCurrentPairsToSharedMarkers() {
    if (!activeProjectCameraId) {
      setProjectStatus("Open/select a project camera first.");
      return;
    }

    const pairs = normalizeCorrespondenceList(correspondences);
    if (!pairs.length) {
      setProjectStatus("No ground-plane pairs to sync into shared markers.");
      return;
    }

    setSharedMarkers((prev) => {
      const map = new Map(
        (Array.isArray(prev) ? prev : []).map((item) => [
          String(item.id),
          {
            ...item,
            observations: { ...(item.observations || {}) },
          },
        ])
      );

      for (let i = 0; i < pairs.length; i += 1) {
        const pair = pairs[i];
        const markerId = String(pair.markerId || `m${i + 1}`);
        const existing = map.get(markerId) || {
          id: markerId,
          world: [Number(pair.world[0]), Number(pair.world[1]), Number(pair.world[2])],
          observations: {},
        };

        if (!existing.world && Array.isArray(pair.world) && pair.world.length === 3) {
          existing.world = [Number(pair.world[0]), Number(pair.world[1]), Number(pair.world[2])];
        }

        existing.observations = {
          ...(existing.observations || {}),
          [activeProjectCameraId]: [Number(pair.pixel[0]), Number(pair.pixel[1])],
        };

        map.set(markerId, existing);
      }

      return Array.from(map.values());
    });

    setProjectStatus(`Synced ${pairs.length} marker pairs from camera '${activeProjectCameraId}' into shared markers.`);
  }

  function beginSharedMarkerCapture() {
    if (!activeProjectCameraId) {
      setSolveStatus("Select/open a project camera first.");
      return;
    }

    if (!sharedMarkers.length) {
      setSolveStatus("No shared markers available. Sync marker points from at least one camera first.");
      return;
    }

    const idx = sharedMarkers.findIndex((marker) => {
      const hasWorld = Array.isArray(marker.world) && marker.world.length === 3;
      const hasCurrentObs = marker?.observations?.[activeProjectCameraId];
      return hasWorld && !hasCurrentObs;
    });

    if (idx < 0) {
      setSolveStatus("All shared markers already have image observations for this camera.");
      return;
    }

    setImagePickMode("shared-marker");
    setPendingSharedMarkerIndex(idx);
    setPendingImagePoint(null);
    const marker = sharedMarkers[idx];
    setSolveStatus(`Shared marker mode active. Click image point for marker '${marker.id}'.`);
  }

  function stopSharedMarkerCapture() {
    setImagePickMode("ground");
    setPendingSharedMarkerIndex(null);
    setPendingImagePoint(null);
    setSolveStatus("Shared marker capture stopped.");
  }

  function addProjectDraftCamera() {
    setProjectDraftCameras((prev) => [...prev, buildProjectDraftCamera(prev.length + 1)]);
  }

  function updateProjectDraftCamera(index, field, value) {
    setProjectDraftCameras((prev) =>
      prev.map((camera, idx) => {
        if (idx !== index) {
          return camera;
        }

        if (field === "squareSize" || field === "minSamples") {
          const numeric = Number(value);
          return { ...camera, [field]: Number.isFinite(numeric) ? numeric : camera[field] };
        }

        return { ...camera, [field]: value };
      })
    );
  }

  function removeProjectDraftCamera(index) {
    setProjectDraftCameras((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      return prev.filter((_, idx) => idx !== index);
    });
  }

  function useCurrentDwgForDraft() {
    const current = String(projectSharedDwgPath || dwgPath || "").trim();
    if (!current) {
      setProjectStatus("Upload DWG/DXF first, then use it as shared project DWG.");
      return;
    }
    setProjectDraftSharedDwgPath(current);
  }

  async function createProjectFromDraft() {
    try {
      const name = String(projectDraftName || "").trim();
      if (!name) {
        throw new Error("Project name is required.");
      }

      const sharedPath = String(projectDraftSharedDwgPath || projectSharedDwgPath || dwgPath || "").trim();
      if (!sharedPath) {
        throw new Error("Shared project DWG path is required.");
      }

      const sharedFileName = sharedPath.split("/").pop() || "";
      const cameras = projectDraftCameras
        .map((camera, index) => {
          const location = String(camera.location || camera.area || "").trim();
          return {
            id: String(camera.id || "").trim() || `cam-${index + 1}`,
            name: String(camera.name || "").trim() || `Camera ${index + 1}`,
            location,
            area: location,
            cameraType: String(camera.cameraType || "cctv"),
            sourceMode: String(camera.sourceMode || "rtsp"),
            sourceUrl: String(camera.sourceUrl || "").trim(),
            intrinsicsPath: String(camera.intrinsicsPath || "").trim(),
            checkerboard: String(camera.checkerboard || "9x6"),
            squareSize: Number(camera.squareSize ?? 0.024),
            minSamples: Number(camera.minSamples ?? 18),
          };
        })
        .filter((camera) => camera.id && camera.name);

      if (!cameras.length) {
        throw new Error("Add at least one valid camera in project builder.");
      }

      const projectConfig = {
        schemaVersion: 2,
        projectName: name,
        projectDescription: String(projectDraftDescription || "").trim(),
        sharedDwgPath: sharedPath,
        sharedDwgFileName: sharedFileName,
        cameras,
        sharedMarkers: [],
        cameraWorkspaces: {},
      };

      const res = await fetch("/api/calibration/web/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectConfig }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Project creation failed");
      }

      hydrateProjectState(data?.projectConfig, data?.outputPath || "", "Created");
    } catch (err) {
      setProjectStatus(err instanceof Error ? err.message : "Project creation failed");
    }
  }

  async function saveCurrentProjectConfig() {
    try {
      if (!projectCameras.length) {
        throw new Error("Create or open a project first.");
      }

      const projectConfig = buildProjectConfigFromState();
      const targetProjectId = String(routeProjectId || loadedProjectId || projectConfig.projectId || "").trim();

      const endpoint = targetProjectId
        ? `/api/calibration/web/projects/${encodeURIComponent(targetProjectId)}`
        : "/api/calibration/web/project-config";
      const payload = targetProjectId
        ? { projectConfig }
        : {
            projectConfig,
            outputPath: projectConfigPath || undefined,
          };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to save project config");
      }

      if (data?.projectId) {
        setLoadedProjectId(String(data.projectId));
      }
      hydrateProjectState(data?.projectConfig, data?.outputPath || projectConfigPath || "", "Saved");
    } catch (err) {
      setProjectStatus(err instanceof Error ? err.message : "Failed to save project config");
    }
  }

  async function uploadProjectConfig(file) {
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/calibration/web/project-config", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Project config upload failed");
      }
      hydrateProjectState(data?.projectConfig, data?.outputPath || "", "Loaded");
    } catch (err) {
      setProjectStatus(err instanceof Error ? err.message : "Project config upload failed");
    }
  }

  async function openProjectByPath() {
    try {
      if (!projectOpenPath.trim()) {
        throw new Error("Enter a project config path first.");
      }

      const res = await fetch(`/api/calibration/web/project-config?path=${encodeURIComponent(projectOpenPath.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to open project config");
      }
      hydrateProjectState(data?.projectConfig, data?.outputPath || projectOpenPath.trim(), "Opened");
    } catch (err) {
      setProjectStatus(err instanceof Error ? err.message : "Failed to open project config");
    }
  }

  function getProjectCameraStageReadiness(stage, camera, workspace, completedMap) {
    const idx = PROJECT_CALIBRATION_STAGES.indexOf(stage);
    if (idx > 0) {
      const prevStage = PROJECT_CALIBRATION_STAGES[idx - 1];
      if (!completedMap[prevStage]) {
        return { enabled: false, status: `Complete previous stage first (${prevStage}).` };
      }
    }

    const sourceModeValue = workspace.sourceMode || camera.sourceMode || "rtsp";
    const sourceUrlValue = workspace.sourceUrl || camera.sourceUrl || "";
    const dwgPathValue = resolveProjectDwgPath(camera, workspace);
    const corr = normalizeCorrespondenceList(workspace.correspondences);
    const zMap = Array.isArray(workspace.zMappings) ? workspace.zMappings : [];
    const snapshot = workspace.snapshotDataUrl || workspace.snapshotPath || "";

    if (stage === "intrinsic") {
      if (sourceModeValue !== "webcam" && !sourceUrlValue) {
        return { enabled: false, status: "Set source URL for this camera." };
      }
      return { enabled: true, status: "Ready" };
    }

    if (stage === "ground-plane") {
      if (!dwgPathValue) {
        return { enabled: false, status: "DWG path missing." };
      }
      if (!snapshot) {
        return { enabled: false, status: "Snapshot missing." };
      }
      if (corr.length < 4) {
        return { enabled: false, status: `Need at least 4 pairs (have ${corr.length}).` };
      }
      return { enabled: true, status: "Ready" };
    }

    if (stage === "z-mapping") {
      if (!snapshot) {
        return { enabled: false, status: "Snapshot missing." };
      }
      if (zMap.length < 1) {
        return { enabled: false, status: "Need at least 1 z-mapping point." };
      }
      return { enabled: true, status: "Ready" };
    }

    if (stage === "cad-3d-dwg") {
      if (!dwgPathValue) {
        return { enabled: false, status: "DWG path missing." };
      }
      return { enabled: true, status: "Ready" };
    }

    return { enabled: true, status: "Ready" };
  }

  async function solvePnpForWorkspace(camera, workspace) {
    const pairs = normalizeCorrespondenceList(workspace.correspondences);
    if (pairs.length < 4) {
      throw new Error(`[${camera.id}] Need at least 4 correspondences for solvePnP.`);
    }

    const res = await fetch("/api/calibration/web/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        correspondences: pairs,
        intrinsicsPath: workspace.intrinsicsPath || camera.intrinsicsPath || "",
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || `[${camera.id}] Solve PnP failed`);
    }

    return data.outputYaml || "";
  }

  async function startProjectStage(stage, camera, workspace) {
    const resolvedDwgPath = resolveProjectDwgPath(camera, workspace);
    const resolvedDwgFileName = resolveProjectDwgFileName(camera, workspace);

    const cfg = {
      cameraType: workspace.cameraType || camera.cameraType || "cctv",
      sourceMode: workspace.sourceMode || camera.sourceMode || "rtsp",
      sourceUrl: (workspace.sourceMode || camera.sourceMode || "rtsp") === "webcam"
        ? "__webcam__"
        : (workspace.sourceUrl || camera.sourceUrl || sourceUrl),
      dwgFileName: resolvedDwgFileName,
      dwgPath: resolvedDwgPath,
      checkerboard: workspace.checkerboard || camera.checkerboard || checkerboard,
      squareSize: Number(workspace.squareSize ?? camera.squareSize ?? squareSize),
      minSamples: Number(workspace.minSamples ?? camera.minSamples ?? minSamples),
      stageOutputPath: withCameraSuffix(workspace?.stageOutputs?.[stage] || stageOutputs[stage] || "", camera.id, stage),
      webMode: true,
      options: {
        useGroundPlane,
        useZDirection,
        useSfm,
        useRealtimeOverlay: useOverlay,
      },
    };

    const res = await fetch("/api/calibration/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, config: cfg }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || `[${camera.id}] failed to start stage '${stage}'`);
    }
    return { jobId: data?.job?.id, config: cfg };
  }

  function buildTriangulationPayload(workspacesArg = cameraWorkspaces) {
    const camerasPayload = [];
    for (const camera of projectCameras) {
      const workspace = workspacesArg[camera.id] || {};
      const calibrationYamlPath = workspace.latestCalibrationYamlPath || camera.calibrationYamlPath || "";
      if (!calibrationYamlPath) {
        continue;
      }
      camerasPayload.push({
        cameraId: camera.id,
        calibrationYamlPath,
        intrinsicsPath: workspace.intrinsicsPath || camera.intrinsicsPath || "",
        snapshotPath: workspace.snapshotPath || camera.snapshotPath || "",
      });
    }

    const markerMap = new Map();

    for (const marker of sharedMarkers) {
      const markerId = String(marker.id || marker.markerId || "").trim();
      if (!markerId) {
        continue;
      }
      markerMap.set(markerId, {
        markerId,
        world: Array.isArray(marker.world) && marker.world.length === 3
          ? [Number(marker.world[0]), Number(marker.world[1]), Number(marker.world[2])]
          : undefined,
        observations: { ...(marker.observations || {}) },
      });
    }

    for (const camera of projectCameras) {
      const workspace = workspacesArg[camera.id] || {};
      const pairs = normalizeCorrespondenceList(workspace.correspondences);
      for (let i = 0; i < pairs.length; i += 1) {
        const pair = pairs[i];
        const markerId = String(pair.markerId || `m${i + 1}`);
        const existing = markerMap.get(markerId) || {
          markerId,
          world: [Number(pair.world[0]), Number(pair.world[1]), Number(pair.world[2])],
          observations: {},
        };

        if (!existing.world) {
          existing.world = [Number(pair.world[0]), Number(pair.world[1]), Number(pair.world[2])];
        }

        existing.observations = {
          ...(existing.observations || {}),
          [camera.id]: [Number(pair.pixel[0]), Number(pair.pixel[1])],
        };

        markerMap.set(markerId, existing);
      }
    }

    const markersPayload = Array.from(markerMap.values()).map((item) => {
      const observations = Object.entries(item.observations || {}).map(([cameraId, pixel]) => ({
        cameraId,
        pixel,
      }));
      return {
        markerId: item.markerId,
        world: item.world,
        observations,
      };
    });

    return { camerasPayload, markersPayload };
  }

  async function runProjectTriangulation(workspacesArg = cameraWorkspaces) {
    try {
      const { camerasPayload, markersPayload } = buildTriangulationPayload(workspacesArg);
      if (camerasPayload.length < 2) {
        throw new Error("Need at least 2 cameras with solved calibration YAML paths.");
      }

      const autoMatch = markersPayload.length === 0;
      if (autoMatch) {
        const camerasWithSnapshots = camerasPayload.filter((item) => item.snapshotPath);
        if (camerasWithSnapshots.length < 2) {
          throw new Error("No shared markers found and not enough camera snapshots for auto feature matching.");
        }
      }

      const res = await fetch("/api/calibration/web/triangulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cameras: camerasPayload,
          markers: markersPayload,
          autoMatch,
          matchOptions: {
            method: "auto",
            maxFeatures: 2048,
            maxMatchesPerPair: 600,
            minConfidence: 0.35,
            maxImageSide: 1280,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Multi-camera triangulation failed");
      }

      const result = data?.triangulation || null;
      setTriangulationResult(result);
      const rmse = result?.metrics?.reprojection_error_px?.rmse;
      const autoLabel = result?.auto_match?.marker_count ? `, AutoMatchMarkers=${result.auto_match.marker_count}` : "";
      setTriangulationStatus(
        `Triangulation OK. Points=${result?.marker_count_triangulated ?? 0}, Reprojection RMSE=${typeof rmse === "number" ? rmse.toFixed(2) : "n/a"} px${autoLabel}`
      );
      return { ok: true, result };
    } catch (err) {
      setTriangulationStatus(err instanceof Error ? err.message : "Multi-camera triangulation failed");
      return { ok: false, error: err instanceof Error ? err.message : "Multi-camera triangulation failed" };
    }
  }

  async function runProjectSequence() {
    if (projectSequenceRunning) {
      return;
    }

    if (!projectCameras.length) {
      setProjectSequenceStatus("Load a project config with cameras first.");
      return;
    }

    let nextWorkspaces = {
      ...cameraWorkspaces,
      ...(activeProjectCameraId ? { [activeProjectCameraId]: buildCurrentWorkspacePayload() } : {}),
    };
    setCameraWorkspaces(nextWorkspaces);

    setProjectSequenceRunning(true);
    setProjectSequenceLogs([]);
    setProjectSequenceStatus(`Running project sequence for ${projectCameras.length} camera(s)...`);
    appendProjectSequenceLog(`▶️ Project '${projectName || "multi-camera-project"}' started`);

    try {
      for (const camera of projectCameras) {
        appendProjectSequenceLog(`📷 Camera ${camera.name} (${camera.id})`);

        const cameraWorkspace = {
          ...(nextWorkspaces[camera.id] || {}),
          cameraType: (nextWorkspaces[camera.id]?.cameraType || camera.cameraType || "cctv"),
          sourceMode: (nextWorkspaces[camera.id]?.sourceMode || camera.sourceMode || "rtsp"),
          sourceUrl: (nextWorkspaces[camera.id]?.sourceUrl || camera.sourceUrl || ""),
          checkerboard: (nextWorkspaces[camera.id]?.checkerboard || camera.checkerboard || "9x6"),
          squareSize: Number(nextWorkspaces[camera.id]?.squareSize ?? camera.squareSize ?? 0.024),
          minSamples: Number(nextWorkspaces[camera.id]?.minSamples ?? camera.minSamples ?? 18),
          dwgPath: resolveProjectDwgPath(camera, nextWorkspaces[camera.id] || {}),
          dwgFileName: resolveProjectDwgFileName(camera, nextWorkspaces[camera.id] || {}),
          intrinsicsPath: nextWorkspaces[camera.id]?.intrinsicsPath || camera.intrinsicsPath || "",
          correspondences: normalizeCorrespondenceList(nextWorkspaces[camera.id]?.correspondences || []),
          zMappings: Array.isArray(nextWorkspaces[camera.id]?.zMappings) ? nextWorkspaces[camera.id].zMappings : [],
          snapshotDataUrl: nextWorkspaces[camera.id]?.snapshotDataUrl || "",
          snapshotPath: nextWorkspaces[camera.id]?.snapshotPath || "",
          stageOutputs: nextWorkspaces[camera.id]?.stageOutputs || stageOutputs,
        };

        setActiveProjectCameraId(camera.id);
        applyCameraWorkspace(camera, cameraWorkspace, projectSharedDwgPath, projectSharedDwgFileName);

        const pnpYamlPath = await solvePnpForWorkspace(camera, cameraWorkspace);
        appendProjectSequenceLog(`  ✅ solve-pnp -> ${pnpYamlPath}`);

        const completedMap = PROJECT_CALIBRATION_STAGES.reduce((acc, stage) => ({ ...acc, [stage]: false }), {});

        if (projectRunStageChain) {
          for (const stage of PROJECT_CALIBRATION_STAGES) {
            const readiness = getProjectCameraStageReadiness(stage, camera, cameraWorkspace, completedMap);
            if (!readiness.enabled) {
              throw new Error(`[${camera.id}] ${stage} blocked: ${readiness.status}`);
            }

            appendProjectSequenceLog(`  🚀 ${stage}`);
            const started = await startProjectStage(stage, camera, cameraWorkspace);
            if (!started?.jobId) {
              throw new Error(`[${camera.id}] ${stage} failed to start`);
            }

            const done = await waitForStageCompletion(stage, started.jobId, 20 * 60 * 1000);
            if (!done.ok) {
              throw new Error(`[${camera.id}] ${stage} failed: ${done.error || "unknown error"}`);
            }

            completedMap[stage] = true;
            appendProjectSequenceLog(`  ✅ ${stage}`);
          }
        }

        nextWorkspaces = {
          ...nextWorkspaces,
          [camera.id]: {
            ...cameraWorkspace,
            latestCalibrationYamlPath: pnpYamlPath,
            completedStages: completedMap,
          },
        };
        setCameraWorkspaces(nextWorkspaces);
      }

      if (projectAutoTriangulate) {
        appendProjectSequenceLog("📐 Running multi-camera triangulation...");
        const tri = await runProjectTriangulation(nextWorkspaces);
        if (!tri.ok) {
          throw new Error(tri.error || "Triangulation failed");
        }
        appendProjectSequenceLog("✅ Multi-camera triangulation complete");
      }

      setProjectSequenceStatus("Project sequence completed successfully.");
      appendProjectSequenceLog("🎉 Project sequence completed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Project sequence failed";
      setProjectSequenceStatus(msg);
      appendProjectSequenceLog(`❌ ${msg}`);
    } finally {
      setProjectSequenceRunning(false);
    }
  }

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

        if (stageName === "intrinsic") {
          const intrinsicOutputPath = data.job?.result?.intrinsicsPath;
          const intrinsicResult = data.job?.result?.intrinsic;
          if (intrinsicOutputPath) {
            setIntrinsicsPath(intrinsicOutputPath);
          }
          if (intrinsicResult && typeof intrinsicResult === "object") {
            setIntrinsicSolveResult((prev) => ({ ...(prev || {}), ...intrinsicResult }));
            const rms = intrinsicResult?.rms;
            setIntrinsicStatus(`Intrinsic solved. RMS=${typeof rms === "number" ? rms.toFixed(4) : "n/a"}`);
          }
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

  useEffect(() => {
    if (!activeProjectCameraId) {
      return;
    }

    const payload = buildCurrentWorkspacePayload();
    setCameraWorkspaces((prev) => ({
      ...prev,
      [activeProjectCameraId]: payload,
    }));
  }, [
    activeProjectCameraId,
    cameraType,
    sourceMode,
    sourceUrl,
    checkerboard,
    squareSize,
    minSamples,
    dwgPath,
    dwgFileName,
    segments,
    snapshotDataUrl,
    snapshotPath,
    correspondences,
    zMappings,
    validationPairs,
    intrinsicsPath,
    latestCalibrationYamlPath,
    stageOutputs,
    stageResolvedOutputs,
    completedStages,
  ]);

  useEffect(() => {
    for (const stage of STAGES) {
      const hasResolvedPath = Boolean(stageResolvedOutputs[stage]);
      if (!hasResolvedPath && !completedStages[stage]) {
        continue;
      }
      const outputPath = getStageOutputPath(stage);
      if (!outputPath) {
        continue;
      }
      const existing = stageOutputDetails[stage];
      if (existing?.path === outputPath || stageOutputLoading[stage]) {
        continue;
      }
      inspectStageOutput(stage, outputPath);
    }
  }, [stageOutputs, stageResolvedOutputs, completedStages, stageOutputDetails, stageOutputLoading]);

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
            intrinsicSessionId,
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
      return { ok: true, jobId: data.job.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start stage";
      setDwgMessage(msg);
      setStageMessage(stage, msg);
      return { ok: false, error: msg };
    } finally {
      setJobLoading(false);
    }
  }

  function appendSequenceLog(message) {
    setSequenceLogs((prev) => {
      const next = [...prev, message];
      return next.length > 160 ? next.slice(next.length - 160) : next;
    });
  }

  async function waitForStageCompletion(stage, jobId, timeoutMs = 25 * 60 * 1000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const res = await fetch(`/api/calibration/jobs/${jobId}`, { cache: "no-store" });
      if (!res.ok) {
        await sleep(700);
        continue;
      }

      const data = await res.json();
      const job = data?.job;
      if (!job) {
        await sleep(700);
        continue;
      }

      setCurrentJob(job);
      setCurrentJobId(jobId);

      setStageJobState((prev) => ({
        ...prev,
        [stage]: {
          status: job.status || "idle",
          progress: job.progress || 0,
          logs: Array.isArray(job.logs) ? job.logs : [],
        },
      }));

      const outPath = job?.result?.outputPath || job?.result?.calibrationFile || job?.result?.outputDir;
      if (outPath) {
        setStageResolvedOutputs((prev) => ({ ...prev, [stage]: outPath }));
      }

      if (job.status === "completed") {
        setCompletedStages((prev) => ({ ...prev, [stage]: true }));
        setStageMessage(stage, "Completed");
        appendSequenceLog(`✅ ${stage} completed`);
        return { ok: true, job };
      }

      if (job.status === "failed") {
        const errorMessage = job?.result?.error || `Stage '${stage}' failed`;
        setStageMessage(stage, "Failed");
        appendSequenceLog(`❌ ${stage} failed: ${errorMessage}`);
        return { ok: false, error: errorMessage, job };
      }

      await sleep(700);
    }

    const timeoutMessage = `Stage '${stage}' timed out after ${Math.floor(timeoutMs / 60000)} minutes.`;
    appendSequenceLog(`⏱️ ${timeoutMessage}`);
    return { ok: false, error: timeoutMessage };
  }

  async function runCombinedSequence() {
    if (sequenceRunning) {
      return;
    }

    setSequenceRunning(true);
    setSequenceStatus("Starting combined calibration sequence...");
    setSequenceLogs([]);

    const resetCompleted = STAGES.reduce((acc, stageName) => ({
      ...acc,
      [stageName]: false,
    }), {});
    setCompletedStages(resetCompleted);
    const localCompleted = { ...resetCompleted };

    const resetStageState = STAGES.reduce((acc, stageName) => ({
      ...acc,
      [stageName]: { status: "idle", progress: 0, logs: [] },
    }), {});
    setStageJobState(resetStageState);

    appendSequenceLog(`▶️ Running stages in order: ${STAGES.join(" -> ")}`);

    try {
      for (const stage of STAGES) {
        const readiness = getCombinedReadiness(stage, localCompleted);
        if (!readiness.enabled) {
          const blockedMessage = `${stage} blocked: ${readiness.status}`;
          setStageMessage(stage, readiness.status);
          setSequenceStatus(`Combined run stopped at '${stage}'.`);
          appendSequenceLog(`🛑 ${blockedMessage}`);
          return;
        }

        setActiveStage(stage);
        setStageMessage(stage, "Running...");
        appendSequenceLog(`🚀 Starting ${stage}`);

        const started = await startStage(stage);
        if (!started?.ok || !started?.jobId) {
          const startError = started?.error || `Failed to start stage '${stage}'`;
          setSequenceStatus(`Combined run failed at '${stage}'.`);
          appendSequenceLog(`❌ ${stage} start failed: ${startError}`);
          return;
        }

        const done = await waitForStageCompletion(stage, started.jobId);
        if (!done.ok) {
          setSequenceStatus(`Combined run failed at '${stage}'.`);
          return;
        }

        localCompleted[stage] = true;
      }

      setSequenceStatus("Combined calibration sequence completed successfully.");
      appendSequenceLog("🎉 All stages completed");
    } finally {
      setSequenceRunning(false);
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

  function getCombinedReadiness(stage, completedMap) {
    const idx = STAGES.indexOf(stage);
    if (idx > 0) {
      const prevStage = STAGES[idx - 1];
      if (!completedMap[prevStage]) {
        return { enabled: false, status: "Complete previous stage first." };
      }
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
      if (!snapshotDataUrl) {
        return { enabled: false, status: "Capture snapshot first for Z preview." };
      }
      if (zMappings.length < 1) {
        return { enabled: false, status: "Add at least 1 Z-direction point from existing ground points." };
      }
      return { enabled: true, status: "Ready. Run Z Mapping stage." };
    }

    if (stage === "cad-3d-dwg") {
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

    const nextSharedPath = String(data.path || "");
    const nextSharedFile = String(data.fileName || (nextSharedPath ? nextSharedPath.split("/").pop() : "") || "");
    setProjectDraftSharedDwgPath(nextSharedPath);

    if (projectCameras.length) {
      setProjectSharedDwgPath(nextSharedPath);
      setProjectSharedDwgFileName(nextSharedFile);

      setProjectCameras((prev) =>
        prev.map((camera) => ({
          ...camera,
          dwgPath: nextSharedPath,
          dwgFileName: nextSharedFile,
        }))
      );

      setCameraWorkspaces((prev) => {
        const next = { ...prev };
        for (const camera of projectCameras) {
          next[camera.id] = buildWorkspaceForCamera(camera, prev[camera.id] || {}, nextSharedPath, nextSharedFile);
        }
        return next;
      });

      setProjectStatus(`Shared DWG updated for project: ${nextSharedFile || nextSharedPath}`);
    }
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
      setProjectDraftSharedDwgPath(sample.dwgPath || "");
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

  function getStageOutputPath(stage) {
    return String(stageResolvedOutputs[stage] || stageOutputs[stage] || "").trim();
  }

  function getOutputDownloadHref(outputPath) {
    const value = String(outputPath || "").trim();
    if (!value) {
      return "";
    }
    return `/api/calibration/web/output/download?path=${encodeURIComponent(value)}`;
  }

  async function inspectStageOutput(stage, explicitPath = "") {
    const outputPath = String(explicitPath || getStageOutputPath(stage)).trim();
    if (!outputPath) {
      return;
    }

    setStageOutputLoading((prev) => ({ ...prev, [stage]: true }));
    try {
      const res = await fetch("/api/calibration/web/output/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: outputPath }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to inspect output");
      }
      setStageOutputDetails((prev) => ({
        ...prev,
        [stage]: {
          ...data,
          fetchedAt: Date.now(),
        },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to inspect output";
      const isMissing = /ENOENT|no such file or directory|not found/i.test(message);

      if (isMissing) {
        setStageMessage(stage, "Output file not found (stale path removed). Run the stage again.");
        setStageResolvedOutputs((prev) => {
          if (String(prev?.[stage] || "").trim() !== outputPath) {
            return prev;
          }
          const next = { ...prev };
          delete next[stage];
          return next;
        });
        setStageOutputs((prev) => {
          if (String(prev?.[stage] || "").trim() !== outputPath) {
            return prev;
          }
          return { ...prev, [stage]: "" };
        });
        setStageOutputDetails((prev) => ({
          ...prev,
          [stage]: {
            path: outputPath,
            missing: true,
            error: "Output file no longer exists.",
          },
        }));
        return;
      }

      setStageOutputDetails((prev) => ({
        ...prev,
        [stage]: {
          path: outputPath,
          error: message,
        },
      }));
    } finally {
      setStageOutputLoading((prev) => ({ ...prev, [stage]: false }));
    }
  }

  function downloadIntrinsicSummary() {
    if (!intrinsicSolveResult) {
      setIntrinsicStatus("Solve intrinsic first to download summary JSON.");
      return;
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      intrinsicsPath,
      result: intrinsicSolveResult,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `intrinsics-summary-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

  function clearFeedError() {
    setFeedError("");
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
        setSnapshotPath(saveData.outputPath || "");
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
      setSnapshotPath(data.outputPath || "");
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
        if (data.savedPath) {
          setSnapshotPath(data.savedPath);
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
      if (data.savedPath) {
        setSnapshotPath(data.savedPath);
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
          cameraType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Intrinsic solve failed");
      }

      const solved = data?.result?.result || null;
      const rms = solved?.rms;
      const outputNpz = data.outputNpz || "";

      setIntrinsicSolveResult(solved);
      setIntrinsicsPath(outputNpz);
      if (outputNpz) {
        setStageResolvedOutputs((prev) => ({ ...prev, intrinsic: outputNpz }));
      }
      setCompletedStages((prev) => ({ ...prev, intrinsic: true }));
      setStageMessage("intrinsic", `Solved intrinsic. RMS=${typeof rms === "number" ? rms.toFixed(4) : "n/a"}`);
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
    if (imagePickMode === "validation") {
      setSolveStatus("Validation mode is automatic. Click image point to project onto CAD ground.");
      return;
    }

    if ((imagePickMode === "z" || imagePickMode === "z-tip") && pendingZGroundIndex !== null && pendingZImageTip !== null) {
      const base = correspondences[pendingZGroundIndex];
      if (!base) {
        setSolveStatus("Base pair not found. Try again.");
        setPendingZGroundIndex(null);
        setPendingZImageTip(null);
        setImagePickMode("z");
        return;
      }
      setZMappings((prev) => [...prev, {
        baseIndex: pendingZGroundIndex,
        worldBase: base.world,
        worldZ: [Number(world.x ?? world[0]), Number(world.y ?? world[1]), Number(world.z ?? world[2])],
        pixelBase: base.pixel,
        pixelZ: pendingZImageTip,
      }]);
      setPendingZGroundIndex(null);
      setPendingZImageTip(null);
      setImagePickMode("z");
      setSolveStatus("Z-direction mapping added. Click another ground marker for next Z pair, or switch mode.");
      return;
    }

    if (!pendingImagePoint) {
      setSolveStatus("First click on snapshot image to choose pixel point, then pick CAD point.");
      return;
    }

    setCorrespondences((prev) => {
      const markerId = `m${prev.length + 1}`;
      const pair = {
        markerId,
        world,
        pixel: pendingImagePoint,
      };
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

    if (imagePickMode === "shared-marker" && pendingSharedMarkerIndex !== null) {
      if (!activeProjectCameraId) {
        setSolveStatus("Open/select a project camera first.");
        setPendingSharedMarkerIndex(null);
        setImagePickMode("ground");
        return;
      }

      const marker = sharedMarkers[pendingSharedMarkerIndex];
      if (!marker || !Array.isArray(marker.world) || marker.world.length !== 3) {
        setSolveStatus("Shared marker is missing world coordinates.");
        setPendingSharedMarkerIndex(null);
        setImagePickMode("ground");
        return;
      }

      const markerId = String(marker.id || marker.markerId || `m${pendingSharedMarkerIndex + 1}`);
      const pixel = [xPix, yPix];

      setCorrespondences((prev) => {
        let found = false;
        const next = prev.map((item) => {
          if (String(item.markerId || "") === markerId) {
            found = true;
            return {
              markerId,
              world: [Number(marker.world[0]), Number(marker.world[1]), Number(marker.world[2])],
              pixel,
            };
          }
          return item;
        });

        if (!found) {
          next.push({
            markerId,
            world: [Number(marker.world[0]), Number(marker.world[1]), Number(marker.world[2])],
            pixel,
          });
        }

        setCorrespondenceText(JSON.stringify(next, null, 2));
        return next;
      });

      const updatedMarkers = sharedMarkers.map((item, index) => {
        if (index !== pendingSharedMarkerIndex) {
          return item;
        }
        return {
          ...item,
          observations: {
            ...(item.observations || {}),
            [activeProjectCameraId]: pixel,
          },
        };
      });
      setSharedMarkers(updatedMarkers);

      const nextIdx = updatedMarkers.findIndex((item) => {
        const hasWorld = Array.isArray(item.world) && item.world.length === 3;
        const hasCurrentObs = item?.observations?.[activeProjectCameraId];
        return hasWorld && !hasCurrentObs;
      });

      if (nextIdx >= 0) {
        const nextMarker = updatedMarkers[nextIdx];
        setPendingSharedMarkerIndex(nextIdx);
        setSolveStatus(`Saved marker '${markerId}'. Next marker: '${nextMarker.id}'.`);
      } else {
        setPendingSharedMarkerIndex(null);
        setImagePickMode("ground");
        setSolveStatus(`Saved marker '${markerId}'. Shared marker capture is complete for this camera.`);
      }

      setPendingImagePoint(null);
      return;
    }

    if (imagePickMode === "z-tip" && pendingZGroundIndex !== null && pendingZImageTip === null) {
      setPendingZImageTip([xPix, yPix]);
      setSolveStatus(`Z-direction tip marked in image. Now click the matching point in the CAD viewer.`);
      return;
    }

    if (imagePickMode === "validation") {
      const readiness = getGroundValidationReadiness();
      if (!readiness.enabled) {
        setSolveStatus(readiness.status);
        setValidationStatus(readiness.status);
        return;
      }

      const projectedWorld = estimateGroundWorldFromPixel([xPix, yPix]);
      if (!projectedWorld) {
        setSolveStatus("Failed to project point onto CAD ground. Add clean pairs and rerun Solve PnP.");
        return;
      }

      const pair = {
        world: projectedWorld,
        pixel: [xPix, yPix],
      };

      setValidationPairs((prev) => [...prev, pair]);
      setPendingWorldPoint(null);
      setPendingImagePoint(null);
      setValidationStatus("Validation point projected on CAD. Add more points and run validation.");
      setSolveStatus(
        `Validation point projected: P[${xPix.toFixed(1)}, ${yPix.toFixed(1)}] → W[${projectedWorld
          .map((value) => Number(value).toFixed(2))
          .join(", ")}]`
      );
      return;
    }

    setPendingImagePoint([xPix, yPix]);
    setSolveStatus(`Image point selected: [${xPix.toFixed(1)}, ${yPix.toFixed(1)}]. Now pick CAD point.`);
  }

  function onSnapshotImageLoad(e) {
    setSnapshotNaturalSize({
      width: e.currentTarget.naturalWidth || 1,
      height: e.currentTarget.naturalHeight || 1,
    });
  }

  function beginZPointCapture() {
    if (!correspondences.length) {
      setSolveStatus("Add ground-plane pairs first.");
      return;
    }
    setImagePickMode("z");
    setPendingZGroundIndex(null);
    setPendingZImageTip(null);
    setPendingSharedMarkerIndex(null);
    setSolveStatus("Z-direction mode: click a ground marker (green circle) to select the anchor point.");
  }

  function onZGroundMarkerClick(idx) {
    if (imagePickMode !== "z") return;
    setPendingZGroundIndex(idx);
    setPendingZImageTip(null);
    setImagePickMode("z-tip");
    setSolveStatus(`Anchor: ground pair #${idx + 1}. Now click the Z-direction tip point anywhere in the image.`);
  }

  function setGroundPickMode() {
    setImagePickMode("ground");
    setPendingZGroundIndex(null);
    setPendingZImageTip(null);
    setPendingSharedMarkerIndex(null);
    setSolveStatus("Ground pick mode active.");
  }

  function getGroundValidationReadiness() {
    if (correspondences.length < 4) {
      return { enabled: false, status: "Validation unlock requires at least 4 image↔CAD pairs." };
    }
    if (!completedStages["ground-plane"]) {
      return { enabled: false, status: "Validation unlock requires Ground Plane stage completion." };
    }
    const hasYaml = !!latestCalibrationYamlPath;
    return {
      enabled: true,
      status: hasYaml
        ? "Ready. Click image points to project them onto CAD ground (homography + PnP YAML available)."
        : "Ready. Click image points to project them onto CAD ground (homography mode — run Solve PnP for full metrics).",
    };
  }

  function solveLinearSystem(matrix, vector) {
    const n = matrix.length;
    const A = matrix.map((row) => [...row]);
    const b = [...vector];

    for (let i = 0; i < n; i += 1) {
      let pivot = i;
      for (let r = i + 1; r < n; r += 1) {
        if (Math.abs(A[r][i]) > Math.abs(A[pivot][i])) {
          pivot = r;
        }
      }

      if (Math.abs(A[pivot][i]) < 1e-10) {
        return null;
      }

      if (pivot !== i) {
        [A[i], A[pivot]] = [A[pivot], A[i]];
        [b[i], b[pivot]] = [b[pivot], b[i]];
      }

      const diag = A[i][i];
      for (let c = i; c < n; c += 1) {
        A[i][c] /= diag;
      }
      b[i] /= diag;

      for (let r = 0; r < n; r += 1) {
        if (r === i) {
          continue;
        }
        const factor = A[r][i];
        if (Math.abs(factor) < 1e-12) {
          continue;
        }
        for (let c = i; c < n; c += 1) {
          A[r][c] -= factor * A[i][c];
        }
        b[r] -= factor * b[i];
      }
    }

    return b;
  }

  function estimateGroundWorldFromPixel(pixel) {
    const validPairs = normalizeCorrespondenceList(correspondences)
      .filter((item) => Array.isArray(item.world) && item.world.length === 3 && Array.isArray(item.pixel) && item.pixel.length === 2);

    if (validPairs.length < 4) {
      return null;
    }

    const A = [];
    const rhs = [];

    for (const pair of validPairs) {
      const u = Number(pair.pixel[0]);
      const v = Number(pair.pixel[1]);
      const x = Number(pair.world[0]);
      const y = Number(pair.world[1]);

      A.push([u, v, 1, 0, 0, 0, -x * u, -x * v]);
      rhs.push(x);
      A.push([0, 0, 0, u, v, 1, -y * u, -y * v]);
      rhs.push(y);
    }

    const normal = Array.from({ length: 8 }, () => Array(8).fill(0));
    const target = Array(8).fill(0);

    for (let r = 0; r < A.length; r += 1) {
      const row = A[r];
      for (let i = 0; i < 8; i += 1) {
        target[i] += row[i] * rhs[r];
        for (let j = 0; j < 8; j += 1) {
          normal[i][j] += row[i] * row[j];
        }
      }
    }

    const h = solveLinearSystem(normal, target);
    if (!h) {
      return null;
    }

    const [u0, v0] = pixel;
    const den = h[6] * u0 + h[7] * v0 + 1;
    if (Math.abs(den) < 1e-10) {
      return null;
    }

    const x0 = (h[0] * u0 + h[1] * v0 + h[2]) / den;
    const y0 = (h[3] * u0 + h[4] * v0 + h[5]) / den;
    const z0 = validPairs.length ? Number(validPairs[0].world[2] || 0) : 0;

    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(z0)) {
      return null;
    }

    return [x0, y0, z0];
  }

  function setValidationPickMode() {
    const readiness = getGroundValidationReadiness();
    if (!readiness.enabled) {
      setSolveStatus(readiness.status);
      setValidationStatus(readiness.status);
      return;
    }

    setImagePickMode("validation");
    setPendingZGroundIndex(null);
    setPendingZImageTip(null);
    setPendingSharedMarkerIndex(null);
    setPendingImagePoint(null);
    setSolveStatus("Validation pick mode active. Click image point to project it onto CAD ground.");
  }

  function clearZMappings() {
    setZMappings([]);
    setPendingZGroundIndex(null);
    setPendingZImageTip(null);
    setImagePickMode("ground");
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

  useEffect(() => {
    if (!routeProjectId) {
      return;
    }

    let cancelled = false;

    async function loadRoutedProject() {
      try {
        setProjectStatus(`Loading project '${routeProjectId}'...`);
        const res = await fetch(`/api/calibration/web/projects/${encodeURIComponent(routeProjectId)}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load project");
        }
        if (cancelled) {
          return;
        }
        hydrateProjectState(data?.projectConfig, data?.outputPath || "", "Opened");
      } catch (err) {
        if (!cancelled) {
          setProjectStatus(err instanceof Error ? err.message : "Failed to load project");
        }
      }
    }

    loadRoutedProject();
    return () => {
      cancelled = true;
    };
  }, [routeProjectId]);

  useEffect(() => {
    if (!routeCameraId || !projectCameras.length) {
      return;
    }

    const exists = projectCameras.some((camera) => camera.id === routeCameraId);
    if (!exists) {
      setProjectStatus(`Camera '${routeCameraId}' not found in loaded project.`);
      return;
    }

    if (activeProjectCameraId !== routeCameraId) {
      openProjectCamera(routeCameraId);
    }
  }, [routeCameraId, projectCameras]);

  useEffect(() => {
    const resolvedDwgPath = String(dwgPath || "").trim();
    if (!resolvedDwgPath) {
      cadPreviewAttemptedPathRef.current = "";
      return;
    }

    if (segments.length > 0) {
      setDwgMessage(`Shared CAD loaded: ${dwgFileName || resolvedDwgPath.split("/").pop() || resolvedDwgPath}`);
      return;
    }

    if (cadPreviewAttemptedPathRef.current === resolvedDwgPath) {
      setDwgMessage(`Shared CAD path loaded: ${dwgFileName || resolvedDwgPath.split("/").pop() || resolvedDwgPath}`);
      return;
    }

    cadPreviewAttemptedPathRef.current = resolvedDwgPath;
    loadCadPreviewByPath(resolvedDwgPath);
  }, [dwgPath, dwgFileName, segments.length]);

  function clearPairs() {
    setCorrespondences([]);
    setCorrespondenceText("[]");
    setPendingWorldPoint(null);
    setPendingImagePoint(null);
    setPendingSharedMarkerIndex(null);
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

  function clearValidationPairs() {
    setValidationPairs([]);
    setValidationResult(null);
  }

  function deleteValidationPair(index) {
    setValidationPairs((prev) => prev.filter((_, i) => i !== index));
  }

  async function runHeadlessSolve() {
    try {
      const correspondences = normalizeCorrespondenceList(JSON.parse(correspondenceText));
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
      const solved = data?.result?.result || null;
      setPnpSolveResult(solved);
      setLatestCalibrationYamlPath(data.outputYaml || "");
      if (data.outputYaml) {
        setStageResolvedOutputs((prev) => ({ ...prev, "ground-plane": data.outputYaml }));
      }
      setCompletedStages((prev) => ({ ...prev, "ground-plane": true }));
      setStageMessage("ground-plane", "PnP solved from point pairs.");
      setValidationStatus(`Calibration ready for validation: ${data.outputYaml}`);
      setSolveStatus(`Headless solve OK. Output: ${data.outputYaml}`);

      if (activeProjectCameraId) {
        setCameraWorkspaces((prev) => ({
          ...prev,
          [activeProjectCameraId]: {
            ...(prev[activeProjectCameraId] || {}),
            ...buildCurrentWorkspacePayload(),
            correspondences: deepClone(correspondences),
            latestCalibrationYamlPath: data.outputYaml || "",
          },
        }));
      }
    } catch (err) {
      setSolveStatus(err instanceof Error ? err.message : "Headless solve failed");
    }
  }

  async function runLiveValidation() {
    try {
      if (correspondences.length < 4) {
        throw new Error("Validation requires at least 4 image↔CAD ground pairs.");
      }
      if (!completedStages["ground-plane"]) {
        throw new Error("Validation requires Ground Plane stage completion.");
      }
      if (!validationPairs.length) {
        throw new Error("Add at least 1 validation point (switch to Validation pick mode and click image points first).");
      }

      const calibrationYamlPath = latestCalibrationYamlPath || stageResolvedOutputs["ground-plane"] || "";

      // Compute homography-based reprojection error from validation pairs (client-side)
      let homographyRmse = null;
      {
        const errors = validationPairs.map((vp) => {
          const projected = estimateGroundWorldFromPixel(vp.image);
          if (!projected) return null;
          const dx = projected.x - vp.world.x;
          const dy = projected.y - vp.world.y;
          return Math.sqrt(dx * dx + dy * dy);
        }).filter((e) => e !== null);
        if (errors.length > 0) {
          homographyRmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
        }
      }

      if (homographyRmse !== null) {
        setValidationStatus(`Homography validation: ${validationPairs.length} points, World RMSE = ${homographyRmse.toFixed(4)} m${calibrationYamlPath ? " (running full API validation too…)" : ""}`);
      }

      // If PnP YAML is available, also run server-side validation for full metrics
      if (calibrationYamlPath) {
        const res = await fetch("/api/calibration/web/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            validationPoints: validationPairs,
            calibrationYamlPath,
            intrinsicsPath,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Live validation failed");
        }

        const result = data?.validation || null;
        setValidationResult(result);

        const worldRmse = result?.metrics?.world_error?.rmse;
        const reprojRmse = result?.metrics?.reprojection_error_px?.rmse;
        setValidationStatus(
          `Validation OK. World RMSE=${typeof worldRmse === "number" ? worldRmse.toFixed(4) : "n/a"} m` +
          `, Reprojection RMSE=${typeof reprojRmse === "number" ? reprojRmse.toFixed(2) : "n/a"} px` +
          (homographyRmse !== null ? ` | Homography RMSE=${homographyRmse.toFixed(4)} m` : "")
        );
      } else if (homographyRmse !== null) {
        setValidationStatus(`Homography validation: ${validationPairs.length} points, World RMSE = ${homographyRmse.toFixed(4)} m. Run 'Solve PnP from Pairs' for full reprojection metrics.`);
      }
    } catch (err) {
      setValidationStatus(err instanceof Error ? err.message : "Live validation failed");
    }
  }

  function getComputedStageSummary(stage) {
    if (stage === "intrinsic" && intrinsicSolveResult) {
      const K = intrinsicSolveResult?.K;
      const D = intrinsicSolveResult?.D;
      return {
        rms: intrinsicSolveResult?.rms,
        validImageCount: intrinsicSolveResult?.valid_image_count,
        fx: K?.[0]?.[0],
        fy: K?.[1]?.[1],
        cx: K?.[0]?.[2],
        cy: K?.[1]?.[2],
        K,
        D,
      };
    }

    if (stage === "intrinsic") {
      const intrinsicJsonOutput = stageOutputDetails?.intrinsic?.previewJson?.output;
      if (intrinsicJsonOutput && typeof intrinsicJsonOutput === "object") {
        return {
          rms: intrinsicJsonOutput?.rms,
          validImageCount: intrinsicJsonOutput?.validImageCount,
          fx: intrinsicJsonOutput?.fx,
          fy: intrinsicJsonOutput?.fy,
          cx: intrinsicJsonOutput?.cx,
          cy: intrinsicJsonOutput?.cy,
          K: intrinsicJsonOutput?.K,
          D: intrinsicJsonOutput?.D,
        };
      }
    }

    if (stage === "ground-plane" && pnpSolveResult) {
      return {
        mode: pnpSolveResult?.mode,
        reprojectionRmsePx: pnpSolveResult?.pose?.reproj_rmse_px,
        inliers: pnpSolveResult?.pose?.inliers,
        rvec: pnpSolveResult?.pose?.rvec,
        tvec: pnpSolveResult?.pose?.tvec,
        correspondenceCount: Array.isArray(pnpSolveResult?.correspondences) ? pnpSolveResult.correspondences.length : undefined,
      };
    }

    if (stage === "z-mapping") {
      return { zMappings: zMappings.length, snapshotReady: Boolean(snapshotDataUrl) };
    }

    if (stage === "cad-3d-dwg") {
      return {
        cadSegments: segments.length,
        groundPoints: correspondences.length,
        zDirectionPoints: zMappings.length,
      };
    }

    return null;
  }

  function renderStageStatus(stage) {
    const state = stageJobState[stage] || { status: "idle", progress: 0, logs: [] };
    const outputPath = getStageOutputPath(stage);
    const details = stageOutputDetails[stage] || null;
    const staleMissingPath = Boolean(details?.missing && details?.path && details.path === outputPath);
    const visibleOutputPath = staleMissingPath ? "" : outputPath;
    const readiness = getStageReadiness(stage);
    return (
      <StageStatusCard
        state={state}
        outputPath={visibleOutputPath}
        fallbackStatus={readiness.status}
        computedSummary={getComputedStageSummary(stage)}
        outputDetails={staleMissingPath ? null : details}
        outputDetailsLoading={Boolean(stageOutputLoading[stage])}
        onLoadOutputDetails={() => inspectStageOutput(stage, visibleOutputPath)}
        downloadHref={getOutputDownloadHref(visibleOutputPath)}
      />
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

        {routeProjectId ? (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <h2 className="text-lg font-medium">Project Camera Navigation</h2>
            <p className="text-sm text-zinc-400">Project: {routeProjectId} {routeCameraId ? `• Camera: ${routeCameraId}` : ""}</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={projectHomeHref || `/project/${encodeURIComponent(routeProjectId)}`}
                className="rounded border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm hover:bg-zinc-700/60"
              >
                Go back to list of cameras
              </a>
              {nextCameraHref ? (
                <a
                  href={nextCameraHref}
                  className="rounded border border-emerald-700 bg-emerald-900/40 px-3 py-2 text-sm hover:bg-emerald-800/50"
                >
                  Go to next camera
                </a>
              ) : (
                <span className="rounded border border-zinc-700 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-400">No next camera</span>
              )}
              <button
                onClick={saveCurrentProjectConfig}
                className="rounded border border-sky-700 bg-sky-900/40 px-3 py-2 text-sm hover:bg-sky-800/50"
              >
                Save current camera progress
              </button>
            </div>
            <p className="text-xs text-zinc-500 break-all">{projectStatus}</p>
          </section>
        ) : null}

        {hideProjectWorkflow ? null : (
          <ProjectWorkflowSection
            data={{
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
            }}
            actions={{
              setProjectOpenPath,
              setProjectDraftName,
              setProjectDraftDescription,
              setProjectDraftSharedDwgPath,
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
            }}
            refs={{ projectConfigInputRef, projectSharedDwgInputRef }}
          />
        )}

        <CombinedSequenceSection
          data={{
            sequenceRunning,
            jobLoading,
            sequenceStatus,
            sequenceLogs,
          }}
          actions={{ runCombinedSequence }}
        />


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

        <IntrinsicStepSection
          data={{
            intrinsicAllowed: stageAllowed("intrinsic"),
            intrinsicSessionId,
            checkerboard,
            squareSize,
            checkerboardSquareMm,
            checkerboardPdfStatus,
            stageOutputIntrinsic: stageOutputs.intrinsic,
            intrinsicSampleCount,
            minSamples,
            intrinsicStatus,
            intrinsicsPath,
            intrinsicSolveResult,
            intrinsicDownloadHref: getOutputDownloadHref(intrinsicsPath),
            intrinsicSamples,
            intrinsicActiveIndex,
            sourceMode,
            feedEnabled,
            liveFeedSrc,
            snapshotDataUrl,
            jobLoading,
            sequenceRunning,
          }}
          actions={{
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
          }}
          refs={{ intrinsicVideoRef }}
          renderStageStatus={renderStageStatus}
        />

        <GroundPlaneStepSection
          data={{
            groundReadiness: getStageReadiness("ground-plane"),
            groundValidationReadiness: getGroundValidationReadiness(),
            imagePickMode,
            sourceMode,
            feedEnabled,
            liveFeedSrc,
            snapshotStatus,
            snapshotDataUrl,
            snapshotNaturalSize,
            correspondences,
            validationPairs,
            pendingImagePoint,
            solveStatus,
            jobLoading,
            sequenceRunning,
            allowCadUpload: !routeProjectId,
            dwgMessage,
            segments,
            stageOutputGroundPlane: stageOutputs["ground-plane"],
            pnpSolveResult,
            cameraPosition,
          }}
          actions={{
            setGroundPickMode,
            setValidationPickMode,
            beginSharedMarkerCapture,
            onFeedError,
            clearFeedError,
            captureSnapshotWeb,
            onSnapshotImageLoad,
            onSnapshotPick,
            onImagePointMouseDown,
            undoPair,
            clearPairs,
            deletePair,
            clearValidationPairs,
            deleteValidationPair,
            uploadDwg,
            runHeadlessSolve,
            runStageCard,
            setStageOutput,
            handleCadPick,
          }}
          refs={{
            groundVideoRef,
            snapshotImgRef,
            snapshotOverlayRef,
            dwgInputRef,
          }}
          renderStageStatus={renderStageStatus}
        />

        <ZMappingStepSection
          data={{
            zReadiness: getStageReadiness("z-mapping"),
            snapshotDataUrl,
            correspondences,
            zMappings,
            imagePickMode,
            pendingZGroundIndex,
            pendingZImageTip,
            snapshotNaturalSize,
            segments,
            stageResolvedGroundPlane: stageResolvedOutputs["ground-plane"],
            stageOutputGroundPlane: stageOutputs["ground-plane"],
            stageOutputZMapping: stageOutputs["z-mapping"],
            jobLoading,
            sequenceRunning,
          }}
          actions={{
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
          }}
          renderStageStatus={renderStageStatus}
        />

        <Cad3dStepSection
          data={{
            cadReadiness: getStageReadiness("cad-3d-dwg"),
            correspondences,
            zMappings,
            segments,
            stageOutputCad: stageOutputs["cad-3d-dwg"],
            jobLoading,
            sequenceRunning,
          }}
          actions={{
            setStageOutput,
            runStageCard,
          }}
          renderStageStatus={renderStageStatus}
        />

        <RemainingStagesSection
          data={{
            stages: STAGES,
            stageOutputs,
            stageMessages,
            jobLoading,
            sequenceRunning,
            sfmMessage,
            overlayOpacity,
          }}
          actions={{
            getStageReadiness,
            uploadSfmImages,
            setOverlayOpacity,
            setStageOutput,
            runStageCard,
          }}
          refs={{ sfmInputRef }}
          renderStageStatus={renderStageStatus}
        />

        <LiveValidationSection
          data={{
            latestCalibrationYamlPath,
            validationStatus,
            validationPairs,
            validationResult,
          }}
          actions={{
            setLatestCalibrationYamlPath,
            runLiveValidation,
            clearValidationPairs,
          }}
        />

        <CurrentJobSection currentJob={currentJob} />
      </main>
    </div>
  );
}

export default function Home() {
  return <ProjectEntryPage />;
}
