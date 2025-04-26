const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
// const imageRoutes = require('./src/routes/imageRoutes');//Esto busca desde la raíz del archivo actual (backend/).
// const imageRoutes = require('../src/routes/imageRoutes.js');
const imageRoutes = require('./routes/imageRoutes');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/image', imageRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(` Servidor corriendo en puerto ${PORT}`);
});
