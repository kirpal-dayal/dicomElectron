// src/components/ViewPatient.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

function ViewPatient() {
  const { id } = useParams(); // Obtiene el ID del registro desde la URL
  const navigate = useNavigate();
  const [record, setRecord] = useState(null); // Estado para almacenar el registro

  // Cargar el registro correspondiente desde localStorage
  useEffect(() => {
    const storedRecords = JSON.parse(localStorage.getItem('records')) || [];
    setRecord(storedRecords[id]); // Carga el registro por ID
  }, [id]);

  const handleSave = () => {
    // Guardar los cambios en localStorage
    const storedRecords = JSON.parse(localStorage.getItem('records')) || [];
    storedRecords[id] = record; // Actualiza el registro en el array
    localStorage.setItem('records', JSON.stringify(storedRecords)); // Guarda en localStorage
    alert('Cambios guardados');
  };

  if (!record) return <p>Cargando...</p>;

  return (
    <div className="view-container">
      {/* Formulario Editable */}
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
              onChange={(e) =>
                setRecord({ ...record, birthDate: e.target.value })
              }
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

      {/* Cuadro de Imagen */}
      <div className="right-panel">
        <h2>Imagen Disponible</h2>
        <div className="image-placeholder">Imagen disponible aquí</div>
      </div>
    </div>
  );
}

export default ViewPatient;
