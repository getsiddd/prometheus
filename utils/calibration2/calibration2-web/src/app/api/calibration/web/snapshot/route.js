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
  const source = body?.sourceUrl;

  if (!source) {
    return NextResponse.json({ error: "sourceUrl is required" }, { status: 400 });
  }

  const outputDir = path.join(process.cwd(), "uploads", "snapshots");
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${Date.now()}.jpg`);

  const python = resolvePythonExecutable();
  const script = path.resolve(process.cwd(), "..", "web_backend.py");

  const args = [script, "snapshot", "--source", source, "--output", outputPath];

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
        reject(new Error(err || out || `snapshot failed with code ${code}`));
        return;
      }
      resolve({ out, err });
    });
  });

  const jpg = await fs.readFile(outputPath);
  const b64 = jpg.toString("base64");

  return NextResponse.json({
    ok: true,
    source,
    outputPath,
    snapshotDataUrl: `data:image/jpeg;base64,${b64}`,
    logs: result,
  });
}
