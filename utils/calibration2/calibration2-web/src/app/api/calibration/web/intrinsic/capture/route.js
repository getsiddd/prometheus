import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { parseLastJson, runPython } from "@/lib/server/pythonRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json();
  const sourceUrl = body?.sourceUrl;
  const checkerboard = body?.checkerboard || "9x6";
  const sessionId = body?.sessionId || "default";

  if (!sourceUrl) {
    return NextResponse.json({ error: "sourceUrl is required" }, { status: 400 });
  }

  const baseDir = path.join(process.cwd(), "uploads", "intrinsic", sessionId);
  await fs.mkdir(baseDir, { recursive: true });

  const imagePath = path.join(baseDir, `${Date.now()}.jpg`);

  const script = path.resolve(process.cwd(), "..", "web_backend.py");
  await runPython([script, "snapshot", "--source", sourceUrl, "--output", imagePath]);

  const detect = await runPython([script, "intrinsic-detect", "--image", imagePath, "--checkerboard", checkerboard]);
  const parsed = parseLastJson(detect.out);
  const found = Boolean(parsed?.result?.found);

  if (!found) {
    await fs.rm(imagePath, { force: true });
  }

  const files = (await fs.readdir(baseDir)).filter((name) => /\.(jpg|jpeg|png|bmp)$/i.test(name));

  const dataUrl = found
    ? `data:image/jpeg;base64,${(await fs.readFile(imagePath)).toString("base64")}`
    : null;

  return NextResponse.json({
    ok: true,
    found,
    checkerboard,
    savedPath: found ? imagePath : null,
    sampleCount: files.length,
    snapshotDataUrl: dataUrl,
    detect: parsed,
    message: found
      ? "Checkerboard detected and sample saved."
      : "Checkerboard not detected in this frame. Try better angle/lighting.",
  });
}
