import cv2
import numpy as np
import apriltag
import struct
import time
import matplotlib.pyplot as plt
from matplotlib import patches
from mpl_toolkits.mplot3d import Axes3D
from multiprocessing import shared_memory
import threading
import os

# ==========================================================
# CONFIGURATION
# ==========================================================
USE_SHARED_MEMORY = True
SHM_NAME = "camera_1"
WIDTH = 1920
HEIGHT = 1080
SLOTS = 20
HEADER_SIZE = 32
FRAME_SIZE = WIDTH * HEIGHT * 3 // 2

CHECKERBOARD = (9, 6)
SQUARE_SIZE_MM = 30

GRID_ROWS = 3
GRID_COLS = 3
MIN_SAMPLES_PER_REGION = 4

TAG_SIZE_METERS = 0.39
TAG_AXIS_SCALE = TAG_SIZE_METERS * 2  # Twice the tag size

DIST_X = 4.0
DIST_Y = 3.0
TAG_LAYOUT = {
    0: (0.0, 0.0, 0.0),
    1: (DIST_X, 0.0, 0.0),
    2: (DIST_X, DIST_Y, 0.0),
    3: (0.0, DIST_Y, 0.0),
}

INTRINSIC_FILE = "intrinsics.npz"
EXTRINSIC_FILE = "extrinsics.npz"
HEATMAP_ALPHA = 0.6
STABLE_THRESHOLD = 0.05

# ==========================================================
# FRAME SOURCE
# ==========================================================
class FrameSource:
    def __init__(self):
        self.index = 0
        self.shm = shared_memory.SharedMemory(name=SHM_NAME)
        self.buffer = self.shm.buf
        print("[SOURCE] Connected to shared memory")

    def read(self):
        try:
            index1 = struct.unpack_from("Q", self.buffer, 0)[0]
            index2 = struct.unpack_from("Q", self.buffer, 0)[0]
            if index1 != index2 or index1 == 0 or index1 == self.index:
                return None
            self.index = index1
            slot = self.index % SLOTS
            offset = HEADER_SIZE + slot * FRAME_SIZE
            raw = self.buffer[offset:offset+FRAME_SIZE]
            yuv = np.frombuffer(raw, dtype=np.uint8).reshape((HEIGHT*3//2, WIDTH))
            return cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR_I420)
        except Exception:
            return None

    def close(self):
        self.shm.close()

# ==========================================================
# DRAW UTILITIES
# ==========================================================
def draw_axis(frame, mtx, dist, rvec, tvec, size):
    axis = np.float32([[0,0,0],[size,0,0],[0,size,0],[0,0,-size]])
    imgpts,_ = cv2.projectPoints(axis, rvec, tvec, mtx, dist)
    imgpts = imgpts.reshape(-1,2)
    imgpts = [(int(pt[0]), int(pt[1])) for pt in imgpts]
    o = imgpts[0]
    cv2.line(frame, o, imgpts[1], (0,0,255), 3)
    cv2.line(frame, o, imgpts[2], (0,255,0), 3)
    cv2.line(frame, o, imgpts[3], (255,0,0), 3)

def draw_tag_axis_and_label(frame, mtx, dist, rvec, tvec, size, tag_id):
    try:
        # Ensure rvec and tvec are correct shape
        rvec = np.asarray(rvec, dtype=np.float32).reshape(3,1)
        tvec = np.asarray(tvec, dtype=np.float32).reshape(3,1)

        axis = np.float32([[0,0,0],[size,0,0],[0,size,0],[0,0,-size]])
        imgpts, _ = cv2.projectPoints(axis, rvec, tvec, mtx, dist)

        if imgpts is None or len(imgpts) != 4:
            return  # skip if projectPoints failed

        imgpts = imgpts.reshape(-1,2)
        imgpts = [(int(round(pt[0])), int(round(pt[1]))) for pt in imgpts]

        if not all(isinstance(pt, tuple) and len(pt)==2 for pt in imgpts):
            return  # skip if conversion failed

        o = imgpts[0]
        # Draw axes
        cv2.line(frame, o, imgpts[1], (0,0,255), 2)
        cv2.line(frame, o, imgpts[2], (0,255,0), 2)
        cv2.line(frame, o, imgpts[3], (255,0,0), 2)

        # Draw tag ID text
        pos_text = f"ID:{tag_id} ({tvec[0,0]:.2f},{tvec[1,0]:.2f},{tvec[2,0]:.2f})"
        cv2.putText(frame, pos_text, (o[0]+5, o[1]-5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,255,255), 2)

    except Exception as e:
        # Safely ignore drawing errors
        print(f"[WARN] draw_tag_axis_and_label skipped: {e}")

def draw_region_grid(frame, region_counts):
    cell_w = WIDTH // GRID_COLS
    cell_h = HEIGHT // GRID_ROWS
    for r in range(GRID_ROWS):
        for c in range(GRID_COLS):
            x1, y1 = c*cell_w, r*cell_h
            x2, y2 = x1+cell_w, y1+cell_h
            count = region_counts[r,c]
            if count >= MIN_SAMPLES_PER_REGION:
                color, status = (0,200,0), "DONE"
            elif count > 0:
                color, status = (0,200,200), f"{count}/{MIN_SAMPLES_PER_REGION}"
            else:
                color, status = (0,0,200), "PENDING"
            cv2.rectangle(frame, (x1,y1), (x2,y2), color, 2)
            cv2.putText(frame, status, (x1+10,y1+30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

def draw_reproj_heatmap(frame, errors):
    if len(errors) == 0: return
    heatmap = np.zeros(frame.shape[:2], np.float32)
    for (r,c), e in errors.items():
        cell_w = WIDTH//GRID_COLS
        cell_h = HEIGHT//GRID_ROWS
        x1, y1 = c*cell_w, r*cell_h
        x2, y2 = x1+cell_w, y1+cell_h
        heatmap[y1:y2, x1:x2] = e
    max_val = max(list(errors.values()) + [1e-6])
    heatmap = np.clip(heatmap/max_val,0,1)
    colored = cv2.applyColorMap((heatmap*255).astype(np.uint8), cv2.COLORMAP_JET)
    cv2.addWeighted(colored, HEATMAP_ALPHA, frame, 1-HEATMAP_ALPHA, 0, frame)

# ==========================================================
# INTRINSIC CALIBRATION
# ==========================================================
def intrinsic_calibration(source, timeout_seconds=120):
    TOTAL_REQUIRED = GRID_ROWS*GRID_COLS*MIN_SAMPLES_PER_REGION
    objp = np.zeros((CHECKERBOARD[0]*CHECKERBOARD[1],3), np.float32)
    objp[:,:2] = np.mgrid[0:CHECKERBOARD[0],0:CHECKERBOARD[1]].T.reshape(-1,2)
    objp *= SQUARE_SIZE_MM

    objpoints, imgpoints = [], []
    region_counts = np.zeros((GRID_ROWS, GRID_COLS), dtype=int)
    reproj_errors = {}
    prev_error = float('inf')
    stable_count = 0

    start_time = time.time()

    while not np.all(region_counts>=MIN_SAMPLES_PER_REGION):
        if time.time() - start_time > timeout_seconds:
            print("[INTRINSIC] Timeout reached, stopping calibration")
            break

        frame = source.read()
        if frame is None:
            time.sleep(0.01)
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        ret, corners = cv2.findChessboardCorners(gray, CHECKERBOARD, None)
        mean_error = None

        if ret:
            corners2 = cv2.cornerSubPix(gray, corners, (11,11), (-1,-1),
                                        (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER,30,0.001))
            center = np.mean(corners2, axis=0)[0]
            col = min(int(center[0]/WIDTH*GRID_COLS), GRID_COLS-1)
            row = min(int(center[1]/HEIGHT*GRID_ROWS), GRID_ROWS-1)

            # Only add if region not done
            if region_counts[row,col] < MIN_SAMPLES_PER_REGION:
                objpoints.append(objp.copy())
                imgpoints.append(corners2.copy())
                region_counts[row,col] += 1

            cv2.drawChessboardCorners(frame, CHECKERBOARD, corners2, ret)

        # Compute mean reprojection error even if len(objpoints)<=5
        if len(objpoints) > 0:
            ret_tmp, mtx_tmp, dist_tmp, rvecs_tmp, tvecs_tmp = cv2.calibrateCamera(
                objpoints, imgpoints, (WIDTH, HEIGHT), None, None
            )
            mean_error = 0
            for i in range(len(objpoints)):
                img2,_ = cv2.projectPoints(objpoints[i], rvecs_tmp[i], tvecs_tmp[i], mtx_tmp, dist_tmp)
                e = cv2.norm(imgpoints[i], img2, cv2.NORM_L2)/len(img2)
                mean_error += e
                cell_r = int(np.mean(objpoints[i][:,1])/SQUARE_SIZE_MM)
                cell_c = int(np.mean(objpoints[i][:,0])/SQUARE_SIZE_MM)
                reproj_errors[(cell_r%GRID_ROWS, cell_c%GRID_COLS)] = e
            mean_error /= len(objpoints)

            fx,fy = mtx_tmp[0,0], mtx_tmp[1,1]
            cx,cy = mtx_tmp[0,2], mtx_tmp[1,2]
            cv2.putText(frame,f"Reproj Error: {mean_error:.4f}",(30,90),
                        cv2.FONT_HERSHEY_SIMPLEX,0.8,(0,255,255),2)
            cv2.putText(frame,f"fx:{fx:.1f} fy:{fy:.1f}",(30,130),
                        cv2.FONT_HERSHEY_SIMPLEX,0.7,(255,255,0),2)
            cv2.putText(frame,f"cx:{cx:.1f} cy:{cy:.1f}",(30,160),
                        cv2.FONT_HERSHEY_SIMPLEX,0.7,(255,255,0),2)
            draw_reproj_heatmap(frame, reproj_errors)

            # Stable error check
            if mean_error is not None:
                if abs(mean_error-prev_error) < STABLE_THRESHOLD:
                    stable_count += 1
                else:
                    stable_count = 0
                prev_error = mean_error
                if stable_count >= 30:
                    print("[INTRINSIC] Stable error reached, finishing calibration")
                    break

        progress = np.sum(region_counts)/TOTAL_REQUIRED*100
        cv2.putText(frame,f"Intrinsic Progress: {progress:.1f}%",(30,50),
                    cv2.FONT_HERSHEY_SIMPLEX,1,(0,255,0),2)
        draw_region_grid(frame, region_counts)
        cv2.imshow("Calibration + Tags", frame)
        if cv2.waitKey(1) == 27: break

    # Final calibration
    ret, mtx, dist, _, _ = cv2.calibrateCamera(objpoints, imgpoints, (WIDTH,HEIGHT), None, None)
    np.savez(INTRINSIC_FILE, mtx=mtx, dist=dist)
    print("[INTRINSIC] Saved.")
    return mtx, dist, reproj_errors

# ==========================================================
# EXTRINSIC CALIBRATION + 3D SCENE
# ==========================================================
class ExtrinsicCalibrator3D:
    def __init__(self, source, mtx, dist):
        self.source = source
        self.mtx = mtx
        self.dist = dist
        self.detector = apriltag.Detector()
        self.tag_positions = TAG_LAYOUT
        self.results = []
        self.lock = threading.Lock()
        self.running = True
        # 3D scene setup
        self.fig = plt.figure("3D Scene")
        self.ax = self.fig.add_subplot(111, projection='3d')
        self.ax.set_xlim(-1,DIST_X+1)
        self.ax.set_ylim(-1,DIST_Y+1)
        self.ax.set_zlim(0,2)
        self.ax.set_xlabel("X")
        self.ax.set_ylabel("Y")
        self.ax.set_zlabel("Z")
        self.ax.view_init(elev=30, azim=-60)

    def update(self):
        while self.running:
            frame = self.source.read()
            if frame is None:
                time.sleep(0.01)
                continue
            undist = cv2.undistort(frame, self.mtx, self.dist)
            gray = cv2.cvtColor(undist, cv2.COLOR_BGR2GRAY)
            results = self.detector.detect(gray)
            self.lock.acquire()
            self.results = results
            self.lock.release()
            # Draw axes + tag IDs on image
            for r in results:
                if r.tag_id not in self.tag_positions: continue
                wx,wy,wz = self.tag_positions[r.tag_id]
                half = TAG_SIZE_METERS/2
                tag_obj_points = np.array([
                    (wx-half,wy-half,0),
                    (wx+half,wy-half,0),
                    (wx+half,wy+half,0),
                    (wx-half,wy+half,0)
                ], dtype=np.float32)
                tag_img_points = np.array(r.corners, dtype=np.float32)
                ok_tag, rvec_tag, tvec_tag = cv2.solvePnP(tag_obj_points, tag_img_points, self.mtx, self.dist)
                if ok_tag:
                    draw_tag_axis_and_label(undist, self.mtx, self.dist, rvec_tag, tvec_tag, TAG_AXIS_SCALE, r.tag_id)
                cv2.polylines(undist,[r.corners.astype(int)],True,(0,255,0),2)
            cv2.imshow("Calibration + Tags", undist)
            if cv2.waitKey(1)==27:
                self.running=False
                break
            self.update_3d_scene(results)
            plt.pause(0.001)

    def update_3d_scene(self, results):
        self.ax.cla()
        # Floor
        self.ax.plot([0,DIST_X,DIST_X,0,0],[0,0,DIST_Y,DIST_Y,0],[0,0,0,0,0],color='gray')
        # Example objects: table, couch
        self.ax.plot([0.5,2.5,2.5,0.5,0.5],[0.5,0.5,1.5,1.5,0.5],[0.7,0.7,0.7,0.7,0.7],color='brown') # table
        self.ax.plot([3,3.5,3.5,3,3],[0.5,0.5,1,1,0.5],[0.5,0.5,0.5,0.5,0.5],color='blue') # couch
        # Tags
        for r in results:
            if r.tag_id not in self.tag_positions: continue
            wx,wy,wz = self.tag_positions[r.tag_id]
            half = TAG_SIZE_METERS/2
            tag_obj_points = np.array([
                (wx-half,wy-half,0),
                (wx+half,wy-half,0),
                (wx+half,wy+half,0),
                (wx-half,wy+half,0)
            ], dtype=np.float32)
            tag_img_points = np.array(r.corners, dtype=np.float32)
            ok_tag, rvec_tag, tvec_tag = cv2.solvePnP(tag_obj_points, tag_img_points, self.mtx, self.dist)
            if ok_tag:
                x,y,z = tvec_tag[:,0]
                self.ax.scatter(x,y,z,color='red',s=50)
                # Axes lines
                R,_ = cv2.Rodrigues(rvec_tag)
                axes = np.array([[TAG_AXIS_SCALE,0,0],[0,TAG_AXIS_SCALE,0],[0,0,TAG_AXIS_SCALE]])
                origin = tvec_tag.flatten()
                for i,color in enumerate(['r','g','b']):
                    self.ax.plot([origin[0],origin[0]+axes[i,0]],
                                 [origin[1],origin[1]+axes[i,1]],
                                 [origin[2],origin[2]+axes[i,2]],color=color)
        self.ax.set_xlim(-1,DIST_X+1)
        self.ax.set_ylim(-1,DIST_Y+1)
        self.ax.set_zlim(0,2)
        self.ax.set_xlabel("X")
        self.ax.set_ylabel("Y")
        self.ax.set_zlabel("Z")

# ==========================================================
# MAIN LOOP
# ==========================================================
source = FrameSource()
cv2.namedWindow("Calibration + Tags", cv2.WINDOW_NORMAL)

try:
    # Check if intrinsic file exists
    if os.path.exists(INTRINSIC_FILE):
        print("[INTRINSIC] Loading existing calibration from file")
        data = np.load(INTRINSIC_FILE)
        mtx, dist = data["mtx"], data["dist"]
    else:
        mtx, dist, _ = intrinsic_calibration(source)

    extrinsic_calibrator = ExtrinsicCalibrator3D(source, mtx, dist)
    
    # Run in main thread
    extrinsic_calibrator.update()
finally:
    source.close()
    cv2.destroyAllWindows()