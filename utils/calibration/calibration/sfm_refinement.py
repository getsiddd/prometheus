import cv2
import numpy as np


class SfMRefiner:

    def __init__(
        self,
        max_frames=14,
        frame_stride=8,
        min_inliers=35,
        resize_width=960
    ):
        self.max_frames = max_frames
        self.frame_stride = frame_stride
        self.min_inliers = min_inliers
        self.resize_width = resize_width

    def _collect_frames(self, source):
        frames = []
        sampled = 0

        while len(frames) < self.max_frames:
            frame = source.read()
            if frame is None:
                continue

            sampled += 1
            if sampled % self.frame_stride != 0:
                continue

            h, w = frame.shape[:2]
            scale = self.resize_width / float(w)
            resized = cv2.resize(frame, (self.resize_width, int(h * scale)))
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
            frames.append(gray)

        return frames

    def analyze(self, source, K):
        frames = self._collect_frames(source)
        if len(frames) < 3:
            return {
                "ok": False,
                "message": "Not enough frames for SfM analysis"
            }

        orb = cv2.ORB_create(3000)
        matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)

        scale = self.resize_width / float(K[0, 2] * 2.0) if K[0, 2] > 0 else 1.0
        K_small = K.copy().astype(np.float64)
        K_small[0, 0] *= scale
        K_small[1, 1] *= scale
        K_small[0, 2] *= scale
        K_small[1, 2] *= scale

        pair_results = []

        for i in range(len(frames) - 1):
            f1 = frames[i]
            f2 = frames[i + 1]

            kp1, des1 = orb.detectAndCompute(f1, None)
            kp2, des2 = orb.detectAndCompute(f2, None)

            if des1 is None or des2 is None:
                continue

            knn = matcher.knnMatch(des1, des2, k=2)

            good = []
            for pair in knn:
                if len(pair) < 2:
                    continue
                m, n = pair
                if m.distance < 0.75 * n.distance:
                    good.append(m)

            if len(good) < self.min_inliers:
                continue

            pts1 = np.float32([kp1[m.queryIdx].pt for m in good])
            pts2 = np.float32([kp2[m.trainIdx].pt for m in good])

            E, mask = cv2.findEssentialMat(
                pts1,
                pts2,
                K_small,
                method=cv2.RANSAC,
                prob=0.999,
                threshold=1.0
            )

            if E is None or mask is None:
                continue

            inliers = int(mask.ravel().sum())
            if inliers < self.min_inliers:
                continue

            _, R, t, _ = cv2.recoverPose(E, pts1, pts2, K_small)

            angle = np.arccos(np.clip((np.trace(R) - 1.0) / 2.0, -1.0, 1.0))

            pair_results.append({
                "inliers": inliers,
                "rotation_deg": float(np.degrees(angle)),
                "translation_norm": float(np.linalg.norm(t))
            })

        if len(pair_results) == 0:
            return {
                "ok": False,
                "message": "SfM failed (insufficient feature geometry)"
            }

        inliers = [p["inliers"] for p in pair_results]
        rotations = [p["rotation_deg"] for p in pair_results]

        return {
            "ok": True,
            "pairs": len(pair_results),
            "median_inliers": int(np.median(inliers)),
            "median_rotation_deg": float(np.median(rotations)),
            "message": "SfM geometry estimated"
        }

    def to_overlay_lines(self, report):
        if not report.get("ok", False):
            return [f"SfM: {report.get('message', 'N/A')}"]

        return [
            "SfM: OK",
            f"Pairs: {report['pairs']}",
            f"Median Inliers: {report['median_inliers']}",
            f"Median Rotation: {report['median_rotation_deg']:.2f} deg"
        ]
