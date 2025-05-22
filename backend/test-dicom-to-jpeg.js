// test-dicom-to-jpeg.js ahora se va a probar Leer el array de pixeles (usualmente Uint16Array si son 16 bits). Re-escalar el rango de valores de 0–65535 a 0–255. y la escala de grises
// node test-dicom-to-jpeg.js para ejecutar el script
const fs = require('fs');
const dp = require('dicom-parser');
const jpeg = require('jpeg-js');

const dcmPath = "./IM0031L0";
const outPath = "./output.jpg";

function getNumber(tag, dataSet) {
  const str = dataSet.string(tag);
  if (!str) return null;
  if (str.includes('\\')) return parseFloat(str.split('\\')[0]);
  return parseFloat(str);
}

function applyWindow(pixels, wc, ww) {
  const out = Buffer.alloc(pixels.length);
  const min = wc - ww / 2;
  const max = wc + ww / 2;
  for (let i = 0; i < pixels.length; i++) {
    let val = pixels[i];
    if (val <= min) out[i] = 0;
    else if (val >= max) out[i] = 255;
    else out[i] = ((val - min) / ww) * 255;
  }
  return out;
}

function convertDicomToJpeg(dcmPath, outPath) {
  const buffer = fs.readFileSync(dcmPath);
  const dataSet = dp.parseDicom(buffer);

  const rows = dataSet.uint16('x00280010');
  const cols = dataSet.uint16('x00280011');
  const bitsAllocated = dataSet.uint16('x00280100');
  const samplesPerPixel = dataSet.uint16('x00280002');
  const photometric = dataSet.string('x00280004');
  const windowCenter = getNumber('x00281050', dataSet) || 40;
  const windowWidth = getNumber('x00281051', dataSet) || 400;
  const intercept = getNumber('x00281052', dataSet) || 0;
  const slope = getNumber('x00281053', dataSet) || 1;
  const pixelRepresentation = dataSet.uint16('x00280103') || 0; // 0 = unsigned, 1 = signed

  const pixelDataEl = dataSet.elements.x7fe00010;
  const expectedLength = rows * cols;

  let pixelData;
  if (pixelRepresentation === 0) {
    pixelData = new Uint16Array(
      dataSet.byteArray.buffer,
      pixelDataEl.dataOffset,
      pixelDataEl.length / 2
    );
  } else {
    pixelData = new Int16Array(
      dataSet.byteArray.buffer,
      pixelDataEl.dataOffset,
      pixelDataEl.length / 2
    );
  }

  // Corta si hay padding extra
  if (pixelData.length > expectedLength) {
    pixelData = pixelData.slice(0, expectedLength);
  }

  console.log({
    bitsAllocated, samplesPerPixel, photometric,
    windowCenter, windowWidth,
    intercept, slope,
    pixelRepresentation,
    rows, cols,
    pixelDataLength: pixelData.length, expectedLength
  });

  // Aplica RescaleSlope e Intercept
  let rescaled = new Float32Array(pixelData.length);
  for (let i = 0; i < pixelData.length; i++) {
    rescaled[i] = pixelData[i] * slope + intercept;
  }

  // Aplica window/level al arreglo rescalado
  const pixels8 = applyWindow(rescaled, windowCenter, windowWidth);

  // Monta frame RGB
  const frame = Buffer.alloc(rows * cols * 3, 0);
  for (let i = 0; i < pixels8.length; i++) {
    frame[3 * i] = frame[3 * i + 1] = frame[3 * i + 2] = pixels8[i];
  }

  const jpegImageData = jpeg.encode(
    { data: frame, width: cols, height: rows },
    90
  );

  fs.writeFileSync(outPath, jpegImageData.data);
  console.log(`¡Listo! Imagen JPG generada en: ${outPath}`);
}

convertDicomToJpeg(dcmPath, outPath);

