// src/components/DoctorView.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function DoctorView() {
  const navigate = useNavigate();

  // — Leer doctor logueado —
  const stored = JSON.parse(localStorage.getItem('user') || '{}');
  const { username = 'Doctor', id: doctorId = null } = stored;

  // — Estados de lista y UI —
  const [patients, setPatients] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [showForm, setShowForm] = useState(false);

  // — Estados del formulario —
  const [form, setForm] = useState({
    nss: '',
    day: '',
    month: '',
    year: '',
    sex: ''
  });
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState('');

  // — Opciones para selects de fecha —
  const days   = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
  ];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);

  // — Carga inicial de expedientes —
  useEffect(() => {
    (async () => {
      try {
        const resp = await axios.get('http://localhost:5000/expedientes');
        setPatients(resp.data);
      } catch (e) {
        console.error(e);
        setError('No se pudieron cargar los expedientes');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // — Form handlers —
  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setFormError('');
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const { nss, day, month, year, sex } = form;
    if (!nss || !day || !month || !year || !sex) {
      setFormError('Completa todos los campos');
      return;
    }
    if (!doctorId) {
      setFormError('Doctor no identificado en sesión');
      return;
    }

    setSaving(true);
    try {
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const fechaNacimiento = `${year}-${mm}-${dd} 00:00:00`;
      const payload = { nss, sexo: Number(sex), fechaNacimiento, idDocCreador: doctorId };

      await axios.post('http://localhost:5000/expedientes', payload);
      const resp = await axios.get('http://localhost:5000/expedientes');
      setPatients(resp.data);
      setShowForm(false);
      setForm({ nss:'', day:'', month:'', year:'', sex:'' });
    } catch (err) {
      console.error(err);
      setFormError(err.response?.data || 'Error al crear expediente');
    } finally {
      setSaving(false);
    }
  };

  // — Otras acciones —
  const handleDelete = async () => {
    const nss = prompt('NSS a eliminar:');
    if (!nss) return;
    if (!window.confirm(`¿Eliminar expediente ${nss}?`)) return;
    try {
      await axios.delete(`http://localhost:5000/expedientes/${nss}`);
      const resp = await axios.get('http://localhost:5000/expedientes');
      setPatients(resp.data);
    } catch (e) {
      console.error(e);
      alert(e.response?.data || 'Error al eliminar expediente');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/', { replace: true });
  };

  const handleViewPatient = nss => navigate(`/view-patient/${nss}`);

  return (
    <>
      <style>{`
        /* Reset y tipografía */
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; color: #333; }

        /* Navbar */
        .navbar {
          display: flex; justify-content: space-between; align-items: center;
          background: #1e293b; padding: 1rem 2rem;
        }
        .navbar h1 { color: #fff; font-size: 2rem; }
        .nav-buttons { display: flex; gap: 1rem; }
        .nav-buttons .btn {
          background: #3b82f6; color: #fff; border: none;
          padding: 0.75rem 1.25rem; border-radius: 4px; cursor: pointer;
          font-size: 1.1rem; transition: background 0.2s;
        }
        .nav-buttons .btn:hover { background: #2563eb; }

        /* Layout principal */
        .container {
          max-width: 1200px; margin: 2rem auto; padding: 0 1rem;
        }
        .table-card {
          background: #fff; border-radius: 8px; padding: 1.5rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .table-card h2 { margin-bottom: 1rem; color: #111827; font-size: 1.75rem; }
        table {
          width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 1.05rem;
        }
        th, td {
          padding: .85rem; text-align: left; border-bottom: 1px solid #e5e7eb;
        }
        th { background: #f9fafb; font-size: 1.1rem; }
        tr:hover { background: #f3f4f6; }

        /* Modal overlay */
        .modal-overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.5); display: flex;
          justify-content: center; align-items: center; z-index: 1000;
        }
        .modal-content {
          position: relative;
          background: #fff; border-radius: 8px;
          padding: 2rem; width: 90%; max-width: 500px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .modal-close {
          position: absolute; top: 0.5rem; right: 0.75rem;
          background: none; border: none; font-size: 1.5rem;
          cursor: pointer; color: #666;
        }

        /* Form dentro del modal */
        .form-card h2 { margin-bottom: 1rem; color: #111827; font-size: 1.75rem; }
        .form-group { margin-bottom: 1rem; }
        .form-group label {
          display: block; margin-bottom: .5rem; color: #374151; font-size: 1.1rem;
        }
        .form-group input,
        .form-group select {
          width: 100%; padding: .75rem; font-size: 1.1rem;
          border: 1px solid #d1d5db; border-radius: 4px;
        }
        .form-group select { -webkit-appearance: none; appearance: none; }
        .form-group input:focus,
        .form-group select:focus {
          outline: none; border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.3);
        }
        .btn-primary {
          background: #2563eb; color: #fff; border: none;
          padding: .75rem 1.5rem; border-radius: 4px; cursor: pointer;
          font-size: 1.1rem; transition: background .2s;
        }
        .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
        .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
        .error { color: #b91c1c; margin-top: .5rem; font-size: 1rem; }
      `}</style>

      {/* NavBar */}
      <header className="navbar">
        <h1>{username}</h1>
        <div className="nav-buttons">
          <button className="btn" onClick={() => setShowForm(true)}>Añadir Paciente</button>
          <button className="btn" onClick={handleDelete}>Eliminar paciente</button>
          <button className="btn" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      {/* Modal para registrar expediente */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            <h2>Registrar Expediente</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="nss">NSS</label>
                <input id="nss" name="nss" value={form.nss} onChange={handleChange} required />
              </div>

              <div className="form-group">
                <label>Fecha de Nacimiento</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select name="day"   value={form.day}   onChange={handleChange} required>
                    <option value="">Día</option>
                    {days.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select name="month" value={form.month} onChange={handleChange} required>
                    <option value="">Mes</option>
                    {months.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                  </select>
                  <select name="year"  value={form.year}  onChange={handleChange} required>
                    <option value="">Año</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="sex">Sexo</label>
                <select id="sex" name="sex" value={form.sex} onChange={handleChange} required>
                  <option value="">Seleccionar</option>
                  <option value="1">Hombre</option>
                  <option value="2">Mujer</option>
                  <option value="3">Otro</option>
                </select>
              </div>

              {formError && <p className="error">{formError}</p>}

              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar Expediente'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Tabla de expedientes */}
      <div className="container">
        <div className="table-card">
          <h2>Pacientes Registrados</h2>
          {loading && <p>Cargando expedientes…</p>}
          {error   && <p className="error">{error}</p>}
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
                    <td>{p.sexo === 1 ? 'Hombre' : p.sexo === 2 ? 'Mujer' : 'Otro'}</td>
                    <td>
                      <button className="btn-primary" onClick={() => handleViewPatient(p.nss)}>
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
    </>
  );
}
