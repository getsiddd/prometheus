"use client";

/**
 * CameraPositionPanel
 *
 * Derives and displays the camera's world-space position and orientation
 * from a completed PnP solve result.
 *
 * Math:
 *   Given the OpenCV world-to-camera transform (R, t):
 *     Camera center in world coords: C = -R^T * t
 *     Optical axis in world coords : a = R^T * [0, 0, 1]
 *     Height above ground (Z=0)    : C[2]
 *     Tilt from vertical           : acos(a · [0,0,1]) in degrees
 *     Azimuth / pan in XY plane    : atan2(a[1], a[0]) in degrees
 */
export default function CameraPositionPanel({ pnpSolveResult }) {
  const pos = deriveCameraPosition(pnpSolveResult);

  if (!pos) {
    return (
      <div className="rounded border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-400">
        Camera position not yet available — solve Ground Plane first.
      </div>
    );
  }

  const fmt = (v, d = 3) => (typeof v === "number" ? v.toFixed(d) : "—");

  return (
    <div className="rounded border border-violet-700 bg-violet-950/30 p-3 space-y-2 text-xs">
      <div className="font-semibold text-violet-300">📍 Camera World Position</div>

      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
        <div><span className="text-zinc-400">X:</span> <span className="text-white">{fmt(pos.position[0])} m</span></div>
        <div><span className="text-zinc-400">Y:</span> <span className="text-white">{fmt(pos.position[1])} m</span></div>
        <div><span className="text-zinc-400">Z (height):</span> <span className="text-white">{fmt(pos.position[2])} m</span></div>
      </div>

      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
        <div><span className="text-zinc-400">Tilt from vert.:</span> <span className="text-yellow-300">{fmt(pos.tiltDeg, 1)}°</span></div>
        <div><span className="text-zinc-400">Azimuth / pan:</span> <span className="text-yellow-300">{fmt(pos.panDeg, 1)}°</span></div>
        <div><span className="text-zinc-400">Reproj RMSE:</span> <span className="text-emerald-300">{typeof pos.reprojRmse === "number" ? pos.reprojRmse.toFixed(2) + " px" : "—"}</span></div>
      </div>

      <details className="text-zinc-500">
        <summary className="cursor-pointer select-none text-zinc-400 hover:text-zinc-200">Look direction (world)</summary>
        <div className="mt-1 grid gap-x-4 sm:grid-cols-3">
          <div>dx: {fmt(pos.lookDir[0])}</div>
          <div>dy: {fmt(pos.lookDir[1])}</div>
          <div>dz: {fmt(pos.lookDir[2])}</div>
        </div>
      </details>
    </div>
  );
}

/**
 * Compute camera world position and orientation from a PnP solve result.
 * Returns null if the result is missing or malformed.
 *
 * @param {object|null} pnpSolveResult
 * @returns {{ position: number[], lookDir: number[], tiltDeg: number, panDeg: number, reprojRmse: number|null }|null}
 */
export function deriveCameraPosition(pnpSolveResult) {
  const rvec = pnpSolveResult?.pose?.rvec;
  const tvec = pnpSolveResult?.pose?.tvec;

  if (!Array.isArray(rvec) || rvec.length !== 3 || !Array.isArray(tvec) || tvec.length !== 3) {
    return null;
  }

  // Rodrigues rotation vector → 3×3 rotation matrix (world-to-camera)
  const angle = Math.sqrt(rvec[0] ** 2 + rvec[1] ** 2 + rvec[2] ** 2);
  if (angle < 1e-10) return null;

  const kx = rvec[0] / angle;
  const ky = rvec[1] / angle;
  const kz = rvec[2] / angle;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;

  // R (row-major): R[row][col]
  const R = [
    [t * kx * kx + c,       t * kx * ky - s * kz, t * kx * kz + s * ky],
    [t * kx * ky + s * kz,  t * ky * ky + c,       t * ky * kz - s * kx],
    [t * kx * kz - s * ky,  t * ky * kz + s * kx,  t * kz * kz + c],
  ];

  const tx = tvec[0];
  const ty = tvec[1];
  const tz = tvec[2];

  // Camera center in world: C = -R^T * t
  // (R^T)[i][j] = R[j][i], so (R^T * t)[i] = sum_j R[j][i] * t[j]
  const Cx = -(R[0][0] * tx + R[1][0] * ty + R[2][0] * tz);
  const Cy = -(R[0][1] * tx + R[1][1] * ty + R[2][1] * tz);
  const Cz = -(R[0][2] * tx + R[1][2] * ty + R[2][2] * tz);

  // Optical axis in world: R^T * [0,0,1] = third row of R^T = third column of R = [R[0][2], R[1][2], R[2][2]]
  // But we want the direction the camera is LOOKING: the +Z axis in camera space, in world coordinates.
  // (R^T * [0,0,1])[i] = R[2][i] — third row of R transposed = R column 2
  const axX = R[0][2];
  const axY = R[1][2];
  const axZ = R[2][2];

  // Tilt from vertical (assuming Z is up in world)
  const tiltRad = Math.acos(Math.max(-1, Math.min(1, axZ)));
  const tiltDeg = (tiltRad * 180) / Math.PI;

  // Azimuth in XY plane
  const panDeg = (Math.atan2(axY, axX) * 180) / Math.PI;

  return {
    position: [Cx, Cy, Cz],
    lookDir: [axX, axY, axZ],
    tiltDeg,
    panDeg,
    reprojRmse: pnpSolveResult?.pose?.reproj_rmse_px ?? null,
    // raw vectors kept for FOV cone projection in the CAD viewer
    _rvec: rvec,
    _tvec: tvec,
  };
}
