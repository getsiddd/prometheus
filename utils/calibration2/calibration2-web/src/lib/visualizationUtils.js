/**
 * Visualization Utilities
 * Handles rendering overlays for calibration results
 */

/**
 * Draw world axes on canvas/image
 * X-axis: red, Y-axis: green, Z-axis: blue
 */
export function drawWorldAxes(
  ctx,
  originPoint,
  cameraMatrix,
  scale = 100
) {
  if (!ctx || !originPoint || !cameraMatrix) return;

  const { x: ox, y: oy } = originPoint;

  // Calculate axis endpoints in image space
  const xAxisEnd = projectPoint(
    [ox + scale, oy, 0],
    cameraMatrix,
    originPoint
  );
  const yAxisEnd = projectPoint(
    [ox, oy + scale, 0],
    cameraMatrix,
    originPoint
  );
  const zAxisEnd = projectPoint(
    [ox, oy, scale],
    cameraMatrix,
    originPoint
  );

  // Draw X-axis (red)
  drawLine(ctx, originPoint, xAxisEnd, "#ff4444", 3);
  drawLabel(ctx, xAxisEnd, "X", "#ff4444");

  // Draw Y-axis (green)
  drawLine(ctx, originPoint, yAxisEnd, "#44ff44", 3);
  drawLabel(ctx, yAxisEnd, "Y", "#44ff44");

  // Draw Z-axis (blue)
  drawLine(ctx, originPoint, zAxisEnd, "#4444ff", 3);
  drawLabel(ctx, zAxisEnd, "Z", "#4444ff");

  // Draw origin marker
  drawCircle(ctx, originPoint, 5, "#ffff00", 2);
}

/**
 * Draw pose keypoints and skeleton
 */
export function drawPoseKeypoints(ctx, keypoints, color = "cyan", showConfidence = true) {
  if (!ctx || !keypoints || keypoints.length === 0) return;

  // Sort keypoints by id to draw skeleton properly
  const sortedKeypoints = [...keypoints].sort((a, b) => a.id - b.id);

  // Define skeleton connections (COCO format)
  const skeletonConnections = [
    [15, 13], // left ankle - left knee
    [13, 11], // left knee - left hip
    [16, 14], // right ankle - right knee
    [14, 12], // right knee - right hip
    [11, 12], // left hip - right hip
    [5, 6],   // left elbow - right elbow
    [5, 7],   // left elbow - left wrist
    [6, 8],   // right elbow - right wrist
    [1, 2],   // nose - left eye
    [1, 5],   // nose - left shoulder
    [2, 6],   // left eye - right shoulder
    [1, 3],   // nose - left ear
    [1, 4],   // nose - right ear
  ];

  // Draw skeleton
  for (const [id1, id2] of skeletonConnections) {
    const kp1 = sortedKeypoints.find((kp) => kp.id === id1);
    const kp2 = sortedKeypoints.find((kp) => kp.id === id2);

    if (kp1 && kp2 && kp1.confidence > 0.5 && kp2.confidence > 0.5) {
      drawLine(
        ctx,
        { x: kp1.x, y: kp1.y },
        { x: kp2.x, y: kp2.y },
        color,
        2
      );
    }
  }

  // Draw keypoints
  for (const kp of sortedKeypoints) {
    if (kp.confidence > 0.5) {
      const radius = kp.confidence > 0.7 ? 4 : 3;
      const opacity = showConfidence ? kp.confidence : 1;

      ctx.globalAlpha = opacity;
      drawCircle(ctx, { x: kp.x, y: kp.y }, radius, color, 2);
      ctx.globalAlpha = 1;

      // Label ground contact points
      if (kp.id === 15 || kp.id === 16) {
        drawLabel(ctx, { x: kp.x, y: kp.y }, "G", "#FFFF00");
      }
    }
  }
}

/**
 * Draw ground plane line/polygon
 */
export function drawGroundPlane(
  ctx,
  groundPlanePoints,
  color = "#ff00ff",
  width = 2
) {
  if (!ctx || !groundPlanePoints || groundPlanePoints.length < 2) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([5, 5]); // Dashed line

  ctx.beginPath();
  ctx.moveTo(groundPlanePoints[0].x, groundPlanePoints[0].y);

  for (let i = 1; i < groundPlanePoints.length; i++) {
    ctx.lineTo(groundPlanePoints[i].x, groundPlanePoints[i].y);
  }

  // Close polygon if more than 2 points
  if (groundPlanePoints.length > 2) {
    ctx.closePath();
  }

  ctx.stroke();
  ctx.setLineDash([]); // Reset dash
}

/**
 * Draw multi-camera coverage heatmap
 */
export function drawCoverageHeatmap(
  ctx,
  imageWidth,
  imageHeight,
  coverageMap
) {
  if (!ctx || !coverageMap) return;

  const cellSize = 20;
  const cols = Math.ceil(imageWidth / cellSize);
  const rows = Math.ceil(imageHeight / cellSize);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const coverage =
        coverageMap[`${x},${y}`] || 0;
      const opacity = Math.min(coverage / 100, 0.8);

      if (opacity > 0) {
        // Green for covered areas
        ctx.fillStyle = `rgba(0, 255, 0, ${opacity * 0.5})`;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);

        // Red for low coverage
        if (coverage < 30) {
          ctx.fillStyle = `rgba(255, 0, 0, ${(1 - opacity) * 0.3})`;
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }
  }
}

/**
 * Draw validation indicators
 */
export function drawValidationIndicators(ctx, indicators) {
  if (!ctx || !indicators) return;

  let yOffset = 20;

  for (const indicator of indicators) {
    const color = indicator.valid ? "#44ff44" : "#ff4444";
    const symbol = indicator.valid ? "✓" : "✗";

    ctx.fillStyle = color;
    ctx.font = "14px monospace";
    ctx.fillText(`${symbol} ${indicator.label}`, 10, yOffset);

    yOffset += 20;
  }
}

/**
 * Project 3D world point to 2D image
 */
export function projectPoint(worldPoint, cameraMatrix, homography) {
  if (!cameraMatrix || !homography) return worldPoint;

  // Simplified projection (implementation depends on actual matrices)
  const [x, y, z] = worldPoint;
  const [hx, hy] = homography;

  return {
    x: hx + x * 0.5,
    y: hy + y * 0.5,
  };
}

/**
 * Helper: Draw line
 */
function drawLine(ctx, from, to, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

/**
 * Helper: Draw circle
 */
function drawCircle(ctx, center, radius, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
  ctx.stroke();
}

/**
 * Helper: Draw label
 */
function drawLabel(ctx, point, text, color) {
  ctx.fillStyle = color;
  ctx.font = "bold 12px monospace";
  ctx.fillText(text, point.x + 5, point.y - 5);
}

/**
 * Render SVG overlay
 */
export function createVisualizationOverlay(
  imageWidth,
  imageHeight,
  overlays
) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", imageWidth);
  svg.setAttribute("height", imageHeight);
  svg.style.position = "absolute";
  svg.style.top = "0";
  svg.style.left = "0";

  // Draw axes
  if (overlays.axes) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");

    // X-axis (red)
    const xLine = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );
    xLine.setAttribute("x1", overlays.axes.origin.x);
    xLine.setAttribute("y1", overlays.axes.origin.y);
    xLine.setAttribute("x2", overlays.axes.origin.x + 100);
    xLine.setAttribute("y2", overlays.axes.origin.y);
    xLine.setAttribute("stroke", "#ff4444");
    xLine.setAttribute("stroke-width", "3");
    g.appendChild(xLine);

    // Y-axis (green)
    const yLine = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );
    yLine.setAttribute("x1", overlays.axes.origin.x);
    yLine.setAttribute("y1", overlays.axes.origin.y);
    yLine.setAttribute("x2", overlays.axes.origin.x);
    yLine.setAttribute("y2", overlays.axes.origin.y + 100);
    yLine.setAttribute("stroke", "#44ff44");
    yLine.setAttribute("stroke-width", "3");
    g.appendChild(yLine);

    // Origin
    const origin = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    origin.setAttribute("cx", overlays.axes.origin.x);
    origin.setAttribute("cy", overlays.axes.origin.y);
    origin.setAttribute("r", "5");
    origin.setAttribute("fill", "#ffff00");
    g.appendChild(origin);

    svg.appendChild(g);
  }

  // Draw pose keypoints
  if (overlays.pose && overlays.pose.length > 0) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");

    for (const kp of overlays.pose) {
      if (kp.confidence > 0.5) {
        const circle = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle"
        );
        circle.setAttribute("cx", kp.x);
        circle.setAttribute("cy", kp.y);
        circle.setAttribute("r", "4");
        circle.setAttribute(
          "fill",
          kp.confidence > 0.7 ? "cyan" : "lightcyan"
        );
        circle.setAttribute("opacity", kp.confidence);
        g.appendChild(circle);
      }
    }

    svg.appendChild(g);
  }

  return svg;
}

/**
 * Get color for confidence level
 */
export function getConfidenceColor(confidence) {
  if (confidence > 0.9) return "#00ff00"; // Bright green
  if (confidence > 0.7) return "#ffff00"; // Yellow
  if (confidence > 0.5) return "#ff8800"; // Orange
  return "#ff0000"; // Red
}

/**
 * Format calibration metrics for display
 */
export function formatMetrics(metrics) {
  return {
    intrinsic: {
      matrix: metrics.intrinsic?.matrix
        ? `${metrics.intrinsic.matrix[0][0].toFixed(2)}, ${metrics.intrinsic.matrix[1][1].toFixed(2)}`
        : "N/A",
      rmsError: metrics.intrinsic?.rmsError
        ? `${metrics.intrinsic.rmsError.toFixed(3)} px`
        : "N/A",
    },
    groundPlane: {
      correspondences: metrics.groundPlane?.correspondences?.length || 0,
      matchScore:
        metrics.groundPlane?.matchScore?.toFixed(3) || "N/A",
    },
  };
}
