// backend/connectionDb.js
const mysql = require('mysql2');
const path = require('path');
const logger = require(path.join(__dirname, '../logging/logger'));
require('dotenv').config();

const required = ['DB_HOST','DB_PORT','DB_USER','DB_PASS','DB_NAME'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  logger.error(`[DB] Faltan variables de entorno: ${missing.join(', ')}`);
  throw new Error(`[DB] Faltan variables de entorno: ${missing.join(', ')}`);
}

const { DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME } = process.env;

const db = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

db.getConnection((err, conn) => {
  if (err) { 
    logger.error(`[DB] Error conectando: ${err.code || err.message}`);
    return; 
  }
  logger.info(`[DB] Conectado a la base de datos ${DB_NAME} en ${DB_HOST}:${DB_PORT}`);
  conn.release();
});

module.exports = db;
