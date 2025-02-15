import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import defaultImage from '../assets/images/image.jpg';


function ViewPatient() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);

  // Cargar los datos del paciente desde localStorage
  useEffect(() => {
    const storedRecords = JSON.parse(localStorage.getItem('records')) || [];

    if (!storedRecords || id < 0 || id >= storedRecords.length) {
      alert('Registro no encontrado.');
      navigate('/admin');
      return;
    }

    setRecord(storedRecords[id]);
  }, [id, navigate]);

  // Guardar los cambios en localStorage
  const handleSave = () => {
    const storedRecords = JSON.parse(localStorage.getItem('records')) || [];
    if (!storedRecords || id < 0 || id >= storedRecords.length) {
      alert('Error al guardar. Registro no encontrado.');
      return;
    }

    storedRecords[id] = record;
    localStorage.setItem('records', JSON.stringify(storedRecords));
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

          {/* 🔹 Sección de Antecedentes */}
          <fieldset>
            <legend>Antecedentes Médicos</legend>
            <label>
              <input
                type="checkbox"
                checked={record.diabetes || false}
                onChange={(e) => setRecord({ ...record, diabetes: e.target.checked })}
              />
              Diabetes Mellitus
            </label>
            <label>
              <input
                type="checkbox"
                checked={record.hypertension || false}
                onChange={(e) => setRecord({ ...record, hypertension: e.target.checked })}
              />
              Hipertensión Arterial
            </label>
            <label>
              <input
                type="checkbox"
                checked={record.heartDisease || false}
                onChange={(e) => setRecord({ ...record, heartDisease: e.target.checked })}
              />
              Cardiopatía
            </label>
            <label>
              <input
                type="checkbox"
                checked={record.cancer || false}
                onChange={(e) => setRecord({ ...record, cancer: e.target.checked })}
              />
              Cáncer
            </label>
            <label>
              Otros:
              <input
                type="text"
                value={record.otherDiseases || ''}
                onChange={(e) => setRecord({ ...record, otherDiseases: e.target.value })}
              />
            </label>
          </fieldset>

          {/* 🔹 Información Adicional */}
          <label>
            Ocupación:
            <input
              type="text"
              value={record.occupation || ''}
              onChange={(e) => setRecord({ ...record, occupation: e.target.value })}
            />
          </label>
          <label>
            Estado Civil:
            <input
              type="text"
              value={record.maritalStatus || ''}
              onChange={(e) => setRecord({ ...record, maritalStatus: e.target.value })}
            />
          </label>
          <label>
            Escolaridad:
            <input
              type="text"
              value={record.education || ''}
              onChange={(e) => setRecord({ ...record, education: e.target.value })}
            />
          </label>
          <label>
            Factores de Riesgo Laborales:
            <input
              type="text"
              value={record.riskFactors || ''}
              onChange={(e) => setRecord({ ...record, riskFactors: e.target.value })}
            />
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
      <h2>Último Análisis</h2>

      <div className="grid-container">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="grid-item">
            <div className="image-container">
              {/* 🔹 Redirige a una vista específica según el índice de la imagen */}
              <img
                src={defaultImage}
                alt={`Imagen ${index + 1}`}
                className="grid-image"
                onClick={() => navigate(`/estudio/${id}/${index + 1}`)} // Redirección dinámica
                style={{ cursor: 'pointer' }} // Agregar cursor para indicar que es clickeable
              />
            </div>
            <textarea
              placeholder="Descripción aquí..."
              value={record[`imageDesc${index + 1}`] || ''}
              onChange={(e) =>
                setRecord({ ...record, [`imageDesc${index + 1}`]: e.target.value })
              }
            />
          </div>
        ))}
      </div>

        {/* Botón para avanzar */}
        <button className="btn-next" onClick={() => navigate(`/analisis-detallado/${id}`)}>
          Avanzar Página
        </button>
      </div>
    </div>
  );
}

export default ViewPatient;
