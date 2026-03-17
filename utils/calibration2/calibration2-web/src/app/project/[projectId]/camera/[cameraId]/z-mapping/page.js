"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCalibration } from "@/lib/CalibrationContext";

export default function ProjectZMappingPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId;
  const cameraId = params?.cameraId;

  const {
    zMappings,
    setZMappings,
    stageOutputs,
    setStageOutput,
    setStepState,
    stepStates,
  } = useCalibration();

  const [status, setStatus] = useState("Add vertical references for Z-direction mapping.");
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState({ imageX: "", imageY: "", worldX: "", worldY: "", zHeight: "" });
  const [backendHealth, setBackendHealth] = useState(null);

  useEffect(() => {
    const saved = stageOutputs?.["z-mapping"];
    if (saved && Array.isArray(saved.zMappings) && saved.zMappings.length > 0) {
      setStatus(`Loaded ${saved.zMappings.length} saved Z-mapping record(s).`);
    }
  }, [stageOutputs]);

  useEffect(() => {
    const savedState = stepStates?.["z-mapping"];
    if (savedState?.status) setStatus(savedState.status);
    if (Array.isArray(savedState?.logs) && savedState.logs.length > 0) setLogs(savedState.logs.slice(-120));
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

  const appendLog = (line) => {
    const entry = `${new Date().toISOString()}  ${line}`;
    setLogs((prev) => [...prev, entry].slice(-160));
  };

  const addMapping = () => {
    const values = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)]));
    if (!Object.values(values).every((v) => Number.isFinite(v))) {
      setStatus("Enter all numeric fields before adding a Z mapping.");
      return;
    }
    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      image: [values.imageX, values.imageY],
      worldBase: [values.worldX, values.worldY, 0],
      zHeight: values.zHeight,
      timestamp: new Date().toISOString(),
    };
    setZMappings((prev) => [...(Array.isArray(prev) ? prev : []), record]);
    setForm({ imageX: "", imageY: "", worldX: "", worldY: "", zHeight: "" });
    const nextCount = (Array.isArray(zMappings) ? zMappings.length : 0) + 1;
    const message = `Z mapping added. Total records: ${nextCount}.`;
    setStatus(message);
    appendLog(message);
  };

  const saveZMapping = () => {
    const run = async () => {
      const items = Array.isArray(zMappings) ? zMappings : [];
      try {
        const res = await fetch("/api/calibration/web/z-mapping/compute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ zMappings: items }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Z mapping backend compute failed");

        const result = data?.result || {
          mappingCount: items.length,
        };
        const backendLogs = Array.isArray(data?.logs) ? data.logs : [];
        const mergedLogs = [...logs, ...backendLogs.map((line) => `${new Date().toISOString()}  ${line}`)].slice(-160);

        setLogs(mergedLogs);
        setStageOutput("z-mapping", {
          completed: items.length > 0,
          timestamp: new Date().toISOString(),
          zMappings: items,
          calculationResult: result,
        });

        setStepState("z-mapping", {
          status: items.length > 0 ? `Saved ${items.length} Z mapping record(s).` : "Saved empty Z mapping state.",
          progress: items.length > 0 ? 100 : 20,
          logs: mergedLogs,
          result,
        });

        setStatus(items.length > 0 ? `Saved ${items.length} Z mapping record(s).` : "Saved empty Z mapping state.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Z mapping backend compute failed";
        setStatus(`Error: ${message}`);
      }
    };
    run();
  };

  const progress = useMemo(() => {
    const count = Array.isArray(zMappings) ? zMappings.length : 0;
    if (stageOutputs?.["z-mapping"]?.completed) return 100;
    return Math.min(95, Math.max(10, count * 20));
  }, [zMappings, stageOutputs]);

  useEffect(() => {
    setStepState("z-mapping", {
      status,
      progress,
      logs,
      result: {
        mappingCount: Array.isArray(zMappings) ? zMappings.length : 0,
      },
    });
  }, [status, progress, logs, zMappings, setStepState]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Step 4: Z Direction Mapping</h1>
          <p className="text-sm text-zinc-400 mt-1">Project {projectId} • Camera {cameraId}</p>
        </div>
        <button onClick={() => router.push(`/project/${projectId}/camera/${cameraId}`)} className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition">← Back</button>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <div className="text-xs text-zinc-300">{status}</div>
        <div className="h-2 rounded bg-zinc-800 overflow-hidden"><div className="h-full bg-fuchsia-500" style={{ width: `${progress}%` }} /></div>
        <div className="text-xs text-zinc-400">Backend health: {backendHealth?.ok ? "OK" : "CHECK"}</div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 grid grid-cols-2 md:grid-cols-5 gap-2">
        <input value={form.imageX} onChange={(e) => setForm((p) => ({ ...p, imageX: e.target.value }))} placeholder="Image X" className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs" />
        <input value={form.imageY} onChange={(e) => setForm((p) => ({ ...p, imageY: e.target.value }))} placeholder="Image Y" className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs" />
        <input value={form.worldX} onChange={(e) => setForm((p) => ({ ...p, worldX: e.target.value }))} placeholder="World X" className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs" />
        <input value={form.worldY} onChange={(e) => setForm((p) => ({ ...p, worldY: e.target.value }))} placeholder="World Y" className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs" />
        <input value={form.zHeight} onChange={(e) => setForm((p) => ({ ...p, zHeight: e.target.value }))} placeholder="Z Height" className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs" />
        <button onClick={addMapping} className="md:col-span-2 rounded bg-blue-600 hover:bg-blue-700 px-3 py-2 text-sm">Add Mapping</button>
        <button onClick={saveZMapping} className="md:col-span-3 rounded bg-amber-600 hover:bg-amber-700 px-3 py-2 text-sm">Save Z Mapping</button>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-xs text-zinc-300">
        Records: {Array.isArray(zMappings) ? zMappings.length : 0}
      </div>

      {logs.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold mb-2">Command Logs</h2>
          <pre className="max-h-44 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px]">{logs.slice(-80).join("\n")}</pre>
        </div>
      )}

      <div className="flex gap-4">
        <button onClick={() => router.push(`/project/${projectId}/camera/${cameraId}/ground-plane`)} className="flex-1 px-6 py-3 rounded bg-zinc-800 hover:bg-zinc-700 transition font-medium">Back Ground Plane</button>
        <button onClick={() => router.push(`/project/${projectId}/camera/${cameraId}/dlt-mapping`)} className="flex-1 px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-700 transition font-medium">Next DLT Mapping</button>
      </div>
    </div>
  );
}
