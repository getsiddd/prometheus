"use client";

import { useRouter, useParams } from "next/navigation";
import { useCalibration } from "@/lib/CalibrationContext";
import { useEffect, useState } from "react";
import GroundPlaneStepSection from "@/components/calibration/sections/GroundPlaneStepSection";

export default function GroundPlanePage() {
  const router = useRouter();
  const params = useParams();
  const cameraId = params?.cameraId;

  const {
    feedEnabled,
    setFeedEnabled,
    liveFeedSrc,
    setLiveFeedSrc,
    snapshotDataUrl,
    setSnapshotDataUrl,
    imagePickMode,
    setImagePickMode,
    correspondences,
    setCorrespondences,
    jobLoading,
    setJobLoading,
    projectCameras,
    getActiveCamera,
    syncedMatchFrames,
    setSyncedMatchFrames,
    syncedFrameIndex,
    setSyncedFrameIndex,
    liveKeypointsDebug,
    setLiveKeypointsDebug,
    stageOutputs,
    setStageOutput,
  } = useCalibration();

  const [groundPlaneStatus, setGroundPlaneStatus] = useState(
    "Ready to calibrate ground plane"
  );
  const [autoGroundLoading, setAutoGroundLoading] = useState(false);
  const [validationPairs, setValidationPairs] = useState([]);
  const [syncedCameras, setSyncedCameras] = useState([]);

  // Feed setup
  useEffect(() => {
    const setupFeed = async () => {
      try {
        const response = await fetch(`/api/camera/${cameraId}/live-feed`);
        if (response.ok) {
          const src = `/api/camera/${cameraId}/live-feed`;
          setLiveFeedSrc(src);
          setFeedEnabled(true);
        }
      } catch (err) {
        console.error("Failed to initialize feed:", err);
      }
    };
    setupFeed();
  }, [cameraId, setLiveFeedSrc, setFeedEnabled]);

  // Load all available cameras for synced coverage
  useEffect(() => {
    const available = projectCameras.filter(
      (c) => String(c.id) !== String(cameraId)
    );
    setSyncedCameras(available);
  }, [projectCameras, cameraId]);

  // Capture synced snapshots from all cameras
  const handleCaptureSyncedSnapshots = async () => {
    try {
      setAutoGroundLoading(true);
      setGroundPlaneStatus("Capturing synced snapshots from all cameras...");

      const allCameraIds = [
        cameraId,
        ...syncedCameras.map((c) => c.id),
      ];

      const frames = [];
      for (const camId of allCameraIds) {
        try {
          const response = await fetch(
            `/api/camera/${camId}/snapshot`,
            { method: "POST" }
          );
          const data = await response.json();
          if (data.success) {
            frames.push({
              cameraId: camId,
              cameraName: `Camera ${camId}`,
              snapshotDataUrl: data.dataUrl,
              outputPath: data.path,
              source: "api",
              capturedAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.error(`Failed to capture from camera ${camId}:`, err);
        }
      }

      setSyncedMatchFrames(frames);
      setGroundPlaneStatus(
        `Captured ${frames.length} synced snapshots from all cameras`
      );
    } catch (err) {
      setGroundPlaneStatus(`Error: ${err.message}`);
    } finally {
      setAutoGroundLoading(false);
    }
  };

  // Run auto ground plane detection
  const handleAutoDetectGround = async () => {
    try {
      setAutoGroundLoading(true);
      setGroundPlaneStatus("Auto-detecting ground plane from image...");

      const response = await fetch(
        `/api/camera/${cameraId}/auto-detect-ground`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageDataUrl: snapshotDataUrl,
          }),
        }
      );

      const data = await response.json();
      if (data.success) {
        setCorrespondences(data.detections || []);
        setLiveKeypointsDebug({
          count: data.detections?.length || 0,
          source: "auto-detect",
        });
        setGroundPlaneStatus(
          `Auto-detected ${data.detections?.length || 0} ground points`
        );
      } else {
        setGroundPlaneStatus(`Auto-detection failed: ${data.error}`);
      }
    } catch (err) {
      setGroundPlaneStatus(`Error: ${err.message}`);
    } finally {
      setAutoGroundLoading(false);
    }
  };

  // Match features across synced cameras
  const handleMatchAcrossCameras = async () => {
    try {
      setAutoGroundLoading(true);
      setGroundPlaneStatus("Matching features across synced cameras...");

      const response = await fetch(
        `/api/match-features-multiview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            frames: syncedMatchFrames,
            cameraId,
          }),
        }
      );

      const data = await response.json();
      if (data.success) {
        setValidationPairs(data.matches || []);
        setGroundPlaneStatus(
          `Matched ${data.matches?.length || 0} feature pairs across cameras`
        );
      } else {
        setGroundPlaneStatus(`Feature matching failed: ${data.error}`);
      }
    } catch (err) {
      setGroundPlaneStatus(`Error: ${err.message}`);
    } finally {
      setAutoGroundLoading(false);
    }
  };

  // Complete ground plane calibration
  const handleCompleteGroundPlane = async () => {
    try {
      setJobLoading(true);
      setGroundPlaneStatus(
        "Completing ground plane calibration for all cameras..."
      );

      setStageOutput("ground-plane", {
        completed: true,
        timestamp: new Date().toISOString(),
        correspondences,
        validationPairs,
        syncedFrames: syncedMatchFrames,
      });

      setGroundPlaneStatus("Ground plane calibration complete!");
    } catch (err) {
      setGroundPlaneStatus(`Error: ${err.message}`);
    } finally {
      setJobLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Step 3: Ground Plane Calibration</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Image ↔ AutoCAD Coordinates • Camera {cameraId}
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition"
        >
          ← Back
        </button>
      </div>

      {/* Multi-Camera Coverage Panel */}
      {syncedCameras.length > 0 && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <h2 className="text-lg font-semibold mb-3">Multi-Camera Coverage</h2>
          <p className="text-xs text-zinc-400 mb-3">
            Synced snapshots from {syncedCameras.length} other cameras
          </p>
          <button
            onClick={handleCaptureSyncedSnapshots}
            disabled={autoGroundLoading}
            className="w-full px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition text-sm font-medium mb-3"
          >
            {autoGroundLoading ? "Capturing..." : "Capture Synced Snapshots"}
          </button>

          {syncedMatchFrames.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">
                  Synced frame {syncedFrameIndex + 1}/
                  {syncedMatchFrames.length} ·{" "}
                  {syncedMatchFrames[syncedFrameIndex]?.cameraName}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setSyncedFrameIndex(
                        (syncedFrameIndex - 1 + syncedMatchFrames.length) %
                          syncedMatchFrames.length
                      )
                    }
                    className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() =>
                      setSyncedFrameIndex(
                        (syncedFrameIndex + 1) % syncedMatchFrames.length
                      )
                    }
                    className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"
                  >
                    Next →
                  </button>
                </div>
              </div>

              {syncedMatchFrames[syncedFrameIndex]?.snapshotDataUrl && (
                <img
                  src={syncedMatchFrames[syncedFrameIndex].snapshotDataUrl}
                  alt={`Synced frame ${syncedFrameIndex + 1}`}
                  className="w-full rounded border border-zinc-700 max-h-80 object-cover"
                />
              )}

              <button
                onClick={handleMatchAcrossCameras}
                disabled={autoGroundLoading || syncedMatchFrames.length < 2}
                className="w-full px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition text-sm font-medium"
              >
                Match Features Across Cameras
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Ground Plane Calibration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Feed */}
        <div className="lg:col-span-2">
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
            <h2 className="text-lg font-semibold mb-3">Live Feed - {cameraId}</h2>
            {feedEnabled ? (
              <div className="w-full bg-black rounded border border-zinc-700 aspect-video">
                <img
                  src={liveFeedSrc}
                  alt="Live feed"
                  className="w-full h-full object-contain"
                  onError={() => setFeedEnabled(false)}
                />
              </div>
            ) : (
              <div className="w-full bg-zinc-800 rounded border border-zinc-700 aspect-video flex items-center justify-center">
                <p className="text-xs text-zinc-400">Feed not available</p>
              </div>
            )}
          </div>
        </div>

        {/* Ground Plane Controls */}
        <div className="space-y-4">
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 space-y-3">
            <h3 className="font-semibold">Detection</h3>

            <button
              onClick={handleAutoDetectGround}
              disabled={autoGroundLoading || jobLoading}
              className="w-full px-4 py-2 rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition text-sm font-medium"
            >
              {autoGroundLoading ? "Detecting..." : "Auto-Detect Ground"}
            </button>

            {correspondences.length > 0 && (
              <div className="text-xs bg-zinc-800 p-2 rounded">
                <p className="font-semibold text-amber-400">
                  ✓ {correspondences.length} points detected
                </p>
              </div>
            )}

            <button
              onClick={handleCompleteGroundPlane}
              disabled={correspondences.length === 0 || jobLoading}
              className="w-full px-4 py-2 rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition text-sm font-medium"
            >
              Complete Calibration
            </button>
          </div>

          {/* Status */}
          <div className="text-xs bg-zinc-800 p-3 rounded text-zinc-300">
            {groundPlaneStatus}
          </div>
        </div>
      </div>

      {/* Validation Pairs */}
      {validationPairs.length > 0 && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <h3 className="font-semibold mb-3">Cross-Camera Feature Matches</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {validationPairs.slice(0, 5).map((pair, idx) => (
              <div
                key={idx}
                className="text-xs bg-zinc-800 p-2 rounded flex justify-between"
              >
                <span>{pair.camera1} → {pair.camera2}</span>
                <span className="text-emerald-300">
                  {pair.matchScore?.toFixed(2)} match score
                </span>
              </div>
            ))}
            {validationPairs.length > 5 && (
              <p className="text-xs text-zinc-400 p-2">
                +{validationPairs.length - 5} more matches
              </p>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-4">
        <button
          onClick={() => router.back()}
          className="flex-1 px-6 py-3 rounded bg-zinc-800 hover:bg-zinc-700 transition font-medium"
        >
          ← Back to Steps
        </button>
        {stageOutputs["ground-plane"]?.completed && (
          <button
            onClick={() => router.push(`/camera/${cameraId}`)}
            className="flex-1 px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-700 transition font-medium"
          >
            ✓ Calibration Complete
          </button>
        )}
      </div>
    </div>
  );
}
