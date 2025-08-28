/**
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
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import * as cornerstone from "cornerstone-core";
import * as cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import * as dicomParser from "dicom-parser";
import { EVENTS } from "cornerstone-core";
import {
  calcularVolumenEditable,
  calcularAreaTotal,
  calcularVolumenEditableDesdeImage,
  extractSpacingFromImage,
  calcularVolumenEditableGlobal
} from "./volumenCalculator"; // Importa las funciones de cálculo de área y volumen desde volumenCalculator.js

// Configuración global para Cornerstone
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({ beforeSend: () => {} });

export default function StudyView() {
  const { id: nss, studyNumber } = useParams();
  const navigate = useNavigate();

  const viewerRef = useRef();
  const overlayRef = useRef();

  const [dicomList, setDicomList] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [allLayersPerSlice, setAllLayersPerSlice] = useState([]);  // Estado para las capas dibujadas
  const [layers, setLayers] = useState([]);
  const [scale, setScale] = useState(1);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLayerIndex, setSelectedLayerIndex] = useState(0); // index de la capa activa
  const [wasDragging, setWasDragging] = useState(false);

  const [dicomSpacing, setDicomSpacing] = useState({ row: 1, col: 1, slice: 1 }); // mm
  const [dims3D, setDims3D] = useState([0, 0, 0]); // [width(cols), height(rows), depth(slices)]


  // const [pixelSpacing, setPixelSpacing] = useState(null);
  const [originalContours, setOriginalContours] = useState([]); // Solo para mostrar las coordinadas originales del modelo, no se uso alch
  const [editableContours, setEditableContours] = useState([]); // Editable por el usuario coordinadas copia
  const [totalArea, setTotalArea] = useState(0);
  const draggingIndexRef = useRef(null);

  const fechaOriginal = decodeURIComponent(studyNumber);
  const safeFecha = fechaOriginal.replace(/[:\. ]/g, "_");
  const folder = `${nss}_${safeFecha}`;

  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState(null);

  const [volumenes, setVolumenes] = useState(null); //estado para los volúmenes
  const [editableVolumen, setEditableVolumen] = useState(null);

  const isViewerEnabledRef = useRef(false);


  // Cargar lista de archivos DICOM desde backend
  useEffect(() => {
    axios.get(`/api/image/dicom-list/${folder}`)
      .then(({ data }) => {
        const urls = data.map(file => `/api/image/dicom/${folder}/${encodeURIComponent(file)}`);
        setDicomList(urls);
      })
      .catch(() => setError("No se pudieron obtener los archivos DICOM."))
      .finally(() => setLoading(false));
  }, [folder]);

  useEffect(() => {
    draggingIndexRef.current = draggingIndex;
  }, [draggingIndex]); // sincroniza draggingIndexRef en cada cambio

  // Cargar y mostrar imagen seleccionada
  useEffect(() => {
    const element = viewerRef.current;
    if (!element || selectedIndex === null || !dicomList[selectedIndex]) return;
  
    try {
      if (!isViewerEnabledRef.current) {
        try {
          cornerstone.enable(element);
          isViewerEnabledRef.current = true;
        } catch (e) {
          console.warn("No se pudo habilitar el viewer:", e);
        }
      }
  
      const imageId = `wadouri:${window.location.origin}${dicomList[selectedIndex]}`;
  
      cornerstone.loadAndCacheImage(imageId)
        .then(image => {
          cornerstone.displayImage(element, image);

          // 👇 EXTRAER SPACING/SIZE AQUÍ (dentro del .then!)
          const { pixelSpacing, sliceThickness } = extractSpacingFromImage(image);

          // spacing para VTK: [X=col, Y=row, Z=slice]
          const spacingArr = [
            parseFloat(pixelSpacing?.col ?? pixelSpacing?.x ?? 1) || 1,
            parseFloat(pixelSpacing?.row ?? pixelSpacing?.y ?? 1) || 1,
            parseFloat(sliceThickness ?? image?.data?.string?.('x00180050') ?? 1) || 1,
          ];

          // dims para VTK: [cols, rows, slices]
          const dimsArr = [
            image?.columns || image?.width || 0,
            image?.rows || image?.height || 0,
            dicomList.length || 0,
          ];

          // Guardar en estado (útil si después quieres abrir el 3D con esto)
          setDicomSpacing({ row: spacingArr[1], col: spacingArr[0], slice: spacingArr[2] });
          setDims3D(dimsArr);

          // LOG claro para depurar
          console.log('[DICOM] Spacing mm ->', {
            col_mm: spacingArr[0],
            row_mm: spacingArr[1],
            slice_mm: spacingArr[2],
            rawPixelSpacing: pixelSpacing,
            rawSliceThickness: sliceThickness,
          });
          console.log('[DICOM] Dims ->', { columns: dimsArr[0], rows: dimsArr[1], slices: dimsArr[2] });

          const viewport = cornerstone.getDefaultViewportForImage(element, image);
          viewport.scale = scale;
          cornerstone.setViewport(element, viewport);
          drawOverlayLines();
        })
        .catch(err => {
          console.error("Error al cargar imagen:", err);
        });

    } catch (err) {
      console.error("Error inesperado en displayImage:", err);
    }
  }, [selectedIndex, dicomList, scale]);
  
  //redibuje cada vez que cambie layers o scale
  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;
    try {
      cornerstone.getEnabledElement(element);
      drawOverlayLines();
    } catch {
      // Elemento no habilitado todavía
    }
  }, [layers, scale, selectedIndex]);

useEffect(() => {
  const fetchAllEditableLayers = async () => {
    try {
      const { data: validIndexMap } = await axios.get(`/api/segment/valid-indices/${folder}`);

      const totalSlices = dicomList.length;
      const layersPorSlice = new Array(totalSlices).fill(null);

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

  
  useEffect(() => {
    const fetchVolumen = async () => {
      try {
        const response = await axios.get(`/api/segment/volumen/${folder}`);
        setVolumenes(response.data);
      } catch (err) {
        console.warn("No se pudo cargar volumenes.json:", err);
        setVolumenes(null);
      }
    };
  
    fetchVolumen();
  }, [folder]);

  useEffect(() => {
    if (selectedIndex !== null && allLayersPerSlice[selectedIndex]) {
      setLayers(allLayersPerSlice[selectedIndex]);
  
      const currentSliceLayers = allLayersPerSlice[selectedIndex];
      if (
        selectedLayerIndex == null || 
        !currentSliceLayers[selectedLayerIndex] || 
        !currentSliceLayers[selectedLayerIndex].editable
      ) {
        const firstEditable = currentSliceLayers.findIndex(l => l.editable);
        if (firstEditable !== -1) {
          setSelectedLayerIndex(firstEditable);
        }
      }
    }
  }, [selectedIndex, allLayersPerSlice]);
  
  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;
    const handler = () => drawOverlayLines();
    cornerstone.events.addEventListener(element, EVENTS.VIEWPORT_MODIFIED, handler);
    return () => cornerstone.events.removeEventListener(element, EVENTS.VIEWPORT_MODIFIED, handler);
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
      JSON.parse(jsonStr); // Validación rápida
  
      await axios.post(`/api/segment/save-edit/${folder}/${paddedIndex}`, jsonData);
      console.log(`Guardado: mask_${paddedIndex}_simplified.json`);
  
      const updated = [...allLayersPerSlice];
      updated[index] = layers;
      setAllLayersPerSlice(updated);
  
      const firstImageId = `wadouri:${window.location.origin}${dicomList[0]}`;
      const image = await cornerstone.loadAndCacheImage(firstImageId);
      const { pixelSpacing, sliceThickness } = extractSpacingFromImage(image);
      const volumenGlobal = calcularVolumenEditableGlobal(updated, pixelSpacing, sliceThickness);
      setEditableVolumen(volumenGlobal);
  
    } catch (err) {
      console.error("Error al guardar JSON editable:", err);
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

  layers.forEach((layer) => {
    if (!layer.visible || !layer.points || layer.points.length === 0) return;

    const isMultiContour = Array.isArray(layer.points[0]);
    const allPolygons = isMultiContour ? layer.points : [layer.points];

    allPolygons.forEach(polygon => {
      if (!Array.isArray(polygon) || polygon.length < 2) return;

      // 🔐 Filtrar puntos inválidos
      const filteredPoints = polygon.filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
      if (filteredPoints.length < 2) return;

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
  
    // Convertir a mm²
    if (pixelSpacing && pixelSpacing.row && pixelSpacing.col) {
      return pixelArea * pixelSpacing.row * pixelSpacing.col;
    }
    return null; // no se puede calcular sin spacing
  }

// aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
const handleOverlayClick = (e) => {
  const layer = layers[selectedLayerIndex];
  if (!layer || !layer.editable) return;

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
            // Guarda después de modificar
          saveEditableJson(selectedIndex);
          return updated;
        }
      }
    }

    return updated;
  });
};



  // Soporte para arrastrar vértices
  useEffect(() => {
    const canvas = overlayRef.current;
    const element = viewerRef.current;

    const layer = layers[selectedLayerIndex];
    if (!layer || !layer.editable) return;
    if (!canvas || !element) return;
  
    const handleMouseDown = (e) => {
      if (e.button === 1) {
        e.preventDefault();
        setIsPanning(true);
        setLastPanPosition({ x: e.clientX, y: e.clientY });
        return;
      }
    
      setWasDragging(false);
    
      // Verifica existencia y que sea editable
      // const layer = layers[selectedLayerIndex];
      if (!layer || !layer.editable) return;
    
      const { x, y } = getMouseCoords(canvas, e);
      const isMulti = Array.isArray(layer.points[0]);
      const polygons = isMulti ? layer.points : [layer.points];
    
      for (let pIdx = 0; pIdx < polygons.length; pIdx++) {
        const screenPoints = polygons[pIdx].map(p => cornerstone.pixelToCanvas(element, p));
        screenPoints.forEach((pt, i) => {
          if (Math.hypot(pt.x - x, pt.y - y) < 6) {
            console.log("→ Dragging point", i, "in polygon", pIdx); // DEBUG
            setDraggingIndex({ pIdx, i });
          }
        });
      }
    };
    
  // esto se repite
    const handleMouseMove = (e) => {
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
      setDraggingIndex(null);
      draggingIndexRef.current = null;
      setIsPanning(false);
      setLastPanPosition(null);
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
  
  

  const getMouseCoords = (canvas, e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

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

  // UI rendering
  if (loading) return <p style={{ padding: "2rem" }}>Cargando estudio…</p>;
  if (error) return <p style={{ padding: "2rem", color: "red" }}>{error}</p>;
  
  return (
    <>
      <div style={{ padding: "2rem" }}>
        <h2>Estudio - {fechaOriginal}</h2>
        <button onClick={() => navigate(-1)}>← Volver</button>
  
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 150px)", gap: "1rem", marginTop: "2rem" }}>
          {dicomList.map((url, i) => (
            <div
              key={i}
              className="thumb"
              onClick={() => setSelectedIndex(i)}
              ref={async (el) => {
                if (el && !cornerstone.getEnabledElements().some(e => e.element === el)) {
                  try {
                    cornerstone.enable(el);
                    const image = await cornerstone.loadAndCacheImage(`wadouri:${window.location.origin}${url}`);
                    cornerstone.displayImage(el, image);
                  } catch {}
                }
              }}
              
              style={{
                background: "black",
                borderRadius: "8px",
                height: "150px"
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

    {/* <div style={{ marginBottom: "1rem" }}>
      <button
        className="btn"
        onClick={() => {
          setLayers(prev => {
            const updated = [...prev];
            if (updated[selectedLayerIndex]) {
              updated[selectedLayerIndex] = {
                ...updated[selectedLayerIndex],
                points: [],
                closed: false
              };
            }
            saveEditableJson(selectedIndex);  // guardar después de limpiar
            return updated;
          });
        }}
      >
        Limpiar capa activa
      </button>
    </div> */}

    {volumenes && (
      <div style={{ color: "#fff", marginBottom: "1rem" }}>
        <div><strong>Volumen pulmón:</strong> {volumenes.lung_volume_ml} ml</div>
        <div><strong>Volumen fibrosis:</strong> {volumenes.fibrosis_volume_ml} ml</div>
        <div><strong>Total:</strong> {volumenes.total_volume_ml} ml</div>
      </div>
    )}
    {/* {editableVolumen && (
      <div style={{ color: "#fff", marginBottom: "1rem" }}>
        <div><strong>Edit. pulmón:</strong> {editableVolumen.editableLungVolume} ml</div>
        <div><strong>Edit. fibrosis:</strong> {editableVolumen.editableFibrosisVolume} ml</div>
        <div><strong>Edit. total:</strong> {(
          editableVolumen.editableLungVolume + editableVolumen.editableFibrosisVolume
        ).toFixed(2)} ml</div>
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
  position: fixed;           /* Para que flote sobre todo */
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: row;
  gap: 0;
  background: #000;          /* opcional, pero útil como fondo */
  z-index: 9999;             /* Para estar al frente de todo */
}


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