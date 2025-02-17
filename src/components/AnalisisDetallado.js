import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import image1 from '../assets/images/image3da.jpg';
import image2 from '../assets/images/image3db.jpg';

function AnalisisDetallado() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [patientName, setPatientName] = useState('');
  const [selectedOption1, setSelectedOption1] = useState('');
  const [selectedOption2, setSelectedOption2] = useState('');

  // Obtener el nombre del paciente desde localStorage
  useEffect(() => {
    const storedPatients = JSON.parse(localStorage.getItem('patients')) || [];
    const storedRecords = JSON.parse(localStorage.getItem('records')) || [];

    const data = storedPatients.length > 0 ? storedPatients : storedRecords;

    if (data && id >= 0 && id < data.length) {
      setPatientName(data[id].name);
    }
  }, [id]);

  return (
    <div className="analisis-container">
      <h2>Análisis Detallado del paciente: {patientName}</h2>

      {/* Contenedor de imágenes */}
      <div className="image-placeholder-container">
        <div className="image-placeholder">
          <img src={image1} alt="Estudio 1" />
          <div className="analysis-row">
            <label>
              Selecciona estudio:
              <select value={selectedOption1} onChange={(e) => setSelectedOption1(e.target.value)}>
                <option value="">Seleccionar...</option>
                <option value="opcion1">Estudio A</option>
                <option value="opcion2">Estudio B</option>
                <option value="opcion3">Estudio C</option>
              </select>
            </label>
            {/* <div className="result-box">Resultado: {selectedOption1 || 'N/A'}</div> */}
          </div>
        </div>

        <div className="image-placeholder">
          <img src={image2} alt="Estudio 2" />
          <div className="analysis-row">
            <label>
              Selecciona estudio:
              <select value={selectedOption2} onChange={(e) => setSelectedOption2(e.target.value)}>
                <option value="">Seleccionar...</option>
                <option value="opcionA">Estudio A</option>
                <option value="opcionB">Estudio B</option>
                <option value="opcionC">Estudio C</option>
              </select>
            </label>
            {/* <div className="result-box">Resultado: {selectedOption2 || 'N/A'}</div> */}
          </div>
        </div>
      </div>

      {/* 🔹 Cuadro de información */}
      <div className="info-box">
        <p><strong>Diferencia de volumen:</strong> XXX ml</p>
      </div>

      {/* Botón de volver centrado */}
      <button className="btn-volver" onClick={() => navigate(-1)}>Volver</button>
    </div>
  );
}

export default AnalisisDetallado;
