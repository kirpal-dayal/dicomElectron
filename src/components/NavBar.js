import React from 'react';

function NavBar({ username, userType, menuOptions, onCreate }) {
  return (
    <div className="navbar">
      <div className="navbar-left">
        <h2>{username ? username : 'Usuario'}</h2>
      </div>

      <div className="navbar-right">
        {/* Botón dinámico basado en el tipo de usuario */}
        {userType === 'doctor' && (
          <button className="navbar-btn add-btn" onClick={onCreate}>
            Añadir Paciente
          </button>
        )}

        {userType === 'admin' && (
          <button className="navbar-btn add-btn" onClick={onCreate}>
            Crear Usuario
          </button>
        )}

        {menuOptions.map((option, index) => (
          <button key={index} className="navbar-btn">
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export default NavBar;
