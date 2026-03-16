import { NextResponse } from "next/server";
import {
  deleteProjectById,
  normalizeProjectConfig,
  readProjectById,
  saveProjectById,
} from "@/lib/server/projectStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function extractProjectId(params) {
  const resolvedParams = await params;
  return String(resolvedParams?.projectId || "").trim();
}

function mergeProjectPatch(baseConfig, patchPayload) {
  if (!isObject(patchPayload)) {
    return baseConfig;
  }

  const nextConfig = { ...baseConfig };

  if (typeof patchPayload.projectName === "string") {
    nextConfig.projectName = patchPayload.projectName;
  }
  if (typeof patchPayload.projectDescription === "string") {
    nextConfig.projectDescription = patchPayload.projectDescription;
  }
  if (typeof patchPayload.sharedDwgPath === "string") {
    nextConfig.sharedDwgPath = patchPayload.sharedDwgPath;
  }
  if (typeof patchPayload.sharedDwgFileName === "string") {
    nextConfig.sharedDwgFileName = patchPayload.sharedDwgFileName;
  }
  if (typeof patchPayload.activeProjectCameraId === "string") {
    nextConfig.activeProjectCameraId = patchPayload.activeProjectCameraId;
  }

  if (Array.isArray(patchPayload.cameras)) {
    nextConfig.cameras = patchPayload.cameras;
  }

  if (Array.isArray(patchPayload.sharedMarkers)) {
    nextConfig.sharedMarkers = patchPayload.sharedMarkers;
  }

  if (isObject(patchPayload.cameraWorkspaces)) {
    nextConfig.cameraWorkspaces = {
      ...(isObject(nextConfig.cameraWorkspaces) ? nextConfig.cameraWorkspaces : {}),
      ...patchPayload.cameraWorkspaces,
    };
  }

  if (typeof patchPayload.cameraId === "string" && patchPayload.cameraId.trim()) {
    const cameraId = patchPayload.cameraId.trim();

    if (isObject(patchPayload.cameraPatch) && Array.isArray(nextConfig.cameras)) {
      nextConfig.cameras = nextConfig.cameras.map((camera) =>
        camera && camera.id === cameraId
          ? {
              ...camera,
              ...patchPayload.cameraPatch,
            }
          : camera
      );
    }

    const workspacePatch = isObject(patchPayload.workspacePatch)
      ? patchPayload.workspacePatch
      : isObject(patchPayload.workspace)
        ? patchPayload.workspace
        : null;

    if (workspacePatch) {
      nextConfig.cameraWorkspaces = {
        ...(isObject(nextConfig.cameraWorkspaces) ? nextConfig.cameraWorkspaces : {}),
        [cameraId]: {
          ...(isObject(nextConfig.cameraWorkspaces?.[cameraId]) ? nextConfig.cameraWorkspaces[cameraId] : {}),
          ...workspacePatch,
        },
      };
    }
  }

  return nextConfig;
}

export async function GET(_req, { params }) {
  try {
    const projectId = await extractProjectId(params);
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const loaded = await readProjectById(projectId);
    return NextResponse.json({
      ok: true,
      projectId: loaded.projectConfig.projectId,
      outputPath: loaded.outputPath,
      projectConfig: loaded.projectConfig,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load project" },
      { status: 404 }
    );
  }
}

async function upsertProject(req, params) {
  const projectId = await extractProjectId(params);
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  try {
    const payload = await req.json();

    const mergedConfig =
      payload && typeof payload === "object" && isObject(payload.projectConfig)
        ? payload.projectConfig
        : mergeProjectPatch((await readProjectById(projectId)).projectConfig, payload);

    const projectConfig = {
      ...normalizeProjectConfig(mergedConfig, { projectIdHint: projectId }),
      updatedAt: new Date().toISOString(),
    };

    const saved = await saveProjectById(projectId, projectConfig);

    return NextResponse.json({
      ok: true,
      projectId: projectConfig.projectId,
      outputPath: saved.outputPath,
      projectConfig: saved.projectConfig,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save project" },
      { status: 400 }
    );
  }
}

export async function POST(req, { params }) {
  return upsertProject(req, params);
}

export async function PUT(req, { params }) {
  return upsertProject(req, params);
}

export async function PATCH(req, { params }) {
  return upsertProject(req, params);
}

export async function DELETE(_req, { params }) {
  const projectId = await extractProjectId(params);
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  try {
    const deleted = await deleteProjectById(projectId);
    return NextResponse.json({
      ok: true,
      projectId: deleted.projectId,
      outputPath: deleted.outputPath,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete project" },
      { status: 404 }
    );
  }
}
