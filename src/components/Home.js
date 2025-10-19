// src/components/Home.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api'; // ruta relativa desde /src/components

import { loadMaskFiles } from '../utils/loadMaskfiles';
import VTKVolumeViewer from './VTKVolumeViewer';

export default function Home() {
  const [form, setForm] = useState({ id: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [data2, setData2] = useState([]);
  const navigate = useNavigate();

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

  const [isLungRenderVisible, setIsLungRenderVisible] = useState(false);
  const handleShowLungRender = async () => {
    console.log("entro a handleShowLungRender");

    //[lungVolArr, fibroVolArr, dims] = data;
    const [lungVolArr, fibroVolArr, dims] = await loadMaskFiles('jeje');
    setData2([lungVolArr, fibroVolArr, dims]);
    console.log("los datos son home:" + dims);

    console.log("Se recuperaron los volumenes")
    setIsLungRenderVisible(true);
    console.log("Se concluye con exito handleShowLungRender")
    
  };
  const handleBackOrigin = () => {
    setIsLungRenderVisible(false);
  };

  const handleChange = ({ target: { name, value } }) => {
    setForm(f => ({ ...f, [name]: value }));
    setErrors(e => ({ ...e, [name]: '' }));
    setServerError('');
  };

  const validate = () => {
    const errs = {};
    if (!form.id.trim()) errs.id = 'Usuario requerido';
    if (!form.password.trim()) errs.password = 'Contraseña requerida';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      // const { data } = await axios.post( // envia datos al endpoint de login, que va a verificar si el usuario y contraseña son correctos
      //   `${API_URL}/api/login`,
      //   form,
      //   { headers: { 'Content-Type': 'application/json' } }
      // ); console.log(' login data:', data);
      const { data } = await api.post('/api/login', form);

      // Guardar id, username y rol
      localStorage.setItem(
        'user',
        JSON.stringify({
          id: data.id,
          username: data.username,
          role: data.role
        })
      );

      // Redirigir según rol
      if (data.role === 'admin') navigate('/admin');
      else if (data.role === 'doctor') navigate('/doctor');
      else if (data.role === 'user') navigate('/user');
      else setServerError('Rol desconocido');
    } catch (err) {
      // setServerError(err.response?.data || 'Error desconocido al iniciar sesión');
        const msg =
       err?.response?.data?.error ||
       err?.response?.data?.message ||
       err?.message ||
       'Error desconocido al iniciar sesión';
     setServerError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {isLungRenderVisible ? (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
          <VTKVolumeViewer data={data2} />
          <button onClick={handleBackOrigin} style={{ position: 'absolute', top: 20, right: 20 }}>
            Volver a A
          </button>
        </div>
      ) : (
        <>
          <style>{`
        .home-container {
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: #f3f4f6;
          padding: 1rem;
        }
        .login-card {
          background: #fff;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          width: 100%;
          max-width: 400px;
        }
        .title {
          margin-bottom: 1.5rem;
          font-size: 1.5rem;
          color: #111827;
          text-align: center;
        }
        .form-group { margin-bottom: 1rem; }
        .label {
          display: block;
          margin-bottom: 0.5rem;
          color: #374151;
          font-weight: 500;
        }
        .input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 1rem;
        }
        .input:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.3);
        }
        .error-text {
          color: #f87171;
          font-size: 0.875rem;
          margin-top: 0.25rem;
        }
        .btn {
          width: 100%;
          padding: 0.75rem;
          background-color: #2563eb;
          color: #fff;
          border: none;
          border-radius: 4px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .btn:hover:not(:disabled) {
          background-color: #1d4ed8;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>

          <div className="home-container">
            <form className="login-card" onSubmit={handleSubmit}>
              <h2 className="title">Iniciar</h2>

              <div className="form-group">
                <label htmlFor="id" className="label">ID del Usuario</label>
                <input
                  id="id"
                  name="id"
                  className="input"
                  value={form.id}
                  onChange={handleChange}
                  placeholder="Escribe el ID de tu usuario"
                  disabled={loading}
                />
                {errors.id && <p className="error-text">{errors.id}</p>} {/* NOTA: Esto valida al usuario*/}
              </div>

              <div className="form-group">
                <label htmlFor="password" className="label">Contraseña</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className="input"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Escribe tu contraseña"
                  disabled={loading}
                />
                {errors.password && <p className="error-text">{errors.password}</p>}
              </div>

              {serverError && <p className="error-text">{serverError}</p>}

              <button type="submit" className="btn" disabled={loading}>
                {loading ? 'Verificando...' : 'Iniciar Sesión'}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
