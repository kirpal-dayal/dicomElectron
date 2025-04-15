const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 5000;

const nameDirectoryRequests = 'httpRequests'; // nombre de la carpeta que contiene las peticiones de cada tabla

app.use(cors());
app.use(express.json());

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