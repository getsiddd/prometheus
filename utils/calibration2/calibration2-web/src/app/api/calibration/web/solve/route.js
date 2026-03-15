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

  const python = resolvePythonExecutable();
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

  const result = await new Promise((resolve, reject) => {
    const child = spawn(python, args, {
      cwd: path.resolve(process.cwd(), ".."),
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";

    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      err += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err || out || `solve failed with code ${code}`));
        return;
      }
      resolve({ out, err });
    });
  });

  let parsed = null;
  try {
    parsed = JSON.parse(String(result.out).trim().split(/\r?\n/).filter(Boolean).pop());
  } catch {
    parsed = { ok: true, raw: result.out };
  }

  return NextResponse.json({
    ok: true,
    outputYaml,
    result: parsed,
  });
}
