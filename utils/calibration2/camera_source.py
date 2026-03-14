import cv2
import os


class CameraSource:
    def __init__(self, source="0", width=None, height=None):
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
        ok, frame = self.cap.read()
        if not ok and self.is_file:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = self.cap.read()
        if not ok:
            return None
        return frame

    def release(self):
        if self.cap is not None:
            self.cap.release()
