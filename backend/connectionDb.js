//import mysql from 'mysql2';
const mysql = require('mysql2');
require('dotenv').config(); // Cargar variables de entorno
const DB_PASSW = process.env.DB_PASSW;

// Configura la conexión a la base de datos MySQL local de prueba
// OCULTAR VALORES DE CONEXION CUANDO CAMBIEMOS A LA BD REAL!!!!
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: DB_PASSW,
  database: 'fibrosis_v06'
});  // .promise es clave para que funcione con async/await al momento de estar con los json

// Conectar a la base de datos
db.connect(err => {
  if (err) {
    console.error('Error conectando a la base de datos:', err);
    return;
  }
  console.log('Conectado a la base de datos MySQL');
});

module.exports = db;