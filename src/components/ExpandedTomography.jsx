import React, { useRef, useState, useEffect } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Stage, Layer, Image, Line } from "react-konva";

function ImageEditor () {
  const stageRef = useRef(null);
  const [image, setImage] = useState(null);
  const [lines, setLines] = useState([]);
  const [drawing, setDrawing] = useState(false);

  // Cargar la imagen en un objeto Image de JavaScript
  useEffect(() => {
    const img = new window.Image();
    img.src = "../assets/images/image.jpg"; // Cambia por tu imagen
    img.onload = () => setImage(img);
  }, []);

  // Manejar dibujo en el canvas
  const handleMouseDown = (e) => {
    setDrawing(true);
    const pos = e.target.getStage().getPointerPosition();
    setLines([...lines, { points: [pos.x, pos.y] }]);
  };

  const handleMouseMove = (e) => {
    if (!drawing) return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const lastLine = lines[lines.length - 1];
    lastLine.points = lastLine.points.concat([point.x, point.y]);
    setLines([...lines.slice(0, -1), lastLine]);
  };

  const handleMouseUp = () => {
    setDrawing(false);
  };

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-lg font-bold mb-2">Zoom + Dibujo con React-Konva</h2>

      {/* Contenedor de zoom */}
      <TransformWrapper>
        <TransformComponent>
          <div style={{ border: "1px solid #ccc", width: "500px", height: "400px" }}>
            <Stage
              ref={stageRef}
              width={500}
              height={400}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <Layer>
                {/* Imagen de fondo */}
                {image && <Image image={image} width={500} height={400} />}
                {/* Dibujo sobre la imagen */}
                {lines.map((line, i) => (
                  <Line key={i} points={line.points} stroke="red" strokeWidth={2} tension={0.5} lineCap="round" />
                ))}
              </Layer>
            </Stage>
          </div>
        </TransformComponent>
      </TransformWrapper>

      {/* Botón para limpiar */}
      <button className="mt-2 px-4 py-2 bg-red-500 text-white rounded" onClick={() => setLines([])}>
        Borrar Dibujo
      </button>
    </div>
  );
};

export default ImageEditor;
