import cv2


class CalibrationUIController:

    def __init__(self, gui_flags, key_bindings):
        self.gui = gui_flags
        self.keys = key_bindings

    def draw_help_overlay(self, frame, quality_lines=None, sfm_lines=None):
        lines = [
            "Controls:",
            "O = Toggle Homography Origin",
            "X = Toggle Homography Axes",
            "B = Toggle Tag Bounding Boxes",
            "I = Toggle Tag IDs",
            "W = Toggle World Coordinates",
            "G = Toggle Floor Grid",
            "R = Toggle Calibration Report",
            "ESC = Exit"
        ]

        x = 20
        y = 80

        for idx, line in enumerate(lines):
            cv2.putText(
                frame,
                line,
                (x, y + idx * 25),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 0),
                2
            )

        if self.gui.get("SHOW_CALIBRATION_REPORT", True):
            report_lines = []
            if quality_lines:
                report_lines.extend(quality_lines)
            if sfm_lines:
                report_lines.extend(sfm_lines)

            rx = 20
            ry = y + len(lines) * 25 + 10

            for idx, line in enumerate(report_lines[:8]):
                cv2.putText(
                    frame,
                    line,
                    (rx, ry + idx * 22),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.58,
                    (255, 255, 255),
                    2
                )

        return frame

    def handle_key(self, key):
        if key == self.keys["toggle_axes"]:
            self.gui["SHOW_HOMOGRAPHY_AXES"] = not self.gui["SHOW_HOMOGRAPHY_AXES"]

        if key == self.keys["toggle_origin"]:
            self.gui["SHOW_HOMOGRAPHY_ORIGIN"] = not self.gui["SHOW_HOMOGRAPHY_ORIGIN"]

        if key == self.keys["toggle_bbox"]:
            self.gui["SHOW_TAG_BOX"] = not self.gui["SHOW_TAG_BOX"]

        if key == self.keys["toggle_tag_id"]:
            self.gui["SHOW_TAG_ID"] = not self.gui["SHOW_TAG_ID"]

        if key == self.keys["toggle_world_coords"]:
            self.gui["SHOW_TAG_WORLD_COORDS"] = not self.gui["SHOW_TAG_WORLD_COORDS"]

        if key == self.keys["toggle_grid"]:
            self.gui["SHOW_FLOOR_GRID"] = not self.gui["SHOW_FLOOR_GRID"]

        if key == self.keys["toggle_report"]:
            self.gui["SHOW_CALIBRATION_REPORT"] = not self.gui["SHOW_CALIBRATION_REPORT"]
