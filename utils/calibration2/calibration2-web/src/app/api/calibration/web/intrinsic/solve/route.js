import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { parseLastJson, runPython } from "@/lib/server/pythonRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json();
  const sessionId = body?.sessionId || "default";
  const checkerboard = body?.checkerboard || "9x6";
  const squareSize = Number(body?.squareSize ?? 0.024);

  const imagesDir = path.join(process.cwd(), "uploads", "intrinsic", sessionId);
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
  ]);

  const parsed = parseLastJson(solved.out);

  return NextResponse.json({
    ok: true,
    outputNpz,
    result: parsed,
  });
}
