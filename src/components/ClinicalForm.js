import React, { useState, useRef, useEffect } from 'react';

function ClinicalForm({ closeForm, addRecord }) {
  const [formData, setFormData] = useState({
    nss: '',
    sex: '',
    day: '',
    month: '',
    year: '',
    manualBirthDate: ''
  });

  const [dayDropdownVisible, setDayDropdownVisible] = useState(false);
  const dayPickerRef = useRef(null);

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleManualDateChange = (e) => {
    let value = e.target.value.replace(/[^\d]/g, '');

    if (value.length > 8) value = value.slice(0, 8);

    let formatted = '';
    for (let i = 0; i < value.length; i++) {
      formatted += value[i];
      if (i === 1 || i === 3) formatted += '/';
    }

    setFormData((prev) => ({
      ...prev,
      manualBirthDate: formatted
    }));
  };

  const handleDaySelect = (dayValue) => {
    setFormData((prev) => ({
      ...prev,
      day: dayValue
    }));
    setDayDropdownVisible(false);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dayPickerRef.current && !dayPickerRef.current.contains(e.target)) {
        setDayDropdownVisible(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    let birthDate = '';

    if (formData.manualBirthDate.trim()) {
      const [dd, mm, yyyy] = formData.manualBirthDate.split('/');
      if (!dd || !mm || !yyyy) {
        alert('Fecha manual inválida. Usa el formato DD/MM/YYYY');
        return;
      }
      birthDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    } else if (formData.day && formData.month && formData.year) {
      birthDate = `${formData.year}-${String(formData.month).padStart(2, '0')}-${String(formData.day).padStart(2, '0')}`;
    } else {
      alert('Por favor completa una fecha de nacimiento válida');
      return;
    }

    const finalData = {
      nss: formData.nss,
      birthDate,
      sex: formData.sex
    };

    addRecord(finalData);
    closeForm();
  };

  const disableSelects = formData.manualBirthDate.trim().length > 0;

  return (
    <div className="form-container">
      <h2>Registrar Paciente</h2>
      <form onSubmit={handleSubmit}>
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

        <label>Fecha de Nacimiento:</label>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }} ref={dayPickerRef}>
            <input
              type="text"
              name="day"
              value={formData.day}
              placeholder="Día"
              readOnly
              disabled={disableSelects}
              onClick={() => !disableSelects && setDayDropdownVisible(!dayDropdownVisible)}
              style={{ width: '60px', cursor: 'pointer' }}
              required={!disableSelects}
            />
            {dayDropdownVisible && (
              <div
                style={{
                  position: 'absolute',
                  top: '110%',
                  left: 0,
                  background: '#fff',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                  zIndex: 10,
                  padding: '8px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: '6px',
                  maxHeight: '200px',
                  overflowY: 'auto'
                }}
              >
                {days.map(d => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => handleDaySelect(d.toString())}
                    style={{
                      padding: '6px',
                      backgroundColor: formData.day === d.toString() ? '#007bff' : '#f0f0f0',
                      color: formData.day === d.toString() ? '#fff' : '#000',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>

          <select name="month" value={formData.month} onChange={handleChange} disabled={disableSelects} required={!disableSelects}>
            <option value="">Mes</option>
            {months.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>

          <select name="year" value={formData.year} onChange={handleChange} disabled={disableSelects} required={!disableSelects}>
            <option value="">Año</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <label style={{ marginTop: '10px' }}>
          O escribe la fecha manualmente (DD/MM/YYYY):
          <input
            type="text"
            name="manualBirthDate"
            placeholder="__/__/____"
            value={formData.manualBirthDate}
            onChange={handleManualDateChange}
            inputMode="numeric"
            maxLength="10"
          />
          <small style={{ color: '#888' }}>
            Formato automático: __/__/____
          </small>
        </label>

        <label>
          Sexo:
          <select name="sex" value={formData.sex} onChange={handleChange} required>
            <option value="">Seleccionar</option>
            <option value="masculino">Masculino</option>
            <option value="femenino">Femenino</option>
            <option value="otro">Otro</option>
          </select>
        </label>

        {/* 🔥 Botones centrados y estilizados */}
        <div className="form-buttons" style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '20px',
          marginTop: '20px'
        }}>
          <button
            type="submit"
            style={{ minWidth: '120px', padding: '10px 0' }}
            className="btn-save"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={closeForm}
            style={{ minWidth: '120px', padding: '10px 0' }}
            className="btn-cancel"
          >
            Cancelar
          </button>
        </div>

      </form>
    </div>
  );
}

export default ClinicalForm;
