// src/components/AdminView.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from './NavBar';
import axios from 'axios'; // IMPORTANTE: Axios para conectar al backend

function AdminView() {
  const navigate = useNavigate();
  const stored = JSON.parse(localStorage.getItem('user') || '{}');
  const { username = 'Admin', id: adminId = null } = stored;

  // Estados principales
  const [allDoctors, setAllDoctors] = useState([]); // lista maestra
  const [doctors, setDoctors] = useState([])       // lista filtrada
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [records, setRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const menuOptions = ['Crear usuario', 'Borrar', 'Ver perfil', 'Salir'];

  // Cargar todos los doctores al montar

  const fetchAllDoctors = async () => {
    setLoading(true)
    try {
      const { data } = await axios.get('http://localhost:5000/doctores')
      setAllDoctors(data)
      setDoctors(data)
      setError('')
    } catch {
      setError('No se pudieron cargar los doctores')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllDoctors()
  }, [])
  /*
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
  */

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      //fetchDoctors();
      fetchAllDoctors();
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
              //fetchDoctors(); // Si el campo está vacío, recarga todos los doctores automáticamente
              fetchAllDoctors();
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

      {loading && <p>Cargando doctores</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !doctors.length && <p>No hay doctores aún.</p>}
      {doctors.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
            </tr>
          </thead>
          <tbody>
            {doctors.map(d => (
              <tr key={d.id}>
                <td>{d.id}</td>
                <td>{d.nombre_doc}</td>
                <td>
                  <button
                    className="btn-primary"
                    onClick={() => handleViewDoctor(d.id)}
                  >
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AdminView;
