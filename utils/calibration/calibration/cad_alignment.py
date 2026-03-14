import os
import cv2
import yaml
import numpy as np


class CADModelAligner:

    def __init__(self, alignment_file="cad_alignment.yaml"):
        self.alignment_file = alignment_file
        self.world_points = None
        self.image_points = None

    def load(self):
        if not os.path.exists(self.alignment_file):
            return False

        with open(self.alignment_file, "r") as f:
            data = yaml.safe_load(f) or {}

        correspondences = data.get("correspondences", [])
        if len(correspondences) < 4:
            return False

        world = []
        image = []
        for item in correspondences:
            w = item.get("world", None)
            p = item.get("pixel", None)
            if w is None or p is None:
                continue
            if len(w) != 3 or len(p) != 2:
                continue
            world.append(w)
            image.append(p)

        if len(world) < 4:
            return False

        self.world_points = np.array(world, dtype=np.float32)
        self.image_points = np.array(image, dtype=np.float32)
        return True

    def estimate_pose(self, K, D):
        if self.world_points is None or self.image_points is None:
            return {
                "ok": False,
                "message": "CAD correspondences not loaded"
            }

        ok, rvec, tvec, inliers = cv2.solvePnPRansac(
            self.world_points,
            self.image_points,
            K,
            D,
            flags=cv2.SOLVEPNP_ITERATIVE
        )

        if not ok:
            return {
                "ok": False,
                "message": "solvePnPRansac failed"
            }

        projected, _ = cv2.projectPoints(self.world_points, rvec, tvec, K, D)
        projected = projected.reshape(-1, 2)
        error = np.linalg.norm(projected - self.image_points, axis=1)

        return {
            "ok": True,
            "rvec": rvec,
            "tvec": tvec,
            "inliers": 0 if inliers is None else int(len(inliers)),
            "reproj_rmse_px": float(np.sqrt(np.mean(np.square(error))))
        }

    def floor_homography_from_pose(self, K, rvec, tvec):
        R, _ = cv2.Rodrigues(rvec)

        H_img = K @ np.column_stack((R[:, 0], R[:, 1], tvec.reshape(3)))

        if abs(np.linalg.det(H_img)) < 1e-9:
            return None

        H = np.linalg.inv(H_img)
        H = H / H[2, 2]
        return H
