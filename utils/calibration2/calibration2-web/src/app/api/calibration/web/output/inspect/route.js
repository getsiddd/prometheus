import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { isBinaryOutputPath, readOutputTextPreview, resolveAllowedOutputPath } from "@/lib/server/outputFiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();
    const inputPath = body?.path || "";
    const resolvedPath = resolveAllowedOutputPath(inputPath);
    const stat = await fs.stat(resolvedPath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Requested path is not a file" }, { status: 400 });
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const fileName = path.basename(resolvedPath);
    const binary = isBinaryOutputPath(resolvedPath);

    if (binary) {
      return NextResponse.json({
        ok: true,
        path: resolvedPath,
        fileName,
        extension: ext,
        sizeBytes: stat.size,
        isBinary: true,
        textPreview: "",
        previewJson: null,
        truncated: false,
      });
    }

    const { textPreview, truncated } = await readOutputTextPreview(resolvedPath);
    let previewJson = null;
    if (ext === ".json") {
      try {
        previewJson = JSON.parse(textPreview);
      } catch {
        previewJson = null;
      }
    }

    return NextResponse.json({
      ok: true,
      path: resolvedPath,
      fileName,
      extension: ext,
      sizeBytes: stat.size,
      isBinary: false,
      textPreview,
      previewJson,
      truncated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to inspect output file";
    if (/ENOENT|no such file or directory/i.test(message)) {
      return NextResponse.json(
        { error: "Output file not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}