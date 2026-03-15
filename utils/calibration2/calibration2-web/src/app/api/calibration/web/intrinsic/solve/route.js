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
      // keep scanning
    }
  }
  return null;
}

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
