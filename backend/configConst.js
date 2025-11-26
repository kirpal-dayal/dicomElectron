const dotenv = require('dotenv');
dotenv.config();

const port = process.env.PORT || 5000;
const nameDirectoryRequests = 'httpRequests'; // nombre de la carpeta que contiene las peticiones de cada tabla
const nameDirectoryDicom = 'temp';
// Select according to environment
const host = process.env.NODE_ENV === 'production' 
  ? process.env.HOST_PROD 
  : process.env.HOST_DEV || '0.0.0.0';
  
module.exports = { 
    port, 
    nameDirectoryRequests, 
    nameDirectoryDicom,
    host
};