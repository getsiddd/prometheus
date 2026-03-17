import Link from "next/link";
import { readProjectById } from "@/lib/server/projectStore";

const ALL_STAGES = [
  "intrinsic",
  "ground-plane",
  "z-mapping",
  "cad-3d-dwg",
  "extrinsic",
  "sfm",
  "overlay",
];

function resolveEnabledStages(projectConfig) {
  const opts = projectConfig?.options || {};
  return ALL_STAGES.filter((stage) => {
    if (stage === "ground-plane") return opts.useGroundPlane !== false;
    if (stage === "z-mapping") return opts.useZDirection !== false;
    if (stage === "sfm") return opts.useSfm !== false;
    if (stage === "cad-3d-dwg" || stage === "overlay") return opts.useRealtimeOverlay !== false;
    return true; // intrinsic + extrinsic always enabled
  });
}

function summarizeCameraStatus(camera, workspace, enabledStages) {
  const completedStages =
    workspace && typeof workspace.completedStages === "object" && workspace.completedStages
      ? workspace.completedStages
      : {};

  const doneStages = enabledStages.filter((stage) => Boolean(completedStages[stage])).length;
  const calibrationDone = Boolean(workspace?.latestCalibrationYamlPath);
  const validationDone = Array.isArray(workspace?.validationPairs) && workspace.validationPairs.length > 0;
  const allStagesDone = doneStages === enabledStages.length;
  const allDone = allStagesDone && calibrationDone && validationDone;

  return {
    cameraId: camera.id,
    cameraName: camera.name || camera.id,
    doneStages,
    totalStages: enabledStages.length,
    calibrationDone,
    validationDone,
    allDone,
  };
}

export default async function ProjectDetailPage({ params }) {
  const resolvedParams = await params;
  const projectId = String(resolvedParams?.projectId || "").trim();

  let loaded;
  try {
    loaded = await readProjectById(projectId);
  } catch (err) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <main className="mx-auto max-w-5xl space-y-4 px-6 py-8">
          <h1 className="text-2xl font-semibold">Project not found</h1>
          <p className="text-sm text-zinc-400">{err instanceof Error ? err.message : "Unable to open this project."}</p>
          <Link href="/project" className="inline-flex rounded border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm hover:bg-zinc-800/60">
            Go to Project Creation / Open Project
          </Link>
        </main>
      </div>
    );
  }

  const projectConfig = loaded.projectConfig;
  const cameras = Array.isArray(projectConfig?.cameras) ? projectConfig.cameras : [];
  const workspaces =
    projectConfig?.cameraWorkspaces && typeof projectConfig.cameraWorkspaces === "object"
      ? projectConfig.cameraWorkspaces
      : {};

  const enabledStages = resolveEnabledStages(projectConfig);
  const opts = projectConfig?.options || {};

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">{projectConfig.projectName || projectId}</h1>
          <p className="text-sm text-zinc-400">Project ID: {projectConfig.projectId || projectId}</p>
          <p className="text-sm text-zinc-500">{projectConfig.projectDescription || "No description provided."}</p>
        </header>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Link href="/project" className="inline-flex items-center rounded border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm hover:bg-zinc-700/60">
              ← Back to Projects
            </Link>
          </div>
          <p className="text-xs text-zinc-500 break-all">Shared DWG: {projectConfig.sharedDwgPath || "Not set"}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`rounded px-2 py-0.5 ${opts.useGroundPlane !== false ? "bg-emerald-900/40 text-emerald-200" : "bg-zinc-800/60 text-zinc-500 line-through"}`}>Ground Plane</span>
            <span className={`rounded px-2 py-0.5 ${opts.useZDirection !== false ? "bg-emerald-900/40 text-emerald-200" : "bg-zinc-800/60 text-zinc-500 line-through"}`}>Z Direction</span>
            <span className={`rounded px-2 py-0.5 ${opts.useSfm !== false ? "bg-emerald-900/40 text-emerald-200" : "bg-zinc-800/60 text-zinc-500 line-through"}`}>SfM</span>
            <span className={`rounded px-2 py-0.5 ${opts.useRealtimeOverlay !== false ? "bg-emerald-900/40 text-emerald-200" : "bg-zinc-800/60 text-zinc-500 line-through"}`}>Overlay</span>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <h2 className="text-lg font-medium">Cameras</h2>
          {cameras.length < 1 ? (
            <p className="text-sm text-zinc-400">No cameras in this project.</p>
          ) : (
            <div className="space-y-2">
              {cameras.map((camera) => {
                const status = summarizeCameraStatus(camera, workspaces[camera.id], enabledStages);
                return (
                  <div key={camera.id} className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{status.cameraName}</p>
                        <p className="text-xs text-zinc-400">ID: {status.cameraId}</p>
                        <p className="text-xs text-zinc-500">
                          Stages: {status.doneStages}/{status.totalStages} • Calibration: {status.calibrationDone ? "done" : "pending"} • Validation: {status.validationDone ? "done" : "pending"}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-1 text-xs font-medium ${
                            status.allDone
                              ? "border border-emerald-700 bg-emerald-900/40 text-emerald-200"
                              : "border border-rose-700 bg-rose-900/40 text-rose-200"
                          }`}
                        >
                          {status.allDone ? "DONE" : "PENDING"}
                        </span>
                        <Link
                          href={`/project/${encodeURIComponent(projectId)}/camera/${encodeURIComponent(camera.id)}`}
                          className="rounded border border-sky-700 bg-sky-900/40 px-3 py-2 text-xs hover:bg-sky-800/50"
                        >
                          Go to calibration
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
