import numpy as np
from config import INTRINSIC_FILE

def save_intrinsics(K,D):

    np.savez(
        INTRINSIC_FILE,
        K=K,
        D=D
    )

def load_intrinsics():

    data = np.load(INTRINSIC_FILE)

    return data["K"], data["D"]

