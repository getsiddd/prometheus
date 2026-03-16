import { NextResponse } from "next/server";
import {
  listProjectsSummary,
  normalizeProjectConfig,
  saveProjectById,
} from "@/lib/server/projectStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projects = await listProjectsSummary();
    return NextResponse.json({ ok: true, projects });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list projects" },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const payload = await req.json();
    const rawConfig =
      payload && typeof payload === "object" && payload.projectConfig && typeof payload.projectConfig === "object"
        ? payload.projectConfig
        : payload;

    const requestedProjectId =
      payload && typeof payload === "object" && typeof payload.projectId === "string" && payload.projectId.trim()
        ? payload.projectId.trim()
        : undefined;

    const projectConfig = {
      ...normalizeProjectConfig(rawConfig, { projectIdHint: requestedProjectId }),
      updatedAt: new Date().toISOString(),
    };

    const saved = await saveProjectById(projectConfig.projectId, projectConfig);

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
