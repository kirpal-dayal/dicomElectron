const express = require('express');
const router = express.Router();
const db = require('../connectionDb');

// Ruta de login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log('📩 Intentando login con:', username, password);

  if (!username || !password) {
    console.log('❌ Faltan campos');
    return res.status(400).send('Faltan datos');
  }

  // Primero buscar en admin
  const adminQuery = 'SELECT * FROM admin WHERE nombre_admin = ? AND contrasena_admin = ?';
  db.query(adminQuery, [username, password], (err, adminResults) => {
    if (err) {
      console.error('❌ Error consultando admin:', err);
      return res.status(500).send('Error al consultar admin');
    }
    if (adminResults.length > 0) {
      console.log('✅ Admin encontrado:', adminResults[0]);
      return res.json({ role: 'admin' });
    }

    // No es admin, buscar en doctor
    const doctorQuery = 'SELECT * FROM doctor WHERE nombre_doc = ? AND contrasena_doc = ?';
    db.query(doctorQuery, [username, password], (err, doctorResults) => {
      if (err) {
        console.error('❌ Error consultando doctor:', err);
        return res.status(500).send('Error al consultar doctor');
      }
      if (doctorResults.length > 0) {
        console.log('✅ Doctor encontrado:', doctorResults[0]);
        return res.json({ role: 'doctor' });
      }

      console.log('❌ No se encontró ni admin ni doctor');
      return res.status(401).send('Usuario o contraseña incorrectos');
    });
  });
});

module.exports = router;
