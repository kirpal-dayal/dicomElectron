import React, { useState, useEffect } from 'react';
import axios from 'axios';

function AdminDoctorPanel() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [doctors, setDoctors] = useState([]);

  // Cargar doctores al iniciar
  useEffect(() => {
    fetchDoctors();
  }, []);

  const fetchDoctors = async () => {
    const res = await axios.get('http://localhost:5000/api/doctors');
    setDoctors(res.data);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:5000/api/register', { username, password });
      alert('Doctor registrado correctamente');
      setUsername('');
      setPassword('');
      fetchDoctors();
    } catch (err) {
      alert('Error al registrar: ' + err.response.data.error);
    }
  };

  return (
    <div className="admin-panel">
      <h2>Registrar Doctor</h2>
      <form onSubmit={handleRegister}>
        <input
          type="text"
          placeholder="Nombre de usuario"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">Registrar</button>
      </form>

      <h3>Doctores Registrados</h3>
      <ul>
        {doctors.map((doc, idx) => (
          <li key={idx}>{doc.username}</li>
        ))}
      </ul>
    </div>
  );
}

export default AdminDoctorPanel;
