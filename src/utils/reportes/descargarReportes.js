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
}
