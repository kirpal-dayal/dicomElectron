// src/components/volumenCalculator.js

// Defaults conservadores solo si el DICOM no trae metadatos
const DEFAULT_PIXEL_SPACING = { row: 1, col: 1 }; // mm/pixel
const DEFAULT_SLICE_SPACING = 1;                  // mm

/**
 * Lee PixelSpacing y un espaciado Z real a partir de metadatos DICOM.
 * Prioriza:
 *  - (0028,0030) PixelSpacing  -> [row, col] mm/pixel
 *  - (0018,0088) SpacingBetweenSlices (si existe)
 *  - ΔZ con ImagePositionPatient entre cortes adyacentes (si se pasa prev/next)
 *  - (0018,0050) SliceThickness como último recursos
 *
 * @param {Object} image   Cornerstone image object
 * @param {Object} [opts]  { prevImage, nextImage } para estimar ΔZ robusto
 * @returns {{pixelSpacing:{row:number,col:number}, sliceSpacing:number}}
 */
export function extractSpacingFromImage(image, opts = {}) {
  // --- PixelSpacing (0028,0030): "row\col"
  let row = Number(image.rowPixelSpacing);
  let col = Number(image.columnPixelSpacing);

  if (!row || !col) {
    const pxStr = safeTagStr(image, 'x00280030');
    if (pxStr) {
      const parts = pxStr.split('\\').map(Number);
      row = Number(parts[0]);
      col = Number(parts[1]);
    }
  }
  if (!row || row <= 0) row = DEFAULT_PIXEL_SPACING.row;
  if (!col || col <= 0) col = DEFAULT_PIXEL_SPACING.col;

  // --- SpacingBetweenSlices (0018,0088)
  let sliceSpacing = safeTagNum(image, 'x00180088');

  // --- Si no hay (0018,0088), intenta ΔZ con IPP (0020,0032)
  if (!sliceSpacing && (opts.prevImage || opts.nextImage)) {
    const zPrev = zFromIPP(opts.prevImage);
    const zCurr = zFromIPP(image);
    const zNext = zFromIPP(opts.nextImage);

    const dzs = [];
    if (zPrev != null && zCurr != null) dzs.push(Math.abs(zCurr - zPrev));
    if (zNext != null && zCurr != null) dzs.push(Math.abs(zNext - zCurr));
    dzs.sort((a, b) => a - b);
    if (dzs.length) sliceSpacing = dzs[Math.floor(dzs.length / 2)];
  }

  // --- Último recurso: SliceThickness (0018,0050)
  if (!sliceSpacing) {
    sliceSpacing = safeTagNum(image, 'x00180050');
  }

  if (!sliceSpacing || sliceSpacing <= 0) {
    console.warn(
      '[volumenCalculator] WARNING: no se pudo determinar sliceSpacing; usando default =',
      DEFAULT_SLICE_SPACING, 'mm'
    );
    sliceSpacing = DEFAULT_SLICE_SPACING;
  }

  const pixelSpacing = { row: Number(row), col: Number(col) };
  sliceSpacing = Math.abs(Number(sliceSpacing));

  // Logs útiles de depuración
  try {
    console.info('========== [INFO] Parámetros de cálculo de volumen ==========');
    console.info('PixelSpacing (mm/pixel):', pixelSpacing);
    console.info(
      'Área por píxel (mm²):',
      (pixelSpacing.row * pixelSpacing.col).toFixed(4)
    );
    console.info('Espacio entre cortes (mm):', sliceSpacing);
    console.info('==============================================================');
  } catch {}

  return { pixelSpacing, sliceSpacing };
}

// Helpers de lectura de tags
function safeTagStr(image, tag) {
  try { return image?.data?.string?.(tag) || null; } catch { return null; }
}
function safeTagNum(image, tag) {
  const s = safeTagStr(image, tag);
  if (!s) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
function zFromIPP(image) {
  try {
    const ipp = image?.data?.string?.('x00200032'); // "x\y\z"
    if (!ipp) return null;
    const parts = ipp.split('\\').map(Number);
    const z = Number(parts[2]);
    return Number.isFinite(z) ? z : null;
  } catch { return null; }
}

/**
 * Área de un polígono en mm² mediante fórmula del “shoelace”.
 * @param {Array<{x:number,y:number}>} points  Coordenadas en píxeles de la imagen
 * @param {{row:number,col:number}} pixelSpacing  mm/pixel
 */
export function calculatePolygonAreaMm(points, pixelSpacing) {
  if (!points || points.length < 3) return 0;
  let areaPx = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const xi = Number(points[i].x) || 0;
    const yi = Number(points[i].y) || 0;
    const xj = Number(points[j].x) || 0;
    const yj = Number(points[j].y) || 0;
    areaPx += xi * yj - xj * yi;
  }
  areaPx = Math.abs(areaPx / 2);
  return areaPx * (Number(pixelSpacing.row) || 1) * (Number(pixelSpacing.col) || 1);
}

/**
 * Suma el área (mm²) de uno o varios polígonos (acepta multi-contour).
 */
export function calcularAreaTotal(polygons, pixelSpacing) {
  if (!polygons) return 0;
  const list = Array.isArray(polygons[0]) ? polygons : [polygons];
  let total = 0;
  for (const poly of list) {
    if (!poly || poly.length < 3) continue;
    total += calculatePolygonAreaMm(poly, pixelSpacing) || 0;
  }
  return total;
}

/**
 * Calcula volúmenes (mL) en un slice usando metadatos de la imagen.
 */
export function calcularVolumenEditableDesdeImage(image, layers, opts = {}) {
  const { pixelSpacing, sliceSpacing } = extractSpacingFromImage(image, opts);
  return calcularVolumenEditable(layers, pixelSpacing, sliceSpacing);
}

/**
 * Calcula volúmenes (mL) de pulmón y fibrosis para un slice dado.
 */
export function calcularVolumenEditable(layers, pixelSpacing, sliceSpacing) {
  if (!layers || !pixelSpacing || !sliceSpacing) return null;

  const editableLung = layers.find(l => l?.editable && /Pulmón/i.test(l.name));
  const editableFib  = layers.find(l => l?.editable && /Fibrosis/i.test(l.name));

  const lungAreaMM2 = editableLung ? calcularAreaTotal(editableLung.points, pixelSpacing) : 0;
  const fibAreaMM2  = editableFib  ? calcularAreaTotal(editableFib.points,  pixelSpacing) : 0;

  const lungMM3 = lungAreaMM2 * Number(sliceSpacing);
  const fibMM3  = fibAreaMM2  * Number(sliceSpacing);

  const lungML = +(lungMM3 / 1000).toFixed(2);
  const fibML  = +(fibMM3  / 1000).toFixed(2);

  return {
    editableLungVolume: lungML,
    editableFibrosisVolume: fibML,
    editableTotalVolume: +(lungML + fibML).toFixed(2),
    pixelSpacing,
    sliceSpacing
  };
}

/**
 * Suma volúmenes (mL) a través de múltiples cortes.
 * `layersPorSlice` es un array donde cada item es el arreglo de capas de ese slice.
 */
export function calcularVolumenEditableGlobal(layersPorSlice, pixelSpacing, sliceSpacing) {
  if (!layersPorSlice || !pixelSpacing || !sliceSpacing) return null;

  let lungMM3 = 0;
  let fibMM3  = 0;

  for (const layers of layersPorSlice) {
    if (!layers || !Array.isArray(layers)) continue;

    const editableLung = layers.find(l => l?.editable && /Pulmón/i.test(l.name));
    const editableFib  = layers.find(l => l?.editable && /Fibrosis/i.test(l.name));

    const lungAreaMM2 = editableLung ? calcularAreaTotal(editableLung.points, pixelSpacing) : 0;
    const fibAreaMM2  = editableFib  ? calcularAreaTotal(editableFib.points,  pixelSpacing) : 0;

    lungMM3 += lungAreaMM2 * Number(sliceSpacing);
    fibMM3  += fibAreaMM2  * Number(sliceSpacing);
  }

  const lungML = +(lungMM3 / 1000).toFixed(2);
  const fibML  = +(fibMM3  / 1000).toFixed(2);

  return {
    editableLungVolume: lungML,
    editableFibrosisVolume: fibML,
    editableTotalVolume: +(lungML + fibML).toFixed(2),
    pixelSpacing,
    sliceSpacing
  };
}

/**
 * Envía (crea/actualiza) un estudio en BD con los volúmenes.
 * En backend debe existir un UPSERT:
 *   INSERT ... ON DUPLICATE KEY UPDATE ...
 *
 * @param {string} nss        NSS del expediente
 * @param {string} fechaSQL   'YYYY-MM-DD HH:mm:ss' del estudio (PK junto con NSS)
 * @param {{editableTotalVolume:number}} volumenData
 * @param {string|null} descripcion
 * @param {boolean} manual    true -> guarda en volumen_manual; false -> volumen_automatico
 */
// volumenCalculator.js  (reemplaza la función completa)

// volumenCalculator.js
export async function enviarVolumenABackend(
  nss,
  fechaSQL,
  volumenData,        // puede ser número o un objeto con editableTotalVolume o total_volume_ml
  manual = false
) {
  if (!nss) throw new Error("enviarVolumenABackend: falta NSS");
  if (!fechaSQL) throw new Error("enviarVolumenABackend: falta fechaSQL");
  if (volumenData == null) throw new Error("enviarVolumenABackend: falta volumenData");

  const total =
    (typeof volumenData === "number" ? volumenData : undefined) ??
    Number(volumenData?.editableTotalVolume) ??
    Number(volumenData?.total_volume_ml);

  if (!Number.isFinite(total)) {
    throw new Error("enviarVolumenABackend: total de volumen inválido");
  }

  const url = `/api/${encodeURIComponent(nss)}/studies`;

  const body = {
    fecha: fechaSQL,
    descripcion,
    volumen_automatico: manual ? null : total,
    volumen_manual: manual ? total : null,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`enviarVolumenABackend: ${text || res.statusText}`);
  }
}



