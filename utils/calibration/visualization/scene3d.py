import matplotlib.pyplot as plt
from config import TAG_LAYOUT

class Scene3D:

    def __init__(self):

        self.fig = plt.figure()
        self.ax = self.fig.add_subplot(111, projection='3d')

    def update(self, camera_points, detected_tags):

        self.ax.cla()

        # Camera pose estimates
        for p in camera_points:

            x,y,z = p

            # Prevent camera below floor
            if z < 0:
                z = abs(z)

            self.ax.scatter(x, y, z, c='blue', s=40)
            self.ax.text(x, y, z, "Camera")

        # Expected tag layout (from config)
        for tag_id, pos in TAG_LAYOUT.items():

            x,y,z = pos

            self.ax.scatter(x,y,z,c='green',s=60)
            self.ax.text(x,y,z,f"Expected {tag_id}")

        # Detected tag positions (from homography)
        for tag_id,wx,wy,wz in detected_tags:

            self.ax.scatter(wx,wy,wz,c='red',s=80)

            self.ax.text(wx,wy,wz,f"Tag {tag_id}")

        self.ax.set_xlabel("X")
        self.ax.set_ylabel("Y")
        self.ax.set_zlabel("Z")

        self.ax.set_title("AprilTag World Layout")

        plt.pause(0.001)