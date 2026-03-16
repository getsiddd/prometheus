"""Human-pose based ground-point suggestion service for web calibration."""

from __future__ import annotations

import os

import cv2
import numpy as np

from .common import CalibrationUtils


class HumanPoseGroundService:
    """Detect people and suggest likely ground-contact image points using human pose.

    Implementation uses torchvision Keypoint R-CNN and is forced to run on CPU,
    even if CUDA/MPS is available, per product requirement.
    """

    LEFT_KNEE = 13
    RIGHT_KNEE = 14
    LEFT_ANKLE = 15
    RIGHT_ANKLE = 16

    def __init__(self, utils: CalibrationUtils | None = None):
        self.utils = utils or CalibrationUtils()
        self._torch = None
        self._model = None
        self._device = None

    def _ensure_model(self):
        """Lazily load the pose model on CPU only."""
        if self._model is not None:
            return self._model, self._torch, self._device

        import torch
        from torchvision.models.detection import KeypointRCNN_ResNet50_FPN_Weights, keypointrcnn_resnet50_fpn

        # Force CPU-only execution even on Apple Silicon / CUDA systems.
        device = torch.device("cpu")
        torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))

        try:
            weights = KeypointRCNN_ResNet50_FPN_Weights.DEFAULT
            model = keypointrcnn_resnet50_fpn(weights=weights, progress=False)
        except Exception as exc:
            raise RuntimeError(
                "Unable to load torchvision Keypoint R-CNN weights. "
                "Ensure 'torch' and 'torchvision' are installed and the pretrained model weights can be downloaded at least once. "
                f"Original error: {exc}"
            ) from exc

        model.to(device)
        model.eval()

        self._torch = torch
        self._model = model
        self._device = device
        return self._model, self._torch, self._device

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
    def _to_tensor(torch, image_bgr):
        """Convert OpenCV BGR image to float tensor in RGB CHW format."""
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        tensor = torch.from_numpy(rgb).permute(2, 0, 1).float() / 255.0
        return tensor

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
    def _keypoint_score(value):
        """Normalize torchvision keypoint confidence / visibility value."""
        if value is None:
            return None
        try:
            return float(value)
        except Exception:
            return None

    @staticmethod
    def _is_keypoint_usable(score, threshold):
        """Support either probability-like scores [0,1] or visibility-like values {0,1,2}."""
        if score is None:
            return False
        if score <= 1.0:
            return score >= threshold
        return score >= 1.0

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

        model, torch, device = self._ensure_model()
        image_tensor = self._to_tensor(torch, resized).to(device)

        with torch.inference_mode():
            outputs = model([image_tensor])

        if not outputs:
            return {
                "mode": "human_pose_ground",
                "device": str(device),
                "image_width": int(orig_w),
                "image_height": int(orig_h),
                "suggestion_count": 0,
                "suggestions": [],
            }

        pred = outputs[0]
        boxes = pred.get("boxes")
        scores = pred.get("scores")
        labels = pred.get("labels")
        keypoints = pred.get("keypoints")
        keypoint_scores = pred.get("keypoints_scores")

        if boxes is None or scores is None or labels is None:
            raise RuntimeError("Pose detector output is missing boxes/scores/labels")

        boxes = boxes.detach().cpu().numpy()
        scores = scores.detach().cpu().numpy()
        labels = labels.detach().cpu().numpy()
        keypoints = keypoints.detach().cpu().numpy() if keypoints is not None else None
        keypoint_scores = keypoint_scores.detach().cpu().numpy() if keypoint_scores is not None else None

        suggestions = []
        for idx in range(len(boxes)):
            person_score = float(scores[idx])
            label = int(labels[idx]) if labels is not None else 1
            if label != 1 or person_score < float(min_person_score):
                continue

            box = boxes[idx]
            point_source = "bbox-bottom-center"
            left_ankle_xy = None
            right_ankle_xy = None
            left_ankle_score = None
            right_ankle_score = None

            if keypoints is not None and idx < len(keypoints):
                kps = keypoints[idx]
                kps_scores = keypoint_scores[idx] if keypoint_scores is not None and idx < len(keypoint_scores) else None

                left_ankle = kps[self.LEFT_ANKLE] if len(kps) > self.LEFT_ANKLE else None
                right_ankle = kps[self.RIGHT_ANKLE] if len(kps) > self.RIGHT_ANKLE else None

                if left_ankle is not None:
                    left_ankle_xy = [float(left_ankle[0]), float(left_ankle[1])]
                    left_ankle_score = self._keypoint_score(kps_scores[self.LEFT_ANKLE] if kps_scores is not None else left_ankle[2])
                if right_ankle is not None:
                    right_ankle_xy = [float(right_ankle[0]), float(right_ankle[1])]
                    right_ankle_score = self._keypoint_score(kps_scores[self.RIGHT_ANKLE] if kps_scores is not None else right_ankle[2])

            usable = []
            if self._valid_point(left_ankle_xy, resized.shape[1], resized.shape[0]) and self._is_keypoint_usable(left_ankle_score, min_keypoint_score):
                usable.append((left_ankle_xy, left_ankle_score))
            if self._valid_point(right_ankle_xy, resized.shape[1], resized.shape[0]) and self._is_keypoint_usable(right_ankle_score, min_keypoint_score):
                usable.append((right_ankle_xy, right_ankle_score))

            if usable:
                xs = [pt[0][0] for pt in usable]
                ys = [pt[0][1] for pt in usable]
                point_xy = [float(np.mean(xs)), float(np.max(ys))]
                point_score = float(np.mean([pt[1] for pt in usable if pt[1] is not None] or [person_score]))
                point_source = "ankles"
            else:
                point_xy = self._bottom_center(box)
                point_score = person_score * 0.5

            if not self._valid_point(point_xy, resized.shape[1], resized.shape[0]):
                continue

            full_xy = [float(point_xy[0] / scale), float(point_xy[1] / scale)]
            full_box = [float(v / scale) for v in box]
            suggestions.append(
                {
                    "id": f"auto-ground-{len(suggestions) + 1}",
                    "pixel": full_xy,
                    "score": float(point_score),
                    "person_score": person_score,
                    "source": point_source,
                    "box": full_box,
                    "left_ankle": [float(left_ankle_xy[0] / scale), float(left_ankle_xy[1] / scale)] if left_ankle_xy is not None else None,
                    "right_ankle": [float(right_ankle_xy[0] / scale), float(right_ankle_xy[1] / scale)] if right_ankle_xy is not None else None,
                }
            )

        suggestions.sort(key=lambda item: (-float(item["pixel"][1]), -float(item["score"])))

        return {
            "mode": "human_pose_ground",
            "device": str(device),
            "image_width": int(orig_w),
            "image_height": int(orig_h),
            "suggestion_count": len(suggestions),
            "suggestions": suggestions,
        }
