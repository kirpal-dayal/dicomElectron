import numpy as np

def data2numpyarr(points, z_distance):

    final_numpy_arr = None
    slice_index = 0
    for each_slice_coords in points:

        for each_coord in each_slice_coords:
            each_coord = each_coord.reshape(-1, 2)
            nueva_columna = np.full((each_coord.shape[0], 1), z_distance*slice_index)
            result = np.hstack((each_coord, nueva_columna))

            if final_numpy_arr is None:
                final_numpy_arr = result
            else:
                final_numpy_arr = np.vstack((final_numpy_arr, result))

        slice_index += 1

    return final_numpy_arr
