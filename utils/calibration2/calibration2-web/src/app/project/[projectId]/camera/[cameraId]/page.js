import { notFound } from "next/navigation";
import { CalibrationConsole } from "@/app/page";
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

  const cameras = Array.isArray(loaded?.projectConfig?.cameras) ? loaded.projectConfig.cameras : [];
  const index = cameras.findIndex((camera) => String(camera?.id || "") === cameraId);
  if (index < 0) {
    notFound();
  }

  const nextCameraId = index < cameras.length - 1 ? String(cameras[index + 1]?.id || "") : "";
  const homeHref = `/project/${encodeURIComponent(projectId)}`;
  const nextHref = nextCameraId
    ? `/project/${encodeURIComponent(projectId)}/camera/${encodeURIComponent(nextCameraId)}`
    : "";

  return (
    <CalibrationConsole
      routeProjectId={projectId}
      routeCameraId={cameraId}
      projectHomeHref={homeHref}
      nextCameraHref={nextHref}
      hideProjectWorkflow
    />
  );
}
