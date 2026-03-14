import cv2
import numpy as np
from config import TAG_SIZE

def draw_axis(frame, K, D, rvec, tvec):

    axis_len = TAG_SIZE * 0.8

    axis = np.float32([
        [0,0,0],
        [axis_len,0,0],
        [0,axis_len,0],
        [0,0,axis_len]
    ])

    imgpts, _ = cv2.projectPoints(axis, rvec, tvec, K, D)

    # reshape from (4,1,2) → (4,2)
    imgpts = imgpts.reshape(-1,2)

    # check for invalid projections
    if not np.isfinite(imgpts).all():
        return

    # convert to integer tuples
    o = tuple(imgpts[0].astype(int))
    x = tuple(imgpts[1].astype(int))
    y = tuple(imgpts[2].astype(int))
    z = tuple(imgpts[3].astype(int))

    cv2.line(frame, o, x, (0,0,255), 3)   # X axis
    cv2.line(frame, o, y, (0,255,0), 3)   # Y axis
    cv2.line(frame, o, z, (255,0,0), 3)   # Z axis


def draw_world_axis(frame, K, D, rvec, tvec):

    axis = np.float32([
        [0,0,0],
        [0.2,0,0],
        [0,0.2,0],
        [0,0,0.2]
    ])

    pts, _ = cv2.projectPoints(axis, rvec, tvec, K, D)

    pts = pts.reshape(-1,2)

    o = tuple(pts[0].astype(int))
    x = tuple(pts[1].astype(int))
    y = tuple(pts[2].astype(int))
    z = tuple(pts[3].astype(int))

    cv2.line(frame, o, x, (0,0,255), 2)
    cv2.line(frame, o, y, (0,255,0), 2)
    cv2.line(frame, o, z, (255,0,0), 2)


