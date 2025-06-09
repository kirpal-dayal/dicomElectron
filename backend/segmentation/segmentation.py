# Procesa los archivos .dcm, genera máscaras .tif, extrae contornos con skimage.measure.find_contours, y guarda los contornos como listas de coordenadas en mask_{index}.json.
# Guarda todo dentro de backend/segmentation/[carpeta]/segmentaciones_por_dicom/.
import numpy as np
import glob
from tifffile import imwrite
import pydicom as pd
import cv2
import segmentation_models as sm
import os
import json
from skimage import measure
from keras.models import load_model
import matplotlib.pyplot as plt
from skimage.measure import approximate_polygon #para simplificar contornos

def debug_save_image(array, path, cmap='gray'):
    plt.imsave(path, array, cmap=cmap)

def test_U_net_estimation(X_test, n_classes):
    BACKBONE = 'vgg16'
    preprocess_input = sm.get_preprocessing(BACKBONE)
    model_path = os.path.join(os.path.dirname(__file__), "best_result.hdf5")
    model = load_model(model_path, compile=False)
    X_test1 = preprocess_input(X_test)

    try:
        y_pred = model.predict(X_test1)
    except Exception as e:
        print(f"[ERROR] Fallo al predecir con el modelo: {e}")
        raise

    y_pred_argmax = np.argmax(y_pred, axis=3)
    print(f"[DEBUG] Predicción shape: {y_pred_argmax.shape}")
    print(f"[DEBUG] Clases únicas en máscara predicha: {np.unique(y_pred_argmax)}")
    return y_pred_argmax

def render_json_contours_to_png(json_contours, output_path, image_shape):
    canvas = np.zeros(image_shape, dtype=np.uint8)
    for contour in json_contours:
        pts = np.array([[int(p['x']), int(p['y'])] for p in contour], dtype=np.int32)
        if pts.shape[0] >= 3:
            cv2.polylines(canvas, [pts], isClosed=True, color=255, thickness=1)
    debug_save_image(canvas, output_path)

def dicom_segmentation(path_original, size, n_clases):
    SIZE_X, SIZE_Y = size
    arr_original = []
    ds = None
    img_size = None

    for directory_path in glob.glob(path_original):
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
    pixelen = ds.PixelSpacing[0] * pixel_relation
    pixelarea = pixelen * pixelen
    slice_thickness_old = float(ds.SliceThickness) if "SliceThickness" in ds else 10

    arr_original_color = [cv2.cvtColor(im, cv2.COLOR_GRAY2BGR) for im in arr_original]
    arr_original_color = np.array(arr_original_color)

    assert arr_original_color.shape[1:3] == (SIZE_Y, SIZE_X), f"Shape inválida para el modelo: {arr_original_color.shape}"

    mask_pred = test_U_net_estimation(arr_original_color, n_clases)

    if not np.any(mask_pred == 2):
        print("[WARNING] Ninguna clase '2' detectada. Puede que el modelo no esté respondiendo.")

    output_dir = os.path.join(path_original, "segmentaciones_por_dicom")
    os.makedirs(output_dir, exist_ok=True)

    debug_info = {}

    for idx, (each_mask, original_img) in enumerate(zip(mask_pred, arr_original)):
        mask_fibrosis = np.where((each_mask == 2), 1, 0).astype(np.uint8)
        print(f"[DEBUG] Mask {idx} contiene {np.sum(mask_fibrosis)} pixeles con valor 1")

        debug_save_image(original_img, os.path.join(output_dir, f"debug_input_{idx:03d}.png"))
        debug_save_image(mask_fibrosis * 255, os.path.join(output_dir, f"mask_{idx:03d}_binary.png"))

        contours = measure.find_contours(mask_fibrosis.astype(float), level=0.5)
        print(f"[DEBUG] Contornos detectados en mask_{idx}: {len(contours)}")

        # Escala los contornos a la resolución original del DICOM
        scale_x = img_size[1] / SIZE_X
        scale_y = img_size[0] / SIZE_Y

        json_contours = []
        # Simplifica los contornos y los guarda en formato JSON
        for contour in contours:
            if len(contour) >= 3:
                simplified = approximate_polygon(contour, tolerance=1.5)  # valor de tolerancia ajustable, 1 = más preciso mas puntos, 3 = menos preciso menos puntos
                if len(simplified) >= 3:
                    scaled = [{"x": float(p[1] * scale_x), "y": float(p[0] * scale_y)} for p in simplified]
                    json_contours.append(scaled)


        json_path = os.path.join(output_dir, f"mask_{idx:03d}.json")
        with open(json_path, 'w') as f:
            json.dump(json_contours, f)

        # Renderiza imagen de los contornos desde JSON
        render_json_contours_to_png(json_contours, os.path.join(output_dir, f"mask_{idx:03d}_from_json.png"), mask_fibrosis.shape)

        debug_info[f"mask_{idx:03d}"] = {
            "pixels_1": int(np.sum(mask_fibrosis)),
            "contours_detected": len(contours)
        }

    # RGB de depuración
    debug_save_image(arr_original_color[0][:, :, 0], os.path.join(output_dir, f"debug_colorchannel_R.png"))
    debug_save_image(arr_original_color[0][:, :, 1], os.path.join(output_dir, f"debug_colorchannel_G.png"))
    debug_save_image(arr_original_color[0][:, :, 2], os.path.join(output_dir, f"debug_colorchannel_B.png"))

    # Guardar stacks (si se requieren)
    imwrite(os.path.join(output_dir, "ct_original.tif"),
            arr_original.astype(np.uint16),
            imagej=True,
            resolution=(1 / pixelarea, 1 / pixelarea),
            metadata={'spacing': slice_thickness_old, 'unit': 'mm', 'axes': 'ZYX'})

    imwrite(os.path.join(output_dir, "mascaras_pred.tif"),
            mask_pred.astype(np.uint16),
            imagej=True,
            resolution=(1 / pixelarea, 1 / pixelarea),
            metadata={'spacing': slice_thickness_old, 'unit': 'mm', 'axes': 'ZYX'})

    with open(os.path.join(output_dir, "debug_summary.json"), 'w') as f:
        json.dump(debug_info, f, indent=2)
