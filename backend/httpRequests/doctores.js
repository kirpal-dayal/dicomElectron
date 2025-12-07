/**
 * httpRequests/doctores.js  (antes: expedientes.js)
 *
 * Rutas HTTP para administrar doctores (CRUD parcial + borrado lógico) en MySQL.
 *
 * Endpoints:
 * - POST   /doctores               Crea un doctor (password cifrada con AES_ENCRYPT).
 * - GET    /doctores               Lista todos los doctores.
 * - GET    /doctores/:id           Obtiene un doctor por ID.
 * - GET    /doctores/nombre/:nombre Busca doctores por nombre (LIKE).
 * - PATCH  /doctores/:id           Alterna campo `activo` (borrado lógico / reactivar).
 *
 * Cómo se integra:
 * - Este módulo exporta una función (app) => {...} que registra rutas directamente
 *   sobre la instancia de Express. Normalmente `server.js` carga automáticamente todos
 *   los módulos dentro de `/backend/httpRequests`.
 * - Usa `connectionDb.js` como pool/conexión MySQL (callback-based).
 * - Trabaja principalmente sobre la tabla `doctor`.
 *
 * Requisito:
 * - Debe existir ENCRYPTION_KEY en variables de entorno para que el cifrado funcione.
 */

const path = require('path');
const logger = require(path.join(__dirname, '../../logging/logger'));

const db = require('../connectionDb');
const ENDPOINT = '/doctores';

require('dotenv').config();
const key = process.env.ENCRYPTION_KEY;

module.exports = (app) => {

  app.post(ENDPOINT, (req, res, next) => {
    const { id, nombre, contrasena, idAdminCreador } = req.body;

    // Validación mínima de presencia.
    if (!id || !nombre || !contrasena || !idAdminCreador) {
      return res.status(400).send('Faltan datos requeridos');
    }

    const query =
      'INSERT INTO doctor (id, nombre_doc, contrasena_doc, id_adminCreador, fecha_creacion) ' +
      'VALUES (?, ?, AES_ENCRYPT(?, ?), ?, now())';

    db.query(query, [id, nombre, contrasena, key, idAdminCreador], (err) => {
      if (err) {
        err.status = 500;
        err.message = `${err.message || ''} - Error al crear el doctor`;
        return next(err);
      }
      logger.info(`Doctor creado con ID: ${id} por admin: ${idAdminCreador}`);
      return res.status(201).send('Doctor creado exitosamente');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /doctores
  // Lista todos los doctores.
  // ---------------------------------------------------------------------------
  app.get(ENDPOINT, (req, res, next) => {
    db.query('SELECT * FROM doctor', (err, results) => {
      if (err) {
        err.status = 500;
        err.message = `HTTP ${err.status} - ${err.message || ''} - Error al obtener doctores`;
        return next(err);
      }
      return res.json(results);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /doctores/:id
  // Obtiene un doctor por ID.
  // ---------------------------------------------------------------------------
  app.get(`${ENDPOINT}/:id`, (req, res, next) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).send('Falta el ID del doctor');
    }

    const query = 'SELECT * FROM doctor WHERE id = ?';
    db.query(query, [id], (err, results) => {
      if (err) {
        err.status = 500;
        err.message = `HTTP ${err.status} - ${err.message || ''} - Error al buscar el doctor por ID`;
        return next(err);
      }
      if (results.length === 0) {
        return res.status(404).send('Doctor no encontrado');
      }
      return res.json(results[0]);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /doctores/nombre/:nombre
  // Busca doctores por nombre (LIKE).
  // ---------------------------------------------------------------------------
  app.get(`${ENDPOINT}/nombre/:nombre`, (req, res, next) => {
    const { nombre } = req.params;
    if (!nombre) {
      return res.status(400).send('Falta el nombre del doctor');
    }

    const query = 'SELECT * FROM doctor WHERE nombre_doc LIKE ?';
    db.query(query, [`%${nombre}%`], (err, results) => {
      if (err) {
        err.status = 500;
        err.message = `HTTP ${err.status} - ${err.message || ''} - Error al buscar el doctor por nombre`;
        return next(err);
      }
      if (results.length === 0) {
        return res.status(404).send('No se encontraron doctores con ese nombre');
      }
      return res.json(results);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /doctores/:id
  // Alterna "activo" (1 ↔ 0). Esto funciona como borrado lógico / reactivación.
  // ---------------------------------------------------------------------------
  app.patch(`${ENDPOINT}/:id`, (req, res, next) => {
    const { id } = req.params;

    if (!id) {
      return res.status(400).send('Falta el ID del doctor');
    }

    // 1) Lee el estado actual
    db.query('SELECT activo FROM doctor WHERE id = ?', [id], (err, results) => {
      if (err) {
        err.status = 500;
        err.message = `HTTP ${err.status} - ${err.message || ''} - Error al consultar el estado actual`;
        return next(err);
      }
      if (results.length === 0) {
        return res.status(404).send('Doctor no encontrado');
      }

      const estadoActual = results[0].activo;
      const nuevoEstado = estadoActual === 1 ? 0 : 1;

      // 2) Actualiza
      db.query('UPDATE doctor SET activo = ? WHERE id = ?', [nuevoEstado, id], (err2) => {
        if (err2) {
          err2.status = 500;
          err2.message = `HTTP ${err2.status} - ${err2.message || ''} - Error al actualizar el estado del doctor`;
          return next(err2);
        }
        return res.json({ id, nuevoEstado });
      });
    });
  });
};
