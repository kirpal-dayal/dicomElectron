import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

function AnalisisDetallado() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Estado para almacenar el nombre del paciente
  const [patientName, setPatientName] = useState('');

  // Estado para almacenar las selecciones del usuario
  const [selectedOption1, setSelectedOption1] = useState('');
  const [selectedOption2, setSelectedOption2] = useState('');

  // Obtener el nombre del paciente desde localStorage
  useEffect(() => {
    const storedPatients = JSON.parse(localStorage.getItem('patients')) || [];
    const storedRecords = JSON.parse(localStorage.getItem('records')) || [];

    const data = storedPatients.length > 0 ? storedPatients : storedRecords;

    if (data && id >= 0 && id < data.length) {
      setPatientName(data[id].name); // Asigna el nombre del paciente
    }
  }, [id]);

  return (
    <div className="analisis-container">
      <h2>Análisis Detallado del paciente: {patientName}</h2>

      {/* 🔹 Contenedor de imágenes (una fila, cada una con un tercio del ancho) */}
      <div className="image-placeholder-container">
        <div className="image-placeholder">Imagen 1</div>
        <div className="image-placeholder">Imagen 2</div>
        {/* <div className="image-placeholder">Imagen 3</div> */}
      </div>

      {/* 🔹 Contenedor de análisis con selección y resultados */}
      <div className="analysis-section">
        {/* Primera selección y resultado */}
        <div className="analysis-row">
          <label>
            Selecciona Análisis:
            <select value={selectedOption1} onChange={(e) => setSelectedOption1(e.target.value)}>
              <option value="">Seleccionar...</option>
              <option value="opcion1">estudio 1</option>
              <option value="opcion2">estudio 2</option>
              <option value="opcion3">estudio 3</option>
            </select>
          </label>
          <div className="result-box">Resultado: {selectedOption1 || 'N/A'}</div>
        </div>

        {/* Segunda selección y resultado */}
        <div className="analysis-row">
          <label>
            Selecciona Análisis:
            <select value={selectedOption2} onChange={(e) => setSelectedOption2(e.target.value)}>
              <option value="">Seleccionar...</option>
              <option value="opcionA">estudio 1</option>
              <option value="opcionB">estudio 2</option>
              <option value="opcionC">estudio 3</option>
            </select>
          </label>
          {/* <div className="result-box">Resultado: {selectedOption2 || 'N/A'}</div> */}
        </div>
      </div>

      {/* Botón para volver */}
      <button onClick={() => navigate(-1)}>Volver</button>
    </div>
  );
}

export default AnalisisDetallado;
