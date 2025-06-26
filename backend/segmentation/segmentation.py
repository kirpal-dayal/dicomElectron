import numpy as np
import glob
from tifffile import imwrite
import pydicom as pd
import cv2
import segmentation_models as sm
import os
import json
from skimage import measure
from skimage.measure import approximate_polygon
from keras.models import load_model

def test_U_net_estimation(X_test, n_classes):
    BACKBONE = 'vgg16'
    preprocess_input = sm.get_preprocessing(BACKBONE)
    model_path = os.path.join(os.path.dirname(__file__), "best_result.hdf5")
    model = load_model(model_path, compile=False)
    X_test1 = preprocess_input(X_test)
    y_pred = model.predict(X_test1)
    y_pred_argmax = np.argmax(y_pred, axis=3)
    return y_pred_argmax

def dicom_segmentation(path_original, size, n_clases):
    SIZE_X, SIZE_Y = size
    arr_original = []
    ds = None
    img_size = None

    directory_path = path_original
    for img_path in glob.glob(os.path.join(directory_path, '*')):
        if not os.path.isfile(img_path):
            continue
        try:
            ds = pd.dcmread(img_path)
        except:
            continue

        img = ds.pixel_array
        img_size = img.shape
        rescale_intercept = int(ds.RescaleIntercept)
        img = img + rescale_intercept
        img = np.clip(img, -1000, 250)
        img = img + 1000
        img = img.astype(np.uint16)
        img_resized = cv2.resize(img, [SIZE_X, SIZE_Y])
        arr_original.append(img_resized)

    if len(arr_original) == 0:
        raise ValueError(f"No se encontraron imágenes DICOM en: {path_original}")

    arr_original = np.array(arr_original)
    
    pixel_relation = img_size[0] / SIZE_X
    original_pixel_spacing = ds.PixelSpacing  # mm/pixel
    pixelen = original_pixel_spacing[0] * pixel_relation
    pixelarea = pixelen * pixelen
    slice_thickness = float(ds.SpacingBetweenSlices) if "SpacingBetweenSlices" in ds else 10

    #  Loggear valores clave
    print("\n========== [INFO] Parámetros de cálculo de volumen ==========")
    print(f"Resolución original de imagen DICOM: {img_size}")
    print(f"Resolución usada en modelo (resize): {SIZE_X} x {SIZE_Y}")
    print(f"PixelSpacing original (DICOM): {original_pixel_spacing}")
    print(f"Factor de escalado aplicado: {pixel_relation:.4f}")
    print(f"pixelen utilizado (mm/pixel): {pixelen:.4f}")
    print(f"Área por píxel (mm²): {pixelarea:.4f}")
    print(f"Grosor de corte (slice thickness) (mm): {slice_thickness:.4f}")
    print("==============================================================\n")

    arr_color = np.array([cv2.cvtColor(img, cv2.COLOR_GRAY2BGR) for img in arr_original])
    mask_pred = test_U_net_estimation(arr_color, n_clases)
    output_dir = os.path.join(path_original, "segmentaciones_por_dicom")
    os.makedirs(output_dir, exist_ok=True)

    lung_pixels_pred = []
    fibrosis_pixels_pred = []

    for idx, (each_mask, original_img) in enumerate(zip(mask_pred, arr_original)):
        mask_lung = np.where((each_mask == 1) | (each_mask == 2), 1, 0).astype(np.uint8)
        mask_fibrosis = np.where(each_mask == 2, 1, 0).astype(np.uint8)

        contours_lung = measure.find_contours(mask_lung.astype(float), level=0.5)
        contours_fibrosis = measure.find_contours(mask_fibrosis.astype(float), level=0.5)

        scale_x = img_size[1] / SIZE_X
        scale_y = img_size[0] / SIZE_Y

        def scale_contours(contours):
            result = []
            for contour in contours:
                if len(contour) >= 3:
                    scaled = [{"x": float(p[1] * scale_x), "y": float(p[0] * scale_y)} for p in contour]
                    result.append(scaled)
            return result

        def simplify_contours(contours, tolerance=2.0):
            result = []
            for contour in contours:
                approx = approximate_polygon(np.array(contour), tolerance=tolerance)
                if len(approx) >= 3:
                    scaled = [{"x": float(p[1] * scale_x), "y": float(p[0] * scale_y)} for p in approx]
                    result.append(scaled)
            return result

        json_lung = scale_contours(contours_lung)
        json_fibrosis = scale_contours(contours_fibrosis)
        json_lung_simplified = simplify_contours(contours_lung)
        json_fibrosis_simplified = simplify_contours(contours_fibrosis)

        with open(os.path.join(output_dir, f"mask_{idx:03d}.json"), 'w') as f:
            json.dump({"lung": json_lung, "fibrosis": json_fibrosis}, f, indent=2)

        with open(os.path.join(output_dir, f"mask_{idx:03d}_simplified.json"), 'w') as f:
            json.dump({
                "lung_editable": json_lung_simplified,
                "fibrosis_editable": json_fibrosis_simplified
            }, f, indent=2)

        lung_pixels_pred.append(np.sum(mask_lung))
        fibrosis_pixels_pred.append(np.sum(mask_fibrosis))

    lung_area_pred = np.array(lung_pixels_pred) * pixelarea
    fibrosis_area_pred = np.array(fibrosis_pixels_pred) * pixelarea
    lung_volume = np.sum(lung_area_pred) * slice_thickness / 1000
    fibrosis_volume = np.sum(fibrosis_area_pred) * slice_thickness / 1000

    volumen_data = {
        "lung_volume_ml": round(abs(float(lung_volume)), 2),
        "fibrosis_volume_ml": round(abs(float(fibrosis_volume)), 2),
        "total_volume_ml": round(abs(float(lung_volume + fibrosis_volume)), 2)
    }

    volumen_path = os.path.join(output_dir, "volumenes.json")
    with open(volumen_path, 'w') as f:
        json.dump(volumen_data, f, indent=2)

    print(f"Archivo de volúmenes guardado en: {volumen_path}")
    print(f" Volumen total: {volumen_data['total_volume_ml']} ml (pulmón: {volumen_data['lung_volume_ml']} ml, fibrosis: {volumen_data['fibrosis_volume_ml']} ml)")

    imwrite(os.path.join(output_dir, "ct_original.tif"),
            arr_original.astype(np.uint16),
            imagej=True,
            resolution=(1 / pixelarea, 1 / pixelarea),
            metadata={'spacing': slice_thickness, 'unit': 'mm', 'axes': 'ZYX'})

    imwrite(os.path.join(output_dir, "mascaras_pred.tif"),
            mask_pred.astype(np.uint16),
            imagej=True,
            resolution=(1 / pixelarea, 1 / pixelarea),
            metadata={'spacing': slice_thickness, 'unit': 'mm', 'axes': 'ZYX'})
