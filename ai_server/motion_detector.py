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

import cv2
import numpy as np
from collections import deque

class MotionDetector2:

    def __init__(
        self,
        resize_width=640,
        resize_height=360,
        background_alpha=0.02,
        diff_threshold=18,
        motion_ratio_threshold=0.002,
        min_contour_area=40,
        temporal_frames=8,
        warmup_frames=30
    ):

        # ==============================
        # Resize settings
        # ==============================

        self.resize_width = resize_width
        self.resize_height = resize_height

        # ==============================
        # Background model parameters
        # ==============================

        self.background_alpha = background_alpha
        self.diff_threshold = diff_threshold

        # ==============================
        # Motion sensitivity
        # ==============================

        self.motion_ratio_threshold = motion_ratio_threshold
        self.min_contour_area = min_contour_area

        # ==============================
        # Temporal smoothing
        # ==============================

        self.temporal_frames = temporal_frames
        self.motion_history = deque(maxlen=temporal_frames)

        # ==============================
        # Warmup handling
        # ==============================

        self.warmup_frames = warmup_frames
        self.frame_count = 0

        # ==============================
        # Background model
        # ==============================

        self.background = None

        # ==============================
        # Morphology kernel
        # ==============================

        self.kernel = np.ones((3, 3), np.uint8)

    # ==========================================================
    # Main detection function
    # ==========================================================

    def detect(self, frame):

        # ==============================
        # Resize frame (speed optimization)
        # ==============================

        small = cv2.resize(
            frame,
            (self.resize_width, self.resize_height),
            interpolation=cv2.INTER_LINEAR
        )

        # ==============================
        # Convert to grayscale
        # ==============================

        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

        # ==============================
        # Noise reduction
        # ==============================

        gray = cv2.GaussianBlur(gray, (5, 5), 0)

        # ==============================
        # Initialize background
        # ==============================

        if self.background is None:

            self.background = gray.astype("float")

            mask = np.zeros_like(gray)

            return False, mask, 0.0

        # ==============================
        # Warmup phase
        # ==============================

        self.frame_count += 1

        if self.frame_count < self.warmup_frames:

            cv2.accumulateWeighted(
                gray,
                self.background,
                self.background_alpha
            )

            mask = np.zeros_like(gray)

            return False, mask, 0.0

        # ==============================
        # Update background model
        # ==============================

        cv2.accumulateWeighted(
            gray,
            self.background,
            self.background_alpha
        )

        background_uint8 = cv2.convertScaleAbs(self.background)

        # ==============================
        # Frame difference
        # ==============================

        diff = cv2.absdiff(gray, background_uint8)

        _, fg = cv2.threshold(
            diff,
            self.diff_threshold,
            255,
            cv2.THRESH_BINARY)

        # ==============================
        # Morphological cleanup
        # ==============================

        fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, self.kernel)
        fg = cv2.morphologyEx(fg, cv2.MORPH_DILATE, self.kernel)

        # ==============================
        # Motion ratio calculation
        # ==============================

        motion_pixels = np.count_nonzero(fg)
        motion_ratio = motion_pixels / fg.size
        motion_detected = False

        # ==============================
        # Contour validation
        # ==============================

        if motion_ratio > self.motion_ratio_threshold:
            contours, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for contour in contours:
                if cv2.contourArea(contour) > self.min_contour_area:
                    motion_detected = True
                    break

        # ==============================
        # Temporal smoothing
        # ==============================

        self.motion_history.append(1 if motion_detected else 0)
        motion_final = (sum(self.motion_history) > (self.temporal_frames // 2))

        return motion_final, fg, motion_ratio


import cv2
import numpy as np
from collections import deque


class MotionDetector3:

    def __init__(
        self,
        resize_width=640,
        resize_height=360,
        background_alpha=0.01,
        diff_threshold=15,
        motion_ratio_threshold=0.001,
        min_motion_pixels=30,
        min_contour_area=20,
        temporal_frames=6,
        warmup_frames=30
    ):

        self.resize_width = resize_width
        self.resize_height = resize_height

        self.background_alpha = background_alpha
        self.diff_threshold = diff_threshold

        self.motion_ratio_threshold = motion_ratio_threshold
        self.min_motion_pixels = min_motion_pixels
        self.min_contour_area = min_contour_area

        self.temporal_frames = temporal_frames
        self.motion_history = deque(maxlen=temporal_frames)

        self.warmup_frames = warmup_frames
        self.frame_count = 0

        self.background = None
        self.roi_small = None
        self.roi_pixels = None

        self.kernel = np.ones((3, 3), np.uint8)

    # ----------------------------------------------------------

    def _prepare_roi(self, roi_mask):

        if roi_mask is None:
            return

        self.roi_small = cv2.resize(
            roi_mask,
            (self.resize_width, self.resize_height),
            interpolation=cv2.INTER_NEAREST
        )

        self.roi_small = self.roi_small.astype(bool)
        self.roi_pixels = np.count_nonzero(self.roi_small)

    # ----------------------------------------------------------

    def detect(self, frame, roi_mask=None):

        small = cv2.resize(
            frame,
            (self.resize_width, self.resize_height),
            interpolation=cv2.INTER_LINEAR
        )

        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)

        # Prepare ROI once
        if roi_mask is not None and self.roi_small is None:
            self._prepare_roi(roi_mask)

        # Initialize background
        if self.background is None:

            self.background = gray.astype("float")

            mask = np.zeros_like(gray)

            return False, mask, 0.0

        self.frame_count += 1

        # Warmup
        if self.frame_count < self.warmup_frames:

            cv2.accumulateWeighted(
                gray,
                self.background,
                self.background_alpha
            )

            mask = np.zeros_like(gray)

            return False, mask, 0.0

        # Update background
        cv2.accumulateWeighted(
            gray,
            self.background,
            self.background_alpha
        )

        background_uint8 = cv2.convertScaleAbs(self.background)

        diff = cv2.absdiff(gray, background_uint8)

        _, fg = cv2.threshold(
            diff,
            self.diff_threshold,
            255,
            cv2.THRESH_BINARY
        )

        fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, self.kernel)
        fg = cv2.morphologyEx(fg, cv2.MORPH_DILATE, self.kernel)

        # Apply ROI mask only here
        if self.roi_small is not None:
            fg[~self.roi_small] = 0

        # --------------------------------------------------

        motion_pixels = np.count_nonzero(fg)

        #if self.roi_pixels is not None:
        #    motion_ratio = motion_pixels / max(self.roi_pixels, 1)
        #else:
        #    motion_ratio = motion_pixels / fg.size
        motion_ratio = motion_pixels / fg.size

        # --------------------------------------------------

        motion_detected = False

        if motion_pixels < self.min_motion_pixels:
            self.motion_history.append(0)
            return False, fg, motion_ratio

        if motion_ratio < self.motion_ratio_threshold:
            self.motion_history.append(0)
            return False, fg, motion_ratio

        contours, _ = cv2.findContours(
            fg,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        for contour in contours:
            if cv2.contourArea(contour) > self.min_contour_area:
                motion_detected = True
                break

        self.motion_history.append(
            1 if motion_detected else 0
        )

        motion_final = (
            sum(self.motion_history)
            > (self.temporal_frames // 2)
        )

        return motion_final, fg, motion_ratio


import cv2
import numpy as np
from collections import deque


class MotionDetector4:

    def __init__(
        self,
        resize_width=640,
        resize_height=360,
        background_alpha=0.02,
        diff_threshold=20,
        min_motion_pixels=40,
        motion_ratio_threshold=0.002,
        min_component_area=25,
        temporal_frames=2,
        warmup_frames=20
    ):

        self.w = resize_width
        self.h = resize_height

        self.alpha = background_alpha
        self.diff_threshold = diff_threshold

        self.min_motion_pixels = min_motion_pixels
        self.motion_ratio_threshold = motion_ratio_threshold
        self.min_component_area = min_component_area

        self.temporal_frames = temporal_frames
        self.motion_history = deque(maxlen=temporal_frames)

        self.warmup_frames = warmup_frames
        self.frame_count = 0

        self.background = None
        self.roi = None
        self.roi_pixels = None

        self.kernel = np.ones((3,3), np.uint8)

    # -----------------------------------------

    def _prepare_roi(self, roi_mask):

        if roi_mask is None:
            return

        roi_small = cv2.resize(
            roi_mask,
            (self.w, self.h),
            interpolation=cv2.INTER_NEAREST
        )

        self.roi = roi_small.astype(bool)
        self.roi_pixels = np.count_nonzero(self.roi)

    # -----------------------------------------

    def detect(self, frame, roi_mask=None):

        small = cv2.resize(frame, (self.w, self.h))

        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

        if roi_mask is not None and self.roi is None:
            self._prepare_roi(roi_mask)

        if self.roi is not None:
            gray[~self.roi] = 0

        # Background init
        if self.background is None:

            self.background = gray.astype(np.float32)
            mask = np.zeros_like(gray)

            return False, mask, 0.0

        self.frame_count += 1

        # Warmup
        if self.frame_count < self.warmup_frames:

            cv2.accumulateWeighted(gray, self.background, self.alpha)
            mask = np.zeros_like(gray)

            return False, mask, 0.0

        # Background image
        bg = cv2.convertScaleAbs(self.background)

        # Difference
        diff = cv2.absdiff(gray, bg)

        _, fg = cv2.threshold(diff, self.diff_threshold, 255, cv2.THRESH_BINARY)

        # small noise removal
        fg = cv2.erode(fg, self.kernel)
        fg = cv2.dilate(fg, self.kernel)

        # ---------------------------------

        motion_pixels = np.count_nonzero(fg)

        if self.roi_pixels:
            ratio = motion_pixels / max(self.roi_pixels, 1)
        else:
            ratio = motion_pixels / fg.size

        # Early exit
        if motion_pixels < self.min_motion_pixels or ratio < self.motion_ratio_threshold:

            self.motion_history.append(0)

            cv2.accumulateWeighted(gray, self.background, self.alpha)

            return False, fg, ratio

        # ---------------------------------

        # Fast component analysis
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(fg)

        motion = False

        for i in range(1, num_labels):

            area = stats[i, cv2.CC_STAT_AREA]

            if area > self.min_component_area:
                motion = True
                break

        self.motion_history.append(1 if motion else 0)

        motion_final = sum(self.motion_history) > (self.temporal_frames // 2)

        # update background slowly
        if not motion:
            cv2.accumulateWeighted(gray, self.background, self.alpha)

        return motion_final, fg, ratio


import cv2
import numpy as np
from collections import deque


class SigmaDeltaMotionDetector:

    def __init__(
        self,
        width=640,
        height=360,
        min_motion_pixels=40,
        motion_ratio_threshold=0.002,
        min_component_area=25,
        temporal_frames=2,
        warmup_frames=20
    ):

        self.w = width
        self.h = height

        self.min_motion_pixels = min_motion_pixels
        self.motion_ratio_threshold = motion_ratio_threshold
        self.min_component_area = min_component_area

        self.temporal_frames = temporal_frames
        self.motion_history = deque(maxlen=temporal_frames)

        self.warmup_frames = warmup_frames
        self.frame_count = 0

        self.M = None  # background model
        self.V = None  # variance model

        self.N = 2  # noise multiplier

        self.roi = None
        self.roi_pixels = None

        self.kernel = np.ones((3,3), np.uint8)

    # ---------------------------------

    def _prepare_roi(self, roi_mask):

        if roi_mask is None:
            return

        roi_small = cv2.resize(
            roi_mask,
            (self.w, self.h),
            interpolation=cv2.INTER_NEAREST
        )

        self.roi = roi_small.astype(bool)
        self.roi_pixels = np.count_nonzero(self.roi)

    # ---------------------------------

    def detect(self, frame, roi_mask=None):

        small = cv2.resize(frame, (self.w, self.h))
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

        if roi_mask is not None and self.roi is None:
            self._prepare_roi(roi_mask)

        if self.roi is not None:
            gray[~self.roi] = 0

        # Initialization
        if self.M is None:

            self.M = gray.copy()
            self.V = np.ones_like(gray, dtype=np.uint8) * 2

            mask = np.zeros_like(gray)

            return False, mask, 0.0

        self.frame_count += 1

        # Warmup
        if self.frame_count < self.warmup_frames:

            self.M = gray.copy()

            mask = np.zeros_like(gray)
            return False, mask, 0.0

        # ---------------------------------
        # Sigma Delta Step 1: Update background
        # ---------------------------------

        self.M[self.M < gray] += 1
        self.M[self.M > gray] -= 1

        # ---------------------------------
        # Step 2: Difference
        # ---------------------------------

        diff = cv2.absdiff(self.M, gray)

        # ---------------------------------
        # Step 3: Update variance
        # ---------------------------------

        self.V[self.V < self.N * diff] += 1
        self.V[self.V > self.N * diff] -= 1

        # ---------------------------------
        # Step 4: Foreground mask
        # ---------------------------------

        fg = diff >= self.V
        fg = fg.astype(np.uint8) * 255

        # Morphology (remove noise)

        fg = cv2.erode(fg, self.kernel)
        fg = cv2.dilate(fg, self.kernel)

        # ---------------------------------

        motion_pixels = np.count_nonzero(fg)

        if self.roi_pixels:
            ratio = motion_pixels / max(self.roi_pixels, 1)
        else:
            ratio = motion_pixels / fg.size

        # Early exit

        if motion_pixels < self.min_motion_pixels or ratio < self.motion_ratio_threshold:

            self.motion_history.append(0)
            return False, fg, ratio

        # ---------------------------------
        # Component filtering
        # ---------------------------------

        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(fg)

        motion = False

        for i in range(1, num_labels):

            area = stats[i, cv2.CC_STAT_AREA]

            if area > self.min_component_area:
                motion = True
                break

        self.motion_history.append(1 if motion else 0)

        motion_final = sum(self.motion_history) > (self.temporal_frames // 2)

        return motion_final, fg, ratio

