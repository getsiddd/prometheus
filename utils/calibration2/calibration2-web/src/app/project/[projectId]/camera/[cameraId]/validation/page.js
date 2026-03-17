"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCalibration } from "@/lib/CalibrationContext";

export default function ProjectValidationPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId;
  const cameraId = params?.cameraId;

  const { stageOutputs, setStageOutput, setStepState, stepStates } = useCalibration();

  const [status, setStatus] = useState("Ready to validate AprilTag/world coordinate conversion.");
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);

  const validationPoints = useMemo(() => {
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
        return { world: [wx, wy, wz], pixel: [px, py], plane_z: wz };
      })
      .filter(Boolean);
  }, [stageOutputs]);

  const calibrationYamlPath = stageOutputs?.["dlt-mapping"]?.outputYaml || "";
  const intrinsicsPath = stageOutputs?.intrinsic?.intrinsicsPath || "";

  useEffect(() => {
    const saved = stepStates?.validation;
    if (saved?.status) setStatus(saved.status);
    if (Array.isArray(saved?.logs)) setLogs(saved.logs.slice(-120));
  }, [stepStates]);

  const appendLog = (line) => setLogs((prev) => [...prev, `${new Date().toISOString()}  ${line}`].slice(-160));

  const runValidation = async () => {
    if (validationPoints.length < 1) {
      setStatus("Need at least one mapped point from Step 3.");
      return;
    }
    if (!calibrationYamlPath) {
      setStatus("Calibration YAML missing. Complete Step 5 DLT Mapping first.");
      return;
    }

    setBusy(true);
    setStatus("Running backend validation (AprilTag-style world conversion checks)...");
    appendLog(`Dispatch validate-mapping with ${validationPoints.length} point(s)`);

    try {
      const res = await fetch("/api/calibration/web/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validationPoints, calibrationYamlPath, intrinsicsPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Validation failed");

      const validation = data?.validation || {};

      setStageOutput("validation", {
        completed: true,
        timestamp: new Date().toISOString(),
        validation,
      });

      setStepState("validation", {
        status: "Validation complete.",
        progress: 100,
        logs,
        result: validation,
      });

      setStatus("Validation complete.");
      appendLog("Validation completed successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Validation failed";
      setStatus(`Error: ${message}`);
      appendLog(`Error: ${message}`);
      setStepState("validation", {
        status: `Error: ${message}`,
        progress: 0,
        logs,
        result: { error: message },
      });
    } finally {
      setBusy(false);
    }
  };

  const progress = stageOutputs?.validation?.completed ? 100 : (busy ? 60 : Math.min(80, validationPoints.length * 15));

  useEffect(() => {
    setStepState("validation", {
      status,
      progress,
      logs,
      result: {
        validationPointCount: validationPoints.length,
        calibrationYamlPath,
      },
    });
  }, [status, progress, logs, validationPoints.length, calibrationYamlPath, setStepState]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Step 7: AprilTag Validation</h1>
          <p className="text-sm text-zinc-400 mt-1">Project {projectId} • Camera {cameraId}</p>
        </div>
        <button onClick={() => router.push(`/project/${projectId}/camera/${cameraId}`)} className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition">← Back</button>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-2">
        <div className="text-xs text-zinc-300">{status}</div>
        <div className="h-2 rounded bg-zinc-800 overflow-hidden"><div className="h-full bg-rose-500" style={{ width: `${progress}%` }} /></div>
        <div className="text-xs text-zinc-400">Validation points: {validationPoints.length} • YAML: {calibrationYamlPath || "missing"}</div>
      </div>

      <button disabled={busy} onClick={runValidation} className="w-full px-4 py-3 rounded bg-rose-600 hover:bg-rose-700 disabled:opacity-50 font-medium">
        {busy ? "Running..." : "Run Validation (Backend)"}
      </button>

      {logs.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold mb-2">Command Logs</h2>
          <pre className="max-h-44 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px]">{logs.slice(-80).join("\n")}</pre>
        </div>
      )}

      <div className="flex gap-4">
        <button onClick={() => router.push(`/project/${projectId}/camera/${cameraId}/sfm-mapping`)} className="flex-1 px-6 py-3 rounded bg-zinc-800 hover:bg-zinc-700 transition font-medium">Back Visual SfM</button>
        <button onClick={() => router.push(`/project/${projectId}`)} className="flex-1 px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-700 transition font-medium">Finish Camera Calibration</button>
      </div>
    </div>
  );
}
