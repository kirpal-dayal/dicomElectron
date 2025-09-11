/**
<<<<<<< Updated upstream
 * StudyView.js 
 * Componente React para visualizar estudios médicos (DICOM) de un paciente.
 * - Carga y muestra las imágenes DICOM de un estudio específico (basado en el NSS y la fecha recibidos en la URL).
 * - Utiliza Cornerstone y cornerstone-wado-image-loader para renderizar imágenes médicas directamente en el navegador.
 * - Muestra una galería de miniaturas, permite ver cada imagen a pantalla completa y navegar entre ellas, quizas se deba pensar en el tamano
 * - Permite volver al historial de estudios desde la misma vista.
 * - Permite dibujar figuras en una capa independiente haciendo clic sobre los vértices.
 *
 * - Solicita la lista de archivos DICOM al backend (/api/image/dicom-list/:folder) usando Axios.
 * - Descarga cada archivo DICOM al abrirlo y lo procesa usando Cornerstone.
 * - Se espera que la API backend proporcione acceso seguro a los archivos.
 * - La navegación depende de React Router (useNavigate, useParams).
 * 
 * - El backend debe exponer los endpoints REST indicados que están en imageRoutes en backend.
 * - Este componente es autónomo visualmente y no depende de otros componentes salvo la navegación.
Guardas y dibujas las coordenadas en espacio de imagen (image coordinates).

Al dibujar, conviertes esas coordenadas con cornerstone.pixelToCanvas(...) para que respondan al zoom/viewport.
canvas overlay (overlayCanvasRef) no está sincronizado en tamaño real con el elemento de visualización de Cornerstone (viewerRef)
Usar transform: scale() rompe las coordenadas relativas entre DICOM y el overlay canvas.
no estás usando padding, border o margin en .fullscreen-viewer y .overlay-canvas. 
Se borran los puntos con alt click
Las coordenadas automaticas del modelo vienen de back/segment.py
Carga automáticamente los mask_{index}.json según la imagen actual.
Dibuja los contornos en capas independientes y permite ocultarlas.
Puedes editar, limpiar, navegar entre slices, y aplicar zoom correctamente.

npm install simplify-js 
*/

import React, { useEffect, useRef, useState, useLayoutEffect } from "react";

import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import * as cornerstone from "cornerstone-core";
import * as cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import * as dicomParser from "dicom-parser";
import {
  extractSpacingFromImage,

  calcularVolumenEditableGlobal
} from "./volumenCalculator"; // Importa las funciones de cálculo de área y volumen desde volumenCalculator.js

  calcularVolumenEditableGlobal,
  enviarVolumenABackend,
} from "./volumenCalculator";

cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({ beforeSend: () => {} });

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (Array.isArray(v) ? (+v[0] || d) : (+v || d));

/** Calcula un slice spacing robusto con IPP+IOP a partir de 2 imágenes del stack */
async function getRobustStackSpacing(dicomList) {
  if (!dicomList || dicomList.length < 1) return null;

  const load = async (url) =>
    cornerstone.loadAndCacheImage(`wadouri:${window.location.origin}${url}`);

  const img0 = await load(dicomList[0]);

  // PixelSpacing (fila/col)
  let row = Number(img0.rowPixelSpacing) || NaN;
  let col = Number(img0.columnPixelSpacing) || NaN;
  if (!Number.isFinite(row) || !Number.isFinite(col)) {
    const pxStr = img0?.data?.string?.("x00280030");
    if (pxStr) {
      const parts = pxStr.split("\\").map(Number);
      row = Number.isFinite(parts[0]) ? parts[0] : row;
      col = Number.isFinite(parts[1]) ? parts[1] : col;
    }
  }
  if (!Number.isFinite(row)) row = 1;
  if (!Number.isFinite(col)) col = 1;

  // Si hay al menos 2, intentamos ΔZ usando IOP/IPP
  let slice = 1;
  if (dicomList.length >= 2) {
    const img1 = await load(dicomList[1]);

    const parseVec3 = (s) => {
      if (!s) return null;
      const v = s.split("\\").map(Number);
      return v.length >= 3 && v.every(Number.isFinite) ? [v[0], v[1], v[2]] : null;
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

    // Fallbacks
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
    slice =
      (Number.isFinite(sbs) && sbs > 0 && sbs) ||
      (Number.isFinite(thk) && thk > 0 && thk) ||
      1;
  }

  return {
    pixelSpacing: { row, col },
    sliceSpacing: Math.abs(slice),
  };
}

export default function StudyView() {
  const { id: nss, studyNumber } = useParams();
  const fechaOriginal = decodeURIComponent(studyNumber);
  const fechaSQL = fechaOriginal.replace("T", " ").slice(0, 19);
  const safeFecha = fechaOriginal.replace(/[:\. ]/g, "_");
  const folder = `${nss}_${safeFecha}`;
  const navigate = useNavigate();

  const viewerRef = useRef();
  const overlayRef = useRef();

  const [dicomList, setDicomList] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [allLayersPerSlice, setAllLayersPerSlice] = useState([]);
  const [layers, setLayers] = useState([]);
  const [scale, setScale] = useState(1);
  const [draggingIndex, setDraggingIndex] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLayerIndex, setSelectedLayerIndex] = useState(0);
  const [wasDragging, setWasDragging] = useState(false);

  const [dicomSpacing, setDicomSpacing] = useState({ row: 1, col: 1, slice: 1 });
  const [dims3D, setDims3D] = useState([0, 0, 0]);

  const [originalContours, setOriginalContours] = useState([]);
  const [editableContours, setEditableContours] = useState([]);
  const [totalArea, setTotalArea] = useState(0);
  const draggingIndexRef = useRef(null);

  const fechaOriginal = decodeURIComponent(studyNumber);
  const safeFecha = fechaOriginal.replace(/[:\. ]/g, "_");
  const folder = `${nss}_${safeFecha}`;

  const draggingIndexRef = useRef(null);
  const [wasDragging, setWasDragging] = useState(false);

  const [selectedLayerIndex, setSelectedLayerIndex] = useState(0);

  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState(null);

  const [volumenes, setVolumenes] = useState(null); //estado para los volúmenes

  const [dicomSpacing, setDicomSpacing] = useState({ row: null, col: null, slice: null });
  const [volumenes, setVolumenes] = useState(null);

  const [editableVolumen, setEditableVolumen] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isViewerEnabledRef = useRef(false);

  const [windowWidth, setWindowWidth] = useState(1500);
  const [windowCenter, setWindowCenter] = useState(-600);
  // arriba, junto con otros useState
  const [autoVol, setAutoVol] = useState(null);
  // const autoSavedRef = useRef(false);
  // util local para normalizar
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


  // Mantener estados “frescos” dentro de los handlers
  const layersRef = useRef(layers);
  useEffect(() => { layersRef.current = layers; }, [layers]);

  const allLayersPerSliceRef = useRef(allLayersPerSlice);
  useEffect(() => { allLayersPerSliceRef.current = allLayersPerSlice; }, [allLayersPerSlice]);

  const wasDraggingRef = useRef(wasDragging);
  useEffect(() => { wasDraggingRef.current = wasDragging; }, [wasDragging]);

  // Recalcula el volumen global usando un snapshot del slice actual (sin guardar en backend)
  const recalcGlobalVolumeInstant = React.useCallback((sliceIdx, newSliceLayers) => {
    const px = { row: Number(dicomSpacing.row) || 1, col: Number(dicomSpacing.col) || 1 };
    const dz = Number(dicomSpacing.slice) || 1;
    if (!px.row || !px.col || !dz) return;

    const updatedAll = [...(allLayersPerSliceRef.current || [])];
    updatedAll[sliceIdx] = newSliceLayers;

    const v = calcularVolumenEditableGlobal(updatedAll, px, dz);
    if (v) setEditableVolumen(v);
  }, [dicomSpacing.row, dicomSpacing.col, dicomSpacing.slice]);

  // --------- VOI helpers ---------
  const applyVOI = (el, wl, ww) => {
    if (!el) return;
    try {
      const vp = cornerstone.getViewport(el);
      vp.voi = { windowCenter: wl, windowWidth: Math.max(1, ww) };
      cornerstone.setViewport(el, vp);
    } catch {}
  };

  const setPreset = (preset) => {
    let wl = windowCenter,
      ww = windowWidth;
    if (preset === "lung") {
      wl = -600;
      ww = 1500;
    }
    if (preset === "ggo") {
      wl = -500;
      ww = 700;
    }
    if (preset === "soft") {
      wl = 50;
      ww = 400;
    }
    if (preset === "bone") {
      wl = 300;
      ww = 1500;
    }
    setWindowCenter(wl);
    setWindowWidth(ww);
    applyVOI(viewerRef.current, wl, ww);
  };
  // --------- Cargar lista DICOM ---------
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

  useEffect(() => {
    draggingIndexRef.current = draggingIndex;
  }, [draggingIndex]); // sincroniza draggingIndexRef en cada cambio

  // --------- Calcular spacing global una vez que tengamos dicomList ---------
  useEffect(() => {
    (async () => {
      if (dicomList.length < 1) return;

      // Spacing robusto del stack
      const robust = await getRobustStackSpacing(dicomList);
      if (robust) {
        setDicomSpacing({
          row: robust.pixelSpacing.row,
          col: robust.pixelSpacing.col,
          slice: robust.sliceSpacing,
        });
        console.info("[STACK] Spacing fijado →", {
          row: robust.pixelSpacing.row,
          col: robust.pixelSpacing.col,
          slice: robust.sliceSpacing,
        });
      }
    })();
  }, [dicomList]);

  // --------- Mostrar imagen seleccionada ---------
  useEffect(() => {
    const element = viewerRef.current;
    if (!element || selectedIndex === null || !dicomList[selectedIndex]) return;

    try {
      if (!isViewerEnabledRef.current) {
        cornerstone.enable(element);
        isViewerEnabledRef.current = true;
      }

      const imageId = `wadouri:${window.location.origin}${dicomList[selectedIndex]}`;
  
      cornerstone.loadAndCacheImage(imageId).then(image => {
        cornerstone.displayImage(element, image);
        const viewport = cornerstone.getDefaultViewportForImage(element, image);
        viewport.scale = scale;
        cornerstone.setViewport(element, viewport);
        drawOverlayLines();
      }).catch(err => {
        console.error("Error al cargar imagen:", err);
      });
    } catch (err) {
      console.error("Error inesperado en displayImage:", err);
    }
  }, [selectedIndex, dicomList, scale]);
  
  //redibuje cada vez que cambie layers o scale

      cornerstone
        .loadAndCacheImage(imageId)
        .then((image) => {
          cornerstone.displayImage(element, image);

          // Solo completamos row/col si aún no estaban
          const { pixelSpacing } = extractSpacingFromImage(image);
          setDicomSpacing((prev) => ({
            row: (prev.row ?? Number(pixelSpacing?.row)) || 1,
            col: (prev.col ?? Number(pixelSpacing?.col)) || 1,
            slice: prev.slice ?? 1, // no tocar aquí el slice
          }));

          const viewport = cornerstone.getDefaultViewportForImage(element, image);
          viewport.scale = scale;

          const imgWL = num(image.windowCenter, -600);
          const imgWW = Math.max(1, num(image.windowWidth, 1500));
          viewport.voi = {
            windowCenter: windowCenter ?? imgWL,
            windowWidth: windowWidth ?? imgWW,
          };

          cornerstone.setViewport(element, viewport);
          drawOverlayLines();
        })
        .catch((err) => {
          console.error("Error al cargar imagen:", err);
        });
    } catch (err) {
      console.error("Error inesperado en displayImage:", err);
    }
  }, [selectedIndex, dicomList, scale, windowCenter, windowWidth]);


  // Redibuja en cambios de layers o zoom
  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;
    try {
      cornerstone.getEnabledElement(element);
      drawOverlayLines();
    } catch {}
  }, [layers, scale, selectedIndex]);

useEffect(() => {
  const fetchAllEditableLayers = async () => {
    try {
      const { data: validIndexMap } = await axios.get(`/api/segment/valid-indices/${folder}`);

      const totalSlices = dicomList.length;
      const layersPorSlice = new Array(totalSlices).fill(null);

  // Aplicar VOI al cambiar sliders
  useEffect(() => {
    const el = viewerRef.current;
    if (!el || selectedIndex === null) return;
    applyVOI(el, windowCenter, windowWidth);
  }, [windowCenter, windowWidth, selectedIndex]);

  // --------- Cargar capas + volumen inicial ---------
  useEffect(() => {
    const fetchAllEditableLayers = async () => {
      try {
        const { data: validIndexMap } = await axios.get(
          `/api/segment/valid-indices/${folder}`
        );

        const entries = Object.entries(validIndexMap);
        const fetches = entries.map(async ([indexStr, filename]) => {
          const index = parseInt(indexStr);
          const padded = String(index).padStart(3, '0');

        const [modelo, editable] = await Promise.all([
          axios.get(`/api/segment/mask-json/${folder}/${padded}`).then(res => res.data).catch(() => null),
          axios.get(`/api/segment/mask-json/${folder}/${padded}_simplified`).then(res => res.data).catch(() => null)
        ]);

          const layers = [];

          if (modelo) {
            layers.push({
              name: "Pulmón (modelo)",
              points: modelo.lung || [],
              visible: true,
              color: "lime",
              closed: true,
              editable: false
            });
            layers.push({
              name: "Fibrosis (modelo)",
              points: modelo.fibrosis || [],
              visible: true,
              color: "red",
              closed: true,
              editable: false
            });
          }

          if (editable) {
            layers.push({
              name: "Pulmón (editable)",
              points: editable.lung_editable || [],
              visible: true,
              color: "yellow",
              closed: true,
              editable: true
            });
            layers.push({
              name: "Fibrosis (editable)",
              points: editable.fibrosis_editable || [],
              visible: true,
              color: "orange",
              closed: true,
              editable: true
            });
          }

          layersPorSlice[index] = layers;
        });

        await Promise.all(fetches);

        const firstImageId = `wadouri:${window.location.origin}${dicomList[0]}`;
        const image = await cornerstone.loadAndCacheImage(firstImageId);
        const { pixelSpacing, sliceThickness } = extractSpacingFromImage(image);
        const volumenGlobal = calcularVolumenEditableGlobal(layersPorSlice, pixelSpacing, sliceThickness);
        setEditableVolumen(volumenGlobal);

        setAllLayersPerSlice(layersPorSlice);
      } catch (err) {
        console.error("Error al cargar capas del modelo:", err);
      }
    };

  if (dicomList.length > 0) {
    fetchAllEditableLayers();
  }
}, [dicomList, folder]);

        await Promise.all(
          Object.entries(validIndexMap).map(async ([indexStr]) => {
            const index = parseInt(indexStr, 10);
            const padded = String(index).padStart(3, "0");

            const [modelo, editable] = await Promise.all([
              axios
                .get(`/api/segment/mask-json/${folder}/${padded}`)
                .then((r) => r.data)
                .catch(() => null),
              axios
                .get(`/api/segment/mask-json/${folder}/${padded}_simplified`)
                .then((r) => r.data)
                .catch(() => null),
            ]);

            const L = [];
            if (modelo) {
              L.push({
                name: "Pulmón (modelo)",
                points: modelo.lung || [],
                visible: true,
                color: "lime",
                closed: true,
                editable: false,
              });
              L.push({
                name: "Fibrosis (modelo)",
                points: modelo.fibrosis || [],
                visible: true,
                color: "red",
                closed: true,
                editable: false,
              });
            }
            if (editable) {
              L.push({
                name: "Pulmón (editable)",
                points: editable.lung_editable || [],
                visible: true,
                color: "yellow",
                closed: true,
                editable: true,
              });
              L.push({
                name: "Fibrosis (editable)",
                points: editable.fibrosis_editable || [],
                visible: true,
                color: "orange",
                closed: true,
                editable: true,
              });
            }

            layersPorSlice[index] = L;
          })
        );

        // Volumen global inicial usando el spacing global (o lo calculamos aquí si aún no está)
        let px = { row: Number(dicomSpacing.row) || NaN, col: Number(dicomSpacing.col) || NaN };
        let dz = Number(dicomSpacing.slice) || NaN;

        if (!Number.isFinite(px.row) || !Number.isFinite(px.col) || !Number.isFinite(dz)) {
          const robust = await getRobustStackSpacing(dicomList);
          if (robust) {
            px = { row: robust.pixelSpacing.row, col: robust.pixelSpacing.col };
            dz = robust.sliceSpacing;
            setDicomSpacing({ row: px.row, col: px.col, slice: dz });
          } else {
            px = { row: 1, col: 1 };
            dz = 1;
          }
        }

        const volumenGlobal = calcularVolumenEditableGlobal(layersPorSlice, px, dz);
        setEditableVolumen(volumenGlobal);

        // Guardar en estado
        setAllLayersPerSlice(layersPorSlice);

        // No auto-seleccionamos miniatura; el usuario hará click.
        // Si quisieras autoseleccionar el primer slice con capas:
        // const firstWithLayers = layersPorSlice.findIndex((arr) => Array.isArray(arr) && arr.length);
        // if (firstWithLayers !== -1) {
        //   setSelectedIndex(firstWithLayers);
        //   setLayers(layersPorSlice[firstWithLayers]);
        // }
      } catch (err) {
        console.error("Error al cargar capas del modelo:", err);
      }
    };

    if (dicomList.length > 0) fetchAllEditableLayers();
  }, [dicomList, folder, dicomSpacing.row, dicomSpacing.col, dicomSpacing.slice]);

  // --------- Volúmenes automáticos ---------
  useEffect(() => {
    const fetchVolumen = async () => {
      try {
        const response = await axios.get(`/api/segment/volumen/${folder}`);
        setVolumenes(response.data);
      } catch {
        setVolumenes(null);
      }
    };
    fetchVolumen();
  }, [folder]);

  // StudyView.js
const autoSavedRef = React.useRef(false);

useEffect(() => {
  (async () => {
    try {
      const { data } = await axios.get(`/api/segment/volumen/${folder}`);
      const auto = normalizeAuto(data);
      setAutoVol(auto);

      // guarda en BD solo una vez por estudio
      if (!autoSavedRef.current && auto.total != null) {
        await enviarVolumenABackend(
          nss,
          fechaSQL,
          auto.total,                      // ahora le pasamos el número directo
          "Volumen automático (modelo)",
          false                             // manual=false => volumen_automatico
        );
        autoSavedRef.current = true;
      }
    } catch (e) {
      console.warn("No se pudo obtener volumen automático:", e);
      setAutoVol(null);
    }
  })();
}, [folder, nss, fechaSQL]);



  // --------- Sincronizar al cambiar de slice ---------
  useEffect(() => {
    if (selectedIndex !== null && allLayersPerSlice[selectedIndex]) {
      setLayers(allLayersPerSlice[selectedIndex]);

      recalcGlobalVolumeInstant(selectedIndex, allLayersPerSlice[selectedIndex]);
      const currentSliceLayers = allLayersPerSlice[selectedIndex];
      const firstEditable = currentSliceLayers.findIndex((l) => l.editable);
      if (
        selectedLayerIndex == null ||
        !currentSliceLayers[selectedLayerIndex] ||
        !currentSliceLayers[selectedLayerIndex].editable
      ) {
        if (firstEditable !== -1) {
          setSelectedLayerIndex(firstEditable);
        }
      }
    }
  }, [selectedIndex, allLayersPerSlice]);
  
  useEffect(() => {

  // --------- Redibujo en render de imagen ---------
  useLayoutEffect(() => {
    const element = viewerRef.current;
    if (!element) return;
    const onRendered = () => drawOverlayLines();
    element.addEventListener(cornerstone.EVENTS.IMAGE_RENDERED, onRendered);
    return () => {
      element.removeEventListener(cornerstone.EVENTS.IMAGE_RENDERED, onRendered);
    };
  }, []);
  
  function pointToSegmentDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    const tClamped = Math.max(0, Math.min(1, t));
    const closest = { x: a.x + tClamped * dx, y: a.y + tClamped * dy };
    return Math.hypot(p.x - closest.x, p.y - closest.y);
  }

  async function saveEditableJson(index) {
    const paddedIndex = String(index).padStart(3, '0');

    const lungLayer = layers.find(l => l.name.includes("Pulmón") && l.editable);
    const fibrosisLayer = layers.find(l => l.name.includes("Fibrosis") && l.editable);
  
    // Normaliza estructura para evitar errores de parseo

  // --------- Guardado + recálculo ---------
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
      const jsonStr = JSON.stringify(jsonData);
      JSON.parse(jsonStr);

      await axios.post(`/api/segment/save-edit/${folder}/${paddedIndex}`, jsonData);
      console.log(`Guardado: mask_${paddedIndex}_simplified.json`);
  
      await axios.post(`/api/segment/save-edit/${folder}/${paddedIndex}`, jsonData);

      const updated = [...allLayersPerSlice];
      updated[index] = currentLayers;
      setAllLayersPerSlice(updated);
  
      const firstImageId = `wadouri:${window.location.origin}${dicomList[0]}`;
      const image = await cornerstone.loadAndCacheImage(firstImageId);
      const { pixelSpacing, sliceThickness } = extractSpacingFromImage(image);
      const volumenGlobal = calcularVolumenEditableGlobal(updated, pixelSpacing, sliceThickness);
      setEditableVolumen(volumenGlobal);
  
      // Recalcular volumen global con spacing global
      const px = { row: Number(dicomSpacing.row) || 1, col: Number(dicomSpacing.col) || 1 };
      const dz = Number(dicomSpacing.slice) || 1;
      const volumenGlobal = calcularVolumenEditableGlobal(updated, px, dz);
      setEditableVolumen(volumenGlobal);

      // Guardar/actualizar en BD
      await enviarVolumenABackend(
        nss,
        fechaSQL,
        volumenGlobal,
        "Ajuste manual en StudyView",
        true
      );
    } catch (err) {
      console.error("Error al guardar edición/volumen:", err);
    }
  }

// Dibuja líneas y vértices sobre canvas
const drawOverlayLines = () => {

  const canvas = overlayRef.current;
  const element = viewerRef.current;
  if (!canvas || !element) return;
  try {
    cornerstone.getEnabledElement(element);
  } catch {
    cornerstone.enable(element);
  }
  

  const rect = element.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // --------- Dibujo overlay ---------
  const drawOverlayLines = () => {
    const canvas = overlayRef.current;
    const element = viewerRef.current;
    if (!canvas || !element) return;
    try {
      cornerstone.getEnabledElement(element);
    } catch {
      cornerstone.enable(element);
    }

    const rect = element.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    (layers || []).forEach((layer) => {
      if (!layer?.visible || !layer.points || layer.points.length === 0) return;

    layers.forEach((layer) => {
      if (!layer.visible || !layer.points || layer.points.length === 0) return;

    const isMultiContour = Array.isArray(layer.points[0]);
    const allPolygons = isMultiContour ? layer.points : [layer.points];

      allPolygons.forEach(polygon => {
        if (!Array.isArray(polygon) || polygon.length < 2) return;

      // 🔐 Filtrar puntos inválidos
      const filteredPoints = polygon.filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
      if (filteredPoints.length < 2) return;
      allPolygons.forEach((polygon) => {
        if (!Array.isArray(polygon) || polygon.length < 2) return;

        const filteredPoints = polygon.filter(
          (p) => p && typeof p.x === "number" && typeof p.y === "number"
        );
        if (filteredPoints.length < 2) return;

        const screenPoints = filteredPoints.map((p) =>
          cornerstone.pixelToCanvas(element, p)
        );
        if (screenPoints.some((pt) => !pt || typeof pt.x !== "number")) return;

        const screenPoints = filteredPoints.map(p => cornerstone.pixelToCanvas(element, p));
        if (screenPoints.some(pt => !pt || typeof pt.x !== 'number')) return;

        if (layer.closed && screenPoints.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
          for (let i = 1; i < screenPoints.length; i++) {
            ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
          }
          ctx.closePath();
          ctx.fillStyle = "rgba(0,255,0,0.2)";
          ctx.fill();
        }

      ctx.beginPath();
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = 2;
      ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
      for (let i = 1; i < screenPoints.length; i++) {
        ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
      }
      if (layer.closed) ctx.lineTo(screenPoints[0].x, screenPoints[0].y);
      ctx.stroke();

      if (layer.editable) {
        screenPoints.forEach(pt => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = "red";
          ctx.fill();
        });
      }
        if (layer.editable) {
          screenPoints.forEach((pt) => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = "red";
            ctx.fill();
          });
        }
      });
    });
  });
};

  function calculatePolygonAreaMm(points, pixelSpacing) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += (points[i].x * points[j].y) - (points[j].x * points[i].y);
    }
    const pixelArea = Math.abs(area / 2);
    if (pixelSpacing && pixelSpacing.row && pixelSpacing.col) {
      return pixelArea * pixelSpacing.row * pixelSpacing.col;
    }
    return null;
  };

// aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
const handleOverlayClick = (e) => {
  const layer = layers[selectedLayerIndex];
  if (!layer || !layer.editable) return;
  // --------- Edición por click ---------
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

    setLayers(prev => {
      const updated = [...prev];
      const newLayer = { ...updated[selectedLayerIndex] };
      const isMulti = Array.isArray(newLayer.points[0]);
      const polygons = isMulti ? newLayer.points.map(p => [...p]) : [ [...newLayer.points] ];

      for (let pIdx = 0; pIdx < polygons.length; pIdx++) {
        const polygon = polygons[pIdx];
        if (!polygon || polygon.length === 0) continue;

        const screenPoints = polygon.map(p => cornerstone.pixelToCanvas(element, p));

      // Alt-click para eliminar punto
      if (e.altKey) {
        const idx = screenPoints.findIndex(pt => Math.hypot(pt.x - x, pt.y - y) < 6);
        if (idx !== -1) {
          polygon.splice(idx, 1);
          newLayer.points = isMulti ? polygons : polygons[0];
          updated[selectedLayerIndex] = newLayer;
          saveEditableJson(selectedIndex);
          return updated;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const imagePoint = cornerstone.canvasToPixel(element, { x, y });
    const threshold = 6;

    const toCanvas = (p) => cornerstone.pixelToCanvas(element, p);

    const nextLayers = layers.map((l) => ({
      ...l,
      points: Array.isArray(l.points?.[0])
        ? l.points.map((poly) => poly.map((p) => ({ ...p })))
        : Array.isArray(l.points)
        ? l.points.map((p) => ({ ...p }))
        : [],
    }));

    const layer = nextLayers[selectedLayerIndex];

    if (!layer.points) layer.points = [];
    const isMulti = Array.isArray(layer.points[0]);
    let polygons = isMulti ? layer.points : [layer.points];

    if (!polygons.length) {
      polygons = [[]];
      layer.points = isMulti ? polygons : polygons[0];
    }

    if (e.altKey) {
      for (let pIdx = 0; pIdx < polygons.length; pIdx++) {
        const spts = polygons[pIdx].map(toCanvas);
        const idx = spts.findIndex((pt) => Math.hypot(pt.x - x, pt.y - y) < threshold);
        if (idx !== -1) {
          polygons[pIdx].splice(idx, 1);
          layer.points = isMulti ? polygons : polygons[0];
          setLayers(nextLayers);
          recalcGlobalVolumeInstant(selectedIndex, nextLayers); // actualiza mL al vuelo
          saveEditableJson(selectedIndex, nextLayers);           // luego persiste
          return;
        }
      }
    }

    if (layer.closed) {
      for (let pIdx = 0; pIdx < polygons.length; pIdx++) {
        const spts = polygons[pIdx].map(toCanvas);
        for (let i = 0; i < spts.length; i++) {
          const a = spts[i];
          const b = spts[(i + 1) % spts.length];
          const dist = pointToSegmentDistance({ x, y }, a, b);
          if (dist < threshold) {
            polygons[pIdx].splice(i + 1, 0, imagePoint);
            layer.points = isMulti ? polygons : polygons[0];
            setLayers(nextLayers);
            recalcGlobalVolumeInstant(selectedIndex, nextLayers); // actualiza mL al vuelo
            saveEditableJson(selectedIndex, nextLayers);           // luego persiste
            return;
          }
        }
      }
    } else {
      const firstPoly = polygons[0];
      if (firstPoly.length >= 3) {
        const firstCanvas = toCanvas(firstPoly[0]);
        if (Math.hypot(firstCanvas.x - x, firstCanvas.y - y) < threshold) {
          layer.closed = true;
          layer.points = isMulti ? polygons : polygons[0];
            setLayers(nextLayers);
            recalcGlobalVolumeInstant(selectedIndex, nextLayers); // actualiza mL al vuelo
            saveEditableJson(selectedIndex, nextLayers);           // luego persiste
          return;
        }
      }

      // Click cerca del borde para insertar punto
      if (newLayer.closed && screenPoints.length >= 2) {
        const insertThreshold = 6;
        for (let i = 0; i < screenPoints.length; i++) {
          const a = screenPoints[i];
          const b = screenPoints[(i + 1) % screenPoints.length];
          if (!a || !b) continue;

            const dist = pointToSegmentDistance({ x, y }, a, b);
            if (dist < insertThreshold) {
              polygon.splice(i + 1, 0, imagePoint);
              newLayer.points = isMulti ? polygons : polygons[0];
              updated[selectedLayerIndex] = newLayer;
              saveEditableJson(selectedIndex);
              return updated;
            }
          }
        } else {
          // Cierre automático si clic cerca del primero
          if (polygon.length >= 3) {
            const first = polygon[0];
            if (Math.hypot(imagePoint.x - first.x, imagePoint.y - first.y) < 6) {
              newLayer.closed = true;
              updated[selectedLayerIndex] = newLayer;
              saveEditableJson(selectedIndex);
              return updated;
            }
          }

          // Añadir punto nuevo
          const tooClose = screenPoints.some(pt => Math.hypot(pt.x - x, pt.y - y) < 6);
          if (!tooClose) {
            polygon.push(imagePoint);
            newLayer.points = isMulti ? polygons : polygons[0];
            updated[selectedLayerIndex] = newLayer;
            saveEditableJson(selectedIndex);
            return updated;
          }
        }
      }

    return updated;
  });
};
      const spts = (polygons[0] || []).map(toCanvas);
      const tooClose = spts.some((pt) => Math.hypot(pt.x - x, pt.y - y) < threshold);
      if (!tooClose) {
        polygons[0].push(imagePoint);
        layer.points = isMulti ? polygons : polygons[0];
            setLayers(nextLayers);
            recalcGlobalVolumeInstant(selectedIndex, nextLayers); // actualiza mL al vuelo
            saveEditableJson(selectedIndex, nextLayers);           // luego persiste
        return;
      }
    }
  };
  // --------- Drag de vértices + pan ---------
  useEffect(() => {
    const canvas = overlayRef.current;
    const element = viewerRef.current;
    const layer = layers[selectedLayerIndex];
    if (!layer || !layer.editable) return;
    if (!canvas || !element) return;
    const getMouseCoords = (canvas, e) => {
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
    
      setWasDragging(false);

      if (!layer || !layer.editable) return;

      setWasDragging(false);

      const { x, y } = getMouseCoords(canvas, e);
      const isMulti = Array.isArray(layer.points[0]);
      const polygons = isMulti ? layer.points : [layer.points];

      for (let pIdx = 0; pIdx < polygons.length; pIdx++) {
        const screenPoints = polygons[pIdx].map((p) =>
          cornerstone.pixelToCanvas(element, p)
        );
        screenPoints.forEach((pt, i) => {
          if (Math.hypot(pt.x - x, pt.y - y) < 6) {
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
  
      if (draggingIndexRef.current !== null) {
        const { pIdx, i } = draggingIndexRef.current;
        const { x, y } = getMouseCoords(canvas, e);
        const imageCoords = cornerstone.canvasToPixel(element, { x, y });
        setLayers(prev => {
          const updated = [...prev];
          const layer = { ...updated[selectedLayerIndex] };
          const isMulti = Array.isArray(layer.points[0]);
          const polygons = isMulti ? [...layer.points] : [[...layer.points]];

          if (draggingIndex) {
            polygons[draggingIndex.pIdx][draggingIndex.i] = imageCoords;
          }

          layer.points = isMulti ? polygons : polygons[0];
          updated[selectedLayerIndex] = layer;

          // Guardar automáticamente el JSON después de mover un punto
          saveEditableJson(selectedIndex);

          return updated;
        });

        drawOverlayLines();
      }
    };

    const stopInteraction = () => {
      // Si no estamos arrastrando un punto, salir
      const di = draggingIndexRef.current;
      if (!di) return;

      const { x, y } = getMouseCoords(canvas, e);
      const imageCoords = cornerstone.canvasToPixel(element, { x, y });

      // Usar el estado más fresco del slice actual
      const baseSliceLayers = layersRef.current || [];
      if (!baseSliceLayers[selectedLayerIndex]) return;

      // Snapshot profundo del slice actual
      const updatedSlice = baseSliceLayers.map(l => ({
        ...l,
        points: Array.isArray(l.points?.[0])
          ? l.points.map(poly => poly.map(p => ({ ...p })))
          : (Array.isArray(l.points) ? l.points.map(p => ({ ...p })) : [])
      }));

      // Actualiza el punto arrastrado
      const lay = updatedSlice[selectedLayerIndex];
      const isMulti = Array.isArray(lay.points[0]);
      const polygons = isMulti ? lay.points : [lay.points];
      const { pIdx, i } = di;

      if (polygons[pIdx] && polygons[pIdx][i]) {
        polygons[pIdx][i] = imageCoords;
      }
      lay.points = isMulti ? polygons : polygons[0];
      updatedSlice[selectedLayerIndex] = lay;

      // Refleja en UI
      setLayers(updatedSlice);
      drawOverlayLines();
      setWasDragging(true);

      // 🔁 Recalcula el volumen global al vuelo, sin guardar todavía
      recalcGlobalVolumeInstant(selectedIndex, updatedSlice);
    };
    const stopInteraction = async () => {
      setDraggingIndex(null);
      draggingIndexRef.current = null;
      setIsPanning(false);
      setLastPanPosition(null);
    };
      // Guardar SOLO si hubo drag real
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
  }, [layers, selectedLayerIndex, draggingIndex, isPanning, lastPanPosition]);
  
}, [layers, selectedLayerIndex, isPanning, lastPanPosition, selectedIndex, recalcGlobalVolumeInstant]);

  // --------- Zoom ---------
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

  // --------- UI ---------
  if (loading) return <p style={{ padding: "2rem" }}>Cargando estudio…</p>;
  if (error) return <p style={{ padding: "2rem", color: "red" }}>{error}</p>;
  const huMin = Math.round(windowCenter - windowWidth / 2);
  const huMax = Math.round(windowCenter + windowWidth / 2);

  return (
    <>
      <div style={{ padding: "2rem" }}>
        <h2>Estudio - {fechaOriginal}</h2>
        <button onClick={() => navigate(-1)}>← Volver</button>
  
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 150px)", gap: "1rem", marginTop: "2rem" }}>

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
                if (
                  el &&
                  !cornerstone.getEnabledElements().some((e) => e.element === el)
                ) {
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

            {/* ------- NUEVO: Controles HU (WW/WL) + presets ------- */}
            <div style={{ color: "#fff", marginBottom: "1rem" }}>
              <div style={{ fontWeight: "bold", marginBottom: 6 }}>Visualización HU (WW/WL)</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <button className="btn" onClick={() => setPreset("lung")}>Pulmón</button>
                <button className="btn" onClick={() => setPreset("ggo")}>Fibrosis/Vidrio</button>
                <button className="btn" onClick={() => setPreset("soft")}>Partes blandas</button>
                <button className="btn" onClick={() => setPreset("bone")}>Hueso</button>
              </div>

              <div style={{ marginBottom: 6 }}>
                <label>WL (Level): {Math.round(windowCenter)}&nbsp;HU</label>
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
                <label>WW (Width): {Math.round(windowWidth)}&nbsp;HU</label>
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

            {volumenes && (
              <div style={{ color: "#fff", marginBottom: "1rem" }}>
                <div><strong>Volumen pulmón:</strong> {volumenes.lung_volume_ml} ml</div>
                <div><strong>Volumen fibrosis:</strong> {volumenes.fibrosis_volume_ml} ml</div>
                <div><strong>Total:</strong> {volumenes.total_volume_ml} ml</div>
              </div>
            )}

            <div>
              <label style={{ color: "#fff" }}>Zoom:</label>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.01"
                value={scale}
                onChange={handleZoomChange}
              />
            </div>

            <div style={{ marginTop: "1rem" }}>
              <button
                className="btn"
                onClick={() => setSelectedIndex(prev => Math.max(0, prev - 1))}
                disabled={selectedIndex === 0}
              >
                Anterior
              </button>
              <button
                className="btn"
                onClick={() => setSelectedIndex(prev => Math.min(dicomList.length - 1, prev + 1))}
                disabled={selectedIndex === dicomList.length - 1}
              >
                Siguiente
              </button>
            </div>

            {layers.length > 0 && (
              <>
                <p style={{ color: "#fff", marginTop: "1rem" }}>Capas:</p>
                {layers.map((layer, i) => (
                  <label key={i} style={{ color: "#fff", display: "block" }}>
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={() => {
                        const updated = [...layers];
                        updated[i].visible = !updated[i].visible;
                        setLayers(updated);
                      }}
                    />{" "}
                    {layer.name}
                  </label>
                ))}

        <div style={{ marginTop: "1rem", color: "#fff" }}>
          <label>Editar capa:</label>
          <select
            value={selectedLayerIndex}
            onChange={(e) => setSelectedLayerIndex(parseInt(e.target.value))}
          >
            {layers.map((layer, i) =>
              layer.editable ? (
                <option key={i} value={i}>
                  {layer.name}
                </option>
              ) : null
            )}
          </select>
          <div className="sidebar-panel">
            <div className="sidebar-header">
              <strong>
                Imagen {selectedIndex + 1} / {dicomList.length}
              </strong>
              <button className="btn" onClick={() => setSelectedIndex(null)}>
                Cerrar
              </button>
            </div>

            <div style={{ color: "#fff", marginBottom: "1rem" }}>
              <div style={{ fontWeight: "bold", marginBottom: 6 }}>
                Visualización HU (WW/WL)
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <button className="btn" onClick={() => setPreset("lung")}>
                  Pulmón
                </button>
                <button className="btn" onClick={() => setPreset("ggo")}>
                  Fibrosis/Vidrio
                </button>
                <button className="btn" onClick={() => setPreset("soft")}>
                  Partes blandas
                </button>
                <button className="btn" onClick={() => setPreset("bone")}>
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
                  onChange={(e) =>
                    setWindowCenter(clamp(+e.target.value, -1000, 1000))
                  }
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
                  onChange={(e) =>
                    setWindowWidth(clamp(+e.target.value, 1, 3000))
                  }
                />
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Rango efectivo: [{huMin}, {huMax}] HU
              </div>
            </div>

            {volumenes && (
              <div style={{ color: "#fff", marginBottom: "1rem" }}>
                <div>
                  <strong>Volumen pulmón (auto):</strong>{" "}
                  {volumenes.lung_volume_ml} ml
                </div>
                <div>
                  <strong>Volumen fibrosis (auto):</strong>{" "}
                  {volumenes.fibrosis_volume_ml} ml
                </div>
                <div>
                  <strong>Total (auto):</strong> {volumenes.total_volume_ml} ml
                </div>
              </div>
            )}
            {/* {autoVol && (
                <div style={{ color: "#fff", marginBottom: "1rem" }}>
                  <div><strong>Volumen pulmón (auto):</strong> {autoVol.lung ?? "—"} ml</div>
                  <div><strong>Volumen fibrosis (auto):</strong> {autoVol.fibrosis ?? "—"} ml</div>
                  <div><strong>Total (auto):</strong> {autoVol.total ?? "—"} ml</div>
                </div>
              )} */}
            <div>
              <label style={{ color: "#fff" }}>Zoom:</label>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.01"
                value={scale}
                onChange={handleZoomChange}
              />
            </div>

            <div style={{ marginTop: "1rem" }}>
              <button
                className="btn"
                onClick={() => setSelectedIndex((prev) => Math.max(0, prev - 1))}
                disabled={selectedIndex === 0}
              >
                Anterior
              </button>
              <button
                className="btn"
                onClick={() =>
                  setSelectedIndex((prev) =>
                    Math.min(dicomList.length - 1, prev + 1)
                  )
                }
                disabled={selectedIndex === dicomList.length - 1}
              >
                Siguiente
              </button>
            </div>

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
                  <select
                    value={selectedLayerIndex}
                    onChange={(e) =>
                      setSelectedLayerIndex(parseInt(e.target.value, 10))
                    }
                  >
                    {layers.map((layer, i) =>
                      layer.editable ? (
                        <option key={i} value={i}>
                          {layer.name}
                        </option>
                      ) : null
                    )}
                  </select>
                </div>
              </>
            )}

            {editableVolumen && (
              <div style={{ color: "#fff", marginTop: "1rem" }}>
                <div>
                  <strong>Pulmón (editable):</strong>{" "}
                  {editableVolumen.editableLungVolume} ml
                </div>
                <div>
                  <strong>Fibrosis (editable):</strong>{" "}
                  {editableVolumen.editableFibrosisVolume} ml
                </div>
                <div>
                  <strong>Total (editable):</strong>{" "}
                  {editableVolumen.editableTotalVolume} ml
                </div>
              </div>
            )}
          </div>

          <div className="main-panel">
            <div ref={viewerRef} className="fullscreen-viewer" />
            <canvas
              ref={overlayRef}
              className="overlay-canvas"
              onClick={handleOverlayClick}
            />
          </div>
        </div>
      </>
    )}
  </div>

          <div className="main-panel">
            <div ref={viewerRef} className="fullscreen-viewer" />
            <canvas
              ref={overlayRef}
              className="overlay-canvas"
              onClick={handleOverlayClick}
            />
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
<<<<<<< Updated upstream


            .sidebar-panel {
              width: 280px;
              background: #111;
              color: white;
              padding: 1rem;
              display: flex;
              flex-direction: column;
              height: 100vh;
              overflow-y: auto;
              box-shadow: 2px 0 6px rgba(0, 0, 0, 0.4);
            }

            .main-panel {
              flex: 1;
              position: relative;
              height: 100vh;
            }

            .sidebar-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 1rem;
            }

  
        .fullscreen-header {
          width: 100%;
          max-width: 960px;
          display: flex;
          justify-content: space-between;
          padding: 1rem;
          color: white;
        }
  
        .fullscreen-container {
          position: relative;
          width: 90%;
          max-width: 960px;
          height: 80vh;
        }
  
        .fullscreen-viewer {
          width: 100%;
          height: 100%;
          background: black;
          border-radius: 12px;
        }
  
        .overlay-canvas {
          position: absolute;
          top: 0; left: 0;
          width: 100%; height: 100%;
          pointer-events: auto;
        }
  
        .fullscreen-controls {
          margin-top: 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }
  
        .btn {
          padding: 0.5rem 1.2rem;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9rem;
          margin: 0 0.5rem;
        }
  
        input[type="range"] {
          width: 300px;
        }
      `}</style>
    </>
  );
} // Fin del componente StudyView
=======
.sidebar-panel {
  width: 300px; background: #111; color: #fff;
  padding: 1rem; display: flex; flex-direction: column;
  height: 100vh; overflow-y: auto; box-shadow: 2px 0 6px rgba(0,0,0,0.4);
}
.main-panel { flex: 1; position: relative; height: 100vh; }
.sidebar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.fullscreen-viewer { width: 100%; height: 100%; background: black; border-radius: 12px; }
.overlay-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: auto; }
.btn {
  padding: 0.5rem 0.7rem; background: #0ea5e9; color: #fff; border: none;
  border-radius: 6px; cursor: pointer; font-size: 0.85rem;
}
input[type="range"] { width: 100%; }
      `}</style>
    </>
  );
}
