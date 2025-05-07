import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaCloudUploadAlt } from 'react-icons/fa';
import defaultImage from '../assets/images/image.jpg';
import axios from 'axios';

function ViewPatient() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);

  useEffect(() => {
    const storedPatients = JSON.parse(localStorage.getItem('patients')) || [];
    const recordId = parseInt(id, 10);

    if (isNaN(recordId) || recordId < 0 || recordId >= storedPatients.length) {
      alert('Error: ID inválido.');
      navigate('/doctor');
      return;
    }

    setRecord(storedPatients[recordId]);
  }, [id, navigate]);

  const handleZipChange = async (event) => {
    const file = event.target.files[0];
    if (!file || !file.name.endsWith('.zip')) {
      alert("Por favor selecciona un archivo .zip válido");
      return;
    }

    if (!record?.nss) {
      console.warn("⚠️ No hay NSS en el registro actual.");
      return;
    }

    const fecha = new Date();
    const formattedFecha = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')} ${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}:${String(fecha.getSeconds()).padStart(2, '0')}`;

    const formData = new FormData();
    formData.append('zipFile', file);
    formData.append('nss', record.nss);
    formData.append('fecha', formattedFecha);

    try {
      console.log("📤 Enviando archivo ZIP:", file.name);
      console.log("🧬 Enviando con NSS:", record.nss, "| Fecha:", formattedFecha);

      const response = await axios.post('http://localhost:5000/api/image/upload-zip', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      console.log("📥 Respuesta del servidor:", response.data);

      const newStudy = {
        fecha: formattedFecha,
        tratamiento: 'No disponible',
      };

      const updatedRecord = {
        ...record,
        studies: [...(record.studies || []), newStudy],
      };

      setRecord(updatedRecord);
      const storedPatients = JSON.parse(localStorage.getItem('patients')) || [];
      storedPatients[parseInt(id)] = updatedRecord;
      localStorage.setItem('patients', JSON.stringify(storedPatients));

      alert('✅ ZIP subido correctamente');
      navigate(`/estudio/${id}/${encodeURIComponent(formattedFecha)}`);
    } catch (err) {
      alert('❌ Error al subir el archivo ZIP');
      console.error("🚨 Error de subida:", err);
    }
  };

  if (!record) return <p>Cargando...</p>;

  return (
    <div className="view-container">
      <div className="left-panel">
        <h2>Información del Paciente</h2>
        <form>
          <label>
            NSS:
            <input type="text" value={record.nss} disabled />
          </label>
          <label>
            Fecha de Nacimiento:
            <input type="date" value={record.birthDate} disabled />
          </label>
          <label>
            Sexo:
            <select value={record.sex} disabled>
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
            </select>
          </label>

          <button type="button" onClick={() => navigate(-1)}>Volver</button>
        </form>
      </div>

      <div className="right-panel">
        <h2>Estudios</h2>
        <div className="grid-container">
          {(record.studies || []).map((study, index) => (
            <div key={index} className="grid-item">
              <div className="image-container">
                <img
                  src={defaultImage}
                  alt={`Imagen ${index + 1}`}
                  className="grid-image"
                  onClick={() => navigate(`/estudio/${id}/${encodeURIComponent(study.fecha)}`)}
                  style={{ cursor: 'pointer' }}
                />
              </div>
              <div className="study-text">
                <label><strong>Fecha de Estudio:</strong> {new Date(study.fecha).toLocaleString()}</label>
                <label><strong>Tratamiento:</strong> {study.tratamiento}</label>
              </div>
            </div>
          ))}

          {/* Componente para cargar ZIP */}
          <div className="grid-item">
            <div className="upload-icon">
              <label htmlFor="zip-upload" style={{ cursor: 'pointer' }}>
                <FaCloudUploadAlt size={50} color="#007bff" />
                <p>Selecciona archivo ZIP</p>
              </label>
              <input
                id="zip-upload"
                type="file"
                accept=".zip"
                style={{ display: 'none' }}
                onChange={handleZipChange}
              />
            </div>
          </div>
        </div>

        <button className="btn-next" onClick={() => navigate(`/analisis-detallado/${id}`)}>
          Comparar volúmenes
        </button>
      </div>
    </div>
  );
}

export default ViewPatient;
