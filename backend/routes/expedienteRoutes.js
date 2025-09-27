/**
 * routes/expedienteRoutes.js
 * Rutas de EXPEDIENTE del paciente (lista, crear, eliminar) + estudios por NSS.
 */
const express = require('express');
const db = require('../connectionDb');
const router = express.Router();

/* =========================
 *  EXPEDIENTES (pacientes)
 * ========================= */

// GET /api/expedientes  -> lista todos los expedientes
router.get('/expedientes', (req, res) => {
  const sql = `
    SELECT nss, sexo, fecha_nacimiento, fecha_creacion
    FROM expediente
    ORDER BY fecha_creacion DESC
  `;
  db.query(sql, (err, rows) => {
    if (err) {
      console.error('[expedientes][GET] DB error:', err);
      return res.status(500).send('Error al listar expedientes');
    }
    res.json(rows || []);
  });
});

// POST /api/expedientes  -> crea/actualiza un expediente (lo que usa DoctorView)
router.post('/expedientes', (req, res) => {
  const { nss, sexo, fechaNacimiento, idDocCreador = null } = req.body || {};
  if (!nss || !sexo || !fechaNacimiento) {
    return res.status(400).send('Faltan campos: nss, sexo, fechaNacimiento');
  }

  // Ajusta los nombres de columnas a tu schema real.
  const sql = `
    INSERT INTO expediente (nss, sexo, fecha_nacimiento, id_doc_creador)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      sexo = VALUES(sexo),
      fecha_nacimiento = VALUES(fecha_nacimiento)
  `;
  db.query(sql, [nss, Number(sexo), fechaNacimiento, idDocCreador], (err) => {
    if (err) {
      console.error('[expedientes][POST] DB error:', err);
      return res.status(500).send('Error al crear/actualizar expediente');
    }
    res.status(201).send('Expediente creado/actualizado');
  });
});

// DELETE /api/expedientes/:nss -> elimina expediente
router.delete('/expedientes/:nss', (req, res) => {
  const { nss } = req.params;
  if (!nss) return res.status(400).send('Falta NSS');

  const sql = `DELETE FROM expediente WHERE nss = ?`;
  db.query(sql, [nss], (err, result) => {
    if (err) {
      console.error('[expedientes][DELETE] DB error:', err);
      return res.status(500).send('Error al eliminar expediente');
    }
    if (result.affectedRows === 0) {
      return res.status(404).send('Expediente no encontrado');
    }
    res.sendStatus(204); // eliminado
  });
});

/* =========================
 *  ESTUDIOS por expediente
 * ========================= */

// POST /api/:nss/studies  -> crear/actualizar estudio
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
      console.error('[studies][POST] DB error:', err);
      return res.status(500).send('Error al crear/actualizar estudio');
    }
    res.status(201).send('Estudio creado/actualizado');
  });
});

// GET /api/expedientes/:nss -> trae un expediente + todos sus estudios
router.get('/expedientes/:nss', (req, res) => {
  const { nss } = req.params;

  const expSql = `
    SELECT nss, sexo, fecha_nacimiento, fecha_creacion
    FROM expediente
    WHERE nss = ?
  `;
  db.query(expSql, [nss], (err, expRows) => {
    if (err) {
      console.error('[expediente][GET] DB error:', err);
      return res.status(500).send('Error al buscar expediente');
    }
    if (!expRows.length) return res.status(404).send('Expediente no encontrado');

    const expediente = expRows[0];

    const estSql = `
      SELECT fecha, descripcion, volumen_automatico, volumen_manual
      FROM estudio
      WHERE nss_expediente = ?
      ORDER BY fecha DESC
    `;
    db.query(estSql, [nss], (err2, estRows) => {
      if (err2) {
        console.error('[expediente][GET studies] DB error:', err2);
        return res.status(500).send('Error al cargar estudios');
      }
      expediente.studies = estRows;
      res.json(expediente);
    });
  });
});

module.exports = router;
