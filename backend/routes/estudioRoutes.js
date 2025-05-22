// backend/routes/estudioRoutes.js
const express = require('express');
const db = require('../connectionDb');
const router = express.Router();

// GET  /estudio/:nss   → lista de estudios de ese paciente
router.get('/estudio/:nss', (req, res) => {
  const { nss } = req.params;
  const query = `
    SELECT fecha,
           descripcion,
           volumen_automatico   AS volumenAutomatico,
           volumen_manual       AS volumenManual
    FROM estudio
    WHERE nss_expediente = ?
    ORDER BY fecha DESC
  `;
  db.query(query, [nss], (err, results) => {
    if (err) {
      console.error(' Error al consultar estudios:', err);
      return res.status(500).send('Error al consultar estudios');
    }
    res.json(results);
  });
});

// POST /estudio  → crear estudio manual (si lo necesitas)
router.post('/estudio', (req, res) => {
  const { nss_expediente, fecha, descripcion, volumen_automatico, volumen_manual } = req.body;
  const q = `
    INSERT INTO estudio
      (nss_expediente, fecha, descripcion, volumen_automatico, volumen_manual)
    VALUES (?, ?, ?, ?, ?)
  `;
  db.query(q, [nss_expediente, fecha, descripcion, volumen_automatico, volumen_manual], err => {
    if (err) {
      console.error(' Error al crear estudio:', err);
      return res.status(500).send('Error al crear estudio');
    }
    res.status(201).send('Estudio creado');
  });
});

module.exports = router;
