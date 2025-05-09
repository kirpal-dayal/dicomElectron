// backend/httpRequests/expedientes.js
const db = require('../connectionDb');
const ENDPOINT = '/expedientes';

console.log('🗂 expedientes.js cargado');

module.exports = (app) => {
  console.log('  → Registrando rutas de', ENDPOINT);

  // Crear un nuevo expediente
  app.post(ENDPOINT, (req, res) => {
    console.log('📥 POST', ENDPOINT, 'recibido:', req.body);

    const { nss, sexo, fechaNacimiento, idDocCreador } = req.body;

    if (!nss || !sexo || !fechaNacimiento || !idDocCreador) {
      console.log('⚠️ 400 Falta algún campo:', { nss, sexo, fechaNacimiento, idDocCreador });
      return res.status(400).send('Faltan datos requeridos');
    }

    const query = `
      INSERT INTO expediente
        (nss, sexo, fecha_nacimiento, id_docCreador, fecha_creacion)
      VALUES (?, ?, ?, ?, now())
    `;

    db.query(query, [nss, sexo, fechaNacimiento, idDocCreador], (err, results) => {
      if (err) {
        console.error('❌ Error al insertar expediente:', err);
        return res.status(500).send('Error al crear el expediente del paciente');
      }
      console.log('✅ Expediente creado:', nss);
      res.status(201).send('Expediente creado exitosamente');
    });
  });

  // Obtener todos los expedientes
  app.get(ENDPOINT, (req, res) => {
    console.log('📥 GET', ENDPOINT);
    db.query('SELECT * FROM expediente', (err, results) => {
      if (err) {
        console.error('❌ Error al leer expedientes:', err);
        return res.status(500).send('Error al obtener expedientes');
      }
      res.json(results);
    });
  });

  // Buscar un expediente por NSS
  app.get(`${ENDPOINT}/:nss`, (req, res) => {
    const { nss } = req.params;
    console.log(`📥 GET ${ENDPOINT}/${nss}`);
    if (!nss) {
      console.log('⚠️ 400 Falta NSS en params');
      return res.status(400).send('Falta el NSS del expediente');
    }
    db.query('SELECT * FROM expediente WHERE nss = ?', [nss], (err, results) => {
      if (err) {
        console.error('❌ Error al buscar expediente:', err);
        return res.status(500).send('Error al buscar el expediente');
      }
      if (!results.length) {
        console.log('⚠️ 404 Expediente no encontrado:', nss);
        return res.status(404).send('Expediente no encontrado');
      }
      res.json(results[0]);
    });
  });

  // (Opcional) Eliminar un expediente por NSS
  app.delete(`${ENDPOINT}/:nss`, (req, res) => {
    const { nss } = req.params;
    console.log(`📥 DELETE ${ENDPOINT}/${nss}`);
    if (!nss) {
      return res.status(400).send('Falta el NSS para eliminar');
    }
    db.query('DELETE FROM expediente WHERE nss = ?', [nss], (err, results) => {
      if (err) {
        console.error('❌ Error al eliminar expediente:', err);
        return res.status(500).send('Error al eliminar expediente');
      }
      if (results.affectedRows === 0) {
        return res.status(404).send('Expediente no encontrado');
      }
      console.log('✅ Expediente eliminado:', nss);
      res.sendStatus(204);
    });
  });
};
