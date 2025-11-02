// src/components/UserView.js
import React from 'react';
import NavBar from './NavBar';

function UserView() {
  const username = 'Usuario Normal';
  const menuOptions = ['Ver Perfil', 'Actualizar Datos', 'Cerrar Sesión'];
  const userType = 'user'; // Define el tipo de usuario

  return (
    <div>
      <NavBar username={username} menuOptions={menuOptions} userType={userType} />
      <div className="user-container">
        <h1>Bienvenido, {username}</h1>
        <p>Aquí puedes acceder a tus datos personales.</p>
      </div>
    </div>
  );
}

export default UserView;
