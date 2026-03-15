import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { parseAsciiDxfLines } from "@/lib/dxf-parser";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "dwg");

export async function POST(req) {
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const safeName = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
  const savePath = path.join(UPLOAD_DIR, safeName);

  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(savePath, bytes);

  const ext = path.extname(file.name).toLowerCase();

  const textContent = bytes.toString("utf8");
  const parsedSegments = parseAsciiDxfLines(textContent);

  if (ext === ".dxf" || parsedSegments.length > 0) {
    const formatNote = ext === ".dxf" ? "DXF" : ext === ".dwg" ? "DWG(ASCII-like)" : "text-CAD";

    return NextResponse.json({
      ok: true,
      fileName: file.name,
      savedAs: safeName,
      path: savePath,
      kind: ext.replace(".", "") || "cad",
      preview: {
        segmentCount: parsedSegments.length,
        segments: parsedSegments,
      },
      note: `${formatNote} parsed for lightweight 3D preview.`,
    });
  }

  return NextResponse.json({
    ok: true,
    fileName: file.name,
    savedAs: safeName,
    path: savePath,
    kind: ext.replace(".", "") || "unknown",
    preview: null,
    note: "DWG uploaded. For exact geometry extraction, call Python calibration2/ezdxf conversion backend.",
  });
}
