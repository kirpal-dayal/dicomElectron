import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import * as cornerstone from "cornerstone-core";
import * as cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import * as dicomParser from "dicom-parser";

// Configurar Cornerstone
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

cornerstoneWADOImageLoader.configure({
  beforeSend: function (xhr) {}
});

export default function StudyView() {
  const { id: nss, studyNumber } = useParams();
  const navigate = useNavigate();

  const [dicomList, setDicomList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(null);

  const viewerRef = useRef();

  const fechaOriginal = decodeURIComponent(studyNumber);
  const safeFecha = fechaOriginal.replace(/[:\. ]/g, "_");
  const folder = `${nss}_${safeFecha}`;

  useEffect(() => {
    async function fetchDicomFiles() {
      try {
        const { data } = await axios.get(`/api/image/dicom-list/${folder}`);
        if (!Array.isArray(data) || data.length === 0) {
          setError("No hay archivos DICOM en este estudio.");
          return;
        }
        const urls = data.map(f => `/api/image/dicom/${folder}/${encodeURIComponent(f)}`);
        setDicomList(urls);
      } catch {
        setError("Error al obtener la lista de archivos DICOM.");
      } finally {
        setLoading(false);
      }
    }

    fetchDicomFiles();
  }, [folder]);

  useEffect(() => {
    if (selectedIndex === null || !dicomList.length || !viewerRef.current) return;

    const element = viewerRef.current;
    cornerstone.enable(element);
    const imageId = `wadouri:${window.location.origin}${dicomList[selectedIndex]}`;

    cornerstone.loadAndCacheImage(imageId)
      .then(image => cornerstone.displayImage(element, image))
      .catch(() => setError("No se pudo mostrar la imagen DICOM."));

    return () => {
      try { cornerstone.disable(element); } catch {}
    };
  }, [selectedIndex, dicomList]);

  const handleCloseViewer = () => setSelectedIndex(null);
  const handleNext = () => setSelectedIndex(i => Math.min(i + 1, dicomList.length - 1));
  const handlePrev = () => setSelectedIndex(i => Math.max(i - 1, 0));

  if (loading) return <p style={{ padding: "2rem", textAlign: "center" }}>Cargando estudio…</p>;
  if (error) return <p style={{ padding: "2rem", textAlign: "center", color: "red" }}>{error}</p>;

  return (
    <>
      <style>{`
        .study-wrapper {
          padding: 1rem 2rem;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background: #f8f8f8;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        .study-info {
          font-size: 0.9rem;
          color: #333;
        }
        .thumbnail-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 16px;
        }
        .thumb {
          width: 100%;
          height: 150px;
          background: black;
          border-radius: 8px;
          cursor: pointer;
        }
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
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
        }
        .fullscreen-controls {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin-top: 1rem;
        }
        .fullscreen-viewer {
          width: 90%;
          max-width: 960px;
          height: 80vh;
          background: black;
          border-radius: 12px;
        }
        .btn {
          padding: 0.5rem 1.2rem;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9rem;
        }
        .btn:disabled {
          background: #888;
          cursor: not-allowed;
        }
      `}</style>

      <div className="study-wrapper">
        {/* Header: info + volver */}
        <div className="header">
          <div className="study-info">
            <p><strong>NSS:</strong> {nss}</p>
            <p><strong>Fecha del estudio:</strong> {new Date(fechaOriginal).toLocaleString()}</p>
            <p><strong>Imágenes:</strong> {dicomList.length}</p>
          </div>
          <button className="btn" onClick={() => navigate(-1)}>← Volver</button>
        </div>

        {/* Galería de miniss*/}
        <div className="thumbnail-grid">
  {dicomList.map((url, i) => (
    <div
      key={i}
      className="thumb"
      onClick={() => setSelectedIndex(i)}
      ref={async el => {
        if (el) {
          try {
            cornerstone.enable(el);
            const imageId = `wadouri:${window.location.origin}${url}`;
            const image = await cornerstone.loadAndCacheImage(imageId);
            cornerstone.displayImage(el, image);

            // Ajuste de ventana para que la miniatura no se vea negra
            const viewport = cornerstone.getDefaultViewportForImage(el, image);
            viewport.voi.windowWidth = 400;
            viewport.voi.windowCenter = 40;
            cornerstone.setViewport(el, viewport);

            // También puedes usar fitToWindow como alternativa
            // cornerstone.fitToWindow(el);
          } catch (err) {
            console.error("Error al mostrar miniatura DICOM:", err);
          }
        }
      }}
    ></div>
  ))}
</div>
      </div>

      {/* Visor a pantalla completa */}
      {selectedIndex !== null && (
        <div className="fullscreen-overlay">
          <div className="fullscreen-header">
            <span>{selectedIndex + 1} / {dicomList.length}</span>
            <button className="btn" onClick={handleCloseViewer}>Cerrar</button>
          </div>

          <div ref={viewerRef} className="fullscreen-viewer"></div>

          <div className="fullscreen-controls">
            <button className="btn" onClick={handlePrev} disabled={selectedIndex === 0}>Anterior</button>
            <button className="btn" onClick={handleNext} disabled={selectedIndex === dicomList.length - 1}>Siguiente</button>
          </div>
        </div>
      )}
    </>
  );
}
