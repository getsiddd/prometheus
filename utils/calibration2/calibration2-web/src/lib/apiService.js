/**
 * API Service Layer
 * Handles all HTTP calls to backend endpoints with error handling
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

export class APIError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = "APIError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Generic API call handler with error catching
 */
export async function apiCall(endpoint, options = {}) {
  const {
    method = "POST",
    body = null,
    timeout = 30000,
    retries = 1,
  } = options;

  const url = `${API_BASE}${endpoint}`;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : null,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new APIError(
          data.error || `HTTP ${response.status}`,
          data.code || `HTTP_${response.status}`,
          data
        );
      }

      if (!data.success) {
        throw new APIError(
          data.error || "Operation failed",
          data.code || "OPERATION_FAILED",
          data
        );
      }

      return data;
    } catch (error) {
      lastError = error;

      if (error instanceof APIError && !error.code.startsWith("HTTP_5")) {
        throw error;
      }

      if (attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }

  throw lastError;
}

// ============================================
// Step 1: Intrinsic Calibration Endpoints
// ============================================

export async function captureIntrinsicSample(cameraId, params) {
  return apiCall(`/camera/${cameraId}/capture-intrinsic`, {
    method: "POST",
    body: params,
  });
}

export async function solveIntrinsic(cameraId, samples) {
  return apiCall(`/camera/${cameraId}/solve-intrinsic`, {
    method: "POST",
    body: { samples },
    timeout: 60000, // 1 minute for solving
  });
}

export async function generateCheckerboardPdf(cameraId, params) {
  return apiCall(`/camera/${cameraId}/generate-checkerboard`, {
    method: "POST",
    body: params,
  });
}

// ============================================
// Step 2: Plane Mapping Endpoints
// ============================================

export async function detectHumanPose(cameraId, imageDataUrl) {
  return apiCall(`/camera/${cameraId}/detect-human-pose`, {
    method: "POST",
    body: { imageDataUrl },
  });
}

export async function segmentPlanes(cameraId, imageDataUrl) {
  return apiCall(`/camera/${cameraId}/segment-planes`, {
    method: "POST",
    body: { imageDataUrl },
  });
}

export async function spreadGroundPlane(cameraId, params) {
  return apiCall(`/camera/${cameraId}/spread-ground-plane`, {
    method: "POST",
    body: params,
    timeout: 20000,
  });
}

// ============================================
// Step 3: Ground Plane Endpoints
// ============================================

export async function autoDetectGround(cameraId, imageDataUrl, hint) {
  return apiCall(`/camera/${cameraId}/auto-detect-ground`, {
    method: "POST",
    body: { imageDataUrl, groundPlaneHint: hint },
  });
}

export async function matchFeaturesMultiView(frames, cameraId) {
  return apiCall(`/match-features-multiview`, {
    method: "POST",
    body: { frames, cameraId },
    timeout: 30000,
  });
}

// ============================================
// Common Endpoints
// ============================================

export async function getCameraFeed(cameraId) {
  return apiCall(`/camera/${cameraId}/live-feed`, {
    method: "GET",
  });
}

export async function captureSnapshot(cameraId) {
  return apiCall(`/camera/${cameraId}/snapshot`, {
    method: "POST",
    body: {},
  });
}

export async function exportCalibrationResult(cameraId, format = "json") {
  return apiCall(`/camera/${cameraId}/export-calibration`, {
    method: "POST",
    body: { format },
  });
}

export async function getCalibrationStatus(cameraId) {
  return apiCall(`/camera/${cameraId}/calibration-status`, {
    method: "GET",
  });
}
