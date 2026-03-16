import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { parseLastJson, runPython } from "@/lib/server/pythonRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json();

  const correspondences = body?.correspondences;
  const intrinsicsPath = body?.intrinsicsPath || "";

  if (!Array.isArray(correspondences) || correspondences.length < 4) {
    return NextResponse.json({ error: "At least 4 correspondences are required" }, { status: 400 });
  }

  const outputDir = path.join(process.cwd(), "uploads", "web-solve");
  await fs.mkdir(outputDir, { recursive: true });
  const outputYaml = path.join(outputDir, `${Date.now()}-calibration2.yaml`);

  const script = path.resolve(process.cwd(), "..", "web_backend.py");

  const args = [
    script,
    "solve-pnp",
    "--correspondences-json",
    JSON.stringify(correspondences),
    "--intrinsics",
    intrinsicsPath,
    "--output-yaml",
    outputYaml,
  ];

  const result = await runPython(args);

  const parsed = parseLastJson(result.out) || { ok: true, raw: result.out };

  return NextResponse.json({
    ok: true,
    outputYaml,
    result: parsed,
  });
}
