"""Multi-camera triangulation service for web calibration backend."""

from __future__ import annotations

import cv2
import numpy as np

from .common import CalibrationUtils


class MultiViewTriangulationService:
    """Triangulate shared markers using multiple calibrated cameras."""

    def __init__(self, utils: CalibrationUtils | None = None, feature_matching_service=None):
        self.utils = utils or CalibrationUtils()
        self.feature_matching_service = feature_matching_service

    @staticmethod
    def _projection_no_intrinsics(rvec, tvec):
        """Build camera projection matrix ``[R|t]`` in normalized coordinates."""
        R, _ = cv2.Rodrigues(rvec)
        return np.hstack([R, tvec.reshape(3, 1)])

    @staticmethod
    def _triangulate_dlt(observations):
        """Triangulate 3D point from two or more normalized observations."""
        A_rows = []
        for obs in observations:
            x_n, y_n = obs["normalized_pixel"]
            P = obs["P"]
            A_rows.append(x_n * P[2, :] - P[0, :])
            A_rows.append(y_n * P[2, :] - P[1, :])

        A = np.array(A_rows, dtype=np.float64)
        _, _, Vt = np.linalg.svd(A)
        X_h = Vt[-1]
        if abs(X_h[3]) < 1e-12:
            return None
        X = X_h[:3] / X_h[3]
        return X.reshape(3)

    @staticmethod
    def _marker_observations(marker):
        """Normalize marker observations from dict/list forms."""
        obs_raw = marker.get("observations")
        obs = []

        if isinstance(obs_raw, dict):
            for camera_id, pixel in obs_raw.items():
                if not pixel or len(pixel) != 2:
                    continue
                obs.append({"camera_id": str(camera_id), "pixel": [float(pixel[0]), float(pixel[1])]})
            return obs

        if isinstance(obs_raw, list):
            for item in obs_raw:
                if not isinstance(item, dict):
                    continue
                camera_id = item.get("cameraId") or item.get("camera_id") or item.get("id")
                pixel = item.get("pixel")
                if not camera_id or not pixel or len(pixel) != 2:
                    continue
                obs.append({"camera_id": str(camera_id), "pixel": [float(pixel[0]), float(pixel[1])]})
            return obs

        return obs

    def triangulate_multiview(
        self,
        cameras: list[dict],
        markers: list[dict],
        *,
        auto_match: bool = False,
        match_options: dict | None = None,
    ):
        """Triangulate marker points and return reprojection/world error metrics."""
        if not isinstance(cameras, list) or len(cameras) < 2:
            raise RuntimeError("At least 2 cameras are required for multi-view triangulation")

        auto_match_result = None
        if not isinstance(markers, list) or len(markers) == 0:
            if not auto_match:
                raise RuntimeError("markers must be a non-empty list")
            if self.feature_matching_service is None:
                raise RuntimeError("Auto matching is not available in this triangulation service instance")
            auto_match_result = self.feature_matching_service.build_shared_markers_from_cameras(cameras, match_options or {})
            markers = auto_match_result.get("markers") or []
            if len(markers) == 0:
                raise RuntimeError("Auto feature matching produced no usable markers")

        camera_models = {}
        for cam in cameras:
            if not isinstance(cam, dict):
                continue

            camera_id = cam.get("cameraId") or cam.get("camera_id") or cam.get("id")
            calibration_yaml = cam.get("calibrationYamlPath") or cam.get("calibration_yaml")
            intrinsics_path = cam.get("intrinsicsPath") or cam.get("intrinsics") or ""

            if not camera_id:
                raise RuntimeError("Each camera must provide cameraId/id")
            if not calibration_yaml:
                raise RuntimeError(f"Camera '{camera_id}' is missing calibrationYamlPath")

            K, D, rvec, tvec = self.utils.load_pose_and_intrinsics(calibration_yaml, intrinsics_path)
            camera_models[str(camera_id)] = {
                "K": K,
                "D": D,
                "rvec": rvec,
                "tvec": tvec,
                "P": self._projection_no_intrinsics(rvec, tvec),
                "calibration_yaml": calibration_yaml,
            }

        if len(camera_models) < 2:
            raise RuntimeError("Need at least 2 valid calibrated cameras")

        triangulated = []
        reproj_all = []
        world_err_all = []

        for idx, marker in enumerate(markers):
            if not isinstance(marker, dict):
                continue

            marker_id = marker.get("markerId") or marker.get("id") or f"marker-{idx + 1}"
            expected_world = marker.get("world")
            obs = self._marker_observations(marker)

            usable_obs = []
            for item in obs:
                cam_model = camera_models.get(item["camera_id"])
                if not cam_model:
                    continue

                x_n, y_n = self.utils.normalize_pixel(item["pixel"], cam_model["K"], cam_model["D"])
                usable_obs.append(
                    {
                        "camera_id": item["camera_id"],
                        "pixel": item["pixel"],
                        "normalized_pixel": [x_n, y_n],
                        "P": cam_model["P"],
                    }
                )

            if len(usable_obs) < 2:
                continue

            world_est = self._triangulate_dlt(usable_obs)
            if world_est is None:
                continue

            marker_reproj = []
            per_view = []
            for item in usable_obs:
                cam = camera_models[item["camera_id"]]
                pix_pred = self.utils.project_world_to_pixel(world_est, cam["K"], cam["D"], cam["rvec"], cam["tvec"])
                pix_obs = np.array(item["pixel"], dtype=np.float64)
                err = float(np.linalg.norm(pix_pred - pix_obs))
                marker_reproj.append(err)
                reproj_all.append(err)
                per_view.append(
                    {
                        "camera_id": item["camera_id"],
                        "pixel_observed": [float(pix_obs[0]), float(pix_obs[1])],
                        "pixel_reprojected": [float(pix_pred[0]), float(pix_pred[1])],
                        "reprojection_error_px": err,
                    }
                )

            marker_payload = {
                "marker_id": str(marker_id),
                "world_estimated": [float(world_est[0]), float(world_est[1]), float(world_est[2])],
                "view_count": len(usable_obs),
                "reprojection_error_px": self.utils.metric_summary(marker_reproj),
                "views": per_view,
            }

            if expected_world and len(expected_world) == 3:
                gt = np.array([float(expected_world[0]), float(expected_world[1]), float(expected_world[2])], dtype=np.float64)
                w_err = float(np.linalg.norm(world_est - gt))
                world_err_all.append(w_err)
                marker_payload["world_expected"] = [float(gt[0]), float(gt[1]), float(gt[2])]
                marker_payload["world_error"] = w_err

            triangulated.append(marker_payload)

        if len(triangulated) == 0:
            raise RuntimeError("No markers had >= 2 usable camera observations for triangulation")

        metrics = {
            "reprojection_error_px": self.utils.metric_summary(reproj_all) if reproj_all else None,
        }
        if world_err_all:
            metrics["world_error"] = self.utils.metric_summary(world_err_all)

        return {
            "mode": "web_multiview_triangulation",
            "camera_count": len(camera_models),
            "marker_count_input": len(markers),
            "marker_count_triangulated": len(triangulated),
            "metrics": metrics,
            "points": triangulated,
            "auto_match": auto_match_result,
        }
