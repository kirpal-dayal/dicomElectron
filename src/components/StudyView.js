/**
 * StudyView.js
 * Visor DICOM con edición de contornos y cálculo de volúmenes.
 */

import React, { useEffect, useRef, useState, useLayoutEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import * as cornerstone from "cornerstone-core";
import * as cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import * as dicomParser from "dicom-parser";

import {
  extractSpacingFromImage,
  calcularVolumenEditableGlobal,
  enviarVolumenABackend,
} from "./volumenCalculator";

// ---------- Cornerstone setup ----------
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({ beforeSend: () => {} });

// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (Array.isArray(v) ? (+v[0] || d) : (+v || d));
const THRESH = 6;
const isEditKey = (e) => e.ctrlKey || e.metaKey; //helper para ctrl en windows

/** Spacing robusto para todo el stack (row/col y delta entre cortes). */
async function getRobustStackSpacing(dicomList) {
  if (!dicomList || dicomList.length < 1) return null;

  const load = async (url) =>
    cornerstone.loadAndCacheImage(`wadouri:${window.location.origin}${url}`);

  const img0 = await load(dicomList[0]);

  // PixelSpacing
  let row = Number(img0.rowPixelSpacing);
  let col = Number(img0.columnPixelSpacing);
  if (!Number.isFinite(row) || !Number.isFinite(col)) {
    const pxStr = img0?.data?.string?.("x00280030");
    if (pxStr) {
      const parts = pxStr.split("\\").map(Number);
      if (!Number.isFinite(row) && Number.isFinite(parts[0])) row = parts[0];
      if (!Number.isFinite(col) && Number.isFinite(parts[1])) col = parts[1];
    }
  }
  if (!Number.isFinite(row)) row = 1;
  if (!Number.isFinite(col)) col = 1;

  // Slice spacing
  let slice = NaN;
  if (dicomList.length >= 2) {
    const img1 = await load(dicomList[1]);
    const parseVec3 = (s) => {
      if (!s) return null;
      const v = s.split("\\").map(Number);
      return v.length >= 3 && v.every(Number.isFinite) ? v.slice(0, 3) : null;
    };
    const parse6 = (s) => {
      if (!s) return null;
      const v = s.split("\\").map(Number);
      return v.length >= 6 && v.every(Number.isFinite) ? v.slice(0, 6) : null;
    };
    const ippA = parseVec3(img0?.data?.string?.("x00200032"));
    const ippB = parseVec3(img1?.data?.string?.("x00200032"));
    const iop =
      parse6(img0?.data?.string?.("x00200037")) ||
      parse6(img1?.data?.string?.("x00200037"));

    if (ippA && ippB && iop) {
      const rowCos = iop.slice(0, 3);
      const colCos = iop.slice(3, 6);
      const normal = [
        rowCos[1] * colCos[2] - rowCos[2] * colCos[1],
        rowCos[2] * colCos[0] - rowCos[0] * colCos[2],
        rowCos[0] * colCos[1] - rowCos[1] * colCos[0],
      ];
      const delta = [ippB[0] - ippA[0], ippB[1] - ippA[1], ippB[2] - ippA[2]];
      const dot = Math.abs(delta[0] * normal[0] + delta[1] * normal[1] + delta[2] * normal[2]);
      if (Number.isFinite(dot) && dot > 0) slice = dot;
    }

    if (!Number.isFinite(slice) || slice <= 0) {
      if (ippA && ippB) {
        const dz = Math.abs(ippB[2] - ippA[2]);
        if (Number.isFinite(dz) && dz > 0) slice = dz;
      }
    }
  }

  if (!Number.isFinite(slice) || slice <= 0) {
    const sbs = Number(img0?.data?.string?.("x00180088")); // SpacingBetweenSlices
    const thk = Number(img0?.data?.string?.("x00180050")); // SliceThickness
    slice = Number.isFinite(sbs) && sbs > 0 ? sbs :
            Number.isFinite(thk) && thk > 0 ? thk : 1;
  }

  return { pixelSpacing: { row, col }, sliceSpacing: Math.abs(slice) };
}

// ---------- Component ----------
export default function StudyView() {
  const { id: nss, studyNumber } = useParams();
  const fechaOriginal = decodeURIComponent(studyNumber);
  const fechaSQL = fechaOriginal.replace("T", " ").slice(0, 19);
  const safeFecha = fechaOriginal.replace(/[:\. ]/g, "_");
  const folder = `${nss}_${safeFecha}`;
  const navigate = useNavigate();

  const viewerRef = useRef(null);
  const overlayRef = useRef(null);

  // estado principal
  const [dicomList, setDicomList] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [allLayersPerSlice, setAllLayersPerSlice] = useState([]);
  const [layers, setLayers] = useState([]);
  const [selectedLayerIndex, setSelectedLayerIndex] = useState(0);

  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState(null);

  const [draggingIndex, setDraggingIndex] = useState(null);
  const draggingIndexRef = useRef(null);
  const [wasDragging, setWasDragging] = useState(false);

  const [dicomSpacing, setDicomSpacing] = useState({ row: 1, col: 1, slice: 1 });

  const [editableVolumen, setEditableVolumen] = useState(null);
  const [autoVol, setAutoVol] = useState(null);
  const autoSavedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isViewerEnabledRef = useRef(false);

  const [windowWidth, setWindowWidth] = useState(1500);
  const [windowCenter, setWindowCenter] = useState(-600);

  // Estado de volcado/segmentación y flag para evitar repetir refresco
  const [status, setStatus] = useState(null);
  const [hasSyncedAfterReady, setHasSyncedAfterReady] = useState(false);


  // ---------- refs “frescos” para handlers ----------
  const layersRef = useRef(layers);
  useEffect(() => { layersRef.current = layers; }, [layers]);

  const allLayersPerSliceRef = useRef(allLayersPerSlice);
  useEffect(() => { allLayersPerSliceRef.current = allLayersPerSlice; }, [allLayersPerSlice]);

  const wasDraggingRef = useRef(wasDragging);
  useEffect(() => { wasDraggingRef.current = wasDragging; }, [wasDragging]);

  useEffect(() => { draggingIndexRef.current = draggingIndex; }, [draggingIndex]);

  const [currentPreset, setCurrentPreset] = useState(null);


  // ---------- VOI helpers ----------
  const applyVOI = (el, wl, ww) => {
    if (!el) return;
    try {
      const vp = cornerstone.getViewport(el);
      vp.voi = { windowCenter: wl, windowWidth: Math.max(1, ww) };
      cornerstone.setViewport(el, vp);
    } catch {
      // noop
    }
  };

  const setPreset = (preset) => {
    let wl = windowCenter, ww = windowWidth;
    if (preset === "lung") { wl = -600; ww = 1500; }
    if (preset === "ggo")  { wl = -500; ww =  700; }
    if (preset === "soft") { wl =   50; ww =  400; }
    if (preset === "bone") { wl =  300; ww = 1500; }
    setWindowCenter(wl);
    setWindowWidth(ww);
    setCurrentPreset(preset);  
    applyVOI(viewerRef.current, wl, ww);
  };

  useEffect(() => {
  if (currentPreset == null) setPreset("lung");
}, []);

  // ---------- Cargar lista DICOM ----------
  useEffect(() => {
    axios
      .get(`/api/image/dicom-list/${folder}`)
      .then(({ data }) => {
        const urls = data.map(
          (file) => `/api/image/dicom/${folder}/${encodeURIComponent(file)}`
        );
        setDicomList(urls);
      })
      .catch(() => setError("No se pudieron obtener los archivos DICOM."))
      .finally(() => setLoading(false));
  }, [folder]);

  // ---------- Spacing global al tener dicomList ----------
  useEffect(() => {
    (async () => {
      if (dicomList.length < 1) return;
      const robust = await getRobustStackSpacing(dicomList);
      if (robust) {
        setDicomSpacing({
          row: robust.pixelSpacing.row,
          col: robust.pixelSpacing.col,
          slice: robust.sliceSpacing,
        });
        console.info("[STACK] Spacing →", robust);
      }
    })();
  }, [dicomList]);

  // ---------- Mostrar imagen seleccionada ----------
useEffect(() => {
  const element = viewerRef.current;
  if (!element || selectedIndex === null || !dicomList[selectedIndex]) return;

  // 1) habilitar de forma segura
  let isEnabled = true;
  try { cornerstone.getEnabledElement(element); }
  catch { isEnabled = false; }
  if (!isEnabled) {
    cornerstone.enable(element);
    isViewerEnabledRef.current = true;
  }

  // 2) cargar y mostrar
  const imageId = `wadouri:${window.location.origin}${dicomList[selectedIndex]}`;
  cornerstone.loadAndCacheImage(imageId)
    .then((image) => {
      cornerstone.displayImage(element, image);

      const { pixelSpacing } = extractSpacingFromImage(image) || {};
      setDicomSpacing(prev => ({
        row: Number.isFinite(prev.row) && prev.row > 0 ? prev.row : (Number(pixelSpacing?.row) || 1),
        col: Number.isFinite(prev.col) && prev.col > 0 ? prev.col : (Number(pixelSpacing?.col) || 1),
        slice: Number.isFinite(prev.slice) && prev.slice > 0 ? prev.slice : 1,
      }));

      const vp = cornerstone.getDefaultViewportForImage(element, image);
      vp.scale = scale;
      const imgWL = num(image.windowCenter, -600);
      const imgWW = Math.max(1, num(image.windowWidth, 1500));
      vp.voi = {
        windowCenter: Number.isFinite(windowCenter) ? windowCenter : imgWL,
        windowWidth:  Number.isFinite(windowWidth)  ? windowWidth  : imgWW,
      };
      cornerstone.setViewport(element, vp);
      drawOverlayLines();
    })
    .catch((err) => console.error("Error al cargar imagen:", err));

  // 3) MUY IMPORTANTE: cleanup del MISMO elemento que habilitaste
  return () => {
    try {
      // opcional: limpia viewport antes de deshabilitar
      try { cornerstone.reset(element); } catch {}
      cornerstone.disable(element);
    } catch {}
    isViewerEnabledRef.current = false;
  };
}, [selectedIndex, dicomList, scale, windowCenter, windowWidth]);

  // Redibuja en cambios de layers/zoom/slice
  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;
    try { cornerstone.getEnabledElement(element); drawOverlayLines(); } catch {}
  }, [layers, scale, selectedIndex]);

  // Aplicar VOI al cambiar sliders
  useEffect(() => {
    const el = viewerRef.current;
    if (!el || selectedIndex === null) return;
    applyVOI(el, windowCenter, windowWidth);
  }, [windowCenter, windowWidth, selectedIndex]);

useEffect(() => {
  return () => {
    const el = viewerRef.current;
    if (el) {
      try { cornerstone.disable(el); } catch {}
    }
    isViewerEnabledRef.current = false;
  };
}, []);

  // ---------- Cargar capas + volumen editable inicial ----------
// helper chiquito para asegurar multi-contour en memoria
const toMulti = (arr) => Array.isArray(arr?.[0]) ? arr : (Array.isArray(arr) ? [arr] : []);

// --- helper: marcar multi-polígono como cerrado por polígono (propiedad __closed)
// Nota: un array en JS puede tener propiedades. No se guarda en el JSON porque solo serializas puntos.
const markClosed = (arr) => {
  if (!Array.isArray(arr)) return arr;
  arr.forEach((poly) => { if (Array.isArray(poly)) poly.__closed = true; });
  return arr;
};

// --- helper: clonar manteniendo la marca __closed por polígono ---
function clonePolygonsKeepingClosed(points) {
  if (!Array.isArray(points)) return [];
  const isMulti = Array.isArray(points[0]);
  if (isMulti) {
    return points.map((poly) => {
      const cloned = poly.map((p) => ({ ...p }));
      if (poly.__closed === true) cloned.__closed = true;
      else if (poly.__closed === false) cloned.__closed = false;
      return cloned;
    });
  } else {
    return points.map((p) => ({ ...p }));
  }
}


const fetchAllEditableLayers = useCallback(async () => {
  try {
    const { data: validIndexMap } = await axios.get(`/api/segment/valid-indices/${folder}`);

    const totalSlices = dicomList.length;
    const layersPorSlice = new Array(totalSlices).fill(null);

    await Promise.all(
      Object.entries(validIndexMap).map(async ([indexStr]) => {
        const index = parseInt(indexStr, 10);
        const padded = String(index).padStart(3, "0");

        const [modelo, dbMask] = await Promise.all([
          axios.get(`/api/segment/mask-json/${folder}/${padded}`).then(r => r.data).catch(() => null),
          axios.get(`/api/segment/mask-db-by-folder/${folder}/${index}`).then(r => r.data).catch(async () => {
            try {
              const j = await axios.get(`/api/segment/mask-json/${folder}/${padded}_simplified`);
              return { lung: j.data?.lung_editable || [], fibrosis: j.data?.fibrosis_editable || [] };
            } catch { return null; }
          }),
        ]);

        const L = [];
        if (modelo) {
          L.push({ name: "Pulmón (modelo)",   points: markClosed(toMulti(modelo.lung)),     visible: true, color: "lime",   closed: true, editable: false });

          L.push({ name: "Fibrosis (modelo)", points: markClosed(toMulti(modelo.fibrosis)), visible: true, color: "red",    closed: true, editable: false });
        }

        if (dbMask) {
          L.push({ name: "Pulmón (editable)",   points: markClosed(toMulti(dbMask.lung)),     visible: true, color: "yellow", closed: true, editable: true  });
          L.push({ name: "Fibrosis (editable)", points: markClosed(toMulti(dbMask.fibrosis)), visible: true, color: "orange", closed: true, editable: true  });
        }

        layersPorSlice[index] = L;
      })
    );

    // recalcular spacing robusto si hace falta
    let px = { row: Number(dicomSpacing.row), col: Number(dicomSpacing.col) };
    let dz = Number(dicomSpacing.slice);
    if (!Number.isFinite(px.row) || !Number.isFinite(px.col) || !Number.isFinite(dz)) {
      const robust = await getRobustStackSpacing(dicomList);
      if (robust) {
        px = { row: robust.pixelSpacing.row, col: robust.pixelSpacing.col };
        dz = robust.sliceSpacing;
        setDicomSpacing({ row: px.row, col: px.col, slice: dz });
      } else {
        px = { row: 1, col: 1 }; dz = 1;
      }
    }

    const volumenGlobal = calcularVolumenEditableGlobal(layersPorSlice, px, dz);
    setEditableVolumen(volumenGlobal);
    setAllLayersPerSlice(layersPorSlice);
  } catch (err) {
    console.error("Error al cargar capas:", err);
  }
}, [folder, dicomList, dicomSpacing.row, dicomSpacing.col, dicomSpacing.slice]);

// --------- Cargar capas + volumen inicial ---------
// --- helper: asegurar multi-contour en memoria (lo tienes ya) ---
useEffect(() => {
  if (dicomList.length > 0) fetchAllEditableLayers();
}, [dicomList, fetchAllEditableLayers]);

  // ---------- Volumen automático (front + guardar 1 vez en BD) ----------
  const normalizeAuto = (d) => {
    const lung = Number(d?.lung_volume_ml ?? d?.lung ?? d?.lung_ml);
    const fib  = Number(d?.fibrosis_volume_ml ?? d?.fibrosis ?? d?.fibrosis_ml);
    const total = Number(d?.total_volume_ml ?? d?.total ?? d?.total_ml);
    return {
      lung: Number.isFinite(lung) ? lung : null,
      fibrosis: Number.isFinite(fib) ? fib : null,
      total: Number.isFinite(total) ? total : null,
    };
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`/api/segment/volumen/${folder}`);
        const auto = normalizeAuto(data);
        setAutoVol(auto);

        if (!autoSavedRef.current && auto.total != null) {
          await enviarVolumenABackend(
            nss,
            fechaSQL,
            auto.total,
            undefined,
            false // manual = false ⇒ volumen_automatico
          );
          autoSavedRef.current = true;
        }
      } catch (e) {
        console.warn("No se pudo obtener volumen automático:", e);
        setAutoVol(null);
      }
    })();
  }, [folder, nss, fechaSQL]);

  // ---------- Al cambiar de slice, sincroniza capas y recalcula preview ----------
  const recalcGlobalVolumeInstant = useCallback((sliceIdx, newSliceLayers) => {
    const px = { row: Number(dicomSpacing.row) || 1, col: Number(dicomSpacing.col) || 1 };
    const dz = Number(dicomSpacing.slice) || 1;
    const updatedAll = [...(allLayersPerSliceRef.current || [])];
    updatedAll[sliceIdx] = newSliceLayers;
    const v = calcularVolumenEditableGlobal(updatedAll, px, dz);
    if (v) setEditableVolumen(v);
  }, [dicomSpacing.row, dicomSpacing.col, dicomSpacing.slice]);

  useEffect(() => {
    if (selectedIndex !== null && allLayersPerSlice[selectedIndex]) {
      const sliceLayers = allLayersPerSlice[selectedIndex];
      setLayers(sliceLayers);
      recalcGlobalVolumeInstant(selectedIndex, sliceLayers);

      const firstEditable = sliceLayers.findIndex((l) => l.editable);
      if (
        selectedLayerIndex == null ||
        !sliceLayers[selectedLayerIndex] ||
        !sliceLayers[selectedLayerIndex].editable
      ) {
        if (firstEditable !== -1) setSelectedLayerIndex(firstEditable);
      }
    }
  }, [selectedIndex, allLayersPerSlice, recalcGlobalVolumeInstant]); // eslint-disable-line

  // ---------- Redibujo en render de imagen ----------
  useLayoutEffect(() => {
    const element = viewerRef.current;
    if (!element) return;
    const onRendered = () => drawOverlayLines();
    element.addEventListener(cornerstone.EVENTS.IMAGE_RENDERED, onRendered);
    return () => {
      element.removeEventListener(cornerstone.EVENTS.IMAGE_RENDERED, onRendered);
    };
  }, []);

  // ---------- Guardado + recálculo ----------
  async function saveEditableJson(index, nextLayersForSlice = null) {
    const paddedIndex = String(index).padStart(3, "0");
    const currentLayers = nextLayersForSlice ?? layers;

    const lungLayer = currentLayers.find((l) => l.name.includes("Pulmón") && l.editable);
    const fibrosisLayer = currentLayers.find((l) => l.name.includes("Fibrosis") && l.editable);

    if (lungLayer && lungLayer.points && !Array.isArray(lungLayer.points[0])) {
      lungLayer.points = [lungLayer.points];
    }
    if (fibrosisLayer && fibrosisLayer.points && !Array.isArray(fibrosisLayer.points[0])) {
      fibrosisLayer.points = [fibrosisLayer.points];
    }

    const jsonData = {
      lung_editable: lungLayer?.points || [],
      fibrosis_editable: fibrosisLayer?.points || [],
    };

    try {
      await axios.post(`/api/segment/save-edit/${folder}/${paddedIndex}`, jsonData);

      const updated = [...allLayersPerSlice];
      updated[index] = currentLayers;
      setAllLayersPerSlice(updated);

      const px = { row: Number(dicomSpacing.row) || 1, col: Number(dicomSpacing.col) || 1 };
      const dz = Number(dicomSpacing.slice) || 1;
      const volumenGlobal = calcularVolumenEditableGlobal(updated, px, dz);
      setEditableVolumen(volumenGlobal);

      await enviarVolumenABackend(
        nss,
        fechaSQL,
        (volumenGlobal?.editableTotalVolume ?? undefined),
        undefined,
        true // manual = true ⇒ volumen_manual
      );
    } catch (err) {
      console.error("Error al guardar edición/volumen:", err);
    }
  }
// --- Polling de estado de volcado/segmentación ---
useEffect(() => {
  let stop = false;
  let timer = null;

  const poll = async () => {
    try {
      const { data } = await axios.get(`/api/segment/status/${folder}`);
      if (stop) return;
      setStatus(data);

      if (data?.ready && !hasSyncedAfterReady) {
        // Ya hay datos en BD → recargo capas y volumen automático una sola vez
        try {
          await fetchAllEditableLayers();
        } catch {}
        try {
          const { data: vol } = await axios.get(`/api/segment/volumen/${folder}`);
          const auto = {
            lung: Number(vol?.lung_volume_ml) || null,
            fibrosis: Number(vol?.fibrosis_volume_ml) || null,
            total: Number(vol?.total_volume_ml) || null,
          };
          setAutoVol(auto);
        } catch {}
        setHasSyncedAfterReady(true);
      }

      // Si no está listo, reintentar
      if (!data?.ready) {
        timer = setTimeout(poll, 2500);
      }
    } catch {
      if (!stop) timer = setTimeout(poll, 2500);
    }
  };

  // arranca polling si tenemos lista de dicoms (estudio abierto)
  if (dicomList.length > 0) {
    poll();
  }

  return () => {
    stop = true;
    if (timer) clearTimeout(timer);
  };
}, [folder, dicomList.length, hasSyncedAfterReady, fetchAllEditableLayers]);

  // ---------- Dibujo overlay ----------
  const drawOverlayLines = () => {
    const canvas = overlayRef.current;
    const element = viewerRef.current;
    if (!canvas || !element) return;

    try { cornerstone.getEnabledElement(element); } catch { return; }

    const rect = element.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    (layers || []).forEach((layer) => {
      if (!layer?.visible || !layer.points || layer.points.length === 0) return;

      const isMultiContour = Array.isArray(layer.points[0]);
      const allPolygons = isMultiContour ? layer.points : [layer.points];

      allPolygons.forEach((polygon) => {
        if (!Array.isArray(polygon)) return;

        // filtra puntos válidos
        const filteredPoints = polygon.filter(
          (p) => p && typeof p.x === "number" && typeof p.y === "number"
        );
        if (filteredPoints.length === 0) return;

        const screenPoints = filteredPoints.map((p) => cornerstone.pixelToCanvas(element, p));
        if (screenPoints.some((pt) => !pt || typeof pt.x !== "number")) return;

        // cerrado por polígono; si no tiene marca, cae al valor de la capa
        const polyClosed = (polygon.__closed === true) || (polygon.__closed == null && layer.closed);

        // Relleno: solo si hay >=3 y está cerrado
        if (polyClosed && screenPoints.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
          for (let i = 1; i < screenPoints.length; i++) {
            ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
          }
          ctx.closePath();
          ctx.fillStyle = "rgba(0,255,0,0.2)";
          ctx.fill();
        }

        // Borde: solo si hay >=2
        if (screenPoints.length >= 2) {
          ctx.beginPath();
          ctx.strokeStyle = layer.color || "cyan";
          ctx.lineWidth = 2;
          ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
          for (let i = 1; i < screenPoints.length; i++) {
            ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
          }
          if (polyClosed) ctx.lineTo(screenPoints[0].x, screenPoints[0].y);
          ctx.stroke();
        }

        // Handles: siempre que la capa sea editable (aunque haya 1 punto)
        if (layer.editable) {
          screenPoints.forEach((pt, idx) => {
            ctx.beginPath();
            const r = screenPoints.length === 1 ? 6 : 5; // un pelín más grande si es el primero
            ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = "red";
            ctx.fill();
          });
        }
      });
    });
  };


  // ---------- Edición por click ----------
  const pointToSegmentDistance = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    const tClamped = Math.max(0, Math.min(1, t));
    const closest = { x: a.x + tClamped * dx, y: a.y + tClamped * dy };
    return Math.hypot(p.x - closest.x, p.y - closest.y);
  };

const handleOverlayClick = (e) => {
  const currentLayer = layers[selectedLayerIndex];
  if (!currentLayer || !currentLayer.editable) return;

  const element = viewerRef.current;
  const canvas = overlayRef.current;
  if (!element || !canvas || wasDragging) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const imagePoint = cornerstone.canvasToPixel(element, { x, y });
  const toCanvas = (p) => cornerstone.pixelToCanvas(element, p);

  // deep copy del slice (conserva __closed)
  const nextLayers = layers.map((l) => ({
    ...l,
    points: clonePolygonsKeepingClosed(l.points || []),
  }));

  const layer = nextLayers[selectedLayerIndex];
  if (!layer.points) layer.points = [];
  const isMulti = Array.isArray(layer.points[0]);
  let polygons = isMulti ? layer.points : [layer.points];
  if (!polygons.length) {
    const empty = [];
    empty.__closed = false; // ← marcar explícitamente abierto
    polygons = [empty];
    layer.points = isMulti ? polygons : polygons[0];
  }

  // 1) ALT + click → borrar punto (siempre permitido)
  if (e.altKey) {
    for (let pIdx = 0; pIdx < polygons.length; pIdx++) {
      const spts = polygons[pIdx].map(toCanvas);
      const idx = spts.findIndex((pt) => Math.hypot(pt.x - x, pt.y - y) < THRESH);
      if (idx !== -1) {
        polygons[pIdx].splice(idx, 1);
        layer.points = isMulti ? polygons : polygons[0];
        setLayers(nextLayers);
        recalcGlobalVolumeInstant(selectedIndex, nextLayers);
        saveEditableJson(selectedIndex, nextLayers);
        return;
      }
    }
    return; // sin Alt+match no hacemos nada más
  }

      // 2) Ctrl/Cmd + click → insertar/cerrar en el polígono adecuado, o crear uno nuevo
      if (isEditKey(e)) {
        e.preventDefault();

        // 2.1) Intentar insertar sobre el borde de algún polígono CERRADO (por-polígono)
        for (let pIdx = 0; pIdx < polygons.length; pIdx++) {
          const poly = polygons[pIdx];
          const polyClosed = (poly.__closed === true) || (poly.__closed == null && layer.closed);
          if (!polyClosed || poly.length < 2) continue;

          const spts = poly.map(toCanvas);
          for (let i = 0; i < spts.length; i++) {
            const a = spts[i];
            const b = spts[(i + 1) % spts.length];
            const dist = pointToSegmentDistance({ x, y }, a, b);
            if (dist < THRESH) {
              poly.splice(i + 1, 0, imagePoint);
              layer.points = isMulti ? polygons : polygons[0];
              setLayers(nextLayers);
              recalcGlobalVolumeInstant(selectedIndex, nextLayers);
              saveEditableJson(selectedIndex, nextLayers);
              return;
            }
          }
        }

        // 2.2) Usar/crear un polígono ABIERTO
        // Busca un polígono explícitamente abierto (__closed === false)
        let openIdx = polygons.findIndex((p) => p.__closed === false);
        // Si no existe, pero tienes un "placeholder" vacío al inicio, úsalo
        if (openIdx === -1 && polygons.length === 1 && polygons[0].length === 0 && polygons[0].__closed !== true) {
          openIdx = 0;
          polygons[0].__closed = false;
        }
        // Si aún no hay, crea uno nuevo
        if (openIdx === -1) {
          const newPoly = [];
          newPoly.__closed = false;
          polygons.push(newPoly);
          openIdx = polygons.length - 1;
        }

        const targetPoly = polygons[openIdx];

        // 2.3) Si clic cerca del primer punto y ya hay >=3, cerrar este polígono
        if (targetPoly.length >= 3) {
          const firstCanvas = toCanvas(targetPoly[0]);
          if (Math.hypot(firstCanvas.x - x, firstCanvas.y - y) < THRESH) {
            targetPoly.__closed = true;
            layer.points = isMulti ? polygons : polygons[0];
            setLayers(nextLayers);
            recalcGlobalVolumeInstant(selectedIndex, nextLayers);
            saveEditableJson(selectedIndex, nextLayers);
            return;
          }
        }

        // 2.4) Añadir punto al polígono abierto (evitando puntos demasiado cercanos)
        const spts = targetPoly.map(toCanvas);
        const tooClose = spts.some((pt) => Math.hypot(pt.x - x, pt.y - y) < THRESH);
        if (!tooClose) {
          targetPoly.push(imagePoint);
          layer.points = isMulti ? polygons : polygons[0];
          setLayers(nextLayers);
          recalcGlobalVolumeInstant(selectedIndex, nextLayers);
          saveEditableJson(selectedIndex, nextLayers);
        }
        return;
      }


  // 3) Click izquierdo (sin modificadores) → editar SOLO líneas ya existentes:
  //    - Si polígono está CERRADO: permitir insertar sobre borde.
  //    - Si está ABIERTO: NO añadir ni cerrar (ediciones "no destructivas").
  if (layer.closed) {
    for (let pIdx = 0; pIdx < polygons.length; pIdx++) {
      const spts = polygons[pIdx].map(toCanvas);
      for (let i = 0; i < spts.length; i++) {
        const a = spts[i];
        const b = spts[(i + 1) % spts.length];
        const dist = pointToSegmentDistance({ x, y }, a, b);
        if (dist < THRESH) {
          polygons[pIdx].splice(i + 1, 0, imagePoint);
          layer.points = isMulti ? polygons : polygons[0];
          setLayers(nextLayers);
          recalcGlobalVolumeInstant(selectedIndex, nextLayers);
          saveEditableJson(selectedIndex, nextLayers);
          return;
        }
      }
    }
  }
  // Si polígono abierto o clic en vacío: no hace nada.
};


  // ---------- Drag de vértices + pan ----------
  useEffect(() => {
    const canvas = overlayRef.current;
    const element = viewerRef.current;
    const layer = layers[selectedLayerIndex];
    if (!layer || !layer.editable) return;
    if (!canvas || !element) return;

    const getMouseCoords = (e) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

const handleMouseDown = (e) => {
  if (e.button === 1) {
    e.preventDefault();
    setIsPanning(true);
    setLastPanPosition({ x: e.clientX, y: e.clientY });
    return;
  }

  // Mover vértices SOLO con Ctrl/Cmd + click izquierdo
  if (!isEditKey(e) || e.button !== 0) return;
  e.preventDefault();

  setWasDragging(false);

  const { x, y } = getMouseCoords(e);
  const isMulti = Array.isArray(layer.points[0]);
  const polygons = isMulti ? layer.points : [layer.points];

  for (let pIdx = 0; pIdx < polygons.length; pIdx++) {
    const screenPoints = polygons[pIdx].map((p) => cornerstone.pixelToCanvas(element, p));
    screenPoints.forEach((pt, i) => {
      if (Math.hypot(pt.x - x, pt.y - y) < THRESH) {
        setDraggingIndex({ pIdx, i });
        draggingIndexRef.current = { pIdx, i };
      }
    });
  }
};


    const handleMouseMove = (e) => {
      // Pan con botón medio
      if (isPanning && lastPanPosition) {
        const deltaX = e.clientX - lastPanPosition.x;
        const deltaY = e.clientY - lastPanPosition.y;
        const viewport = cornerstone.getViewport(element);
        viewport.translation.x += deltaX;
        viewport.translation.y += deltaY;
        cornerstone.setViewport(element, viewport);
        setLastPanPosition({ x: e.clientX, y: e.clientY });
        drawOverlayLines();
        return;
      }

      const di = draggingIndexRef.current;
      if (!di) return; // nada que arrastrar

      const { x, y } = getMouseCoords(e);
      const imageCoords = cornerstone.canvasToPixel(element, { x, y });

      // snapshot profundo del slice
      const baseSliceLayers = layersRef.current || [];
      if (!baseSliceLayers[selectedLayerIndex]) return;

      const updatedSlice = baseSliceLayers.map((l) => ({
        ...l,
        points: clonePolygonsKeepingClosed(l.points || []),
      }));

      const lay = updatedSlice[selectedLayerIndex];
      const isMulti = Array.isArray(lay.points[0]);
      const polygons = isMulti ? lay.points : [lay.points];
      const { pIdx, i } = di;

      if (polygons[pIdx] && polygons[pIdx][i]) {
        polygons[pIdx][i] = imageCoords;
      }
      lay.points = isMulti ? polygons : polygons[0];
      updatedSlice[selectedLayerIndex] = lay;

      setLayers(updatedSlice);
      drawOverlayLines();
      setWasDragging(true);

      recalcGlobalVolumeInstant(selectedIndex, updatedSlice);
    };

    const stopInteraction = async () => {
      setDraggingIndex(null);
      draggingIndexRef.current = null;
      setIsPanning(false);
      setLastPanPosition(null);

      if (wasDraggingRef.current) {
        await saveEditableJson(selectedIndex, layersRef.current);
        setWasDragging(false);
      }
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", stopInteraction);
    canvas.addEventListener("mouseleave", stopInteraction);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", stopInteraction);
      canvas.removeEventListener("mouseleave", stopInteraction);
    };
  }, [layers, selectedLayerIndex, isPanning, lastPanPosition, selectedIndex, recalcGlobalVolumeInstant]); // eslint-disable-line

  // ---------- Zoom ----------
  const handleZoomChange = (e) => {
    const newScale = parseFloat(e.target.value);
    setScale(newScale);
    const element = viewerRef.current;
    if (element) {
      const viewport = cornerstone.getViewport(element);
      viewport.scale = newScale;
      cornerstone.setViewport(element, viewport);
      drawOverlayLines();
    }
  };

  // ---------- UI ----------
  if (loading) return <p style={{ padding: "2rem" }}>Cargando estudio…</p>;
  if (error) return <p style={{ padding: "2rem", color: "red" }}>{error}</p>;

  const huMin = Math.round(windowCenter - windowWidth / 2);
  const huMax = Math.round(windowCenter + windowWidth / 2);

  return (
    <>
      <div style={{ padding: "2rem" }}>
        <h2>Estudio - {fechaOriginal}</h2>
        <button onClick={() => navigate(-1)}>← Volver</button>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, 150px)",
            gap: "1rem",
            marginTop: "2rem",
          }}
        >
          {dicomList.map((url, i) => (
            <div
              key={i}
              className="thumb"
              onClick={() => setSelectedIndex(i)}
              ref={async (el) => {
                if (el && !cornerstone.getEnabledElements().some((e) => e.element === el)) {
                  try {
                    cornerstone.enable(el);
                    const image = await cornerstone.loadAndCacheImage(
                      `wadouri:${window.location.origin}${url}`
                    );
                    cornerstone.displayImage(el, image);
                  } catch {}
                }
              }}
              style={{
                background: "black",
                borderRadius: "8px",
                height: "150px",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </div>

      {selectedIndex !== null && (
        <div className="fullscreen-overlay">
          <div className="sidebar-panel">
            <div className="sidebar-header">
              <strong>Imagen {selectedIndex + 1} / {dicomList.length}</strong>
              <button className="btn" onClick={() => setSelectedIndex(null)}>Cerrar</button>
            </div>

            {/* WW/WL */}
            <div style={{ color: "#fff", marginBottom: "1rem" }}>
              <div style={{ fontWeight: "bold", marginBottom: 6 }}>Visualización HU (WW/WL)</div>

<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
  <button
    type="button"
    className={`btn preset ${currentPreset === "lung" ? "active" : ""}`}
    aria-pressed={currentPreset === "lung"}
    onClick={() => setPreset("lung")}
  >
    Pulmón
  </button>

  <button
    type="button"
    className={`btn preset ${currentPreset === "ggo" ? "active" : ""}`}
    aria-pressed={currentPreset === "ggo"}
    onClick={() => setPreset("ggo")}
  >
    Fibrosis/Vidrio
  </button>

  <button
    type="button"
    className={`btn preset ${currentPreset === "soft" ? "active" : ""}`}
    aria-pressed={currentPreset === "soft"}
    onClick={() => setPreset("soft")}
  >
    Partes blandas
  </button>

  <button
    type="button"
    className={`btn preset ${currentPreset === "bone" ? "active" : ""}`}
    aria-pressed={currentPreset === "bone"}
    onClick={() => setPreset("bone")}
  >
    Hueso
  </button>
</div>


              <div style={{ marginBottom: 6 }}>
                <label>WL (Level): {Math.round(windowCenter)} HU</label>
                <input
                  type="range"
                  min={-1000}
                  max={1000}
                  step={1}
                  value={windowCenter}
                  onChange={(e) => setWindowCenter(clamp(+e.target.value, -1000, 1000))}
                />
              </div>
              <div style={{ marginBottom: 6 }}>
                <label>WW (Width): {Math.round(windowWidth)} HU</label>
                <input
                  type="range"
                  min={1}
                  max={3000}
                  step={1}
                  value={windowWidth}
                  onChange={(e) => setWindowWidth(clamp(+e.target.value, 1, 3000))}
                />
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Rango efectivo: [{huMin}, {huMax}] HU
              </div>
            </div>

            {/* zoom */}
            <div>
              <label style={{ color: "#fff" }}>Zoom:</label>
              <input type="range" min="0.1" max="10" step="0.01" value={scale} onChange={handleZoomChange} />
            </div>

<div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%" }}>
  <button className="btn" onClick={() => setSelectedIndex((prev) => Math.max(0, prev - 1))} disabled={selectedIndex === 0}>
    Anterior
  </button>
  <button className="btn" onClick={() => setSelectedIndex((prev) => Math.min(dicomList.length - 1, prev + 1))} disabled={selectedIndex === dicomList.length - 1}>
    Siguiente
  </button>
</div>


            {/* capas */}
            {layers.length > 0 && (
              <>
                <p style={{ color: "#fff", marginTop: "1rem" }}>Capas:</p>
                {layers.map((layer, i) => (
                  <label key={i} style={{ color: "#fff", display: "block" }}>
                    <input
                      type="checkbox"
                      checked={!!layer.visible}
                      onChange={() => {
                        const updated = [...layers];
                        updated[i] = { ...updated[i], visible: !updated[i].visible };
                        setLayers(updated);
                        drawOverlayLines();
                      }}
                    />{" "}
                    {layer.name}
                  </label>
                ))}

                <div style={{ marginTop: "1rem", color: "#fff" }}>
                  <label>Editar capa:</label>
                  <select value={selectedLayerIndex} onChange={(e) => setSelectedLayerIndex(parseInt(e.target.value, 10))}>
                    {layers.map((layer, i) => (layer.editable ? <option key={i} value={i}>{layer.name}</option> : null))}
                  </select>
                </div>
              </>
            )}

                        {/* volumen automático */}
            {autoVol && (
              <div style={{ color: "#fff", marginBottom: "1rem" }}>
                <br /><br />
                <div><strong>Volumen pulmón (auto):</strong> {autoVol.lung ?? "—"} ml</div>
                <div><strong>Volumen fibrosis (auto):</strong> {autoVol.fibrosis ?? "—"} ml</div>
                <div><strong>Total (auto):</strong> {autoVol.total ?? "—"} ml</div>
              </div>
            )}

            {/* volumen editable */}
            {editableVolumen && (
              <div style={{ color: "#fff", marginTop: "1rem" }}>
                <div><strong>Pulmón (editable):</strong> {editableVolumen.editableLungVolume} ml</div>
                <div><strong>Fibrosis (editable):</strong> {editableVolumen.editableFibrosisVolume} ml</div>
                <div><strong>Total (editable):</strong> {editableVolumen.editableTotalVolume} ml</div>
              </div>
            )}
          </div>

          <div className="main-panel" key={`${folder}-${selectedIndex ?? 'closed'}`}>
            <div ref={viewerRef} className="fullscreen-viewer" />
            <canvas ref={overlayRef} className="overlay-canvas" onClick={handleOverlayClick} />
          </div>
        </div>
      )}

     <style>{`
.fullscreen-overlay {
  position: fixed;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
  display: flex; flex-direction: row;
  gap: 0; background: #000; z-index: 9999;
}

/* Panel lateral (desktop) */
.sidebar-panel {
  width: 300px; background: #111; color: #fff;
  padding: 1rem; display: flex; flex-direction: column;
  height: 100vh; overflow-y: auto; box-shadow: 2px 0 6px rgba(0,0,0,0.4);
}

/* Area principal (visor) */
.main-panel {
  flex: 1; position: relative; height: 100vh;
}

.sidebar-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;
}

.fullscreen-viewer {
  width: 100%; height: 100%; background: black; border-radius: 12px;
}

.overlay-canvas {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  pointer-events: auto;
  touch-action: none; /* ayuda en pantallas táctiles */
}

/* Botones / controles */
.btn {
  padding: 0.5rem 0.7rem; background: #0ea5e9; color: #fff; border: none;
  border-radius: 6px; cursor: pointer; font-size: 0.85rem;
}

.btn:disabled {
  opacity: .6; cursor: not-allowed; box-shadow: none; transform: none;
}

input[type="range"] { width: 100%; }

/* estilo de presets */
.btn.preset {
  background: #0ea5e9;
  opacity: 0.85;
  transition: transform 0.05s ease, box-shadow 0.15s ease, opacity 0.15s ease, background 0.15s ease, border-color 0.15s ease;
  border: 2px solid transparent;
}
.btn.preset:hover { opacity: 1; }

/* ACTIVO (dos selectores para asegurar) */
.btn.preset.active,
.btn.preset[aria-pressed="true"] {
  opacity: 1;
  background: #9ab3c0ff;           /* más oscuro */
  border-color: #22d3ee;           /* cian */
  box-shadow: 0 0 0 2px rgba(34,211,238,.25), 0 6px 14px rgba(0,0,0,.25);
  transform: translateY(-1px);
}

/* ====== Responsive sencillo: en móviles el panel toma parte de la altura ====== */
@media (max-width: 900px) {
  .fullscreen-overlay {
    flex-direction: column;          /* de columnas → filas */
  }
  .sidebar-panel {
    width: 100%;
    height: 42vh;                    /* ajusta entre 35–50vh a tu gusto */
    max-height: 60vh;                /* límite de seguridad */
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }
  .main-panel {
    height: calc(100vh - 42vh);      /* el visor ocupa el resto */
  }
}
      `}</style>
    </>
  );
}
