/**
 * routes/loginRoutes.js
 *
 * Endpoint de autenticación para el sistema.
 * Valida credenciales contra tablas `admin` y `doctor` (solo usuarios activos),
 * usando AES_ENCRYPT con la misma ENCRYPTION_KEY configurada en el backend.
 *
 * NOTA CRÍTICA:
 * - No se debe imprimir la contraseña en logs.
 * - Si ENCRYPTION_KEY no está definida o no coincide con la usada al registrar usuarios,
 *   el login fallará aunque el password sea correcto.
 */

const path = require('path');
const logger = require(path.join(__dirname, '../../logging/logger'));

const express = require('express');
const router = express.Router();
const db = require('../connectionDb');

require('dotenv').config();
const key = process.env.ENCRYPTION_KEY;

router.post('/login', (req, res, next) => {
  const { id, password } = req.body;

  // Log mínimo (sin password)
  logger.info(`[LOGIN] Intento de login id=${id}`);

  if (!id || !password) {
    return res.status(400).send('Faltan datos');
  }

  // — ADMIN —
  const adminQuery = `
    SELECT id_admin AS id,
           nombre_admin AS username,
           activo
      FROM admin
     WHERE id_admin = ?
       AND contrasena_admin = AES_ENCRYPT(?, ?)
       AND activo = 1
  `;

  db.query(adminQuery, [id, password, key], (err, adminResults) => {
    if (err) {
      err.status = 500;
      err.message = `HTTP ${err.status} - ${err.message || ''} - Error al consultar admin`;
      return next(err);
    }

    if (adminResults.length > 0) {
      return res.json({
        id: adminResults[0].id,
        username: adminResults[0].username,
        role: 'admin',
      });
    }

    // — DOCTOR —
    const doctorQuery = `
      SELECT id AS id,
             nombre_doc AS username,
             activo
        FROM doctor
       WHERE id = ?
         AND contrasena_doc = AES_ENCRYPT(?, ?)
         AND activo = 1
    `;

    db.query(doctorQuery, [id, password, key], (err2, doctorResults) => {
      if (err2) {
        err2.status = 500;
        err2.message = `HTTP ${err2.status} - ${err2.message || ''} - Error al consultar doctor`;
        return next(err2);
      }

      if (doctorResults.length > 0) {
        logger.info(`[LOGIN] Doctor autenticado id=${doctorResults[0].id}`);
        return res.json({
          id: doctorResults[0].id,
          username: doctorResults[0].username,
          role: 'doctor',
        });
      }

      // CRÍTICO: este 401 es el que termina mostrando el front como "Request failed with status code 401"
      return res.status(401).send('Usuario o contraseña incorrectos');
    });
  });
});

module.exports = router;
