"""Deep-first multi-view feature matching service for camera workflows."""

from __future__ import annotations

from importlib import import_module
import os

import cv2
import numpy as np

from .common import CalibrationUtils


class MultiViewFeatureMatchingService:
    """Generate cross-camera shared marker observations from image feature matches."""

    def __init__(self, utils: CalibrationUtils | None = None):
        self.utils = utils or CalibrationUtils()
        self._loftr_model = None
        self._loftr_torch = None
        self._loftr_device = None

    @staticmethod
    def _camera_id(camera: dict):
        """Resolve camera identifier from common payload keys."""
        return str(camera.get("cameraId") or camera.get("camera_id") or camera.get("id") or "").strip()

    @staticmethod
    def _camera_image_path(camera: dict):
        """Resolve image path from common camera payload keys."""
        return str(
            camera.get("imagePath")
            or camera.get("snapshotPath")
            or camera.get("image_path")
            or camera.get("snapshot_path")
            or ""
        ).strip()

    @staticmethod
    def _safe_int(value, default):
        """Convert to int safely with fallback default."""
        try:
            return int(value)
        except (TypeError, ValueError):
            return int(default)

    @staticmethod
    def _safe_float(value, default):
        """Convert to float safely with fallback default."""
        try:
            return float(value)
        except (TypeError, ValueError):
            return float(default)

    def _read_gray(self, image_path: str, max_side: int):
        """Read grayscale image and optionally resize while preserving scale factor."""
        if not image_path:
            raise RuntimeError("Camera image path is required for feature matching")
        if not os.path.exists(image_path):
            raise RuntimeError(f"Camera image not found: {image_path}")

        image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
        if image is None:
            raise RuntimeError(f"Unable to decode image: {image_path}")

        h, w = image.shape[:2]
        scale = 1.0
        max_dim = max(h, w)
        if max_side > 0 and max_dim > max_side:
            scale = float(max_side) / float(max_dim)
            image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

        return image, scale

    def _ensure_loftr(self):
        """Lazily load LoFTR model and runtime dependencies."""
        if self._loftr_model is not None:
            return self._loftr_model, self._loftr_torch, self._loftr_device

        import torch
        KF = import_module("kornia.feature")

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = KF.LoFTR(pretrained="outdoor").to(device).eval()

        self._loftr_model = model
        self._loftr_torch = torch
        self._loftr_device = device

        return self._loftr_model, self._loftr_torch, self._loftr_device

    def _match_pair_loftr(self, image_a, image_b, max_matches_per_pair):
        """Run deep matching with LoFTR and return ranked correspondences."""
        model, torch, device = self._ensure_loftr()

        tensor_a = torch.from_numpy(image_a).float()[None, None] / 255.0
        tensor_b = torch.from_numpy(image_b).float()[None, None] / 255.0
        tensor_a = tensor_a.to(device)
        tensor_b = tensor_b.to(device)

        with torch.inference_mode():
            result = model({"image0": tensor_a, "image1": tensor_b})

        keypoints_a = result["keypoints0"].detach().cpu().numpy()
        keypoints_b = result["keypoints1"].detach().cpu().numpy()
        confidence = result.get("confidence")
        if confidence is None:
            confidence = np.ones((len(keypoints_a),), dtype=np.float32)
        else:
            confidence = confidence.detach().cpu().numpy().reshape(-1)

        if len(keypoints_a) == 0:
            return {"method": "loftr", "matches": [], "points_a": [], "points_b": []}

        order = np.argsort(-confidence)
        if max_matches_per_pair > 0:
            order = order[:max_matches_per_pair]

        matches = []
        points_a = []
        points_b = []
        for idx in order:
            pa = [float(keypoints_a[idx][0]), float(keypoints_a[idx][1])]
            pb = [float(keypoints_b[idx][0]), float(keypoints_b[idx][1])]
            matches.append(
                {
                    "pixel_a": pa,
                    "pixel_b": pb,
                    "confidence": float(confidence[idx]),
                }
            )
            points_a.append(pa)
            points_b.append(pb)

        return {"method": "loftr", "matches": matches, "points_a": points_a, "points_b": points_b}

    @staticmethod
    def _orb_confidence(distance):
        """Map ORB Hamming distance to a confidence-like score in [0, 1]."""
        return max(0.0, 1.0 - (float(distance) / 128.0))

    def _match_pair_orb(self, image_a, image_b, max_features, max_matches_per_pair):
        """Run fast ORB fallback matching when deep matcher is unavailable."""
        orb = cv2.ORB_create(nfeatures=max_features)
        kp_a, des_a = orb.detectAndCompute(image_a, None)
        kp_b, des_b = orb.detectAndCompute(image_b, None)

        if des_a is None or des_b is None or len(kp_a) == 0 or len(kp_b) == 0:
            return {"method": "orb", "matches": [], "points_a": [], "points_b": []}

        matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        raw_matches = matcher.match(des_a, des_b)
        raw_matches = sorted(raw_matches, key=lambda m: m.distance)

        if max_matches_per_pair > 0:
            raw_matches = raw_matches[:max_matches_per_pair]

        matches = []
        points_a = []
        points_b = []
        for item in raw_matches:
            p_a = kp_a[item.queryIdx].pt
            p_b = kp_b[item.trainIdx].pt
            pa = [float(p_a[0]), float(p_a[1])]
            pb = [float(p_b[0]), float(p_b[1])]
            matches.append(
                {
                    "pixel_a": pa,
                    "pixel_b": pb,
                    "confidence": self._orb_confidence(item.distance),
                }
            )
            points_a.append(pa)
            points_b.append(pb)

        return {"method": "orb", "matches": matches, "points_a": points_a, "points_b": points_b}

    @staticmethod
    def _estimate_pair_homography(points_a: list, points_b: list):
        """Estimate planar homography using full-image correspondences."""
        if len(points_a) < 4 or len(points_b) < 4 or len(points_a) != len(points_b):
            return None

        src = np.array(points_a, dtype=np.float32).reshape(-1, 1, 2)
        dst = np.array(points_b, dtype=np.float32).reshape(-1, 1, 2)
        H, mask = cv2.findHomography(src, dst, method=cv2.RANSAC, ransacReprojThreshold=4.0)
        if H is None:
            return None

        mask_arr = mask.reshape(-1) if mask is not None else np.ones((len(points_a),), dtype=np.uint8)
        inliers = int(np.sum(mask_arr))
        total = int(len(points_a))
        ratio = float(inliers / total) if total > 0 else 0.0
        return {
            "H": H,
            "inlier_count": inliers,
            "total_match_count": total,
            "inlier_ratio": ratio,
        }

    @staticmethod
    def _pair_similarity(matches: list, inlier_ratio: float):
        """Compute a bounded similarity score from confidence and geometric consistency."""
        if not matches:
            return 0.0
        conf = [float(item.get("confidence", 0.0)) for item in matches]
        conf_mean = float(np.mean(conf)) if conf else 0.0
        return float(max(0.0, min(1.0, 0.55 * conf_mean + 0.45 * float(inlier_ratio))))

    def _match_pair(self, image_a, image_b, method, max_features, max_matches_per_pair):
        """Match a camera pair using selected method with deep-first auto mode."""
        method_norm = str(method or "auto").strip().lower()
        if method_norm not in {"auto", "loftr", "orb"}:
            raise RuntimeError(f"Unsupported feature matching method: {method_norm}")

        if method_norm in {"auto", "loftr"}:
            try:
                deep_result = self._match_pair_loftr(image_a, image_b, max_matches_per_pair)
                if method_norm == "loftr" or deep_result["matches"]:
                    return deep_result
            except Exception as exc:
                if method_norm == "loftr":
                    raise RuntimeError(f"LoFTR matching failed: {exc}") from exc

        return self._match_pair_orb(image_a, image_b, max_features, max_matches_per_pair)

    def extract_single_image_keypoints(self, image_path: str, options: dict | None = None) -> dict:
        """Extract all ORB keypoints from a single image for live feature overlay."""
        options = options or {}
        max_features = max(128, self._safe_int(options.get("max_features"), 2000))
        max_side = max(320, self._safe_int(options.get("max_side"), 1280))

        image_gray, scale = self._read_gray(image_path, max_side)
        orig_h = int(round(image_gray.shape[0] / scale)) if scale > 0 else image_gray.shape[0]
        orig_w = int(round(image_gray.shape[1] / scale)) if scale > 0 else image_gray.shape[1]

        orb = cv2.ORB_create(nfeatures=max_features)
        kps = orb.detect(image_gray, None)

        keypoints = []
        for kp in kps:
            x = float(kp.pt[0]) / float(scale) if scale > 0 else float(kp.pt[0])
            y = float(kp.pt[1]) / float(scale) if scale > 0 else float(kp.pt[1])
            score = float(kp.response)
            keypoints.append({"x": x, "y": y, "score": score})

        # Sort descending by response strength
        keypoints.sort(key=lambda k: -k["score"])

        return {
            "method": "orb",
            "image_width": orig_w,
            "image_height": orig_h,
            "count": len(keypoints),
            "keypoints": keypoints,
        }

    def build_shared_markers_from_cameras(self, cameras: list[dict], options: dict | None = None):
        """Build marker observation graph from multi-camera image matching."""
        options = options or {}
        method = str(options.get("method", "auto"))
        max_features = max(256, self._safe_int(options.get("max_features"), 2048))
        max_matches_per_pair = max(32, self._safe_int(options.get("max_matches_per_pair"), 600))
        min_confidence = max(0.0, min(1.0, self._safe_float(options.get("min_confidence"), 0.35)))
        max_image_side = max(320, self._safe_int(options.get("max_image_side"), 1280))
        anchor_camera_id = options.get("anchor_camera_id")

        if not isinstance(cameras, list) or len(cameras) < 2:
            raise RuntimeError("At least 2 cameras are required for feature matching")

        camera_frames = {}
        for camera in cameras:
            if not isinstance(camera, dict):
                continue
            camera_id = self._camera_id(camera)
            image_path = self._camera_image_path(camera)
            if not camera_id or not image_path:
                continue
            image_gray, scale = self._read_gray(image_path, max_image_side)
            camera_frames[camera_id] = {
                "path": image_path,
                "gray": image_gray,
                "scale": scale,
            }

        if len(camera_frames) < 2:
            raise RuntimeError("Need at least 2 cameras with imagePath/snapshotPath for auto matching")

        if anchor_camera_id:
            anchor_camera_id = str(anchor_camera_id)
            if anchor_camera_id not in camera_frames:
                raise RuntimeError(f"anchor_camera_id '{anchor_camera_id}' has no usable image")
        else:
            anchor_camera_id = sorted(camera_frames.keys())[0]

        anchor = camera_frames[anchor_camera_id]
        marker_bins = {}
        pair_stats = []
        pair_models = []

        for camera_id, payload in camera_frames.items():
            if camera_id == anchor_camera_id:
                continue

            matched = self._match_pair(
                anchor["gray"],
                payload["gray"],
                method=method,
                max_features=max_features,
                max_matches_per_pair=max_matches_per_pair,
            )

            pair_h = self._estimate_pair_homography(matched.get("points_a") or [], matched.get("points_b") or [])
            inlier_ratio = float(pair_h["inlier_ratio"]) if pair_h is not None else 0.0
            similarity = self._pair_similarity(matched.get("matches") or [], inlier_ratio)

            kept = 0
            for item in matched["matches"]:
                confidence = float(item.get("confidence", 0.0))
                if confidence < min_confidence:
                    continue

                ax = float(item["pixel_a"][0]) / float(anchor["scale"])
                ay = float(item["pixel_a"][1]) / float(anchor["scale"])
                bx = float(item["pixel_b"][0]) / float(payload["scale"])
                by = float(item["pixel_b"][1]) / float(payload["scale"])

                key = (int(round(ax / 4.0)), int(round(ay / 4.0)))
                marker = marker_bins.get(key)
                if marker is None:
                    marker = {
                        "anchor_pixel": [ax, ay],
                        "observations": {},
                        "scores": {},
                    }
                    marker_bins[key] = marker

                marker["observations"][anchor_camera_id] = [ax, ay]

                prev_score = marker["scores"].get(camera_id)
                if prev_score is None or confidence >= prev_score:
                    marker["observations"][camera_id] = [bx, by]
                    marker["scores"][camera_id] = confidence

                kept += 1

            pair_stats.append(
                {
                    "camera_a": anchor_camera_id,
                    "camera_b": camera_id,
                    "method": matched["method"],
                    "raw_match_count": len(matched["matches"]),
                    "kept_match_count": kept,
                    "global_similarity": similarity,
                    "inlier_ratio": inlier_ratio,
                }
            )

            if pair_h is not None:
                pair_models.append(
                    {
                        "camera_a": anchor_camera_id,
                        "camera_b": camera_id,
                        "method": matched["method"],
                        "homography": pair_h["H"].tolist(),
                        "inlier_count": int(pair_h["inlier_count"]),
                        "total_match_count": int(pair_h["total_match_count"]),
                        "inlier_ratio": float(pair_h["inlier_ratio"]),
                        "global_similarity": similarity,
                    }
                )

        markers = []
        marker_idx = 1
        for item in marker_bins.values():
            observations = item.get("observations", {})
            if len(observations) < 2:
                continue
            markers.append(
                {
                    "markerId": f"auto-m{marker_idx}",
                    "observations": observations,
                }
            )
            marker_idx += 1

        if not markers:
            raise RuntimeError("Auto feature matching produced no cross-camera shared markers")

        return {
            "mode": "multiview_feature_matching",
            "anchor_camera_id": anchor_camera_id,
            "method_requested": method,
            "pair_count": len(pair_stats),
            "pair_stats": pair_stats,
            "pair_models": pair_models,
            "marker_count": len(markers),
            "markers": markers,
        }
