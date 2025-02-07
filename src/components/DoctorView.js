// src/components/DoctorView.js
import React from 'react';
import NavBar from './NavBar';

function DoctorView() {
  const username = 'Doctor';
  const menuOptions = ['Pacientes', 'Historial', 'Salir'];
  const userType = 'doctor'; // Define el tipo de usuario

  return (
    <div>
      <NavBar username={username} menuOptions={menuOptions} userType={userType} />
      <div className="doctor-container">
        <h1>Bienvenido, {username}</h1>
        <p>Aquí puedes gestionar tus consultas y pacientes.</p>
      </div>
    </div>
  );
}

export default DoctorView;
