/**
 * httpRequests/doctores.js  (antes: expedientes.js)
 *
 * Rutas HTTP para administrar doctores (CRUD parcial + borrado lógico) en MySQL.
 *
 * Cómo se integra:
 * - Este módulo exporta una función (app) => {...} que registra rutas directamente
 *   sobre la instancia de Express. Normalmente `server.js` carga automáticamente todos
 *   los módulos dentro de `/backend/httpRequests`.
 * - Usa `connectionDb.js` como pool/conexión MySQL (callback-based).
 * - Trabaja principalmente sobre la tabla `doctor`.
 */
const db = require('../connectionDb');
const ENDPOINT = '/doctores';

require('dotenv').config();
const key = process.env.ENCRYPTION_KEY;

// CRÍTICO: si falta la key, el cifrado de contraseñas se rompe.
// En un entorno real conviene "fail fast" (tirar error y no levantar el server).
// if (!key) throw new Error('ENCRYPTION_KEY no definida en variables de entorno');

module.exports = (app) => {
  // ---------------------------------------------------------------------------
  // POST /doctores
  // Crea un doctor.
  // ---------------------------------------------------------------------------
  app.post(ENDPOINT, (req, res) => {

    const { id, nombre, contrasena, idAdminCreador } = req.body;

    // Validación mínima de presencia.
    if (!id || !nombre || !contrasena || !idAdminCreador) {
      return res.status(400).send('Faltan datos requeridos');
    }

    const query =
      'INSERT INTO doctor (id, nombre_doc, contrasena_doc, id_adminCreador, fecha_creacion) ' +
      'VALUES (?, ?, AES_ENCRYPT(?, ?), ?, now())';

    // uso de placeholders evita SQL injection.
    db.query(query, [id, nombre, contrasena, key, idAdminCreador], (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al crear el doctor');
      }
      return res.status(201).send('Doctor creado exitosamente');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /doctores
  // Lista todos los doctores.
  // ---------------------------------------------------------------------------
  app.get(ENDPOINT, (req, res) => {

    db.query('SELECT * FROM doctor', (err, results) => {
      if (err) {
        console.log(err);
        return res.status(500).send(err);
      }
      return res.json(results);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /doctores/:id
  // Obtiene un doctor por ID.
  // ---------------------------------------------------------------------------
  app.get(`${ENDPOINT}/:id`, (req, res) => {
    const { id } = req.params;

    if (!id) {
      return res.status(400).send('Falta el ID del doctor');
    }

    const query = 'SELECT * FROM doctor WHERE id = ?';
    db.query(query, [id], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al buscar el doctor');
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
  app.get(`${ENDPOINT}/nombre/:nombre`, (req, res) => {
    const { nombre } = req.params;

    if (!nombre) {
      return res.status(400).send('Falta el nombre del doctor');
    }

    const query = 'SELECT * FROM doctor WHERE nombre_doc LIKE ?';
    db.query(query, [`%${nombre}%`], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al buscar el doctor');
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
  app.patch(`${ENDPOINT}/:id`, (req, res) => {
    const { id } = req.params;

    if (!id) {
      return res.status(400).send('Falta el ID del doctor');
    }

    // 1) Lee el estado actual
    db.query('SELECT activo FROM doctor WHERE id = ?', [id], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al consultar el estado actual');
      }
      if (results.length === 0) {
        return res.status(404).send('Doctor no encontrado');
      }

      const estadoActual = results[0].activo;
      const nuevoEstado = estadoActual === 1 ? 0 : 1;

      // 2) Actualiza
      db.query('UPDATE doctor SET activo = ? WHERE id = ?', [nuevoEstado, id], (err2) => {
        if (err2) {
          console.error(err2);
          return res.status(500).send('Error al actualizar el estado');
        }
        return res.json({ id, nuevoEstado });
      });
    });
  });
};
