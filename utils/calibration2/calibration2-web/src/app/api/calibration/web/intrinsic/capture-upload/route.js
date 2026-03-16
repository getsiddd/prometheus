import fs from "node:fs/promises";
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
  if (comma === -1) {
    throw new Error("Invalid image data URL payload");
  }
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  const extMatch = header.match(/^data:image\/(png|jpeg|jpg);base64$/i);
  const ext = (extMatch?.[1] || "jpg").toLowerCase() === "jpeg" ? "jpg" : (extMatch?.[1] || "jpg").toLowerCase();
  return { ext, buffer: Buffer.from(payload, "base64") };
}

export async function POST(req) {
  try {
    const body = await req.json();
    const checkerboard = body?.checkerboard || "9x6";
    const sessionId = body?.sessionId || "default";
    const dataUrl = body?.imageDataUrl;

    const { ext, buffer } = parseDataUrl(dataUrl);
    const baseDir = path.join(process.cwd(), "uploads", "intrinsic", sessionId);
    await fs.mkdir(baseDir, { recursive: true });

    const imagePath = path.join(baseDir, `${Date.now()}-webcam.${ext}`);
    await fs.writeFile(imagePath, buffer);

    const script = path.resolve(process.cwd(), "..", "web_backend.py");
    const detect = await runPython([script, "intrinsic-detect", "--image", imagePath, "--checkerboard", checkerboard]);
    const parsed = parseLastJson(detect.out);
    const found = Boolean(parsed?.result?.found);

    if (!found) {
      await fs.rm(imagePath, { force: true });
    }

    const files = (await fs.readdir(baseDir)).filter((name) => /\.(jpg|jpeg|png|bmp)$/i.test(name));

    return NextResponse.json({
      ok: true,
      found,
      checkerboard,
      savedPath: found ? imagePath : null,
      sampleCount: files.length,
      snapshotDataUrl: dataUrl,
      detect: parsed,
      message: found
        ? "Checkerboard detected and webcam sample saved."
        : "Checkerboard not detected in webcam frame. Try angle/lighting.",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "webcam intrinsic capture failed" }, { status: 400 });
  }
}
