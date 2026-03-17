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
    const dataUrl = body?.imageDataUrl;
    const maxFeatures = Math.max(128, Number(body?.maxFeatures ?? 2000));
    const maxSide = Math.max(256, Number(body?.maxSide ?? 1280));

    if (!dataUrl) {
      return NextResponse.json({ error: "imageDataUrl is required" }, { status: 400 });
    }

    const { ext, buffer } = parseDataUrl(dataUrl);
    tmpPath = path.join(os.tmpdir(), `kp-extract-${Date.now()}.${ext}`);
    await fs.writeFile(tmpPath, buffer);

    const script = path.resolve(process.cwd(), "..", "web_backend.py");
    const executed = await runPython([
      script,
      "extract-keypoints",
      "--image", tmpPath,
      "--max-features", String(maxFeatures),
      "--max-side", String(maxSide),
    ]);

    const parsed = parseLastJson(executed.out);
    const result = parsed?.result || parsed;

    return NextResponse.json({ ok: true, result, python: executed.executable || null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Keypoint extraction failed" }, { status: 500 });
  } finally {
    if (tmpPath) {
      fs.unlink(tmpPath).catch(() => {});
    }
  }
}
