"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function rotateXY([x, y], angleRad) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return [x * c - y * s, x * s + y * c];
}

function norm3(v) {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-9) return null;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function rodriguesMatrix(rvec) {
  if (!Array.isArray(rvec) || rvec.length !== 3) return null;
  const angle = Math.hypot(rvec[0], rvec[1], rvec[2]);
  if (angle < 1e-10) {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  }
  const kx = rvec[0] / angle;
  const ky = rvec[1] / angle;
  const kz = rvec[2] / angle;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    [t * kx * kx + c, t * kx * ky - s * kz, t * kx * kz + s * ky],
    [t * kx * ky + s * kz, t * ky * ky + c, t * ky * kz - s * kx],
    [t * kx * kz - s * ky, t * ky * kz + s * kx, t * kz * kz + c],
  ];
}

function matTmulVec3(m, v) {
  return [
    m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
    m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
    m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
  ];
}

function intersectRayWithGround(origin, dir) {
  if (!origin || !dir) return null;
  if (Math.abs(dir[2]) < 1e-6) return null;
  const t = -origin[2] / dir[2];
  if (!Number.isFinite(t) || t <= 0) return null;
  return [
    origin[0] + t * dir[0],
    origin[1] + t * dir[1],
    0,
  ];
}

function defaultHorizontalFovDeg(cameraType) {
  switch (String(cameraType || "").toLowerCase()) {
    case "fisheye":
      return 150;
    case "wide-angle":
    case "wide_angle":
      return 110;
    case "cctv":
      return 85;
    default:
      return 68;
  }
}

function buildCameraConeGeometry(cameraPosition, cameraIntrinsic, sceneScale) {
  const origin = Array.isArray(cameraPosition?.position) && cameraPosition.position.length === 3
    ? cameraPosition.position
    : null;
  const lookDir = norm3(cameraPosition?.lookDir);
  if (!origin || !lookDir) {
    return null;
  }

  const K = cameraIntrinsic?.K;
  const imgW = Number(cameraIntrinsic?.imageWidth) > 1 ? Number(cameraIntrinsic.imageWidth) : 1280;
  const imgH = Number(cameraIntrinsic?.imageHeight) > 1 ? Number(cameraIntrinsic.imageHeight) : 720;

  const buildRayFromPixel = (u, v) => {
    if (!Array.isArray(K) || K.length !== 3 || !Array.isArray(K[0])) {
      return null;
    }
    const fx = Number(K?.[0]?.[0]);
    const fy = Number(K?.[1]?.[1]);
    const cx = Number(K?.[0]?.[2]);
    const cy = Number(K?.[1]?.[2]);
    if (!(fx > 0) || !(fy > 0)) {
      return null;
    }
    const R = rodriguesMatrix(cameraPosition?._rvec);
    if (!R) {
      return null;
    }
    const rayCam = norm3([(u - cx) / fx, (v - cy) / fy, 1]);
    if (!rayCam) {
      return null;
    }
    return norm3(matTmulVec3(R, rayCam));
  };

  const boundaryPixels = [
    [0, imgH * 0.55],
    [imgW * 0.1, imgH * 0.88],
    [imgW * 0.9, imgH * 0.88],
    [imgW, imgH * 0.55],
  ];
  const boundaryGround = [];
  for (const [u, v] of boundaryPixels) {
    const ray = buildRayFromPixel(u, v);
    const ground = intersectRayWithGround(origin, ray);
    if (ground) {
      boundaryGround.push(ground);
    }
  }

  const centerRay = buildRayFromPixel(imgW / 2, imgH / 2) || lookDir;
  const centerGround = intersectRayWithGround(origin, centerRay);

  if (boundaryGround.length >= 2) {
    const sorted = [...boundaryGround].sort((a, b) => {
      const aa = Math.atan2(a[1] - origin[1], a[0] - origin[0]);
      const bb = Math.atan2(b[1] - origin[1], b[0] - origin[0]);
      return aa - bb;
    });
    return { origin, centerGround, boundaryGround: sorted };
  }

  const sceneLen = Math.max(sceneScale * 0.9, 2.5);
  const hfovDeg = defaultHorizontalFovDeg(cameraIntrinsic?.cameraType || cameraPosition?.cameraType);
  const half = (hfovDeg * Math.PI) / 360;
  const dirXY = norm3([lookDir[0], lookDir[1], 0]) || [0, 1, 0];
  const leftXY = rotateXY([dirXY[0], dirXY[1]], -half);
  const rightXY = rotateXY([dirXY[0], dirXY[1]], half);

  let fallbackCenter = centerGround;
  if (!fallbackCenter) {
    fallbackCenter = [
      origin[0] + dirXY[0] * sceneLen,
      origin[1] + dirXY[1] * sceneLen,
      0,
    ];
  }

  const sideWidth = Math.max(sceneLen * Math.tan(half), sceneLen * 0.18);
  const perp = [-dirXY[1], dirXY[0]];
  const leftGround = intersectRayWithGround(origin, norm3([leftXY[0], leftXY[1], Math.min(lookDir[2], -0.25)])) || [
    fallbackCenter[0] - perp[0] * sideWidth,
    fallbackCenter[1] - perp[1] * sideWidth,
    0,
  ];
  const rightGround = intersectRayWithGround(origin, norm3([rightXY[0], rightXY[1], Math.min(lookDir[2], -0.25)])) || [
    fallbackCenter[0] + perp[0] * sideWidth,
    fallbackCenter[1] + perp[1] * sideWidth,
    0,
  ];

  return {
    origin,
    centerGround: fallbackCenter,
    boundaryGround: [leftGround, rightGround],
  };
}

function getCameraPresetAngles(cameraPosition) {
  const lookDir = norm3(cameraPosition?.lookDir);
  if (!lookDir) return null;
  const horiz = Math.hypot(lookDir[0], lookDir[1]);
  const yawDeg = (Math.atan2(-lookDir[0], -lookDir[1]) * 180) / Math.PI;
  const pitchDeg = (-Math.atan2(horiz, lookDir[2]) * 180) / Math.PI;
  return {
    yaw: yawDeg,
    pitch: Math.max(-89.5, Math.min(89.5, pitchDeg)),
  };
}

export default function ProjectedCadViewer({ segments, onPickWorld, pickedWorldPoints = [], validationWorldPoints = [], title = "", cameraPosition = null, cameraIntrinsic = null }) {
  const canvasRef = useRef(null);
  const [yaw, setYaw] = useState(35);
  const [pitch, setPitch] = useState(-28);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const dragRef = useRef({ dragging: false, mode: "rotate", x: 0, y: 0 });
  const projectedRef = useRef([]);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const points = useMemo(() => {
    const all = [];
    for (const s of segments) {
      all.push(s.a, s.b);
    }
    if (Array.isArray(cameraPosition?.position) && cameraPosition.position.length === 3) {
      all.push(cameraPosition.position);
    }
    return all;
  }, [segments, cameraPosition]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!segments.length || !points.length) {
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "14px sans-serif";
      ctx.fillText("No preview geometry", 20, 30);
      return;
    }

    const center = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
    center[0] /= points.length;
    center[1] /= points.length;
    center[2] /= points.length;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const p of points) {
      minX = Math.min(minX, p[0]);
      minY = Math.min(minY, p[1]);
      minZ = Math.min(minZ, p[2]);
      maxX = Math.max(maxX, p[0]);
      maxY = Math.max(maxY, p[1]);
      maxZ = Math.max(maxZ, p[2]);
    }

    const y = (yaw * Math.PI) / 180;
    const x = (pitch * Math.PI) / 180;

    const cy = Math.cos(y);
    const sy = Math.sin(y);
    const cx = Math.cos(x);
    const sx = Math.sin(x);

    const project = (p) => {
      const px = p[0] - center[0];
      const py = p[1] - center[1];
      const pz = p[2] - center[2];

      const yawX = px * cy - py * sy;
      const yawY = px * sy + py * cy;

      const pitchY = yawY * cx - pz * sx;
      const pitchZ = yawY * sx + pz * cx;

      const depth = 6 + pitchZ;
      const scale = (120 / Math.max(depth, 0.8)) * zoom;
      const sx2 = canvas.width / 2 + yawX * scale + panX;
      const sy2 = canvas.height / 2 - pitchY * scale + panY;
      return [sx2, sy2];
    };

    const projected = [];

    const boxCorners = [
      [minX, minY, minZ],
      [maxX, minY, minZ],
      [maxX, maxY, minZ],
      [minX, maxY, minZ],
      [minX, minY, maxZ],
      [maxX, minY, maxZ],
      [maxX, maxY, maxZ],
      [minX, maxY, maxZ],
    ];
    const boxEdges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    for (const [a, b] of boxEdges) {
      const p1 = project(boxCorners[a]);
      const p2 = project(boxCorners[b]);
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
    }

    const axisLen = Math.max(maxX - minX, maxY - minY, maxZ - minZ) * 0.35 || 1;
    const c0 = center;
    const xAxis = [c0[0] + axisLen, c0[1], c0[2]];
    const yAxis = [c0[0], c0[1] + axisLen, c0[2]];
    const zAxis = [c0[0], c0[1], c0[2] + axisLen];
    const c2 = project(c0);
    const x2 = project(xAxis);
    const y2 = project(yAxis);
    const z2 = project(zAxis);

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ef4444";
    ctx.beginPath(); ctx.moveTo(c2[0], c2[1]); ctx.lineTo(x2[0], x2[1]); ctx.stroke();
    ctx.strokeStyle = "#22c55e";
    ctx.beginPath(); ctx.moveTo(c2[0], c2[1]); ctx.lineTo(y2[0], y2[1]); ctx.stroke();
    ctx.strokeStyle = "#3b82f6";
    ctx.beginPath(); ctx.moveTo(c2[0], c2[1]); ctx.lineTo(z2[0], z2[1]); ctx.stroke();
    ctx.fillStyle = "#ef4444";
    ctx.fillText("X", x2[0] + 4, x2[1] - 4);
    ctx.fillStyle = "#22c55e";
    ctx.fillText("Y", y2[0] + 4, y2[1] - 4);
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("Z", z2[0] + 4, z2[1] - 4);

    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 1;
    for (const seg of segments) {
      const p1 = project(seg.a);
      const p2 = project(seg.b);
      projected.push({ world: seg.a, screen: p1 });
      projected.push({ world: seg.b, screen: p2 });
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
    }

    projectedRef.current = projected;

    if (pickedWorldPoints.length) {
      ctx.fillStyle = "#22c55e";
      ctx.strokeStyle = "#052e16";
      ctx.font = "bold 13px sans-serif";
      for (let i = 0; i < pickedWorldPoints.length; i += 1) {
        const wp = pickedWorldPoints[i];
        const pp = project(wp);
        ctx.beginPath();
        ctx.arc(pp[0], pp[1], 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#052e16";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = "#22c55e";
        ctx.fillText(`m${i + 1}`, pp[0] + 8, pp[1] - 8);
        ctx.fillStyle = "#22c55e";
      }
    }

    if (validationWorldPoints.length) {
      ctx.font = "bold 13px sans-serif";
      for (let i = 0; i < validationWorldPoints.length; i += 1) {
        const wp = validationWorldPoints[i];
        const pp = project(wp);
        // amber fill with dark border
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(pp[0], pp[1], 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#7c2d12";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#f59e0b";
        ctx.fillText(`V${i + 1}`, pp[0] + 9, pp[1] - 9);
      }
    }

    if (hoveredPoint?.world) {
      const hp = project(hoveredPoint.world);
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(hp[0], hp[1], 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText("preview", hp[0] + 8, hp[1] - 8);
    }

    // ---- Camera position overlay ----
    if (cameraPosition && Array.isArray(cameraPosition.position) && cameraPosition.position.length === 3) {
      const camWorld = cameraPosition.position;
      const lookDir = Array.isArray(cameraPosition.lookDir) ? cameraPosition.lookDir : [0, 0, 1];
      const cp = project(camWorld);
      const sceneScale = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;

      // Draw camera icon: filled magenta circle with cross
      ctx.save();
      ctx.fillStyle = "#d946ef";
      ctx.strokeStyle = "#4a044e";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cp[0], cp[1], 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Cross
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cp[0] - 6, cp[1]); ctx.lineTo(cp[0] + 6, cp[1]); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cp[0], cp[1] - 6); ctx.lineTo(cp[0], cp[1] + 6); ctx.stroke();
      // Label
      ctx.fillStyle = "#e879f9";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText("CAM", cp[0] + 11, cp[1] - 11);
      ctx.restore();

      // Look-direction arrow on the ground plane (project look direction to Z=0)
      const lookXY = [lookDir[0], lookDir[1]];
      const lenXY = Math.sqrt(lookXY[0] ** 2 + lookXY[1] ** 2);
      if (lenXY > 0.01) {
        const scale = Math.max(maxX - minX, maxY - minY) * 0.18 || 2;
        const arrowEnd = [
          camWorld[0] + (lookXY[0] / lenXY) * scale,
          camWorld[1] + (lookXY[1] / lenXY) * scale,
          camWorld[2],
        ];
        const ap = project(arrowEnd);
        ctx.save();
        ctx.strokeStyle = "#f0abfc";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(cp[0], cp[1]);
        ctx.lineTo(ap[0], ap[1]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Arrowhead
        const angle = Math.atan2(ap[1] - cp[1], ap[0] - cp[0]);
        ctx.fillStyle = "#f0abfc";
        ctx.beginPath();
        ctx.moveTo(ap[0], ap[1]);
        ctx.lineTo(ap[0] - 10 * Math.cos(angle - 0.4), ap[1] - 10 * Math.sin(angle - 0.4));
        ctx.lineTo(ap[0] - 10 * Math.cos(angle + 0.4), ap[1] - 10 * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      const cone = buildCameraConeGeometry(cameraPosition, cameraIntrinsic, sceneScale);
      if (cone?.boundaryGround?.length >= 2) {
        const boundaryPts = cone.boundaryGround.map((p) => project(p));
        const centerPt = cone.centerGround ? project(cone.centerGround) : null;
        ctx.save();
        ctx.fillStyle = "rgba(217,70,239,0.10)";
        ctx.strokeStyle = "rgba(217,70,239,0.58)";
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.moveTo(cp[0], cp[1]);
        for (const pt of boundaryPts) {
          ctx.lineTo(pt[0], pt[1]);
        }
        ctx.closePath();
        ctx.fill();

        ctx.setLineDash([5, 4]);
        for (const pt of boundaryPts) {
          ctx.beginPath();
          ctx.moveTo(cp[0], cp[1]);
          ctx.lineTo(pt[0], pt[1]);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(boundaryPts[0][0], boundaryPts[0][1]);
        for (let i = 1; i < boundaryPts.length; i += 1) {
          ctx.lineTo(boundaryPts[i][0], boundaryPts[i][1]);
        }
        ctx.stroke();
        if (centerPt) {
          ctx.strokeStyle = "rgba(244,114,182,0.9)";
          ctx.beginPath();
          ctx.moveTo(cp[0], cp[1]);
          ctx.lineTo(centerPt[0], centerPt[1]);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    if (title) {
      ctx.fillStyle = "#e5e7eb";
      ctx.font = "13px sans-serif";
      ctx.fillText(title, 12, 22);
    }
  }, [segments, yaw, pitch, points, zoom, panX, panY, pickedWorldPoints, validationWorldPoints, hoveredPoint, title, cameraPosition, cameraIntrinsic]);

  function onMouseDown(e) {
    const mode = e.button === 2 ? "pan" : "rotate";
    dragRef.current = {
      dragging: true,
      mode,
      x: e.clientX,
      y: e.clientY,
    };
  }

  function onMouseMove(e) {
    if (!dragRef.current.dragging) {
      return;
    }

    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;

    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;

    if (dragRef.current.mode === "rotate") {
      setYaw((v) => v - dx * 0.35);
      setPitch((v) => v - dy * 0.35);
    } else {
      setPanX((v) => v + dx);
      setPanY((v) => v + dy);
    }

    if (dragRef.current.dragging) {
      setHoveredPoint(null);
    }
  }

  function onMouseUp() {
    dragRef.current.dragging = false;
  }

  function onWheel(e) {
    e.preventDefault();
    const next = e.deltaY < 0 ? zoom * 1.08 : zoom / 1.08;
    setZoom(Math.max(0.2, Math.min(4, next)));
  }

  function onResetView() {
    setYaw(35);
    setPitch(-28);
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }

  function onCameraPresetView() {
    const preset = getCameraPresetAngles(cameraPosition);
    if (!preset) {
      return;
    }
    setYaw(preset.yaw);
    setPitch(preset.pitch);
    setZoom(1.15);
    setPanX(0);
    setPanY(0);
  }

  function onCanvasClick(e) {
    if (typeof onPickWorld !== "function") {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const item of projectedRef.current) {
      const dx = item.screen[0] - x;
      const dy = item.screen[1] - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        best = item;
      }
    }

    if (best && bestDist <= 24) {
      onPickWorld(best.world);
    }
  }

  function onCanvasMove(e) {
    onMouseMove(e);
    if (dragRef.current.dragging) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const item of projectedRef.current) {
      const dx = item.screen[0] - x;
      const dy = item.screen[1] - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        best = item;
      }
    }

    if (best && bestDist <= 26) {
      setHoveredPoint(best);
    } else {
      setHoveredPoint(null);
    }
  }

  function applyPresetView(name) {
    if (name === "camera") {
      onCameraPresetView();
    } else if (name === "front") {
      setYaw(0);
      setPitch(0);
    } else if (name === "back") {
      setYaw(180);
      setPitch(0);
    } else if (name === "left") {
      setYaw(-90);
      setPitch(0);
    } else if (name === "right") {
      setYaw(90);
      setPitch(0);
    } else if (name === "top") {
      setYaw(0);
      setPitch(-90);
    } else if (name === "bottom") {
      setYaw(0);
      setPitch(90);
    } else {
      onResetView();
    }
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={620}
        height={360}
        onMouseDown={onMouseDown}
        onMouseMove={onCanvasMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={onWheel}
        onClick={onCanvasClick}
        className="w-full rounded border border-zinc-700 cursor-grab active:cursor-grabbing"
      />
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>Mouse: Left drag rotate | Right drag pan | Wheel zoom</span>
        <button onClick={onResetView} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Reset View</button>
      </div>
      <div className="text-xs text-zinc-500">Current view — Yaw: {yaw.toFixed(1)}°, Pitch: {pitch.toFixed(1)}°</div>
      <div className="flex flex-wrap gap-2 text-xs">
        <button onClick={() => applyPresetView("front")} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Front</button>
        <button onClick={() => applyPresetView("left")} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Left</button>
        <button onClick={() => applyPresetView("right")} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Right</button>
        <button onClick={() => applyPresetView("back")} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Back</button>
        <button onClick={() => applyPresetView("top")} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Top</button>
        <button onClick={() => applyPresetView("bottom")} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Bottom</button>
        <button onClick={() => applyPresetView("camera")} disabled={!cameraPosition} className="rounded border border-fuchsia-700 px-2 py-1 hover:bg-zinc-800 disabled:opacity-40">Camera</button>
        <button onClick={() => applyPresetView("iso")} className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800">Iso</button>
      </div>
    </div>
  );
}
