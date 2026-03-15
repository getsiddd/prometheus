import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

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
    const dataUrl = body?.imageDataUrl;
    const { ext, buffer } = parseDataUrl(dataUrl);

    const outputDir = path.join(process.cwd(), "uploads", "snapshots");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${Date.now()}-webcam.${ext}`);
    await fs.writeFile(outputPath, buffer);

    return NextResponse.json({
      ok: true,
      outputPath,
      snapshotDataUrl: dataUrl,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "snapshot upload failed" }, { status: 400 });
  }
}
