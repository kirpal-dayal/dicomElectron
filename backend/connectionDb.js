// // connectionDb.js
// const mysql = require('mysql2');
// require('dotenv').config(); // Cargar variables de entorno
// const DB_PASSW = process.env.DB_PASSW;

// // Configura la conexión a la base de datos MySQL local de prueba
// // OCULTAR VALORES DE CONEXION CUANDO CAMBIEMOS A LA BD REAL!!!!
// const db = mysql.createConnection({
//   host: 'localhost',
//   user: 'root',
//   password: DB_PASSW,
//   database: 'fibrosis_v06'
// });  // .promise es clave para que funcione con async/await al momento de estar con los json

// // Conectar a la base de datos
// db.connect(err => {
//   if (err) {
//     console.error('Error conectando a la base de datos:', err);
//     return;
//   }
//   console.log('Conectado a la base de datos MySQL');
// });

// module.exports = db;

// backend/connectionDb.js
const mysql = require('mysql2');
require('dotenv').config();

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASS = '',
  DB_NAME = 'fibrosis_v07'
} = process.env;

const PASSWORD = DB_PASS || DB_PASSW || '';

const db = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

db.getConnection((err, conn) => {
  if (err) {
    console.error('[DB] Error conectando:', err.message);
    return;
  }
  console.log(`[DB] Conectado a ${DB_NAME} @ ${DB_HOST}:${DB_PORT} (user: ${DB_USER})`);
  conn.release();
});

module.exports = db;

