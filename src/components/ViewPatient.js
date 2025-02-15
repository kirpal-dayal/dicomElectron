import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import defaultImage from '../assets/images/image.jpg';

function ViewPatient() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);

  useEffect(() => {
    const storedPatients = JSON.parse(localStorage.getItem('patients')) || [];
    const storedRecords = JSON.parse(localStorage.getItem('records')) || [];

    const recordId = parseInt(id, 10);

    console.log('📌 Pacientes en localStorage:', storedPatients);
    console.log('📌 Registros en localStorage:', storedRecords);
    console.log('📌 Intentando acceder a índice:', recordId);

    // 🔹 Validar si el ID es válido
    if (isNaN(recordId) || recordId < 0) {
      alert('Error: ID inválido.');
      navigate('/doctor');
      return;
    }

    let data = storedPatients; // 🔹 Usamos siempre "patients" para DoctorView

    // 🔹 Verificar que el índice esté dentro del rango correcto
    if (!Array.isArray(data) || recordId >= data.length) {
      alert(`Registro no encontrado en índice: ${recordId}`);
      navigate('/doctor');
      return;
    }

    setRecord(data[recordId]);
  }, [id, navigate]);

  // Guardar los cambios en localStorage
  const handleSave = () => {
    const storedPatients = JSON.parse(localStorage.getItem('patients')) || [];

    const recordId = parseInt(id, 10);
    let data = storedPatients;

    if (!Array.isArray(data) || recordId >= data.length) {
      alert('Error al guardar. Registro no encontrado.');
      return;
    }

    data[recordId] = record;
    localStorage.setItem('patients', JSON.stringify(data));
    alert('Cambios guardados correctamente');
  };

  if (!record) return <p>Cargando...</p>;

  return (
    <div className="view-container">
      {/* 🔹 Panel izquierdo: Información del paciente */}
      <div className="left-panel">
        <h2>Editar Información del Paciente</h2>
        <form>
          <label>
            Nombre Completo:
            <input
              type="text"
              value={record.name}
              onChange={(e) => setRecord({ ...record, name: e.target.value })}
            />
          </label>
          <label>
            NSS:
            <input
              type="text"
              value={record.nss}
              onChange={(e) => setRecord({ ...record, nss: e.target.value })}
            />
          </label>
          <label>
            Fecha de Nacimiento:
            <input
              type="date"
              value={record.birthDate}
              onChange={(e) => setRecord({ ...record, birthDate: e.target.value })}
            />
          </label>
          <label>
            Sexo:
            <select
              value={record.sex}
              onChange={(e) => setRecord({ ...record, sex: e.target.value })}
            >
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
            </select>
          </label>

          <button type="button" onClick={handleSave}>
            Guardar Cambios
          </button>
          <button type="button" onClick={() => navigate(-1)}>
            Volver
          </button>
        </form>
      </div>

      {/* 🔹 Panel derecho: Cuadros en Grid con imagen fija */}
      <div className="right-panel">
        <h2>Estudios</h2>

        <div className="grid-container">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="grid-item">
              <div className="image-container">
                <img
                  src={defaultImage}
                  alt={`Imagen ${index + 1}`}
                  className="grid-image"
                  onClick={() => navigate(`/estudio/${id}/${index + 1}`)}
                  style={{ cursor: 'pointer' }}
                />
              </div>
              {/* MOD: "Fecha de estudio" como texto inmovil en lugar de textarea 
                "Toque la imagen para mayor informacion"
                Dar opción de cargar nuevo dicom para abrir el explorador, directamente las imagenes se procesan*/}
              <textarea 
                placeholder="Fecha del estudio..."
                value={record[`imageDesc${index + 1}`] || ''}
                onChange={(e) =>
                  setRecord({ ...record, [`imageDesc${index + 1}`]: e.target.value })
                }
              />
            </div>
          ))}
        </div>

        <button className="btn-next" onClick={() => navigate(`/analisis-detallado/${id}`)}>
          Comparar volúmenes
        </button>
      </div>
    </div>
  );
}

export default ViewPatient;
