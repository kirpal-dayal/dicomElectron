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

const sql = `
  INSERT INTO expediente (nss, sexo, fecha_nacimiento, id_docCreador, fecha_creacion)
  VALUES (?, ?, ?, ?, NOW())
  ON DUPLICATE KEY UPDATE
    sexo = VALUES(sexo),
    fecha_nacimiento = VALUES(fecha_nacimiento),
    id_docCreador = VALUES(id_docCreador)
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
// POST /api/:nss/studies  -> crear/actualizar estudio (sin pisar con NULL)
router.post('/:nss/studies', (req, res) => {
  const { nss } = req.params;

  // Normalizamos: si la clave NO viene, no la tocamos; si viene null/undefined => COALESCE la ignora
  const fecha = req.body?.fecha; // "YYYY-MM-DD HH:mm:ss"
  const descripcion = (Object.prototype.hasOwnProperty.call(req.body, 'descripcion'))
    ? req.body.descripcion
    : undefined;
  const volumen_automatico = (Object.prototype.hasOwnProperty.call(req.body, 'volumen_automatico'))
    ? req.body.volumen_automatico
    : undefined;
  const volumen_manual = (Object.prototype.hasOwnProperty.call(req.body, 'volumen_manual'))
    ? req.body.volumen_manual
    : undefined;

  if (!fecha) return res.status(400).send('Falta la fecha del estudio');

  // 1) UPDATE primero: COALESCE(NULL, columna) => conserva valor existente
  const updSql = `
    UPDATE estudio
    SET
      descripcion        = COALESCE(?, descripcion),
      volumen_automatico = COALESCE(?, volumen_automatico),
      volumen_manual     = COALESCE(?, volumen_manual)
    WHERE nss_expediente = ? AND fecha = ?
  `;

  // Para los campos "no enviados", pasamos NULL => COALESCE los ignora
  const updParams = [
    (descripcion !== undefined) ? descripcion : null,
    (volumen_automatico !== undefined) ? volumen_automatico : null,
    (volumen_manual !== undefined) ? volumen_manual : null,
    nss,
    fecha,
  ];

  db.query(updSql, updParams, (err, result) => {
    if (err) {
      console.error('[studies][POST][UPDATE] DB error:', err);
      return res.status(500).send('Error al actualizar estudio');
    }

    if (result.affectedRows > 0) {
      // Ya existía y actualizamos sin pisar con NULL
      return res.status(200).send('Estudio actualizado');
    }

    // 2) No existía: solo insertamos si hay algo que valga la pena (evita fila "vacía" con NULLs)
    const hayDescripcion = (descripcion !== undefined && descripcion !== null);
    const hayVolAuto = (volumen_automatico !== undefined && volumen_automatico !== null);
    const hayVolManual = (volumen_manual !== undefined && volumen_manual !== null);

    if (!hayDescripcion && !hayVolAuto && !hayVolManual) {
      // No hay nada para insertar; evitamos crear fila con NULLs
      return res.status(204).send(); // No Content
    }

    const insSql = `
      INSERT INTO estudio (fecha, nss_expediente, descripcion, volumen_automatico, volumen_manual)
      VALUES (?, ?, ?, ?, ?)
    `;
    const insParams = [
      fecha,
      nss,
      hayDescripcion ? descripcion : null,
      hayVolAuto ? volumen_automatico : null,
      hayVolManual ? volumen_manual : null,
    ];

    db.query(insSql, insParams, (err2) => {
      if (err2) {
        console.error('[studies][POST][INSERT] DB error:', err2);
        return res.status(500).send('Error al crear estudio');
      }
      return res.status(201).send('Estudio creado');
    });
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
