import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from './NavBar';
import ClinicalForm from './ClinicalForm';

function DoctorView() {
  const [showForm, setShowForm] = useState(false);
  const [patients, setPatients] = useState([]);
  const navigate = useNavigate();

  const username = 'Doctor';
  const menuOptions = ['Eliminar paciente', 'Salir'];

  // 🔹 Cargar los pacientes desde localStorage
  useEffect(() => {
    try {
      const storedPatients = JSON.parse(localStorage.getItem('patients')) || [];

      // Verificar si `storedPatients` es un array
      if (!Array.isArray(storedPatients)) {
        console.error('❌ Error: "patients" en localStorage no es un array válido.');
        localStorage.setItem('patients', JSON.stringify([])); // 🔹 Corregir en localStorage
        setPatients([]);
        return;
      }

      setPatients(storedPatients);
      console.log('📌 Pacientes cargados:', storedPatients);
    } catch (error) {
      console.error('⚠️ Error al cargar los pacientes desde localStorage:', error);
      setPatients([]);
    }
  }, []);

  // 🔹 Añadir nuevo paciente
  const handleAddPatient = (newPatient) => {
    try {
      const updatedPatients = [...patients, newPatient];

      // Guardar en localStorage
      localStorage.setItem('patients', JSON.stringify(updatedPatients));

      setPatients(updatedPatients);
      setShowForm(false);
      console.log('✅ Nuevo paciente agregado:', newPatient);
    } catch (error) {
      console.error('⚠️ Error al añadir paciente:', error);
    }
  };

  // 🔹 Redirigir a la vista de un paciente
  const handleViewPatient = (index) => {
    if (patients.length === 0 || index < 0 || index >= patients.length) {
      alert('Error: El paciente seleccionado no existe.');
      console.error(`❌ Intento de acceder a índice inválido: ${index}`);
      return;
    }

    console.log(`📌 Navegando a ViewPatient con índice: ${index}`);
    navigate(`/view-patient/${index}`);
  };

  return (
    <div>
      {/* Barra de navegación */}
      <NavBar username={username} userType="doctor" menuOptions={menuOptions} onCreate={() => setShowForm(true)} />

      {/* Formulario emergente para añadir pacientes */}
      {showForm && <ClinicalForm closeForm={() => setShowForm(false)} addRecord={handleAddPatient} />}

      {/* Tabla de pacientes registrados */}
      <div className="records-container">
        <h2>Pacientes Registrados</h2>
        {patients.length === 0 ? (
          <p>No hay pacientes aún.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>NSS</th>
                <th>Fecha de Nacimiento</th>
                <th>Sexo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient, index) => (
                <tr key={index}>
                  <td>{patient.name}</td>
                  <td>{patient.nss}</td>
                  <td>{patient.birthDate}</td>
                  <td>{patient.sex}</td>
                  <td>
                    {/* Redirección a ViewPatient con índice numérico */}
                    <button onClick={() => handleViewPatient(index)}>
                      Vista
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default DoctorView;
