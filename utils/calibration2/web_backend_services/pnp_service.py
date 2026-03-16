"""PnP pose solving service for web calibration backend."""

from __future__ import annotations

import cv2
import numpy as np
import os
import time
import yaml

from .common import CalibrationUtils


class PnPCalibrationService:
    """Solve camera pose from world-image correspondences and export calibration YAML."""

    def __init__(self, utils: CalibrationUtils | None = None):
        self.utils = utils or CalibrationUtils()

    @staticmethod
    def _normalize_distortion(D):
        """Normalize distortion coefficients to OpenCV-friendly shape."""
        D_arr = np.array(D, dtype=np.float64)
        if D_arr.ndim == 1:
            D_arr = D_arr.reshape(1, -1)
        return D_arr

    @staticmethod
    def _build_correspondence_rows(object_arr, image_arr):
        """Build marker-tagged correspondence rows from aligned object/image arrays."""
        return [
            {
                "markerId": f"m{i + 1}",
                "world": [float(w[0]), float(w[1]), float(w[2])],
                "pixel": [float(p[0]), float(p[1])],
            }
            for i, (w, p) in enumerate(zip(object_arr, image_arr))
        ]

    def _solve_pose(self, object_arr, image_arr, K, D):
        """Estimate camera pose and reprojection metrics from 3D-2D pairs."""
        ok, rvec, tvec, inliers = cv2.solvePnPRansac(
            object_arr,
            image_arr,
            K,
            D,
            flags=cv2.SOLVEPNP_ITERATIVE,
            reprojectionError=4.0,
            confidence=0.99,
        )

        if not ok:
            ok, rvec, tvec = cv2.solvePnP(object_arr, image_arr, K, D, flags=cv2.SOLVEPNP_ITERATIVE)
            inliers = None
            if not ok:
                raise RuntimeError("solvePnP failed")

        projected, _ = cv2.projectPoints(object_arr, rvec, tvec, K, D)
        projected = projected.reshape(-1, 2)
        err = np.linalg.norm(projected - image_arr, axis=1)
        rmse = float(np.sqrt(np.mean(np.square(err))))

        inlier_count = int(len(inliers)) if inliers is not None else len(object_arr)
        return rvec, tvec, rmse, inlier_count

    @staticmethod
    def _serialize_pose_payload(mode, K, D, rvec, tvec, rmse, inlier_count, correspondences, source=None, dwg_path=None, intrinsic_rms=None):
        """Build standard YAML/JSON payload for solved calibration state."""
        payload = {
            "timestamp": int(time.time()),
            "mode": mode,
            "intrinsic": {
                "K": K.tolist(),
                "D": D.tolist(),
            },
            "pose": {
                "rvec": rvec.reshape(-1).tolist(),
                "tvec": tvec.reshape(-1).tolist(),
                "reproj_rmse_px": rmse,
                "inliers": inlier_count,
            },
            "correspondences": correspondences,
        }

        if source is not None:
            payload["source"] = str(source)
        if dwg_path:
            payload["dwg_path"] = os.path.abspath(dwg_path)
        if intrinsic_rms is not None:
            payload["intrinsic"]["rms"] = float(intrinsic_rms)

        return payload

    def _persist_payload(self, output_yaml: str, payload: dict):
        """Persist solved calibration payload to YAML output path."""
        self.utils.ensure_parent_dir(output_yaml)
        with open(output_yaml, "w", encoding="utf-8") as f:
            yaml.safe_dump(payload, f, sort_keys=False)

    def solve_pnp(
        self,
        correspondences: list[dict],
        intrinsics_path: str,
        output_yaml: str,
        *,
        mode: str = "web_headless_pnp",
        source: str | None = None,
        dwg_path: str | None = None,
        intrinsic_rms: float | None = None,
    ):
        """Solve pose from correspondence dict rows and persist YAML output."""
        object_points = []
        image_points = []
        normalized_rows = []

        for idx, item in enumerate(correspondences):
            w = item.get("world") if isinstance(item, dict) else None
            p = item.get("pixel") if isinstance(item, dict) else None
            marker_id = item.get("markerId") if isinstance(item, dict) else None
            if not w or not p or len(w) != 3 or len(p) != 2:
                continue
            world = [float(w[0]), float(w[1]), float(w[2])]
            pixel = [float(p[0]), float(p[1])]
            object_points.append(world)
            image_points.append(pixel)
            normalized_rows.append(
                {
                    "markerId": str(marker_id) if marker_id else f"m{idx + 1}",
                    "world": world,
                    "pixel": pixel,
                }
            )

        K, D = self.utils.load_intrinsics(intrinsics_path)
        return self.solve_pnp_from_arrays(
            object_points_xyz=object_points,
            image_points_uv=image_points,
            K=K,
            D=D,
            output_yaml=output_yaml,
            correspondences=normalized_rows,
            mode=mode,
            source=source,
            dwg_path=dwg_path,
            intrinsic_rms=intrinsic_rms,
        )

    def solve_pnp_from_arrays(
        self,
        object_points_xyz,
        image_points_uv,
        K,
        D,
        output_yaml: str,
        *,
        correspondences: list[dict] | None = None,
        mode: str = "cad_3d_pnp",
        source: str | None = None,
        dwg_path: str | None = None,
        intrinsic_rms: float | None = None,
    ):
        """Solve pose from numeric arrays and persist a reusable calibration artifact."""
        object_arr = np.array(object_points_xyz, dtype=np.float32)
        image_arr = np.array(image_points_uv, dtype=np.float32)
        K_arr = np.array(K, dtype=np.float64)
        D_arr = self._normalize_distortion(D)

        if object_arr.ndim != 2 or object_arr.shape[1] != 3:
            raise RuntimeError("object_points_xyz must be Nx3")
        if image_arr.ndim != 2 or image_arr.shape[1] != 2:
            raise RuntimeError("image_points_uv must be Nx2")
        if len(object_arr) != len(image_arr):
            raise RuntimeError("Object and image point counts must match")
        if len(object_arr) < 4:
            raise RuntimeError("At least 4 valid correspondences are required")
        if K_arr.shape != (3, 3):
            raise RuntimeError(f"Intrinsic matrix K must be 3x3, got {K_arr.shape}")

        rvec, tvec, rmse, inlier_count = self._solve_pose(object_arr, image_arr, K_arr, D_arr)

        rows = correspondences if correspondences and len(correspondences) == len(object_arr) else self._build_correspondence_rows(object_arr, image_arr)
        payload = self._serialize_pose_payload(
            mode=mode,
            K=K_arr,
            D=D_arr,
            rvec=rvec,
            tvec=tvec,
            rmse=rmse,
            inlier_count=inlier_count,
            correspondences=rows,
            source=source,
            dwg_path=dwg_path,
            intrinsic_rms=intrinsic_rms,
        )

        self._persist_payload(output_yaml, payload)
        return payload
