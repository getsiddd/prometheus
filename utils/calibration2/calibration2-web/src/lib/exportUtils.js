/**
 * Calibration Result Export Utilities
 * Handles exporting calibration results in various formats
 */

/**
 * Export format types
 */
export const EXPORT_FORMATS = {
  JSON: "json",
  NPZ: "npz",
  YAML: "yaml",
  CSV: "csv",
  NUMPY: "numpy",
};

/**
 * Build calibration result object
 */
export function buildCalibrationResult(state, cameraId, cameraName) {
  return {
    metadata: {
      cameraId,
      cameraName,
      timestamp: new Date().toISOString(),
      version: "1.0",
    },
    intrinsic: {
      completed: !!state.intrinsicSolveResult,
      matrix: state.intrinsicSolveResult?.cameraMatrix || null,
      distortionCoefficients:
        state.intrinsicSolveResult?.distortionCoefficients || null,
      rmsError: state.intrinsicSolveResult?.rmsReprojectionError || null,
      samplesCount: state.intrinsicSamples?.length || 0,
      outputPath: state.intrinsicsPath || null,
    },
    planeMapping: {
      completed: !!state.stageOutputs?.["plane-mapping"]?.completed,
      correspondences: state.correspondences || [],
      zMappings: state.zMappings || [],
      humanPoseDetections: state.humanPoseDetections || [],
      groundPlaneEstimate: state.poseGroundPlaneEstimate || null,
    },
    groundPlane: {
      completed: !!state.stageOutputs?.["ground-plane"]?.completed,
      correspondences: state.correspondences || [],
      validationPairs: state.validationPairs || [],
      syncedFrames: state.syncedMatchFrames || [],
      homographyMatrix: null, // Will be calculated by backend
      groundPlaneEquation: null, // Will be calculated by backend
    },
  };
}

/**
 * Export as JSON
 */
export function exportAsJSON(calibrationResult) {
  return JSON.stringify(calibrationResult, null, 2);
}

/**
 * Export as YAML (simplified - client-side only)
 */
export function exportAsYAML(calibrationResult) {
  return yamlStringify(calibrationResult);
}

/**
 * Simple YAML stringifier (client-side)
 */
function yamlStringify(obj, indent = 0) {
  const spaces = " ".repeat(indent);
  let result = "";

  if (obj === null || obj === undefined) {
    return "null";
  }

  if (Array.isArray(obj)) {
    return obj
      .map((item) => `${spaces}- ${yamlStringify(item, indent + 2)}`)
      .join("\n");
  }

  if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        result += `${spaces}${key}:\n`;
        result +=
          value.map((item) => `${spaces}  - ${item}`).join("\n") + "\n";
      } else if (typeof value === "object" && value !== null) {
        result += `${spaces}${key}:\n`;
        result += yamlStringify(value, indent + 2) + "\n";
      } else {
        result += `${spaces}${key}: ${JSON.stringify(value)}\n`;
      }
    }
  }

  return result.trim();
}

/**
 * Export as CSV
 */
export function exportAsCSV(calibrationResult) {
  let csv = "Calibration Results Export\n";
  csv += `Generated: ${calibrationResult.metadata.timestamp}\n`;
  csv += `Camera: ${calibrationResult.metadata.cameraName}\n\n`;

  // Intrinsic section
  csv += "INTRINSIC CALIBRATION\n";
  csv += "Completed,Matrix (3x3),Distortion Coefficients,RMS Error\n";
  csv += `${calibrationResult.intrinsic.completed},`;

  if (calibrationResult.intrinsic.matrix) {
    const matrixStr = calibrationResult.intrinsic.matrix
      .flat()
      .map((v) => v.toFixed(6))
      .join("|");
    csv += `"${matrixStr}",`;
  } else {
    csv += `"N/A",`;
  }

  if (calibrationResult.intrinsic.distortionCoefficients) {
    const distStr = calibrationResult.intrinsic.distortionCoefficients
      .map((v) => v.toFixed(6))
      .join("|");
    csv += `"${distStr}",`;
  } else {
    csv += `"N/A",`;
  }

  csv += calibrationResult.intrinsic.rmsError?.toFixed(6) || "N/A";
  csv += "\n\n";

  // Ground plane points
  csv += "GROUND PLANE CORRESPONDENCES\n";
  csv += "Image X,Image Y,World X,World Y,World Z\n";

  const correspondences = calibrationResult.groundPlane.correspondences || [];
  correspondences.forEach((corr) => {
    csv += `${corr.imageX || ""},${corr.imageY || ""},${corr.worldX || ""},${corr.worldY || ""},${corr.worldZ || ""}\n`;
  });

  return csv;
}

/**
 * Prepare download file
 */
export function prepareDownloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  return {
    url,
    link,
    cleanup: () => URL.revokeObjectURL(url),
  };
}

/**
 * Trigger file download
 */
export function downloadFile(content, filename, mimeType) {
  const { link, cleanup } = prepareDownloadFile(content, filename, mimeType);

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(cleanup, 100);
}

/**
 * Export calibration results
 */
export function exportCalibrationResults(
  state,
  cameraId,
  cameraName,
  format = EXPORT_FORMATS.JSON
) {
  const result = buildCalibrationResult(state, cameraId, cameraName);

  let content, filename, mimeType;

  switch (format) {
    case EXPORT_FORMATS.JSON:
      content = exportAsJSON(result);
      filename = `calibration-${cameraId}-${Date.now()}.json`;
      mimeType = "application/json";
      break;

    case EXPORT_FORMATS.YAML:
      content = exportAsYAML(result);
      filename = `calibration-${cameraId}-${Date.now()}.yaml`;
      mimeType = "text/yaml";
      break;

    case EXPORT_FORMATS.CSV:
      content = exportAsCSV(result);
      filename = `calibration-${cameraId}-${Date.now()}.csv`;
      mimeType = "text/csv";
      break;

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }

  return { content, filename, mimeType, result };
}

/**
 * Get export summary
 */
export function getExportSummary(state) {
  const summary = {
    intrinsic: {
      completed: !!state.intrinsicSolveResult,
      samplesCount: state.intrinsicSamples?.length || 0,
      rmsError: state.intrinsicSolveResult?.rmsReprojectionError,
    },
    planeMapping: {
      completed: !!state.correspondences?.length,
      zMappingsCount: state.correspondences?.length || 0,
      poseDetected: !!state.humanPoseDetections?.length,
    },
    groundPlane: {
      completed: !!state.stageOutputs?.["ground-plane"]?.completed,
      correspondencesCount: state.validationPairs?.length || 0,
      syncedCameras: state.syncedMatchFrames?.length || 0,
    },
  };

  return summary;
}

/**
 * Get export readiness
 */
export function getExportReadiness(state) {
  const summary = getExportSummary(state);

  const canExport = {
    intrinsic: summary.intrinsic.completed,
    planeMapping: summary.planeMapping.completed,
    groundPlane: summary.groundPlane.completed,
  };

  const allReady = Object.values(canExport).every(Boolean);

  return {
    canExport,
    allReady,
    missingSteps: Object.entries(canExport)
      .filter(([_, ready]) => !ready)
      .map(([step]) => step),
  };
}

/**
 * Create calibration package (multiple formats)
 */
export async function createCalibrationPackage(
  state,
  cameraId,
  cameraName,
  formats = [EXPORT_FORMATS.JSON, EXPORT_FORMATS.CSV]
) {
  const exports = {};

  for (const format of formats) {
    try {
      const { content, filename } = exportCalibrationResults(
        state,
        cameraId,
        cameraName,
        format
      );
      exports[format] = { content, filename };
    } catch (error) {
      exports[format] = { error: error.message };
    }
  }

  return {
    timestamp: new Date().toISOString(),
    cameraId,
    cameraName,
    exports,
  };
}

/**
 * Copy to clipboard (for sharing)
 */
export async function copyExportToClipboard(content) {
  try {
    await navigator.clipboard.writeText(content);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
