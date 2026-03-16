"""Human-pose based ground-point suggestion service for web calibration."""

from __future__ import annotations

import os
import sys
import urllib.request

import cv2
import numpy as np

from .common import CalibrationUtils


class HumanPoseGroundService:
    """Detect people and suggest likely ground-contact image points using human pose.

    Implementation uses MediaPipe Pose Landmarker and is forced to run on CPU,
    even if CUDA/MPS is available, per product requirement.
    """

    LEFT_ANKLE = 27
    RIGHT_ANKLE = 28
    MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"

    def __init__(self, utils: CalibrationUtils | None = None):
        self.utils = utils or CalibrationUtils()
        self._model = None
        self._mp = None
        self._model_info = None

    def _ensure_model(self):
        """Lazily load MediaPipe pose model on CPU."""
        if self._model is not None:
            return self._model, self._mp, self._model_info

        try:
            import mediapipe as mp

            cache_dir = os.path.join(os.path.expanduser("~"), ".cache", "prometheus", "mediapipe")
            os.makedirs(cache_dir, exist_ok=True)
            model_path = os.path.join(cache_dir, "pose_landmarker_lite.task")
            was_cached_before = os.path.exists(model_path)

            if not was_cached_before:
                print(f"Downloading MediaPipe Pose model from {self.MODEL_URL}", file=sys.stderr)
                with urllib.request.urlopen(self.MODEL_URL) as response, open(model_path, "wb") as out_file:
                    total = int(response.headers.get("Content-Length", "0") or "0")
                    received = 0
                    chunk_size = 1 << 20
                    last_percent = -1
                    while True:
                        chunk = response.read(chunk_size)
                        if not chunk:
                            break
                        out_file.write(chunk)
                        received += len(chunk)
                        if total > 0:
                            percent = int((received * 100) / total)
                            if percent != last_percent and (percent % 5 == 0 or percent == 100):
                                print(f"MediaPipe model download: {percent}% ({received}/{total} bytes)", file=sys.stderr)
                                last_percent = percent

            base_options = mp.tasks.BaseOptions(model_asset_path=model_path)
            options = mp.tasks.vision.PoseLandmarkerOptions(
                base_options=base_options,
                running_mode=mp.tasks.vision.RunningMode.IMAGE,
                num_poses=4,
                min_pose_detection_confidence=0.5,
                min_pose_presence_confidence=0.4,
                min_tracking_confidence=0.4,
            )
            model = mp.tasks.vision.PoseLandmarker.create_from_options(options)

            is_cached_after = os.path.exists(model_path)
            file_size_bytes = int(os.path.getsize(model_path)) if is_cached_after else None

            self._model_info = {
                "status": "ready-cached" if was_cached_before else "downloaded-and-ready",
                "engine": "mediapipe-pose",
                "device": "cpu",
                "weights_url": self.MODEL_URL,
                "weights_cache_path": model_path,
                "download_performed": bool((not was_cached_before) and is_cached_after),
                "download_percent": 100 if is_cached_after else None,
                "weights_file_size_bytes": file_size_bytes,
            }
            self._mp = mp
        except Exception as exc:
            raise RuntimeError(
                "Unable to load MediaPipe Pose model. "
                "Ensure 'mediapipe' is installed correctly for this Python environment. "
                f"Original error: {exc}"
            ) from exc

        self._model = model
        return self._model, self._mp, self._model_info

    @staticmethod
    def _resize_image(image_bgr, max_side: int):
        """Resize image preserving aspect ratio for faster CPU inference."""
        h, w = image_bgr.shape[:2]
        scale = 1.0
        max_dim = max(h, w)
        if max_side > 0 and max_dim > max_side:
            scale = float(max_side) / float(max_dim)
            image_bgr = cv2.resize(image_bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        return image_bgr, scale

    @staticmethod
    def _valid_point(pt_xy, width, height):
        """Check point is finite and inside image bounds."""
        if pt_xy is None or len(pt_xy) != 2:
            return False
        x, y = float(pt_xy[0]), float(pt_xy[1])
        if not np.isfinite(x) or not np.isfinite(y):
            return False
        return 0 <= x < width and 0 <= y < height

    @staticmethod
    def _keypoint_score(visibility, threshold):
        """Convert MediaPipe visibility score to normalized confidence."""
        if visibility is None:
            return None
        try:
            score = float(visibility)
        except Exception:
            return None
        return score if score >= threshold else None

    @staticmethod
    def _bottom_center(box):
        """Return bottom-center point of a bounding box."""
        x1, y1, x2, y2 = [float(v) for v in box]
        return [(x1 + x2) * 0.5, y2]

    def detect_ground_points(
        self,
        image_path: str,
        *,
        max_side: int = 960,
        min_person_score: float = 0.65,
        min_keypoint_score: float = 0.35,
    ):
        """Detect people and output likely ground-contact image points.

        Returns one suggestion per detected person using ankles when available,
        otherwise falling back to the bottom-center of the person box.
        """
        if not image_path or not os.path.exists(image_path):
            raise RuntimeError(f"Image not found: {image_path}")

        frame = cv2.imread(image_path)
        if frame is None:
            raise RuntimeError(f"Unable to decode image: {image_path}")

        orig_h, orig_w = frame.shape[:2]
        resized, scale = self._resize_image(frame, max_side=max_side)

        model, mp, model_info = self._ensure_model()
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = model.detect(mp_image)

        if not result or not result.pose_landmarks:
            return {
                "mode": "human_pose_ground",
                "device": "cpu",
                "model": model_info,
                "image_width": int(orig_w),
                "image_height": int(orig_h),
                "detection_count": 0,
                "detections": [],
                "suggestion_count": 0,
                "suggestions": [],
            }

        poses = result.pose_landmarks or []
        if not poses:
            return {
                "mode": "human_pose_ground",
                "device": "cpu",
                "model": model_info,
                "image_width": int(orig_w),
                "image_height": int(orig_h),
                "detection_count": 0,
                "detections": [],
                "suggestion_count": 0,
                "suggestions": [],
            }

        def lm_xy(lm):
            return [float(lm.x * resized.shape[1]), float(lm.y * resized.shape[0])]

        detections = []
        suggestions = []
        for pose_index, landmarks in enumerate(poses):
            if not landmarks:
                continue

            visible = [lm for lm in landmarks if 0.0 <= lm.x <= 1.0 and 0.0 <= lm.y <= 1.0]
            if visible:
                xs = [lm.x * resized.shape[1] for lm in visible]
                ys = [lm.y * resized.shape[0] for lm in visible]
                box = [float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys))]
            else:
                box = [0.0, 0.0, float(resized.shape[1] - 1), float(resized.shape[0] - 1)]

            left_ankle_lm = landmarks[self.LEFT_ANKLE] if len(landmarks) > self.LEFT_ANKLE else None
            right_ankle_lm = landmarks[self.RIGHT_ANKLE] if len(landmarks) > self.RIGHT_ANKLE else None

            left_ankle_xy = lm_xy(left_ankle_lm) if left_ankle_lm is not None else None
            right_ankle_xy = lm_xy(right_ankle_lm) if right_ankle_lm is not None else None
            left_ankle_score = self._keypoint_score(getattr(left_ankle_lm, "visibility", None), min_keypoint_score)
            right_ankle_score = self._keypoint_score(getattr(right_ankle_lm, "visibility", None), min_keypoint_score)

            usable = []
            if self._valid_point(left_ankle_xy, resized.shape[1], resized.shape[0]) and left_ankle_score is not None:
                usable.append((left_ankle_xy, left_ankle_score))
            if self._valid_point(right_ankle_xy, resized.shape[1], resized.shape[0]) and right_ankle_score is not None:
                usable.append((right_ankle_xy, right_ankle_score))

            if usable:
                xs = [pt[0][0] for pt in usable]
                ys = [pt[0][1] for pt in usable]
                point_xy = [float(np.mean(xs)), float(np.max(ys))]
                point_score = float(np.mean([pt[1] for pt in usable]))
                point_source = "ankles"
            else:
                point_xy = self._bottom_center(box)
                point_score = float(visible[0].visibility) if visible and hasattr(visible[0], "visibility") else 0.0
                point_source = "bbox-bottom-center"

            is_valid_ground_point = self._valid_point(point_xy, resized.shape[1], resized.shape[0])
            person_score = float(max(
                [
                    float(getattr(left_ankle_lm, "visibility", 0.0)) if left_ankle_lm is not None else 0.0,
                    float(getattr(right_ankle_lm, "visibility", 0.0)) if right_ankle_lm is not None else 0.0,
                    point_score,
                ]
            ))

            full_box = [float(v / scale) for v in box]
            full_left_ankle = [float(left_ankle_xy[0] / scale), float(left_ankle_xy[1] / scale)] if left_ankle_xy is not None else None
            full_right_ankle = [float(right_ankle_xy[0] / scale), float(right_ankle_xy[1] / scale)] if right_ankle_xy is not None else None
            full_ground_point = [float(point_xy[0] / scale), float(point_xy[1] / scale)] if is_valid_ground_point else None

            detections.append(
                {
                    "id": f"person-{pose_index + 1}",
                    "label": "person",
                    "person_score": person_score,
                    "passes_person_threshold": person_score >= float(min_person_score),
                    "source": point_source,
                    "box": full_box,
                    "ground_point": full_ground_point,
                    "ground_point_score": float(point_score) if is_valid_ground_point else None,
                    "left_ankle": full_left_ankle,
                    "right_ankle": full_right_ankle,
                    "left_ankle_score": float(left_ankle_score) if left_ankle_score is not None else None,
                    "right_ankle_score": float(right_ankle_score) if right_ankle_score is not None else None,
                }
            )

            if person_score >= float(min_person_score) and is_valid_ground_point:
                suggestions.append(
                    {
                        "id": f"auto-ground-{len(suggestions) + 1}",
                        "pixel": full_ground_point,
                        "score": float(point_score),
                        "person_score": person_score,
                        "source": point_source,
                        "box": full_box,
                        "left_ankle": full_left_ankle,
                        "right_ankle": full_right_ankle,
                    }
                )

        detections.sort(key=lambda item: -float(item["person_score"]))
        suggestions.sort(key=lambda item: (-float(item["pixel"][1]), -float(item["score"])))

        return {
            "mode": "human_pose_ground",
            "device": "cpu",
            "model": model_info,
            "image_width": int(orig_w),
            "image_height": int(orig_h),
            "detection_count": len(detections),
            "detections": detections,
            "suggestion_count": len(suggestions),
            "suggestions": suggestions,
        }
