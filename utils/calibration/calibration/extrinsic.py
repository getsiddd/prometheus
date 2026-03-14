import cv2
import numpy as np
from config import *
from visualization.draw import draw_axis, draw_world_axis

def compute_extrinsic(frame, tags, K, D):

    poses = []

    for tag in tags:

        if tag.tag_id not in TAG_LAYOUT:
            continue

        half = TAG_SIZE / 2

        # Tag local coordinate system
        obj = np.array([
            [-half, -half, 0],
            [ half, -half, 0],
            [ half,  half, 0],
            [-half,  half, 0]
        ], dtype=np.float32)

        img = np.array(tag.corners, dtype=np.float32)

        ok, rvec, tvec = cv2.solvePnP(
            obj,
            img,
            K,
            D,
            flags=cv2.SOLVEPNP_IPPE_SQUARE
        )

        if ok:

            pts = tag.corners.astype(int)

            for i in range(4):
                cv2.line(frame,
                         tuple(pts[i]),
                         tuple(pts[(i+1)%4]),
                         (255,0,255),
                         2)

            center = tuple(tag.center.astype(int))
            cv2.circle(frame, center, 5, (0,255,255), -1)

            # -----------------------
            # LOCAL TAG AXIS
            # -----------------------
            draw_axis(frame, K, D, rvec, tvec)

            # -----------------------
            # GLOBAL AXIS (WORLD)
            # -----------------------
            wx, wy, wz = TAG_LAYOUT[tag.tag_id]

            draw_world_axis(frame, K, D, rvec, tvec)

            x = float(tvec[0])
            y = float(tvec[1])
            z = float(tvec[2])

            cv2.putText(frame,
                        f"ID:{tag.tag_id}",
                        (center[0]+10, center[1]-10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        (0,255,0),
                        2)

            cv2.putText(frame,
                        f"X:{x:.2f} Y:{y:.2f} Z:{z:.2f}",
                        (center[0]+10, center[1]+20),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (255,255,0),
                        2)

            poses.append(tvec[:,0])

    return poses