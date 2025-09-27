// src/utils/reportes/descargarReportes.js
import XLSX from 'xlsx';
import api from '../../api';

const urlStudies = '/api/estudios'; // cámbialo a '/api/expedientes' si ese es tu endpoint real
const nameGralReport = 'reporte_gral_todos_los_pacientes';
const namePatientReport = 'reporte_paciente_';
const XLSX_ending = '.xlsx';

function convertirJSONaXLSX(data, fileName) {
  const rows = Array.isArray(data) ? data : [data];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'reporte');
  XLSX.writeFile(wb, fileName);
}

export async function descargarReporteGeneral() {
  try {
    const { data } = await api.get(urlStudies);
    convertirJSONaXLSX(data, `${nameGralReport}${XLSX_ending}`);
  } catch (error) {
    console.error('Error al descargar el reporte general:', error);
  }
}

export async function descargarReportePaciente(nss) {
  try {
    const { data } = await api.get(`${urlStudies}/${encodeURIComponent(nss)}`);
    convertirJSONaXLSX(data, `${namePatientReport}${nss}${XLSX_ending}`);
  } catch (error) {
    console.error(`Error al descargar el reporte del paciente ${nss}:`, error);
  }
}
