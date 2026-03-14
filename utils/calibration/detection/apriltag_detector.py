import apriltag
import cv2

class AprilTagDetector:

    def __init__(self):
        self.detector = apriltag.Detector()

    def detect(self, frame):

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        return self.detector.detect(gray)