import numpy as np


class CalibrationQualityReporter:

    def __init__(
        self,
        world_rmse_warn=0.15,
        world_rmse_fail=0.30,
        pixel_rmse_warn=6.0,
        pixel_rmse_fail=12.0
    ):
        self.world_rmse_warn = world_rmse_warn
        self.world_rmse_fail = world_rmse_fail
        self.pixel_rmse_warn = pixel_rmse_warn
        self.pixel_rmse_fail = pixel_rmse_fail

    def evaluate_homography(self, calibrator):
        if calibrator.H is None:
            return {
                "status": "missing",
                "message": "Homography not available"
            }

        if len(calibrator.image_points) < 4 or len(calibrator.world_points) < 4:
            return {
                "status": "insufficient",
                "message": "Need >= 4 calibration points for quality metrics"
            }

        world_errors = []
        pixel_errors = []

        for img_pt, world_gt in zip(calibrator.image_points, calibrator.world_points):
            pred_world = calibrator.pixel_to_world(img_pt[0], img_pt[1])
            if pred_world is not None:
                err_w = np.linalg.norm(
                    np.array(pred_world, dtype=np.float64) -
                    np.array(world_gt, dtype=np.float64)
                )
                world_errors.append(float(err_w))

            pred_img = calibrator.world_to_pixel(world_gt[0], world_gt[1])
            if pred_img is not None:
                err_p = np.linalg.norm(
                    np.array(pred_img, dtype=np.float64) -
                    np.array(img_pt, dtype=np.float64)
                )
                pixel_errors.append(float(err_p))

        if len(world_errors) == 0 or len(pixel_errors) == 0:
            return {
                "status": "insufficient",
                "message": "Unable to compute residuals"
            }

        world_rmse = float(np.sqrt(np.mean(np.square(world_errors))))
        world_mean = float(np.mean(world_errors))
        world_max = float(np.max(world_errors))

        pixel_rmse = float(np.sqrt(np.mean(np.square(pixel_errors))))
        pixel_mean = float(np.mean(pixel_errors))
        pixel_max = float(np.max(pixel_errors))

        status = "pass"

        if world_rmse >= self.world_rmse_fail or pixel_rmse >= self.pixel_rmse_fail:
            status = "fail"
        elif world_rmse >= self.world_rmse_warn or pixel_rmse >= self.pixel_rmse_warn:
            status = "warn"

        return {
            "status": status,
            "world_rmse_m": world_rmse,
            "world_mean_m": world_mean,
            "world_max_m": world_max,
            "pixel_rmse_px": pixel_rmse,
            "pixel_mean_px": pixel_mean,
            "pixel_max_px": pixel_max,
            "points": len(world_errors)
        }

    def to_overlay_lines(self, report):
        if report.get("status") in {"missing", "insufficient"}:
            return [f"Quality: {report.get('message', 'N/A')}"]

        return [
            f"Quality: {report['status'].upper()}",
            f"World RMSE: {report['world_rmse_m']:.3f} m",
            f"World Max: {report['world_max_m']:.3f} m",
            f"Pixel RMSE: {report['pixel_rmse_px']:.2f} px",
            f"Points: {report['points']}"
        ]
