import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { parseAsciiDxfLines } from "@/lib/dxf-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isInside(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  return child === parent || child.startsWith(`${parent}${path.sep}`);
}

export async function POST(req) {
  try {
    const body = await req.json();
    const rawPath = String(body?.path || "").trim();
    if (!rawPath) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    const resolvedPath = path.resolve(rawPath);
    const uploadsRoot = path.resolve(process.cwd(), "uploads");
    if (!isInside(uploadsRoot, resolvedPath)) {
      return NextResponse.json({ error: "path must be inside uploads directory" }, { status: 400 });
    }

    await fs.access(resolvedPath);
    const bytes = await fs.readFile(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();

    const textContent = bytes.toString("utf8");
    const parsedSegments = parseAsciiDxfLines(textContent);

    if (ext === ".dxf" || parsedSegments.length > 0) {
      const formatNote = ext === ".dxf" ? "DXF" : ext === ".dwg" ? "DWG(ASCII-like)" : "text-CAD";

      return NextResponse.json({
        ok: true,
        fileName: path.basename(resolvedPath),
        path: resolvedPath,
        kind: ext.replace(".", "") || "cad",
        preview: {
          segmentCount: parsedSegments.length,
          segments: parsedSegments,
        },
        note: `${formatNote} loaded from saved project CAD path.`,
      });
    }

    return NextResponse.json({
      ok: true,
      fileName: path.basename(resolvedPath),
      path: resolvedPath,
      kind: ext.replace(".", "") || "unknown",
      preview: {
        segmentCount: 0,
        segments: [],
      },
      note: "Shared CAD path loaded (preview unavailable for this format).",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load CAD preview" },
      { status: 400 }
    );
  }
}
