const XLSX = require('xlsx');
import axios from 'axios';

const urlStudies = 'http://localhost:5000/estudios';
const nameGralReport = 'reporte_gral_todos_los_pacientes.xlsx';

export async function descargarReporteGeneral() {
  // Hacer el request de todos los estudios con axios
  const response = await axios.get(urlStudies); // await p/ no dejar la promesa de axios pendiente
  console.log('response: '+response);
  const data = response.data;

  // Falta agregar la cant de imagenes en cada estudio

  console.log('data: '+data);

  const worksheet = XLSX.utils.json_to_sheet(data); // Datos en hoja de calculo
  const workbook = XLSX.utils.book_new(); 
  XLSX.utils.book_append_sheet(workbook, worksheet);

  XLSX.writeFile(workbook, nameGralReport);
}
