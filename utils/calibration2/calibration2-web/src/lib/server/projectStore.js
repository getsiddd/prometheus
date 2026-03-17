import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_COMPLETED_STAGES = {
  intrinsic: false,
  "ground-plane": false,
  "z-mapping": false,
  "dlt-mapping": false,
  validation: false,
  "cad-3d-dwg": false,
  extrinsic: false,
  sfm: false,
  overlay: false,
};

const DEFAULT_STEP_STATES = {
  "plane-mapping": { status: "idle", progress: 0, logs: [], result: null, updatedAt: "" },
  "ground-plane": { status: "idle", progress: 0, logs: [], result: null, updatedAt: "" },
  "z-mapping": { status: "idle", progress: 0, logs: [], result: null, updatedAt: "" },
  "dlt-mapping": { status: "idle", progress: 0, logs: [], result: null, updatedAt: "" },
  "sfm-mapping": { status: "idle", progress: 0, logs: [], result: null, updatedAt: "" },
  validation: { status: "idle", progress: 0, logs: [], result: null, updatedAt: "" },
};

function normalizeStepStateItem(item) {
  if (!item || typeof item !== "object") {
    return { status: "idle", progress: 0, logs: [], result: null, updatedAt: "" };
  }
  const progress = Number(item.progress);
  return {
    status: typeof item.status === "string" ? item.status : "idle",
    progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0,
    logs: Array.isArray(item.logs) ? item.logs.slice(-200).map((entry) => String(entry)) : [],
    result: item.result && typeof item.result === "object" ? item.result : null,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
  };
}

function normalizeStepStatesMap(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    "plane-mapping": normalizeStepStateItem(input["plane-mapping"]),
    "ground-plane": normalizeStepStateItem(input["ground-plane"]),
    "z-mapping": normalizeStepStateItem(input["z-mapping"]),
    "dlt-mapping": normalizeStepStateItem(input["dlt-mapping"]),
    "sfm-mapping": normalizeStepStateItem(input["sfm-mapping"]),
    validation: normalizeStepStateItem(input.validation),
  };
}

function projectsDir() {
  return path.join(process.cwd(), "uploads", "projects");
}

export function slugify(input, fallback = "item") {
  const v = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return v || fallback;
}

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSharedMarkers(markers) {
  if (!Array.isArray(markers)) {
    return [];
  }

  const used = new Set();
  const out = [];
  for (let i = 0; i < markers.length; i += 1) {
    const item = markers[i];
    if (!item || typeof item !== "object") {
      continue;
    }

    const baseId = slugify(item.id || item.markerId || `m${i + 1}`, `m${i + 1}`);
    let markerId = baseId;
    let k = 2;
    while (used.has(markerId)) {
      markerId = `${baseId}-${k}`;
      k += 1;
    }
    used.add(markerId);

    const worldRaw = Array.isArray(item.world) && item.world.length === 3 ? item.world : null;
    const world = worldRaw
      ? [Number(worldRaw[0]) || 0, Number(worldRaw[1]) || 0, Number(worldRaw[2]) || 0]
      : undefined;

    out.push({
      id: markerId,
      world,
      observations: typeof item.observations === "object" && item.observations ? item.observations : {},
    });
  }

  return out;
}

function normalizeCorrespondences(correspondences) {
  if (!Array.isArray(correspondences)) {
    return [];
  }

  const out = [];
  for (let i = 0; i < correspondences.length; i += 1) {
    const item = correspondences[i];
    if (!item || typeof item !== "object") {
      continue;
    }

    const world = Array.isArray(item.world) && item.world.length === 3
      ? [Number(item.world[0]) || 0, Number(item.world[1]) || 0, Number(item.world[2]) || 0]
      : null;
    const pixel = Array.isArray(item.pixel) && item.pixel.length === 2
      ? [Number(item.pixel[0]) || 0, Number(item.pixel[1]) || 0]
      : null;

    if (!world || !pixel) {
      continue;
    }

    out.push({
      markerId: String(item.markerId || `m${i + 1}`),
      world,
      pixel,
    });
  }

  return out;
}

function normalizeCameraList(cameraList, sharedDwgPath, sharedDwgFileName) {
  const usedCameraIds = new Set();

  return cameraList.map((cam, index) => {
    const cameraName = String(cam?.name || cam?.label || `Camera ${index + 1}`);
    const baseId = slugify(cam?.id || cam?.cameraId || cameraName, `cam-${index + 1}`);

    let cameraId = baseId;
    let k = 2;
    while (usedCameraIds.has(cameraId)) {
      cameraId = `${baseId}-${k}`;
      k += 1;
    }
    usedCameraIds.add(cameraId);

    const location = String(cam?.location || cam?.area || "");

    return {
      id: cameraId,
      name: cameraName,
      location,
      area: location,
      cameraType: String(cam?.cameraType || "cctv"),
      sourceMode: String(cam?.sourceMode || "rtsp"),
      sourceUrl: String(cam?.sourceUrl || ""),
      dwgPath: sharedDwgPath,
      dwgFileName: sharedDwgFileName,
      intrinsicsPath: String(cam?.intrinsicsPath || ""),
      checkerboard: String(cam?.checkerboard || "9x6"),
      squareSize: asNumber(cam?.squareSize, 0.024),
      minSamples: asNumber(cam?.minSamples, 18),
    };
  });
}

function normalizeWorkspaceMap(rawWorkspaces, cameras, sharedDwgPath, sharedDwgFileName) {
  const source = rawWorkspaces && typeof rawWorkspaces === "object" ? rawWorkspaces : {};
  const out = {};

  for (const camera of cameras) {
    const workspace = source[camera.id] && typeof source[camera.id] === "object" ? source[camera.id] : {};

    out[camera.id] = {
      cameraType: String(workspace.cameraType || camera.cameraType || "cctv"),
      sourceMode: String(workspace.sourceMode || camera.sourceMode || "rtsp"),
      sourceUrl: String(workspace.sourceUrl || camera.sourceUrl || ""),
      checkerboard: String(workspace.checkerboard || camera.checkerboard || "9x6"),
      squareSize: asNumber(workspace.squareSize ?? camera.squareSize, 0.024),
      minSamples: asNumber(workspace.minSamples ?? camera.minSamples, 18),
      dwgPath: sharedDwgPath,
      dwgFileName: sharedDwgFileName,
      intrinsicsPath: String(workspace.intrinsicsPath || camera.intrinsicsPath || ""),
      correspondences: normalizeCorrespondences(workspace.correspondences),
      zMappings: Array.isArray(workspace.zMappings) ? workspace.zMappings : [],
      validationPairs: Array.isArray(workspace.validationPairs) ? workspace.validationPairs : [],
      snapshotDataUrl: typeof workspace.snapshotDataUrl === "string" ? workspace.snapshotDataUrl : "",
      snapshotPath: typeof workspace.snapshotPath === "string" ? workspace.snapshotPath : "",
      segments: Array.isArray(workspace.segments) ? workspace.segments : [],
      stepStates: normalizeStepStatesMap(workspace.stepStates),
      stageOutputs: workspace.stageOutputs && typeof workspace.stageOutputs === "object" ? workspace.stageOutputs : {},
      stageResolvedOutputs:
        workspace.stageResolvedOutputs && typeof workspace.stageResolvedOutputs === "object" ? workspace.stageResolvedOutputs : {},
      completedStages:
        workspace.completedStages && typeof workspace.completedStages === "object"
          ? { ...DEFAULT_COMPLETED_STAGES, ...workspace.completedStages }
          : { ...DEFAULT_COMPLETED_STAGES },
      latestCalibrationYamlPath:
        typeof workspace.latestCalibrationYamlPath === "string" ? workspace.latestCalibrationYamlPath : "",
    };
  }

  return out;
}

export function inferProjectIdFromPath(filePath, fallbackName = "project") {
  const base = path.basename(String(filePath || ""), path.extname(String(filePath || "")));
  return slugify(base || fallbackName, "project");
}

export function normalizeProjectConfig(raw, options = {}) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Project config must be a JSON object");
  }

  const cameraList = Array.isArray(raw.cameras) ? raw.cameras : [];
  if (cameraList.length < 1) {
    throw new Error("Project config must contain at least one camera in 'cameras'");
  }

  const firstCameraDwgPath = String(cameraList.find((cam) => cam?.dwgPath)?.dwgPath || "");
  const firstCameraDwgFileName = String(cameraList.find((cam) => cam?.dwgFileName)?.dwgFileName || "");
  const sharedDwgPath = String(raw.sharedDwgPath || raw.dwgPath || firstCameraDwgPath || "");
  const sharedDwgFileName = String(
    raw.sharedDwgFileName ||
      raw.dwgFileName ||
      firstCameraDwgFileName ||
      (sharedDwgPath ? path.basename(sharedDwgPath) : "")
  );

  const projectName = String(raw.projectName || raw.name || "multi-camera-project");
  const projectId = slugify(
    options.projectIdHint || raw.projectId || raw.id || `${projectName}-${Date.now()}`,
    `project-${Date.now()}`,
  );

  const cameras = normalizeCameraList(cameraList, sharedDwgPath, sharedDwgFileName);
  const workspaceInput =
    raw.cameraWorkspaces && typeof raw.cameraWorkspaces === "object"
      ? raw.cameraWorkspaces
      : raw.workspaces && typeof raw.workspaces === "object"
        ? raw.workspaces
        : {};
  const cameraWorkspaces = normalizeWorkspaceMap(workspaceInput, cameras, sharedDwgPath, sharedDwgFileName);

  const requestedActiveCameraId = String(raw.activeProjectCameraId || raw.lastActiveCameraId || "");
  const activeProjectCameraId =
    cameras.find((camera) => camera.id === requestedActiveCameraId)?.id || cameras[0].id;

  return {
    schemaVersion: 2,
    projectId,
    projectName,
    projectDescription: String(raw.projectDescription || raw.description || ""),
    sharedDwgPath,
    sharedDwgFileName,
    cameras,
    sharedMarkers: normalizeSharedMarkers(raw.sharedMarkers),
    cameraWorkspaces,
    activeProjectCameraId,
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
  };
}

export function projectPathById(projectId) {
  return path.join(projectsDir(), `${slugify(projectId, "project")}.json`);
}

export async function saveNormalizedProjectConfig(config, options = {}) {
  const forcedPath = options.outputPath ? path.resolve(options.outputPath) : "";
  const outputPath = forcedPath || projectPathById(config.projectId);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(config, null, 2), "utf-8");
  return outputPath;
}

export async function readProjectByPath(projectPath) {
  const raw = JSON.parse(await fs.readFile(projectPath, "utf-8"));
  const projectIdHint = inferProjectIdFromPath(projectPath, raw?.projectName || "project");
  const config = normalizeProjectConfig(raw, { projectIdHint });
  return {
    projectConfig: config,
    outputPath: path.resolve(projectPath),
  };
}

export async function readProjectById(projectId) {
  const filePath = projectPathById(projectId);
  const loaded = await readProjectByPath(filePath);
  if (loaded.projectConfig.projectId !== slugify(projectId, "project")) {
    loaded.projectConfig.projectId = slugify(projectId, "project");
  }
  return loaded;
}

export async function saveProjectById(projectId, rawConfig) {
  const normalized = normalizeProjectConfig(rawConfig, { projectIdHint: projectId });
  const outputPath = await saveNormalizedProjectConfig(normalized, { outputPath: projectPathById(projectId) });
  return {
    projectConfig: normalized,
    outputPath,
  };
}

export async function deleteProjectById(projectId) {
  const outputPath = projectPathById(projectId);
  await fs.unlink(outputPath);
  return {
    projectId: slugify(projectId, "project"),
    outputPath,
  };
}

function cameraSummary(camera, workspace = {}) {
  const completed = workspace.completedStages || {};
  const calibrationDone = Boolean(workspace.latestCalibrationYamlPath || completed.extrinsic);
  const validationDone = Array.isArray(workspace.validationPairs) && workspace.validationPairs.length > 0;
  const allRequiredStages = ["intrinsic", "ground-plane", "z-mapping", "cad-3d-dwg", "extrinsic"];
  const allDone = allRequiredStages.every((stage) => Boolean(completed[stage]));

  return {
    id: camera.id,
    name: camera.name,
    location: camera.location || camera.area || "",
    calibrationDone,
    validationDone,
    allDone,
  };
}

export async function listProjectsSummary() {
  await fs.mkdir(projectsDir(), { recursive: true });
  const names = await fs.readdir(projectsDir());
  const jsonFiles = names.filter((name) => name.toLowerCase().endsWith(".json"));

  const results = [];
  for (const name of jsonFiles) {
    try {
      const fullPath = path.join(projectsDir(), name);
      const loaded = await readProjectByPath(fullPath);
      const cfg = loaded.projectConfig;
      const workspaceMap = cfg.cameraWorkspaces || {};

      const cameraStatuses = (cfg.cameras || []).map((camera) => cameraSummary(camera, workspaceMap[camera.id] || {}));
      const doneCount = cameraStatuses.filter((camera) => camera.allDone).length;

      results.push({
        projectId: cfg.projectId,
        projectName: cfg.projectName,
        projectDescription: cfg.projectDescription || "",
        cameraCount: cfg.cameras?.length || 0,
        completedCameraCount: doneCount,
        updatedAt: cfg.updatedAt || "",
        outputPath: loaded.outputPath,
        sharedDwgPath: cfg.sharedDwgPath || "",
        cameraStatuses,
      });
    } catch {
      // skip unreadable files
    }
  }

  results.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return results;
}
