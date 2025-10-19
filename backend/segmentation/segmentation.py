# segmentation.py  (orden Z robusto + Δz robusto + logs por hilo + tf.keras consistente)

import os
import glob
import json
import numpy as np
import cv2
import pydicom as pd
from pydicom.misc import is_dicom
from tifffile import imwrite

# === IMPORTANTE: elegir framework ANTES de importar segmentation_models ===
# Usa tf.keras para ser consistente con TensorFlow y evitar el modo "keras" puro.
os.environ["SM_FRAMEWORK"] = "tf.keras"

import logging
import sys
import time
import threading
import concurrent.futures
from math import isfinite
from argparse import ArgumentParser

# ==== Forzar salida “unbuffered-like” para ver logs en tiempo real ====
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

# --------------------------
#   Logging (INFO por defecto)
# --------------------------
class _FlushingStreamHandler(logging.StreamHandler):
    def emit(self, record):
        super().emit(record)
        try:
            self.flush()
        except Exception:
            pass

logger = logging.getLogger()
logger.setLevel(logging.INFO)
for h in list(logger.handlers):
    logger.removeHandler(h)
_stdout_handler = _FlushingStreamHandler(stream=sys.stdout)
_stdout_handler.setFormatter(logging.Formatter('[%(asctime)s][%(threadName)s] %(message)s', datefmt='%H:%M:%S'))
logger.addHandler(_stdout_handler)

# Usar tf.keras (consistente con SM_FRAMEWORK)
try:
    from tensorflow.keras.models import load_model
except Exception as e:
    logger.error("[INIT] No se pudo importar tensorflow.keras: %s", e)
    raise

# Al importar segmentation_models, verás su banner "using `tf.keras` framework."
import segmentation_models as sm

# (Opcional) integración para artefactos; proveemos fallback
try:
    from data_to_numpyarr import data2numpyarr  # integración para DBSCAN
except Exception:
    logger.info("[DBSCAN] data_to_numpyarr no disponible, usando fallback simple.")
    def data2numpyarr(study_all_contours_lung, spacing_between_slices):
        # Fallback: tomar centroides (x,y) de cada contorno + z como índice
        pts = []
        z = 0.0
        for z_idx, cnts in enumerate(study_all_contours_lung):
            for c in cnts:
                if c is None or len(c) == 0:
                    continue
                arr = np.asarray(c, dtype=float)
                cx = float(np.mean(arr[:, 0]))
                cy = float(np.mean(arr[:, 1]))
                pts.append([cx, cy, z_idx * float(spacing_between_slices or 1.0)])
        if not pts:
            # Evita que DBSCAN explote
            pts = [[0.0, 0.0, 0.0]]
        return np.array(pts, dtype=float)

from sklearn.cluster import DBSCAN
from sklearn.neighbors import NearestNeighbors
from kneed import KneeLocator
from skimage.measure import approximate_polygon


# --------------------------
#   Pretty progress estilo Keras
# --------------------------
class ProgressReporter:
    def __init__(self, prefix, total, width=28):
        self.prefix = prefix
        self.total  = max(int(total), 0)
        self.width  = width
        self.start  = time.time()
        self.done   = 0

    def tick(self, inc=1):
        self.done += inc
        now = time.time()
        elapsed = now - self.start
        rate = (self.done / elapsed) if elapsed > 0 else 0.0
        remaining = max(self.total - self.done, 0)
        eta = (remaining / rate) if rate > 0 else float('inf')

        pct = (self.done / self.total) if self.total else 0.0
        filled = int(self.width * pct)
        bar = '=' * max(filled - 1, 0) + ('>' if self.done < self.total else '=') + '.' * max(self.width - filled, 0)

        msg = (f"\r{self.prefix} [{bar}] {self.done}/{self.total} "
               f"- {elapsed:0.2f}s {rate:0.1f}it/s - ETA: {eta:0.1f}s")
        sys.stdout.write(msg); sys.stdout.flush()

    def done_line(self):
        sys.stdout.write("\n"); sys.stdout.flush()


# --------------------------
#   Modelo de segmentación
# --------------------------
def test_U_net_estimation(X_test, n_classes):
    BACKBONE = "vgg16"
    preprocess_input = sm.get_preprocessing(BACKBONE)
    model_path = os.path.join(os.path.dirname(__file__), "best_result.hdf5")

    if not os.path.exists(model_path):
        logger.error(f"[MODEL] No se encontró el archivo del modelo: {model_path}")
        raise FileNotFoundError(f"Modelo no encontrado: {model_path}")

    try:
        model = load_model(model_path, compile=False)
    except Exception as e:
        logger.error(f"[MODEL] Error cargando modelo ({model_path}): {e}")
        raise

    X_test1 = preprocess_input(X_test)
    try:
        y_pred = model.predict(X_test1, verbose=0)
    except Exception as e:
        logger.error(f"[MODEL] Error en model.predict: {e}")
        raise

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
    if len(data) < max(10, min_samples + 1):
        return 2.5
    neigh = NearestNeighbors(n_neighbors=min_samples)
    nbrs = neigh.fit(data)
    distances, _ = nbrs.kneighbors(data)
    k_distances = np.sort(distances[:, -1])
    try:
        knee_locator = KneeLocator(range(len(k_distances)), k_distances, curve="convex", direction="increasing")
        knee_idx = knee_locator.knee
        if knee_idx is None:
            return float(np.percentile(k_distances, 90))
        return float(k_distances[knee_idx])
    except Exception:
        return float(np.median(k_distances) * 1.5)

def _scale_contours_to_original(contours_xy, scale_x, scale_y):
    out = []
    for c in contours_xy:
        if c is None or len(c) < 3: continue
        scaled = [{"x": float(p[0] * scale_x), "y": float(p[1] * scale_y)} for p in c]
        out.append(scaled)
    return out

def _simplify_contours(contours_xy, tolerance=2.0, scale_x=1.0, scale_y=1.0):
    out = []
    for c in contours_xy:
        if c is None or len(c) < 3: continue
        arr = np.array([[p[1], p[0]] for p in c], dtype=float)  # (row, col)
        approx = approximate_polygon(arr, tolerance=tolerance)
        approx = [p for p in approx if isinstance(p, (list, np.ndarray)) and len(p) == 2]
        if len(approx) >= 3:
            scaled = [{"x": float(p[1] * scale_x), "y": float(p[0] * scale_y)} for p in approx]
            out.append(scaled)
    return out

def _normal_from_iop(iop):
    row = np.array(iop[:3], dtype=float)
    col = np.array(iop[3:], dtype=float)
    n = np.cross(row, col)
    if np.linalg.norm(n) == 0:
        return None
    return n / np.linalg.norm(n)

def _zpos_from_ipp_iop(ds):
    """ Proyección de IPP sobre la normal (IOP) → coordenada 1D para ordenar. """
    try:
        ipp = [float(x) for x in ds.ImagePositionPatient]
        iop = [float(x) for x in ds.ImageOrientationPatient]
        n = _normal_from_iop(iop)
        if n is None:
            return float(ipp[2])  # fallback: eje Z del paciente
        return float(np.dot(np.array(ipp, dtype=float), n))
    except Exception:
        # fallbacks
        try:
            return float(ds.SliceLocation)
        except Exception:
            try:
                ipp = [float(x) for x in ds.get((0x0020, 0x0032)).value]
                return float(ipp[2])
            except Exception:
                return None


# --------------------------
#   Pipeline principal
# --------------------------
def dicom_segmentation(path_original, size=(256, 256), n_clases=3, enable_dbscan_filter=True, debug=False):
    """
    Segmenta un estudio DICOM, con:
      - Orden correcto de slices por posición física (IPP+IOP)
      - Δz robusto (mediana de las diferencias)
      - Logs por hilo
    """
    logger.info(f"Segmentation Models: usando `{os.environ.get('SM_FRAMEWORK')}` framework.")
    logger.info(f"[INPUT] path_original = {path_original}")

    SIZE_X, SIZE_Y = size

    # 1) Enumerar archivos (filtrar obvios no-DICOM)
    files = sorted(glob.glob(os.path.join(path_original, "*")))
    files = [f for f in files if os.path.isfile(f) and not f.lower().endswith((".zip", ".gz", ".rar"))]
    if debug:
        logger.info(f"[INFO] Archivos candidatos: {len(files)} en {path_original}")

    # --- Estado para tablero de hilos ---
    active = {}
    active_lock = threading.Lock()
    stop_reporter = threading.Event()

    def reporter():
        while not stop_reporter.is_set():
            with active_lock:
                items = list(active.items())
            if items:
                snapshot = ", ".join(f"{name}:{os.path.basename(fname)}" for name, fname in items)
                logger.info(f"[THREADS] activos={len(items)} -> {snapshot}")
            time.sleep(1.0)

    threading.Thread(target=reporter, daemon=True, name="Reporter").start()

    def process_dicom(idx, img_path):
        """Devuelve dict con metadatos para reordenar correctamente el stack."""
        tname = threading.current_thread().name
        base = os.path.basename(img_path)
        logger.info(f"start  -> {base}")
        with active_lock:
            active[tname] = img_path

        t0 = time.perf_counter()
        try:
            try:
                ds = pd.dcmread(img_path, force=True)
                if not hasattr(ds, "PixelData") or ds.get("PixelData") is None or ds.get("Rows") is None:
                    if debug: logger.info(f"skip   -> {base} sin PixelData/Rows")
                    return None
                img = ds.pixel_array
            except Exception as e:
                if debug: logger.info(f"error  -> {base}: {e}")
                return None

            # HU window + shift
            rescale_intercept = int(getattr(ds, "RescaleIntercept", 0))
            img = img + rescale_intercept
            img = np.clip(img, -1000, 250)
            img = img + 1000
            img = img.astype(np.uint16)

            # Resize para el modelo
            img_resized = cv2.resize(img, [SIZE_X, SIZE_Y], interpolation=cv2.INTER_LINEAR)

            # claves para ORDENAR
            zpos = _zpos_from_ipp_iop(ds)
            try:
                inst = int(getattr(ds, "InstanceNumber", None) or 0)
            except Exception:
                inst = 0

            return {
                "idx_in": idx,
                "path": img_path,
                "ds": ds,
                "img_resized": img_resized,
                "orig_shape": img.shape,  # (rows, cols)
                "zpos": zpos,
                "instance": inst,
                "name": base,
            }
        finally:
            with active_lock:
                active.pop(tname, None)
            dt = time.perf_counter() - t0
            logger.info(f"finish -> {base} ({dt:0.3f}s)")

    # 2) Carga concurrente
    results = []
    loader_prog = ProgressReporter("[LOAD DICOMs]", len(files))
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, os.cpu_count() or 4), thread_name_prefix="DICOM") as ex:
        futs = [ex.submit(process_dicom, i, f) for i, f in enumerate(files)]
        for fut in concurrent.futures.as_completed(futs):
            r = fut.result()
            if r is not None:
                results.append(r)
            loader_prog.tick(1)
    loader_prog.done_line()
    stop_reporter.set()

    if not results:
        raise ValueError(f"No se encontraron imágenes DICOM utilizables en: {path_original}")

    # 3) ORDEN por zpos (robusto). Fallback: instance, luego nombre.
    def _sort_key(r):
        z = r["zpos"]
        inst = r["instance"]
        name = r["name"]
        return (
            0 if (z is not None and isfinite(z)) else 1,
            z if (z is not None and isfinite(z)) else float("inf"),
            inst,
            name,
        )
    results.sort(key=_sort_key)

    # Sanity check de orientación
    z_sorted = [r["zpos"] for r in results if r["zpos"] is not None and isfinite(r["zpos"])]
    inst_sorted = [r["instance"] for r in results if r["instance"] is not None]

    def _median_sign(diff_list):
        if len(diff_list) < 1: return 0
        med = float(np.median(diff_list))
        if med > 0: return 1
        if med < 0: return -1
        return 0

    sign_z   = _median_sign(np.diff(z_sorted))    if len(z_sorted)  >= 2 else 0
    sign_ins = _median_sign(np.diff(inst_sorted)) if len(inst_sorted)>= 2 else 0

    if sign_z != 0 and sign_ins != 0 and sign_z != sign_ins:
        logger.info("[ORIENT] zpos y InstanceNumber avanzan en sentidos opuestos → invirtiendo stack")
        results.reverse()
    elif sign_z == 0 and sign_ins < 0:
        logger.info("[ORIENT] InstanceNumber decreciente y zpos sin señal → invirtiendo stack")
        results.reverse()

    # 4) Construir arrays ordenados
    arr_original = np.stack([r["img_resized"] for r in results]).astype(np.uint16)  # (N,SIZE_Y,SIZE_X)
    ds_valids    = [r["ds"] for r in results]
    valid_paths  = [r["path"] for r in results]
    # tamaño original del PRIMER slice ORDENADO
    first_shape = results[0]["orig_shape"]
    img_size = (int(first_shape[0]), int(first_shape[1]))  # (rows, cols)

    # 5) PixelSpacing y escalas (de original a SIZE)
    ds_ref = ds_valids[0]
    original_pixel_spacing = getattr(ds_ref, "PixelSpacing", [1.0, 1.0])
    # PixelSpacing = [row_spacing, col_spacing] -> [mm/px en y, mm/px en x]
    pixel_relation = float(img_size[0]) / float(SIZE_Y)
    pixelen_y = float(original_pixel_spacing[0]) * pixel_relation
    pixelen_x = float(original_pixel_spacing[1]) * pixel_relation
    pixelarea = pixelen_x * pixelen_y

    # 6) Δz ROBUSTO
    z_series = [r["zpos"] for r in results if r["zpos"] is not None and isfinite(r["zpos"])]
    spacing_between_slices = None
    if len(z_series) >= 2:
        diffs = np.diff(z_series)
        diffs = np.abs(diffs[np.isfinite(diffs)])
        if diffs.size > 0:
            spacing_between_slices = float(np.median(diffs))
    if not (isfinite(spacing_between_slices) and spacing_between_slices > 0):
        spacing_between_slices = _safe_getattr(ds_ref, "SpacingBetweenSlices", default=None, cast=float)
        if spacing_between_slices is None:
            spacing_between_slices = _safe_getattr(ds_ref, "SliceThickness", default=1.0, cast=float)
        spacing_between_slices = abs(float(spacing_between_slices))

    if debug:
        logger.info("\n========== [INFO] Parámetros de cálculo de volumen ==========")
        logger.info(f"Resolución original DICOM: {img_size} (rows, cols)")
        logger.info(f"Resolución usada para modelo: {SIZE_X} x {SIZE_Y}")
        logger.info(f"PixelSpacing original (mm): {original_pixel_spacing}")
        logger.info(f"Factor de escalado (rows): {pixel_relation:.4f}")
        logger.info(f"pixelen_x (mm/px): {pixelen_x:.4f} · pixelen_y (mm/px): {pixelen_y:.4f}")
        logger.info(f"Área por píxel (mm²): {pixelarea:.4f}")
        logger.info(f"Espacio entre cortes (Δz, mm): {spacing_between_slices:.4f}")
        logger.info("==============================================================\n")

    # 7) Predicción
    arr_color = np.array([cv2.cvtColor(img, cv2.COLOR_GRAY2BGR) for img in arr_original])
    mask_pred = test_U_net_estimation(arr_color, n_clases)  # (N, SIZE_Y, SIZE_X)

    # 8) Contornos
    study_all_contours_lung = []
    study_all_contours_fibrosis = []
    contours_prog = ProgressReporter("[CONTOURS]", len(mask_pred))
    for each_mask in mask_pred:
        mask_lung = np.where((each_mask == 1) | (each_mask == 2), 1, 0).astype(np.uint8)
        mask_fibrosis = np.where(each_mask == 2, 1, 0).astype(np.uint8)
        cnts_lung, _ = cv2.findContours(mask_lung, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        cnts_fib,  _ = cv2.findContours(mask_fibrosis, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)

        def cnt_to_xylist(cnt):
            if cnt is None or len(cnt) == 0: return []
            return cnt.reshape(-1, 2)

        study_all_contours_lung.append([cnt_to_xylist(c) for c in cnts_lung])
        study_all_contours_fibrosis.append([cnt_to_xylist(c) for c in cnts_fib])
        contours_prog.tick(1)
    contours_prog.done_line()

    # 9) (Opcional) DBSCAN
    most_common_label = None
    labels = None
    if enable_dbscan_filter:
        data2cluster = data2numpyarr(study_all_contours_lung, spacing_between_slices)
        eps_est = _estimate_eps_with_knee(data2cluster, min_samples=4)
        db = DBSCAN(eps=eps_est, min_samples=4).fit(data2cluster)
        labels = db.labels_
        values, counts = np.unique(labels, return_counts=True)
        keep = [(v, c) for v, c in zip(values, counts) if v != -1]
        most_common_label = max(keep, key=lambda t: t[1])[0] if keep else -1
        if debug:
            logger.info(f"[DBSCAN] eps≈{eps_est:.3f} | labels únicos={list(values)} | label más común={most_common_label}")

    # 10) Construcción máscaras + JSON
    output_dir = os.path.join(path_original, "segmentaciones_por_dicom")
    try:
        os.makedirs(output_dir, exist_ok=True)
        # Sanity write
        with open(os.path.join(output_dir, "sanity.txt"), "w", encoding="utf-8") as f:
            f.write("hello from segmentation\n")
        logger.info("[IO] sanity.txt escrito en %s", output_dir)
    except Exception as e:
        logger.error(f"[IO] No se pudo preparar output_dir {output_dir}: {e}")
        raise

    filtered_masks = []
    lung_pixels_pred = []
    fibrosis_pixels_pred = []

    scale_x = float(img_size[1]) / float(SIZE_X)
    scale_y = float(img_size[0]) / float(SIZE_Y)
    global_point_index = 0

    build_prog = ProgressReporter("[BUILD SLICES]", len(study_all_contours_lung))
    for idx, (cnts_lung_xy, cnts_fib_xy) in enumerate(zip(study_all_contours_lung, study_all_contours_fibrosis)):
        # Filtrado por DBSCAN (opcional)
        filtered_lung_cnts = []
        if enable_dbscan_filter and labels is not None and most_common_label is not None:
            for c in cnts_lung_xy:
                if c is None or len(c) == 0: continue
                npts = len(c)
                lab = labels[global_point_index] if global_point_index < len(labels) else -1
                global_point_index += npts
                if lab == most_common_label:
                    filtered_lung_cnts.append(c)
        else:
            filtered_lung_cnts = [c for c in cnts_lung_xy if c is not None and len(c) > 0]
            if labels is not None:
                for c in cnts_lung_xy:
                    global_point_index += len(c) if c is not None else 0

        m_lung = np.zeros((SIZE_Y, SIZE_X), dtype=np.uint8)
        for c in filtered_lung_cnts:
            cv2.fillPoly(m_lung, [c.astype(np.int32)], 1)

        m_fib = np.zeros((SIZE_Y, SIZE_X), dtype=np.uint8)
        for c in cnts_fib_xy:
            if c is not None and len(c) > 0:
                cv2.fillPoly(m_fib, [c.astype(np.int32)], 1)

        m = np.where(m_fib >= 1, 2, np.where(m_lung >= 1, 1, 0)).astype(np.uint8)
        filtered_masks.append(m)

        lung_json = _scale_contours_to_original(filtered_lung_cnts, scale_x, scale_y)
        fib_json  = _scale_contours_to_original([c for c in cnts_fib_xy if c is not None and len(c) > 0], scale_x, scale_y)

        lung_json_s = _simplify_contours(filtered_lung_cnts, tolerance=2.0, scale_x=scale_x, scale_y=scale_y)
        fib_json_s  = _simplify_contours([c for c in cnts_fib_xy if c is not None and len(c) > 0], tolerance=2.0, scale_x=scale_x, scale_y=scale_y)

        try:
            with open(os.path.join(output_dir, f"mask_{idx:03d}.json"), "w", encoding="utf-8") as f:
                json.dump({"lung": lung_json, "fibrosis": fib_json}, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"[IO] No se pudo escribir mask_{idx:03d}.json: {e}")

        try:
            json_str = json.dumps({"lung_editable": lung_json_s, "fibrosis_editable": fib_json_s}, indent=2, ensure_ascii=False)
            json.loads(json_str)  # sanity
            with open(os.path.join(output_dir, f"mask_{idx:03d}_simplified.json"), "w", encoding="utf-8") as f:
                f.write(json_str)
        except Exception as e:
            if debug: logger.info(f"[WARN] No se pudo guardar mask_{idx:03d}_simplified.json: {e}")

        lung_pixels_pred.append(int(np.sum(m == 1)))
        fibrosis_pixels_pred.append(int(np.sum(m == 2)))

        build_prog.tick(1)
    build_prog.done_line()

    filtered_masks = np.array(filtered_masks, dtype=np.uint16)

    # 11) Volúmenes (ml)
    lung_area_pred     = np.array(lung_pixels_pred, dtype=float)     * float(pixelarea)
    fibrosis_area_pred = np.array(fibrosis_pixels_pred, dtype=float) * float(pixelarea)

    lung_volume_ml     = float(np.sum(lung_area_pred)     * spacing_between_slices / 1000.0)
    fibrosis_volume_ml = float(np.sum(fibrosis_area_pred) * spacing_between_slices / 1000.0)
    total_volume_ml    = lung_volume_ml + fibrosis_volume_ml

    volumen_data = {
        "lung_volume_ml": round(abs(lung_volume_ml), 2),
        "fibrosis_volume_ml": round(abs(fibrosis_volume_ml), 2),
        "total_volume_ml": round(abs(total_volume_ml), 2),
    }

    try:
        with open(os.path.join(output_dir, "volumenes.json"), "w", encoding="utf-8") as f:
            json.dump(volumen_data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"[IO] No se pudo escribir volumenes.json: {e}")

    # 12) Guardar TIFFs (try/except por posibles locks en Windows)
    try:
        imwrite(
            os.path.join(output_dir, "ct_original.tif"),
            arr_original,
            imagej=True,
            resolution=(1 / pixelarea, 1 / pixelarea),
            metadata={"spacing": spacing_between_slices, "unit": "mm", "axes": "ZYX"},
        )
    except Exception as e:
        logger.info(f"[TIFF] No se pudo escribir ct_original.tif: {e}")

    try:
        imwrite(
            os.path.join(output_dir, "mascaras_pred.tif"),
            filtered_masks,
            imagej=True,
            resolution=(1 / pixelarea, 1 / pixelarea),
            metadata={"spacing": spacing_between_slices, "unit": "mm", "axes": "ZYX"},
        )
    except Exception as e:
        logger.info(f"[TIFF] No se pudo escribir mascaras_pred.tif: {e}")

    # 13) Índices válidos -> archivo para debug/frontend
    valid_index_map = {i: os.path.basename(path) for i, path in enumerate(valid_paths)}
    try:
        with open(os.path.join(output_dir, "valid_indices.json"), "w", encoding="utf-8") as f:
            json.dump(valid_index_map, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.info(f"[IO] No se pudo escribir valid_indices.json: {e}")

    if debug:
        logger.info(f"[OK] Salidas en: {output_dir}")

    # === DEBUG: confirmar escrituras ===
    try:
        out_files = os.listdir(output_dir)
        mask_count = len([f for f in out_files if f.startswith('mask_') and f.endswith('.json')])
        print(f"[PY] output_dir: {output_dir}")
        print(f"[PY] mask json count: {mask_count}")
        print(f"[PY] volumenes.json exists: {os.path.exists(os.path.join(output_dir, 'volumenes.json'))}")
        if mask_count > 0:
            print("[PY] sample masks:", [f for f in out_files if f.startswith('mask_')][:5])
    except Exception as e:
        print("[PY] error listando output_dir:", e)

    return {
        "output_dir": output_dir,
        "n_slices": int(arr_original.shape[0]),
        "volumes_ml": volumen_data,
        "valid_indices": valid_index_map,
    }


# =========================
#  CLI: para llamarlo desde Node
# =========================
if __name__ == "__main__":
    parser = ArgumentParser(description="Segmentación DICOM")
    parser.add_argument("path_original", type=str, help="Carpeta con DICOMs (temporal)")
    parser.add_argument("--size", type=str, default="256,256", help="Tamaño WxH para el modelo, p.ej. 256,256")
    parser.add_argument("--classes", type=int, default=3, help="Número de clases en el modelo")
    parser.add_argument("--no-dbscan", action="store_true", help="Desactivar filtrado DBSCAN")
    parser.add_argument("--debug", action="store_true", help="Logs de depuración")
    args = parser.parse_args()

    try:
        w, h = [int(x) for x in args.size.split(",")]
    except Exception:
        w, h = 256, 256

    path_original = args.path_original
    debug = bool(args.debug)

    logger.info(f"[PY] __file__ = {os.path.abspath(__file__)}")
    logger.info(f"[PY] cwd      = {os.getcwd()}")

    if not os.path.isdir(path_original):
        logger.error("[FATAL] path_original no es un directorio: %s", path_original)
        sys.exit(2)

    try:
        result = dicom_segmentation(
            path_original=path_original,
            size=(w, h),
            n_clases=args.classes,
            enable_dbscan_filter=not args.no_dbscan,
            debug=debug
        )
        # Imprime un pequeño resumen JSON por stdout (opcional)
        print(json.dumps({"ok": True, "output_dir": result["output_dir"], "n_slices": result["n_slices"]}))
        sys.exit(0)
    except Exception as e:
        logger.exception("[FATAL] Error en dicom_segmentation: %s", e)
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
