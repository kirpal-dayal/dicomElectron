//  * Rutas HTTP para consultar y actualizar información de estudios (tabla `estudio`)
//  * y devolver métricas agregadas por estudio (conteo de imágenes desde tabla `imagen`).
const express = require('express');
const db = require('../connectionDb');

const ENDPOINT = '/api/estudios';

console.log(' estudios.js cargado');

module.exports = (app) => {
  console.log('  → Registrando rutas de', ENDPOINT);

  // Obtener todos los estudios p/ el reporte gral con conteo de imágenes
  app.get(ENDPOINT, (req, res) => {
    const query = `
      SELECT
        DATE_FORMAT(e.fecha, '%Y-%m-%d %H:%i:%s') AS fecha,  
        e.nss_expediente,
        e.descripcion,
        e.diagnostico,
        e.volumen_automatico,
        e.volumen_manual,
        COUNT(i.nss_exp) AS num_imgs
      FROM estudio AS e
      LEFT JOIN imagen AS i
        ON e.nss_expediente = i.nss_exp
       AND e.fecha = i.fecha_estudio
      GROUP BY
        e.fecha,
        e.nss_expediente,
        e.descripcion,
        e.diagnostico,
        e.volumen_automatico,
        e.volumen_manual
      ORDER BY e.fecha DESC
    `;
    db.query(query, (err, results) => {
      if (err) {
        console.error('[GET /api/estudios] DB error:', err);
        return res.status(500).send('Error al consultar estudios');
      }
      res.json(results);
    });
  });

  // Obtener todos los estudios de un paciente por NSS con conteo de imágenes
  app.get(ENDPOINT + '/:nss', (req, res) => {
    const { nss } = req.params;
    if (!nss) return res.status(400).send('Falta el NSS del paciente');

    const query = `
      SELECT
        DATE_FORMAT(e.fecha, '%Y-%m-%d %H:%i:%s') AS fecha, 
        e.nss_expediente,
        e.descripcion,
        e.diagnostico,
        e.volumen_automatico,
        e.volumen_manual,
        COUNT(i.nss_exp) AS num_imgs
      FROM estudio AS e
      LEFT JOIN imagen AS i
        ON e.nss_expediente = i.nss_exp
       AND e.fecha = i.fecha_estudio
      WHERE e.nss_expediente = ?
      GROUP BY
        e.fecha,
        e.nss_expediente,
        e.descripcion,
        e.diagnostico,
        e.volumen_automatico,
        e.volumen_manual
      ORDER BY e.fecha DESC
    `;
    db.query(query, [nss], (err, results) => {
      if (err) {
        console.error('[GET /api/estudios/:nss] DB error:', err);
        return res.status(500).send('Error al buscar estudios');
      }
      if (results.length === 0) {
        return res.status(404).send('Estudios no encontrados');
      }
      res.json(results);
    });
  });

  // Modificar la descripcion de un estudio
  app.patch(ENDPOINT + '/descripcion', express.json(), (req, res) => {
    const { nss_expediente, fecha, descripcion } = req.body || {};
    if (!nss_expediente || !fecha) {
      return res.status(400).send('Faltan parámetros');
    }
    const query = `
      UPDATE estudio
         SET descripcion = ?
       WHERE nss_expediente = ?
         AND fecha = COALESCE(
           STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s'),
           STR_TO_DATE(?, '%Y-%m-%dT%H:%i:%s.%fZ'),
           STR_TO_DATE(?, '%Y-%m-%dT%H:%i:%sZ')
         )
    `;
    db.query(query, [descripcion ?? null, nss_expediente, fecha, fecha, fecha], (err, r) => {
      if (err) {
        console.error('[PATCH /api/estudios/descripcion] DB error:', err);
        return res.status(500).send('Error al actualizar la descripción');
      }
      if (!r || r.affectedRows === 0) {
        return res.status(404).send('Estudio no encontrado (NSS/fecha no coinciden)');
      }
      res.json({ ok: true });
    });
  });

  // Modificar el diagnostico de un estudio
  app.patch(ENDPOINT + '/diagnostico', express.json(), (req, res) => {
    const { nss_expediente, fecha, diagnostico } = req.body || {};
    if (!nss_expediente || !fecha) {
      return res.status(400).send('Faltan parámetros');
    }
    const query = `
      UPDATE estudio
         SET diagnostico = ?
       WHERE nss_expediente = ?
         AND fecha = COALESCE(
           STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s'),
           STR_TO_DATE(?, '%Y-%m-%dT%H:%i:%s.%fZ'),
           STR_TO_DATE(?, '%Y-%m-%dT%H:%i:%sZ')
         )
    `;
    db.query(query, [diagnostico ?? null, nss_expediente, fecha, fecha, fecha], (err, r) => {
      if (err) {
        console.error('[PATCH /api/estudios/diagnostico] DB error:', err);
        return res.status(500).send('Error al actualizar el diagnóstico');
      }
      if (!r || r.affectedRows === 0) {
        return res.status(404).send('Estudio no encontrado (NSS/fecha no coinciden)');
      }
      res.json({ ok: true });
    });
  });
};
