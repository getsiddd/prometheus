import cv2
import numpy as np
import struct
import time
from multiprocessing import shared_memory

# ==============================
# CONFIGURATION
# ==============================

USE_SHARED_MEMORY = True
RTSP_URL = "rtsp://admin:asdf123%40@192.168.176.161:554/Streaming/Channels/101?transport=tcp"

SHM_NAME = "cam4"
WIDTH = 1920
HEIGHT = 1080
SLOTS = 20
HEADER_SIZE = 32
FRAME_SIZE = WIDTH * HEIGHT * 3 // 2

CHECKERBOARD = (6, 4)
SQUARE_SIZE_MM = 60
SAVE_FILE = "camera_calibration.npz"

GRID_ROWS = 3
GRID_COLS = 3

MIN_SAMPLES_PER_REGION = 3

# ==============================
# SHARED MEMORY READER
# ==============================

class SharedMemoryReader:
    def __init__(self, name):
        self.shm = shared_memory.SharedMemory(name=name)
        self.buffer = self.shm.buf
        self.index = 0

    def read_latest_frame(self):
        new_index = struct.unpack_from("Q", self.buffer, 0)[0]
        if new_index == self.index:
            return None

        self.index = new_index
        slot = (self.index - 1) % SLOTS
        offset = HEADER_SIZE + slot * FRAME_SIZE
        raw = self.buffer[offset:offset + FRAME_SIZE]

        yuv = np.frombuffer(raw, dtype=np.uint8).reshape(
            (HEIGHT * 3 // 2, WIDTH)
        )

        return cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR_I420)

# ==============================
# VIDEO SOURCE
# ==============================

if USE_SHARED_MEMORY:
    source = SharedMemoryReader(SHM_NAME)
else:
    cap = cv2.VideoCapture(RTSP_URL)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

# ==============================
# PREPARE OBJECT POINT TEMPLATE
# ==============================

objp_template = np.zeros((CHECKERBOARD[0] * CHECKERBOARD[1], 3), np.float32)
objp_template[:, :2] = np.mgrid[0:CHECKERBOARD[0], 0:CHECKERBOARD[1]].T.reshape(-1, 2)
objp_template *= SQUARE_SIZE_MM

objpoints = []
imgpoints = []

region_counts = np.zeros((GRID_ROWS, GRID_COLS), dtype=int)

print("Starting AUTO intrinsic calibration...")
print("Move chessboard to cover entire frame...")

# ==============================
# MAIN LOOP
# ==============================

while True:

    if USE_SHARED_MEMORY:
        frame = source.read_latest_frame()
        if frame is None:
            time.sleep(0.01)
            continue
    else:
        ret, frame = cap.read()
        if not ret:
            continue

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    ret, corners = cv2.findChessboardCorners(gray, CHECKERBOARD, None)

    if ret:

        corners2 = cv2.cornerSubPix(
            gray,
            corners,
            (11,11),
            (-1,-1),
            (cv2.TermCriteria_EPS + cv2.TermCriteria_MAX_ITER, 30, 0.001)
        )

        # Determine region based on board center
        center = np.mean(corners2, axis=0)[0]
        x_ratio = center[0] / WIDTH
        y_ratio = center[1] / HEIGHT

        col = min(int(x_ratio * GRID_COLS), GRID_COLS-1)
        row = min(int(y_ratio * GRID_ROWS), GRID_ROWS-1)

        if region_counts[row, col] < MIN_SAMPLES_PER_REGION:

            objpoints.append(objp_template)
            imgpoints.append(corners2)
            region_counts[row, col] += 1

            print(f"[✔] Captured region ({row},{col}) count={region_counts[row,col]}")

        cv2.drawChessboardCorners(frame, CHECKERBOARD, corners2, ret)

    # Draw grid overlay
    for r in range(1, GRID_ROWS):
        cv2.line(frame, (0, r*HEIGHT//GRID_ROWS), (WIDTH, r*HEIGHT//GRID_ROWS), (255,0,0), 1)

    for c in range(1, GRID_COLS):
        cv2.line(frame, (c*WIDTH//GRID_COLS, 0), (c*WIDTH//GRID_COLS, HEIGHT), (255,0,0), 1)

    cv2.imshow("AUTO Intrinsic Calibration", frame)

    # Check completion
    if np.all(region_counts >= MIN_SAMPLES_PER_REGION):
        print("All regions sufficiently covered.")
        break

    if cv2.waitKey(1) == 27:
        break

# ==============================
# PERFORM CALIBRATION
# ==============================

print("Performing calibration...")

flags = (
    cv2.CALIB_RATIONAL_MODEL
)

ret, mtx, dist, rvecs, tvecs = cv2.calibrateCamera(
    objpoints,
    imgpoints,
    (WIDTH, HEIGHT),
    None,
    None,
    flags=flags
)

# ==============================
# REPROJECTION ERROR
# ==============================

mean_error = 0

for i in range(len(objpoints)):
    imgpoints2, _ = cv2.projectPoints(
        objpoints[i],
        rvecs[i],
        tvecs[i],
        mtx,
        dist
    )

    error = cv2.norm(imgpoints[i], imgpoints2, cv2.NORM_L2) / len(imgpoints2)
    mean_error += error

mean_error /= len(objpoints)

print("\n===== RESULTS =====")
print("Camera Matrix:\n", mtx)
print("Distortion Coefficients:\n", dist)
print("Mean Reprojection Error:", mean_error)

np.savez(SAVE_FILE, mtx=mtx, dist=dist)

print(f"[✔] Calibration saved to {SAVE_FILE}")

if not USE_SHARED_MEMORY:
    cap.release()

cv2.destroyAllWindows()
