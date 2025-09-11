# import os
# import segmentation
# os.environ["SM_FRAMEWORK"] = "tf.keras"


# if __name__ == '__main__':
#     # Resizing images, if needed
#     SIZE_X = 256
#     SIZE_Y = 256
#     size = [SIZE_X, SIZE_Y]
#     n_classes = 3  # Number of classes for segmentation

#     original_test_path = r"CT53"

#     segmentation.dicom_segmentation(original_test_path, size, n_classes)
import sys
import os
import segmentation

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Falta la carpeta de entrada")
        sys.exit(1)

    input_folder = sys.argv[1]  # Carpeta con DICOMs, ejemplo: backend/temp/1234_fecha
    size = [256, 256]
    n_classes = 3

    # Ejecutar la segmentación con ruta de entrada (se guarda en una subcarpeta)
    segmentation.dicom_segmentation(input_folder, size, n_classes)