"use client";

import { useRouter, useParams } from "next/navigation";
import { useCalibration } from "@/lib/CalibrationContext";
import { useEffect, useRef, useState } from "react";
import IntrinsicStepSection from "@/components/calibration/sections/IntrinsicStepSection";

function detectSourceType(sourceUrl) {
  const src = String(sourceUrl || "").trim().toLowerCase();
  if (!src) return "missing";
  if (/^\d+$/.test(src)) return "webcam";
  if (src.startsWith("rtsp://")) return "rtsp/cctv";
  if (src.startsWith("http://") || src.startsWith("https://")) return "http stream";
  if (/\.(mp4|mov|avi|mkv)$/i.test(src)) return "video file";
  return "custom";
}

export default function ProjectIntrinsicPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId;
  const cameraId = params?.cameraId;

  const {
    feedEnabled,
    setFeedEnabled,
    liveFeedSrc,
    setLiveFeedSrc,
    setFeedError,
    intrinsicSessionId,
    setIntrinsicSessionId,
    checkerboard,
    setCheckerboard,
    squareSize,
    setSquareSize,
    checkerboardSquareMm,
    setCheckerboardSquareMm,
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
  const [sourceMode, setSourceMode] = useState("rtsp");
  const [cameraSourceUrl, setCameraSourceUrl] = useState("");
  const [cameraInfo, setCameraInfo] = useState(null);
  const webcamStreamRef = useRef(null);
  const [solvePercent, setSolvePercent] = useState(0);
  const [solvePhase, setSolvePhase] = useState("");
  const [solveOutputLog, setSolveOutputLog] = useState("");
  const [solveMeta, setSolveMeta] = useState(null);
  const solveTimerRef = useRef(null);

  useEffect(() => {
    if (!intrinsicSessionId && projectId && cameraId) {
      setIntrinsicSessionId(`${projectId}-${cameraId}`);
    }
  }, [intrinsicSessionId, projectId, cameraId, setIntrinsicSessionId]);

  // Auto-load existing samples whenever session ID changes
  useEffect(() => {
    if (intrinsicSessionId) {
      handleLoadSamples(intrinsicSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intrinsicSessionId]);

  useEffect(() => {
    const setupFeed = async () => {
      try {
        const response = await fetch(`/api/calibration/web/projects/${projectId}`, { cache: "no-store" });
        const data = await response.json();
        const cameras = Array.isArray(data?.projectConfig?.cameras) ? data.projectConfig.cameras : [];
        const activeCamera = cameras.find((camera) => String(camera?.id || "") === String(cameraId));
        setCameraInfo(activeCamera || null);
        const sourceUrl = String(activeCamera?.sourceUrl || "").trim();
        setCameraSourceUrl(sourceUrl);
        if (sourceUrl) {
          const isWebcamSource = /^\d+$/.test(sourceUrl);
          if (isWebcamSource) {
            setSourceMode("webcam");
            setFeedEnabled(true);
            setFeedError("");

            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: undefined },
                audio: false,
              });
              webcamStreamRef.current = stream;
              if (intrinsicVideoRef.current) {
                intrinsicVideoRef.current.srcObject = stream;
                await intrinsicVideoRef.current.play();
              }
              setIntrinsicStatus("Webcam connected. Show checkerboard and capture samples.");
            } catch (err) {
              setFeedEnabled(false);
              setFeedError(err instanceof Error ? err.message : "Webcam access failed.");
              setIntrinsicStatus("Webcam access failed.");
            }
          } else {
            setSourceMode("rtsp");
            setLiveFeedSrc(
              `/api/feeds/mjpeg?source=${encodeURIComponent(sourceUrl)}&fps=12&width=960&nonce=${Date.now()}`
            );
            setFeedEnabled(true);
          }
        } else {
          setFeedEnabled(false);
          setFeedError("Camera source URL is missing in project config.");
        }
      } catch (err) {
        console.error("Failed to initialize feed:", err);
        setFeedEnabled(false);
      }
    };
    setupFeed();
    return () => {
      const stream = webcamStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        webcamStreamRef.current = null;
      }
      if (intrinsicVideoRef.current) {
        intrinsicVideoRef.current.srcObject = null;
      }
    };
  }, [projectId, cameraId, setLiveFeedSrc, setFeedEnabled, setFeedError, intrinsicVideoRef]);

  const captureWebcamFrame = () => {
    const video = intrinsicVideoRef.current;
    if (!video || video.videoWidth < 1 || video.videoHeight < 1) {
      throw new Error("Webcam frame is not ready yet");
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to capture webcam frame");
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.92);
  };

  const handleCaptureIntrinsicSample = async () => {
    try {
      setJobLoading(true);
      const activeSessionId = intrinsicSessionId || `${projectId}-${cameraId}`;
      if (!intrinsicSessionId) {
        setIntrinsicSessionId(activeSessionId);
      }
      if (sourceMode === "webcam") {
        setIntrinsicStatus("Capturing sample from webcam...");
        const imageDataUrl = captureWebcamFrame();
        const response = await fetch("/api/calibration/web/intrinsic/capture-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageDataUrl,
            checkerboard,
            sessionId: activeSessionId,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Webcam capture failed");
        if (data.snapshotDataUrl) {
          setSnapshotDataUrl(data.snapshotDataUrl);
        }
        if (data?.sample?.dataUrl) {
          setIntrinsicSamples((prev) => {
            const next = [data.sample, ...(Array.isArray(prev) ? prev : []).filter((item) => item?.name !== data.sample.name)];
            return next;
          });
          setIntrinsicActiveIndex(0);
        }
        setIntrinsicStatus(data.message || (data.found ? "Sample captured." : "Checkerboard not found."));
        return;
      }

      setIntrinsicStatus("Capturing sample from RTSP...");

      const srcUrl = cameraSourceUrl;

      if (!srcUrl) {
        setIntrinsicStatus("Cannot capture: no source URL for this camera.");
        return;
      }

      const response = await fetch("/api/calibration/web/intrinsic/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: srcUrl,
          checkerboard,
          sessionId: activeSessionId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Capture failed");

      if (data.snapshotDataUrl) {
        setSnapshotDataUrl(data.snapshotDataUrl);
      }
      if (data?.sample?.dataUrl) {
        setIntrinsicSamples((prev) => {
          const next = [data.sample, ...(Array.isArray(prev) ? prev : []).filter((item) => item?.name !== data.sample.name)];
          return next;
        });
        setIntrinsicActiveIndex(0);
      }
      setIntrinsicStatus(data.message || (data.found ? "Sample captured." : "Checkerboard not found."));
    } catch (err) {
      setIntrinsicStatus(`Error: ${err instanceof Error ? err.message : "Capture failed"}`);
    } finally {
      setJobLoading(false);
    }
  };

  const handleLoadSamples = async (sessionId) => {
    try {
      const sid = sessionId || intrinsicSessionId || "default";
      const res = await fetch(`/api/calibration/web/intrinsic/samples?sessionId=${encodeURIComponent(sid)}`);
      const data = await res.json();
      if (data?.ok && Array.isArray(data.samples)) {
        setIntrinsicSamples(data.samples);
        setIntrinsicActiveIndex(0);
      }
    } catch { /* ignore */ }
  };

  const handleSolveIntrinsic = async () => {
    try {
      setJobLoading(true);
      setSolveOutputLog("");
      setSolveMeta(null);
      setSolvePercent(4);
      setSolvePhase("Scanning intrinsic samples...");
      setIntrinsicStatus("Solving intrinsic calibration...");

      const phases = [
        [10, "Reading checkerboard images..."],
        [22, "Detecting checkerboard corners..."],
        [38, "Building 2D/3D correspondences..."],
        [56, "Estimating camera matrix..."],
        [74, "Refining distortion coefficients..."],
        [88, "Saving intrinsics file..."],
        [94, "Finalizing result..."],
      ];
      let phaseIdx = 0;
      if (solveTimerRef.current) {
        clearInterval(solveTimerRef.current);
      }
      solveTimerRef.current = setInterval(() => {
        setSolvePercent((prev) => {
          const next = Math.min(prev + 3, 94);
          while (phaseIdx < phases.length && next >= phases[phaseIdx][0]) {
            setSolvePhase(phases[phaseIdx][1]);
            phaseIdx += 1;
          }
          return next;
        });
      }, 700);

      const response = await fetch("/api/calibration/web/intrinsic/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: intrinsicSessionId || "default",
          checkerboard,
          squareSize,
          cameraType: "pinhole",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Solve failed");

      const solved = data?.result?.result || data?.result?.payload?.result || null;
      const rms = solved?.rms;
      const outputNpz = data.outputNpz || "";
      setSolvePercent(100);
      setSolvePhase("Intrinsic solve complete.");
      setSolveOutputLog(String(data?.stdout || "").trim());
      setSolveMeta({
        outputNpz,
        sampleCount: data?.sampleCount ?? intrinsicSamples.length,
        durationMs: data?.durationMs ?? null,
        executable: data?.executable || "",
        sessionId: data?.sessionId || intrinsicSessionId || "default",
      });
      if (solved) {
        setIntrinsicSolveResult(solved);
        setIntrinsicsPath(outputNpz);
        setIntrinsicStatus(`Solved. RMS=${typeof rms === "number" ? rms.toFixed(4) : "n/a"}. Auto-saved to ${outputNpz}`);
        setStageOutput("intrinsic", {
          completed: true,
          timestamp: new Date().toISOString(),
          intrinsicsPath: outputNpz,
        });
      } else {
        setIntrinsicStatus("Intrinsic solve returned no result. Check session images.");
      }
    } catch (err) {
      setIntrinsicStatus(`Error: ${err.message}`);
      setSolvePercent(0);
      setSolvePhase(err instanceof Error ? err.message : "Solve failed");
      setSolveMeta(null);
    } finally {
      if (solveTimerRef.current) {
        clearInterval(solveTimerRef.current);
        solveTimerRef.current = null;
      }
      setJobLoading(false);
    }
  };

  const handleDownloadCheckerboardPdf = async () => {
    try {
      setCheckerboardPdfStatus("Generating checkerboard PDF...");
      const res = await fetch("/api/calibration/web/intrinsic/checkerboard-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkerboard,
          squareMm: Number(checkerboardSquareMm) || 30,
          marginMm: 10,
        }),
      });
      if (!res.ok) {
        let msg = "Failed";
        try { const d = await res.json(); msg = d?.error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `checkerboard-${checkerboard}-${checkerboardSquareMm}mm-A3-landscape.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setCheckerboardPdfStatus("PDF generated. Print at 100% scale.");
    } catch (err) {
      setCheckerboardPdfStatus(`Error: ${err.message}`);
    }
  };

  const handleSaveCurrentCalibration = () => {
    setStageOutput("intrinsic", {
      completed: Boolean(stageOutputs?.intrinsic?.completed),
      timestamp: new Date().toISOString(),
      intrinsicsPath: intrinsicsPath || stageOutputs?.intrinsic?.intrinsicsPath || "",
      sampleCount: intrinsicSamples.length,
      sessionId: intrinsicSessionId || `${projectId}-${cameraId}`,
    });
    setIntrinsicStatus("Current intrinsic calibration state saved.");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Step 1: Intrinsic Calibration</h1>
          <p className="text-sm text-zinc-400 mt-1">Project {projectId} • Camera {cameraId}</p>
        </div>
        <button
          onClick={() => router.push(`/project/${projectId}/camera/${cameraId}`)}
          className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition"
        >
          ← Back
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-200">Camera Information</h2>
        <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
          <div>Camera name: <span className="text-zinc-200">{cameraInfo?.name || cameraId}</span></div>
          <div>Source type: <span className="text-zinc-200">{detectSourceType(cameraSourceUrl)}</span></div>
          <div>Camera ID: <span className="text-zinc-200">{cameraId}</span></div>
          <div>Preview mode: <span className="text-zinc-200">{sourceMode === "webcam" ? "Browser webcam" : "MJPEG bridge"}</span></div>
          <div className="sm:col-span-2 break-all">Source URL: <span className="text-zinc-200">{cameraSourceUrl || "Not configured"}</span></div>
        </div>
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
            sourceMode,
            feedEnabled,
            liveFeedSrc,
            snapshotDataUrl,
            jobLoading,
            sequenceRunning: false,
            solvePercent,
            solvePhase,
            solveOutputLog,
            solveMeta,
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
            deleteIntrinsicSample: async (name) => {
              if (!name) return;
              try {
                await fetch("/api/calibration/web/intrinsic/samples", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ sessionId: intrinsicSessionId || "default", fileName: name }),
                });
              } catch { /* ignore */ }
              await handleLoadSamples(intrinsicSessionId || "default");
            },
            loadIntrinsicSamples: () => handleLoadSamples(intrinsicSessionId || "default"),
            downloadCheckerboardPdf: handleDownloadCheckerboardPdf,
            downloadIntrinsicSummary: () => {},
            onFeedError,
            clearFeedError: () => setFeedError(""),
          }}
          refs={{ intrinsicVideoRef }}
          renderStageStatus={() => <div className="text-xs text-zinc-300">{intrinsicStatus}</div>}
        />
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => router.push(`/project/${projectId}/camera/${cameraId}`)}
          className="flex-1 px-6 py-3 rounded bg-zinc-800 hover:bg-zinc-700 transition font-medium"
        >
          Back Camera Steps
        </button>
        <button
          onClick={handleSaveCurrentCalibration}
          className="flex-1 px-6 py-3 rounded bg-amber-600 hover:bg-amber-700 transition font-medium"
        >
          Save Intrinsic Calibration
        </button>
        <button
          onClick={() => router.push(`/project/${projectId}/camera/${cameraId}/plane-mapping`)}
          className="flex-1 px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-700 transition font-medium"
        >
          Next Plane Mapping
        </button>
      </div>
    </div>
  );
}
