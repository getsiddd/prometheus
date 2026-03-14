import numpy as np
import cv2

class TopViewScene:

    def __init__(self, size_m=6, pixels_per_meter=120):

        self.size_m = size_m
        self.ppm = pixels_per_meter

        self.width = int(size_m * 2 * self.ppm)
        self.height = int(size_m * 2 * self.ppm)

        self.origin = (self.width // 2, self.height // 2)

    def world_to_map(self, x, y):

        px = int(self.origin[0] + x * self.ppm)
        py = int(self.origin[1] - y * self.ppm)

        return px, py

    def draw_grid(self, img):

        step = self.ppm

        for x in range(0, self.width, step):
            cv2.line(img,(x,0),(x,self.height),(60,60,60),1)

        for y in range(0, self.height, step):
            cv2.line(img,(0,y),(self.width,y),(60,60,60),1)

        # origin axes
        cv2.line(img,(0,self.origin[1]),(self.width,self.origin[1]),(0,255,0),2)
        cv2.line(img,(self.origin[0],0),(self.origin[0],self.height),(0,0,255),2)

    def render(self, tag_positions):

        canvas = np.zeros((self.height,self.width,3),dtype=np.uint8)

        self.draw_grid(canvas)

        for tag_id, x, y, z in tag_positions:

            px, py = self.world_to_map(x,y)

            if 0 <= px < self.width and 0 <= py < self.height:

                cv2.circle(canvas,(px,py),6,(0,255,255),-1)

                cv2.putText(
                    canvas,
                    f"ID {tag_id}",
                    (px+6,py-6),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0,255,255),
                    1
                )

        return canvas