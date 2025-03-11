import React, { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Stage, Layer, Line, Circle, Image } from "react-konva";
import useImage from "use-image"; // Para cargar la imagen en Konva

import defaultImage from "../assets/images/image.jpg";

const StudyView = () => {
  const { id, studyNumber } = useParams();
  const navigate = useNavigate();

  // Estado de opacidad de la imagen y de las máscaras
  const [modalImage, setModalImage] = useState(null);
  const [modalOpacity, setModalOpacity] = useState(1);
  const [modalOpacityMasks, setModalOpacityMasks] = useState(1);

  // Cargar la imagen correctamente en Konva
  const [image] = useImage(modalImage || defaultImage);

  // Estado para las líneas editables
  const [lines, setLines] = useState([]);
  const [selectedLine, setSelectedLine] = useState(null);
  const isDrawing = useRef(false);

  // Estado de zoom y desplazamiento
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false); // Nuevo estado para bloquear el movimiento

  // Lista de imágenes
  const imageList = new Array(50).fill(defaultImage);

  // Iniciar una línea nueva
  const handleMouseDown = (e) => {
    if (selectedLine !== null) return;
    isDrawing.current = true;
    setIsDragging(false); // Bloquear el arrastre cuando se dibuja
    const pos = e.target.getStage().getPointerPosition();
    setLines([...lines, { points: [pos.x, pos.y], id: lines.length }]);
  };

  // Dibujar en tiempo real
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

  // Finalizar dibujo
  const handleMouseUp = () => {
    isDrawing.current = false;
    setIsDragging(true); // Reactivar el arrastre después de dibujar
  };

  // Seleccionar una línea para edición
  const handleSelectLine = (index) => {
    setSelectedLine(index);
  };

  // Modificar los puntos de la línea
  const handlePointDrag = (index, pointIndex, event) => {
    setLines((prevLines) => {
      const updatedLines = [...prevLines];
      updatedLines[index].points[pointIndex * 2] = event.target.x();
      updatedLines[index].points[pointIndex * 2 + 1] = event.target.y();
      return updatedLines;
    });
  };

  // Eliminar línea seleccionada
  const handleDelete = () => {
    if (selectedLine !== null) {
      setLines(lines.filter((_, index) => index !== selectedLine));
      setSelectedLine(null);
    }
  };

  // Manejar zoom con scroll
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
      {/* 🔹 Contenedor de Imágenes */}
      <div className="image-grid-container">
        {imageList.map((image, idx) => (
          <img
            key={idx}
            src={image}
            alt={`Imagen ${idx + 1}`}
            className="study-image"
            onClick={() => {
              setModalImage(image);
              setModalOpacity(1);
            }}
          />
        ))}
      </div>

      {/* 🔹 Contenedor de Información */}
      <div className="data-container">
        <h3>Información del Estudio</h3>
        <p><strong>Paciente:</strong> {id}</p>
        <p><strong>Estudio N°:</strong> {studyNumber}</p>
        <p><strong>Fecha de Estudio:</strong> 12/02/2025</p>
        <p><strong>Descripción:</strong> Estudio realizado para evaluar el estado general.</p>
        <p><strong>Volumen generado automaticamente:</strong> XXml</p>
        <p><strong>Volumen ajustado:</strong> XXml</p>

        <div className="top-right-buttons">
          {/* <button className="red-btn">Cargar Imagen</button> */}
          <button className="red-btn">Calcular nuevo volumen</button>
        </div>
      </div>

      {/* 🔹 Modal con la imagen y la capa de dibujo */}
      {modalImage && (
        <div className="modal-overlay" onClick={() => setModalImage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Vista Expandida</h2>

            <div className="modal-layout">
              {/* Imagen y capa de dibujo */}
              <div className="modal-image-container">
                <Stage
                  width={600}
                  height={600}
                  draggable={isDragging} // Solo se mueve cuando no se está dibujando
                  scaleX={zoom}
                  scaleY={zoom}
                  x={position.x}
                  y={position.y}
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  style={{ border: "1px solid black", position: "relative" }}
                >
                  {/* Capa de imagen de fondo */}
                  <Layer opacity={modalOpacity}>
                    {image && <Image image={image} width={600} height={600} />}
                  </Layer>

                  {/* Capa de líneas independientes, lineas etc */}
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

              {/* Controles en el lado derecho */}
              <div className="modal-controls">
                <label>Opacidad de la imagen</label>
                <input type="range" min="0" max="1" step="0.05" value={modalOpacity} onChange={(e) => setModalOpacity(parseFloat(e.target.value))} />

                <label>Opacidad de las máscaras</label>
                <input type="range" min="0" max="1" step="0.05" value={modalOpacityMasks} onChange={(e) => setModalOpacityMasks(parseFloat(e.target.value))} />

                <button onClick={handleDelete} disabled={selectedLine === null}>🗑 Eliminar Línea</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudyView;
