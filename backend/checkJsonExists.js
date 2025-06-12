const fs = require('fs');
const path = require('path');

const testPath = path.join(__dirname, 'temp', '22223333_2025-05-29_20_16_59', 'segmentaciones_por_dicom', 'mask_000.json');
console.log("Buscando:", testPath);
console.log("¿Existe el archivo?", fs.existsSync(testPath));