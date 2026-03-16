"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function buildDraftCamera(index = 1) {
  return {
    id: `cam-${index}`,
    name: `Camera ${index}`,
    location: "",
    cameraType: "cctv",
    sourceMode: "rtsp",
    sourceUrl: "",
    intrinsicsPath: "",
    checkerboard: "9x6",
    squareSize: 0.024,
    minSamples: 18,
  };
}

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function ProjectEntryPage() {
  const router = useRouter();
  const sharedDwgInputRef = useRef(null);
  const projectConfigInputRef = useRef(null);

  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [status, setStatus] = useState("Create a new project or open an existing one.");
  const [deletingProjectId, setDeletingProjectId] = useState("");

  const [projectName, setProjectName] = useState("multi-camera-project");
  const [projectDescription, setProjectDescription] = useState("");
  const [sharedDwgPath, setSharedDwgPath] = useState("");
  const [sharedDwgFileName, setSharedDwgFileName] = useState("");
  const [sharedDwgSegments, setSharedDwgSegments] = useState([]);
  const [cameras, setCameras] = useState([buildDraftCamera(1)]);
  const [submitting, setSubmitting] = useState(false);

  async function loadProjects() {
    setLoadingProjects(true);
    try {
      const res = await fetch("/api/calibration/web/projects");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load project list");
      }
      setProjects(Array.isArray(data?.projects) ? data.projects : []);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load project list");
    } finally {
      setLoadingProjects(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  function addCamera() {
    setCameras((prev) => [...prev, buildDraftCamera(prev.length + 1)]);
  }

  function removeCamera(index) {
    setCameras((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== index) : prev));
  }

  function updateCamera(index, field, value) {
    setCameras((prev) =>
      prev.map((camera, idx) => {
        if (idx !== index) {
          return camera;
        }
        if (field === "squareSize" || field === "minSamples") {
          return { ...camera, [field]: asNumber(value, camera[field]) };
        }
        return { ...camera, [field]: value };
      })
    );
  }

  async function uploadSharedDwg(file) {
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads/dwg", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "DWG upload failed");
      }
      setSharedDwgPath(data?.path || "");
      setSharedDwgFileName(data?.fileName || data?.filename || file.name || "");
      setSharedDwgSegments(Array.isArray(data?.preview?.segments) ? data.preview.segments : []);
      setStatus(`Shared DWG uploaded: ${data?.fileName || data?.filename || file.name || "file"}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "DWG upload failed");
    }
  }

  async function createProject() {
    try {
      const normalizedName = String(projectName || "").trim();
      if (!normalizedName) {
        throw new Error("Project name is required.");
      }
      if (!sharedDwgPath) {
        throw new Error("Upload a shared DWG file first.");
      }

      const normalizedCameras = cameras
        .map((camera, index) => {
          const cameraId = String(camera.id || "").trim() || `cam-${index + 1}`;
          const cameraName = String(camera.name || "").trim() || `Camera ${index + 1}`;
          const location = String(camera.location || "").trim();
          return {
            id: cameraId,
            name: cameraName,
            location,
            area: location,
            cameraType: String(camera.cameraType || "cctv"),
            sourceMode: String(camera.sourceMode || "rtsp"),
            sourceUrl: String(camera.sourceUrl || "").trim(),
            intrinsicsPath: String(camera.intrinsicsPath || "").trim(),
            checkerboard: String(camera.checkerboard || "9x6"),
            squareSize: asNumber(camera.squareSize, 0.024),
            minSamples: asNumber(camera.minSamples, 18),
          };
        })
        .filter((camera) => camera.id && camera.name);

      if (!normalizedCameras.length) {
        throw new Error("Add at least one camera.");
      }

      const resolvedSharedDwgFileName = sharedDwgFileName || sharedDwgPath.split("/").pop() || "";
      const initialCameraWorkspaces = Object.fromEntries(
        normalizedCameras.map((camera) => [
          camera.id,
          {
            dwgPath: sharedDwgPath,
            dwgFileName: resolvedSharedDwgFileName,
            segments: Array.isArray(sharedDwgSegments) ? sharedDwgSegments : [],
          },
        ])
      );

      setSubmitting(true);
      const res = await fetch("/api/calibration/web/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectConfig: {
            schemaVersion: 2,
            projectName: normalizedName,
            projectDescription: String(projectDescription || "").trim(),
            sharedDwgPath,
            sharedDwgFileName: resolvedSharedDwgFileName,
            cameras: normalizedCameras,
            sharedMarkers: [],
            cameraWorkspaces: initialCameraWorkspaces,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Project creation failed");
      }

      router.push(`/project/${encodeURIComponent(data?.projectId || "")}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Project creation failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadProjectConfig(file) {
    try {
      setSubmitting(true);
      const form = new FormData();
      form.append("file", file);

      const importRes = await fetch("/api/calibration/web/project-config", {
        method: "POST",
        body: form,
      });
      const importData = await importRes.json();
      if (!importRes.ok) {
        throw new Error(importData?.error || "Project config upload failed");
      }

      const saveRes = await fetch("/api/calibration/web/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectConfig: importData?.projectConfig }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        throw new Error(saveData?.error || "Failed to import project");
      }

      router.push(`/project/${encodeURIComponent(saveData?.projectId || "")}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Project config upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteProject(projectId) {
    const normalizedProjectId = String(projectId || "").trim();
    if (!normalizedProjectId) {
      return;
    }

    const shouldDelete = window.confirm(
      `Delete project \"${normalizedProjectId}\"? This removes the saved project JSON from disk.`
    );
    if (!shouldDelete) {
      return;
    }

    try {
      setDeletingProjectId(normalizedProjectId);
      const res = await fetch(`/api/calibration/web/projects/${encodeURIComponent(normalizedProjectId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete project");
      }

      setProjects((prev) => prev.filter((project) => project.projectId !== normalizedProjectId));
      setStatus(`Deleted project: ${normalizedProjectId}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setDeletingProjectId("");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Project Creation / Open Project</h1>
          <p className="text-sm text-zinc-400">Create projects from the dashboard, upload shared DWG once, and resume existing projects.</p>
          <p className="text-xs text-zinc-500">{status}</p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-lg font-medium">Create New Project</h2>
            <label className="block text-sm">
              Project Name
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Description
              <textarea
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </label>

            <div className="rounded border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
              <p className="text-sm font-medium">Shared DWG Upload</p>
              <input
                ref={sharedDwgInputRef}
                type="file"
                accept=".dwg,.dxf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    uploadSharedDwg(file);
                  }
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => sharedDwgInputRef.current?.click()}
                className="rounded border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm hover:bg-zinc-800/60"
              >
                Upload Shared DWG
              </button>
              <p className="text-xs text-zinc-400 break-all">{sharedDwgPath || "No shared DWG uploaded."}</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Cameras</h3>
                <button
                  type="button"
                  onClick={addCamera}
                  className="rounded border border-emerald-700 bg-emerald-900/30 px-2 py-1 text-xs hover:bg-emerald-800/50"
                >
                  Add Camera
                </button>
              </div>

              {cameras.map((camera, index) => (
                <div key={`${camera.id}-${index}`} className="rounded border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-xs">
                      Camera ID
                      <input
                        value={camera.id}
                        onChange={(event) => updateCamera(index, "id", event.target.value)}
                        className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                      />
                    </label>
                    <label className="text-xs">
                      Camera Name
                      <input
                        value={camera.name}
                        onChange={(event) => updateCamera(index, "name", event.target.value)}
                        className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                      />
                    </label>
                    <label className="text-xs">
                      Location
                      <input
                        value={camera.location}
                        onChange={(event) => updateCamera(index, "location", event.target.value)}
                        className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                      />
                    </label>
                    <label className="text-xs">
                      Camera Type
                      <select
                        value={camera.cameraType}
                        onChange={(event) => updateCamera(index, "cameraType", event.target.value)}
                        className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                      >
                        <option value="cctv">CCTV</option>
                        <option value="pinhole">Pinhole</option>
                        <option value="fisheye">Fisheye</option>
                        <option value="wide-angle">Wide Angle</option>
                      </select>
                    </label>
                    <label className="text-xs">
                      Source Mode
                      <select
                        value={camera.sourceMode}
                        onChange={(event) => updateCamera(index, "sourceMode", event.target.value)}
                        className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                      >
                        <option value="rtsp">RTSP / File URL</option>
                        <option value="webcam">Browser Webcam</option>
                      </select>
                    </label>
                    <label className="text-xs sm:col-span-2">
                      Source URL
                      <input
                        value={camera.sourceUrl}
                        onChange={(event) => updateCamera(index, "sourceUrl", event.target.value)}
                        className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                      />
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeCamera(index)}
                      disabled={cameras.length <= 1}
                      className="rounded border border-rose-700 bg-rose-900/30 px-2 py-1 text-xs hover:bg-rose-800/50 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={createProject}
              disabled={submitting}
              className="rounded border border-sky-700 bg-sky-900/40 px-3 py-2 text-sm hover:bg-sky-800/50 disabled:opacity-50"
            >
              {submitting ? "Working..." : "Create Project"}
            </button>
          </div>

          <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-lg font-medium">Open Existing Project</h2>

            <div className="rounded border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
              <p className="text-sm font-medium">Upload Existing Project Config</p>
              <input
                ref={projectConfigInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    uploadProjectConfig(file);
                  }
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => projectConfigInputRef.current?.click()}
                className="rounded border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm hover:bg-zinc-800/60"
              >
                Upload Project JSON
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Saved Projects</h3>
                <button
                  type="button"
                  onClick={loadProjects}
                  className="rounded border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-xs hover:bg-zinc-700/60"
                >
                  Refresh
                </button>
              </div>

              {loadingProjects ? (
                <p className="text-sm text-zinc-400">Loading projects...</p>
              ) : projects.length < 1 ? (
                <p className="text-sm text-zinc-500">No saved projects found.</p>
              ) : (
                <div className="space-y-2">
                  {projects.map((project) => (
                    <div key={project.projectId} className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
                      <p className="text-sm font-medium">{project.projectName}</p>
                      <p className="text-xs text-zinc-400">ID: {project.projectId}</p>
                      <p className="text-xs text-zinc-500">Cameras: {project.cameraCount || 0}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/project/${encodeURIComponent(project.projectId)}`)}
                          className="rounded border border-emerald-700 bg-emerald-900/30 px-2 py-1 text-xs hover:bg-emerald-800/50"
                        >
                          Open Project
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteProject(project.projectId)}
                          disabled={deletingProjectId === project.projectId}
                          className="rounded border border-rose-700 bg-rose-900/30 px-2 py-1 text-xs hover:bg-rose-800/50 disabled:opacity-50"
                        >
                          {deletingProjectId === project.projectId ? "Deleting..." : "Delete Project"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
