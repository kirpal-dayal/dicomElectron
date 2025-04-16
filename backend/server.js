const express = require('express');
const cors = require('cors');
const fs = require('fs'); // comunicacion con el filesystem
const path = require('path');

//  SUBIR DICOMS DE ESTUDIOS
const fileUpload = require('express-fileupload'); // subir archivos al server 

const { port, nameDirectoryRequests, nameDirectoryDicom } = require('./configConst');

const app = express();

app.use(cors());
app.use(express.json());
// Middleware para manejar la carga de archivos
app.use(fileUpload());
app.use(express.static(nameDirectoryDicom)); // Para servir archivos subidos

// Cargar automáticamente todos los archivos de rutas en la carpeta httpRequests
const routesPath = path.join(__dirname, nameDirectoryRequests);
fs.readdirSync(routesPath).forEach((file) => {
  if (file.endsWith('.js')) {
    const route = require(path.join(routesPath, file));
    if (typeof route === 'function') {
      route(app); // Registrar las rutas en la app
    }
  }
});

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});