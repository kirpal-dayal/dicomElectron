// src/components/NavBar.js
import React from 'react';

function NavBar({ username, menuOptions, onCreate }) {
  return (
    <div className="navbar">
      <div className="navbar-logo">
        <h2>{username ? username : 'Usuario'}</h2>
      </div>
      <div className="navbar-links">
        {menuOptions.map((option, index) => (
          <button
            key={index}
            className="navbar-btn"
            onClick={() => {
              if (option === 'Crear usuario') onCreate(); // Llama a onCreate para "Crear usuario"
            }}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export default NavBar;
