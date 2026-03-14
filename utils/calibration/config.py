# ==============================
# Camera Resolution
# ==============================
WIDTH = 1920
HEIGHT = 1080

# ==============================
# Checkerboard Calibration
# ==============================
CHECKERBOARD = (9,6)
SQUARE_SIZE = 0.03

# ==============================
# AprilTag Parameters
# ==============================
TAG_SIZE = 0.39
TAG_AXIS_SCALE = TAG_SIZE * 2

DIST_X = 4.0
DIST_Y = 3.0

TAG_LAYOUT = {
    0: (0.0,0.0,0.0),
    1: (DIST_X,0.0,0.0),
    2: (DIST_X,DIST_Y,0.0),
    3: (0.0,DIST_Y,0.0)
}

# ==============================
# Intrinsics
# ==============================
INTRINSIC_FILE = "intrinsics_fisheye.npz"
USE_FISHEYE = True


# ============================================================
# VISUALIZATION FLAGS (can be toggled in GUI or keyboard)
# ============================================================

GUI = {

    # Homography
    "SHOW_HOMOGRAPHY_ORIGIN": True,
    "SHOW_HOMOGRAPHY_AXES": True,
    "SHOW_BOUNDARY_LINES": True,
    "SHOW_BOUNDARY_COORDS": True,

    # AprilTag visualization
    "SHOW_TAG_BOX": True,
    "SHOW_TAG_ID": True,
    "SHOW_TAG_CENTER": True,

    # Coordinate displays
    "SHOW_TAG_WORLD_COORDS": True,
    "SHOW_HOMOGRAPHY_COORDS": True,

    # Grid / floor debugging
    "SHOW_FLOOR_GRID": True,

    # 3D scene
    "SHOW_SCENE3D": True,

    # Reports
    "SHOW_CALIBRATION_REPORT": True
}

# ============================================================
# KEYBOARD SHORTCUTS
# ============================================================

KEY_BINDINGS = {

    "toggle_axes": ord('x'),
    "toggle_origin": ord('o'),
    "toggle_bbox": ord('b'),
    "toggle_tag_id": ord('i'),
    "toggle_world_coords": ord('w'),
    "toggle_grid": ord('g'),
    "toggle_report": ord('r'),
}


CALIBRATION_PIPELINE = {
    "enable_camera_shift_correction": True,
    "enable_world_stabilizer": True,
    "stabilizer_alpha": 0.35,
    "stabilizer_history": 8,
    "stabilizer_max_jump_m": 1.5,
    "enable_cad_alignment": True,
    "cad_alignment_file": "cad_alignment.yaml",
    "enable_sfm_refinement": True,
    "sfm_max_frames": 12,
    "sfm_frame_stride": 7,
    "sfm_min_inliers": 35,
    "sfm_resize_width": 960,
}