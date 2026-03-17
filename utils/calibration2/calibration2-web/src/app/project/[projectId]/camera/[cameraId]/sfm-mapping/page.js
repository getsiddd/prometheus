"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCalibration } from "@/lib/CalibrationContext";

export default function ProjectSfmMappingPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId;
  const cameraId = params?.cameraId;

  const { stageOutputs, setStageOutput, stepStates, setStepState } = useCalibration();

  const [status, setStatus] = useState("Ready to run Visual SfM-style multi-view matching.");
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);

  const camerasPayload = useMemo(() => {
    const synced = Array.isArray(stageOutputs?.["ground-plane"]?.syncedFrames)
      ? stageOutputs["ground-plane"].syncedFrames
      : [];
    const items = synced
      .map((frame) => ({
        cameraId: String(frame?.cameraId || ""),
        snapshotPath: String(frame?.outputPath || frame?.path || ""),
      }))
      .filter((item) => item.cameraId && item.snapshotPath);
    return items;
  }, [stageOutputs]);

  useEffect(() => {
    const saved = stepStates?.["sfm-mapping"];
    if (saved?.status) setStatus(saved.status);
    if (Array.isArray(saved?.logs)) setLogs(saved.logs.slice(-120));
  }, [stepStates]);

  const appendLog = (line) => setLogs((prev) => [...prev, `${new Date().toISOString()}  ${line}`].slice(-160));

  const runSfmMatching = async () => {
    if (camerasPayload.length < 2) {
      setStatus("Need at least 2 synced camera snapshots from Step 3.");
      return;
    }

    setBusy(true);
    setStatus("Running backend multi-view feature matching...");
    appendLog(`Dispatch match-features-multiview for ${camerasPayload.length} camera snapshots`);

    try {
      const res = await fetch("/api/calibration/web/match-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cameras: camerasPayload,
          matchOptions: {
            method: "auto",
            maxFeatures: 2048,
            maxMatchesPerPair: 600,
            minConfidence: 0.35,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "SfM matching failed");

      const matching = data?.matching || {};
      setStageOutput("sfm-mapping", {
        completed: true,
        timestamp: new Date().toISOString(),
        cameras: camerasPayload,
        matching,
      });

      setStepState("sfm-mapping", {
        status: `Visual SfM matching complete with ${camerasPayload.length} camera(s).`,
        progress: 100,
        logs,
        result: {
          cameraCount: camerasPayload.length,
          matching,
        },
      });

      setStatus(`Visual SfM matching complete with ${camerasPayload.length} camera(s).`);
      appendLog("Feature matching completed successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "SfM matching failed";
      setStatus(`Error: ${message}`);
      appendLog(`Error: ${message}`);
      setStepState("sfm-mapping", {
        status: `Error: ${message}`,
        progress: 0,
        logs,
        result: { error: message },
      });
    } finally {
      setBusy(false);
    }
  };

  const progress = stageOutputs?.["sfm-mapping"]?.completed ? 100 : (busy ? 60 : Math.min(70, camerasPayload.length * 20));

  useEffect(() => {
    setStepState("sfm-mapping", {
      status,
      progress,
      logs,
      result: {
        cameraCount: camerasPayload.length,
      },
    });
  }, [status, progress, logs, camerasPayload.length, setStepState]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Step 6: Visual SfM Mapping</h1>
          <p className="text-sm text-zinc-400 mt-1">Project {projectId} • Camera {cameraId}</p>
        </div>
        <button onClick={() => router.push(`/project/${projectId}/camera/${cameraId}`)} className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition">← Back</button>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-2">
        <div className="text-xs text-zinc-300">{status}</div>
        <div className="h-2 rounded bg-zinc-800 overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${progress}%` }} /></div>
        <div className="text-xs text-zinc-400">Input snapshots from Step 3: {camerasPayload.length}</div>
      </div>

      <button disabled={busy} onClick={runSfmMatching} className="w-full px-4 py-3 rounded bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 font-medium">
        {busy ? "Running..." : "Run Visual SfM Matching (Backend)"}
      </button>

      {logs.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold mb-2">Command Logs</h2>
          <pre className="max-h-44 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px]">{logs.slice(-80).join("\n")}</pre>
        </div>
      )}

      <div className="flex gap-4">
        <button onClick={() => router.push(`/project/${projectId}/camera/${cameraId}/dlt-mapping`)} className="flex-1 px-6 py-3 rounded bg-zinc-800 hover:bg-zinc-700 transition font-medium">Back DLT Mapping</button>
        <button onClick={() => router.push(`/project/${projectId}/camera/${cameraId}/validation`)} className="flex-1 px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-700 transition font-medium">Next Validation</button>
      </div>
    </div>
  );
}
