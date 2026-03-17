"use client";

import { CalibrationProvider } from "@/lib/CalibrationContext";
import { useParams } from "next/navigation";

export default function CameraLayout({ children }) {
  const params = useParams();
  const projectId = params?.projectId || "";
  const cameraId = params?.cameraId || "";

  return (
    <CalibrationProvider projectId={projectId} cameraId={cameraId}>
      {children}
    </CalibrationProvider>
  );
}
