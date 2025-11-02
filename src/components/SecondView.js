// src/components/SecondView.js
import React from 'react';
import { Link } from 'react-router-dom';

function SecondView() {
  return (
    <div className="second-container">
      <h1>Esta es la Segunda Vista</h1>
      <p>Haz clic en el botón para regresar a la vista principal.</p>
      <Link to="/">
        <button className="btn">Volver a la Vista Principal</button>
      </Link>
    </div>
  );
}

export default SecondView;
