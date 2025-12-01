/**
 * httpRequests/expedientes.js
 *
 * Este módulo define las rutas relacionadas con la gestión de doctores 
 *
 * - Este archivo es cargado automáticamente desde `server.js` mediante el módulo
 *   `/backend/httpRequests`, donde se registran funciones que extienden directamente
 *   la instancia de `express` (`app`).
 * - Utiliza el módulo `connectionDb.js` para conectarse a la base de datos MySQL.
 * - Interactúa con la tabla `doctor`, la cual contiene datos básicos del doctor.
 * - Los expedientes son consumidos por el frontend para listar y consultar doctores.
 *
 * - POST `/doctores`: Crea un nuevo doctor en la base de datos.
 * - GET `/doctores`: Devuelve todos los doctores registrados.
 * - GET `/doctores/:id`: Devuelve un doctor específico según el id.
 * - DELETE `/doctores/:id`: Elimina un doctor por su id (uso opcional).
 *
 * Estas rutas son usadas para registrar doctores desde el frontend, acceder a sus
 * datos y alimentar los flujos de usuarios.
 *
 * La existencia de un admin es **requisito previo** para crear doctores.
 */
const path = require('path');
const logger = require(path.join(__dirname, '../../logging/logger'));

const db = require('../connectionDb');
const ENDPOINT = '/doctores';

require('dotenv').config(); // Cargar variables de entorno
const key = process.env.ENCRYPTION_KEY;

module.exports = (app) => {
  // Crear un nuevo doctor
  app.post(ENDPOINT, (req, res, next) => {
    /**
     * El cuerpo de la solicitud debe tener la estructura:
     * {
          "id": "D8931NEDE",
          "nombre": "Nelly Delgado",
          "contrasena": "1111111112",
          "idAdminCreador": "A9856KIMU"
        }
      * NOTA: deben de coincidir las claves del json con los nombres de las siguiente constantes
     */
    const { id, nombre, contrasena, idAdminCreador } = req.body;

    // Validar que se reciban todos los campos necesarios
    if (!id || !nombre || !contrasena || !idAdminCreador) {
      return res.status(400).send('Faltan datos requeridos');
    }
    // falta: validar que el id no exista en la bd, que tengan el formato adecuado, etc

    // NOTA: los nombre de los campos deben de coicidir con los de la bd
    const query = 'INSERT INTO doctor (id, nombre_doc, contrasena_doc, id_adminCreador, fecha_creacion) VALUES (?, ?, AES_ENCRYPT(?, ?), ?, now())';
    db.query(query, [id, nombre, contrasena, key, idAdminCreador], (err, results) => {
      if (err) {
        err.status = 500; // Agregar el código de estado
        err.message = `${err.message || ''} - Error al crear el doctor`; // Concatenar el mensaje existente con uno personalizado
        return next(err); // Pasar el error al middleware
      }
      logger.info(`Doctor creado con ID: ${id} por admin: ${idAdminCreador}`);
      res.status(201).send('Doctor creado exitosamente');
    });
  });

  // Obtener todos los doctores
  app.get(ENDPOINT, (req, res, next) => {
    db.query('SELECT * FROM doctor', (err, results) => {
      if (err) {
        err.status = 500; // Opcional: asignar un código de estado
        err.message = `HTTP ${err.status} - ${err.message || ''} - Error al obtener doctores`; // Concatenar el mensaje existente con uno personalizado
        return next(err); // Pasar el error al middleware
      }
      res.json(results);
    });
  });

  // Buscar un doctor por ID
  app.get(`${ENDPOINT}/:id`, (req, res, next) => {
    const { id } = req.params; // Extraer el parámetro de la URL
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
      res.json(results[0]); // Devolver el doctor encontrado
    });
  });

  // Buscar un doctor por nombre
  app.get(`${ENDPOINT}/nombre/:nombre`, (req, res, next) => {
    const { nombre } = req.params; // Extraer el parámetro de la URL
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
      res.json(results); // Devolver todos los doctores que coincidan
    });
  });

  // Cambiar el estado de un doctor (activo1, inactivo0) (Borrado lógico)
  app.patch(`${ENDPOINT}/:id`, (req, res, next) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).send('Falta el ID del doctor');
    }

    // 1. Obtener el estado actual
    db.query('SELECT activo FROM doctor WHERE id = ?', [id], (err, results) => {
      if (err) {
        err.status = 500;
        err.message = `HTTP ${err.status} - ${err.message || ''} - Error al buscar al consultar el estado actual`;
        return next(err);
      }
      if (results.length === 0) {
        return res.status(404).send('Doctor no encontrado');
      }

      const estadoActual = results[0].activo;
      const nuevoEstado = estadoActual === 1 ? 0 : 1;

      // 2. Actualizar el estado
      db.query('UPDATE doctor SET activo = ? WHERE id = ?', [nuevoEstado, id], (err2) => {
        if (err2) {
          err2.status = 500;
          err2.message = `HTTP ${err2.status} - ${err2.message || ''} - Error al actualizar el estado del doctor`;
          return next(err2);
        }
        res.json({ id, nuevoEstado });
      });
    });
  });
};