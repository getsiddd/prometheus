"""Pixel-world mapping validation service for web calibration backend."""

from __future__ import annotations

import cv2
import numpy as np

from .common import CalibrationUtils


class MappingValidationService:
    """Validate pixel-to-world and world-to-pixel accuracy metrics."""

    def __init__(self, utils: CalibrationUtils | None = None):
        self.utils = utils or CalibrationUtils()

    def _pixel_to_world_on_plane(self, mx, my, K, D, rvec, tvec, plane_z=0.0):
        """Back-project an image pixel to a target world Z-plane."""
        R, _ = cv2.Rodrigues(rvec)
        R_inv = R.T

        pt = np.array([[[mx, my]]], dtype=np.float64)
        pt_undist = cv2.undistortPoints(pt, K, D)
        x_u, y_u = pt_undist.reshape(2)
        ray_cam = np.array([x_u, y_u, 1.0], dtype=np.float64)
        ray_cam = ray_cam / np.linalg.norm(ray_cam)

        ray_world = R_inv @ ray_cam
        cam_center_world = -R_inv @ tvec.reshape(3)

        if abs(ray_world[2]) < 1e-9:
            return None

        t = (float(plane_z) - cam_center_world[2]) / ray_world[2]
        return cam_center_world + t * ray_world

    def validate_mapping(self, validation_points: list[dict], calibration_yaml: str, intrinsics_path: str = ""):
        """Validate mapping quality using known world-pixel checkpoints."""
        if not isinstance(validation_points, list) or len(validation_points) == 0:
            raise RuntimeError("validation_points must be a non-empty list")

        K, D, rvec, tvec = self.utils.load_pose_and_intrinsics(calibration_yaml, intrinsics_path)

        details = []
        world_errors = []
        reproj_errors = []

        for idx, item in enumerate(validation_points):
            world_raw = item.get("world")
            pixel_raw = item.get("pixel")
            if not world_raw or not pixel_raw or len(world_raw) != 3 or len(pixel_raw) != 2:
                continue

            world_gt = np.array([float(world_raw[0]), float(world_raw[1]), float(world_raw[2])], dtype=np.float64)
            pixel_obs = np.array([float(pixel_raw[0]), float(pixel_raw[1])], dtype=np.float64)
            plane_z = float(item.get("plane_z", world_gt[2]))

            world_est = self._pixel_to_world_on_plane(pixel_obs[0], pixel_obs[1], K, D, rvec, tvec, plane_z=plane_z)
            if world_est is None:
                continue

            pixel_reproj = self.utils.project_world_to_pixel(world_gt, K, D, rvec, tvec)

            world_error = float(np.linalg.norm(world_est - world_gt))
            reproj_error = float(np.linalg.norm(pixel_reproj - pixel_obs))

            world_errors.append(world_error)
            reproj_errors.append(reproj_error)

            details.append(
                {
                    "index": idx,
                    "pixel_observed": [float(pixel_obs[0]), float(pixel_obs[1])],
                    "world_expected": [float(world_gt[0]), float(world_gt[1]), float(world_gt[2])],
                    "world_estimated": [float(world_est[0]), float(world_est[1]), float(world_est[2])],
                    "world_error": world_error,
                    "pixel_reprojected": [float(pixel_reproj[0]), float(pixel_reproj[1])],
                    "reprojection_error_px": reproj_error,
                }
            )

        if len(details) == 0:
            raise RuntimeError("No valid validation points were provided")

        return {
            "mode": "web_validation",
            "calibration_yaml": calibration_yaml,
            "sample_count": len(details),
            "metrics": {
                "world_error": self.utils.metric_summary(world_errors),
                "reprojection_error_px": self.utils.metric_summary(reproj_errors),
            },
            "details": details,
        }
