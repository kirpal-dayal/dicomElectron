import React, { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Stage, Layer, Line, Circle, Image as KonvaImage } from "react-konva";
import axios from "axios";
import defaultImage from "../assets/images/image.jpg";

const StudyView = () => {
  const { id, studyNumber } = useParams();

  const [nss, setNss] = useState(null);
  const [imageList, setImageList] = useState([]);
  const [modalImage, setModalImage] = useState(null);
  const [konvaImage, setKonvaImage] = useState(null);

  const [modalOpacity, setModalOpacity] = useState(1);
  const [modalOpacityMasks, setModalOpacityMasks] = useState(1);
  const [lines, setLines] = useState([]);
  const [selectedLine, setSelectedLine] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const isDrawing = useRef(false);

  // Obtener el NSS real desde localStorage
  useEffect(() => {
    const storedPatients = JSON.parse(localStorage.getItem("patients")) || [];
    const record = storedPatients[parseInt(id)];
    if (record && record.nss) {
      setNss(record.nss);
    } else {
      console.error("❌ No se encontró el NSS para el paciente");
    }
  }, [id]);

  // Obtener lista de URLs de imágenes por estudio
  useEffect(() => {
    const fetchImages = async () => {
      if (!nss) return;

      try {
        const mysqlFecha = decodeURIComponent(studyNumber);
        console.log("🛰️ Solicitando imágenes con:", { nss, fecha: mysqlFecha });

        const res = await axios.get(`http://localhost:5000/api/image/study?nss=${nss}&fecha=${encodeURIComponent(mysqlFecha)}`);
        console.log("✅ Respuesta del backend:", res.data);

        if (Array.isArray(res.data)) {
          const urls = res.data.map(img => `http://localhost:5000/api/image/blob/${img.id}`);
          setImageList(urls);
        } else {
          console.warn("Respuesta inesperada:", res.data);
          setImageList([]);
        }
      } catch (err) {
        console.error(" Error al obtener imágenes:", err);
        setImageList([]);
      }
    };

    fetchImages();
  }, [nss, studyNumber]);

  // Cargar imagen para modal con Konva
  useEffect(() => {
    if (modalImage) {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => setKonvaImage(img);
      img.src = modalImage;
    }
  }, [modalImage]);

  const handleMouseDown = (e) => {
    if (selectedLine !== null) return;
    isDrawing.current = true;
    setIsDragging(false);
    const pos = e.target.getStage().getPointerPosition();
    setLines([...lines, { points: [pos.x, pos.y], id: lines.length }]);
  };

  const handleMouseMove = (e) => {
    if (!isDrawing.current) return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    setLines((prevLines) => {
      const updatedLines = [...prevLines];
      const lastLine = updatedLines[updatedLines.length - 1];
      if (lastLine) {
        lastLine.points = [...lastLine.points, point.x, point.y];
      }
      return updatedLines;
    });
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
    setIsDragging(true);
  };

  const handleSelectLine = (index) => {
    setSelectedLine(index);
  };

  const handlePointDrag = (index, pointIndex, event) => {
    setLines((prevLines) => {
      const updatedLines = [...prevLines];
      updatedLines[index].points[pointIndex * 2] = event.target.x();
      updatedLines[index].points[pointIndex * 2 + 1] = event.target.y();
      return updatedLines;
    });
  };

  const handleDelete = () => {
    if (selectedLine !== null) {
      setLines(lines.filter((_, index) => index !== selectedLine));
      setSelectedLine(null);
    }
  };

  const handleWheel = (e) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const mousePointTo = {
      x: (e.evt.offsetX - stage.x()) / oldScale,
      y: (e.evt.offsetY - stage.y()) / oldScale,
    };
    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    setZoom(newScale);
    setPosition({
      x: e.evt.offsetX - mousePointTo.x * newScale,
      y: e.evt.offsetY - mousePointTo.y * newScale,
    });
  };

  return (
    <div className="study-container">
      <div className="image-grid-container">
        {imageList.length > 0 && (
          <img
            src={imageList[0]}
            alt="Preview"
            style={{ width: 300, border: "2px solid green" }}
          />
        )}

        {imageList.length > 0 ? (
          imageList.map((url, idx) => (
            <img
              key={idx}
              src={url}
              alt={`Imagen ${idx + 1}`}
              className="study-image"
              onClick={() => setModalImage(url)}
            />
          ))
        ) : (
          <p>No hay imágenes disponibles.</p>
        )}
      </div>

      <div className="data-container">
        <h3>Información del Estudio</h3>
        <p><strong>Paciente:</strong> {nss || "Cargando..."}</p>
        <p><strong>Estudio N°:</strong> {studyNumber}</p>
        <p><strong>Fecha de Estudio:</strong> {new Date(studyNumber).toLocaleString()}</p>
        <p><strong>Descripción:</strong> Estudio realizado para evaluar el estado general.</p>
        <p><strong>Volumen generado automáticamente:</strong> XXml</p>
        <p><strong>Volumen ajustado:</strong> XXml</p>
      </div>

      {modalImage && (
        <div className="modal-overlay" onClick={() => setModalImage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Vista Expandida</h2>
            <div className="modal-layout">
              <div className="modal-image-container">
                <Stage
                  width={600}
                  height={600}
                  draggable={isDragging}
                  scaleX={zoom}
                  scaleY={zoom}
                  x={position.x}
                  y={position.y}
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                >
                  <Layer opacity={modalOpacity}>
                    {konvaImage && <KonvaImage image={konvaImage} width={600} height={600} />}
                  </Layer>
                  <Layer opacity={modalOpacityMasks}>
                    {lines.map((line, index) => (
                      <React.Fragment key={index}>
                        <Line
                          points={line.points}
                          stroke={selectedLine === index ? "red" : "blue"}
                          strokeWidth={3}
                          lineCap="round"
                          onClick={() => handleSelectLine(index)}
                        />
                        {selectedLine === index &&
                          line.points.map((_, i) =>
                            i % 2 === 0 ? (
                              <Circle
                                key={i}
                                x={line.points[i]}
                                y={line.points[i + 1]}
                                radius={6}
                                fill="yellow"
                                draggable
                                onDragMove={(e) => handlePointDrag(index, i / 2, e)}
                              />
                            ) : null
                          )}
                      </React.Fragment>
                    ))}
                  </Layer>
                </Stage>
              </div>

              <div className="modal-controls">
                <label>Opacidad Imagen</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={modalOpacity}
                  onChange={(e) => setModalOpacity(parseFloat(e.target.value))}
                />
                <label>Opacidad Máscaras</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={modalOpacityMasks}
                  onChange={(e) => setModalOpacityMasks(parseFloat(e.target.value))}
                />
                <button onClick={handleDelete} disabled={selectedLine === null}>
                   Eliminar Línea
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudyView;
