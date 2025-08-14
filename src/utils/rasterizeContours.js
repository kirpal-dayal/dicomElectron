/**
 * El archivo rasterizeContours.js contiene la función createVolumeFromContours, que convierte un conjunto de contornos (polígonos) en un volumen 3D binario (una máscara volumétrica).

¿Cómo funciona?
Parámetros de entrada:

contourLayers: Un array donde cada elemento representa una capa (slice) y contiene uno o más contornos (cada contorno es un array de puntos {x, y}).
width, height: Dimensiones de cada capa (por defecto 512x512).
Inicialización:

Calcula la profundidad (depth) como el número de capas.
Crea un array volume de tipo Uint8Array con tamaño width * height * depth, inicializado en ceros.
Función isInside(x, y, poly):

Determina si el punto (x, y) está dentro del polígono poly usando el algoritmo de ray casting.
Rasterización:

Para cada capa z:
Para cada contorno en esa capa:
Convierte el contorno a un array de coordenadas [x, y].
Para cada píxel (x, y) de la capa:
Si el píxel está dentro del polígono, marca el valor correspondiente en el volumen como 255 (blanco).
Retorno:

Devuelve el array volume, que representa el volumen 3D donde los voxeles dentro de los contornos valen 255 y el resto 0.
En resumen:
Convierte una lista de contornos 2D por capa en un volumen 3D binario (Uint8Array), donde los voxeles dentro de los contornos están activados (255). Esto es útil para crear máscaras volumétricas a partir de segmentaciones por contornos.
 */

export function createVolumeFromContours(contourLayers, width = 512, height = 512) {
  const depth = contourLayers.length;
  const volume = new Uint8Array(width * height * depth).fill(0);

  function isInside(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi + 1e-10) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  for (let z = 0; z < depth; z++) {
    const contours = contourLayers[z];
    contours.forEach(contour => {
      const poly = contour.map(({ x, y }) => [x, y]);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (isInside(x, y, poly)) {
            const idx = z * width * height + y * width + x;
            volume[idx] = 255;
          }
        }
      }
    });
  }

  return volume;
}
