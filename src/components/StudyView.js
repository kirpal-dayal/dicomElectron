import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import defaultImage from '../assets/images/image.jpg';

function StudyView() {
  const { id, studyNumber } = useParams();
  const navigate = useNavigate();

  // Estado para opacidad de cada imagen
  const [opacity, setOpacity] = useState(1);

  // Estado para la imagen en ventana modal y opacidad del modal
  const [modalImage, setModalImage] = useState(null);
  const [modalOpacity, setModalOpacity] = useState(1);

  // Simulación de imágenes (50 imágenes repetidas para prueba)
  const imageList = new Array(50).fill(defaultImage);

  return (
    <div className="study-container">
      {/* 🔹 Contenedor de Imágenes (2/3 del ancho total) */}
      <div className="image-grid-container">
        {imageList.map((image, idx) => (
          <img
            key={idx}
            src={image}
            alt={`Imagen ${idx + 1}`}
            className="study-image"
            style={{ opacity }}
            onClick={() => {
              setModalImage(image);
              setModalOpacity(opacity);
            }}
          />
        ))}
      </div>

      {/* 🔹 Contenedor de Información (1/3 del ancho total) */}
      <div className="data-container">
        <h3>Información del Estudio</h3>
        <p><strong>Paciente:</strong> {id}</p>
        <p><strong>Estudio N°:</strong> {studyNumber}</p>
        <p><strong>Fecha de Estudio:</strong> 12/02/2025</p>
        <p><strong>Descripción:</strong> Estudio realizado para evaluar el estado general.</p>
        <p><strong>Última modificación:</strong> Usuario...</p>
        <p><strong>Último Volumen Calculado:</strong> X</p>

        {/* 🔹 Botones en la parte superior derecha */}
        <div className="top-right-buttons">
          <button className="red-btn">Cargar Imagen</button>
          <button className="red-btn">Calcular nuevo volumen</button>
        </div>
      </div>

      {/* 🔹 Modal de Imagen */}
      {modalImage && (
        <div className="modal-overlay" onClick={() => setModalImage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Vista Expandida</h2>

            {/* Imagen con opacidad ajustable */}
            <img 
              src={modalImage} 
              alt="Imagen Expandida" 
              className="modal-image"
              style={{ opacity: modalOpacity, width: '100%' }}
            />

            {/* 🔹 Slider de Opacidad dentro del Modal */}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={modalOpacity}
              onChange={(e) => setModalOpacity(parseFloat(e.target.value))}
              style={{ width: '80%', marginTop: '10px' }}
            />

            {/* 🔹 Botones en el Modal */}
            <div className="modal-buttons">
              <button className="modal-btn">Modificar máscara</button>
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
