/**
 * Calibration Configuration
 * Central place for all calibration system constants and settings
 */

// API Configuration
export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  TIMEOUT: 60000, // 60 seconds
  RETRY_COUNT: 3,
  RETRY_DELAY: 1000, // 1 second exponential backoff
  ENDPOINTS: {
    // Intrinsic calibration
    CAPTURE_SAMPLE: "/api/calibration/intrinsic/capture",
    SOLVE_INTRINSIC: "/api/calibration/intrinsic/solve",
    LIST_SAMPLES: "/api/calibration/intrinsic/samples",
    DELETE_SAMPLE: "/api/calibration/intrinsic/samples/:id",

    // Plane mapping
    DETECT_POSE: "/api/calibration/plane-mapping/detect-pose",
    SEGMENT_PLANES: "/api/calibration/plane-mapping/segment",
    RECORD_PLANE: "/api/calibration/plane-mapping/record",

    // Ground plane
    AUTO_DETECT_GROUND: "/api/calibration/ground-plane/auto-detect",
    MATCH_FEATURES: "/api/calibration/ground-plane/match-features",
    SPREAD_GROUND: "/api/calibration/ground-plane/spread",
    SYNC_SNAPSHOTS: "/api/calibration/ground-plane/sync-snapshots",

    // Common
    GET_CAMERA: "/api/cameras/:id",
    LIST_CAMERAS: "/api/cameras",
    LIST_CALIBRATIONS: "/api/calibrations",
    SAVE_CALIBRATION: "/api/calibrations",
  },
};

// Intrinsic Calibration Config
export const INTRINSIC_CONFIG = {
  MIN_SAMPLES: 18,
  MAX_SAMPLES: 50,
  MIN_PATTERN_SIZE: [7, 5], // Checkerboard pattern (width, height)
  PATTERN_SQUARE_SIZE: 0.02, // 2cm in meters
  REQUIRED_RMS: 2.0, // pixels
  SAMPLE_QUALITY_THRESHOLD: 0.3, // 30% of image must show checkerboard
  AUTO_CAPTURE_TIMEOUT: 5000, // seconds for auto-capture
  CALIBRATION_FLAGS: {
    // OpenCV flags for calibration
    CALIB_FIX_PRINCIPAL_POINT: true,
    CALIB_FIX_ASPECT_RATIO: false,
    CALIB_ZERO_TANGENT_DIST: true,
  },
};

// Plane Mapping Config
export const PLANE_MAPPING_CONFIG = {
  MIN_PLANES: 1,
  MAX_PLANES: 10,
  MIN_Z_MAPPINGS: 1,
  POSE_CONFIDENCE_THRESHOLD: 0.7,
  MIN_KEYPOINTS: 5,
  KEYPOINT_CLASSES: {
    // COCO 17-point skeleton
    0: "nose",
    1: "left_eye",
    2: "right_eye",
    3: "left_ear",
    4: "right_ear",
    5: "left_shoulder",
    6: "right_shoulder",
    7: "left_elbow",
    8: "right_elbow",
    9: "left_wrist",
    10: "right_wrist",
    11: "left_hip",
    12: "right_hip",
    13: "left_knee",
    14: "right_knee",
    15: "left_ankle",
    16: "right_ankle",
  },
  SKELETON_CONNECTIONS: [
    [0, 1], [0, 2], [1, 3], [2, 4],
    [5, 6], [5, 7], [7, 9], [6, 8],
    [8, 10], [5, 11], [6, 12], [11, 12],
    [11, 13], [13, 15], [12, 14], [14, 16],
  ],
  MODEL_VARIANTS: ["nano", "small", "medium"], // YOLOv8-Pose variants
  DEFAULT_MODEL: "small",
};

// Ground Plane Config
export const GROUND_PLANE_CONFIG = {
  MIN_CORRESPONDENCES: 4,
  MIN_MATCH_SCORE: 0.7,
  FEATURE_MATCHER_TYPE: "loftr", // "loftr" | "orb"
  OPTIONAL_MULTI_CAMERA_SYNC: true,
  MAX_CAMERAS_SYNC: 4,
  GROUND_PLANE_EQUATION: {
    // Default ground plane: Z = 0
    A: 0,
    B: 0,
    C: 1,
    D: 0,
  },
  CALIBRATION_BOARD_SIZE: [6, 4], // ArUco markers
  MARKER_SIZE: 0.05, // 5cm in meters
};

// Camera Configuration
export const CAMERA_CONFIG = {
  RESOLUTION: {
    MIN_WIDTH: 640,
    MIN_HEIGHT: 480,
    RECOMMENDED_WIDTH: 1920,
    RECOMMENDED_HEIGHT: 1080,
  },
  FRAME_RATE: {
    MIN_FPS: 15,
    RECOMMENDED_FPS: 30,
    MAX_FPS: 60,
  },
  FORMATS: ["MJPEG", "H264", "YUYV", "RGB"],
  DEFAULT_FORMAT: "MJPEG",
};

// UI Configuration
export const UI_CONFIG = {
  THEME: {
    PRIMARY_COLOR: "#3b82f6",
    SECONDARY_COLOR: "#8b5cf6",
    SUCCESS_COLOR: "#10b981",
    ERROR_COLOR: "#ef4444",
    WARNING_COLOR: "#f59e0b",
    INFO_COLOR: "#06b6d4",
  },
  TOAST_TIMEOUT: 5000, // 5 seconds
  NOTIFICATION_TIMEOUT: 3000, // 3 seconds
  LOADING_SPINNER_SIZE: "md", // "sm" | "md" | "lg"
  DEBOUNCE_DELAY: 500, // milliseconds
  DOUBLE_CLICK_DELAY: 300, // milliseconds
};

// Validation
export const VALIDATION_CONFIG = {
  REQUIRED_FIELD: "This field is required",
  INVALID_EMAIL: "Please enter a valid email",
  INVALID_NUMBER: "Please enter a valid number",
  INVALID_FILE: "Invalid file format",
  FILE_TOO_LARGE: "File size exceeds maximum limit",
};

// Export Formats
export const EXPORT_CONFIG = {
  FORMATS: ["json", "yaml", "csv", "npz"],
  DEFAULT_FORMAT: "json",
  MAX_EXPORT_SIZE: 10 * 1024 * 1024, // 10MB
  COMPRESSION: {
    ENABLED: true,
    LEVEL: 6, // 0-9
  },
};

// Visualization
export const VISUALIZATION_CONFIG = {
  CANVAS: {
    BACKGROUND_COLOR: "rgba(0, 0, 0, 0.3)",
    LINE_WIDTH: 2,
    POINT_RADIUS: 5,
    FONT_SIZE: 14,
    FONT_FAMILY: "Arial",
  },
  COLORS: {
    X_AXIS: "#ff0000", // red
    Y_AXIS: "#00ff00", // green
    Z_AXIS: "#0000ff", // blue
    POSE: "#ffff00", // yellow
    GROUND: "#ff00ff", // magenta
    CORRESPONDENCE: "#00ffff", // cyan
    COVERAGE_GOOD: "#10b981", // green
    COVERAGE_BAD: "#ef4444", // red
  },
  OPACITY: {
    LOW_CONFIDENCE: 0.3,
    MEDIUM_CONFIDENCE: 0.6,
    HIGH_CONFIDENCE: 1.0,
  },
};

// Logging
export const LOGGING_CONFIG = {
  ENABLED: process.env.NODE_ENV !== "production",
  LOG_LEVEL: process.env.LOG_LEVEL || "debug", // debug | info | warn | error
  SENTRY_ENABLED: process.env.NEXT_PUBLIC_SENTRY_DSN ? true : false,
  SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  SENTRY_ENVIRONMENT: process.env.NODE_ENV,
};

// Feature Flags
export const FEATURE_FLAGS = {
  ENABLE_MULTI_CAMERA_SYNC: true,
  ENABLE_AUTO_CALIBRATION: false,
  ENABLE_REAL_TIME_VALIDATION: true,
  ENABLE_RESULT_EXPORT: true,
  ENABLE_VISUALIZATION_OVERLAYS: true,
  ENABLE_POSE_DETECTION: true,
  ENABLE_PLANE_SEGMENTATION: true,
};

// Development
export const DEV_CONFIG = {
  MOCK_API_RESPONSES: process.env.NEXT_PUBLIC_MOCK_API === "true",
  SHOW_DEBUG_INFO: process.env.NODE_ENV === "development",
  ENABLE_PERFORMANCE_MONITORING: process.env.NODE_ENV === "development",
};

// Helper functions
export function getApiUrl(endpoint, params = {}) {
  let url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS[endpoint]}`;

  // Replace path parameters
  Object.entries(params).forEach(([key, value]) => {
    url = url.replace(`:${key}`, value);
  });

  return url;
}

export function getModelPath(modelName) {
  const baseUrl = process.env.NEXT_PUBLIC_MODELS_URL || "/models";
  return `${baseUrl}/${modelName}.onnx`;
}

export function getThemeColor(colorName) {
  return UI_CONFIG.THEME[colorName] || UI_CONFIG.THEME.PRIMARY_COLOR;
}

export function isFeatureEnabled(featureName) {
  return FEATURE_FLAGS[`ENABLE_${featureName.toUpperCase()}`] ?? false;
}
