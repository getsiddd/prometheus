import Link from "next/link";
import { notFound } from "next/navigation";
import { readProjectById } from "@/lib/server/projectStore";

export default async function CameraCalibrationPage({ params }) {
  const resolvedParams = await params;
  const projectId = String(resolvedParams?.projectId || "").trim();
  const cameraId = String(resolvedParams?.cameraId || "").trim();

  let loaded;
  try {
    loaded = await readProjectById(projectId);
  } catch {
    notFound();
  }

  const cameras = Array.isArray(loaded?.projectConfig?.cameras)
    ? loaded.projectConfig.cameras
    : [];
  const activeCamera = cameras.find((camera) => String(camera?.id || "") === cameraId);
  if (!activeCamera) {
    notFound();
  }

  const projectHref = `/project/${encodeURIComponent(projectId)}`;
  const cameraBaseHref = `${projectHref}/camera/${encodeURIComponent(cameraId)}`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">{loaded?.projectConfig?.name || "Project Calibration"}</h1>
          <p className="text-sm text-zinc-400">
            Select a calibration step for camera {activeCamera?.name || cameraId}
          </p>
        </div>

        <div className="space-y-4">
          <Link
            href={`${cameraBaseHref}/intrinsic`}
            className="block p-6 border-l-4 border-blue-500 rounded bg-zinc-900 hover:bg-zinc-800 transition"
          >
            <h2 className="text-xl font-semibold mb-2">Step 1: Intrinsic Calibration</h2>
            <p className="text-sm text-zinc-300">
              Calibrate camera lens distortion using checkerboard patterns.
            </p>
          </Link>

          <Link
            href={`${cameraBaseHref}/plane-mapping`}
            className="block p-6 border-l-4 border-emerald-500 rounded bg-zinc-900 hover:bg-zinc-800 transition"
          >
            <h2 className="text-xl font-semibold mb-2">Step 2: Plane Mapping</h2>
            <p className="text-sm text-zinc-300">
              Live-feed plane mapping with Z-coordinates where Z=0 is ground, including human pose based ground estimation.
            </p>
          </Link>

          <Link
            href={`${cameraBaseHref}/ground-plane`}
            className="block p-6 border-l-4 border-amber-500 rounded bg-zinc-900 hover:bg-zinc-800 transition"
          >
            <h2 className="text-xl font-semibold mb-2">Step 3: Ground Plane Calibration</h2>
            <p className="text-sm text-zinc-300">
              Match image ground points to AutoCAD world coordinates with synced multi-camera coverage.
            </p>
          </Link>

          <Link
            href={`${cameraBaseHref}/z-mapping`}
            className="block p-6 border-l-4 border-fuchsia-500 rounded bg-zinc-900 hover:bg-zinc-800 transition"
          >
            <h2 className="text-xl font-semibold mb-2">Step 4: Z Direction Mapping</h2>
            <p className="text-sm text-zinc-300">
              Define vertical reference mappings for height-aware projection.
            </p>
          </Link>

          <Link
            href={`${cameraBaseHref}/dlt-mapping`}
            className="block p-6 border-l-4 border-cyan-500 rounded bg-zinc-900 hover:bg-zinc-800 transition"
          >
            <h2 className="text-xl font-semibold mb-2">Step 5: Monoplotting / DLT Mapping</h2>
            <p className="text-sm text-zinc-300">
              Solve camera mapping using direct linear transformation from point and height correspondences.
            </p>
          </Link>

          <Link
            href={`${cameraBaseHref}/sfm-mapping`}
            className="block p-6 border-l-4 border-indigo-500 rounded bg-zinc-900 hover:bg-zinc-800 transition"
          >
            <h2 className="text-xl font-semibold mb-2">Step 6: Visual SfM Mapping</h2>
            <p className="text-sm text-zinc-300">
              Visual structure-from-motion based mapping and refinement.
            </p>
          </Link>

          <Link
            href={`${cameraBaseHref}/validation`}
            className="block p-6 border-l-4 border-rose-500 rounded bg-zinc-900 hover:bg-zinc-800 transition"
          >
            <h2 className="text-xl font-semibold mb-2">Step 7: AprilTag Validation</h2>
            <p className="text-sm text-zinc-300">
              Validate projected AprilTag detections against real-world coordinates and error metrics.
            </p>
          </Link>
        </div>

        <div className="pt-4 border-t border-zinc-800">
          <Link
            href={projectHref}
            className="inline-flex items-center px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition"
          >
            ← Back to Camera List
          </Link>
        </div>
      </div>
    </div>
  );
}
