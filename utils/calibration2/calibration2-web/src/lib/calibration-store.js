import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { parseLastJson, runPython } from "@/lib/server/pythonRunner";

const globalState = globalThis;

if (!globalState.__calibrationJobs) {
  globalState.__calibrationJobs = new Map();
}
if (!globalState.__calibrationJobProcesses) {
  globalState.__calibrationJobProcesses = new Map();
}

const jobs = globalState.__calibrationJobs;
const jobProcesses = globalState.__calibrationJobProcesses;

function resolvePythonExecutable() {
  const fromEnv = process.env.CALIBRATION_PYTHON;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  const preferred = "/home/administrator/Projects/.venv/bin/python";
  if (fs.existsSync(preferred)) {
    return preferred;
  }

  return "python3";
}

function appendLog(id, message) {
  const job = jobs.get(id);
  if (!job) {
    return;
  }

  const logs = [...job.logs, message];
  const trimmed = logs.length > 400 ? logs.slice(logs.length - 400) : logs;

  updateJob(id, { logs: trimmed });
}

function deriveProgress(line, currentProgress) {
  const text = line.toLowerCase();

  if (text.includes("[intrinsic]")) {
    return Math.max(currentProgress, 20);
  }
  if (text.includes("[cad]")) {
    return Math.max(currentProgress, 40);
  }
  if (text.includes("[pnp]")) {
    return Math.max(currentProgress, 75);
  }
  if (text.includes("saved")) {
    return Math.max(currentProgress, 90);
  }

  return currentProgress;
}

function resolveStageOutputPath(stage, config, jobId) {
  const raw = String(config?.stageOutputPath || "").trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  }
  return path.resolve(process.cwd(), "uploads", "stages", `${stage}-${jobId}.json`);
}

function writeWebModeOutput(stage, config, jobId) {
  const outputPath = resolveStageOutputPath(stage, config, jobId);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const payload = {
    ok: true,
    mode: "web-only",
    stage,
    generatedAt: new Date().toISOString(),
    params: {
      cameraType: config?.cameraType,
      sourceMode: config?.sourceMode,
      sourceUrl: config?.sourceUrl,
      checkerboard: config?.checkerboard,
      squareSize: config?.squareSize,
      minSamples: config?.minSamples,
      options: config?.options || {},
    },
  };

  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf-8");
  return outputPath;
}

function listImageFiles(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) {
    return [];
  }
  return fs.readdirSync(dirPath).filter((name) => /\.(jpg|jpeg|png|bmp)$/i.test(name));
}

async function runIntrinsicWebSolve(id, stage, config) {
  const outputPath = resolveStageOutputPath(stage, config, id);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const sessionId = String(config?.intrinsicSessionId || config?.sessionId || "default").trim() || "default";
  const imagesDir = path.resolve(process.cwd(), "uploads", "intrinsic", sessionId);
  const imageFiles = listImageFiles(imagesDir);

  if (!fs.existsSync(imagesDir)) {
    throw new Error(`Intrinsic session folder not found: ${imagesDir}`);
  }
  if (imageFiles.length < 4) {
    throw new Error(`Need at least 4 valid checkerboard images in session '${sessionId}', found ${imageFiles.length}`);
  }

  const outputNpzDir = path.resolve(process.cwd(), "uploads", "intrinsic-results");
  fs.mkdirSync(outputNpzDir, { recursive: true });
  const outputNpz = path.join(outputNpzDir, `${Date.now()}-intrinsics.npz`);

  const scriptPath = path.resolve(process.cwd(), "..", "web_backend.py");
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`web_backend.py not found: ${scriptPath}`);
  }

  const latest = jobs.get(id);
  updateJob(id, {
    status: "running",
    progress: 30,
    logs: [
      ...(latest?.logs || []),
      `Web mode intrinsic solve started for session '${sessionId}'.`,
      `Input samples: ${imageFiles.length}`,
      `Intrinsic output target: ${outputNpz}`,
      `Stage output target: ${outputPath}`,
    ],
    result: {
      ...(latest?.result || {}),
      ok: true,
      stage,
      mode: "web-intrinsic-solve",
      outputPath,
      sessionId,
      sampleCount: imageFiles.length,
    },
  });

  const cameraTypeArg = String(config?.cameraType || "pinhole").toLowerCase();
  const cameraTypeCli = ["fisheye", "wide-angle", "cctv"].includes(cameraTypeArg) ? cameraTypeArg : "pinhole";

  const solved = await runPython([
    scriptPath,
    "intrinsic-solve",
    "--images-dir",
    imagesDir,
    "--checkerboard",
    String(config?.checkerboard || "9x6"),
    "--square-size",
    String(config?.squareSize ?? 0.024),
    "--output-npz",
    outputNpz,
    "--camera-type",
    cameraTypeCli,
  ]);

  const parsed = parseLastJson(solved.out) || {};
  const result = parsed?.result || parsed || {};
  const K = Array.isArray(result?.K) ? result.K : null;
  const D = Array.isArray(result?.D) ? result.D : null;

  const payload = {
    ok: true,
    mode: "web-intrinsic-solve",
    stage,
    generatedAt: new Date().toISOString(),
    params: {
      cameraType: config?.cameraType,
      sourceMode: config?.sourceMode,
      sourceUrl: config?.sourceUrl,
      checkerboard: config?.checkerboard,
      squareSize: config?.squareSize,
      minSamples: config?.minSamples,
      options: config?.options || {},
      sessionId,
    },
    input: {
      imagesDir,
      sampleCount: imageFiles.length,
    },
    output: {
      intrinsicsPath: outputNpz,
      rms: typeof result?.rms === "number" ? result.rms : null,
      validImageCount: Number.isFinite(result?.valid_image_count) ? result.valid_image_count : imageFiles.length,
      fx: typeof K?.[0]?.[0] === "number" ? K[0][0] : null,
      fy: typeof K?.[1]?.[1] === "number" ? K[1][1] : null,
      cx: typeof K?.[0]?.[2] === "number" ? K[0][2] : null,
      cy: typeof K?.[1]?.[2] === "number" ? K[1][2] : null,
      K,
      D,
    },
    backendResult: parsed,
  };

  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf-8");

  const done = jobs.get(id);
  updateJob(id, {
    status: "completed",
    progress: 100,
    logs: [...(done?.logs || []), "Web intrinsic solve completed."],
    result: {
      ...(done?.result || {}),
      ok: true,
      stage,
      mode: "web-intrinsic-solve",
      outputPath,
      intrinsicsPath: outputNpz,
      intrinsic: payload.output,
      backendResult: parsed,
    },
  });
}

function runProcessLogged(id, command, args, options = {}) {
  return new Promise((resolve, reject) => {
    appendLog(id, `Running: ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        appendLog(id, `[SFM-OUT] ${line}`);
      }
    });

    child.stderr.on("data", (chunk) => {
      const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        appendLog(id, `[SFM-ERR] ${line}`);
      }
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function runSfmColmap(id, stage, config) {
  const outputSummaryPath = resolveStageOutputPath(stage, config, id);
  fs.mkdirSync(path.dirname(outputSummaryPath), { recursive: true });

  const imageDir = path.resolve(process.cwd(), "uploads", "sfm-images");
  if (!fs.existsSync(imageDir)) {
    throw new Error(`SfM images directory not found: ${imageDir}`);
  }

  const imageFiles = fs.readdirSync(imageDir).filter((name) => /\.(jpg|jpeg|png|bmp)$/i.test(name));
  if (imageFiles.length < 4) {
    throw new Error(`Need at least 4 SfM images, found ${imageFiles.length}`);
  }

  const artifactsDir = outputSummaryPath.replace(/\.[^/.]+$/, "") + "_artifacts";
  const dbPath = path.join(artifactsDir, "database.db");
  const sparseDir = path.join(artifactsDir, "sparse");
  const modelTextDir = path.join(artifactsDir, "model_txt");

  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.mkdirSync(sparseDir, { recursive: true });

  updateJob(id, {
    status: "running",
    progress: 10,
    result: {
      ok: true,
      stage,
      mode: "web-colmap",
      outputPath: outputSummaryPath,
      artifactsDir,
      imageDir,
      imageCount: imageFiles.length,
    },
  });

  await runProcessLogged(id, "colmap", ["-h"]);

  updateJob(id, { progress: 25 });
  await runProcessLogged(id, "colmap", [
    "feature_extractor",
    "--database_path",
    dbPath,
    "--image_path",
    imageDir,
    "--ImageReader.single_camera",
    "0",
    "--SiftExtraction.use_gpu",
    "0",
  ]);

  updateJob(id, { progress: 50 });
  await runProcessLogged(id, "colmap", [
    "exhaustive_matcher",
    "--database_path",
    dbPath,
    "--SiftMatching.use_gpu",
    "0",
  ]);

  updateJob(id, { progress: 75 });
  await runProcessLogged(id, "colmap", [
    "mapper",
    "--database_path",
    dbPath,
    "--image_path",
    imageDir,
    "--output_path",
    sparseDir,
  ]);

  const model0 = path.join(sparseDir, "0");
  if (!fs.existsSync(model0)) {
    throw new Error("COLMAP mapper did not produce sparse/0 model");
  }

  fs.mkdirSync(modelTextDir, { recursive: true });
  await runProcessLogged(id, "colmap", [
    "model_converter",
    "--input_path",
    model0,
    "--output_path",
    modelTextDir,
    "--output_type",
    "TXT",
  ]);

  let points3d = 0;
  const pointsFile = path.join(modelTextDir, "points3D.txt");
  if (fs.existsSync(pointsFile)) {
    const content = fs.readFileSync(pointsFile, "utf-8");
    points3d = content
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .length;
  }

  const summary = {
    ok: true,
    stage,
    mode: "web-colmap",
    generatedAt: new Date().toISOString(),
    input: {
      imageDir,
      imageCount: imageFiles.length,
    },
    output: {
      database: dbPath,
      sparseDir,
      modelTextDir,
      points3d,
    },
  };

  fs.writeFileSync(outputSummaryPath, JSON.stringify(summary, null, 2), "utf-8");

  const latest = jobs.get(id);
  updateJob(id, {
    status: "completed",
    progress: 100,
    logs: [...(latest?.logs || []), "SfM COLMAP pipeline completed."],
    result: {
      ...(latest?.result || {}),
      ok: true,
      stage,
      outputPath: outputSummaryPath,
      artifactsDir,
      points3d,
      imageCount: imageFiles.length,
    },
  });
}

function launchCalibrationProcess(id, stage, config) {
  try {
    const job = jobs.get(id);
    if (!job) {
      return;
    }

    if (config?.webMode) {
      if (stage === "sfm") {
        runSfmColmap(id, stage, config).catch((error) => {
          const latest = jobs.get(id);
          const msg = error instanceof Error ? error.message : String(error);
          updateJob(id, {
            status: "failed",
            progress: 100,
            logs: [...(latest?.logs || []), `SfM failed: ${msg}`, "Install COLMAP and retry (e.g., sudo apt install colmap)."],
            result: {
              ...(latest?.result || {}),
              ok: false,
              stage,
              error: msg,
            },
          });
        });
        return;
      }

      if (stage === "intrinsic") {
        runIntrinsicWebSolve(id, stage, config).catch((error) => {
          const latest = jobs.get(id);
          const msg = error instanceof Error ? error.message : String(error);
          updateJob(id, {
            status: "failed",
            progress: 100,
            logs: [...(latest?.logs || []), `Intrinsic web solve failed: ${msg}`],
            result: {
              ...(latest?.result || {}),
              ok: false,
              stage,
              mode: "web-intrinsic-solve",
              error: msg,
            },
          });
        });
        return;
      }

      const outputPath = writeWebModeOutput(stage, config, id);
      const cfgSummary = JSON.stringify(
        {
          cameraType: config?.cameraType,
          sourceMode: config?.sourceMode,
          checkerboard: config?.checkerboard,
          squareSize: config?.squareSize,
          minSamples: config?.minSamples,
        },
        null,
        2,
      );

      updateJob(id, {
        status: "running",
        progress: 30,
        logs: [
          ...job.logs,
          `Web mode enabled for stage '${stage}'. No desktop GUI windows will be opened.`,
          `Stage parameters:\n${cfgSummary}`,
          `Stage output target: ${outputPath}`,
        ],
        result: {
          ok: true,
          stage,
          mode: "web-only",
          outputPath,
        },
      });

      setTimeout(() => {
        const latest = jobs.get(id);
        if (!latest) {
          return;
        }

        updateJob(id, {
          status: "completed",
          progress: 100,
          logs: [...latest.logs, "Web-mode stage orchestration completed."],
          result: {
            ok: true,
            stage,
            mode: "web-only",
            outputPath,
            message: "Use /api/calibration/web/snapshot and /api/calibration/web/solve for headless calibration flow.",
          },
        });
      }, 1200);

      return;
    }

    const python = resolvePythonExecutable();
    const scriptPath = path.resolve(process.cwd(), "..", "main.py");

    if (!fs.existsSync(scriptPath)) {
      updateJob(id, {
        status: "failed",
        progress: 100,
        logs: [...job.logs, `Calibration script not found: ${scriptPath}`],
        result: { ok: false, error: "Missing calibration2 main.py" },
      });
      return;
    }

    const dwgPath = config?.dwgPath;
    if (!dwgPath || !fs.existsSync(dwgPath)) {
      updateJob(id, {
        status: "failed",
        progress: 100,
        logs: [...job.logs, "DWG/DXF path is missing or not found. Upload CAD file first."],
        result: { ok: false, error: "Missing DWG/DXF path" },
      });
      return;
    }

    const outputDir = path.resolve(process.cwd(), "uploads", "jobs", id);
    fs.mkdirSync(outputDir, { recursive: true });

    const args = [
      scriptPath,
      "--dwg",
      dwgPath,
      "--source",
      config?.sourceUrl || "0",
      "--output-dir",
      outputDir,
      "--checkerboard",
      String(config?.checkerboard || "9x6"),
      "--square-size",
      String(config?.squareSize ?? 0.024),
      "--min-samples",
      String(config?.minSamples ?? 18),
      "--display-scale",
      "0.5",
      "--max-fps",
      "15",
    ];

    if (stage === "intrinsic") {
      args.push("--force-intrinsic");
    }

    updateJob(id, {
      status: "running",
      progress: 5,
      result: {
        ok: true,
        python,
        scriptPath,
        outputDir,
        args,
      },
    });

    appendLog(id, `Launching: ${python} ${args.join(" ")}`);

    const child = spawn(python, args, {
      cwd: path.resolve(process.cwd(), ".."),
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    jobProcesses.set(id, child);
    updateJob(id, { pid: child.pid });

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const current = jobs.get(id);
      if (!current) {
        return;
      }

      let progress = current.progress;
      for (const line of lines) {
        appendLog(id, `[OUT] ${line}`);
        progress = deriveProgress(line, progress);
      }

      if (progress !== current.progress) {
        updateJob(id, { progress });
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      const lines = text.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        appendLog(id, `[ERR] ${line}`);
      }
    });

    child.on("close", (code) => {
      jobProcesses.delete(id);
      const latest = jobs.get(id);
      if (!latest) {
        return;
      }

      if (code === 0) {
        updateJob(id, {
          status: "completed",
          progress: 100,
          logs: [...latest.logs, "Calibration process completed successfully."],
          result: {
            ...(latest.result ?? {}),
            ok: true,
            outputDir,
            calibrationFile: path.join(outputDir, "calibration2.yaml"),
          },
        });
        return;
      }

      updateJob(id, {
        status: "failed",
        progress: 100,
        logs: [...latest.logs, `Calibration process exited with code ${code}`],
        result: {
          ...(latest.result ?? {}),
          ok: false,
          outputDir,
          error: `Process exited with code ${code}`,
        },
      });
    });
  } catch (error) {
    const latest = jobs.get(id);
    const msg = error instanceof Error ? error.message : String(error);
    updateJob(id, {
      status: "failed",
      progress: 100,
      logs: [...(latest?.logs || []), `Launch failed: ${msg}`],
      result: { ok: false, error: msg },
    });
  }
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function createJob(stage, config) {
  const now = Date.now();
  const id = makeId();

  const job = {
    id,
    stage,
    config,
    status: "queued",
    progress: 0,
    createdAt: now,
    updatedAt: now,
    logs: ["Job created"],
  };

  jobs.set(id, job);

  launchCalibrationProcess(id, stage, config);

  return job;
}

export function getJob(id) {
  return jobs.get(id);
}

export function updateJob(id, patch) {
  const prev = jobs.get(id);
  if (!prev) {
    return;
  }

  const next = {
    ...prev,
    ...patch,
    updatedAt: Date.now(),
  };

  jobs.set(id, next);
}
