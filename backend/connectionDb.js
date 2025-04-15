//import mysql from 'mysql2';
const mysql = require('mysql2');

// Configura la conexión a la base de datos MySQL local de prueba
// OCULTAR VALORES DE CONEXION CUANDO CAMBIEMOS A LA BD REAL!!!!
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '12345678',
  database: 'fibrosis_v05'
});

// Conectar a la base de datos
db.connect(err => {
  if (err) {
    console.error('Error conectando a la base de datos:', err);
    return;
  }
  console.log('Conectado a la base de datos MySQL');
});

module.exports = db;