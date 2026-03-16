"""Shared utilities for class-based web calibration backend services."""

from __future__ import annotations

import os
from typing import Iterable, Tuple

import cv2
import numpy as np
import yaml


class CalibrationUtils:
    """Utility helpers reused by multiple backend calibration services."""

    @staticmethod
    def parse_source(source: str):
        """Parse numeric source strings as camera indices, else keep as path/URL."""
        return int(source) if str(source).isdigit() else source

    @staticmethod
    def parse_checkerboard(spec: str) -> Tuple[int, int]:
        """Parse checkerboard inner-corner spec like ``9x6`` into ``(w, h)``."""
        parts = str(spec).lower().split("x")
        if len(parts) != 2:
            raise RuntimeError("Checkerboard must be like 9x6")
        return int(parts[0]), int(parts[1])

    @staticmethod
    def load_intrinsics(npz_path: str, fallback_size=(1280, 720)):
        """Load intrinsics from ``.npz`` or return fallback pinhole intrinsics."""
        if npz_path and os.path.exists(npz_path):
            data = np.load(npz_path)
            K = data["K"]
            D = data["D"]
            return K, D

        width, height = fallback_size
        fx = fy = max(width, height) * 0.9
        cx = width / 2.0
        cy = height / 2.0
        K = np.array([[fx, 0.0, cx], [0.0, fy, cy], [0.0, 0.0, 1.0]], dtype=np.float64)
        D = np.zeros((1, 5), dtype=np.float64)
        return K, D

    @staticmethod
    def ensure_parent_dir(file_path: str):
        """Create parent directory for a file path when it is provided."""
        parent = os.path.dirname(file_path)
        if parent:
            os.makedirs(parent, exist_ok=True)

    @staticmethod
    def load_pose_and_intrinsics(calibration_yaml: str, intrinsics_path: str = ""):
        """Load pose and intrinsics from calibration YAML and optional NPZ intrinsics."""
        if not calibration_yaml or not os.path.exists(calibration_yaml):
            raise RuntimeError(f"Calibration YAML not found: {calibration_yaml}")

        with open(calibration_yaml, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}

        pose = data.get("pose") or {}
        intrinsic = data.get("intrinsic") or {}

        rvec_raw = pose.get("rvec")
        tvec_raw = pose.get("tvec")
        if rvec_raw is None or tvec_raw is None:
            raise RuntimeError("Calibration YAML does not contain pose.rvec/tvec")

        rvec = np.array(rvec_raw, dtype=np.float64).reshape(-1)
        tvec = np.array(tvec_raw, dtype=np.float64).reshape(-1)
        if rvec.size != 3 or tvec.size != 3:
            raise RuntimeError("pose.rvec and pose.tvec must each contain 3 values")

        if intrinsics_path:
            K, D = CalibrationUtils.load_intrinsics(intrinsics_path)
        else:
            K_raw = intrinsic.get("K")
            D_raw = intrinsic.get("D")
            if K_raw is None or D_raw is None:
                raise RuntimeError("Calibration YAML does not contain intrinsic.K/D and no --intrinsics path was provided")
            K = np.array(K_raw, dtype=np.float64)
            D = np.array(D_raw, dtype=np.float64)

        if K.shape != (3, 3):
            raise RuntimeError(f"Intrinsic matrix K must be 3x3, got {K.shape}")

        D = np.array(D, dtype=np.float64)
        if D.ndim == 1:
            D = D.reshape(1, -1)

        return K, D, rvec.reshape(3, 1), tvec.reshape(3, 1)

    @staticmethod
    def project_world_to_pixel(world_xyz, K, D, rvec, tvec):
        """Project a world XYZ point into pixel coordinates."""
        arr = np.array([[float(world_xyz[0]), float(world_xyz[1]), float(world_xyz[2])]], dtype=np.float32)
        projected, _ = cv2.projectPoints(arr, rvec, tvec, K, D)
        u, v = projected.reshape(-1, 2)[0]
        return np.array([float(u), float(v)], dtype=np.float64)

    @staticmethod
    def normalize_pixel(pixel_xy, K, D):
        """Undistort pixel coordinates into normalized camera coordinates."""
        pt = np.array([[[float(pixel_xy[0]), float(pixel_xy[1])]]], dtype=np.float64)
        pt_undist = cv2.undistortPoints(pt, K, D)
        x_u, y_u = pt_undist.reshape(2)
        return float(x_u), float(y_u)

    @staticmethod
    def metric_summary(values: Iterable[float]):
        """Compute ``mean``, ``rmse``, and ``max`` for numeric values."""
        arr = np.array(list(values), dtype=np.float64)
        if arr.size == 0:
            raise RuntimeError("Cannot compute metrics on empty value list")
        return {
            "mean": float(np.mean(arr)),
            "rmse": float(np.sqrt(np.mean(np.square(arr)))),
            "max": float(np.max(arr)),
        }
