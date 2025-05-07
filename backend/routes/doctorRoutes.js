// src/routes/doctorRoutes.js
const db = require('../connectionDb');
const ENDPOINT = '/doctores';

module.exports = (app) => {
  // Crear nuevo doctor
  app.post(ENDPOINT, (req, res) => {
    const { id, nombre, contrasena, idAdminCreador } = req.body;

    if (!id || !nombre || !contrasena || !idAdminCreador) {
      return res.status(400).send('Faltan datos requeridos');
    }

    const query = 'INSERT INTO doctor (id, nombre_doc, contrasena_doc, id_adminCreador, fecha_creacion) VALUES (?, ?, ?, ?, now())';
    db.query(query, [id, nombre, contrasena, idAdminCreador], (err, results) => {
      if (err) {
        console.error('❌ Error al crear el doctor:', err.message);
        return res.status(500).send('Error al crear el doctor');
      }
      res.status(201).send('✅ Doctor creado exitosamente');
    });
  });

  // Obtener todos los doctores
  app.get(ENDPOINT, (req, res) => {
    db.query('SELECT * FROM doctor', (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send(err);
      }
      res.json(results);
    });
  });

  // Buscar doctor por ID
  app.get(`${ENDPOINT}/:id`, (req, res) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).send('Falta el ID del doctor');
    }
    const query = 'SELECT * FROM doctor WHERE id = ?';
    db.query(query, [id], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al buscar el doctor');
      }
      if (results.length === 0) {
        return res.status(404).send('Doctor no encontrado');
      }
      res.json(results[0]);
    });
  });

  // Buscar doctor por nombre
  app.get(`${ENDPOINT}/nombre/:nombre`, (req, res) => {
    const { nombre } = req.params;
    if (!nombre) {
      return res.status(400).send('Falta el nombre del doctor');
    }
    const query = 'SELECT * FROM doctor WHERE nombre_doc LIKE ?';
    db.query(query, [`%${nombre}%`], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al buscar el doctor');
      }
      if (results.length === 0) {
        return res.status(404).send('No se encontraron doctores con ese nombre');
      }
      res.json(results);
    });
  });
};
