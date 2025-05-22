/**
 * httpRequests/expedientes.js
 *
 * Este módulo define las rutas relacionadas con la gestión de expedientes 
 *
 * - Este archivo es cargado automáticamente desde `server.js` mediante el módulo
 *   `/backend/httpRequests`, donde se registran funciones que extienden directamente
 *   la instancia de `express` (`app`).
 * - Utiliza el módulo `connectionDb.js` para conectarse a la base de datos MySQL.
 * - Interactúa con la tabla `expediente`, la cual contiene datos básicos del paciente.
 * - Los expedientes son consumidos por el frontend para listar y consultar pacientes.
 *
 * - POST `/expedientes`: Crea un nuevo expediente médico en la base de datos.
 * - GET `/expedientes`: Devuelve todos los expedientes registrados.
 * - GET `/expedientes/:nss`: Devuelve un expediente específico según el NSS.
 * - DELETE `/expedientes/:nss`: Elimina un expediente por su NSS (uso opcional).
 *
 * Estas rutas son usadas para registrar pacientes desde el frontend, acceder a sus
 * datos clínicos y alimentar los flujos relacionados con estudios, imágenes y reportes.
 *
 * La existencia de un expediente es **requisito previo** para subir archivos DICOM
 * asociados al paciente, ya que la estructura de carpetas y consultas lo utilizan.
 */

const db = require('../connectionDb');
const ENDPOINT = '/expedientes';

console.log('🗂 expedientes.js cargado');

module.exports = (app) => {
  console.log('  → Registrando rutas de', ENDPOINT);

  // Crear un nuevo expediente
  app.post(ENDPOINT, (req, res) => {
    console.log('POST', ENDPOINT, 'recibido:', req.body);

    const { nss, sexo, fechaNacimiento, idDocCreador } = req.body;

    if (!nss || !sexo || !fechaNacimiento || !idDocCreador) {
      console.log('400 Falta algún campo:', { nss, sexo, fechaNacimiento, idDocCreador });
      return res.status(400).send('Faltan datos requeridos');
    }

    const query = `
      INSERT INTO expediente
        (nss, sexo, fecha_nacimiento, id_docCreador, fecha_creacion)
      VALUES (?, ?, ?, ?, now())
    `;

    db.query(query, [nss, sexo, fechaNacimiento, idDocCreador], (err, results) => {
      if (err) {
        console.error('Error al insertar expediente:', err);
        return res.status(500).send('Error al crear el expediente del paciente');
      }
      console.log('Expediente creado:', nss);
      res.status(201).send('Expediente creado exitosamente');
    });
  });

  // Obtener todos los expedientes
  app.get(ENDPOINT, (req, res) => {
    console.log('GET', ENDPOINT);
    db.query('SELECT * FROM expediente', (err, results) => {
      if (err) {
        console.error('Error al leer expedientes:', err);
        return res.status(500).send('Error al obtener expedientes');
      }
      res.json(results);
    });
  });

  // Buscar un expediente por NSS
  app.get(`${ENDPOINT}/:nss`, (req, res) => {
    const { nss } = req.params;
    console.log(`GET ${ENDPOINT}/${nss}`);
    if (!nss) {
      console.log('400 Falta NSS en params');
      return res.status(400).send('Falta el NSS del expediente');
    }
    db.query('SELECT * FROM expediente WHERE nss = ?', [nss], (err, results) => {
      if (err) {
        console.error('Error al buscar expediente:', err);
        return res.status(500).send('Error al buscar el expediente');
      }
      if (!results.length) {
        console.log('404 Expediente no encontrado:', nss);
        return res.status(404).send('Expediente no encontrado');
      }
      res.json(results[0]);
    });
  });

  // (Opcional) Eliminar un expediente por NSS
  app.delete(`${ENDPOINT}/:nss`, (req, res) => {
    const { nss } = req.params;
    console.log(`DELETE ${ENDPOINT}/${nss}`);
    if (!nss) {
      return res.status(400).send('Falta el NSS para eliminar');
    }
    db.query('DELETE FROM expediente WHERE nss = ?', [nss], (err, results) => {
      if (err) {
        console.error('Error al eliminar expediente:', err);
        return res.status(500).send('Error al eliminar expediente');
      }
      if (results.affectedRows === 0) {
        return res.status(404).send('Expediente no encontrado');
      }
      console.log('Expediente eliminado:', nss);
      res.sendStatus(204);
    });
  });
};
