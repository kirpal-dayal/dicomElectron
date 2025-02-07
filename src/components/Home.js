// src/components/Home.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Home() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = () => {
    // Lógica básica de autenticación según el tipo de usuario
    if (username === 'user' && password === '123') {
      navigate('/user'); // Redirigir a la vista del usuario normal
    } else if (username === 'doctor' && password === '123') {
      navigate('/doctor'); // Redirigir a la vista del doctor
    } else if (username === 'admin' && password === '123') {
      navigate('/admin'); // Redirigir a la vista del administrador
    } else {
      alert('Usuario o contraseña incorrectos');
    }
  };

  return (
    <div className="home-container">
      <h1>Login</h1>
      <div className="form-group">
        <label>Usuario</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Escribe tu usuario"
        />
      </div>
      <div className="form-group">
        <label>Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Escribe tu contraseña"
        />
      </div>
      <button className="btn" onClick={handleLogin}>
        Iniciar Sesión
      </button>
    </div>
  );
}

export default Home;
