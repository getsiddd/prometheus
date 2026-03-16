/**
 * POST /api/calibration/web/intrinsic/detect-live
 *
 * Accepts a base64 image data URL, runs checkerboard detection on it
 * (WITHOUT saving the image), and returns the found flag + corner pixels
 * for live overlay rendering in the browser.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";
import { parseLastJson, runPython } from "@/lib/server/pythonRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    throw new Error("Invalid image data URL");
  }
  const comma = dataUrl.indexOf(",");
  if (comma === -1) throw new Error("Malformed data URL");
  const header = dataUrl.slice(0, comma);
  const extMatch = header.match(/data:image\/(png|jpeg|jpg)/i);
  const ext = extMatch ? (extMatch[1].toLowerCase() === "jpeg" ? "jpg" : extMatch[1].toLowerCase()) : "jpg";
  return { ext, buffer: Buffer.from(dataUrl.slice(comma + 1), "base64") };
}

export async function POST(req) {
  let tmpPath = null;
  try {
    const body = await req.json();
    const checkerboard = body?.checkerboard || "9x6";
    const dataUrl = body?.imageDataUrl;
    if (!dataUrl) {
      return NextResponse.json({ error: "imageDataUrl is required" }, { status: 400 });
    }

    const { ext, buffer } = parseDataUrl(dataUrl);
    tmpPath = path.join(os.tmpdir(), `detect-live-${Date.now()}.${ext}`);
    await fs.writeFile(tmpPath, buffer);

    const script = path.resolve(process.cwd(), "..", "web_backend.py");
    const detect = await runPython([script, "intrinsic-detect", "--image", tmpPath, "--checkerboard", checkerboard]);
    const parsed = parseLastJson(detect.out);
    const result = parsed?.result || {};

    return NextResponse.json({
      ok: true,
      found: Boolean(result?.found),
      corners_px: Array.isArray(result?.corners_px) ? result.corners_px : [],
      image_width: result?.image_width ?? null,
      image_height: result?.image_height ?? null,
      corner_count: result?.corner_count ?? 0,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "detection failed" }, { status: 500 });
  } finally {
    if (tmpPath) {
      await fs.rm(tmpPath, { force: true }).catch(() => {});
    }
  }
}
