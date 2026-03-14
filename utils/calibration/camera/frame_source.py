import cv2

class FrameSource:

    def __init__(self, camera_id=0):
        self.cap = cv2.VideoCapture(camera_id)

    def read(self):

        ret, frame = self.cap.read()

        if not ret:
            return None

        return frame

    def close(self):
        self.cap.release()