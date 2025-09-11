<<<<<<< HEAD
const XLSX = require('xlsx');

export async function descargarReporteGeneral() {
  // Hacer el request de todos los estudios
  const response = fetch('http://localhost:5000/estudios');
  const data = response.json();

  const worksheet = XLSX.utils.json_to_sheet(data); // Datos en hoja de calculo
  const workbook = XLSX.utils.book_new(); 
  XLSX.utils.book_append_sheet(workbook, worksheet, 'reporte_gral_todos_los_pacientes');

  XLSX.writeFile(workbook, 'reporte_gral_todos_los_pacientes.xlsx');

  /*

  // Generar el archivo .xlsx
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });

  // Descargar el archivo
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'reporte_general.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);*/
=======
import XLSX from 'xlsx';
import axios from 'axios';

const urlStudies = 'http://localhost:5000/estudios';
const nameGralReport = 'reporte_gral_todos_los_pacientes';
const namePatientReport = 'reporte_paciente_';
const XLSX_ending = '.xlsx';

function convertirJSONaXLSX(data, fileName) {
  console.log('Convirtiendo datos a XLSX... ', data);
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet);
  XLSX.writeFile(workbook, fileName);
}

export async function descargarReporteGeneral() {
  try {
    const response = await axios.get(urlStudies); // await p/evitar dejar pendiente la promesa de axios
    const data = response.data;
    convertirJSONaXLSX(data, `${nameGralReport}${XLSX_ending}`);
    console.log('Reporte general descargado como', nameGralReport);
  } catch (error) {
    console.error('Error al descargar el reporte general:', error);
  }
}

export async function descargarReportePaciente(nss) {
  try {
    const response = await axios.get(`${urlStudies}/${nss}`);
    const data = response.data;
    convertirJSONaXLSX(data, `${namePatientReport}${nss}${XLSX_ending}`);
    console.log('Reporte del paciente descargado como', `${namePatientReport}${nss}${XLSX_ending}`);
  } catch (error) {
    console.error(`Error al descargar el reporte del paciente ${nss}:`, error);
  }
>>>>>>> origin/reportes
}
