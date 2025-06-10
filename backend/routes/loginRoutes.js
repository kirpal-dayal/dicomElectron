/**
 * routes/loginRoutes.js
  
 * Este módulo define el endpoint de **autenticación** para los usuarios del sistema
 * DICOMElectron, permitiendo el acceso tanto a administradores como a doctores.

 * - Es cargado automáticamente por `server.js` dentro del backend.
 * - Se monta bajo el prefijo `/api` como `/api/login`.
 * - Utiliza `connectionDb.js` para realizar consultas a la base de datos MySQL.
 * - Es para el frontend para iniciar sesión en el sistema.
 *
 * - POST `/login`: Recibe un `id` y `password`, y valida las credenciales
 *   contra dos tablas distintas:
 *     - `admin`   → para usuarios administradores.
 *     - `doctor`  → para usuarios médicos.
 * - Si encuentra coincidencia:
 *     - Devuelve un objeto JSON con: `id`, `username` y `role`.
 * - Si no encuentra ningún usuario válido:
 *     - Devuelve un error 401 con mensaje de credenciales inválidas.
 
 * - No utiliza hashing ni seguridad avanzada para contraseñas (en su forma actual).
 * - Debe usarse con HTTPS en producción.
 * - El resultado es utilizado por el frontend para establecer sesión y acceso por rol.
 *
 * ejemplos de respuesta bien
 * {
 *   "id": 4,
 *   "username": "dr.carlos",
 *   "role": "doctor"
 * }
 */

const express = require('express');
const router = express.Router();
const db = require('../connectionDb');
require('dotenv').config();
const key = process.env.ENCRYPTION_KEY;

router.post('/login', (req, res) => {
  const { id, password } = req.body;
  console.log(' Intentando login con:', id, password);

  if (!id || !password) {
    console.log(' Faltan campos');
    return res.status(400).send('Faltan datos');
  }

  // — ADMIN —
  const adminQuery = `
    SELECT id_admin    AS id,
          nombre_admin   AS username,
          activo
    FROM admin
    WHERE id_admin = ?
      AND contrasena_admin = AES_ENCRYPT(?, ?)
      AND activo = 1
  `;
  db.query(adminQuery, [id, password, key], (err, adminResults) => {
    if (err) {
      console.error(' Error consultando admin:', err);
      return res.status(500).send('Error al consultar admin');
    }
    if (adminResults.length > 0) {
      console.log(' Admin encontrado:', adminResults[0]);
      return res.json({
        id: adminResults[0].id,
        username: adminResults[0].username,
        role: 'admin'
      });
    }

    // — DOCTOR —
    const doctorQuery = `
    SELECT id           AS id,
          nombre_doc   AS username,
          activo
    FROM doctor
    WHERE id = ?
      AND contrasena_doc = AES_ENCRYPT(?, ?)
      AND activo = 1
  `;
    db.query(doctorQuery, [id, password, key], (err, doctorResults) => {
      if (err) {
        console.error(' Error consultando doctor:', err);
        return res.status(500).send('Error al consultar doctor');
      }
      if (doctorResults.length > 0) {
        console.log(' Doctor encontrado:', doctorResults[0]);
        return res.json({
          id: doctorResults[0].id,
          username: doctorResults[0].username,
          role: 'doctor'
        });
      }

      console.log(' No se encontraron ni admin ni doctor activos');
      return res.status(401).send('Usuario o contraseña incorrectos');
    });
  });
});

module.exports = router;
