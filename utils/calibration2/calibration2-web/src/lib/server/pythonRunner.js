import path from "node:path";
import { spawn } from "node:child_process";

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function pythonCandidates() {
  const fromEnv = process.env.CALIBRATION_PYTHON;
  const fromVenv = process.env.VIRTUAL_ENV
    ? path.join(process.env.VIRTUAL_ENV, "bin", "python")
    : null;

  return uniqueValues([
    fromEnv,
    fromVenv,
    "python3",
    "python",
  ]);
}

function runWithExecutable(executable, args, options) {
  const { cwd, env } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
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

    child.on("error", (spawnError) => {
      reject(spawnError);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        const executionError = new Error(err || out || `python exited with code ${code}`);
        executionError.code = `EXIT_${code}`;
        executionError.stdout = out;
        executionError.stderr = err;
        reject(executionError);
        return;
      }

      resolve({ out, err, executable });
    });
  });
}

export async function runPython(args, options = {}) {
  const cwd = options.cwd || path.resolve(process.cwd(), "..");
  const env = { ...process.env, PYTHONUNBUFFERED: "1", ...(options.env || {}) };

  const tried = [];
  const candidates = pythonCandidates();

  for (const executable of candidates) {
    try {
      return await runWithExecutable(executable, args, { cwd, env });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      tried.push(`[${executable}] ${message}`);
    }
  }

  throw new Error(
    [
      "Unable to run Python backend command.",
      "Set CALIBRATION_PYTHON to a valid interpreter path if needed.",
      `Tried executables: ${candidates.join(", ")}`,
      tried.length ? `Errors: ${tried.join(" | ")}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function parseLastJson(stdoutText) {
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
