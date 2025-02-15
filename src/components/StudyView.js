import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import defaultImage from '../assets/images/image.jpg';

function StudyView() {
  const { id, studyNumber } = useParams();
  const navigate = useNavigate();

  // Estado para opacidad de cada vista
  const [opacity, setOpacity] = useState([1, 1, 1]);

  // Estado para la imagen actual de TODAS las vistas (se sincronizan)
  const [imageIndex, setImageIndex] = useState(0);

  // Estado para la imagen en ventana modal y comentarios
  const [modalImage, setModalImage] = useState(null);
  const [modalOpacity, setModalOpacity] = useState(1);
  const [modalText, setModalText] = useState("");

  // Simulación de imágenes (puedes agregar más)
  const imageList = [
    defaultImage,
    defaultImage,
    defaultImage
  ];

  // Cambia la imagen en todas las vistas al presionar flechas
  const changeImage = (direction) => {
    setImageIndex((prevIndex) => 
      (prevIndex + direction + imageList.length) % imageList.length
    );
  };

  return (
    <div className="study-container">
      <h2>Estudio #{studyNumber} del Paciente {id}</h2>

      {/* 🔹 Botones de la esquina superior derecha */}
      <div className="top-right-buttons">
        {/* "Cargar nva imagen" en lugar de "Elegir imagen" */}
        <button className="red-btn">Elegir Imagen</button>
        "Calcular volumen"
        <button className="red-btn">Procesar Imagen</button>
      </div>

      {/* 🔹 Flechas de navegación globales */}
      <div className="navigation-arrows">
        <button className="arrow-btn left" onClick={() => changeImage(-1)}>◀</button>
        <button className="arrow-btn right" onClick={() => changeImage(1)}>▶</button>
      </div>

      {/* 🔹 Contenedor de las 3 vistas superiores */}
      <div className="views-container">
        {opacity.map((_, viewIdx) => (
          <div key={viewIdx} className="image-view">
            {/* Imagen con opacidad ajustable */}
            <img
              src={imageList[imageIndex]}
              alt={`Vista ${viewIdx + 1}`}
              className="study-image"
              style={{ opacity: opacity[viewIdx] }}
              onClick={() => {
                setModalImage(imageList[imageIndex]);
                setModalOpacity(opacity[viewIdx]);
              }} // Abre la ventana modal con la imagen y su opacidad actual
            />

            {/* Slider de Opacidad */}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity[viewIdx]}
              onChange={(e) => {
                const newOpacity = [...opacity];
                newOpacity[viewIdx] = parseFloat(e.target.value);
                setOpacity(newOpacity);
              }}
            />
          </div>
        ))}
      </div>

      {/* 🔹 Controles de Procesamiento */}
      <div className="controls-container">
        {/* Quitar estos botones */}
        <button className="control-btn">Modificar Máscara</button> 
        <button className="control-btn">Guardar</button>
      </div>

      <button className="btn-back" onClick={() => navigate(-1)}>
        Volver
      </button>

      {/* 🔹 Modal de Imagen con Opacidad y Botones */}
      {modalImage && (
        <div className="modal-overlay" onClick={() => setModalImage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Vista Expandida</h2>

            {/* Imagen con opacidad ajustable */}
            <img 
              src={modalImage} 
              alt="Imagen Expandida" 
              className="modal-image"
              style={{ opacity: modalOpacity }}
            />

            {/* 🔹 Slider de Opacidad dentro del Modal */}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={modalOpacity}
              onChange={(e) => setModalOpacity(parseFloat(e.target.value))}
            />

            {/* 🔹 Botones en el Modal */}
            <div className="modal-buttons">
              <button className="modal-btn">Modificar mascara</button>
              <button className="modal-btn">Guardar</button>
              <button className="close-btn" onClick={() => setModalImage(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StudyView;
