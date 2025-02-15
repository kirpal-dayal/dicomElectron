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

  // Simulación de imágenes (repetimos la imagen 50 veces para simular muchas imágenes)
  const imageList = new Array(50).fill(defaultImage);  // 50 imágenes repetidas

  // Cambia la imagen en todas las vistas al presionar flechas
  const changeImage = (direction) => {
    setImageIndex((prevIndex) => 
      (prevIndex + direction + imageList.length) % imageList.length
    );
  };

  return (
    <div className="study-container" style={{ display: 'flex', height: '100vh' }}>
      {/* Parte izquierda: Desplazador de imágenes */}
      <div 
        className="image-container" 
        style={{
          flex: 1, 
          overflowY: 'auto', 
          display: 'flex', 
          flexDirection: 'column', 
          padding: '20px'
        }}
      >
        {imageList.map((image, idx) => (
          <img
            key={idx}
            src={image}
            alt={`Imagen ${idx + 1}`}
            className="study-image"
            style={{
              width: '100%', 
              maxWidth: '300px', 
              margin: '10px 0',  // Separación vertical entre imágenes
              opacity: opacity[0]
            }}
            onClick={() => {
              setModalImage(image);
              setModalOpacity(opacity[0]);
            }}
          />
        ))}
      </div>

      {/* Parte derecha: Campos de datos */}
      <div className="data-container" style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
        <h3>Información del Estudio</h3>
        <div className="data-field">
          <strong>Paciente:</strong> {id}
        </div>
        <div className="data-field">
          <strong>Estudio N°:</strong> {studyNumber}
        </div>

        {/* Agregar más campos según sea necesario */}
        <div className="data-field">
          <strong>Fecha de Estudio:</strong> 12/02/2025
        </div>
        <div className="data-field">
          <strong>Descripción:</strong> Estudio realizado para evaluar el estado general.
        </div>
        <div className="data-field">
          <strong>Ultima modificacion:</strong> Usuario...
        </div>
        <div className="data-field">
          <strong>Ultima Volumen Calculado:</strong> X
        </div>

        {/* Botones y controles */}
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
