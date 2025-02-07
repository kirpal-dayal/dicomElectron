// src/components/ClinicalForm.js
import React, { useState } from 'react';

function ClinicalForm({ closeForm, addRecord }) {
  const [formData, setFormData] = useState({
    name: '',
    nss: '',
    birthDate: '',
    sex: '',
    diabetes: false,
    hypertension: false,
    heartDisease: false,
    cancer: false,
    otherDiseases: '',
    occupation: '',
    maritalStatus: '',
    education: '',
    riskFactors: '',
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    addRecord(formData); // Pasar los datos al componente padre
    closeForm(); // Cierra el formulario
  };

  return (
    <div className="form-container">
      <h2>Crear Historia Clínica</h2>
      <form onSubmit={handleSubmit}>
        {/* Información Personal */}
        <label>
          Nombre Completo:
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          NSS:
          <input
            type="text"
            name="nss"
            value={formData.nss}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Fecha de Nacimiento:
          <input
            type="date"
            name="birthDate"
            value={formData.birthDate}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Sexo:
          <select
            name="sex"
            value={formData.sex}
            onChange={handleChange}
            required
          >
            <option value="">Seleccionar</option>
            <option value="masculino">Masculino</option>
            <option value="femenino">Femenino</option>
          </select>
        </label>

        {/* Antecedentes */}
        <fieldset>
          <legend>Antecedentes Hereditarios y Familiares</legend>
          <label>
            <input
              type="checkbox"
              name="diabetes"
              checked={formData.diabetes}
              onChange={handleChange}
            />
            Diabetes Mellitus
          </label>
          <label>
            <input
              type="checkbox"
              name="hypertension"
              checked={formData.hypertension}
              onChange={handleChange}
            />
            Hipertensión Arterial
          </label>
          <label>
            <input
              type="checkbox"
              name="heartDisease"
              checked={formData.heartDisease}
              onChange={handleChange}
            />
            Cardiopatía
          </label>
          <label>
            <input
              type="checkbox"
              name="cancer"
              checked={formData.cancer}
              onChange={handleChange}
            />
            Cáncer
          </label>
          <label>
            Otros:
            <input
              type="text"
              name="otherDiseases"
              value={formData.otherDiseases}
              onChange={handleChange}
            />
          </label>
        </fieldset>

        {/* Información Adicional */}
        <label>
          Ocupación:
          <input
            type="text"
            name="occupation"
            value={formData.occupation}
            onChange={handleChange}
          />
        </label>
        <label>
          Estado Civil:
          <input
            type="text"
            name="maritalStatus"
            value={formData.maritalStatus}
            onChange={handleChange}
          />
        </label>
        <label>
          Escolaridad:
          <input
            type="text"
            name="education"
            value={formData.education}
            onChange={handleChange}
          />
        </label>
        <label>
          Factores de Riesgo Laborales:
          <input
            type="text"
            name="riskFactors"
            value={formData.riskFactors}
            onChange={handleChange}
          />
        </label>

        <button type="submit">Guardar</button>
        <button type="button" onClick={closeForm}>
          Cancelar
        </button>
      </form>
    </div>
  );
}

export default ClinicalForm;
