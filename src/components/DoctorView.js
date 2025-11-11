// src/components/DoctorView.js
import React, { useState, useEffect } from 'react';
import api from '../api';
import { useNavigate } from 'react-router-dom';

import { descargarReporteGeneral } from '../utils/reportes/descargarReportes';

import logoBlanco from '../assets/images/logo_graf_blanco.svg'; //blanco
import '../styles/styles.css';
import '../styles/variables.css';

export default function DoctorView() {
  const navigate = useNavigate()
  const stored = JSON.parse(localStorage.getItem('user') || '{}')
  const { username = 'Doctor', id: doctorId = null } = stored

  // — Estados principales —
  const [allPatients, setAllPatients] = useState([]) // lista maestra
  const [patients, setPatients] = useState([])       // lista filtrada
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  // — Modal de registro —
  const [form, setForm] = useState({ nss: '', day: '', month: '', year: '', sex: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // — Búsqueda por NSS —
  const [searchTerm, setSearchTerm] = useState('')

  // — Opciones de fecha —
  const days = Array.from({ length: 31 }, (_, i) => i + 1)
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ]
  const years = Array.from({ length: 100 }, (_, i) =>
    new Date().getFullYear() - i
  )

  // — Traer todos los expedientes —
  // src/components/DoctorView.js
  // import api from '../api'; // en vez de import axios from 'axios'

  // …

  const fetchAll = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/expedientes')  // <- sin localhost
      // Normaliza: garantiza un array aunque el backend devuelva {rows: [...]}, {patients: [...]}, etc.
      const list =
        Array.isArray(data) ? data :
          Array.isArray(data?.patients) ? data.patients :
            Array.isArray(data?.rows) ? data.rows :
              []

      setAllPatients(list)
      setPatients(list)
      setError(list.length ? '' : 'No se encontraron expedientes')
    } catch (e) {
      console.error('[DoctorView] /api/expedientes error:', e?.response?.data || e.message)
      setError('No se pudieron cargar los expedientes')
      setAllPatients([])
      setPatients([])
    } finally {
      setLoading(false)
    }
  }



  useEffect(() => {
    fetchAll()
  }, [])

  // — Live search: filtra localmente allPatients según searchTerm —
  useEffect(() => {
    const term = searchTerm.trim()
    const base = Array.isArray(allPatients) ? allPatients : []
    if (!term) {
      setPatients(base)
    } else {
      setPatients(
        base.filter(p => String(p?.nss ?? '').includes(term))
      )
    }
  }, [searchTerm, allPatients])


  // — Handlers del modal —
  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setFormError('');
  };

  const handleSubmit = async e => {
    e.preventDefault()
    const { nss, day, month, year, sex } = form
    if (!nss || !day || !month || !year || !sex) {
      setFormError('Completa todos los campos')
      return
    }
    if (!doctorId) {
      setFormError('Doctor no identificado en sesión')
      return
    }
    setSaving(true)
    try {
      const mm = String(month).padStart(2, '0')
      const dd = String(day).padStart(2, '0')
      const fechaNacimiento = `${year}-${mm}-${dd} 00:00:00`
      await api.post('/api/expedientes', {
        nss,
        sexo: Number(sex),
        fechaNacimiento,
        idDocCreador: doctorId
      })
      await fetchAll()
      setShowForm(false)
      setForm({ nss: '', day: '', month: '', year: '', sex: '' })
    } catch (err) {
      setFormError(err.response?.data || 'Error al crear expediente')
    } finally {
      setSaving(false)
    }
  }

  // — Eliminar expediente —
  const handleDelete = async () => {
    const nss = prompt('NSS a eliminar:')
    if (!nss || !window.confirm(`¿Eliminar expediente ${nss}?`)) return
    try {
      await api.delete(`/api/expedientes/${nss}`)
      await fetchAll()
    } catch {
      alert('Error al eliminar expediente')
    }
  }

  // — Logout y navegación —
  const handleLogout = () => {
    localStorage.removeItem('user')
    navigate('/', { replace: true })
  }
  // — Navegar a ViewPatient —
  const handleViewPatient = (nss) => {
    navigate(`/view-patient/${nss}`)
  }


  return (
    <>
      <style>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'Segoe UI',sans-serif; background:#f0f2f5; color:#333; }

        .navbar h1 { color:#fff; font-size:2rem; }
        .nav-buttons { display:flex; gap:1rem; }
        .nav-buttons .btn {
          background:#3b82f6; color:#fff; border:none;
          padding:.75rem 1.25rem; border-radius:4px; cursor:pointer;
          font-size:1.1rem; transition:background .2s;
        }
        .nav-buttons .btn:hover { background:#2563eb; }

        .table-card {
          background:#fff; border-radius:8px; padding:1.5rem;
          box-shadow:0 4px 12px rgba(0,0,0,0.1);
          text-align:center;
        }
        .table-card h2 {
          font-size:1.75rem; color:#111827; margin-bottom:.75rem;
        }

        /* Barra de búsqueda */
        .search-bar {
          display:flex; gap:.5rem; margin-bottom:1.5rem;
        }
        .search-bar input {
          flex:1; padding:.5rem .75rem; font-size:1rem;
          border:1px solid #d1d5db; border-radius:4px; background:#fff;
        }
        .search-bar button {
          padding:.55rem 1rem; font-size:1rem;
          background:#2563eb; color:#fff; border:none; border-radius:4px;
          cursor:pointer; transition:background .2s;
        }
        .search-bar button:hover { background:#1d4ed8; }

        table {
          width:100%; border-collapse:collapse; font-size:1.05rem;
        }
        th, td {
          padding:.85rem; text-align:left; border-bottom:1px solid #e5e7eb;
        }
        th { background:#f9fafb; font-size:1.1rem; }
        tr:hover { background:#f3f4f6; }

        /* Modal */
        .modal-overlay {
          position:fixed; top:0; left:0; width:100%; height:100%;
          background:rgba(0,0,0,0.5); display:flex;
          justify-content:center; align-items:center; z-index:1000;
        }
        .modal-content {
          background:#fff; border-radius:8px; padding:2rem;
          width:90%; max-width:500px; box-shadow:0 4px 12px rgba(0,0,0,0.2);
          position:relative;
        }
        .modal-close {
          position:absolute; top:.5rem; right:.75rem;
          font-size:1.5rem; background:none; border:none; cursor:pointer; color:#666;
        }
        .form-group { margin-bottom:1rem; }
        .form-group label {
          display:block; margin-bottom:.5rem; font-size:1.1rem; color:#374151;
        }
        .form-group input,
        .form-group select {
          width:100%; padding:.75rem; font-size:1.1rem;
          border:1px solid #d1d5db; border-radius:4px;
        }
        .btn-primary {
          background:#2563eb; color:#fff; border:none;
          padding:.75rem 1.5rem; border-radius:4px; font-size:1.1rem;
          cursor:pointer; transition:background .2s;
        }
        .btn-primary:hover:not(:disabled) { background:#1d4ed8; }
        .btn-primary:disabled { opacity:.6; cursor:not-allowed; }
        .error { color:#b91c1c; margin-top:.5rem; }
      `}</style>

      {/* Navbar */}
      <header className="navbar">
        <img src={logoBlanco} alt="Logo" style={{ display: 'block', margin: '10px', height: '90%' }} />
        <div className="nav-buttons">
          <button className="btn" onClick={() => setShowForm(true)}>
            Añadir Paciente
          </button>
          {/* <button className='btn' onClick={descargarReporteGeneral}>Descargar reporte general (.xlsx)</button> */}
          <button className='btn' onClick={descargarReporteGeneral}>Descargar reporte general (.xlsx)📋</button>
          <button className="btn" onClick={handleLogout}>
            Salir
          </button>
        </div>
      </header>

      <div className="container">
        <div className="table-card">
          <h1>Bienvenido, {username}</h1>
          <p>Aquí puedes gestionar los expedientes de tus pacientes.</p>
          <br />
          {/* Barra de búsqueda */}
          <div className="search-bar">
            <input
              type="text"
              placeholder="Buscar por NSS…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <button onClick={() => setSearchTerm('')}>✖︎</button>
          </div>

          {loading && <p>Cargando expedientes…</p>}
          {error && <p className="error">{error}</p>}
          {!loading && !patients.length && <p>No hay pacientes aún.</p>}
          {patients.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>NSS</th>
                  <th>Fecha Nacimiento</th>
                  <th>Sexo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {patients.map(p => (
                  <tr key={p.nss}>
                    <td>{p.nss}</td>
                    <td>{new Date(p.fecha_nacimiento).toLocaleDateString()}</td>
                    <td>{
                      Number(p.sexo) === 1 ? 'Hombre'
                        : Number(p.sexo) === 2 ? 'Mujer'
                          : 'Otro'
                    }</td>

                    <td>
                      <button
                        className="btn-primary"
                        onClick={() => handleViewPatient(p.nss)}
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
      </div>

      {/* Modal de registro */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button
              className="modal-close"
              onClick={() => setShowForm(false)}
            >
              ×
            </button>
            <h2>Registrar Expediente</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="nss">NSS</label>
                <input
                  id="nss"
                  name="nss"
                  value={form.nss}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Fecha de Nacimiento</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select
                    name="day"
                    value={form.day}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Día</option>
                    {days.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <select
                    name="month"
                    value={form.month}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Mes</option>
                    {months.map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  <select
                    name="year"
                    value={form.year}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Año</option>
                    {years.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="sex">Sexo</label>
                <select
                  id="sex"
                  name="sex"
                  value={form.sex}
                  onChange={handleChange}
                  required
                >
                  <option value="">Seleccionar</option>
                  <option value="1">Hombre</option>
                  <option value="2">Mujer</option>
                  <option value="3">Otro</option>
                </select>
              </div>
              {formError && <p className="error">{formError}</p>}
              <button
                className="btn-primary"
                type="submit"
                disabled={saving}
              >
                {saving ? 'Guardando…' : 'Guardar Expediente'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
