// check-dicom.js, este archivo se encarga de verificar si el archivo DICOM es válido y si puede ser convertido a JPEG o que tipo de imagen es
// Ejecuta: node check-dicom.js "C:\Users\laikerunu\Desktop\Estudios de tomografía\58\S20\IM0031L0"

const fs = require('fs');
const path = require('path');
const dp = require('dicom-parser');

function hex(tag) {
  return 'x' + tag.toString(16).padStart(8, '0');
}

if (process.argv.length < 3) {
  console.error('USO: node check-dicom.js ruta/al/archivo.dcm');
  process.exit(1);
}

const dicomPath = process.argv[2];

if (!fs.existsSync(dicomPath)) {
  console.error('No existe el archivo:', dicomPath);
  process.exit(1);
}

try {
  const buffer = fs.readFileSync(dicomPath);
  const dataSet = dp.parseDicom(buffer);

  // Imprime tags básicos
  function get(tag) {
    try {
      return dataSet.string(tag) || dataSet.uint16(tag) || dataSet.uint32(tag) || '';
    } catch {
      return '';
    }
  }

  const tagsToPrint = [
    ['Patient Name', 'x00100010'],
    ['Patient ID', 'x00100020'],
    ['Study Date', 'x00080020'],
    ['Modality', 'x00080060'],
    ['Rows', 'x00280010'],
    ['Columns', 'x00280011'],
    ['Samples per Pixel', 'x00280002'],
    ['Photometric Interpretation', 'x00280004'],
    ['Bits Allocated', 'x00280100'],
    ['Bits Stored', 'x00280101'],
    ['High Bit', 'x00280102'],
    ['Pixel Representation', 'x00280103'],
    ['Pixel Spacing', 'x00280030'],
    ['Planar Configuration', 'x00280006'],
    ['Transfer Syntax UID', 'x00020010']
  ];

  console.log('=== Información básica del DICOM ===');
  for (const [desc, tag] of tagsToPrint) {
    console.log(`${desc}:`, get(tag));
  }

  // Pixel Data
  const pixelData = dataSet.elements[hex(0x7fe00010)];
  if (!pixelData) {
    console.log('\nATENCIÓN: No se encontró el elemento Pixel Data (7FE0,0010)');
  } else {
    console.log('\n[Pixel Data] Offset:', pixelData.dataOffset, '| Length:', pixelData.length);

    // Revisa si es posible convertir a imagen simple
    const bitsAllocated = dataSet.uint16('x00280100');
    const samplesPerPixel = dataSet.uint16('x00280002');
    const photometric = get('x00280004');
    console.log('\n=== Diagnóstico de conversión a imagen ===');

    if (bitsAllocated === 8 && samplesPerPixel === 1 && photometric.match(/MONOCHROME/i)) {
      console.log('✔ Este DICOM es de 8 bits, escala de grises, y se puede convertir fácilmente a JPEG.');
    } else if (bitsAllocated === 8 && samplesPerPixel === 3) {
      console.log('✔ Este DICOM parece ser RGB de 8 bits (color). Requiere conversión de 3 canales.');
    } else {
      console.warn('DICOM NO estándar para conversión directa a JPEG. Revisa:');
      console.warn('- Bits Allocated:', bitsAllocated);
      console.warn('- Samples per Pixel:', samplesPerPixel);
      console.warn('- Photometric Interpretation:', photometric);
      console.warn('- Puede requerir re-escalar, interpretación especial o procesamiento adicional.');
    }
  }

  // Opcional: imprime todos los tags si lo deseas
  // console.log('\n=== TODOS LOS TAGS PRESENTES ===');
  // for (const key in dataSet.elements) {
  //   try {
  //     const val = get(key);
  //     if (val) console.log(key, ':', val);
  //   } catch {}
  // }

} catch (e) {
  console.error('Error procesando DICOM:', e.message);
  process.exit(2);
}
