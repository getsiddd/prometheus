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

const DEFAULT_PROJECT_OPTIONS = {
  useGroundPlane: true,
  useZDirection: true,
  useSfm: true,
  useRealtimeOverlay: true,
};

function normalizeProjectOptions(options) {
  if (!options || typeof options !== "object") {
    return { ...DEFAULT_PROJECT_OPTIONS };
  }
  return {
    useGroundPlane: options.useGroundPlane !== false,
    useZDirection: options.useZDirection !== false,
    useSfm: options.useSfm !== false,
    useRealtimeOverlay: options.useRealtimeOverlay !== false,
  };
}

function getEnabledStageSet(options) {
  const normalized = normalizeProjectOptions(options);
  return new Set([
    "intrinsic",
    ...(normalized.useGroundPlane ? ["ground-plane"] : []),
    ...(normalized.useZDirection ? ["z-mapping"] : []),
    ...(normalized.useRealtimeOverlay ? ["cad-3d-dwg"] : []),
    "extrinsic",
    ...(normalized.useSfm ? ["sfm"] : []),
    ...(normalized.useRealtimeOverlay ? ["overlay"] : []),
  ]);
}

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
  const selectedProjectOptions = useMemo(
    () => normalizeProjectOptions({
      useGroundPlane,
      useZDirection,
      useSfm,
      useRealtimeOverlay: useOverlay,
    }),
    [useGroundPlane, useZDirection, useSfm, useOverlay]
  );
  const enabledStageSet = useMemo(() => getEnabledStageSet(selectedProjectOptions), [selectedProjectOptions]);
  const enabledStages = useMemo(() => STAGES.filter((stage) => enabledStageSet.has(stage)), [enabledStageSet]);

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
  const [projectDraftOptions, setProjectDraftOptions] = useState({
    useGroundPlane: true,
    useZDirection: true,
    useSfm: true,
    useRealtimeOverlay: true,
  });
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
  const [autoGroundSuggestions, setAutoGroundSuggestions] = useState([]);
  const [autoGroundDetections, setAutoGroundDetections] = useState([]);
  const [autoGroundModelInfo, setAutoGroundModelInfo] = useState(null);
  const [autoGroundLogs, setAutoGroundLogs] = useState([]);
  const [autoGroundImageSize, setAutoGroundImageSize] = useState({ width: 1, height: 1 });
  const [autoGroundStatus, setAutoGroundStatus] = useState("No automatic human ground detection run yet.");
  const [autoGroundLoading, setAutoGroundLoading] = useState(false);
  const [pendingAutoGroundIndex, setPendingAutoGroundIndex] = useState(null);
  const [liveKeypoints, setLiveKeypoints] = useState([]);
  const [liveKeypointsImageSize, setLiveKeypointsImageSize] = useState({ width: 1, height: 1 });
  const [liveKeypointsRunning, setLiveKeypointsRunning] = useState(false);
  const [liveKeypointsDebug, setLiveKeypointsDebug] = useState({ count: 0, source: "idle" });
  const liveKeypointsPollRef = useRef(null);
  const liveKeypointsLastTsRef = useRef(0);
  const autoGroundPrepRunningRef = useRef(false);
  const autoGroundPrepDoneKeyRef = useRef("");
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
  const [groundMappingModes, setGroundMappingModes] = useState({
    imageCad: true,
    imageCoords: false,
    imageDistances: false,
    polygonCad: false,
  });
  const [manualWorldInput, setManualWorldInput] = useState({ x: "", y: "", z: "0" });
  const [distanceConstraints, setDistanceConstraints] = useState([]);
  const [distanceDraft, setDistanceDraft] = useState({ from: "", to: "", distance: "" });
  const [polygonCaptureActive, setPolygonCaptureActive] = useState(false);
  const [polygonImagePoints, setPolygonImagePoints] = useState([]);
  const [polygonCadPoints, setPolygonCadPoints] = useState([]);
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
  const [snapshotNaturalSize, setSnapshotNaturalSize] = useState({ width: 1, height: 1 });
  const cameraPosition = useMemo(() => deriveCameraPosition(pnpSolveResult), [pnpSolveResult]);
  const cameraIntrinsic = useMemo(() => {
    const K = Array.isArray(pnpSolveResult?.intrinsic?.K)
      ? pnpSolveResult.intrinsic.K
      : Array.isArray(intrinsicSolveResult?.K)
        ? intrinsicSolveResult.K
        : null;
    const D = Array.isArray(pnpSolveResult?.intrinsic?.D)
      ? pnpSolveResult.intrinsic.D
      : Array.isArray(intrinsicSolveResult?.D)
        ? intrinsicSolveResult.D
        : null;

    if (!K && !cameraType) {
      return null;
    }

    return {
      K,
      D,
      imageWidth: snapshotNaturalSize?.width > 1 ? snapshotNaturalSize.width : 1280,
      imageHeight: snapshotNaturalSize?.height > 1 ? snapshotNaturalSize.height : 720,
      cameraType: intrinsicSolveResult?.camera_type || cameraType || "pinhole",
    };
  }, [pnpSolveResult, intrinsicSolveResult, snapshotNaturalSize, cameraType]);
  const [draggingImagePointIndex, setDraggingImagePointIndex] = useState(null);

  const dwgInputRef = useRef(null);
  const sfmInputRef = useRef(null);
  const projectConfigInputRef = useRef(null);
  const projectSharedDwgInputRef = useRef(null);
  const snapshotImgRef = useRef(null);
  const snapshotOverlayRef = useRef(null);
  const liveFeedImgRef = useRef(null);
  const webcamVideoRef = useRef(null);
  const intrinsicVideoRef = useRef(null);
  const groundVideoRef = useRef(null);
  const cadPreviewAttemptedPathRef = useRef("");

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function readJsonResponseSafe(response) {
    const text = await response.text();
    if (!text || !text.trim()) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON response (HTTP ${response.status})`);
    }
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

  function normalizeAutoGroundSuggestions(items) {
    if (!Array.isArray(items)) {
      return [];
    }

    const normalizePoint = (value) => {
      if (!Array.isArray(value) || value.length !== 2) {
        return null;
      }
      const point = [Number(value[0]), Number(value[1])];
      return point.every((entry) => Number.isFinite(entry)) ? point : null;
    };

    const normalizeBox = (value) => {
      if (!Array.isArray(value) || value.length !== 4) {
        return null;
      }
      const box = value.map((entry) => Number(entry));
      return box.every((entry) => Number.isFinite(entry)) ? box : null;
    };

    const normalized = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const pixel = normalizePoint(item?.pixel);
      if (!pixel) {
        continue;
      }

      const score = Number(item?.score);
      const personScore = Number(item?.person_score ?? item?.personScore);
      normalized.push({
        id: String(item?.id || `auto-ground-${i + 1}`),
        pixel,
        score: Number.isFinite(score) ? score : null,
        person_score: Number.isFinite(personScore) ? personScore : null,
        source: String(item?.source || "bbox-bottom-center"),
        box: normalizeBox(item?.box),
        left_ankle: normalizePoint(item?.left_ankle),
        right_ankle: normalizePoint(item?.right_ankle),
      });
    }

    return normalized;
  }

  function normalizeAutoGroundDetections(items) {
    if (!Array.isArray(items)) {
      return [];
    }

    const normalizePoint = (value) => {
      if (!Array.isArray(value) || value.length !== 2) {
        return null;
      }
      const point = [Number(value[0]), Number(value[1])];
      return point.every((entry) => Number.isFinite(entry)) ? point : null;
    };

    const normalizeBox = (value) => {
      if (!Array.isArray(value) || value.length !== 4) {
        return null;
      }
      const box = value.map((entry) => Number(entry));
      return box.every((entry) => Number.isFinite(entry)) ? box : null;
    };

    const normalized = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const score = Number(item?.person_score ?? item?.personScore);
      const groundPoint = normalizePoint(item?.ground_point ?? item?.groundPoint);
      const leftAnkle = normalizePoint(item?.left_ankle ?? item?.leftAnkle);
      const rightAnkle = normalizePoint(item?.right_ankle ?? item?.rightAnkle);
      normalized.push({
        id: String(item?.id || `person-${i + 1}`),
        label: String(item?.label || "person"),
        person_score: Number.isFinite(score) ? score : null,
        passes_person_threshold: Boolean(item?.passes_person_threshold ?? item?.passesPersonThreshold),
        source: String(item?.source || "bbox-bottom-center"),
        box: normalizeBox(item?.box),
        ground_point: groundPoint,
        left_ankle: leftAnkle,
        right_ankle: rightAnkle,
      });
    }

    return normalized;
  }

  function normalizeAutoGroundLogs(items) {
    if (!Array.isArray(items)) {
      return [];
    }
    return items.map((item) => String(item || "")).filter(Boolean).slice(-40);
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
      autoGroundSuggestions: normalizeAutoGroundSuggestions(workspace.autoGroundSuggestions),
      autoGroundDetections: normalizeAutoGroundDetections(workspace.autoGroundDetections),
      autoGroundModelInfo: workspace.autoGroundModelInfo && typeof workspace.autoGroundModelInfo === "object" ? workspace.autoGroundModelInfo : null,
      autoGroundLogs: normalizeAutoGroundLogs(workspace.autoGroundLogs),
      autoGroundImageSize: workspace.autoGroundImageSize && typeof workspace.autoGroundImageSize === "object"
        ? {
            width: Number(workspace.autoGroundImageSize.width || 1),
            height: Number(workspace.autoGroundImageSize.height || 1),
          }
        : { width: 1, height: 1 },
      autoGroundStatus: String(workspace.autoGroundStatus || "No automatic human ground detection run yet."),
      groundMappingModes:
        workspace.groundMappingModes && typeof workspace.groundMappingModes === "object"
          ? {
              imageCad: workspace.groundMappingModes.imageCad !== false,
              imageCoords: Boolean(workspace.groundMappingModes.imageCoords),
              imageDistances: Boolean(workspace.groundMappingModes.imageDistances),
              polygonCad: Boolean(workspace.groundMappingModes.polygonCad),
            }
          : { imageCad: true, imageCoords: false, imageDistances: false, polygonCad: false },
      distanceConstraints: Array.isArray(workspace.distanceConstraints) ? workspace.distanceConstraints : [],
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
      options: { ...selectedProjectOptions },
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

    const normalizedOptions = normalizeProjectOptions(config?.options);

    setProjectDraftName(config?.projectName || "multi-camera-project");
    setProjectDraftDescription(config?.projectDescription || "");
    setProjectDraftSharedDwgPath(sharedPath || "");
    setProjectDraftOptions(normalizedOptions);
    setUseGroundPlane(normalizedOptions.useGroundPlane);
    setUseZDirection(normalizedOptions.useZDirection);
    setUseSfm(normalizedOptions.useSfm);
    setUseOverlay(normalizedOptions.useRealtimeOverlay);
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
      autoGroundSuggestions: deepClone(normalizeAutoGroundSuggestions(autoGroundSuggestions)),
      autoGroundDetections: deepClone(normalizeAutoGroundDetections(autoGroundDetections)),
      autoGroundModelInfo: autoGroundModelInfo && typeof autoGroundModelInfo === "object" ? deepClone(autoGroundModelInfo) : null,
      autoGroundLogs: deepClone(normalizeAutoGroundLogs(autoGroundLogs)),
      autoGroundImageSize: deepClone(autoGroundImageSize),
      autoGroundStatus: autoGroundStatus || "No automatic human ground detection run yet.",
      groundMappingModes: deepClone(groundMappingModes),
      distanceConstraints: deepClone(Array.isArray(distanceConstraints) ? distanceConstraints : []),
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
    const loadedAutoGroundSuggestions = normalizeAutoGroundSuggestions(workspace.autoGroundSuggestions);
    const loadedAutoGroundDetections = normalizeAutoGroundDetections(workspace.autoGroundDetections);
    const loadedDistanceConstraints = Array.isArray(workspace.distanceConstraints) ? workspace.distanceConstraints : [];
    const loadedMappingModes =
      workspace.groundMappingModes && typeof workspace.groundMappingModes === "object"
        ? {
            imageCad: workspace.groundMappingModes.imageCad !== false,
            imageCoords: Boolean(workspace.groundMappingModes.imageCoords),
            imageDistances: Boolean(workspace.groundMappingModes.imageDistances),
            polygonCad: Boolean(workspace.groundMappingModes.polygonCad),
          }
        : { imageCad: true, imageCoords: false, imageDistances: false, polygonCad: false };

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
    setAutoGroundSuggestions(loadedAutoGroundSuggestions);
    setAutoGroundDetections(loadedAutoGroundDetections);
    setAutoGroundModelInfo(workspace.autoGroundModelInfo && typeof workspace.autoGroundModelInfo === "object" ? workspace.autoGroundModelInfo : null);
    setAutoGroundLogs(normalizeAutoGroundLogs(workspace.autoGroundLogs));
    setAutoGroundImageSize(
      workspace.autoGroundImageSize && typeof workspace.autoGroundImageSize === "object"
        ? {
            width: Number(workspace.autoGroundImageSize.width || 1),
            height: Number(workspace.autoGroundImageSize.height || 1),
          }
        : { width: 1, height: 1 }
    );
    setGroundMappingModes(loadedMappingModes);
    setDistanceConstraints(loadedDistanceConstraints);
    setAutoGroundStatus(
      workspace.autoGroundStatus ||
        (loadedAutoGroundSuggestions.length
          ? `Loaded ${loadedAutoGroundSuggestions.length} automatic human ground suggestion${loadedAutoGroundSuggestions.length === 1 ? "" : "s"}.`
          : "No automatic human ground detection run yet.")
    );
    setPendingAutoGroundIndex(null);
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

  function collectReferenceWorldMarkers(anchorCameraId, workspacesArg = cameraWorkspaces) {
    const byId = new Map();

    for (const marker of sharedMarkers) {
      const markerId = String(marker?.id || marker?.markerId || "").trim();
      const world = Array.isArray(marker?.world) && marker.world.length === 3
        ? [Number(marker.world[0]), Number(marker.world[1]), Number(marker.world[2])]
        : null;
      const pixel = marker?.observations?.[anchorCameraId];
      if (!markerId || !world || !Array.isArray(pixel) || pixel.length !== 2) {
        continue;
      }
      byId.set(markerId, {
        markerId,
        world,
        anchorPixel: [Number(pixel[0]), Number(pixel[1])],
      });
    }

    if (byId.size > 0) {
      return Array.from(byId.values());
    }

    const anchorWorkspace = workspacesArg[anchorCameraId] || {};
    const pairs = normalizeCorrespondenceList(anchorWorkspace.correspondences);
    return pairs.map((pair, idx) => ({
      markerId: String(pair.markerId || `m${idx + 1}`),
      world: [Number(pair.world[0]), Number(pair.world[1]), Number(pair.world[2])],
      anchorPixel: [Number(pair.pixel[0]), Number(pair.pixel[1])],
    }));
  }

  function nearestReferenceMarker(pixel, references, maxDistancePx = 22) {
    if (!Array.isArray(pixel) || pixel.length !== 2 || !references.length) {
      return null;
    }
    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const ref of references) {
      const dx = Number(pixel[0]) - Number(ref.anchorPixel[0]);
      const dy = Number(pixel[1]) - Number(ref.anchorPixel[1]);
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = ref;
      }
    }
    if (!best || bestDist > maxDistancePx) {
      return null;
    }
    return { ...best, distancePx: bestDist };
  }

  function projectPointWithHomography(h, point) {
    if (!Array.isArray(h) || h.length !== 3 || !Array.isArray(point) || point.length !== 2) {
      return null;
    }
    const x = Number(point[0]);
    const y = Number(point[1]);
    const w = Number(h[2][0]) * x + Number(h[2][1]) * y + Number(h[2][2]);
    if (!Number.isFinite(w) || Math.abs(w) < 1e-9) {
      return null;
    }
    const u = (Number(h[0][0]) * x + Number(h[0][1]) * y + Number(h[0][2])) / w;
    const v = (Number(h[1][0]) * x + Number(h[1][1]) * y + Number(h[1][2])) / w;
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      return null;
    }
    return [u, v];
  }

  async function autoPlaceMarkersFromSolvedCameras(options = {}) {
    const silent = Boolean(options?.silent);
    try {
      if (!activeProjectCameraId) {
        throw new Error("Open/select a project camera first.");
      }

      const currentWorkspace = buildCurrentWorkspacePayload();
      const workspaces = {
        ...cameraWorkspaces,
        [activeProjectCameraId]: currentWorkspace,
      };
      setCameraWorkspaces(workspaces);

      const solvedCameras = projectCameras.filter((camera) => {
        const workspace = workspaces[camera.id] || {};
        return Boolean(workspace.latestCalibrationYamlPath);
      });

      if (!solvedCameras.length) {
        throw new Error("Need at least one solved camera (with calibration YAML) before auto placement.");
      }

      const targetWorkspace = workspaces[activeProjectCameraId] || {};
      const targetSnapshot = String(targetWorkspace.snapshotPath || "").trim();

      const preferredAnchor = solvedCameras.find((camera) => camera.id === "cam-1") || solvedCameras[0];
      const anchorCameraId = preferredAnchor.id;

      const references = collectReferenceWorldMarkers(anchorCameraId, workspaces);
      if (!references.length) {
        throw new Error(`No reference world markers found on anchor camera '${anchorCameraId}'.`);
      }

      const camerasPayload = [];
      const added = new Set();

      const syncedSnapshotPathByCamera = {};
      for (const camera of solvedCameras) {
        const workspace = workspaces[camera.id] || {};
        const syncedPath = await captureSyncedSnapshotForCamera(camera, workspace);
        const snapshotPathValue = String(syncedPath || workspace.snapshotPath || "").trim();
        if (!snapshotPathValue) {
          continue;
        }
        syncedSnapshotPathByCamera[camera.id] = snapshotPathValue;
        workspaces[camera.id] = {
          ...workspace,
          snapshotPath: snapshotPathValue,
        };
      }

      const anchorWorkspace = workspaces[anchorCameraId] || {};
      const anchorSnapshot = String(syncedSnapshotPathByCamera[anchorCameraId] || anchorWorkspace.snapshotPath || "").trim();
      if (!anchorSnapshot) {
        throw new Error(`Could not capture synchronized snapshot for anchor camera '${anchorCameraId}'.`);
      }
      camerasPayload.push({
        cameraId: anchorCameraId,
        snapshotPath: anchorSnapshot,
      });
      added.add(anchorCameraId);

      for (const camera of solvedCameras) {
        const snapshotPathValue = String(syncedSnapshotPathByCamera[camera.id] || "").trim();
        if (!snapshotPathValue || added.has(camera.id)) {
          continue;
        }
        camerasPayload.push({
          cameraId: camera.id,
          snapshotPath: snapshotPathValue,
        });
        added.add(camera.id);
      }

      if (!added.has(activeProjectCameraId)) {
        const fallbackTargetSnapshot = String(
          syncedSnapshotPathByCamera[activeProjectCameraId] || targetSnapshot || ""
        ).trim();
        if (fallbackTargetSnapshot) {
          camerasPayload.push({
            cameraId: activeProjectCameraId,
            snapshotPath: fallbackTargetSnapshot,
          });
        }
      }

      setCameraWorkspaces({ ...workspaces });

      if (camerasPayload.length < 2) {
        throw new Error("Need at least 2 camera snapshots for feature matching.");
      }

      const res = await fetch("/api/calibration/web/match-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cameras: camerasPayload,
          matchOptions: {
            method: "auto",
            maxFeatures: 2048,
            maxMatchesPerPair: 900,
            minConfidence: 0.30,
            maxImageSide: 1280,
            anchorCameraId,
          },
        }),
      });

      const data = await readJsonResponseSafe(res);
      if (!res.ok) {
        throw new Error(data?.error || "Auto feature matching failed");
      }

      const matching = data?.matching || {};
      const markers = Array.isArray(matching?.markers) ? matching.markers : [];
      const pairModels = Array.isArray(matching?.pair_models) ? matching.pair_models : [];
      if (!markers.length) {
        throw new Error("No cross-camera feature markers were found.");
      }

      const usedReferenceIds = new Set();
      const autoPairs = [];

      const homographiesToTarget = pairModels.filter((item) => item?.camera_b === activeProjectCameraId && Array.isArray(item?.homography));
      for (const ref of references) {
        if (usedReferenceIds.has(ref.markerId)) {
          continue;
        }
        let bestProjection = null;
        for (const model of homographiesToTarget) {
          const projected = projectPointWithHomography(model.homography, ref.anchorPixel);
          if (!projected) {
            continue;
          }
          const score = Number(model.global_similarity || 0) * Number(model.inlier_ratio || 0);
          if (!bestProjection || score > bestProjection.score) {
            bestProjection = {
              pixel: projected,
              score,
              sourceCamera: model.camera_a,
              method: model.method,
            };
          }
        }

        if (bestProjection && bestProjection.score > 0.08) {
          usedReferenceIds.add(ref.markerId);
          autoPairs.push({
            markerId: ref.markerId,
            world: ref.world,
            pixel: [Number(bestProjection.pixel[0]), Number(bestProjection.pixel[1])],
            _meta: {
              anchorCameraId,
              sourceCameraId: bestProjection.sourceCamera,
              method: bestProjection.method,
              homographyScore: bestProjection.score,
            },
          });
        }
      }

      for (const marker of markers) {
        const obs = marker?.observations || {};
        const anchorPix = obs?.[anchorCameraId];
        const targetPix = obs?.[activeProjectCameraId];
        if (!Array.isArray(anchorPix) || anchorPix.length !== 2 || !Array.isArray(targetPix) || targetPix.length !== 2) {
          continue;
        }

        const match = nearestReferenceMarker(anchorPix, references, 24);
        if (!match || usedReferenceIds.has(match.markerId)) {
          continue;
        }
        usedReferenceIds.add(match.markerId);
        autoPairs.push({
          markerId: match.markerId,
          world: match.world,
          pixel: [Number(targetPix[0]), Number(targetPix[1])],
          _meta: {
            anchorCameraId,
            anchorPixel: [Number(anchorPix[0]), Number(anchorPix[1])],
            distancePx: Number(match.distancePx),
          },
        });
      }

      if (!autoPairs.length) {
        throw new Error(
          `Feature matches found, but none aligned with known world markers from '${anchorCameraId}'. Try adding/syncing more markers in camera-1 first.`
        );
      }

      setCorrespondences((prev) => {
        const prevMap = new Map(normalizeCorrespondenceList(prev).map((item) => [String(item.markerId), item]));
        for (const pair of autoPairs) {
          prevMap.set(String(pair.markerId), {
            markerId: String(pair.markerId),
            world: [Number(pair.world[0]), Number(pair.world[1]), Number(pair.world[2])],
            pixel: [Number(pair.pixel[0]), Number(pair.pixel[1])],
          });
        }
        const merged = Array.from(prevMap.values());
        setCorrespondenceText(JSON.stringify(merged, null, 2));
        return merged;
      });

      const pairStats = Array.isArray(matching?.pair_stats) ? matching.pair_stats : [];
      const methodSummary = pairStats
        .map((item) => `${item.camera_a}→${item.camera_b}:${item.method}(sim=${Number(item.global_similarity || 0).toFixed(2)})`)
        .join(", ");
      const sourceSummary = autoPairs
        .map((pair) => `${pair.markerId}:${pair._meta?.sourceCameraId || anchorCameraId}/${pair._meta?.method || "match"}`)
        .slice(0, 20)
        .join(", ");
      setSolveStatus(
        `Auto-placed ${autoPairs.length} marker(s) on '${activeProjectCameraId}' using whole-image feature extraction + geometric transfer. Methods: ${methodSummary || matching?.method_requested || "auto"}.`
      );
      setProjectStatus(
        `Feature source: synchronized snapshots. Anchor '${anchorCameraId}', solved cameras used: ${Array.from(added).join(", ")}. Marker sources: ${sourceSummary || "n/a"}.`
      );
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Automatic marker placement failed";
      if (!silent) {
        setSolveStatus(message);
        setProjectStatus(message);
      }
      return false;
    }
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
    setPendingAutoGroundIndex(null);
    setPendingImagePoint(null);
    const marker = sharedMarkers[idx];
    setSolveStatus(`Shared marker mode active. Click image point for marker '${marker.id}'.`);
  }

  function stopSharedMarkerCapture() {
    setImagePickMode("ground");
    setPendingSharedMarkerIndex(null);
    setPendingAutoGroundIndex(null);
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
        options: normalizeProjectOptions(projectDraftOptions),
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
    autoGroundSuggestions,
    autoGroundStatus,
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
    const idx = enabledStages.indexOf(stage);
    if (idx <= 0) {
      return true;
    }
    const prevStage = enabledStages[idx - 1];
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
        return { enabled: false, status: "Capture reference frame first (use the button in Ground Plane step)." };
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

  async function saveSnapshotDataUrl(imageDataUrl, label = "") {
    const saveRes = await fetch("/api/calibration/web/snapshot-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl }),
    });
    const saveData = await readJsonResponseSafe(saveRes);
    if (!saveRes.ok) {
      throw new Error(saveData?.error || "Snapshot save failed");
    }
    const capturedUrl = saveData?.snapshotDataUrl || imageDataUrl;
    const outputPath = String(saveData?.outputPath || "");
    setSnapshotDataUrl(capturedUrl);
    setSnapshotPath(outputPath);
    setSnapshotStatus(
      label
        ? `Reference frame captured (${label}): ${saveData?.outputPath || "saved"}`
        : `Reference frame captured: ${saveData?.outputPath || "saved"}`
    );
    setAutoGroundSuggestions([]);
    setAutoGroundDetections([]);
    setAutoGroundModelInfo(null);
    setAutoGroundLogs([]);
    setAutoGroundImageSize({ width: 1, height: 1 });
    setPendingAutoGroundIndex(null);
    setAutoGroundStatus("Reference frame ready. Auto ground prep will continue in background.");
    return { capturedUrl, outputPath };
  }

  function captureRtspFrameFromLiveFeedElement() {
    const img = liveFeedImgRef.current;
    if (!img) {
      return "";
    }
    const width = Number(img.naturalWidth || img.width || 0);
    const height = Number(img.naturalHeight || img.height || 0);
    if (width < 2 || height < 2) {
      return "";
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return "";
    }
    try {
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL("image/jpeg", 0.92);
    } catch {
      return "";
    }
  }

  async function captureSnapshotWeb() {
    try {
      if (sourceMode === "webcam") {
        const imageDataUrl = captureWebcamFrame();
        const saved = await saveSnapshotDataUrl(imageDataUrl, "webcam");
        return saved?.capturedUrl || "";
      }

      const liveImageDataUrl = captureRtspFrameFromLiveFeedElement();
      if (liveImageDataUrl) {
        const saved = await saveSnapshotDataUrl(liveImageDataUrl, "live feed");
        return saved?.capturedUrl || "";
      }

      if (!sourceUrl) {
        throw new Error("Snapshot capture failed: live feed frame unavailable and source URL is empty.");
      }

      const res = await fetch("/api/calibration/web/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl }),
      });
      const data = await readJsonResponseSafe(res);
      if (!res.ok) {
        throw new Error(data?.error || "Snapshot capture failed");
      }
      const capturedUrl = data.snapshotDataUrl || "";
      setSnapshotDataUrl(capturedUrl);
      setSnapshotPath(data.outputPath || "");
      setSnapshotStatus(`Reference frame captured from ${sourceUrl}`);
      setAutoGroundSuggestions([]);
      setAutoGroundDetections([]);
      setAutoGroundModelInfo(null);
      setAutoGroundLogs([]);
      setAutoGroundImageSize({ width: 1, height: 1 });
      setPendingAutoGroundIndex(null);
      setAutoGroundStatus("Reference frame ready. Auto ground prep will continue in background.");
      return capturedUrl;
    } catch (err) {
      setSnapshotStatus(err instanceof Error ? err.message : "Snapshot capture failed");
      return "";
    }
  }

  async function captureSyncedSnapshotForCamera(camera, workspace = {}) {
    const cameraId = String(camera?.id || "").trim();
    if (!cameraId) {
      return "";
    }

    const cameraSourceMode = String(workspace?.sourceMode || camera?.sourceMode || "rtsp");
    const cameraSourceUrl = String(workspace?.sourceUrl || camera?.sourceUrl || "").trim();

    try {
      if (cameraId === activeProjectCameraId) {
        if (cameraSourceMode === "webcam") {
          const frameDataUrl = captureWebcamFrame();
          const saved = await saveSnapshotDataUrl(frameDataUrl, "webcam-live-sync");
          return String(saved?.outputPath || workspace?.snapshotPath || "").trim();
        }

        const liveFrame = captureRtspFrameFromLiveFeedElement();
        if (liveFrame) {
          const saved = await saveSnapshotDataUrl(liveFrame, "rtsp-live-sync");
          return String(saved?.outputPath || workspace?.snapshotPath || "").trim();
        }
      }

      if (!cameraSourceUrl || cameraSourceMode === "webcam") {
        return String(workspace?.snapshotPath || "").trim();
      }

      const res = await fetch("/api/calibration/web/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: cameraSourceUrl }),
      });
      const data = await readJsonResponseSafe(res);
      if (!res.ok) {
        return String(workspace?.snapshotPath || "").trim();
      }
      return String(data?.outputPath || workspace?.snapshotPath || "").trim();
    } catch {
      return String(workspace?.snapshotPath || "").trim();
    }
  }

  async function detectAutoGroundPoints(initialImageUrl = "") {
    try {
      setAutoGroundLoading(true);
      setAutoGroundLogs([]);

      let imageUrl = initialImageUrl || snapshotDataUrl;
      if (!imageUrl) {
        setAutoGroundStatus("Capturing reference frame before detection...");
        imageUrl = await captureSnapshotWeb();
        if (!imageUrl) {
          throw new Error("Could not capture a reference frame. Start the live feed first.");
        }
      }

      setAutoGroundStatus("Detecting human ground-contact points on CPU... first run may download model weights.");

      const res = await fetch("/api/calibration/web/ground/pose-detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: imageUrl,
          maxSide: 960,
          minPersonScore: 0.65,
          minKeypointScore: 0.35,
        }),
      });
      const data = await readJsonResponseSafe(res);
      if (!res.ok) {
        throw new Error(data?.error || "Automatic human ground detection failed");
      }

      const result = data?.result || {};
      const suggestions = normalizeAutoGroundSuggestions(result?.suggestions);
      const detections = normalizeAutoGroundDetections(result?.detections);
      const modelInfo = data?.model && typeof data.model === "object" ? data.model : (result?.model && typeof result.model === "object" ? result.model : null);
      const logs = normalizeAutoGroundLogs(data?.logs);
      const count = suggestions.length;
      const detectionCount = Number(result?.detection_count ?? detections.length);
      const device = String(result?.device || "cpu");

      setAutoGroundSuggestions(suggestions);
      setAutoGroundDetections(detections);
      setAutoGroundModelInfo(modelInfo);
      setAutoGroundLogs(logs);
      setAutoGroundImageSize({
        width: Number(result?.image_width || snapshotNaturalSize.width || 1),
        height: Number(result?.image_height || snapshotNaturalSize.height || 1),
      });
      setPendingAutoGroundIndex(null);

      const modelSuffix = modelInfo
        ? ` Model: ${modelInfo.status || "ready"}${modelInfo.weights_url ? ` · source ${modelInfo.weights_url}` : ""}${modelInfo.download_percent != null ? ` · ${modelInfo.download_percent}%` : ""}.`
        : "";

      setAutoGroundStatus(
        count
          ? `Detected ${detectionCount} human${detectionCount === 1 ? "" : "s"}; ${count} automatic ground suggestion${count === 1 ? "" : "s"} using ${device} inference.${modelSuffix} Select one and then pick the matching CAD point.`
          : `Detected ${detectionCount} human${detectionCount === 1 ? "" : "s"}, but no valid ground suggestion points.${modelSuffix} Try a clearer snapshot with visible feet or full body pose.`
      );
      return true;
    } catch (err) {
      setAutoGroundStatus(err instanceof Error ? err.message : "Automatic human ground detection failed");
      return false;
    } finally {
      setAutoGroundLoading(false);
    }
  }

  function clearAutoGroundSuggestions() {
    setAutoGroundSuggestions([]);
    setAutoGroundDetections([]);
    setAutoGroundModelInfo(null);
    setAutoGroundLogs([]);
    setAutoGroundImageSize({ width: 1, height: 1 });
    setPendingAutoGroundIndex(null);
    setPendingImagePoint(null);
    setAutoGroundStatus("Automatic human ground suggestions cleared.");
  }

  // ── Live feature extraction ─────────────────────────────────────────────
  async function extractLiveKeypoints(frameDataUrl) {
    if (liveKeypointsRunning) return;
    let imageUrl = frameDataUrl;
    let extractionSource = frameDataUrl ? "pre-captured" : "unknown";
    try {
      setLiveKeypointsRunning(true);
      if (!imageUrl) {
        if (sourceMode === "webcam") {
          imageUrl = captureWebcamFrame();
          extractionSource = "webcam-live";
        } else {
          imageUrl = captureRtspFrameFromLiveFeedElement();
          extractionSource = "rtsp-live";
        }
        if (!imageUrl) {
          setLiveKeypointsDebug((prev) => ({ ...prev, source: `${extractionSource}-unavailable` }));
          return false;
        }
      }
      const res = await fetch("/api/calibration/web/extract-keypoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: imageUrl, maxFeatures: 2000, maxSide: 1280 }),
      });
      const data = await readJsonResponseSafe(res);
      if (!res.ok) {
        const msg = data?.error || `Feature extraction failed (HTTP ${res.status})`;
        setSolveStatus(msg);
        setLiveKeypointsDebug((prev) => ({ ...prev, source: `${extractionSource}-http-${res.status}` }));
        return false;
      }
      const result = data?.result || data;
      if (Array.isArray(result?.keypoints)) {
        setLiveKeypoints(result.keypoints);
        setLiveKeypointsImageSize({
          width: Number(result.image_width || 1),
          height: Number(result.image_height || 1),
        });
        liveKeypointsLastTsRef.current = Date.now();
        setLiveKeypointsDebug({ count: result.keypoints.length, source: extractionSource });
        if (result.keypoints.length === 0) {
          setSolveStatus("Feature extraction returned 0 points for this frame. Waiting for next frame...");
        }
      }
      return true;
    } catch (err) {
      setSolveStatus(err instanceof Error ? err.message : "Feature extraction error");
      setLiveKeypointsDebug((prev) => ({ ...prev, source: `${extractionSource}-error` }));
      return false;
    } finally {
      setLiveKeypointsRunning(false);
    }
  }

  async function runAutoGroundPrep() {
    const shouldRun = enabledStageSet.has("ground-plane") && (feedEnabled || sourceMode === "webcam");
    if (!shouldRun) {
      return;
    }
    if (autoGroundPrepRunningRef.current) {
      return;
    }

    const prepKey = `${activeProjectCameraId || "standalone"}|${sourceMode}|${sourceMode === "webcam" ? "__webcam__" : sourceUrl}`;
    if (autoGroundPrepDoneKeyRef.current === prepKey) {
      return;
    }

    autoGroundPrepRunningRef.current = true;
    try {
      setAutoGroundStatus("Auto-preparing ground-plane inputs from live feed...");
      const frameUrl = await captureSnapshotWeb();
      if (!frameUrl) {
        return;
      }

      const prepResults = await Promise.allSettled([
        detectAutoGroundPoints(frameUrl),
        extractLiveKeypoints(frameUrl),
        autoPlaceMarkersFromSolvedCameras({ silent: true }),
      ]);

      const anySuccess = prepResults.some((result) => result.status === "fulfilled" && result.value === true);
      if (anySuccess) {
        autoGroundPrepDoneKeyRef.current = prepKey;
      } else {
        setAutoGroundStatus("Auto-prep failed; retrying soon while feed is active...");
      }
    } finally {
      autoGroundPrepRunningRef.current = false;
    }
  }

  useEffect(() => {
    const shouldRun = enabledStageSet.has("ground-plane") && (feedEnabled || sourceMode === "webcam");
    if (!shouldRun) {
      return undefined;
    }

    const timer = setTimeout(() => {
      runAutoGroundPrep().catch(() => {});
    }, 800);

    return () => clearTimeout(timer);
  }, [enabledStageSet, feedEnabled, sourceMode, sourceUrl, activeProjectCameraId]);

  // Poll live features every 1.5 s while the ground-plane section is active
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const shouldPoll = enabledStageSet.has("ground-plane") && (feedEnabled || sourceMode === "webcam");
    if (!shouldPoll) return undefined;
    const id = setInterval(() => {
      if (!liveKeypointsRunning) {
        extractLiveKeypoints(null).catch(() => {});
      }
    }, 1500);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledStageSet, feedEnabled, sourceMode]);

  function deleteAutoGroundSuggestion(index) {
    const shouldClearPending = pendingAutoGroundIndex === index;
    setAutoGroundSuggestions((prev) => {
      const next = prev.filter((_, itemIndex) => itemIndex !== index);
      setAutoGroundStatus(
        next.length
          ? `${next.length} automatic human ground suggestion${next.length === 1 ? " remains" : "s remain"}.`
          : "Automatic human ground suggestions cleared."
      );
      return next;
    });

    setPendingAutoGroundIndex((prev) => {
      if (prev === null) {
        return prev;
      }
      if (prev === index) {
        return null;
      }
      return prev > index ? prev - 1 : prev;
    });

    if (shouldClearPending) {
      setPendingImagePoint(null);
    }
  }

  function selectAutoGroundSuggestion(index) {
    const suggestion = autoGroundSuggestions[index];
    if (!suggestion) {
      return;
    }

    setImagePickMode("ground");
    setPendingZGroundIndex(null);
    setPendingZImageTip(null);
    setPendingSharedMarkerIndex(null);
    setPendingWorldPoint(null);
    setPendingImagePoint([Number(suggestion.pixel[0]), Number(suggestion.pixel[1])]);
    setPendingAutoGroundIndex(index);
    setSolveStatus(
      `Auto suggestion A${index + 1} selected at P[${Number(suggestion.pixel[0]).toFixed(1)}, ${Number(suggestion.pixel[1]).toFixed(1)}]. Now pick the matching CAD point.`
    );
  }

  function buildValidationPairFromPixel(pixel) {
    if (!Array.isArray(pixel) || pixel.length !== 2) {
      return { error: "Invalid image point for validation." };
    }

    const normalizedPixel = [Number(pixel[0]), Number(pixel[1])];
    if (!normalizedPixel.every((value) => Number.isFinite(value))) {
      return { error: "Invalid image point for validation." };
    }

    const projectedWorld = estimateGroundWorldFromPixel(normalizedPixel);
    if (!projectedWorld) {
      return { error: "Failed to project point onto CAD ground. Add clean pairs and rerun Solve PnP." };
    }

    return {
      pair: {
        world: projectedWorld,
        pixel: normalizedPixel,
      },
    };
  }

  function projectAutoGroundSuggestionToValidation(index) {
    const readiness = getGroundValidationReadiness();
    if (!readiness.enabled) {
      setSolveStatus(readiness.status);
      setValidationStatus(readiness.status);
      return;
    }

    const suggestion = autoGroundSuggestions[index];
    if (!suggestion) {
      return;
    }

    const built = buildValidationPairFromPixel(suggestion.pixel);
    if (!built.pair) {
      setSolveStatus(built.error || "Failed to project automatic human ground point.");
      return;
    }

    setValidationPairs((prev) => [...prev, built.pair]);
    setPendingWorldPoint(null);
    setPendingImagePoint(null);
    setPendingAutoGroundIndex(index);
    setValidationStatus("Automatic human ground point projected onto CAD. Add more points and run validation.");
    setSolveStatus(
      `Auto suggestion A${index + 1} projected: P[${Number(built.pair.pixel[0]).toFixed(1)}, ${Number(built.pair.pixel[1]).toFixed(1)}] → W[${built.pair.world
        .map((value) => Number(value).toFixed(2))
        .join(", ")}]`
    );
  }

  function projectAllAutoGroundSuggestionsToValidation() {
    const readiness = getGroundValidationReadiness();
    if (!readiness.enabled) {
      setSolveStatus(readiness.status);
      setValidationStatus(readiness.status);
      return;
    }

    if (!autoGroundSuggestions.length) {
      setSolveStatus("No automatic human ground suggestions available.");
      return;
    }

    const projected = [];
    let skipped = 0;
    for (const suggestion of autoGroundSuggestions) {
      const built = buildValidationPairFromPixel(suggestion.pixel);
      if (built.pair) {
        projected.push(built.pair);
      } else {
        skipped += 1;
      }
    }

    if (!projected.length) {
      setSolveStatus("Failed to project automatic human ground suggestions onto CAD ground.");
      return;
    }

    setValidationPairs((prev) => [...prev, ...projected]);
    setPendingWorldPoint(null);
    setPendingImagePoint(null);
    setPendingAutoGroundIndex(null);
    setValidationStatus(
      `Projected ${projected.length} automatic human ground point${projected.length === 1 ? "" : "s"} onto CAD${skipped ? ` (${skipped} skipped)` : ""}.`
    );
    setSolveStatus(
      `Projected ${projected.length} automatic human ground suggestion${projected.length === 1 ? "" : "s"} into validation${skipped ? ` (${skipped} skipped)` : ""}.`
    );
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
      setPendingAutoGroundIndex(null);
      setSolveStatus("Z-direction mapping added. Click another ground marker for next Z pair, or switch mode.");
      return;
    }

    if (polygonCaptureActive && imagePickMode === "polygon-image") {
      const normalizedWorld = [Number(world.x ?? world[0]), Number(world.y ?? world[1]), Number(world.z ?? world[2])];
      if (!normalizedWorld.every((value) => Number.isFinite(value))) {
        setSolveStatus("Invalid CAD point for polygon mapping.");
        return;
      }
      if (polygonCadPoints.length >= polygonImagePoints.length) {
        setSolveStatus("Add an image polygon vertex first, then pick CAD vertex.");
        return;
      }
      setPolygonCadPoints((prev) => [...prev, normalizedWorld]);
      setSolveStatus(
        `Polygon vertex pair ${polygonCadPoints.length + 1} captured. ${polygonImagePoints.length > polygonCadPoints.length + 1 ? "Continue with next CAD vertex." : "Add more image vertices or finalize polygon mapping."}`
      );
      return;
    }

    if (!groundMappingModes.imageCad) {
      setSolveStatus("Image↔CAD pairing is disabled in selected mapping methods. Enable it or use manual coordinate mode.");
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
    setPendingAutoGroundIndex(null);
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

    if (polygonCaptureActive && imagePickMode === "polygon-image") {
      setPolygonImagePoints((prev) => [...prev, [xPix, yPix]]);
      setSolveStatus(`Polygon image vertex ${polygonImagePoints.length + 1} added. Now pick matching CAD vertex.`);
      return;
    }

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

      const built = buildValidationPairFromPixel([xPix, yPix]);
      if (!built.pair) {
        setSolveStatus(built.error || "Failed to project point onto CAD ground.");
        return;
      }

      const pair = built.pair;

      setValidationPairs((prev) => [...prev, pair]);
      setPendingWorldPoint(null);
      setPendingImagePoint(null);
      setPendingAutoGroundIndex(null);
      setValidationStatus("Validation point projected on CAD. Add more points and run validation.");
      setSolveStatus(
        `Validation point projected: P[${xPix.toFixed(1)}, ${yPix.toFixed(1)}] → W[${pair.world
          .map((value) => Number(value).toFixed(2))
          .join(", ")}]`
      );
      return;
    }

    setPendingAutoGroundIndex(null);
    setPendingImagePoint([xPix, yPix]);
    if (groundMappingModes.imageCoords) {
      setSolveStatus(
        `Image point selected: [${xPix.toFixed(1)}, ${yPix.toFixed(1)}]. Enter world coordinates and add pair${groundMappingModes.imageCad ? " or pick CAD point" : ""}.`
      );
    } else {
      setSolveStatus(`Image point selected: [${xPix.toFixed(1)}, ${yPix.toFixed(1)}]. Now pick CAD point.`);
    }
  }

  function onSnapshotImageLoad(e) {
    setSnapshotNaturalSize({
      width: e.currentTarget.naturalWidth || 1,
      height: e.currentTarget.naturalHeight || 1,
    });
  }

  function onLiveFeedLoad(e) {
    const el = e.currentTarget;
    const w = el.naturalWidth || el.videoWidth || 0;
    const h = el.naturalHeight || el.videoHeight || 0;
    if (w && h) {
      setSnapshotNaturalSize({ width: w, height: h });
    }

    const shouldExtract = enabledStageSet.has("ground-plane") && (feedEnabled || sourceMode === "webcam");
    const elapsed = Date.now() - (liveKeypointsLastTsRef.current || 0);
    if (shouldExtract && !liveKeypointsRunning && elapsed > 1200) {
      extractLiveKeypoints(null).catch(() => {});
    }
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
    setPendingAutoGroundIndex(null);
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
    setPolygonCaptureActive(false);
    setPolygonImagePoints([]);
    setPolygonCadPoints([]);
    setPendingZGroundIndex(null);
    setPendingZImageTip(null);
    setPendingSharedMarkerIndex(null);
    setPendingAutoGroundIndex(null);
    setSolveStatus("Ground pick mode active.");
  }

  function setGroundMappingMode(modeKey, enabled) {
    if (!enabled) {
      setGroundMappingModes({ imageCad: true, imageCoords: false, imageDistances: false, polygonCad: false });
      setSolveStatus("Ground mapping mode set to Image + AutoCAD points.");
      return;
    }

    const next = {
      imageCad: modeKey === "imageCad",
      imageCoords: modeKey === "imageCoords",
      imageDistances: modeKey === "imageDistances",
      polygonCad: modeKey === "polygonCad",
    };
    setGroundMappingModes(next);

    if (modeKey !== "polygonCad") {
      setPolygonCaptureActive(false);
      setPolygonImagePoints([]);
      setPolygonCadPoints([]);
      if (imagePickMode === "polygon-image") {
        setImagePickMode("ground");
      }
    }

    const label =
      modeKey === "imageCad"
        ? "Image + AutoCAD"
        : modeKey === "imageCoords"
          ? "Image + Manual Coordinates"
          : modeKey === "imageDistances"
            ? "Image + Distances"
            : "Polygon Image + AutoCAD";
    setSolveStatus(`Ground mapping mode: ${label}.`);
  }

  function addManualCoordinatePair() {
    if (!pendingImagePoint) {
      setSolveStatus("Pick an image point first, then enter world coordinates.");
      return;
    }

    const world = [Number(manualWorldInput.x), Number(manualWorldInput.y), Number(manualWorldInput.z)];
    if (!world.every((value) => Number.isFinite(value))) {
      setSolveStatus("Enter valid numeric world coordinates (X, Y, Z).");
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

    setPendingImagePoint(null);
    setPendingWorldPoint(null);
    setPendingAutoGroundIndex(null);
    setSolveStatus("Manual world-coordinate pair added.");
  }

  function addDistanceConstraint() {
    const from = String(distanceDraft.from || "").trim();
    const to = String(distanceDraft.to || "").trim();
    const distance = Number(distanceDraft.distance);
    if (!from || !to || from === to) {
      setSolveStatus("Choose two different markers for distance constraint.");
      return;
    }
    if (!Number.isFinite(distance) || distance <= 0) {
      setSolveStatus("Enter a valid positive distance.");
      return;
    }

    setDistanceConstraints((prev) => [
      ...prev,
      {
        id: `dist-${Date.now()}-${prev.length + 1}`,
        from,
        to,
        distance,
      },
    ]);
    setDistanceDraft({ from: "", to: "", distance: "" });
    setSolveStatus("Distance constraint saved. You can combine this with other mapping methods.");
  }

  function deleteDistanceConstraint(index) {
    setDistanceConstraints((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  function beginPolygonCadMapping() {
    setPolygonCaptureActive(true);
    setPolygonImagePoints([]);
    setPolygonCadPoints([]);
    setImagePickMode("polygon-image");
    setPendingImagePoint(null);
    setPendingWorldPoint(null);
    setSolveStatus("Polygon mapping started: click image vertices in order, then click matching CAD points in order.");
  }

  function clearPolygonCadMapping() {
    setPolygonCaptureActive(false);
    setPolygonImagePoints([]);
    setPolygonCadPoints([]);
    setImagePickMode("ground");
    setSolveStatus("Polygon mapping cleared.");
  }

  function finalizePolygonCadMapping() {
    const usable = Math.min(polygonImagePoints.length, polygonCadPoints.length);
    if (usable < 2) {
      setSolveStatus("Polygon mapping needs at least 2 matched vertices.");
      return;
    }

    setCorrespondences((prev) => {
      const additions = [];
      for (let i = 0; i < usable; i += 1) {
        additions.push({
          markerId: `m${prev.length + additions.length + 1}`,
          world: polygonCadPoints[i],
          pixel: polygonImagePoints[i],
        });
      }
      const next = [...prev, ...additions];
      setCorrespondenceText(JSON.stringify(next, null, 2));
      return next;
    });

    setSolveStatus(`Polygon mapping added ${usable} correspondence pair${usable === 1 ? "" : "s"}.`);
    setPolygonCaptureActive(false);
    setPolygonImagePoints([]);
    setPolygonCadPoints([]);
    setImagePickMode("ground");
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
    setPendingAutoGroundIndex(null);
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
          const pixel = Array.isArray(vp?.pixel) ? vp.pixel : Array.isArray(vp?.image) ? vp.image : null;
          const world = Array.isArray(vp?.world) ? vp.world : null;
          if (!pixel || !world || pixel.length !== 2 || world.length !== 3) {
            return null;
          }

          const projected = estimateGroundWorldFromPixel(pixel);
          if (!projected) return null;
          const dx = projected[0] - Number(world[0]);
          const dy = projected[1] - Number(world[1]);
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
            <p className="text-xs text-zinc-500">Set in project creation. Active for this project:</p>
            <ul className="space-y-1 text-sm">
              <li className={useGroundPlane ? "text-emerald-300" : "text-zinc-500 line-through"}>Ground Plane Mapping</li>
              <li className={useZDirection ? "text-emerald-300" : "text-zinc-500 line-through"}>Z Direction Mapping</li>
              <li className={useSfm ? "text-emerald-300" : "text-zinc-500 line-through"}>Structure from Motion</li>
              <li className={useOverlay ? "text-emerald-300" : "text-zinc-500 line-through"}>CCTV ↔ 3D DWG Overlay</li>
            </ul>
            {!routeProjectId ? (
              <details className="text-xs text-zinc-400">
                <summary className="cursor-pointer select-none">Override (standalone mode only)</summary>
                <div className="mt-2 space-y-1">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={useGroundPlane} onChange={(e) => setUseGroundPlane(e.target.checked)} /> Ground Plane Mapping</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={useZDirection} onChange={(e) => setUseZDirection(e.target.checked)} /> Z Direction Mapping</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={useSfm} onChange={(e) => setUseSfm(e.target.checked)} /> Structure from Motion</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={useOverlay} onChange={(e) => setUseOverlay(e.target.checked)} /> CCTV ↔ 3D DWG Overlay</label>
                </div>
              </details>
            ) : null}
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
              projectDraftOptions,
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
              setProjectDraftOptions,
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

        {enabledStageSet.has("ground-plane") ? (
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
            autoGroundSuggestions,
            autoGroundDetections,
            autoGroundModelInfo,
            autoGroundLogs,
            autoGroundImageSize,
            autoGroundStatus,
            autoGroundLoading,
            pendingAutoGroundIndex,
            pendingImagePoint,
            groundMappingModes,
            manualWorldInput,
            distanceConstraints,
            distanceDraft,
            polygonCaptureActive,
            polygonImagePoints,
            polygonCadPoints,
            solveStatus,
            jobLoading,
            sequenceRunning,
            allowCadUpload: !routeProjectId,
            dwgMessage,
            segments,
            stageOutputGroundPlane: stageOutputs["ground-plane"],
            pnpSolveResult,
            cameraPosition,
            cameraIntrinsic,
            liveKeypoints,
            liveKeypointsImageSize,
            liveKeypointsRunning,
            liveKeypointsDebug,
          }}
          actions={{
            setGroundPickMode,
            setValidationPickMode,
            beginSharedMarkerCapture,
            onFeedError,
            clearFeedError,
            captureSnapshotWeb,
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
          }}
          refs={{
            groundVideoRef,
            snapshotImgRef,
            snapshotOverlayRef,
            liveFeedImgRef,
            dwgInputRef,
          }}
          renderStageStatus={renderStageStatus}
        />
        ) : null}

        {enabledStageSet.has("z-mapping") ? (
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
            cameraPosition,
            cameraIntrinsic,
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
        ) : null}

        {enabledStageSet.has("cad-3d-dwg") ? (
        <Cad3dStepSection
          data={{
            cadReadiness: getStageReadiness("cad-3d-dwg"),
            correspondences,
            zMappings,
            segments,
            stageOutputCad: stageOutputs["cad-3d-dwg"],
            jobLoading,
            sequenceRunning,
            cameraPosition,
            cameraIntrinsic,
          }}
          actions={{
            setStageOutput,
            runStageCard,
          }}
          renderStageStatus={renderStageStatus}
        />
        ) : null}

        <RemainingStagesSection
          data={{
            stages: enabledStages,
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
