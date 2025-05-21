const express = require('express');
const db = require('../connectionDb');
const router = express.Router();

// POST /expedientes/:nss/studies
// Crea un nuevo estudio para un expediente dado
router.post('/:nss/studies', (req, res) => {
  const { nss } = req.params;
  const {
    fecha,
    descripcion = null,
    volumen_automatico = null,
    volumen_manual = null
  } = req.body;

  if (!fecha) {
    return res.status(400).send('Falta la fecha del estudio');
  }

  const sql = `
    INSERT INTO estudio
      (fecha, nss_expediente, descripcion, volumen_automatico, volumen_manual)
    VALUES (?, ?, ?, ?, ?)
  `;
  db.query(
    sql,
    [fecha, nss, descripcion, volumen_automatico, volumen_manual],
    err => {
      if (err) {
        console.error('Error al crear estudio:', err);
        return res.status(500).send('Error al crear estudio');
      }
      res.status(201).send('Estudio creado exitosamente');
    }
  );
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
