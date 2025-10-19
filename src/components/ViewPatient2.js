// import React, { useState, useEffect } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { FaCloudUploadAlt } from 'react-icons/fa'; // Importando el ícono de carga
// import defaultImage from '../assets/images/image.jpg';

// function ViewPatient() {
//   const { id } = useParams();
//   const navigate = useNavigate();
//   const [record, setRecord] = useState(null);

//   useEffect(() => {
//     const storedPatients = JSON.parse(localStorage.getItem('patients')) || [];
//     const storedRecords = JSON.parse(localStorage.getItem('records')) || [];

//     const recordId = parseInt(id, 10);

//     console.log('📌 Pacientes en localStorage:', storedPatients);
//     console.log('📌 Registros en localStorage:', storedRecords);
//     console.log('📌 Intentando acceder a índice:', recordId);

//     // 🔹 Validar si el ID es válido
//     if (isNaN(recordId) || recordId < 0) {
//       alert('Error: ID inválido.');
//       navigate('/doctor');
//       return;
//     }

//     let data = storedPatients; // 🔹 Usamos siempre "patients" para DoctorView

//     // 🔹 Verificar que el índice esté dentro del rango correcto
//     if (!Array.isArray(data) || recordId >= data.length) {
//       alert(`Registro no encontrado en índice: ${recordId}`);
//       navigate('/doctor');
//       return;
//     }

//     setRecord(data[recordId]);
//   }, [id, navigate]);

//   // Guardar los cambios en localStorage
//   const handleSave = () => {
//     const storedPatients = JSON.parse(localStorage.getItem('patients')) || [];

//     const recordId = parseInt(id, 10);
//     let data = storedPatients;

//     if (!Array.isArray(data) || recordId >= data.length) {
//       alert('Error al guardar. Registro no encontrado.');
//       return;
//     }

//     data[recordId] = record;
//     localStorage.setItem('patients', JSON.stringify(data));
//     alert('Cambios guardados correctamente');
//   };

//   // Función que maneja el cambio de archivo (actualmente no hace nada)
//   const handleFileChange = (event) => {
//     const file = event.target.files[0];
//     if (file) {
//       console.log('Archivo seleccionado:', file);
//       // Aquí podrías hacer algo con el archivo, como previsualizarlo o almacenarlo
//     }
//   };

//   if (!record) return <p>Cargando...</p>;

//   return (
//     <div className="view-container">
//       {/* 🔹 Panel izquierdo: Información del paciente */}
//       <div className="left-panel">
//         <h2>Editar Información del Paciente</h2>
//         <form>
//           <label>
//             Nombre Completo:
//             <input
//               type="text"
//               value={record.name}
//               onChange={(e) => setRecord({ ...record, name: e.target.value })}
//             />
//           </label>
//           <label>
//             NSS:
//             <input
//               type="text"
//               value={record.nss}
//               onChange={(e) => setRecord({ ...record, nss: e.target.value })}
//             />
//           </label>
//           <label>
//             Fecha de Nacimiento:
//             <input
//               type="date"
//               value={record.birthDate}
//               onChange={(e) => setRecord({ ...record, birthDate: e.target.value })}
//             />
//           </label>
//           <label>
//             Sexo:
//             <select
//               value={record.sex}
//               onChange={(e) => setRecord({ ...record, sex: e.target.value })}
//             >
//               <option value="masculino">Masculino</option>
//               <option value="femenino">Femenino</option>
//             </select>
//           </label>

//           <button type="button" onClick={handleSave}>
//             Guardar Cambios
//           </button>
//           <button type="button" onClick={() => navigate(-1)}>
//             Volver
//           </button>
//         </form>
//       </div>

//       {/* 🔹 Panel derecho: Cuadros en Grid con imagen fija */}
//       <div className="right-panel">
//         <h2>Estudios</h2>

//         <div className="grid-container">
//           {Array.from({ length: 4 }).map((_, index) => (
//             <div key={index} className="grid-item">
//               <div className="image-container">
//                 {/* Si es la cuarta imagen, mostramos el ícono y el texto */}
//                 {index === 3 ? (
//                   <div className="upload-icon">
//                     <label htmlFor="file-upload" style={{ cursor: 'pointer' }}>
//                       <FaCloudUploadAlt size={50} color="#007bff" />
//                       <p>Arrastra o selecciona archivos</p>
//                     </label>
//                     <input
//                       id="file-upload"
//                       type="file"
//                       style={{ display: 'none' }} // Ocultamos el input
//                       onChange={handleFileChange} // Llamamos a la función cuando se selecciona un archivo
//                     />
//                   </div>
//                 ) : (
//                   <img
//                     src={defaultImage}
//                     alt={`Imagen ${index + 1}`}
//                     className="grid-image"
//                     onClick={() => navigate(`/estudio/${id}/${index + 1}`)}
//                     style={{ cursor: 'pointer' }}
//                   />
//                 )}
//               </div>

//               {/* Mostrar texto estático debajo de la imagen solo si no es la cuarta */}
//               {index !== 3 && (
//                 <div className="study-text">
//                   <label><strong>Fecha de Estudio:</strong> {record[`studyDate${index + 1}`] || 'No disponible'}</label>
//                   <label><strong>Tratamiento:</strong> {record[`treatment${index + 1}`] || 'No disponible'}</label>
//                 </div>
//               )}
//             </div>
//           ))}
//         </div>

//         <button className="btn-next" onClick={() => navigate(`/analisis-detallado/${id}`)}>
//           Comparar volúmenes
//         </button>
//       </div>
//     </div>
//   );
// }

// export default ViewPatient;
