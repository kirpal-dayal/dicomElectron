import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function Home() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const navigate = useNavigate();

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setErrors(e => ({ ...e, [name]: '' }));
    setServerError('');
  };

  const validate = () => {
    const errs = {};
    if (!form.username.trim()) errs.username = 'Usuario requerido';
    if (!form.password.trim()) errs.password = 'Contraseña requerida';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const { data } = await axios.post('http://localhost:5000/api/login', form);
      switch (data.role) {
        case 'admin':
          navigate('/admin'); break;
        case 'doctor':
          navigate('/doctor'); break;
        case 'user':
          navigate('/user'); break;
        default:
          setServerError('Rol desconocido');
      }
    } catch (err) {
      setServerError(err.response?.data || 'Error desconocido al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
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
          background: #ffffff;
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
        .form-group {
          margin-bottom: 1rem;
        }
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
          color: #ffffff;
          border: none;
          border-radius: 4px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .btn:hover:not(:disabled) {
          background-color:rgb(24, 65, 0);
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>

      <div className="home-container">
        <form className="login-card" onSubmit={handleSubmit}>
          <h2 className="title">Iniciar Sesión</h2>

          <div className="form-group">
            <label htmlFor="username" className="label">Usuario</label>
            <input
              id="username"
              name="username"
              className="input"
              value={form.username}
              onChange={handleChange}
              placeholder="Escribe tu usuario"
              disabled={loading}
            />
            {errors.username && <p className="error-text">{errors.username}</p>}
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

          <button
            type="submit"
            className="btn"
            disabled={loading}
          >
            {loading ? 'Verificando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </>
  );
}

export default Home;
