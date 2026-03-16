import { NextResponse } from "next/server";
import {
  inferProjectIdFromPath,
  normalizeProjectConfig,
  readProjectByPath,
  saveNormalizedProjectConfig,
} from "@/lib/server/projectStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const projectPath = searchParams.get("path") || "";
    if (!projectPath) {
      return NextResponse.json({ error: "path query parameter is required" }, { status: 400 });
    }

    const loaded = await readProjectByPath(projectPath);

    return NextResponse.json({ ok: true, outputPath: loaded.outputPath, projectConfig: loaded.projectConfig });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to open project config" }, { status: 400 });
  }
}

export async function POST(req) {
  try {
    let rawConfig = null;
    let requestedOutputPath = "";
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const outputPathArg = form.get("outputPath");
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "Project config file is required" }, { status: 400 });
      }
      if (typeof outputPathArg === "string") {
        requestedOutputPath = outputPathArg.trim();
      }
      const text = await file.text();
      rawConfig = JSON.parse(text);
    } else {
      const body = await req.json();
      rawConfig = body?.projectConfig || body;
      if (typeof body?.outputPath === "string") {
        requestedOutputPath = body.outputPath.trim();
      }
    }

    const projectIdHint = requestedOutputPath ? inferProjectIdFromPath(requestedOutputPath) : undefined;
    const projectConfig = {
      ...normalizeProjectConfig(rawConfig, { projectIdHint }),
      updatedAt: new Date().toISOString(),
    };
    const outputPath = await saveNormalizedProjectConfig(projectConfig, { outputPath: requestedOutputPath });

    return NextResponse.json({
      ok: true,
      outputPath,
      projectConfig,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to upload project config" }, { status: 400 });
  }
}
