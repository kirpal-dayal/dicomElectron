# segmentation.py  (versión unificada)

import os
import glob
import json
import numpy as np
import cv2
import pydicom as pd
from pydicom.misc import is_dicom
from tifffile import imwrite
from keras.models import load_model
import segmentation_models as sm

from sklearn.cluster import DBSCAN
from sklearn.neighbors import NearestNeighbors
from kneed import KneeLocator

from skimage import measure
from skimage.measure import approximate_polygon

from data_to_numpyarr import data2numpyarr  # integración para artefactos, incluir el data_to_numpyarr.py


# --------------------------
#   Modelo de segmentación
# --------------------------
def test_U_net_estimation(X_test, n_classes):
    """
    Ejecuta la U-Net preentrenada (backbone VGG16) y devuelve la predicción argmax por pixel.
    La ruta del modelo es relativa a este archivo (best_result.hdf5).
    """
    BACKBONE = "vgg16"
    preprocess_input = sm.get_preprocessing(BACKBONE)

    model_path = os.path.join(os.path.dirname(__file__), "best_result.hdf5")
    model = load_model(model_path, compile=False)

    X_test1 = preprocess_input(X_test)
    y_pred = model.predict(X_test1)
    y_pred_argmax = np.argmax(y_pred, axis=3)
    return y_pred_argmax


# --------------------------
#   Utilidades internas
# --------------------------
def _safe_getattr(ds, name, default=None, cast=float):
    try:
        v = getattr(ds, name)
        return cast(v) if cast and v is not None else v
    except Exception:
        return default


def _estimate_eps_with_knee(data, min_samples=4):
    """
    Estima eps para DBSCAN con curva k-distancias + KneeLocator.
    Tiene fallbacks para casos sin rodilla clara.
    """
    if len(data) < max(10, min_samples + 1):
        # Muy pocos puntos → usa un valor conservador
        return 2.5

    neigh = NearestNeighbors(n_neighbors=min_samples)
    nbrs = neigh.fit(data)
    distances, _ = nbrs.kneighbors(data)
    k_distances = np.sort(distances[:, -1])

    try:
        knee_locator = KneeLocator(
            range(len(k_distances)), k_distances, curve="convex", direction="increasing"
        )
        knee_idx = knee_locator.knee
        if knee_idx is None:
            # Fallback: percentil 90
            return float(np.percentile(k_distances, 90))
        return float(k_distances[knee_idx])
    except Exception:
        # Fallback adicional: mediana * factor
        return float(np.median(k_distances) * 1.5)


def _scale_contours_to_original(contours_xy, scale_x, scale_y):
    """
    Contornos (lista de arrays Nx2, dtype=float/int) en espacio de resize (SIZE_X, SIZE_Y)
    → lista de listas de {x, y} en espacio original.
    """
    out = []
    for c in contours_xy:
        if c is None or len(c) < 3:
            continue
        # c esperado como [[x,y], [x,y], ...]
        scaled = [{"x": float(p[0] * scale_x), "y": float(p[1] * scale_y)} for p in c]
        out.append(scaled)
    return out


def _simplify_contours(contours_xy, tolerance=2.0, scale_x=1.0, scale_y=1.0):
    """
    Simplifica contornos con skimage.approximate_polygon y escala a resolución original.
    Entrada: contornos [[x,y], ...] en espacio resize.
    """
    out = []
    for c in contours_xy:
        if c is None or len(c) < 3:
            continue
        # skimage usa (row, col) ≈ (y, x)
        arr = np.array([[p[1], p[0]] for p in c], dtype=float)
        approx = approximate_polygon(arr, tolerance=tolerance)
        # Filtra forma válida
        approx = [p for p in approx if isinstance(p, (list, np.ndarray)) and len(p) == 2]
        if len(approx) >= 3:
            scaled = [{"x": float(p[1] * scale_x), "y": float(p[0] * scale_y)} for p in approx]
            out.append(scaled)
    return out


# --------------------------
#   Pipeline principal
# --------------------------
def dicom_segmentation(path_original, size, n_clases, enable_dbscan_filter=True, debug=False):
    """
    Segmenta un estudio DICOM:
      - Lee DICOMs de `path_original`
      - Predice máscaras con U-Net
      - (Opcional) Filtra pulmones con DBSCAN (cluster pulmonar principal)
      - Genera JSON por slice (original y simplified), TIFFs y volumenes.json

    Args:
        path_original (str): carpeta con DICOMs del estudio (slices).
        size (tuple[int,int]): (SIZE_X, SIZE_Y) para el modelo.
        n_clases (int): #clases del modelo (p.ej. 3 → fondo, pulmón, fibrosis).
        enable_dbscan_filter (bool): activar filtrado por cluster.
        debug (bool): logs extra.

    Salida (en path_original/segmentaciones_por_dicom):
        - mask_###.json, mask_###_simplified.json
        - volumenes.json
        - valid_indices.json
        - ct_original.tif
        - mascaras_pred.tif   (0=fondo, 1=pulmón, 2=fibrosis) tras filtrado
    """
    SIZE_X, SIZE_Y = size

    # --- 1) Recolección robusta de DICOMs ---
    files = glob.glob(os.path.join(path_original, "*"))
    if debug:
        print(f"[INFO] Archivos encontrados en carpeta: {len(files)}")

    arr_original = []   # slices redimensionados (SIZE_X,SIZE_Y)
    ds_valids = []      # datasets válidos
    valid_paths = []    # rutas válidas (para valid_indices.json)
    img_size = None     # (rows, cols) original

    for img_path in files:
        if not os.path.isfile(img_path):
            if debug:
                print(f"[SKIP] {os.path.basename(img_path)} no es un archivo regular")
            continue

        if not is_dicom(img_path):
            # No todos los DICOM tienen preámbulo estándar; intentaremos leerlo igual
            if debug:
                print(f"[WARN] {os.path.basename(img_path)} no parece DICOM estándar (se intentará leer igual)")

        try:
            ds = pd.dcmread(img_path, force=True)
            if not hasattr(ds, "PixelData") or ds.get("PixelData") is None or ds.get("Rows") is None:
                if debug:
                    print(f"[SKIP] {os.path.basename(img_path)} sin PixelData/Rows")
                continue

            img = ds.pixel_array
        except Exception as e:
            if debug:
                print(f"[ERROR] Fallo al leer {os.path.basename(img_path)}: {e}")
            continue

        # Guardar tamaño original de referencia
        if img_size is None:
            img_size = img.shape  # (rows, cols)

        # Reescala HU y recorta ventana [-1000, 250], luego normaliza a [0,1250] → uint16
        rescale_intercept = int(getattr(ds, "RescaleIntercept", 0))
        img = img + rescale_intercept
        img = np.clip(img, -1000, 250)
        img = img + 1000
        img = img.astype(np.uint16)

        # Resize para el modelo
        img_resized = cv2.resize(img, [SIZE_X, SIZE_Y], interpolation=cv2.INTER_LINEAR)

        arr_original.append(img_resized)
        ds_valids.append(ds)
        valid_paths.append(img_path)

    if len(arr_original) == 0:
        raise ValueError(f"No se encontraron imágenes DICOM utilizables en: {path_original}")

    arr_original = np.array(arr_original)  # shape (N, SIZE_Y, SIZE_X)

    # --- 2) Metadatos físicos de referencia ---
    ds_ref = ds_valids[0]
    original_pixel_spacing = getattr(ds_ref, "PixelSpacing", [1.0, 1.0])
    # relación de escalado (de original a SIZE_Y (rows))
    pixel_relation = float(img_size[0]) / float(SIZE_Y)
    # mm/pixel en la imagen de trabajo (SIZE_X,SIZE_Y)
    pixelen_y = float(original_pixel_spacing[0]) * pixel_relation
    pixelen_x = float(original_pixel_spacing[1]) * pixel_relation
    # usar promedio en XY (o X) para el área; aquí usamos X*Y (más correcto)
    pixelarea = pixelen_x * pixelen_y

    # separación entre cortes
    spacing_between_slices = _safe_getattr(ds_ref, "SpacingBetweenSlices", default=None, cast=float)
    if spacing_between_slices is None:
        spacing_between_slices = _safe_getattr(ds_ref, "SliceThickness", default=1.0, cast=float)
    spacing_between_slices = abs(float(spacing_between_slices))

    if debug:
        print("\n========== [INFO] Parámetros de cálculo de volumen ==========")
        print(f"Resolución original DICOM: {img_size} (rows, cols)")
        print(f"Resolución usada para modelo: {SIZE_X} x {SIZE_Y}")
        print(f"PixelSpacing original (mm): {original_pixel_spacing}")
        print(f"Factor de escalado (rows): {pixel_relation:.4f}")
        print(f"pixelen_x (mm/px): {pixelen_x:.4f} · pixelen_y (mm/px): {pixelen_y:.4f}")
        print(f"Área por píxel (mm²): {pixelarea:.4f}")
        print(f"Espacio entre cortes (mm): {spacing_between_slices:.4f}")
        print("==============================================================\n")

    # --- 3) Predicción de máscaras con U-Net ---
    # convertir a BGR (3 canales) para backbone VGG16
    arr_color = np.array([cv2.cvtColor(img, cv2.COLOR_GRAY2BGR) for img in arr_original])
    mask_pred = test_U_net_estimation(arr_color, n_clases)  # (N, SIZE_Y, SIZE_X), etiquetas 0/1/2/...

    # --- 4) Extraer contornos por slice con OpenCV (para DBSCAN) ---
    #   y, en paralelo, construir máscaras binarias por slice
    study_all_contours_lung = []      # lista de listas de contornos (cada contorno Nx2 en XY resize)
    study_all_contours_fibrosis = []

    for each_mask in mask_pred:
        # 1 = pulmón, 2 = fibrosis (pulmón+fibrosis = 1; fibrosis sola = 1 en binaria per-layer)
        mask_lung = np.where((each_mask == 1) | (each_mask == 2), 1, 0).astype(np.uint8)
        mask_fibrosis = np.where(each_mask == 2, 1, 0).astype(np.uint8)

        # Contornos detallados (sin aproximación) para DBSCAN
        cnts_lung, _ = cv2.findContours(mask_lung, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        cnts_fib, _ = cv2.findContours(mask_fibrosis, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)

        # Normaliza contornos OpenCV a arrays Nx2 (x,y)
        def cnt_to_xylist(cnt):
            if cnt is None or len(cnt) == 0:
                return []
            arr = cnt.reshape(-1, 2)
            # OpenCV devuelve (x,y)
            return arr

        study_all_contours_lung.append([cnt_to_xylist(c) for c in cnts_lung])
        study_all_contours_fibrosis.append([cnt_to_xylist(c) for c in cnts_fib])

    # --- 5) (Opcional) DBSCAN para seleccionar el cluster pulmonar principal ---
    # Construir nube de puntos 3D (x,y, z_mm) con data2numpyarr
    # y etiquetar contornos por cluster más frecuente (excluyendo ruido -1).
    most_common_label = None
    labels = None
    if enable_dbscan_filter:
        data2cluster = data2numpyarr(study_all_contours_lung, spacing_between_slices)
        eps_est = _estimate_eps_with_knee(data2cluster, min_samples=4)
        db = DBSCAN(eps=eps_est, min_samples=4).fit(data2cluster)
        labels = db.labels_

        # Selecciona el label más frecuente ignorando ruido (-1)
        values, counts = np.unique(labels, return_counts=True)
        keep = [(v, c) for v, c in zip(values, counts) if v != -1]
        if len(keep) > 0:
            most_common_label = max(keep, key=lambda t: t[1])[0]
        else:
            most_common_label = -1  # si todo es ruido, no filtramos realmente
        if debug:
            print(f"[DBSCAN] eps≈{eps_est:.3f} | labels únicos={list(values)} | label más común={most_common_label}")

    # --- 6) Construir máscaras filtradas y JSONs por slice ---
    output_dir = os.path.join(path_original, "segmentaciones_por_dicom")
    os.makedirs(output_dir, exist_ok=True)

    filtered_masks = []  # máscaras finales 0/1/2 por slice
    lung_pixels_pred = []
    fibrosis_pixels_pred = []

    # factores para escalar contornos (de resize a original)
    scale_x = float(img_size[1]) / float(SIZE_X)
    scale_y = float(img_size[0]) / float(SIZE_Y)

    global_point_index = 0  # índice global en "labels" para recorrer puntos por contorno (orden consistente)

    for idx, (cnts_lung_xy, cnts_fib_xy) in enumerate(zip(study_all_contours_lung, study_all_contours_fibrosis)):
        # 6.1) Filtrar contornos de pulmón por cluster (si aplica)
        filtered_lung_cnts = []
        if enable_dbscan_filter and labels is not None and most_common_label is not None:
            for c in cnts_lung_xy:
                if c is None or len(c) == 0:
                    continue
                npts = len(c)
                # etiqueta del primer punto del contorno (alternativamente promedio/majority)
                # aquí seguimos la lógica del código original (contorno por etiqueta global acumulando npts)
                lab = labels[global_point_index] if global_point_index < len(labels) else -1
                global_point_index += npts

                if lab == most_common_label:
                    filtered_lung_cnts.append(c)
        else:
            filtered_lung_cnts = [c for c in cnts_lung_xy if c is not None and len(c) > 0]
            # avanza el índice global igualmente para mantener coherencia
            if labels is not None:
                for c in cnts_lung_xy:
                    global_point_index += len(c) if c is not None else 0

        # 6.2) Reconstruir máscara slice (0/1/2) a partir de contornos filtrados
        m_lung = np.zeros((SIZE_Y, SIZE_X), dtype=np.uint8)
        for c in filtered_lung_cnts:
            cv2.fillPoly(m_lung, [c.astype(np.int32)], 1)

        m_fib = np.zeros((SIZE_Y, SIZE_X), dtype=np.uint8)
        for c in cnts_fib_xy:
            if c is not None and len(c) > 0:
                cv2.fillPoly(m_fib, [c.astype(np.int32)], 1)

        # combinación: fibrosis domina sobre pulmón
        m = np.where(m_fib >= 1, 2, np.where(m_lung >= 1, 1, 0)).astype(np.uint8)
        filtered_masks.append(m)

        # 6.3) JSONs por slice (en coordenadas de la RESOLUCIÓN ORIGINAL)
        #     a) versión completa
        lung_json = _scale_contours_to_original(filtered_lung_cnts, scale_x, scale_y)
        fib_json = _scale_contours_to_original([c for c in cnts_fib_xy if c is not None and len(c) > 0], scale_x, scale_y)
        #     b) versión simplified
        lung_json_s = _simplify_contours(filtered_lung_cnts, tolerance=2.0, scale_x=scale_x, scale_y=scale_y)
        fib_json_s = _simplify_contours([c for c in cnts_fib_xy if c is not None and len(c) > 0], tolerance=2.0, scale_x=scale_x, scale_y=scale_y)

        with open(os.path.join(output_dir, f"mask_{idx:03d}.json"), "w") as f:
            json.dump({"lung": lung_json, "fibrosis": fib_json}, f, indent=2)

        try:
            json_str = json.dumps(
                {"lung_editable": lung_json_s, "fibrosis_editable": fib_json_s},
                indent=2
            )
            json.loads(json_str)  # validación
            with open(os.path.join(output_dir, f"mask_{idx:03d}_simplified.json"), "w") as f:
                f.write(json_str)
        except Exception as e:
            if debug:
                print(f"[WARN] No se pudo guardar mask_{idx:03d}_simplified.json: {e}")

        # 6.4) Acumular conteos para volumen
        lung_pixels_pred.append(int(np.sum(m == 1)))
        fibrosis_pixels_pred.append(int(np.sum(m == 2)))

    filtered_masks = np.array(filtered_masks, dtype=np.uint8)  # (N, SIZE_Y, SIZE_X)

    # --- 7) Volúmenes (ml) ---
    # área (mm²) * espesor (mm) → mm³; /1000 → ml
    lung_area_pred = np.array(lung_pixels_pred, dtype=float) * float(pixelarea)
    fibrosis_area_pred = np.array(fibrosis_pixels_pred, dtype=float) * float(pixelarea)

    lung_volume_ml = float(np.sum(lung_area_pred) * spacing_between_slices / 1000.0)
    fibrosis_volume_ml = float(np.sum(fibrosis_area_pred) * spacing_between_slices / 1000.0)
    total_volume_ml = lung_volume_ml + fibrosis_volume_ml

    volumen_data = {
        "lung_volume_ml": round(abs(lung_volume_ml), 2),
        "fibrosis_volume_ml": round(abs(fibrosis_volume_ml), 2),
        "total_volume_ml": round(abs(total_volume_ml), 2),
    }

    with open(os.path.join(output_dir, "volumenes.json"), "w") as f:
        json.dump(volumen_data, f, indent=2)

    if debug:
        print(
            f"[VOL] pulmón={volumen_data['lung_volume_ml']} ml | "
            f"fibrosis={volumen_data['fibrosis_volume_ml']} ml | "
            f"total={volumen_data['total_volume_ml']} ml"
        )

    # --- 8) Guardar TIFFs ---
    # NOTA: usamos spacing en Z (entre slices) y resoluciones en XY basadas en pixelarea.
    #       Se guarda la pila redimensionada usada por el modelo (consistente con los contornos).
    imwrite(
        os.path.join(output_dir, "ct_original.tif"),
        arr_original.astype(np.uint16),
        imagej=True,
        resolution=(1 / pixelarea, 1 / pixelarea),
        metadata={"spacing": spacing_between_slices, "unit": "mm", "axes": "ZYX"},
    )

    imwrite(
        os.path.join(output_dir, "mascaras_pred.tif"),
        filtered_masks.astype(np.uint16),
        imagej=True,
        resolution=(1 / pixelarea, 1 / pixelarea),
        metadata={"spacing": spacing_between_slices, "unit": "mm", "axes": "ZYX"},
    )

    # --- 9) Índices válidos -> archivo para el frontend ---
    valid_index_map = {i: os.path.basename(path) for i, path in enumerate(valid_paths)}
    with open(os.path.join(output_dir, "valid_indices.json"), "w") as f:
        json.dump(valid_index_map, f, indent=2)

    if debug:
        print(f"[OK] Salidas en: {output_dir}")

    # (Opcional) devolver rutas/metrics si tu backend las usa
    return {
        "output_dir": output_dir,
        "n_slices": len(arr_original),
        "volumes_ml": volumen_data,
        "valid_indices": valid_index_map,
    }
