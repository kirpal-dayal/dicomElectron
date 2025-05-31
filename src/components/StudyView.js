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
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import * as cornerstone from "cornerstone-core";
import * as cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import * as dicomParser from "dicom-parser";
import { EVENTS } from "cornerstone-core";

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
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [scale, setScale] = useState(1);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isPolygonClosed, setIsPolygonClosed] = useState(false); //nuevo estado para saber si la figura está cerrada
  const [wasDragging, setWasDragging] = useState(false);
  const [pixelSpacing, setPixelSpacing] = useState(null);


  const fechaOriginal = decodeURIComponent(studyNumber);
  const safeFecha = fechaOriginal.replace(/[:\. ]/g, "_");
  const folder = `${nss}_${safeFecha}`;

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

  // Cargar y mostrar imagen seleccionada
  useEffect(() => {
    const element = viewerRef.current;
    if (!element || selectedIndex === null || !dicomList[selectedIndex]) return;

    cornerstone.enable(element);
    const imageId = `wadouri:${window.location.origin}${dicomList[selectedIndex]}`;
    
    cornerstone.loadAndCacheImage(imageId).then(image => {
      cornerstone.displayImage(element, image);
      const viewport = cornerstone.getDefaultViewportForImage(element, image);
      viewport.scale = scale;
      cornerstone.setViewport(element, viewport);
    
      // EXTRAER PIXEL SPACING
      const spacingStr = image.data.string('x00280030'); // e.g. "0.5\\0.5"
      if (spacingStr) {
        const [rowSpacing, colSpacing] = spacingStr.split('\\').map(parseFloat);
        setPixelSpacing({ row: rowSpacing, col: colSpacing });
      } else {
        setPixelSpacing(null); // fallback
      }
    });
    return () => {
      try { cornerstone.disable(element); } catch {}
    };
  }, [selectedIndex, dicomList, scale]);

  // Redibuja líneas de overlay cada vez que cambian los puntos
  useLayoutEffect(() => {
    requestAnimationFrame(drawOverlayLines);
  }, [drawingPoints, isPolygonClosed]);

  // Maneja redibujo cuando se hace zoom o pan
  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;
    const handler = () => drawOverlayLines();
    cornerstone.events.addEventListener(element, EVENTS.VIEWPORT_MODIFIED, handler);
    return () => cornerstone.events.removeEventListener(element, EVENTS.VIEWPORT_MODIFIED, handler);
  }, []);

  // Dibuja líneas y vértices sobre canvas
  const drawOverlayLines = () => {
    const canvas = overlayRef.current;
    const element = viewerRef.current;
    if (!canvas || !element) return;
  
    const rect = element.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  
    const screenPoints = drawingPoints.map(p => cornerstone.pixelToCanvas(element, p));
    if (screenPoints.length === 0) return;
  
    // Área sombreada si el polígono está cerrado
    if (isPolygonClosed && screenPoints.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
      for (let i = 1; i < screenPoints.length; i++) {
        ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(0, 255, 0, 0.42)"; // Verde con opacidad
      ctx.fill();
    }
  
    // Líneas del contorno
    ctx.beginPath();
    ctx.strokeStyle = "lime";
    ctx.lineWidth = 2;
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
    for (let i = 1; i < screenPoints.length; i++) {
      ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
    }
    if (isPolygonClosed && screenPoints.length > 2) {
      ctx.lineTo(screenPoints[0].x, screenPoints[0].y);
    }
    ctx.stroke();
  
    // Puntos individuales
    screenPoints.forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "red";
      ctx.fill();
    });
  
    // Área como texto si el polígono está cerrado
    if (isPolygonClosed && drawingPoints.length >= 3) {
      const areaMm2 = calculatePolygonAreaMm(drawingPoints, pixelSpacing);
      const center = screenPoints.reduce((acc, pt) => ({
        x: acc.x + pt.x,
        y: acc.y + pt.y,
      }), { x: 0, y: 0 });
      center.x /= screenPoints.length;
      center.y /= screenPoints.length;
  
      ctx.fillStyle = "white";
      ctx.font = "16px sans-serif";
      ctx.fillText(
        areaMm2 ? `Área: ${areaMm2.toFixed(2)} mm²` : "Área: -",
        center.x + 10,
        center.y
      );
    }
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
  
  function pointToSegmentDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    const tClamped = Math.max(0, Math.min(1, t));
    const closest = {
      x: a.x + tClamped * dx,
      y: a.y + tClamped * dy,
    };
    return Math.hypot(p.x - closest.x, p.y - closest.y);
  }
  // Calcula el área de un polígono dado sus puntos
  function calculatePolygonArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += (points[i].x * points[j].y) - (points[j].x * points[i].y);
    }
    return Math.abs(area / 2);
  }
  const handleOverlayClick = (e) => {
    const element = viewerRef.current;
    const canvas = overlayRef.current;
    if (wasDragging || !element || !canvas) return;
  
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const imagePoint = cornerstone.canvasToPixel(element, { x, y });
  
    const screenPoints = drawingPoints.map(p => cornerstone.pixelToCanvas(element, p));
    const clickPoint = { x, y };
  
    // ✅ ELIMINAR punto si presiona Alt (o e.shiftKey si prefieres)
    if (e.altKey) {
      const removeThreshold = 6; // px
      const indexToRemove = screenPoints.findIndex(pt =>
        Math.hypot(pt.x - x, pt.y - y) < removeThreshold
      );
      if (indexToRemove !== -1) {
        const updated = [...drawingPoints];
        updated.splice(indexToRemove, 1);
        setDrawingPoints(updated);
        return;
      }
    }
  
    // 🔁 Inserta puntos si el polígono ya está cerrado
    if (isPolygonClosed) {
      const insertThreshold = 6;
      for (let i = 0; i < screenPoints.length - 1; i++) {
        const a = screenPoints[i];
        const b = screenPoints[i + 1];
        const dist = pointToSegmentDistance(clickPoint, a, b);
        if (dist < insertThreshold) {
          const newDrawingPoints = [...drawingPoints];
          newDrawingPoints.splice(i + 1, 0, imagePoint);
          setDrawingPoints(newDrawingPoints);
          return;
        }
      }
  
      const a = screenPoints[screenPoints.length - 1];
      const b = screenPoints[0];
      const dist = pointToSegmentDistance(clickPoint, a, b);
      if (dist < insertThreshold) {
        const newDrawingPoints = [...drawingPoints, imagePoint];
        setDrawingPoints(newDrawingPoints);
      }
  
      return;
    }
  
    // ➕ Agrega nuevo punto si no está cerca de otro
    if (drawingPoints.length > 2) {
      const first = drawingPoints[0];
      const distToFirst = Math.hypot(imagePoint.x - first.x, imagePoint.y - first.y);
      if (distToFirst < 6) {
        setIsPolygonClosed(true);
        requestAnimationFrame(() => drawOverlayLines());
        return;
      }
    }
  
    const last = drawingPoints[drawingPoints.length - 1];
    if (last && Math.hypot(imagePoint.x - last.x, imagePoint.y - last.y) < 2) return;
  
    const threshold = 6;
    const tooCloseToExisting = screenPoints.some(pt =>
      Math.hypot(pt.x - clickPoint.x, pt.y - clickPoint.y) < threshold
    );
    if (tooCloseToExisting) return;
  
    setDrawingPoints([...drawingPoints, imagePoint]);
  };
  

  // Soporte para arrastrar vértices
  useEffect(() => {
    const canvas = overlayRef.current;
    const element = viewerRef.current;
    if (!canvas || !element) return;

    const onMouseDown = (e) => {
      setWasDragging(false); // inicia sin drag para que no se considere un arrastre al hacer clic
      const { x, y } = getMouseCoords(canvas, e);
      drawingPoints.forEach((p, i) => {
        const screen = cornerstone.pixelToCanvas(element, p);
        if (Math.hypot(screen.x - x, screen.y - y) < 6) {
          setDraggingIndex(i);
        }
      });
    };
    const onMouseMove = (e) => {
      if (draggingIndex === null) return;
      setWasDragging(true);
      const { x, y } = getMouseCoords(canvas, e);
      const imageCoords = cornerstone.canvasToPixel(element, { x, y });
    
      setDrawingPoints(prev => {
        const copy = [...prev];
        copy[draggingIndex] = imageCoords;
        return copy;
      });
    
      drawOverlayLines();
    };    

    const stopDragging = () => setDraggingIndex(null);

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", stopDragging);
    canvas.addEventListener("mouseleave", stopDragging);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", stopDragging);
      canvas.removeEventListener("mouseleave", stopDragging);
    };
  }, [drawingPoints, draggingIndex]);

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
    <div style={{ padding: "2rem" }}>
      <h2>Estudio - {fechaOriginal}</h2>
      <button onClick={() => navigate(-1)}>← Volver</button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 150px)", gap: "1rem", marginTop: "2rem" }}>
        {dicomList.map((url, i) => (
          <div key={i} className="thumb" onClick={() => setSelectedIndex(i)} ref={async el => {
            if (el) {
              try {
                cornerstone.enable(el);
                const image = await cornerstone.loadAndCacheImage(`wadouri:${window.location.origin}${url}`);
                cornerstone.displayImage(el, image);
              } catch {}
            }
          }} style={{ background: "black", borderRadius: "8px", height: "150px" }} />
        ))}
      </div>
      <style>{`
  .fullscreen-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.96);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
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

      {selectedIndex !== null && (
  <div className="fullscreen-overlay">
    <div className="fullscreen-header">
      <span style={{ color: "#fff" }}>{selectedIndex + 1} / {dicomList.length}</span>
      <div>
      <button className="btn" onClick={() => {
  setDrawingPoints([]);
  setIsPolygonClosed(false);
}}>
  Limpiar
</button>
        <button className="btn" onClick={() => setSelectedIndex(null)}>Cerrar</button>
      </div>
    </div>

    <div className="fullscreen-container">
      <div ref={viewerRef} className="fullscreen-viewer" />
      <canvas ref={overlayRef} className="overlay-canvas" onClick={handleOverlayClick} />
    </div>

    <div className="fullscreen-controls">
      <label style={{ color: "#fff" }}>Zoom:</label>
      <input
        type="range"
        min="0.1"
        max="10"
        step="0.01"
        value={scale}
        onChange={handleZoomChange}
      />
      <div>
        <button className="btn" onClick={() => setSelectedIndex(i => Math.max(0, i - 1))} disabled={selectedIndex === 0}>
          Anterior
        </button>
        <button className="btn" onClick={() => setSelectedIndex(i => Math.min(dicomList.length - 1, i + 1))} disabled={selectedIndex === dicomList.length - 1}>
          Siguiente
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}
