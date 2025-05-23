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
 */
import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import * as cornerstone from "cornerstone-core";
import * as cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import * as dicomParser from "dicom-parser";
import { EVENTS } from "cornerstone-core";

// Configuración Cornerstone
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({ beforeSend: () => {} });

export default function StudyView() {
  const { id: nss, studyNumber } = useParams();
  const navigate = useNavigate();
  const viewerRef = useRef();
  const overlayCanvasRef = useRef();

  const [dicomList, setDicomList] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [scale, setScale] = useState(1); // escala inicial

  const fechaOriginal = decodeURIComponent(studyNumber);
  const safeFecha = fechaOriginal.replace(/[:\. ]/g, "_");
  const folder = `${nss}_${safeFecha}`;
  const [draggingIndex, setDraggingIndex] = useState(null);
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const element = viewerRef.current;
    if (!canvas || !element) return;
  
    const handleMouseDown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
  
      drawingPoints.forEach((p, i) => {
        const screen = cornerstone.pixelToCanvas(element, p);
        if (Math.hypot(screen.x - x, screen.y - y) < 6) {
          setDraggingIndex(i);
        }
      });
    };
  
    const handleMouseMove = (e) => {
      if (draggingIndex === null) return;
  
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const imageCoords = cornerstone.canvasToPixel(element, { x, y });
  
      setDrawingPoints((prev) => {
        const updated = [...prev];
        updated[draggingIndex] = imageCoords;
        return updated;
      });
  
      drawOverlayLines(); // FORZAR REDIBUJO
    };
  
    const handleMouseUp = () => setDraggingIndex(null);
  
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseUp);
  
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseUp);
    };
  }, [drawingPoints, draggingIndex]); // ✅ válido aquí

  // Cargar lista de imágenes DICOM
  useEffect(() => {
    async function fetchDicoms() {
      try {
        const { data } = await axios.get(`/api/image/dicom-list/${folder}`);
        const urls = data.map(f => `/api/image/dicom/${folder}/${encodeURIComponent(f)}`);
        setDicomList(urls);
      } catch {
        setError("Error al obtener la lista de archivos DICOM.");
      } finally {
        setLoading(false);
      }
    }
    fetchDicoms();
  }, [folder]);

  // Mostrar imagen seleccionada
  useEffect(() => {
    if (selectedIndex === null || !viewerRef.current || !dicomList[selectedIndex]) return;
    const element = viewerRef.current;
    cornerstone.enable(element);
    const imageId = `wadouri:${window.location.origin}${dicomList[selectedIndex]}`;

    cornerstone.loadAndCacheImage(imageId)
      .then(image => {
        cornerstone.displayImage(element, image);
        const viewport = cornerstone.getDefaultViewportForImage(element, image);
        viewport.scale = scale;
        cornerstone.setViewport(element, viewport);
      })
      .catch(() => setError("No se pudo mostrar la imagen DICOM."));

    return () => {
      try { cornerstone.disable(element); } catch {}
    };
  }, [selectedIndex, dicomList, scale]);

  // Función para redibujar líneas
  function drawOverlayLines() {
    const element = viewerRef.current;
    const canvas = overlayCanvasRef.current;
    if (!element || !canvas) return;
  
    const rect = element.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  
    try {
      const screenPoints = drawingPoints.map(p => cornerstone.pixelToCanvas(element, p));
  
      // Dibuja líneas conectando los puntos
      ctx.beginPath();
      ctx.strokeStyle = "lime";
      ctx.lineWidth = 2;
      screenPoints.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
  
      // Dibuja los vértices como círculos rojos
      screenPoints.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "red";
        ctx.fill();
      });
  
    } catch (err) {
      console.error("Redibujado fallido:", err);
    }
  }  

  useEffect(() => { drawOverlayLines(); }, [drawingPoints]);

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;
    const handler = () => drawOverlayLines();
    cornerstone.events.addEventListener(element, EVENTS.VIEWPORT_MODIFIED, handler);
    return () => {
      cornerstone.events.removeEventListener(element, EVENTS.VIEWPORT_MODIFIED, handler);
    };
  }, []);

  const handleOverlayClick = (e) => {
    const element = viewerRef.current;
    const canvas = overlayCanvasRef.current;
    if (!element || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    try {
      const imagePoint = cornerstone.canvasToPixel(element, { x, y });
      const first = drawingPoints[0];
      if (first && Math.hypot(imagePoint.x - first.x, imagePoint.y - first.y) < 5 && drawingPoints.length >= 3) {
        setDrawingPoints([...drawingPoints, first]);
        return;
      }
      setDrawingPoints([...drawingPoints, imagePoint]);
    } catch (err) {
      console.error("Error al capturar clic:", err);
    }
  };

  const handleZoomChange = (e) => {
    const newScale = parseFloat(e.target.value);
    setScale(newScale);
    const element = viewerRef.current;
    if (!element) return;
    const viewport = cornerstone.getViewport(element);
    viewport.scale = newScale;
    cornerstone.setViewport(element, viewport);
  
    // Forzar redibujado inmediatamente al aplicar el zoom
    drawOverlayLines();
  };

  const handleCloseViewer = () => {
    setSelectedIndex(null);
    setDrawingPoints([]);
    setScale(1);
  };

  const handleNext = () => setSelectedIndex(i => Math.min(i + 1, dicomList.length - 1));
  const handlePrev = () => setSelectedIndex(i => Math.max(i - 1, 0));

  if (loading) return <p style={{ padding: "2rem", textAlign: "center" }}>Cargando estudio…</p>;
  if (error) return <p style={{ padding: "2rem", textAlign: "center", color: "red" }}>{error}</p>;

  return (
    <>
      <style>{`
        .study-wrapper { padding: 1rem 2rem; background: #f8f8f8; }
        .header { display: flex; justify-content: space-between; margin-bottom: 1.5rem; }
        .thumbnail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; }
        .thumb { width: 100%; height: 150px; background: black; border-radius: 8px; cursor: pointer; }
        .fullscreen-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.96); z-index: 1000; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .fullscreen-header { width: 100%; max-width: 960px; color: white; display: flex; justify-content: space-between; padding: 1rem; }
        .fullscreen-controls { display: flex; flex-direction: column; align-items: center; margin-top: 1rem; gap: 1rem; }
        .fullscreen-container { position: relative; width: 90%; max-width: 960px; height: 80vh; }
        .fullscreen-viewer { width: 100%; height: 100%; background: black; border-radius: 12px; }
        .overlay-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: auto; }
        .btn { padding: 0.5rem 1.2rem; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.9rem; }
        input[type="range"] { width: 300px; }
      `}</style>

      <div className="study-wrapper">
        <div className="header">
          <div>
            <p><strong>NSS:</strong> {nss}</p>
            <p><strong>Fecha del estudio:</strong> {new Date(fechaOriginal).toLocaleString()}</p>
            <p><strong>Imágenes:</strong> {dicomList.length}</p>
          </div>
          <button className="btn" onClick={() => navigate(-1)}>← Volver</button>
        </div>

        <div className="thumbnail-grid">
          {dicomList.map((url, i) => (
            <div key={i} className="thumb" onClick={() => setSelectedIndex(i)}
              ref={async el => {
                if (el) {
                  try {
                    cornerstone.enable(el);
                    const imageId = `wadouri:${window.location.origin}${url}`;
                    const image = await cornerstone.loadAndCacheImage(imageId);
                    cornerstone.displayImage(el, image);
                  } catch {}
                }
              }}
            ></div>
          ))}
        </div>
      </div>

      {selectedIndex !== null && (
        <div className="fullscreen-overlay">
          <div className="fullscreen-header">
            <span>{selectedIndex + 1} / {dicomList.length}</span>
            <div>
              <button className="btn" onClick={() => setDrawingPoints([])}>Limpiar</button>
              <button className="btn" onClick={handleCloseViewer}>Cerrar</button>
            </div>
          </div>

          <div className="fullscreen-container">
            <div ref={viewerRef} className="fullscreen-viewer" />
            <canvas ref={overlayCanvasRef} className="overlay-canvas" onClick={handleOverlayClick} />
          </div>

          <div className="fullscreen-controls">
            <label style={{ color: "white" }}>Zoom:</label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.01"
              value={scale}
              onChange={handleZoomChange}
            />
            <div>
              <button className="btn" onClick={handlePrev} disabled={selectedIndex === 0}>Anterior</button>
              <button className="btn" onClick={handleNext} disabled={selectedIndex === dicomList.length - 1}>Siguiente</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
