import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolvePythonExecutable() {
  const fromEnv = process.env.CALIBRATION_PYTHON;
  if (fromEnv) {
    return fromEnv;
  }
  return "/home/administrator/Projects/.venv/bin/python";
}

function runPython(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolvePythonExecutable(), args, {
      cwd: path.resolve(process.cwd(), ".."),
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";

    child.stdout.on("data", (chunk) => (out += chunk.toString()));
    child.stderr.on("data", (chunk) => (err += chunk.toString()));

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err || out || `python exited with code ${code}`));
        return;
      }
      resolve({ out, err });
    });
  });
}

function parseLastJson(stdoutText) {
  const lines = String(stdoutText).split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // continue
    }
  }
  return null;
}

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
