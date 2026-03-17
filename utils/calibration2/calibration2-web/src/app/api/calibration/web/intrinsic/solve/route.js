import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { parseLastJson, runPython } from "@/lib/server/pythonRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const startedAt = Date.now();
    const body = await req.json();
    const sessionId = body?.sessionId || "default";
    const checkerboard = body?.checkerboard || "9x6";
    const squareSize = Number(body?.squareSize ?? 0.024);
    const rawCameraType = String(body?.cameraType || "pinhole").toLowerCase();
    const cameraType = ["fisheye", "wide-angle", "cctv"].includes(rawCameraType) ? rawCameraType : "pinhole";

    const imagesDir = path.join(process.cwd(), "uploads", "intrinsic", sessionId);
    const imageNames = (await fs.readdir(imagesDir).catch(() => [])).filter((name) => /\.(jpg|jpeg|png|bmp)$/i.test(name));
    if (imageNames.length < 3) {
      return NextResponse.json({ error: "At least 3 checkerboard samples are required before solving." }, { status: 400 });
    }

    const outputNpZDir = path.join(process.cwd(), "uploads", "intrinsic-results");
    await fs.mkdir(outputNpZDir, { recursive: true });
    const outputNpz = path.join(outputNpZDir, `${Date.now()}-intrinsics.npz`);

    const script = path.resolve(process.cwd(), "..", "web_backend.py");
    const solved = await runPython([
      script,
      "intrinsic-solve",
      "--images-dir",
      imagesDir,
      "--checkerboard",
      checkerboard,
      "--square-size",
      String(squareSize),
      "--output-npz",
      outputNpz,
      "--camera-type",
      cameraType,
    ]);

    const parsed = parseLastJson(solved.out);

    return NextResponse.json({
      ok: true,
      sessionId,
      sampleCount: imageNames.length,
      imagesDir,
      outputNpz,
      durationMs: Date.now() - startedAt,
      stdout: solved.out,
      stderr: solved.err,
      executable: solved.executable,
      result: parsed,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Intrinsic solve failed" },
      { status: 500 },
    );
  }
}
