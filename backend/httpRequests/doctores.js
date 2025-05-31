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
const db = require('../connectionDb');
const ENDPOINT = '/doctores';

require('dotenv').config(); // Cargar variables de entorno
const key = process.env.ENCRYPTION_KEY;

module.exports = (app) => {
  // Crear un nuevo doctor
  app.post(ENDPOINT, (req, res) => {
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
        console.error(err);
        return res.status(500).send('Error al crear el doctor');
      }
      res.status(201).send('Doctor creado exitosamente');
    });
  });

  // Obtener todos los doctores
  app.get(ENDPOINT, (req, res) => {
    db.query('SELECT * FROM doctor', (err, results) => {
      if (err) {
        console.log(err);
        return res.status(500).send(err);
      }
      res.json(results);
    });
  });

  // Buscar un doctor por ID
  app.get(`${ENDPOINT}/:id`, (req, res) => {
    const { id } = req.params; // Extraer el parámetro de la URL
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
      res.json(results[0]); // Devolver el doctor encontrado
    });
  });

  // Buscar un doctor por nombre
  app.get(`${ENDPOINT}/nombre/:nombre`, (req, res) => {
    const { nombre } = req.params; // Extraer el parámetro de la URL
    if(!nombre){
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
      res.json(results); // Devolver todos los doctores que coincidan
    });
  });
};