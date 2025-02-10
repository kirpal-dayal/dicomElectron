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

  useEffect(() => {
    const storedPatients = JSON.parse(localStorage.getItem('patients')) || [];
    setPatients(storedPatients);
  }, []);

  const handleAddPatient = (newPatient) => {
    const updatedPatients = [...patients, newPatient];
    setPatients(updatedPatients);
    localStorage.setItem('patients', JSON.stringify(updatedPatients));
    setShowForm(false);
  };

  return (
    <div>
      {/* Barra de navegación con "Añadir Paciente" en el NavBar */}
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
                    {/* Redirección a ViewPatient pasando el índice del paciente */}
                    <button onClick={() => navigate(`/view-patient/${index}`)}>
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
