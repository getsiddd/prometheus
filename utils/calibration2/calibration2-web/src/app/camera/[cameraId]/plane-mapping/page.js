"use client";

import { useRouter, useParams } from "next/navigation";
import { useCalibration } from "@/lib/CalibrationContext";
import { useEffect, useState } from "react";

export default function PlaneMappingPage() {
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
    humanPoseDetections,
    setHumanPoseDetections,
    poseGroundPlaneEstimate,
    setPoseGroundPlaneEstimate,
    poseLoading,
    setPoseLoading,
    jobLoading,
    setJobLoading,
    stageOutputs,
    setStageOutput,
  } = useCalibration();

  const [planeMappingStatus, setPlaneMappingStatus] = useState(
    "Ready to detect human pose and planes"
  );
  const [segmentationResults, setSegmentationResults] = useState(null);
  const [segmentationLoading, setSegmentationLoading] = useState(false);
  const [showPoseOverlay, setShowPoseOverlay] = useState(true);
  const [zCoordinateInput, setZCoordinateInput] = useState("");

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

  // Detect human pose and estimate ground plane
  const handleDetectHumanPose = async () => {
    try {
      setPoseLoading(true);
      setPlaneMappingStatus("Detecting human pose...");

      const response = await fetch(
        `/api/camera/${cameraId}/detect-human-pose`,
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
        setHumanPoseDetections(data.keypoints || []);
        setPoseGroundPlaneEstimate(data.groundPlaneEstimate);
        setPlaneMappingStatus(
          `Human pose detected with ${data.keypoints?.length || 0} keypoints`
        );
      } else {
        setPlaneMappingStatus(`Pose detection failed: ${data.error}`);
      }
    } catch (err) {
      setPlaneMappingStatus(`Error: ${err.message}`);
    } finally {
      setPoseLoading(false);
    }
  };

  // Instance segmentation for plane detection
  const handleDetectPlanes = async () => {
    try {
      setSegmentationLoading(true);
      setPlaneMappingStatus("Detecting planes...");

      const response = await fetch(
        `/api/camera/${cameraId}/segment-planes`,
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
        setSegmentationResults(data);
        setPlaneMappingStatus(`Detected ${data.planes?.length || 0} planes`);
      } else {
        setPlaneMappingStatus(`Segmentation failed: ${data.error}`);
      }
    } catch (err) {
      setPlaneMappingStatus(`Error: ${err.message}`);
    } finally {
      setSegmentationLoading(false);
    }
  };

  // Add Z-coordinate mapping
  const handleAddZMapping = async () => {
    try {
      if (!zCoordinateInput || isNaN(parseFloat(zCoordinateInput))) {
        setPlaneMappingStatus("Please enter a valid Z coordinate");
        return;
      }

      const zValue = parseFloat(zCoordinateInput);
      const newMapping = {
        planeId: segmentationResults?.selectedPlaneId || 0,
        zCoordinate: zValue,
        timestamp: new Date().toISOString(),
      };

      setCorrespondences([...correspondences, newMapping]);
      setPlaneMappingStatus(
        `Added Z mapping: plane Z = ${zValue}m from ground`
      );
      setZCoordinateInput("");
    } catch (err) {
      setPlaneMappingStatus(`Error adding mapping: ${err.message}`);
    }
  };

  // Auto-spread ground plane from pose detection
  const handleAutoSpreadGround = async () => {
    try {
      setJobLoading(true);
      setPlaneMappingStatus("Spreading ground plane to edges...");

      const response = await fetch(
        `/api/camera/${cameraId}/spread-ground-plane`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            poseGroundPlane: poseGroundPlaneEstimate,
            imageDataUrl: snapshotDataUrl,
          }),
        }
      );

      const data = await response.json();
      if (data.success) {
        setCorrespondences(data.mappedPoints || []);
        setPlaneMappingStatus("Ground plane spread to edge detection complete");
        setStageOutput("plane-mapping", {
          completed: true,
          timestamp: new Date().toISOString(),
          mappings: data.mappedPoints,
          groundPlaneEstimate: poseGroundPlaneEstimate,
        });
      } else {
        setPlaneMappingStatus(`Failed: ${data.error}`);
      }
    } catch (err) {
      setPlaneMappingStatus(`Error: ${err.message}`);
    } finally {
      setJobLoading(false);
    }
  };

  const hasMappings = correspondences.length > 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Step 2: Plane Mapping</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Z-coordinates & Ground Plane Detection • Camera {cameraId}
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition"
        >
          ← Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Feed */}
        <div className="lg:col-span-2">
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
            <h2 className="text-lg font-semibold mb-3">Live Feed</h2>
            {feedEnabled ? (
              <div className="relative w-full bg-black rounded border border-zinc-700 aspect-video">
                <img
                  src={liveFeedSrc}
                  alt="Live feed"
                  className="w-full h-full object-contain"
                  onError={() => setFeedEnabled(false)}
                />
                {showPoseOverlay && humanPoseDetections.length > 0 && (
                  <svg className="absolute inset-0 w-full h-full">
                    {humanPoseDetections.map((kp, idx) => (
                      <circle
                        key={idx}
                        cx={kp.x}
                        cy={kp.y}
                        r="4"
                        fill="cyan"
                        opacity="0.7"
                      />
                    ))}
                  </svg>
                )}
              </div>
            ) : (
              <div className="w-full bg-zinc-800 rounded border border-zinc-700 aspect-video flex items-center justify-center">
                <p className="text-xs text-zinc-400">Feed not available</p>
              </div>
            )}
          </div>
        </div>

        {/* Control Panel */}
        <div className="space-y-4">
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 space-y-4">
            <h2 className="text-lg font-semibold">Detection</h2>

            {/* Human Pose Detection */}
            <button
              onClick={handleDetectHumanPose}
              disabled={poseLoading || jobLoading}
              className="w-full px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition text-sm font-medium"
            >
              {poseLoading ? "Detecting..." : "Detect Human Pose"}
            </button>

            {humanPoseDetections.length > 0 && (
              <div className="text-xs bg-zinc-800 p-2 rounded">
                <p className="font-semibold text-cyan-400">
                  ✓ {humanPoseDetections.length} keypoints detected
                </p>
                {poseGroundPlaneEstimate && (
                  <p className="text-zinc-300 mt-1">
                    Ground plane estimated at Y={poseGroundPlaneEstimate.y?.toFixed(2)}
                  </p>
                )}
              </div>
            )}

            {/* Plane Segmentation */}
            <button
              onClick={handleDetectPlanes}
              disabled={segmentationLoading || jobLoading}
              className="w-full px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition text-sm font-medium"
            >
              {segmentationLoading ? "Segmenting..." : "Detect Planes"}
            </button>

            {segmentationResults && (
              <div className="text-xs bg-zinc-800 p-2 rounded">
                <p className="font-semibold text-emerald-400">
                  ✓ {segmentationResults.planes?.length || 0} planes detected
                </p>
              </div>
            )}
          </div>

          {/* Z-Coordinate Input */}
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 space-y-3">
            <h3 className="font-semibold">Z-Coordinate Mapping</h3>
            <div className="space-y-2">
              <label className="block text-xs text-zinc-400">
                Z height (meters, 0 = ground)
              </label>
              <input
                type="number"
                step="0.01"
                value={zCoordinateInput}
                onChange={(e) => setZCoordinateInput(e.target.value)}
                placeholder="e.g., 1.5"
                className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500"
              />
              <button
                onClick={handleAddZMapping}
                className="w-full px-3 py-2 rounded bg-amber-600 hover:bg-amber-700 transition text-sm font-medium"
              >
                Add Z Mapping
              </button>
            </div>
            {hasMappings && (
              <div className="text-xs bg-zinc-800 p-2 rounded">
                <p className="font-semibold text-amber-400">
                  {correspondences.length} mappings
                </p>
              </div>
            )}
          </div>

          {/* Auto Spread */}
          <button
            onClick={handleAutoSpreadGround}
            disabled={
              !poseGroundPlaneEstimate || jobLoading || !segmentationResults
            }
            className="w-full px-4 py-2 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition text-sm font-medium"
          >
            Auto-Spread Ground
          </button>

          {/* Status */}
          <div className="text-xs bg-zinc-800 p-2 rounded text-zinc-300">
            {planeMappingStatus}
          </div>
        </div>
      </div>

      {/* Mappings List */}
      {hasMappings && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <h3 className="font-semibold mb-3">Z-Coordinate Mappings</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {correspondences.map((m, idx) => (
              <div
                key={idx}
                className="text-xs bg-zinc-800 p-2 rounded flex justify-between"
              >
                <span>Plane #{m.planeId}</span>
                <span className="text-amber-300">Z = {m.zCoordinate}m</span>
                <button
                  onClick={() =>
                    setCorrespondences(correspondences.filter((_, i) => i !== idx))
                  }
                  className="text-red-400 hover:text-red-300 ml-2"
                >
                  ✕
                </button>
              </div>
            ))}
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
        <button
          onClick={() => router.push(`/camera/${cameraId}/ground-plane`)}
          disabled={!stageOutputs["plane-mapping"]?.completed}
          className="flex-1 px-6 py-3 rounded bg-amber-600 hover:bg-amber-700 enabled:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
        >
          Next: Ground Plane →
        </button>
      </div>
    </div>
  );
}
