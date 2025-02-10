import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

function ViewPatient() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);

  // Cargar los datos del paciente desde localStorage
  useEffect(() => {
    const storedPatients = JSON.parse(localStorage.getItem('patients')) || [];
    const storedRecords = JSON.parse(localStorage.getItem('records')) || [];

    // Determina si cargar desde "patients" o "records"
    const data = storedPatients.length > 0 ? storedPatients : storedRecords;

    if (data && id >= 0 && id < data.length) {
      setRecord(data[id]);
    }
  }, [id]);

  // Guardar los cambios en localStorage
  const handleSave = () => {
    const storedPatients = JSON.parse(localStorage.getItem('patients')) || [];
    const storedRecords = JSON.parse(localStorage.getItem('records')) || [];

    // Guardar en la fuente de datos correcta
    const data = storedPatients.length > 0 ? storedPatients : storedRecords;

    if (data && id >= 0 && id < data.length) {
      data[id] = record;
      localStorage.setItem(storedPatients.length > 0 ? 'patients' : 'records', JSON.stringify(data));
    }

    alert('Cambios guardados');
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

      {/* 🔹 Panel derecho: Último Análisis */}
      <div className="right-panel">
        <h2>Último Análisis</h2>
        <div className="image-placeholder">Imagen del análisis</div>

        {/* 🔹 Nuevos campos para análisis clínico */}
        <div className="analysis-details">
          <label>
            Diagnóstico:
            <input
              type="text"
              value={record.diagnosis || ''}
              onChange={(e) => setRecord({ ...record, diagnosis: e.target.value })}
            />
          </label>

          <label>
            Tratamiento:
            <textarea
              value={record.treatment || ''}
              onChange={(e) => setRecord({ ...record, treatment: e.target.value })}
            />
          </label>

          <label>
            Observaciones:
            <textarea
              value={record.observations || ''}
              onChange={(e) => setRecord({ ...record, observations: e.target.value })}
            />
          </label>

          {/* <label>
            Fecha del Análisis:
            <input
              type="date"
              value={record.analysisDate || ''}
              onChange={(e) => setRecord({ ...record, analysisDate: e.target.value })}
            />
          </label> */}
        </div>

        {/* 🔹 Botón para ver análisis detallado */}
        <button 
          type="button" 
          onClick={() => navigate(`/analisis-detallado/${id}`)}
        >
          Ver Análisis Detallado
        </button>
      </div>
    </div>
  );
}

export default ViewPatient;
