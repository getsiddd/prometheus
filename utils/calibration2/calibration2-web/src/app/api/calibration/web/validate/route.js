import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { parseLastJson, runPython } from "@/lib/server/pythonRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();
    const validationPoints = body?.validationPoints;
    const calibrationYamlPath = body?.calibrationYamlPath;
    const intrinsicsPath = body?.intrinsicsPath || "";

    if (!Array.isArray(validationPoints) || validationPoints.length < 1) {
      return NextResponse.json({ error: "validationPoints must contain at least 1 point" }, { status: 400 });
    }

    if (!calibrationYamlPath) {
      return NextResponse.json({ error: "calibrationYamlPath is required" }, { status: 400 });
    }

    await fs.access(calibrationYamlPath);

    const script = path.resolve(process.cwd(), "..", "web_backend.py");
    const validated = await runPython([
      script,
      "validate-mapping",
      "--validation-json",
      JSON.stringify(validationPoints),
      "--calibration-yaml",
      calibrationYamlPath,
      "--intrinsics",
      intrinsicsPath,
    ]);

    const parsed = parseLastJson(validated.out);
    const result = parsed?.result || parsed;

    return NextResponse.json({
      ok: true,
      validation: result,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Validation failed" }, { status: 500 });
  }
}
