/**
 * Mock Data and Testing Utilities
 * For development and testing before backend API is ready
 */

import { INTRINSIC_CONFIG, PLANE_MAPPING_CONFIG, GROUND_PLANE_CONFIG } from "@/config/calibrationConfig";

// Mock intrinsic calibration results
export const MOCK_INTRINSIC_RESULT = {
  cameraMatrix: [
    [800, 0, 320],
    [0, 800, 240],
    [0, 0, 1],
  ],
  distortionCoefficients: [0.1, -0.2, 0, 0, 0],
  calibrationFlags: {
    fixPrincipalPoint: true,
    fixAspectRatio: false,
    zeroTangentDist: true,
  },
  reprojectionError: 0.85,
  samplesUsed: 25,
};

// Mock plane mapping results
export const MOCK_PLANE_MAPPING_RESULT = {
  planes: [
    {
      id: 1,
      equation: { A: 0.1, B: -0.05, C: 1, D: 100 },
      confidence: 0.95,
      pointCount: 150,
    },
  ],
  zMappings: [
    {
      planeId: 1,
      imageY: 100,
      worldZ: 1.5,
      confidence: 0.92,
    },
    {
      planeId: 1,
      imageY: 300,
      worldZ: 2.0,
      confidence: 0.89,
    },
  ],
  humanPose: {
    keypoints: [
      { x: 320, y: 240, confidence: 0.98, class: "nose" },
      { x: 310, y: 220, confidence: 0.97, class: "left_eye" },
      { x: 330, y: 220, confidence: 0.96, class: "right_eye" },
      // ... more keypoints
    ],
    boundingBox: { x: 280, y: 180, width: 80, height: 200 },
    confidence: 0.93,
  },
};

// Mock ground plane results
export const MOCK_GROUND_PLANE_RESULT = {
  groundPlane: {
    equation: { A: 0, B: 0, C: 1, D: 0 },
    confidence: 0.98,
  },
  correspondences: [
    {
      imagePoint: [100, 200],
      worldPoint: [1.0, 2.0, 0.0],
      matchScore: 0.95,
    },
    {
      imagePoint: [150, 250],
      worldPoint: [1.5, 2.5, 0.0],
      matchScore: 0.92,
    },
    {
      imagePoint: [200, 300],
      worldPoint: [2.0, 3.0, 0.0],
      matchScore: 0.90,
    },
    {
      imagePoint: [250, 350],
      worldPoint: [2.5, 3.5, 0.0],
      matchScore: 0.88,
    },
  ],
  coverage: {
    imageAreaCovered: 0.87,
    groundAreaCovered: 0.92,
  },
  multiCameraSync:
    {
      cameras: [
        {
          cameraId: "front",
          groundPlaneEquation: { A: 0, B: 0, C: 1, D: 0 },
          transformation: {
            rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            translation: [0, 0, 0],
          },
          syncScore: 0.98,
        },
        {
          cameraId: "side",
          groundPlaneEquation: { A: 0.02, B: -0.01, C: 0.99, D: -0.1 },
          transformation: {
            rotation: [[0.98, 0, -0.17], [0, 1, 0], [0.17, 0, 0.98]],
            translation: [0.5, 0, 1.0],
          },
          syncScore: 0.95,
        },
      ],
      avgSyncScore: 0.965,
    },
};

// Mock camera data
export const MOCK_CAMERAS = [
  {
    id: "front",
    name: "Front Camera",
    model: "USB Webcam",
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    status: "connected",
    lastCalibrated: "2024-01-15T10:30:00Z",
  },
  {
    id: "side",
    name: "Side Camera",
    model: "IP Camera",
    resolution: { width: 1280, height: 720 },
    fps: 25,
    status: "connected",
    lastCalibrated: "2024-01-10T14:20:00Z",
  },
];

// Mock calibration history
export const MOCK_CALIBRATION_HISTORY = [
  {
    id: "cal-001",
    cameraId: "front",
    timestamp: "2024-01-15T10:30:00Z",
    type: "full",
    status: "completed",
    intrinsicRMS: 0.85,
    groundPlaneConfidence: 0.98,
  },
  {
    id: "cal-002",
    cameraId: "front",
    timestamp: "2024-01-10T14:20:00Z",
    type: "intrinsic-only",
    status: "completed",
    intrinsicRMS: 1.2,
  },
];

// Mock sample images
export const MOCK_SAMPLE_IMAGES = [
  {
    id: "sample-001",
    url: "/api/images/sample-001.jpg",
    timestamp: "2024-01-15T10:25:00Z",
    cameraId: "front",
    type: "intrinsic",
    quality: 0.92,
    detected: true,
  },
  {
    id: "sample-002",
    url: "/api/images/sample-002.jpg",
    timestamp: "2024-01-15T10:26:00Z",
    cameraId: "front",
    type: "intrinsic",
    quality: 0.88,
    detected: true,
  },
];

/**
 * Generate mock calibration state
 */
export function generateMockCalibrationState(cameraId = "front") {
  return {
    cameraId,
    intrinsic: {
      samples: Array.from({ length: 20 }, (_, i) => ({
        id: `sample-${i}`,
        url: `/api/images/sample-${i}.jpg`,
        timestamp: new Date(Date.now() - i * 60000).toISOString(),
        quality: 0.85 + Math.random() * 0.15,
        detected: true,
      })),
      solved: true,
      result: MOCK_INTRINSIC_RESULT,
      error: null,
    },
    planeMapping: {
      planes: [MOCK_PLANE_MAPPING_RESULT.planes[0]],
      zMappings: MOCK_PLANE_MAPPING_RESULT.zMappings,
      humanPose: MOCK_PLANE_MAPPING_RESULT.humanPose,
      error: null,
    },
    groundPlane: {
      result: MOCK_GROUND_PLANE_RESULT,
      syncedCameras: [],
      error: null,
    },
  };
}

/**
 * Mock API response generator
 */
export class MockAPIClient {
  constructor(delay = 1000) {
    this.delay = delay;
  }

  wait() {
    return new Promise((resolve) => setTimeout(resolve, this.delay));
  }

  async captureIntrinsicSample(cameraId) {
    await this.wait();
    return {
      success: true,
      sampleId: `sample-${Date.now()}`,
      image: "/api/images/sample-new.jpg",
      quality: 0.89,
    };
  }

  async solveIntrinsic(cameraId, sampleIds) {
    await this.wait();
    return {
      success: true,
      result: MOCK_INTRINSIC_RESULT,
      samplesUsed: sampleIds.length,
    };
  }

  async detectHumanPose(cameraId, imageUrl) {
    await this.wait();
    return {
      success: true,
      pose: MOCK_PLANE_MAPPING_RESULT.humanPose,
    };
  }

  async segmentPlanes(cameraId, imageUrl, pose) {
    await this.wait();
    return {
      success: true,
      planes: MOCK_PLANE_MAPPING_RESULT.planes,
      confidence: 0.92,
    };
  }

  async recordPlaneMapping(cameraId, data) {
    await this.wait();
    return {
      success: true,
      planeMappingId: `pm-${Date.now()}`,
    };
  }

  async autoDetectGround(cameraId) {
    await this.wait();
    return {
      success: true,
      groundPlane: MOCK_GROUND_PLANE_RESULT.groundPlane,
    };
  }

  async matchFeaturesMultiView(cameraId, referenceId, imageUrl) {
    await this.wait();
    return {
      success: true,
      correspondences: MOCK_GROUND_PLANE_RESULT.correspondences,
      matchScore: 0.91,
    };
  }

  async spreadGroundPlane(cameraId, correspondences) {
    await this.wait();
    return {
      success: true,
      result: MOCK_GROUND_PLANE_RESULT,
    };
  }

  async syncSnapshots(cameraIds) {
    await this.wait();
    return {
      success: true,
      snapshots: cameraIds.map((id) => ({
        cameraId: id,
        url: `/api/images/snapshot-${id}.jpg`,
        timestamp: new Date().toISOString(),
      })),
    };
  }

  async getCamera(cameraId) {
    await this.wait();
    return {
      success: true,
      camera: MOCK_CAMERAS.find((c) => c.id === cameraId) || MOCK_CAMERAS[0],
    };
  }

  async listCameras() {
    await this.wait();
    return {
      success: true,
      cameras: MOCK_CAMERAS,
    };
  }

  async saveCalibration(cameraId, calibrationData) {
    await this.wait();
    return {
      success: true,
      calibrationId: `cal-${Date.now()}`,
    };
  }
}

/**
 * Generate mock validation messages
 */
export function generateMockValidationState() {
  return {
    intrinsic: {
      valid: false,
      errors: [
        "Need at least 18 samples (currently have 5)",
        "RMS error is too high: 3.2px (target: < 2.0px)",
      ],
      warnings: ["Some samples have low quality (< 0.7)"],
      completionPercentage: 28,
    },
    planeMapping: {
      valid: false,
      errors: ["No planes detected yet"],
      warnings: [],
      completionPercentage: 0,
    },
    groundPlane: {
      valid: false,
      errors: ["Cannot proceed without intrinsic calibration"],
      warnings: [],
      completionPercentage: 0,
    },
  };
}

/**
 * Generate realistic test image
 */
export function generateTestImage(width = 640, height = 480, type = "checkerboard") {
  const canvas = typeof window !== "undefined" ? document.createElement("canvas") : null;
  if (!canvas) return null;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (type === "checkerboard") {
    const squareSize = 20;
    for (let y = 0; y < height; y += squareSize) {
      for (let x = 0; x < width; x += squareSize) {
        if (Math.floor((x + y) / squareSize) % 2 === 0) {
          ctx.fillStyle = "white";
        } else {
          ctx.fillStyle = "black";
        }
        ctx.fillRect(x, y, squareSize, squareSize);
      }
    }
  } else if (type === "gradient") {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#000000");
    gradient.addColorStop(1, "#ffffff");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  return canvas.toDataURL("image/jpeg");
}

/**
 * Simulate network error
 */
export function simulateNetworkError(errorType = "timeout") {
  const errors = {
    timeout: new Error("Request timeout"),
    offline: new Error("Network offline"),
    serverError: new Error("500 Internal Server Error"),
    notFound: new Error("404 Not Found"),
  };

  return errors[errorType] || errors.serverError;
}
