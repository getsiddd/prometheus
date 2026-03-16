from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import yaml


@dataclass
class Pose:
	rvec: np.ndarray
	tvec: np.ndarray
	rmse_px: float
	method: str


def _to_numpy_intrinsics(payload: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
	k = np.array(payload["intrinsic"]["K"], dtype=np.float64)
	d = np.array(payload["intrinsic"]["D"], dtype=np.float64).reshape(-1, 1)
	return k, d


def _to_points(payload: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
	world = []
	pixel = []
	for c in payload["correspondences"]:
		world.append(c["world"])
		pixel.append(c["pixel"])
	obj = np.array(world, dtype=np.float64)
	img = np.array(pixel, dtype=np.float64)
	return obj, img


def _reproj_rmse(obj: np.ndarray, img: np.ndarray, k: np.ndarray, d: np.ndarray, rvec: np.ndarray, tvec: np.ndarray) -> float:
	proj, _ = cv2.projectPoints(obj, rvec, tvec, k, d)
	proj = proj.reshape(-1, 2)
	err = np.linalg.norm(proj - img, axis=1)
	return float(np.sqrt(np.mean(err * err)))


def solve_pose_homography(payload: dict[str, Any]) -> Pose:
	k, d = _to_numpy_intrinsics(payload)
	obj, img = _to_points(payload)
	if obj.shape[0] < 4:
		raise ValueError("Need at least 4 correspondences for homography pose")

	plane = obj[:, :2].reshape(-1, 1, 2)
	und = cv2.undistortPoints(img.reshape(-1, 1, 2), k, d).reshape(-1, 2)
	h, _ = cv2.findHomography(plane, und.reshape(-1, 1, 2), method=0)
	if h is None:
		raise RuntimeError("Homography solve failed")

	h1 = h[:, 0]
	h2 = h[:, 1]
	h3 = h[:, 2]

	s1 = np.linalg.norm(h1)
	s2 = np.linalg.norm(h2)
	scale = (s1 + s2) * 0.5

	r1 = h1 / scale
	r2 = h2 / scale
	r3 = np.cross(r1, r2)
	r_approx = np.column_stack([r1, r2, r3])

	u, _, vt = np.linalg.svd(r_approx)
	r = u @ vt
	if np.linalg.det(r) < 0:
		r[:, 2] *= -1.0
	t = (h3 / scale).reshape(3, 1)

	rvec, _ = cv2.Rodrigues(r)
	rmse = _reproj_rmse(obj, img, k, d, rvec, t)
	return Pose(rvec=rvec.reshape(3, 1), tvec=t.reshape(3, 1), rmse_px=rmse, method="homography")


def solve_pose_pnp(payload: dict[str, Any], use_guess: bool = False, init_pose: Pose | None = None) -> Pose:
	k, d = _to_numpy_intrinsics(payload)
	obj, img = _to_points(payload)
	if obj.shape[0] < 4:
		raise ValueError("Need at least 4 correspondences for PnP")

	if use_guess and init_pose is not None:
		ok, rvec, tvec = cv2.solvePnP(
			obj,
			img,
			k,
			d,
			rvec=init_pose.rvec.copy(),
			tvec=init_pose.tvec.copy(),
			useExtrinsicGuess=True,
			flags=cv2.SOLVEPNP_ITERATIVE,
		)
		method = "pnp_iterative_refined"
	else:
		ok, rvec, tvec = cv2.solvePnP(
			obj,
			img,
			k,
			d,
			flags=cv2.SOLVEPNP_ITERATIVE,
		)
		method = "pnp_iterative"

	if not ok:
		raise RuntimeError("PnP solve failed")

	rmse = _reproj_rmse(obj, img, k, d, rvec, tvec)
	return Pose(rvec=rvec.reshape(3, 1), tvec=tvec.reshape(3, 1), rmse_px=rmse, method=method)


def _rvec_to_quat(rvec: np.ndarray) -> np.ndarray:
	r, _ = cv2.Rodrigues(rvec)
	tr = np.trace(r)
	if tr > 0.0:
		s = math.sqrt(tr + 1.0) * 2.0
		qw = 0.25 * s
		qx = (r[2, 1] - r[1, 2]) / s
		qy = (r[0, 2] - r[2, 0]) / s
		qz = (r[1, 0] - r[0, 1]) / s
	elif (r[0, 0] > r[1, 1]) and (r[0, 0] > r[2, 2]):
		s = math.sqrt(1.0 + r[0, 0] - r[1, 1] - r[2, 2]) * 2.0
		qw = (r[2, 1] - r[1, 2]) / s
		qx = 0.25 * s
		qy = (r[0, 1] + r[1, 0]) / s
		qz = (r[0, 2] + r[2, 0]) / s
	elif r[1, 1] > r[2, 2]:
		s = math.sqrt(1.0 + r[1, 1] - r[0, 0] - r[2, 2]) * 2.0
		qw = (r[0, 2] - r[2, 0]) / s
		qx = (r[0, 1] + r[1, 0]) / s
		qy = 0.25 * s
		qz = (r[1, 2] + r[2, 1]) / s
	else:
		s = math.sqrt(1.0 + r[2, 2] - r[0, 0] - r[1, 1]) * 2.0
		qw = (r[1, 0] - r[0, 1]) / s
		qx = (r[0, 2] + r[2, 0]) / s
		qy = (r[1, 2] + r[2, 1]) / s
		qz = 0.25 * s

	q = np.array([qw, qx, qy, qz], dtype=np.float64)
	return q / np.linalg.norm(q)


def _quat_to_rvec(q: np.ndarray) -> np.ndarray:
	qw, qx, qy, qz = q / np.linalg.norm(q)
	r = np.array(
		[
			[1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
			[2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
			[2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)],
		],
		dtype=np.float64,
	)
	rvec, _ = cv2.Rodrigues(r)
	return rvec.reshape(3, 1)


def fuse_pose(h_pose: Pose, p_pose: Pose) -> Pose:
	eps = 1e-9
	wh = 1.0 / max(h_pose.rmse_px, eps)
	wp = 1.0 / max(p_pose.rmse_px, eps)

	qh = _rvec_to_quat(h_pose.rvec)
	qp = _rvec_to_quat(p_pose.rvec)
	if np.dot(qh, qp) < 0.0:
		qp = -qp

	q = (wh * qh + wp * qp) / (wh + wp)
	q /= np.linalg.norm(q)
	rvec = _quat_to_rvec(q)
	tvec = (wh * h_pose.tvec + wp * p_pose.tvec) / (wh + wp)

	rmse_mix = float((wh * h_pose.rmse_px + wp * p_pose.rmse_px) / (wh + wp))
	return Pose(rvec=rvec, tvec=tvec, rmse_px=rmse_mix, method="fused_initial")


def camera_metrics(rvec: np.ndarray, tvec: np.ndarray) -> dict[str, float]:
	r, _ = cv2.Rodrigues(rvec)
	c = -r.T @ tvec
	axis = r[:, 2].reshape(3, 1)
	dx, dy, dz = axis.reshape(3)
	norm = np.linalg.norm([dx, dy, dz])
	if norm > 0:
		dx, dy, dz = dx / norm, dy / norm, dz / norm

	tilt_deg = math.degrees(math.acos(np.clip(abs(dz), 0.0, 1.0)))
	azimuth_deg = (math.degrees(math.atan2(dy, dx)) + 360.0) % 360.0

	return {
		"X_m": float(c[0, 0]),
		"Y_m": float(c[1, 0]),
		"Z_m": float(c[2, 0]),
		"tilt_from_vertical_deg": float(tilt_deg),
		"azimuth_pan_deg": float(azimuth_deg),
		"dx": float(dx),
		"dy": float(dy),
		"dz": float(dz),
	}


def run_pipeline(payload: dict[str, Any]) -> dict[str, Any]:
	hom = solve_pose_homography(payload)
	pnp = solve_pose_pnp(payload)
	fused_init = fuse_pose(hom, pnp)
	fused_refined = solve_pose_pnp(payload, use_guess=True, init_pose=fused_init)

	result = {
		"homography": {
			"rmse_px": hom.rmse_px,
			"rvec": hom.rvec.reshape(-1).tolist(),
			"tvec": hom.tvec.reshape(-1).tolist(),
			"camera": camera_metrics(hom.rvec, hom.tvec),
		},
		"pnp": {
			"rmse_px": pnp.rmse_px,
			"rvec": pnp.rvec.reshape(-1).tolist(),
			"tvec": pnp.tvec.reshape(-1).tolist(),
			"camera": camera_metrics(pnp.rvec, pnp.tvec),
		},
		"fused_refined": {
			"rmse_px": fused_refined.rmse_px,
			"rvec": fused_refined.rvec.reshape(-1).tolist(),
			"tvec": fused_refined.tvec.reshape(-1).tolist(),
			"camera": camera_metrics(fused_refined.rvec, fused_refined.tvec),
		},
		"stability_note": "World marker coordinates remain fixed in world space by definition; when camera moves sideways, only image pixel coordinates change and pose must be re-estimated with fresh correspondences.",
	}
	return result


DEMO_PAYLOAD = {
	"timestamp": 1773683407,
	"mode": "web_headless_pnp",
	"intrinsic": {
		"K": [
			[912.8213983048139, 0.0, 327.0972742974366],
			[0.0, 914.3219316686383, 203.13721668271205],
			[0.0, 0.0, 1.0],
		],
		"D": [[0.012429461672313846, 2.366954715137226, -0.014592812830449668, 0.0001346082018025742, -21.46267698144305]],
	},
	"correspondences": [
		{"markerId": "m1", "world": [6.0, 4.0, 0.0], "pixel": [210.63797420391953, 369.90000915527344]},
		{"markerId": "m2", "world": [6.0, 0.0, 0.0], "pixel": [490.3716204140658, 363.90000915527344]},
		{"markerId": "m3", "world": [0.0, 0.0, 0.0], "pixel": [429.514024801078, 225.1999969482422]},
		{"markerId": "m4", "world": [0.0, 4.0, 0.0], "pixel": [236.30769230769232, 225.44998168945312]},
	],
}


def load_payload(path: str | None, use_demo: bool) -> dict[str, Any]:
	if use_demo:
		return DEMO_PAYLOAD
	if not path:
		raise ValueError("Provide --input path or use --demo")

	input_path = Path(path)
	text = input_path.read_text(encoding="utf-8")
	suffix = input_path.suffix.lower()
	if suffix in {".yaml", ".yml"}:
		data = yaml.safe_load(text)
	elif suffix == ".json":
		data = json.loads(text)
	else:
		try:
			data = yaml.safe_load(text)
		except Exception:
			data = json.loads(text)
	if not isinstance(data, dict):
		raise ValueError("Input must be a YAML/JSON object")
	return data


def main() -> None:
	parser = argparse.ArgumentParser(description="Fuse homography + PnP camera pose and refine")
	parser.add_argument("--input", default="", help="Input YAML/JSON file with intrinsic and correspondences")
	parser.add_argument("--demo", action="store_true", help="Run using embedded sample payload")
	parser.add_argument("--output", default="", help="Optional output JSON file")
	args = parser.parse_args()

	payload = load_payload(args.input or None, args.demo)
	result = run_pipeline(payload)
	rendered = json.dumps(result, indent=2)
	print(rendered)
	if args.output:
		Path(args.output).write_text(rendered + "\n", encoding="utf-8")


if __name__ == "__main__":
	main()
