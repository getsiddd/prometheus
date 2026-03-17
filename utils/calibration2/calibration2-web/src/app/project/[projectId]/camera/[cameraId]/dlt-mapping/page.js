"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCalibration } from "@/lib/CalibrationContext";

export default function ProjectDltMappingPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId;
  const cameraId = params?.cameraId;

  const { stageOutputs, setStageOutput, setStepState, stepStates } = useCalibration();

  const [status, setStatus] = useState("Ready to run Monoplotting / DLT solve.");
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [backendHealth, setBackendHealth] = useState(null);

  const correspondences = useMemo(() => {
    const raw = Array.isArray(stageOutputs?.["ground-plane"]?.correspondences)
      ? stageOutputs["ground-plane"].correspondences
      : [];
    return raw
      .map((item) => {
        const wx = Number(item?.world?.[0]);
        const wy = Number(item?.world?.[1]);
        const wz = Number(item?.world?.[2]);
        const px = Number(item?.image?.x ?? item?.pixel?.[0]);
        const py = Number(item?.image?.y ?? item?.pixel?.[1]);
        if (![wx, wy, wz, px, py].every((v) => Number.isFinite(v))) return null;
        return { markerId: String(item?.id || `m-${Math.random().toString(36).slice(2, 7)}`), world: [wx, wy, wz], pixel: [px, py] };
      })
      .filter(Boolean);
  }, [stageOutputs]);

  const intrinsicsPath = stageOutputs?.intrinsic?.intrinsicsPath || "";

  useEffect(() => {
    const saved = stepStates?.["dlt-mapping"];
    if (saved?.status) setStatus(saved.status);
    if (Array.isArray(saved?.logs)) setLogs(saved.logs.slice(-120));
  }, [stepStates]);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/calibration/web/backend/health", { cache: "no-store" });
        const data = await res.json();
        setBackendHealth(data);
      } catch {
        setBackendHealth({ ok: false, error: "Backend health check failed" });
      }
    };
    run();
  }, []);

  const appendLog = (line) => setLogs((prev) => [...prev, `${new Date().toISOString()}  ${line}`].slice(-160));

  const runDltSolve = async () => {
    if (correspondences.length < 4) {
      setStatus("Need at least 4 point mappings from Step 3 with image+world coordinates.");
      return;
    }
    if (!intrinsicsPath) {
      setStatus("Intrinsic file missing. Complete Step 1 first.");
      return;
    }

    setBusy(true);
    setStatus("Running backend DLT/PnP computation...");
    appendLog("Dispatch solve-pnp to web_backend.py");

    try {
      const res = await fetch("/api/calibration/web/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correspondences, intrinsicsPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "DLT solve failed");

      const result = data?.result || {};
      const outputYaml = data?.outputYaml || "";
      const summary = {
        correspondenceCount: correspondences.length,
        outputYaml,
        backendResult: result,
      };

      setStageOutput("dlt-mapping", {
        completed: true,
        timestamp: new Date().toISOString(),
        outputYaml,
        correspondences,
        result,
      });

      setStepState("dlt-mapping", {
        status: `DLT solve complete. Output: ${outputYaml || "n/a"}`,
        progress: 100,
        logs,
        result: summary,
      });

      setStatus(`DLT solve complete. Output: ${outputYaml || "n/a"}`);
      appendLog("DLT solve completed successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "DLT solve failed";
      setStatus(`Error: ${message}`);
      appendLog(`Error: ${message}`);
      setStepState("dlt-mapping", {
        status: `Error: ${message}`,
        progress: 0,
        logs,
        result: { error: message },
      });
    } finally {
      setBusy(false);
    }
  };

  const progress = stageOutputs?.["dlt-mapping"]?.completed ? 100 : (busy ? 55 : Math.min(80, correspondences.length * 10));

  useEffect(() => {
    setStepState("dlt-mapping", {
      status,
      progress,
      logs,
      result: {
        correspondenceCount: correspondences.length,
        intrinsicsPath,
        outputYaml: stageOutputs?.["dlt-mapping"]?.outputYaml || "",
      },
    });
  }, [status, progress, logs, correspondences.length, intrinsicsPath, stageOutputs, setStepState]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Step 5: Monoplotting / DLT Mapping</h1>
          <p className="text-sm text-zinc-400 mt-1">Project {projectId} • Camera {cameraId}</p>
        </div>
        <button onClick={() => router.push(`/project/${projectId}/camera/${cameraId}`)} className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition">← Back</button>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-2">
        <div className="text-xs text-zinc-300">{status}</div>
        <div className="h-2 rounded bg-zinc-800 overflow-hidden"><div className="h-full bg-cyan-500" style={{ width: `${progress}%` }} /></div>
        <div className="text-xs text-zinc-400">Input correspondences: {correspondences.length} • Intrinsics: {intrinsicsPath || "missing"}</div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-xs text-zinc-300">
        Backend health: {backendHealth?.ok ? "OK" : "CHECK"}
      </div>

      <button disabled={busy} onClick={runDltSolve} className="w-full px-4 py-3 rounded bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 font-medium">
        {busy ? "Running..." : "Run DLT Solve (Backend)"}
      </button>

      {logs.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold mb-2">Command Logs</h2>
          <pre className="max-h-44 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px]">{logs.slice(-80).join("\n")}</pre>
        </div>
      )}

      <div className="flex gap-4">
        <button onClick={() => router.push(`/project/${projectId}/camera/${cameraId}/z-mapping`)} className="flex-1 px-6 py-3 rounded bg-zinc-800 hover:bg-zinc-700 transition font-medium">Back Z Mapping</button>
        <button onClick={() => router.push(`/project/${projectId}/camera/${cameraId}/sfm-mapping`)} className="flex-1 px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-700 transition font-medium">Next Visual SfM</button>
      </div>
    </div>
  );
}
