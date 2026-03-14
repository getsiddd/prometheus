import math
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class CADCanvasMapper:
    min_x: float
    min_y: float
    max_x: float
    max_y: float
    scale: float
    pad: int
    canvas_w: int
    canvas_h: int

    def world_to_canvas(self, x, y):
        cx = int((x - self.min_x) * self.scale + self.pad)
        cy = int(self.canvas_h - ((y - self.min_y) * self.scale + self.pad))
        return cx, cy

    def canvas_to_world(self, cx, cy):
        x = (cx - self.pad) / self.scale + self.min_x
        y = ((self.canvas_h - cy) - self.pad) / self.scale + self.min_y
        return float(x), float(y)


@dataclass
class CADViewState:
    yaw_deg: float = 35.0
    pitch_deg: float = -30.0
    roll_deg: float = 0.0
    zoom: float = 1.0
    pan_x: float = 0.0
    pan_y: float = 0.0


def _entity_points(entity):
    etype = entity.dxftype()

    if etype == "LINE":
        s = entity.dxf.start
        e = entity.dxf.end
        return [(float(s.x), float(s.y)), (float(e.x), float(e.y))]

    if etype == "LWPOLYLINE":
        pts = [(float(p[0]), float(p[1])) for p in entity.get_points()]
        if entity.closed and len(pts) > 1:
            pts.append(pts[0])
        return pts

    if etype == "POLYLINE":
        pts = [(float(v.dxf.location.x), float(v.dxf.location.y)) for v in entity.vertices]
        if entity.is_closed and len(pts) > 1:
            pts.append(pts[0])
        return pts

    return []


def _entity_points_3d(entity):
    etype = entity.dxftype()

    if etype == "LINE":
        s = entity.dxf.start
        e = entity.dxf.end
        return [
            (float(s.x), float(s.y), float(getattr(s, "z", 0.0))),
            (float(e.x), float(e.y), float(getattr(e, "z", 0.0))),
        ]

    if etype == "LWPOLYLINE":
        elevation = float(getattr(entity.dxf, "elevation", 0.0))
        pts = []
        for p in entity.get_points():
            z = elevation
            if len(p) >= 3 and p[2] is not None:
                z = float(p[2])
            pts.append((float(p[0]), float(p[1]), z))
        if entity.closed and len(pts) > 1:
            pts.append(pts[0])
        return pts

    if etype == "POLYLINE":
        pts = [
            (
                float(v.dxf.location.x),
                float(v.dxf.location.y),
                float(v.dxf.location.z),
            )
            for v in entity.vertices
        ]
        if entity.is_closed and len(pts) > 1:
            pts.append(pts[0])
        return pts

    return []


def load_dwg_geometry(dwg_path):
    try:
        import ezdxf
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency 'ezdxf'. Install it with: pip install ezdxf"
        ) from exc

    doc = ezdxf.readfile(dwg_path)
    msp = doc.modelspace()

    segments = []
    vertices = []

    for ent in msp:
        pts = _entity_points(ent)
        if len(pts) < 2:
            continue

        for i in range(len(pts) - 1):
            a = pts[i]
            b = pts[i + 1]
            if math.isclose(a[0], b[0], abs_tol=1e-9) and math.isclose(a[1], b[1], abs_tol=1e-9):
                continue
            segments.append((a, b))
            vertices.append(a)
            vertices.append(b)

    if not segments:
        raise RuntimeError("No LINE/LWPOLYLINE/POLYLINE geometry found in DWG")

    arr = np.array(vertices, dtype=np.float32)
    min_x, min_y = np.min(arr[:, 0]), np.min(arr[:, 1])
    max_x, max_y = np.max(arr[:, 0]), np.max(arr[:, 1])

    uniq = np.unique(arr, axis=0)
    uniq_vertices = [tuple(map(float, p)) for p in uniq]

    return segments, uniq_vertices, (float(min_x), float(min_y), float(max_x), float(max_y))


def render_cad_canvas(segments, bounds, canvas_w=1200, canvas_h=900, pad=50):
    min_x, min_y, max_x, max_y = bounds

    span_x = max(max_x - min_x, 1e-6)
    span_y = max(max_y - min_y, 1e-6)

    scale_x = (canvas_w - 2 * pad) / span_x
    scale_y = (canvas_h - 2 * pad) / span_y
    scale = min(scale_x, scale_y)

    mapper = CADCanvasMapper(
        min_x=min_x,
        min_y=min_y,
        max_x=max_x,
        max_y=max_y,
        scale=scale,
        pad=pad,
        canvas_w=canvas_w,
        canvas_h=canvas_h,
    )

    canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)
    canvas[:] = (20, 20, 20)

    for a, b in segments:
        p1 = mapper.world_to_canvas(a[0], a[1])
        p2 = mapper.world_to_canvas(b[0], b[1])
        cv2.line(canvas, p1, p2, (180, 180, 180), 1, cv2.LINE_AA)

    return canvas, mapper


def nearest_vertex_world(click_xy, vertices_world, mapper, max_px=25):
    cx, cy = click_xy
    best = None
    best_dist = 1e12

    for vx, vy in vertices_world:
        px, py = mapper.world_to_canvas(vx, vy)
        d = ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5
        if d < best_dist:
            best_dist = d
            best = (vx, vy)

    if best is None or best_dist > max_px:
        return None

    return best


def load_dwg_geometry_3d(dwg_path):
    try:
        import ezdxf
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency 'ezdxf'. Install it with: pip install ezdxf"
        ) from exc

    doc = ezdxf.readfile(dwg_path)
    msp = doc.modelspace()

    segments = []
    vertices = []

    for ent in msp:
        pts = _entity_points_3d(ent)
        if len(pts) < 2:
            continue

        for i in range(len(pts) - 1):
            a = pts[i]
            b = pts[i + 1]
            if (
                math.isclose(a[0], b[0], abs_tol=1e-9)
                and math.isclose(a[1], b[1], abs_tol=1e-9)
                and math.isclose(a[2], b[2], abs_tol=1e-9)
            ):
                continue
            segments.append((a, b))
            vertices.append(a)
            vertices.append(b)

    if not segments:
        raise RuntimeError("No LINE/LWPOLYLINE/POLYLINE geometry found in DWG")

    arr = np.array(vertices, dtype=np.float32)
    min_xyz = np.min(arr, axis=0)
    max_xyz = np.max(arr, axis=0)

    uniq = np.unique(arr, axis=0)
    uniq_vertices = [tuple(map(float, p)) for p in uniq]

    bounds = {
        "min": tuple(map(float, min_xyz.tolist())),
        "max": tuple(map(float, max_xyz.tolist())),
    }

    return segments, uniq_vertices, bounds


def _rotation_matrix(yaw_deg, pitch_deg, roll_deg):
    yaw = math.radians(yaw_deg)
    pitch = math.radians(pitch_deg)
    roll = math.radians(roll_deg)

    cy, sy = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)
    cr, sr = math.cos(roll), math.sin(roll)

    rz = np.array([[cy, -sy, 0.0], [sy, cy, 0.0], [0.0, 0.0, 1.0]], dtype=np.float32)
    rx = np.array([[1.0, 0.0, 0.0], [0.0, cp, -sp], [0.0, sp, cp]], dtype=np.float32)
    ry = np.array([[cr, 0.0, sr], [0.0, 1.0, 0.0], [-sr, 0.0, cr]], dtype=np.float32)

    return rz @ rx @ ry


def render_cad_canvas_3d(segments3d, vertices3d, state=None, canvas_w=1200, canvas_h=900, pad=80):
    if state is None:
        state = CADViewState()

    arr = np.array(vertices3d, dtype=np.float32)
    center = np.mean(arr, axis=0)
    centered = arr - center

    R = _rotation_matrix(state.yaw_deg, state.pitch_deg, state.roll_deg)
    rot = (R @ centered.T).T

    min_xy = np.min(rot[:, :2], axis=0)
    max_xy = np.max(rot[:, :2], axis=0)
    span = np.maximum(max_xy - min_xy, 1e-6)

    scale_x = (canvas_w - 2 * pad) / span[0]
    scale_y = (canvas_h - 2 * pad) / span[1]
    scale = min(scale_x, scale_y) * float(max(state.zoom, 0.05))

    def project_point(world_xyz):
        p = np.array(world_xyz, dtype=np.float32) - center
        pr = R @ p
        cx = int(((pr[0] - min_xy[0]) * scale) + pad + state.pan_x)
        cy = int(canvas_h - (((pr[1] - min_xy[1]) * scale) + pad + state.pan_y))
        return cx, cy, float(pr[2])

    canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)
    canvas[:] = (20, 20, 20)

    draw_segments = []
    for a, b in segments3d:
        p1 = project_point(a)
        p2 = project_point(b)
        zavg = 0.5 * (p1[2] + p2[2])
        draw_segments.append((zavg, p1, p2))

    draw_segments.sort(key=lambda item: item[0])

    for _z, p1, p2 in draw_segments:
        cv2.line(canvas, (p1[0], p1[1]), (p2[0], p2[1]), (170, 170, 170), 1, cv2.LINE_AA)

    projected_vertices = []
    for v in vertices3d:
        px, py, pz = project_point(v)
        projected_vertices.append((v, (px, py), pz))

    return canvas, projected_vertices, state


def nearest_vertex_world_3d(click_xy, projected_vertices, max_px=20):
    cx, cy = click_xy
    best = None
    best_dist = 1e12

    for world_xyz, (px, py), _pz in projected_vertices:
        d = ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5
        if d < best_dist:
            best_dist = d
            best = world_xyz

    if best is None or best_dist > max_px:
        return None

    return best
