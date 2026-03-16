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
  if (comma === -1) {
    throw new Error("Malformed data URL");
  }

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
    const maxSide = Math.max(256, Number(body?.maxSide ?? 960));
    const minPersonScore = Number(body?.minPersonScore ?? 0.65);
    const minKeypointScore = Number(body?.minKeypointScore ?? 0.35);

    if (!dataUrl) {
      return NextResponse.json({ error: "imageDataUrl is required" }, { status: 400 });
    }

    const { ext, buffer } = parseDataUrl(dataUrl);
    tmpPath = path.join(os.tmpdir(), `pose-ground-${Date.now()}.${ext}`);
    await fs.writeFile(tmpPath, buffer);

    const script = path.resolve(process.cwd(), "..", "web_backend.py");
    const result = await runPython([
      script,
      "detect-ground-pose",
      "--image",
      tmpPath,
      "--max-side",
      String(maxSide),
      "--min-person-score",
      String(minPersonScore),
      "--min-keypoint-score",
      String(minKeypointScore),
    ]);

    const parsed = parseLastJson(result.out);
    return NextResponse.json({
      ok: true,
      result: parsed?.result || {},
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "pose ground detection failed" }, { status: 500 });
  } finally {
    if (tmpPath) {
      await fs.rm(tmpPath, { force: true }).catch(() => {});
    }
  }
}
