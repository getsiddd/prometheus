"""Camera source abstraction for webcam, RTSP, and local video files."""

import cv2
import os


class CameraSource:
    """Wrapper around ``cv2.VideoCapture`` with optional looping for file sources."""

    def __init__(self, source="0", width=None, height=None):
        """Open a camera/video source and optionally request capture resolution."""
        self.source = int(source) if str(source).isdigit() else source
        self.is_file = isinstance(self.source, str) and os.path.isfile(self.source)
        self.cap = cv2.VideoCapture(self.source)

        if width is not None:
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, int(width))
        if height is not None:
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, int(height))

        if not self.cap.isOpened():
            raise RuntimeError(f"Cannot open source: {source}")

    def read(self):
        """Read the next frame and loop back to frame 0 when reading from a file at EOF."""
        ok, frame = self.cap.read()
        if not ok and self.is_file:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = self.cap.read()
        if not ok:
            return None
        return frame

    def release(self):
        """Release the underlying capture handle."""
        if self.cap is not None:
            self.cap.release()
