import cv2
import numpy as np


class MotionDetector:

    def __init__(
        self,
        history=200,
        var_threshold=25,
        motion_ratio_threshold=0.01
    ):

        self.bg = cv2.createBackgroundSubtractorMOG2(
            history=history,
            varThreshold=var_threshold,
            detectShadows=False
        )

        self.motion_ratio_threshold = motion_ratio_threshold

    def detect(self, frame):

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        fgmask = self.bg.apply(gray)

        # remove noise
        fgmask = cv2.GaussianBlur(fgmask, (5, 5), 0)

        motion_pixels = np.count_nonzero(fgmask)

        total_pixels = fgmask.size

        motion_ratio = motion_pixels / total_pixels

        if motion_ratio > self.motion_ratio_threshold:
            return True

        return False