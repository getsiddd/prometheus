"""Facade orchestrator for class-based web calibration backend services."""

from __future__ import annotations

from .common import CalibrationUtils
from .feature_matching_service import MultiViewFeatureMatchingService
from .intrinsic_service import IntrinsicCalibrationService
from .pose_ground_service import HumanPoseGroundService
from .pnp_service import PnPCalibrationService
from .snapshot_service import SnapshotService
from .triangulation_service import MultiViewTriangulationService
from .validation_service import MappingValidationService


class WebCalibrationBackend:
    """Single entrypoint that exposes all backend calibration capabilities."""

    def __init__(self):
        self.utils = CalibrationUtils()
        self.snapshot_service = SnapshotService(self.utils)
        self.intrinsic_service = IntrinsicCalibrationService(self.utils)
        self.pose_ground_service = HumanPoseGroundService(self.utils)
        self.pnp_service = PnPCalibrationService(self.utils)
        self.validation_service = MappingValidationService(self.utils)
        self.feature_matching_service = MultiViewFeatureMatchingService(self.utils)
        self.triangulation_service = MultiViewTriangulationService(
            self.utils,
            feature_matching_service=self.feature_matching_service,
        )

    def snapshot(self, source: str, output: str):
        return self.snapshot_service.capture_snapshot(source, output)

    def solve_pnp(
        self,
        correspondences: list[dict],
        intrinsics: str,
        output_yaml: str,
        *,
        mode: str = "web_headless_pnp",
        source: str | None = None,
        dwg_path: str | None = None,
        intrinsic_rms: float | None = None,
    ):
        return self.pnp_service.solve_pnp(
            correspondences,
            intrinsics,
            output_yaml,
            mode=mode,
            source=source,
            dwg_path=dwg_path,
            intrinsic_rms=intrinsic_rms,
        )

    def solve_pnp_from_arrays(
        self,
        object_points_xyz,
        image_points_uv,
        K,
        D,
        output_yaml: str,
        *,
        mode: str = "cad_3d_pnp",
        source: str | None = None,
        dwg_path: str | None = None,
        intrinsic_rms: float | None = None,
    ):
        return self.pnp_service.solve_pnp_from_arrays(
            object_points_xyz=object_points_xyz,
            image_points_uv=image_points_uv,
            K=K,
            D=D,
            output_yaml=output_yaml,
            mode=mode,
            source=source,
            dwg_path=dwg_path,
            intrinsic_rms=intrinsic_rms,
        )

    def detect_checkerboard(self, image: str, checkerboard: str):
        return self.intrinsic_service.detect_checkerboard(image, checkerboard)

    def solve_intrinsic(self, images_dir: str, checkerboard: str, square_size: float, output_npz: str, camera_type: str = "pinhole"):
        return self.intrinsic_service.solve_intrinsic(images_dir, checkerboard, square_size, output_npz, camera_type=camera_type)

    def generate_checkerboard_pdf(self, checkerboard: str, square_mm: float, output_pdf: str, margin_mm: float = 10.0):
        return self.intrinsic_service.generate_checkerboard_pdf(checkerboard, square_mm, output_pdf, margin_mm)

    def validate_mapping(self, validation_points: list[dict], calibration_yaml: str, intrinsics: str = ""):
        return self.validation_service.validate_mapping(validation_points, calibration_yaml, intrinsics)

    def detect_ground_points_from_pose(
        self,
        image: str,
        *,
        max_side: int = 960,
        min_person_score: float = 0.65,
        min_keypoint_score: float = 0.35,
    ):
        return self.pose_ground_service.detect_ground_points(
            image,
            max_side=max_side,
            min_person_score=min_person_score,
            min_keypoint_score=min_keypoint_score,
        )

    def extract_image_keypoints(self, image: str, options: dict | None = None):
        return self.feature_matching_service.extract_single_image_keypoints(image, options)

    def match_multiview_features(self, cameras: list[dict], match_options: dict | None = None):
        return self.feature_matching_service.build_shared_markers_from_cameras(cameras, match_options)

    def triangulate_multiview(
        self,
        cameras: list[dict],
        markers: list[dict],
        *,
        auto_match: bool = False,
        match_options: dict | None = None,
    ):
        return self.triangulation_service.triangulate_multiview(
            cameras,
            markers,
            auto_match=auto_match,
            match_options=match_options,
        )
