// src/components/volumenCalculator.js

// Defaults conservadores solo si el DICOM no trae metadatos
const DEFAULT_PIXEL_SPACING = { row: 1, col: 1 }; // mm/pixel
const DEFAULT_SLICE_SPACING = 1;                  // mm

// =======================
// Lectura de tags helpers
// =======================
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

// ===============================================
// Spacing "rápido" (para 1 slice) – mantiene API
// ===============================================
/**
 * Lee PixelSpacing y un espaciado Z a partir de metadatos del propio slice.
 * Mantiene tu API actual para cálculos por-imagen.
 */
export function extractSpacingFromImage(image, opts = {}) {
  // --- PixelSpacing (0028,0030): "row\col"
  let row = Number(image?.rowPixelSpacing);
  let col = Number(image?.columnPixelSpacing);

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

  // --- Si no hay (0018,0088), intenta ΔZ vecino (no proyectado)
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
    console.info('Área por píxel (mm²):', (pixelSpacing.row * pixelSpacing.col).toFixed(4));
    console.info('Espacio entre cortes (mm):', sliceSpacing);
    console.info('==============================================================');
  } catch {}

  return { pixelSpacing, sliceSpacing };
}

// =========================================
// Cálculo de área (shoelace) y agregadores
// =========================================
/**
 * Área de un polígono en mm² mediante fórmula del “shoelace”.
 * @param {Array<{x:number,y:number}>} points  Coordenadas en píxeles (ORIGINALES)
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

/** Suma el área (mm²) de uno o varios polígonos (acepta multi-contour). */
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

/** Calcula volúmenes (mL) en un slice usando metadatos de la imagen. */
export function calcularVolumenEditableDesdeImage(image, layers, opts = {}) {
  const { pixelSpacing, sliceSpacing } = extractSpacingFromImage(image, opts);
  return calcularVolumenEditable(layers, pixelSpacing, sliceSpacing);
}

/** Calcula volúmenes (mL) de pulmón y fibrosis para un slice dado. */
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
 * Suma volúmenes (mL) a través de múltiples cortes, dado un spacing ya calculado.
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

// ==========================================================
// Spacing "backend-like": IOP→normal + proyección de IPP +
// mediana(|Δz|) con orden por índice backend (ui2backend).
// ==========================================================
function parseIOP(str) {
  if (!str) return null; // "r1\r2\r3\c1\c2\c3"
  const v = str.split('\\').map(Number);
  if (v.length !== 6 || v.some(x => !Number.isFinite(x))) return null;
  return v;
}
function normalFromIOP(iop) {
  // iop: [r1,r2,r3,c1,c2,c3]
  const r = [iop[0], iop[1], iop[2]];
  const c = [iop[3], iop[4], iop[5]];
  const n = [
    r[1]*c[2]-r[2]*c[1],
    r[2]*c[0]-r[0]*c[2],
    r[0]*c[1]-r[1]*c[0],
  ];
  const norm = Math.hypot(n[0], n[1], n[2]);
  if (!norm) return null;
  return [n[0]/norm, n[1]/norm, n[2]/norm];
}
function projOnNormal(ippStr, n) {
  if (!ippStr || !n) return null; // ipp: "x\y\z"
  const p = ippStr.split('\\').map(Number);
  if (p.length !== 3 || p.some(x => !Number.isFinite(x))) return null;
  return p[0]*n[0] + p[1]*n[1] + p[2]*n[2];
}
function readPixelSpacing(image) {
  try {
    const row = Number(image?.rowPixelSpacing);
    const col = Number(image?.columnPixelSpacing);
    if (row && col) return { row, col };
    const s = image?.data?.string?.('x00280030'); // "row\col"
    if (!s) return null;
    const parts = s.split('\\').map(Number);
    if (parts.length === 2 && parts.every(Number.isFinite)) {
      return { row: parts[0], col: parts[1] };
    }
  } catch {}
  return null;
}
function trySimpleDz(images) {
  const zs = [];
  for (const im of images) {
    const ipp = safeTagStr(im, 'x00200032');
    if (!ipp) continue;
    const parts = ipp.split('\\').map(Number);
    const z = Number(parts?.[2]);
    if (Number.isFinite(z)) zs.push(z);
  }
  if (!zs.length) return null;
  zs.sort((a, b) => a - b);
  const diffs = [];
  for (let i = 1; i < zs.length; i++) {
    const d = Math.abs(zs[i] - zs[i-1]);
    if (Number.isFinite(d) && d > 0) diffs.push(d);
  }
  if (!diffs.length) return null;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

/**
 * Carga imágenes Cornerstone y calcula spacing robusto como el backend:
 *  - PixelSpacing: (0028,0030)
 *  - Δz: proyección de IPP sobre la normal de IOP, mediana(|Δz|)
 *  - Ordena por índice de backend (ui2backend[ui] o ui)
 *  - Fallbacks: (0018,0088), (0018,0050) y Δz simple por IPP.z
 *
 * @param {string[]} dicomList  URLs cornerstone (wadouri:...)
 * @param {Object} [ui2backend] Mapa { uiIndex -> backendIndex }
 * @returns {Promise<{pixelSpacing:{row:number,col:number}, sliceSpacing:number}>}
 */
export async function getRobustStackSpacing(dicomList, ui2backend = null) {
  const cornerstone = (await import('cornerstone-core')).default;

  // 1) Cargar imágenes (o usa cache de Cornerstone)
  const images = await Promise.all(
    dicomList.map(async (url) => {
      try { return await cornerstone.loadAndCacheImage(url); }
      catch { return null; }
    })
  );

  // 2) IOP representativo
  let iop = null, firstValid = null;
  for (const im of images) {
    if (!im) continue;
    firstValid = firstValid || im;
    const sIOP = safeTagStr(im, 'x00200037');
    iop = parseIOP(sIOP);
    if (iop) break;
  }

  // PixelSpacing consenso
  let px = readPixelSpacing(firstValid) || DEFAULT_PIXEL_SPACING;

  // Si no hay IOP, usa fallbacks para Δz y devuelve
  if (!iop) {
    // intenta SpacingBetweenSlices o SliceThickness
    let dz = null;
    for (const im of images) {
      if (!im) continue;
      const sbs = safeTagNum(im, 'x00180088');
      const thk = safeTagNum(im, 'x00180050');
      dz = Number(sbs ?? thk);
      if (Number.isFinite(dz) && dz > 0) { dz = Math.abs(dz); break; }
    }
    if (!Number.isFinite(dz) || dz <= 0) {
      dz = trySimpleDz(images) ?? DEFAULT_SLICE_SPACING;
    }
    return { pixelSpacing: px, sliceSpacing: dz };
  }

  const n = normalFromIOP(iop);
  const pairs = [];

  // 3) Construye pares (backendIndex, z_proyectado) y refina PixelSpacing
  for (let ui = 0; ui < images.length; ui++) {
    const im = images[ui];
    if (!im) continue;

    const ps = readPixelSpacing(im);
    if (ps?.row && ps?.col) px = ps; // consenso más reciente

    const ippStr = safeTagStr(im, 'x00200032');
    const z = projOnNormal(ippStr, n);
    if (z == null) continue;

    const be = ui2backend?.[ui] ?? ui;
    pairs.push([Number(be), z]);
  }

  // 4) Mediana de |Δz| en orden backend
  let sliceSpacing = null;
  if (pairs.length >= 2) {
    pairs.sort((a, b) => a[0] - b[0]); // por backendIndex
    const zs = pairs.map(([, z]) => z);
    const diffs = [];
    for (let i = 1; i < zs.length; i++) {
      const d = Math.abs(zs[i] - zs[i-1]);
      if (Number.isFinite(d) && d > 0) diffs.push(d);
    }
    if (diffs.length) {
      diffs.sort((a, b) => a - b);
      sliceSpacing = diffs[Math.floor(diffs.length / 2)];
    }
  }

  // Fallbacks si falla la proyección/orden
  if (!Number.isFinite(sliceSpacing) || sliceSpacing <= 0) {
    for (const im of images) {
      if (!im) continue;
      const sbs = safeTagNum(im, 'x00180088');
      const thk = safeTagNum(im, 'x00180050');
      const dz = Number(sbs ?? thk);
      if (Number.isFinite(dz) && dz > 0) { sliceSpacing = Math.abs(dz); break; }
    }
  }
  if (!Number.isFinite(sliceSpacing) || sliceSpacing <= 0) {
    sliceSpacing = trySimpleDz(images) ?? DEFAULT_SLICE_SPACING;
  }

  return { pixelSpacing: px, sliceSpacing };
}

/**
 * Calcula el volumen global “consistente con backend”:
 *   - Obtiene spacing robusto (IOP/IPP/mediana) usando dicomList + ui2backend
 *   - Suma áreas en mm² por slice (capas editables) * Δz y convierte a mL.
 *
 * @param {string[]} dicomList
 * @param {Object} ui2backend   Mapa { uiIndex -> backendIndex }
 * @param {Array<Array>} layersPorSlice
 * @returns {Promise<{editableLungVolume:number, editableFibrosisVolume:number, editableTotalVolume:number, pixelSpacing, sliceSpacing}>}
 */
export async function calcularVolumenEditableGlobalConsistente(
  dicomList,
  ui2backend,
  layersPorSlice
) {
  const robust = await getRobustStackSpacing(dicomList, ui2backend);
  const px = robust?.pixelSpacing ?? DEFAULT_PIXEL_SPACING;
  const dz = robust?.sliceSpacing ?? DEFAULT_SLICE_SPACING;
  return calcularVolumenEditableGlobal(layersPorSlice, px, dz);
}

// =============================================
// Envío de volúmenes al backend (sin cambios)
// =============================================
export async function enviarVolumenABackend(
  nss,
  fechaSQL,
  volumenData,        // puede ser número o un objeto con editableTotalVolume o total_volume_ml
  descripcion = null,
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
