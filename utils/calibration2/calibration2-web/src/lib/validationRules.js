/**
 * Step Completion Validation
 * Validates that calibration steps meet requirements
 */

export const VALIDATION_RULES = {
  INTRINSIC: {
    minSamples: 18,
    minRmsError: 0.0,
    maxRmsError: 2.0,
  },
  PLANE_MAPPING: {
    minPlanes: 1,
    minZMappings: 1,
    minPoseConfidence: 0.7,
  },
  GROUND_PLANE: {
    minCorrespondences: 4,
    minMatchScore: 0.7,
    minSyncedCameras: 1,
  },
};

/**
 * Validate intrinsic calibration step
 */
export function validateIntrinsicStep(state) {
  const errors = [];
  const warnings = [];

  if (!state.intrinsicSamples || state.intrinsicSamples.length === 0) {
    errors.push("No intrinsic samples captured");
  } else if (
    state.intrinsicSamples.length < VALIDATION_RULES.INTRINSIC.minSamples
  ) {
    errors.push(
      `Need ${VALIDATION_RULES.INTRINSIC.minSamples} samples, have ${state.intrinsicSamples.length}`
    );
  }

  if (!state.intrinsicSolveResult) {
    errors.push("Intrinsic calibration not solved");
  } else {
    const rmsError = state.intrinsicSolveResult.rmsReprojectionError;

    if (
      rmsError > VALIDATION_RULES.INTRINSIC.maxRmsError
    ) {
      warnings.push(
        `High RMS error (${rmsError.toFixed(2)}px). Consider capturing more samples.`
      );
    }
  }

  if (!state.intrinsicsPath) {
    errors.push("Intrinsic parameters not saved");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    completionPercentage: calculateCompletion({
      samples: state.intrinsicSamples?.length || 0,
      minSamples: VALIDATION_RULES.INTRINSIC.minSamples,
      solved: !!state.intrinsicSolveResult,
      hasOutput: !!state.intrinsicsPath,
    }),
  };
}

/**
 * Validate plane mapping step
 */
export function validatePlaneMappingStep(state) {
  const errors = [];
  const warnings = [];

  if (
    !state.humanPoseDetections ||
    state.humanPoseDetections.length === 0
  ) {
    errors.push("Human pose not detected");
  } else {
    const lowConfidenceKeypoints = state.humanPoseDetections.filter(
      (kp) => kp.confidence < VALIDATION_RULES.PLANE_MAPPING.minPoseConfidence
    );

    if (lowConfidenceKeypoints.length > 0) {
      warnings.push(
        `${lowConfidenceKeypoints.length} low-confidence keypoints detected`
      );
    }
  }

  if (!state.poseGroundPlaneEstimate) {
    errors.push("Ground plane not estimated from pose");
  }

  if (!state.correspondences || state.correspondences.length === 0) {
    errors.push("No plane-to-Z-coordinate mappings created");
  } else if (
    state.correspondences.length <
    VALIDATION_RULES.PLANE_MAPPING.minZMappings
  ) {
    errors.push(
      `Need ${VALIDATION_RULES.PLANE_MAPPING.minZMappings} Z-mapping, have ${state.correspondences.length}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    completionPercentage: calculateCompletion({
      poseDetected: !!state.humanPoseDetections?.length,
      groundEstimated: !!state.poseGroundPlaneEstimate,
      zMappings: (state.correspondences?.length || 0) > 0,
      autoSpread: !!state.stageOutputs?.["plane-mapping"]?.completed,
    }),
  };
}

/**
 * Validate ground plane step
 */
export function validateGroundPlaneStep(state) {
  const errors = [];
  const warnings = [];

  if (
    !state.correspondences ||
    state.correspondences.length <
      VALIDATION_RULES.GROUND_PLANE.minCorrespondences
  ) {
    errors.push(
      `Need ${VALIDATION_RULES.GROUND_PLANE.minCorrespondences} correspondences, have ${state.correspondences?.length || 0}`
    );
  }

  if (
    state.syncedMatchFrames &&
    state.syncedMatchFrames.length >
      VALIDATION_RULES.GROUND_PLANE.minSyncedCameras
  ) {
    const validMatches = state.validationPairs?.filter(
      (p) => p.matchScore >= VALIDATION_RULES.GROUND_PLANE.minMatchScore
    );

    if (
      !validMatches ||
      validMatches.length === 0
    ) {
      warnings.push("No high-confidence cross-camera matches found");
    }
  }

  if (!state.imagePickMode && state.correspondences?.length === 0) {
    warnings.push("No manual ground markers placed yet");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    completionPercentage: calculateCompletion({
      correspondences: (state.correspondences?.length || 0) > 0,
      minCorrespondences:
        (state.correspondences?.length || 0) >=
        VALIDATION_RULES.GROUND_PLANE.minCorrespondences,
      multiCameraSync:
        (state.syncedMatchFrames?.length || 0) > 1,
      featureMatching:
        (state.validationPairs?.length || 0) > 0,
    }),
  };
}

/**
 * Calculate step completion percentage
 */
function calculateCompletion(criteria) {
  const total = Object.keys(criteria).length;
  const completed = Object.values(criteria).filter(Boolean).length;
  return Math.round((completed / total) * 100);
}

/**
 * Validate transition between steps
 */
export function canProceedToNextStep(currentStep, state) {
  let validation;

  switch (currentStep) {
    case "intrinsic":
      validation = validateIntrinsicStep(state);
      break;
    case "plane-mapping":
      validation = validatePlaneMappingStep(state);
      break;
    case "ground-plane":
      validation = validateGroundPlaneStep(state);
      break;
    default:
      return { canProceed: true, validation: null };
  }

  return {
    canProceed: validation.valid,
    validation,
    blockers: validation.errors,
    suggestions: validation.warnings,
  };
}

/**
 * Get step completion status
 */
export function getStepStatus(step, state) {
  let validation;

  switch (step) {
    case "intrinsic":
      validation = validateIntrinsicStep(state);
      break;
    case "plane-mapping":
      validation = validatePlaneMappingStep(state);
      break;
    case "ground-plane":
      validation = validateGroundPlaneStep(state);
      break;
    default:
      return { status: "unknown", percentage: 0 };
  }

  return {
    status: validation.valid ? "complete" : "incomplete",
    percentage: validation.completionPercentage,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

/**
 * Get human-readable step status message
 */
export function getStepStatusMessage(step, state) {
  const status = getStepStatus(step, state);

  if (status.status === "complete") {
    return `✓ ${step} calibration complete`;
  }

  if (status.errors.length > 0) {
    return `⚠ ${status.errors[0]}`;
  }

  return `⏳ ${Math.round(status.percentage)}% complete`;
}

/**
 * Validate all completed steps
 */
export function getCalibrationReadiness(state) {
  const intrinsic = validateIntrinsicStep(state);
  const planeMapping = validatePlaneMappingStep(state);
  const groundPlane = validateGroundPlaneStep(state);

  return {
    intrinsic: intrinsic.valid,
    planeMapping: planeMapping.valid,
    groundPlane: groundPlane.valid,
    allComplete: intrinsic.valid && planeMapping.valid && groundPlane.valid,
    summary: {
      completed: [
        intrinsic.valid && "Intrinsic",
        planeMapping.valid && "Plane Mapping",
        groundPlane.valid && "Ground Plane",
      ].filter(Boolean),
      pending: [
        !intrinsic.valid && "Intrinsic",
        !planeMapping.valid && "Plane Mapping",
        !groundPlane.valid && "Ground Plane",
      ].filter(Boolean),
    },
  };
}
