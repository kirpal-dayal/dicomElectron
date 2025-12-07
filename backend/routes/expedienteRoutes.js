/**
 * routes/expedienteRoutes.js
 *
 * Rutas para gestionar EXPEDIENTES de pacientes y sus ESTUDIOS asociados.
 * - Expedientes: listar, crear/actualizar (upsert) y eliminar por NSS.
 * - Estudios: crear/actualizar por (NSS + fecha) sin “pisar” valores existentes con NULL,
 *   y obtener un expediente junto con todos sus estudios.
 */
const path = require('path');
const logger = require(path.join(__dirname, '../../logging/logger'));
const express = require('express');
const db = require('../connectionDb');
const router = express.Router();

/* =========================
 *  EXPEDIENTES (pacientes)
 * ========================= */

// GET /api/expedientes  -> lista todos los expedientes
router.get('/expedientes', (req, res, next) => {
  const sql = `
    SELECT nss, sexo, fecha_nacimiento, fecha_creacion
    FROM expediente
    ORDER BY fecha_creacion DESC
  `;
  db.query(sql, (err, rows) => {
    if (err) {
      err.status = 500;
      err.message = `HTTP ${err.status} - ${err.message || ''} - Error al listar expedientes`;
      return next(err);
    }
    res.json(rows || []);
  });
});

// POST /api/expedientes  -> crea/actualiza un expediente (lo que usa DoctorView)
router.post('/expedientes', (req, res, next) => {
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
      err.status = 500;
      err.message = `HTTP ${err.status} - ${err.message || ''} - Error al crear/actualizar expediente`;
      return next(err);
    }
    res.status(201).send('Expediente creado/actualizado');
    logger.info(`Expediente ${nss} creado/actualizado por doctor ${idDocCreador || 'N/A'}`);
  });
});

// DELETE /api/expedientes/:nss -> elimina expediente
router.delete('/expedientes/:nss', (req, res, next) => {
  const { nss } = req.params;
  if (!nss) return res.status(400).send('Falta NSS');

  const sql = `DELETE FROM expediente WHERE nss = ?`;
  db.query(sql, [nss], (err, result) => {
    if (err) {
      err.status = 500;
      err.message = `HTTP ${err.status} - ${err.message || ''} - Error al eliminar expediente`;
      return next(err);
    }
    if (result.affectedRows === 0) {
      return res.status(404).send('Expediente no encontrado');
    }
    res.sendStatus(204); // eliminado
    logger.info(`Expediente ${nss} eliminado`);
  });
});

/* =========================
 *  ESTUDIOS por expediente
 * ========================= */

// POST /api/:nss/studies  -> crear/actualizar estudio
// POST /api/:nss/studies  -> crear/actualizar estudio (sin pisar con NULL)
router.post('/:nss/studies', (req, res, next) => {
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

  db.query(updSql, updParams, (err, result, next) => {
    if (err) {
      err.status = 500;
      err.message = `HTTP ${err.status} - ${err.message || ''} - Error al actualizar estudio`;
      return next(err);
    }

    if (result.affectedRows > 0) {
      // Ya existía y actualizamos sin pisar con NULL
      //logger.info(`Estudio para expediente ${nss} en fecha ${fecha} actualizado`);
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
        err2.status = 500;
        err2.message = `HTTP ${err2.status} - ${err2.message || ''} - Error al crear estudio`;
        return next(err2);
      }
      logger.info(`Estudio para expediente ${nss} en fecha ${fecha} creado/actualizado`);
      return res.status(201).send('Estudio creado');
    });
  });
});


// GET /api/expedientes/:nss -> trae un expediente + todos sus estudios
router.get('/expedientes/:nss', (req, res, next) => {
  const { nss } = req.params;

  const expSql = `
    SELECT nss, sexo, fecha_nacimiento, fecha_creacion
    FROM expediente
    WHERE nss = ?
  `;
  db.query(expSql, [nss], (err, expRows) => {
    if (err) {
      err.status = 500;
      err.message = `HTTP ${err.status} - ${err.message || ''} - Error al buscar expediente`;
      return next(err);
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
        err2.status = 500;
        err2.message = `HTTP ${err2.status} - ${err2.message || ''} - Error al cargar estudios`;
        return next(err2);
      }
      expediente.studies = estRows;
      res.json(expediente);
    });
  });
});

module.exports = router;
