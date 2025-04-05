// src/components/AdminView.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from './NavBar';
import ClinicalForm from './ClinicalForm';

function AdminView() {
  const [showForm, setShowForm] = useState(false); // Controla la visibilidad del formulario
  const [records, setRecords] = useState([]); // Estado para guardar los registros
  const navigate = useNavigate(); // Inicializa navigate

  const username = 'Admin';
  //const menuOptions = ['Crear usuario', 'Borrar', 'Modificar', 'Salir'];
  const menuOptions = ['Crear usuario', 'Borrar', 'Ver perfil', 'Salir'];

  // Carga registros desde localStorage al montar el componente
  useEffect(() => {
    const storedRecords = JSON.parse(localStorage.getItem('records')) || [];
    setRecords(storedRecords);
  }, []);

  // Función para agregar un nuevo registro
  const handleAddRecord = (newRecord) => {
    const updatedRecords = [...records, newRecord];
    setRecords(updatedRecords); // Actualiza el estado
    localStorage.setItem('records', JSON.stringify(updatedRecords)); // Guarda en localStorage
    setShowForm(false); // Oculta el formulario
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
        <div>
          <input type='text' placeholder='Escribe el ID o nombre de un usuario...'></input>
          <button>Buscar</button>
        </div>
      </div>

      {/* Formulario para agregar registros */}
      {showForm && (
        <ClinicalForm
          closeForm={() => setShowForm(false)}
          addRecord={handleAddRecord}
        />
      )}

      {/* Tabla de registros guardados */}
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
                {/*
                <th>Nombre</th>
                <th>NSS</th>
                <th>Fecha de Nacimiento</th>
                <th>Sexo</th>
                <th>Acciones</th>
                */}
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => (
                <tr key={index}>
                  <td>{record.nss}</td>
                  <td>{record.name}</td>
                  <td>{record.name}</td>
                  {/*<td>{record.sex}</td>*/}
                  <td>
                    <button onClick={() => navigate(`/view/${index}`)}>
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