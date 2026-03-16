"""Snapshot capture service for the web calibration backend."""

from __future__ import annotations

import cv2

from .common import CalibrationUtils


class SnapshotService:
    """Capture and persist single-frame snapshots from camera/video sources."""

    def __init__(self, utils: CalibrationUtils | None = None):
        self.utils = utils or CalibrationUtils()

    def capture_snapshot(self, source: str, output_path: str):
        """Capture and save a single frame from ``source`` to ``output_path``."""
        src = self.utils.parse_source(source)
        cap = cv2.VideoCapture(src)

        if not cap.isOpened():
            raise RuntimeError(f"Cannot open source: {source}")

        frame = None
        for _ in range(12):
            ok, f = cap.read()
            if ok and f is not None:
                frame = f

        cap.release()

        if frame is None:
            raise RuntimeError("Could not read frame from source")

        self.utils.ensure_parent_dir(output_path)
        ok = cv2.imwrite(output_path, frame)
        if not ok:
            raise RuntimeError("Failed to write snapshot image")

        return {
            "ok": True,
            "output": output_path,
        }
