"use client";

import { useRouter, useParams } from "next/navigation";
import { useCalibration } from "@/lib/CalibrationContext";
import { useEffect, useState } from "react";
import ProjectEntryPage from "@/components/project/ProjectEntryPage";

export default function CameraPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId;
  const cameraId = params?.cameraId;
  const {
    projectCameras,
    activeProjectCameraId,
    setActiveProjectCameraId,
    projectName,
    setProjectName,
  } = useCalibration();

  const [showProjectEntry, setShowProjectEntry] = useState(!projectId);

  useEffect(() => {
    if (projectId) {
      setProjectName(`Project ${projectId}`);
      setActiveProjectCameraId(cameraId || "");
    }
  }, [projectId, cameraId, setProjectName, setActiveProjectCameraId]);

  if (showProjectEntry) {
    return <ProjectEntryPage onProjectLoaded={() => setShowProjectEntry(false)} />;
  }

  const activeCamera = projectCameras.find(
    (c) => String(c.id) === String(activeProjectCameraId)
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold">{projectName || "Camera Calibration"}</h1>
          <p className="text-sm text-zinc-400 mt-2">
            Select a calibration step for camera {activeCamera?.name || cameraId}
          </p>
        </div>

        <div className="space-y-4">
          <a
            href={`/camera/${cameraId}/intrinsic`}
            className="block p-6 border-l-4 border-blue-500 rounded bg-zinc-900 hover:bg-zinc-800 transition cursor-pointer"
          >
            <h2 className="text-xl font-semibold mb-2">Step 1: Intrinsic Calibration</h2>
            <p className="text-sm text-zinc-300">
              Calibrate camera lens distortion using checkerboard patterns
            </p>
          </a>

          <a
            href={`/camera/${cameraId}/plane-mapping`}
            className="block p-6 border-l-4 border-emerald-500 rounded bg-zinc-900 hover:bg-zinc-800 transition cursor-pointer"
          >
            <h2 className="text-xl font-semibold mb-2">Step 2: Plane Mapping</h2>
            <p className="text-sm text-zinc-300">
              Map ground plane with Z-coordinates using instance segmentation and human pose
              detection
            </p>
          </a>

          <a
            href={`/camera/${cameraId}/ground-plane`}
            className="block p-6 border-l-4 border-amber-500 rounded bg-zinc-900 hover:bg-zinc-800 transition cursor-pointer"
          >
            <h2 className="text-xl font-semibold mb-2">Step 3: Ground Plane Calibration</h2>
            <p className="text-sm text-zinc-300">
              Match image coordinates with AutoCAD world coordinates for ground plane
              localization
            </p>
          </a>
        </div>

        <div className="text-xs text-zinc-500 border-t border-zinc-800 pt-6">
          <p>Project: {projectId} | Camera: {cameraId}</p>
        </div>
      </div>
    </div>
  );
}
