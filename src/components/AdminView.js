// src/components/AdminView.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from './NavBar';
import ClinicalForm from './ClinicalForm';
import axios from 'axios'; // IMPORTANTE: Axios para conectar al backend

function AdminView() {
  const [showForm, setShowForm] = useState(false);
  const [records, setRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const username = 'Admin';
  const menuOptions = ['Crear usuario', 'Borrar', 'Ver perfil', 'Salir'];

  // Cargar todos los doctores al montar
  useEffect(() => {
    fetchDoctors();
  }, []);

  const fetchDoctors = async () => {
    try {
      const response = await axios.get('http://localhost:5000/doctores');
      setRecords(response.data);
    } catch (error) {
      console.error(' Error al cargar doctores:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      fetchDoctors();
      return;
    }

    try {
      // Si el valor ingresado es puro número, se busca por ID
      if (/^\d+$/.test(searchTerm.trim())) {
        const response = await axios.get(`http://localhost:5000/doctores/${searchTerm.trim()}`);
        setRecords([response.data]); // Es un único resultado
      } else {
        // Si no es número, busca por nombre
        const response = await axios.get(`http://localhost:5000/doctores/nombre/${searchTerm.trim()}`);
        setRecords(response.data);
      }
    } catch (error) {
      console.error('Error en búsqueda:', error);
      alert('No se encontró ningún doctor con ese criterio');
    }
  };

  // Función para agregar un nuevo registro (por ahora sigue en localStorage, luego la adaptamos)
  const handleAddRecord = (newRecord) => {
    const updatedRecords = [...records, newRecord];
    setRecords(updatedRecords);
    localStorage.setItem('records', JSON.stringify(updatedRecords));
    setShowForm(false);
  };

  return (
    <div>
      <NavBar
        username={username}
        menuOptions={menuOptions}
        onCreate={() => setShowForm(true)}
      />

      <div className="admin-container">
        <h1>Bienvenido, {username}</h1>
        <p>Aquí puedes gestionar el sistema.</p>
        <input
  type="text"
  placeholder="Escribe el ID o nombre de un usuario..."
  value={searchTerm}
  onChange={(e) => {
    const value = e.target.value;
    setSearchTerm(value);

    if (value.trim() === '') {
      fetchDoctors(); // Si el campo está vacío, recarga todos los doctores automáticamente
    }
  }}
  onKeyDown={(e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }}
/>

      </div>

      {/* Formulario de agregar doctor */}
      {showForm && (
        <ClinicalForm
          closeForm={() => setShowForm(false)}
          addRecord={handleAddRecord}
        />
      )}

      {/* Tabla de registros */}
      <div className="records-container">
        <h2>Registros Guardados</h2>
        {records.length === 0 ? (
          <p>No hay registros aún.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Tipo de usuario</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => (
                <tr key={index}>
                  <td>{record.id}</td>
                  <td>{record.nombre_doc}</td>
                  <td>Doctor</td>
                  <td>
                    <button onClick={() => navigate(`/view/${record.id}`)}>
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

export default AdminView;
