from collections import deque
import numpy as np


class WorldCoordinateStabilizer:

    def __init__(
        self,
        alpha=0.35,
        history=8,
        max_jump_m=1.5
    ):
        self.alpha = alpha
        self.history = history
        self.max_jump_m = max_jump_m
        self.state = {}

    def _ensure(self, tag_id):
        if tag_id not in self.state:
            self.state[tag_id] = {
                "ema": None,
                "history": deque(maxlen=self.history)
            }
        return self.state[tag_id]

    def update(self, tag_id, x, y, z=0.0):
        s = self._ensure(tag_id)

        current = np.array([x, y, z], dtype=np.float64)

        if s["ema"] is None:
            s["ema"] = current
            s["history"].append(current)
            return float(current[0]), float(current[1]), float(current[2])

        prev = s["ema"]
        jump = np.linalg.norm(current[:2] - prev[:2])

        if jump > self.max_jump_m:
            direction = current[:2] - prev[:2]
            norm = np.linalg.norm(direction)
            if norm > 1e-6:
                direction = direction / norm
                clipped_xy = prev[:2] + direction * self.max_jump_m
                current = np.array([clipped_xy[0], clipped_xy[1], current[2]], dtype=np.float64)

        ema = self.alpha * current + (1.0 - self.alpha) * prev
        s["ema"] = ema
        s["history"].append(ema)

        hist = np.array(s["history"], dtype=np.float64)
        median = np.median(hist, axis=0)

        return float(median[0]), float(median[1]), float(median[2])

    def decay_unseen(self, active_ids):
        active_ids = set(active_ids)
        to_remove = [tid for tid in self.state if tid not in active_ids]

        for tid in to_remove:
            del self.state[tid]
