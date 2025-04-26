import pydicom
import matplotlib.pyplot as plt
import numpy as np
import sys
import os

def convert_to_jpg(dcm_path, output_path):
    try:
        ds = pydicom.dcmread(dcm_path)
        pixel_array = ds.pixel_array.astype(np.float32)

        # Normalizar la imagen (opcional, mejora visual)
        if np.max(pixel_array) > 0:
            pixel_array -= np.min(pixel_array)
            pixel_array /= np.max(pixel_array)

        # Guardar la imagen como JPG
        plt.imshow(pixel_array, cmap='gray')
        plt.axis('off')
        plt.savefig(output_path, bbox_inches='tight', pad_inches=0)
        print(f"[INFO] Imagen guardada en: {output_path}")

    except Exception as e:
        print(f"[ERROR] Falló la conversión del DICOM: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("[USO] python convertDicom.py <archivo.dcm> <salida.jpg>")
        sys.exit(1)

    dcm_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(dcm_path):
        print(f"[ERROR] El archivo no existe: {dcm_path}", file=sys.stderr)
        sys.exit(1)

    convert_to_jpg(dcm_path, output_path)
