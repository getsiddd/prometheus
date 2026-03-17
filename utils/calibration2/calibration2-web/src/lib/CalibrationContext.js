"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

const CalibrationContext = createContext(null);

const DEFAULT_STEP_STATES = {
  "plane-mapping": { status: "idle", progress: 0, logs: [], result: null, updatedAt: "" },
  "ground-plane": { status: "idle", progress: 0, logs: [], result: null, updatedAt: "" },
  "z-mapping": { status: "idle", progress: 0, logs: [], result: null, updatedAt: "" },
  "dlt-mapping": { status: "idle", progress: 0, logs: [], result: null, updatedAt: "" },
  "sfm-mapping": { status: "idle", progress: 0, logs: [], result: null, updatedAt: "" },
  validation: { status: "idle", progress: 0, logs: [], result: null, updatedAt: "" },
};

function normalizeStepState(entry, fallback = {}) {
  const item = entry && typeof entry === "object" ? entry : {};
  const rawProgress = Number(item.progress);
  return {
    status: typeof item.status === "string" ? item.status : (fallback.status || "idle"),
    progress: Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : Number(fallback.progress || 0),
    logs: Array.isArray(item.logs) ? item.logs.slice(-200).map((line) => String(line)) : (Array.isArray(fallback.logs) ? fallback.logs : []),
    result: item.result && typeof item.result === "object" ? item.result : (fallback.result || null),
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : (fallback.updatedAt || ""),
  };
}

function normalizeStepStatesMap(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    "plane-mapping": normalizeStepState(input["plane-mapping"], DEFAULT_STEP_STATES["plane-mapping"]),
    "ground-plane": normalizeStepState(input["ground-plane"], DEFAULT_STEP_STATES["ground-plane"]),
    "z-mapping": normalizeStepState(input["z-mapping"], DEFAULT_STEP_STATES["z-mapping"]),
    "dlt-mapping": normalizeStepState(input["dlt-mapping"], DEFAULT_STEP_STATES["dlt-mapping"]),
    "sfm-mapping": normalizeStepState(input["sfm-mapping"], DEFAULT_STEP_STATES["sfm-mapping"]),
    validation: normalizeStepState(input.validation, DEFAULT_STEP_STATES.validation),
  };
}

export function CalibrationProvider({ children, projectId, cameraId }) {
  // Project & Camera State
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectConfigPath, setProjectConfigPath] = useState("");
  const [loadedProjectId, setLoadedProjectId] = useState(projectId || "");
  const [projectCameras, setProjectCameras] = useState([]);
  const [activeProjectCameraId, setActiveProjectCameraId] = useState(cameraId || "");
  const [cameraWorkspaces, setCameraWorkspaces] = useState({});

  // Feed State
  const [feedEnabled, setFeedEnabled] = useState(false);
  const [liveFeedSrc, setLiveFeedSrc] = useState("");
  const [feedError, setFeedError] = useState("");
  const [snapshotDataUrl, setSnapshotDataUrl] = useState("");

  // Intrinsic Calibration State
  const [intrinsicSessionId, setIntrinsicSessionId] = useState("");
  const [checkerboard, setCheckerboard] = useState("9x6");
  const [squareSize, setSquareSize] = useState(0.024);
  const [checkerboardSquareMm, setCheckerboardSquareMm] = useState("");
  const [minSamples, setMinSamples] = useState(18);
  const [intrinsicSamples, setIntrinsicSamples] = useState([]);
  const [intrinsicActiveIndex, setIntrinsicActiveIndex] = useState(0);
  const [intrinsicsPath, setIntrinsicsPath] = useState("");
  const [intrinsicSolveResult, setIntrinsicSolveResult] = useState(null);

  // Plane Mapping & Z-Direction State
  const [imagePickMode, setImagePickMode] = useState(null);
  const [correspondences, setCorrespondences] = useState([]);
  const [zMappings, setZMappings] = useState([]);
  const [pendingZGroundIndex, setPendingZGroundIndex] = useState(null);
  const [pendingZImageTip, setPendingZImageTip] = useState(null);
  const [pendingImagePoint, setPendingImagePoint] = useState(null);
  const [snapshotNaturalSize, setSnapshotNaturalSize] = useState({ w: 0, h: 0 });

  // Ground Plane State
  const [validationPairs, setValidationPairs] = useState([]);
  const [manualWorldInput, setManualWorldInput] = useState("");
  const [groundMappingModes, setGroundMappingModes] = useState({});

  // Auto Ground Detection State
  const [autoGroundDetections, setAutoGroundDetections] = useState([]);
  const [autoGroundSuggestions, setAutoGroundSuggestions] = useState([]);
  const [autoGroundStatus, setAutoGroundStatus] = useState("idle");
  const [autoGroundLoading, setAutoGroundLoading] = useState(false);
  const [autoGroundLogs, setAutoGroundLogs] = useState([]);
  const [autoGroundImageSize, setAutoGroundImageSize] = useState(null);
  const [autoGroundModelInfo, setAutoGroundModelInfo] = useState({ model: "", weights: "" });
  const [pendingAutoGroundIndex, setPendingAutoGroundIndex] = useState(null);

  // Human Pose Detection State (for Plane Mapping)
  const [humanPoseDetections, setHumanPoseDetections] = useState([]);
  const [poseGroundPlaneEstimate, setPoseGroundPlaneEstimate] = useState(null);
  const [poseLoading, setPoseLoading] = useState(false);

  // Multi-Camera Sync State
  const [syncedMatchFrames, setSyncedMatchFrames] = useState([]);
  const [syncedFrameIndex, setSyncedFrameIndex] = useState(0);
  const [liveKeypointsDebug, setLiveKeypointsDebug] = useState({ count: 0, source: "" });

  // Job & Sequence State
  const [currentJobId, setCurrentJobId] = useState(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [sequenceRunning, setSequenceRunning] = useState(false);
  const [stageOutputs, setStageOutputs] = useState({
    intrinsic: null,
    "plane-mapping": null,
    "ground-plane": null,
    "z-mapping": null,
    "dlt-mapping": null,
    "sfm-mapping": null,
    validation: null,
  });
  const [stepStates, setStepStates] = useState(DEFAULT_STEP_STATES);

  // Refs
  const intrinsicVideoRef = useRef(null);
  const hydratedRef = useRef(false);
  const saveTimeoutRef = useRef(null);

  // Helper: Get active camera
  const getActiveCamera = useCallback(() => {
    return projectCameras.find((c) => String(c.id) === String(activeProjectCameraId));
  }, [projectCameras, activeProjectCameraId]);

  // Helper: Get active camera workspace
  const getActiveCameraWorkspace = useCallback(() => {
    return cameraWorkspaces[activeProjectCameraId] || {};
  }, [cameraWorkspaces, activeProjectCameraId]);

  // Helper: Update stage output
  const setStageOutput = useCallback((stage, data) => {
    setStageOutputs((prev) => ({ ...prev, [stage]: data }));
  }, []);

  const setStepState = useCallback((stage, patch) => {
    if (!stage || typeof stage !== "string" || !patch || typeof patch !== "object") {
      return;
    }
    setStepStates((prev) => {
      const base = prev?.[stage] && typeof prev[stage] === "object"
        ? prev[stage]
        : DEFAULT_STEP_STATES[stage] || { status: "idle", progress: 0, logs: [], result: null, updatedAt: "" };
      const merged = {
        ...base,
        ...patch,
        updatedAt: patch.updatedAt || new Date().toISOString(),
      };
      return {
        ...prev,
        [stage]: normalizeStepState(merged, base),
      };
    });
  }, []);

  // Helper: Clear feed error
  const clearFeedError = useCallback(() => setFeedError(""), []);

  // Helper: Update camera workspace
  const updateCameraWorkspace = useCallback((cameraId, updates) => {
    setCameraWorkspaces((prev) => ({
      ...prev,
      [cameraId]: { ...prev[cameraId], ...updates },
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const pid = String(projectId || "").trim();
    const cid = String(cameraId || "").trim();
    if (!pid || !cid) {
      hydratedRef.current = true;
      return;
    }

    const hydrate = async () => {
      try {
        const response = await fetch(`/api/calibration/web/projects/${encodeURIComponent(pid)}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data?.projectConfig || cancelled) {
          hydratedRef.current = true;
          return;
        }
        const projectConfig = data.projectConfig;
        const workspaceMap = projectConfig?.cameraWorkspaces && typeof projectConfig.cameraWorkspaces === "object"
          ? projectConfig.cameraWorkspaces
          : {};
        const workspace = workspaceMap[cid] && typeof workspaceMap[cid] === "object" ? workspaceMap[cid] : {};

        setLoadedProjectId(projectConfig.projectId || pid);
        setProjectName(projectConfig.projectName || "");
        setProjectDescription(projectConfig.projectDescription || "");
        setProjectConfigPath(data.outputPath || "");
        setProjectCameras(Array.isArray(projectConfig.cameras) ? projectConfig.cameras : []);
        setActiveProjectCameraId(cid);
        setCameraWorkspaces(workspaceMap);

        if (Array.isArray(workspace.correspondences)) {
          setCorrespondences(workspace.correspondences);
        }
        if (Array.isArray(workspace.validationPairs)) {
          setValidationPairs(workspace.validationPairs);
        }
        if (Array.isArray(workspace.zMappings)) {
          setZMappings(workspace.zMappings);
        }
        if (typeof workspace.snapshotDataUrl === "string") {
          setSnapshotDataUrl(workspace.snapshotDataUrl);
        }

        setStageOutputs((prev) => ({
          ...prev,
          ...(workspace.stageOutputs && typeof workspace.stageOutputs === "object" ? workspace.stageOutputs : {}),
        }));
        setStepStates(normalizeStepStatesMap(workspace.stepStates));
      } catch {
        // no-op: keep in-memory defaults
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
        }
      }
    };

    hydratedRef.current = false;
    hydrate();

    return () => {
      cancelled = true;
    };
  }, [projectId, cameraId]);

  useEffect(() => {
    const pid = String(projectId || "").trim();
    const cid = String(cameraId || "").trim();
    if (!pid || !cid || !hydratedRef.current) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/calibration/web/projects/${encodeURIComponent(pid)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cameraId: cid,
            workspacePatch: {
              correspondences,
              validationPairs,
              zMappings,
              snapshotDataUrl,
              stageOutputs,
              stepStates,
              lastStateSavedAt: new Date().toISOString(),
            },
          }),
        });
      } catch {
        // no-op: keep working locally; next save attempt will retry
      }
    }, 900);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [projectId, cameraId, stageOutputs, stepStates, correspondences, validationPairs, zMappings, snapshotDataUrl]);

  const value = {
    // Project & Camera
    projectName,
    setProjectName,
    projectDescription,
    setProjectDescription,
    projectConfigPath,
    setProjectConfigPath,
    loadedProjectId,
    setLoadedProjectId,
    projectCameras,
    setProjectCameras,
    activeProjectCameraId,
    setActiveProjectCameraId,
    cameraWorkspaces,
    setCameraWorkspaces,
    updateCameraWorkspace,
    getActiveCamera,
    getActiveCameraWorkspace,

    // Feed
    feedEnabled,
    setFeedEnabled,
    liveFeedSrc,
    setLiveFeedSrc,
    feedError,
    setFeedError,
    clearFeedError,
    snapshotDataUrl,
    setSnapshotDataUrl,

    // Intrinsic
    intrinsicSessionId,
    setIntrinsicSessionId,
    checkerboard,
    setCheckerboard,
    squareSize,
    setSquareSize,
    checkerboardSquareMm,
    setCheckerboardSquareMm,
    minSamples,
    setMinSamples,
    intrinsicSamples,
    setIntrinsicSamples,
    intrinsicActiveIndex,
    setIntrinsicActiveIndex,
    intrinsicsPath,
    setIntrinsicsPath,
    intrinsicSolveResult,
    setIntrinsicSolveResult,

    // Plane Mapping & Z
    imagePickMode,
    setImagePickMode,
    correspondences,
    setCorrespondences,
    zMappings,
    setZMappings,
    pendingZGroundIndex,
    setPendingZGroundIndex,
    pendingZImageTip,
    setPendingZImageTip,
    pendingImagePoint,
    setPendingImagePoint,
    snapshotNaturalSize,
    setSnapshotNaturalSize,

    // Ground Plane
    validationPairs,
    setValidationPairs,
    manualWorldInput,
    setManualWorldInput,
    groundMappingModes,
    setGroundMappingModes,

    // Auto Ground Detection
    autoGroundDetections,
    setAutoGroundDetections,
    autoGroundSuggestions,
    setAutoGroundSuggestions,
    autoGroundStatus,
    setAutoGroundStatus,
    autoGroundLoading,
    setAutoGroundLoading,
    autoGroundLogs,
    setAutoGroundLogs,
    autoGroundImageSize,
    setAutoGroundImageSize,
    autoGroundModelInfo,
    setAutoGroundModelInfo,
    pendingAutoGroundIndex,
    setPendingAutoGroundIndex,

    // Human Pose
    humanPoseDetections,
    setHumanPoseDetections,
    poseGroundPlaneEstimate,
    setPoseGroundPlaneEstimate,
    poseLoading,
    setPoseLoading,

    // Multi-Camera Sync
    syncedMatchFrames,
    setSyncedMatchFrames,
    syncedFrameIndex,
    setSyncedFrameIndex,
    liveKeypointsDebug,
    setLiveKeypointsDebug,

    // Job & Sequence
    currentJobId,
    setCurrentJobId,
    jobLoading,
    setJobLoading,
    sequenceRunning,
    setSequenceRunning,
    stageOutputs,
    setStageOutputs,
    setStageOutput,
    stepStates,
    setStepStates,
    setStepState,

    // Refs
    intrinsicVideoRef,
  };

  return (
    <CalibrationContext.Provider value={value}>
      {children}
    </CalibrationContext.Provider>
  );
}

export function useCalibration() {
  const context = useContext(CalibrationContext);
  if (!context) {
    throw new Error("useCalibration must be used within <CalibrationProvider>");
  }
  return context;
}
