// src/components/AdminView.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from './NavBar';
import axios from 'axios'; // IMPORTANTE: Axios para conectar al backend

import logoBlanco from '../assets/images/logo_graf_blanco.svg'; //blanco
import '../styles/styles.css';

function AdminView() {
  const navigate = useNavigate();
  const stored = JSON.parse(localStorage.getItem('user') || '{}');
  const { username = 'Admin', id: adminId = null } = stored;

  // Estados principales
  const [allDoctors, setAllDoctors] = useState([]); // lista maestra
  const [doctors, setDoctors] = useState([])       // lista filtrada
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFormNewDoc, setShowFormNewDoc] = useState(false);
  const [records, setRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // — Modal de registro de doctores —
  const [form, setForm] = useState({ id_doc: '', nombre_doc: '', contrasena_doc: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const menuOptions = ['Crear usuario', 'Borrar', 'Ver perfil', 'Salir'];

  const regexId = /^[DA]\d{4}[A-Z]{4}$/; // Expresion regular para los identificadores de doctor y admin

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

  //Live search
  useEffect(() => {
    const term = searchTerm.trim();
    if (!term) {
      setDoctors(allDoctors);
    }
    else {
      //if (/^\d+$/.test(term)) { // Si el valor ingresado es puro número, se busca por ID
      if (regexId.test(term)) { //Si cumple con el criterio de un ID
        setDoctors(allDoctors.filter(d => d.id.includes(term)));
      } else {// Si no es número, busca por nombre
        setDoctors(allDoctors.filter(d => d.nombre_doc.includes(term)));
      }
    }
  }, [searchTerm, allDoctors]);

  // — Handlers del modal —
  const handleChange = e => {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    setFormError('')
  }

  const handleAddDoctor = async e => {
    e.preventDefault()
    const { id_doc, nombre_doc, contrasena_doc } = form;
    if (!id_doc || !nombre_doc || !contrasena_doc) {
      setFormError('Completa todos los campos');
      return;
    }
    if (!adminId) {
      setFormError('Administrador no identificado en sesión');
      return;
    }
    setSaving(true);
    try {
      await axios.post('http://localhost:5000/doctores', {
        id: id_doc,
        nombre: nombre_doc,
        contrasena: contrasena_doc,
        idAdminCreador: adminId
      });
      await fetchAllDoctors();
      setShowFormNewDoc(false);
      setForm({ id_doc: '', nombre_doc: '', contrasena_doc: '' })
    } catch (err) {
      setFormError(err.response?.data || 'Error al crear doctor')
    } finally {
      setSaving(false)
    }
  }

  const changeDocStatus = async (id_doc) => {
    try {
      console.log('Cambiando estado del doctor con ID:', id_doc);
      await axios.patch(`http://localhost:5000/doctores/${id_doc}`);
      await fetchAllDoctors();
    }
    catch (err) {
      console.error('Error al cambiar el estado del doctor:', err)
    }
  }

  return (
    <div>
      {/*<NavBar
        username={username}
        menuOptions={menuOptions}
        onCreate={() => setShowFormNewDoc(true)}
      />*/}
      <header className="navbar">
        <img src={logoBlanco} alt="Logo" style={{ display: 'block', margin: '10px', height: '90%'}} />
        <div className="nav-buttons">
          <button className="btn" onClick={() => setShowFormNewDoc(true)}>
            Crear Doctor
          </button>
        </div>
      </header>

      <div className="admin-container">
        <h1>Bienvenido, {username}</h1>
        <p>Aquí puedes gestionar a los usuarios doctores.</p>
        <div className='search-bar'>
          <input
            type="text"
            placeholder="Escribe el ID o nombre de un usuario..."
            value={searchTerm}
            onChange={d => setSearchTerm(d.target.value)}
          />
          <button onClick={() => setSearchTerm('')}>X</button>
        </div>
      </div>

      {loading && <p>Cargando doctores</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !doctors.length && <p>No hay doctores aún.</p>}
      {doctors.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {doctors.map(d => (
              <tr key={d.id}>
                <td>{d.id}</td>
                <td>{d.nombre_doc}</td>
                <td>{d.activo === 1 ? "Activo" : "No activo"}</td>
                <td>
                  <button
                    className="btn-primary"
                    onClick={() => changeDocStatus(d.id)}>
                    Cambiar estado
                  </button>
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

      {/* Modal de registro de nuevo Doctor*/}
      {showFormNewDoc && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button
              className="modal-close"
              onClick={() => setShowFormNewDoc(false)}
            >
              ×
            </button>
            <h2>Registrar Doctor</h2>
            <form onSubmit={handleAddDoctor}>
              <div className="form-group">
                <label htmlFor="id_doc">ID</label>
                <input
                  id="id_doc"
                  name="id_doc"
                  value={form.id_doc}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Nombre completo</label>
                <input
                  id="nombre_doc"
                  name="nombre_doc"
                  value={form.nombre_doc}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="contrasena_doc">Contraseña</label>
                <input
                  id="contrasena_doc"
                  name="contrasena_doc"
                  value={form.contrasena_doc}
                  onChange={handleChange}
                  required
                />
              </div>
              {formError && <p className="error">{formError}</p>}
              <button
                className="btn-primary"
                type="submit"
                disabled={saving}
              >
                {saving ? 'Guardando…' : 'Guardar Doctor'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminView;
