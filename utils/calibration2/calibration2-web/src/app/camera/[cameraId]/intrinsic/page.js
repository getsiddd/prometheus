"use client";

import { useRouter, useParams } from "next/navigation";
import { useCalibration } from "@/lib/CalibrationContext";
import { useEffect, useState } from "react";
import IntrinsicStepSection from "@/components/calibration/sections/IntrinsicStepSection";
import StageStatusCard from "@/components/calibration/StageStatusCard";

export default function IntrinsicPage() {
  const router = useRouter();
  const params = useParams();
  const cameraId = params?.cameraId;

  const {
    feedEnabled,
    setFeedEnabled,
    liveFeedSrc,
    setLiveFeedSrc,
    feedError,
    setFeedError,
    intrinsicSessionId,
    setIntrinsicSessionId,
    checkerboard,
    setCheckerboard,
    squareSize,
    setSquareSize,
    checkerboardSquareMm,
    setCheckerboardSquareMm,
    minSamples,
    setMinSamples,
    intrinsicSamples,
    setIntrinsicSamples,
    intrinsicActiveIndex,
    setIntrinsicActiveIndex,
    intrinsicsPath,
    setIntrinsicsPath,
    intrinsicSolveResult,
    setIntrinsicSolveResult,
    snapshotDataUrl,
    setSnapshotDataUrl,
    jobLoading,
    setJobLoading,
    intrinsicVideoRef,
    stageOutputs,
    setStageOutput,
  } = useCalibration();

  const [intrinsicStatus, setIntrinsicStatus] = useState("Ready to capture samples");
  const [minSamplesToSolve] = useState(18);
  const [checkerboardPdfStatus, setCheckerboardPdfStatus] = useState("Not generated");
  const [onFeedError] = useState(() => (err) => setFeedError(err?.message || "Feed error"));

  const intrinsicCanSolve = intrinsicSamples.length >= minSamplesToSolve;

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

  const handleCaptureIntrinsicSample = async () => {
    try {
      setJobLoading(true);
      const response = await fetch(`/api/camera/${cameraId}/capture-intrinsic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: intrinsicSessionId,
          checkerboard,
          squareSize,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setIntrinsicSamples([...(intrinsicSamples || []), data.sample]);
        setIntrinsicStatus(`Captured sample ${data.sampleIndex + 1}`);
      } else {
        setIntrinsicStatus(`Failed: ${data.error}`);
      }
    } catch (err) {
      setIntrinsicStatus(`Error: ${err.message}`);
    } finally {
      setJobLoading(false);
    }
  };

  const handleSolveIntrinsic = async () => {
    try {
      setJobLoading(true);
      const response = await fetch(`/api/camera/${cameraId}/solve-intrinsic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          samples: intrinsicSamples,
          checkerboard,
          squareSize,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setIntrinsicSolveResult(data.result);
        setIntrinsicsPath(data.outputPath);
        setIntrinsicStatus("Intrinsic calibration solved!");
        setStageOutput("intrinsic", {
          completed: true,
          timestamp: new Date().toISOString(),
          intrinsicsPath: data.outputPath,
        });
      } else {
        setIntrinsicStatus(`Failed: ${data.error}`);
      }
    } catch (err) {
      setIntrinsicStatus(`Error: ${err.message}`);
    } finally {
      setJobLoading(false);
    }
  };

  const handleDownloadCheckerboardPdf = async () => {
    try {
      const response = await fetch(`/api/camera/${cameraId}/generate-checkerboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkerboard, squareSize }),
      });
      const data = await response.json();
      if (data.success) {
        const link = document.createElement("a");
        link.href = data.downloadUrl;
        link.download = `checkerboard-${checkerboard}.pdf`;
        link.click();
        setCheckerboardPdfStatus("PDF downloaded");
      }
    } catch (err) {
      setCheckerboardPdfStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Step 1: Intrinsic Calibration</h1>
          <p className="text-sm text-zinc-400 mt-1">Camera {cameraId}</p>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition"
        >
          ← Back
        </button>
      </div>

      <div className="max-w-4xl">
        <IntrinsicStepSection
          data={{
            intrinsicAllowed: true,
            intrinsicSessionId,
            checkerboard,
            squareSize,
            checkerboardSquareMm,
            checkerboardPdfStatus,
            stageOutputIntrinsic: stageOutputs.intrinsic,
            intrinsicSampleCount: intrinsicSamples.length,
            minSamples: minSamplesToSolve,
            intrinsicStatus,
            intrinsicsPath,
            intrinsicSolveResult,
            intrinsicDownloadHref: intrinsicsPath ? `/api/download?path=${intrinsicsPath}` : "",
            intrinsicSamples,
            intrinsicActiveIndex,
            sourceMode: "rtsp",
            feedEnabled,
            liveFeedSrc,
            snapshotDataUrl,
            jobLoading,
            sequenceRunning: false,
          }}
          actions={{
            setIntrinsicSessionId,
            setCheckerboard,
            setSquareSize,
            setCheckerboardSquareMm,
            setStageOutput,
            captureIntrinsicSample: handleCaptureIntrinsicSample,
            solveIntrinsicWeb: handleSolveIntrinsic,
            runStageCard: handleSolveIntrinsic,
            setIntrinsicActiveIndex,
            deleteIntrinsicSample: (idx) => {
              setIntrinsicSamples(intrinsicSamples.filter((_, i) => i !== idx));
            },
            loadIntrinsicSamples: () => {
              // Implement if needed
            },
            downloadCheckerboardPdf: handleDownloadCheckerboardPdf,
            downloadIntrinsicSummary: () => {
              // Implement if needed
            },
            onFeedError,
            clearFeedError: () => setFeedError(""),
          }}
          refs={{ intrinsicVideoRef }}
          renderStageStatus={() => <div className="text-xs text-zinc-300">{intrinsicStatus}</div>}
        />
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => router.back()}
          className="flex-1 px-6 py-3 rounded bg-zinc-800 hover:bg-zinc-700 transition font-medium"
        >
          ← Back to Steps
        </button>
        <button
          onClick={() =>
            router.push(`/camera/${cameraId}/plane-mapping`)
          }
          disabled={!stageOutputs.intrinsic?.completed}
          className="flex-1 px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-700 enabled:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
        >
          Next: Plane Mapping →
        </button>
      </div>
    </div>
  );
}
