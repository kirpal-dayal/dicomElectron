/**
 * routes/expedienteRoutes.js (o expedienteEstudios.js)
 * 
 * Este módulo define rutas relacionadas con los **estudios médicos** de los pacientes
 * dentro de un expediente, incluyendo la creación y consulta de estudios asociados
 * al número de seguridad social (NSS).
 * 
 * - Este archivo es cargado automáticamente por `server.js` al iniciar el backend.
 * - Se monta bajo el prefijo `/api` (por ejemplo, `/api/expedientes/:nss/studies`).
 * - Utiliza `connectionDb.js` para realizar consultas a la base de datos MySQL.
 * - Interactúa con las tablas:
 *    - `expediente` → Información del paciente.
 *    - `estudio`    → Información de estudios DICOM realizados.
 * - Consumido por el frontend en vistas como `ViewPatient.js` y `AnalisisDetallado`.
 * 
 * - POST `/expedientes/:nss/studies`:
 *     Crea un nuevo estudio (registro en tabla `estudio`) asociado a un expediente existente.
 *     Se requiere la fecha del estudio, y puede incluir descripción y volúmenes.
 *
 * - GET `/expedientes/:nss`:
 *     Devuelve los datos del expediente (sexo, fecha nacimiento, etc.)
 *     junto con todos los estudios registrados para ese paciente, ordenados por fecha.
 *
 * Estas rutas se utilizan en el frontend para visualizar y registrar estudios
 * relacionados con cada paciente, así como para cargar datos en vistas clínicas.
 *
 * - El NSS funciona como clave primaria para vincular expedientes y estudios.
 * - Las fechas deben estar en formato SQL: `YYYY-MM-DD HH:mm:ss`.
 */

const express = require('express');
const db = require('../connectionDb');
const router = express.Router();

// routes/expedienteRoutes.js
// routes/expedienteRoutes.js
router.post('/:nss/studies', (req, res) => {
  const { nss } = req.params;
  const {
    fecha,                 // "YYYY-MM-DD HH:mm:ss"
    descripcion = null,
    volumen_automatico = null,
    volumen_manual = null
  } = req.body;

  if (!fecha) return res.status(400).send('Falta la fecha del estudio');

  const sql = `
    INSERT INTO estudio (fecha, nss_expediente, descripcion, volumen_automatico, volumen_manual)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      descripcion = VALUES(descripcion),
      volumen_automatico = COALESCE(VALUES(volumen_automatico), volumen_automatico),
      volumen_manual     = COALESCE(VALUES(volumen_manual), volumen_manual)
  `;

  db.query(sql, [fecha, nss, descripcion, volumen_automatico, volumen_manual], (err) => {
    if (err) {
      console.error('Error al crear/actualizar estudio:', err);
      return res.status(500).send('Error al crear/actualizar estudio');
    }
    res.status(201).send('Estudio creado/actualizado');
  });
});

// GET /expedientes/:nss
// Devuelve un expediente y todos sus estudios
// router.get(':nss', (req, res) => {
router.get('/expedientes/:nss', (req, res) => {
  const { nss } = req.params;

  const expSql = `
    SELECT nss, sexo, fecha_nacimiento, fecha_creacion
    FROM expediente
    WHERE nss = ?
  `;
  db.query(expSql, [nss], (err, expRows) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error al buscar expediente');
    }
    if (expRows.length === 0) {
      return res.status(404).send('Expediente no encontrado');
    }
    const expediente = expRows[0];

    const estSql = `
      SELECT fecha, descripcion, volumen_automatico, volumen_manual
      FROM estudio
      WHERE nss_expediente = ?
      ORDER BY fecha DESC
    `;
    db.query(estSql, [nss], (err2, estRows) => {
      if (err2) {
        console.error(err2);
        return res.status(500).send('Error al cargar estudios');
      }
      expediente.studies = estRows;
      res.json(expediente);
    });
  });
});

module.exports = router;
