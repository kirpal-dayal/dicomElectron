import React, { useRef, useState, useEffect } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Stage, Layer, Image, Line } from "react-konva";
import { use } from "react";

function ImageEditor () {
  const stageRef = useRef(null);
  const [image, setImage] = useState(null);
  const [lines, setLines] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [isZoomEnabled, setIsZoomEnabled] = useState(true); // Habilitar/deshabilitar zoom

  // Cargar la imagen en un objeto Image de JavaScript
  useEffect(() => {
    const img = new window.Image();
    img.src = "/image.jpg"; // Cambia por tu imagen C:\Users\HP\Desktop\modular_fibrosis\dicomElectron\src\assets\images\image.jpg
    img.onload = () => {
      setImage(img);
      console.log("Imagen cargada correctamente");
    };
    img.onerror = (err) => {
      console.error("Error al cargar la imagen", err);
    };
  }, []);

  // Manejar dibujo en el canvas
  const handleMouseDown = (e) => { //Inicia un nuevo trazo cuando el usuario presiona el mouse
    setDrawing(true);
    setIsZoomEnabled(false); // Deshabilitar zoom y pan mientras se dibuja
    const pos = e.target.getStage().getPointerPosition();
    setLines([...lines, { points: [pos.x, pos.y] }]);
  };

  const handleMouseMove = (e) => { //Agrega puntos al trazo actual mientras el usuario mueve el mouse
    if (!drawing) return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const lastLine = lines[lines.length - 1];
    lastLine.points = lastLine.points.concat([point.x, point.y]);
    setLines([...lines.slice(0, -1), lastLine]);
  };

  const handleMouseUp = () => { //Finaliza el trazo actual cuando el usuario suelta el mouse
    setDrawing(false);
    setIsZoomEnabled(true); // Habilitar zoom y pan nuevamente
  };

  // Obtener los puntos del dibujo
  const obtenerPuntos = () => {
    const puntos = lines.map((line) => line.points);
    console.log("Puntos del dibujo:", puntos);
    return puntos;
  }
  // Exponer la función obtenerPuntos al objeto global window
  useEffect(() => {
    window.obtenerPuntos = obtenerPuntos;
  }, [lines]);

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-lg font-bold mb-2">Zoom + Dibujo con React-Konva</h2>

      {/* Contenedor de zoom */}
      <TransformWrapper disabled={!isZoomEnabled}>
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
