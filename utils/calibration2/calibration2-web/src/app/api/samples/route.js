import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { parseAsciiDxfLines } from "@/lib/dxf-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sampleDwgPath = path.resolve(process.cwd(), "..", "samples", "simple_floor_3d.dwg");
  const sampleVideoPath = path.resolve(process.cwd(), "..", "..", "..", "..", "fire_video.mp4");

  let dwgExists = false;
  let videoExists = false;
  let segments = [];

  try {
    await fs.access(sampleDwgPath);
    dwgExists = true;
    const content = await fs.readFile(sampleDwgPath, "utf8");
    segments = parseAsciiDxfLines(content);
  } catch {
    dwgExists = false;
  }

  try {
    await fs.access(sampleVideoPath);
    videoExists = true;
  } catch {
    videoExists = false;
  }

  return NextResponse.json({
    ok: true,
    sample: {
      dwgPath: sampleDwgPath,
      sourceUrl: sampleVideoPath,
      dwgExists,
      videoExists,
      preview: {
        segmentCount: segments.length,
        segments,
      },
      intrinsicDefaults: {
        checkerboard: "9x6",
        squareSize: 0.024,
        minSamples: 18,
      },
    },
  });
}
