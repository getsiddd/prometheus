import cv2
import numpy as np
from config import *

def undistort(frame, K, D):

    if USE_FISHEYE:

        map1,map2 = cv2.fisheye.initUndistortRectifyMap(
            K,
            D,
            np.eye(3),
            K,
            (WIDTH,HEIGHT),
            cv2.CV_16SC2
        )

        frame = cv2.remap(
            frame,
            map1,
            map2,
            cv2.INTER_LINEAR
        )

    else:

        frame = cv2.undistort(frame,K,D)

    return frame
    