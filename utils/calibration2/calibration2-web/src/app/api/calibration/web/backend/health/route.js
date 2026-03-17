import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { runPython } from "@/lib/server/pythonRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function checkScript(scriptPath) {
  try {
    await fs.access(scriptPath);
    return { exists: true };
  } catch {
    return { exists: false };
  }
}

export async function GET() {
  try {
    const webBackend = path.resolve(process.cwd(), "..", "web_backend.py");
    const mainScript = path.resolve(process.cwd(), "..", "main.py");

    const webFile = await checkScript(webBackend);
    const mainFile = await checkScript(mainScript);

    const report = {
      web_backend: { path: webBackend, ...webFile, runnable: false, error: "" },
      main: { path: mainScript, ...mainFile, runnable: false, error: "" },
    };

    if (webFile.exists) {
      try {
        await runPython([webBackend, "--help"]);
        report.web_backend.runnable = true;
      } catch (err) {
        report.web_backend.error = err instanceof Error ? err.message : String(err);
      }
    }

    if (mainFile.exists) {
      try {
        await runPython([mainScript, "--help"]);
        report.main.runnable = true;
      } catch (err) {
        report.main.error = err instanceof Error ? err.message : String(err);
      }
    }

    const ok = report.web_backend.exists && report.web_backend.runnable && report.main.exists;
    return NextResponse.json({ ok, report });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Backend health check failed" },
      { status: 500 }
    );
  }
}
