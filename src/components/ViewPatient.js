/**
 * ViewPatient.jsx
 * 
 * FRONTEND – Página principal para visualizar el expediente de un paciente y sus estudios médicos (imágenes DICOM).

 * - Muestra la información básica del paciente usando su NSS (Número de Seguridad Social) desde la URL.
 * - Lista todos los estudios del paciente consultando la API backend.
 * - Para cada estudio, busca y muestra una miniatura de una imagen DICOM (utilizando Cornerstone para renderizar DICOM en frontend).
 * - Permite subir un nuevo estudio en formato ZIP (con imágenes DICOM), que se envía al backend.
 * - Enlaza a la vista detallada de un estudio (visor avanzado) y a un análisis comparativo de volúmenes.
 
 * - Hace peticiones HTTP al backend Express:
 *    · Para obtener la info del paciente y sus estudios.
 *    · Para pedir la lista de archivos DICOM de cada estudio.
 *    · Para subir nuevos archivos ZIP de estudios.
 *    · Integra directamente con los endpoints definidos en backend/routes/imageRoutes.js.
 * - Usa Cornerstone + WADOImageLoader para mostrar imágenes DICOM, compatible con el backend que expone los archivos.

 * - El backend debe soportar la estructura de carpetas por paciente y estudio para que el visor funcione correctamente.
 * - Si no se encuentra un archivo DICOM válido, se muestra un placeholder ("Sin imagen").
 * - El diseño asume que los estudios pueden tener tratamientos o descripciones asociadas.

 * - Se recomienda que las rutas del backend estén protegidas (token/credenciales) en ambientes productivos.
 * - El componente maneja errores de carga y muestra mensajes claros al usuario.
 */

// Importación de librerías principales y utilidades de Cornerstone
import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaCloudUploadAlt } from "react-icons/fa";
import axios from "axios";
import cornerstone from "cornerstone-core";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import dicomParser from "dicom-parser";

import VTKVolumeViewer from "./VTKVolumeViewer";
import { loadMaskFiles } from "../utils/loadMaskfiles";

// Configuración necesaria para que cornerstone pueda interpretar imágenes DICOM desde URLs, despues integra con bd?
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({ beforeSend: () => { } });
// Componente para renderizar una miniatura DICOM con Cornerstone
function DicomThumbnail({ imageId }) {
  const elementRef = useRef(null);

  useEffect(() => {
    if (elementRef.current && imageId) {
      cornerstone.enable(elementRef.current);
      cornerstone
        .loadImage(imageId)
        .then((image) => cornerstone.displayImage(elementRef.current, image))
        .catch((err) => console.error("Error cargando imagen DICOM:", err));
    }
    return () => {
      if (elementRef.current) cornerstone.disable(elementRef.current);
    };
  }, [imageId]);

  return (
    <div
      ref={elementRef}
      style={{
        width: "160px",
        height: "160px",
        backgroundColor: "black",
        borderRadius: "6px",
        margin: "0 auto",
      }}
    />
  );
}
// transformar fecha JS a formato SQL-compatible
function toSQLDateString(fecha) {
  if (!fecha) return "";
  let d = typeof fecha === "string" ? new Date(fecha) : fecha;
  if (isNaN(d)) return fecha;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(
    d.getSeconds()
  ).padStart(2, "0")}`;
}

export default function ViewPatient() {
  const { id: nss } = useParams(); // Obtenemos el NSS desde la URL
  const navigate = useNavigate();
  const [record, setRecord] = useState(null); // Almacena la información completa del paciente
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [isLungRenderVisible, setLungRenderVisible] = useState(false);
  // ✅ Agregar estado para los datos del visor VTK
  const [lungVolArr, setLungVolArr] = useState(null);
  const [fibroVolArr, setFibroVolArr] = useState(null);
  const [dims, setDims] = useState(null);

  const handleShowLungRender = async () => {
    try {
      console.log("se intenta leer los archivos");
      const [lungVol, fibroVol, dimensions] = await loadMaskFiles("nada");
      console.log("se leyeron los archivos");
      
      // ✅ Actualizar el estado con los datos cargados
      setLungVolArr(lungVol);
      setFibroVolArr(fibroVol);
      setDims(dimensions);
      setLungRenderVisible(true);
    }
    catch (error) {
      console.log('Error loading mask files');
    }
  }
  const handleBackOrigin = () => {
    setLungRenderVisible(false);
  }

  // Función que consulta el backend y prepara los estudios con sus miniaturas
  const fetchRecord = async () => {
    try {
      setLoading(true);
      const { data: exp } = await axios.get(`http://localhost:5000/api/expedientes/${nss}`);
      // Para cada estudio, buscamos un archivo DICOM representativo

      const studiesWithDicom = await Promise.all(
        (exp.studies || []).map(async (s) => {
          const safeFecha = toSQLDateString(s.fecha).replace(/[: ]/g, "_");
          const folder = `${exp.nss}_${safeFecha}`;
          try {
            const res = await axios.get(`http://localhost:5000/api/image/dicom-list/${folder}`);
            const files = res.data;
            if (!files || files.length === 0) throw new Error("No DICOM files");
            const midIdx = Math.floor(files.length / 2); // Elegimos el archivo del medio para mostrar como miniatura
            const dicomFile = files[midIdx];
            const dicomUrl = `wadouri:http://localhost:5000/api/image/dicom/${folder}/${dicomFile}`;
            return { ...s, dicomUrl };
          } catch {
            return { ...s, dicomUrl: null }; // En caso de error, no se mostrará imagen
          }
        })
      );

      setRecord({ ...exp, studies: studiesWithDicom });
      setError("");
    } catch {
      setError("No se pudo cargar el expediente o sus estudios");
    } finally {
      setLoading(false);
    }
  };
  // Ejecuta la carga de datos cuando se monta el componente

  useEffect(() => {
    if (!nss) {
      alert("NSS inválido");
      return navigate("/doctor", { replace: true });
    }
    fetchRecord();
  }, [nss, navigate]);
  // Manejador para subir un archivo ZIP con imágenes DICOM

  const handleZipChange = async (e) => {
    const file = e.target.files[0];
    if (!file?.name.endsWith(".zip")) return alert("Selecciona un archivo .zip válido");

    const now = new Date();
    const formatted = toSQLDateString(now);

    const fd = new FormData();
    fd.append("zipFile", file);
    fd.append("nss", nss);
    fd.append("fecha", formatted);

    try {
      await axios.post("http://localhost:5000/api/image/upload-zip", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      alert("ZIP subido correctamente");
      await fetchRecord();
    } catch {
      alert("Error al subir ZIP");
    }
  };
  // Mensaje de carga
  if (loading)
    return <div style={{ padding: "2rem", textAlign: "center" }}>Cargando expediente…</div>;
  // Error o falta de datos
  if (error || !record)
    return <div style={{ padding: "2rem", textAlign: "center", color: "red" }}>{error || "Error desconocido"}</div>;

  return (
    <div>
      {isLungRenderVisible ? (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <VTKVolumeViewer volumeArray={lungVolArr} fibrosisVolArr={fibroVolArr} dims={dims} />
    <button
      onClick={handleBackOrigin}
      style={{
        position: 'absolute',
        top: 20,
        right: 20,
        zIndex: 10,
        background: '#2563eb',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        padding: '0.5rem 1rem',
        fontWeight: 'bold',
        cursor: 'pointer'
      }}
    >
      Volver
    </button>
  </div>
      ) :
        (/* PANEL IZQUIERDO */
          <div style={{ display: "flex", padding: "2rem", gap: "2rem" }}>
            <div style={{ flex: "1", maxWidth: "350px" }}>
              <section className="card">
                <h2>Información del Paciente</h2>
                <div className="form-group">
                  <label>NSS</label>
                  <input value={record.nss} disabled />
                </div>
                <div className="form-group">
                  <label>Fecha de Nacimiento</label>
                  <input
                    type="date"
                    value={new Date(record.fecha_nacimiento).toISOString().split("T")[0]}
                    disabled
                  />
                </div>
                <div className="form-group">
                  <label>Sexo</label>
                  <input
                    value={record.sexo === 1 ? "Hombre" : record.sexo === 2 ? "Mujer" : "Otro"}
                    disabled
                  />
                </div>
                <div className="actions">
                  <button className="btn" onClick={() => navigate(-1)}>
                    Volver
                  </button>
                </div>
              </section>
            </div>

            {/* PANEL DERECHO */}
            <div style={{ flex: "3" }}>
              <section className="card">
                <h2>Estudios ({record.studies.length})</h2>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: "1rem",
                    marginTop: "1rem",
                  }}
                >
                  {record.studies.map((s, i) => (
                    <div
                      key={i}
                      className="grid-item"
                      onClick={() =>
                        navigate(`/estudio/${record.nss}/${encodeURIComponent(toSQLDateString(s.fecha))}`)
                      }
                      style={{
                        cursor: "pointer",
                        background: "#fff",
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                        padding: "1rem",
                        textAlign: "center",
                        transition: "box-shadow 0.2s",
                      }}
                    >
                      {s.dicomUrl ? (
                        <DicomThumbnail imageId={s.dicomUrl} />
                      ) : (
                        <div
                          style={{
                            width: "160px",
                            height: "160px",
                            backgroundColor: "#eee",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            color: "#666",
                            fontWeight: "bold",
                            borderRadius: "6px",
                            margin: "0 auto",
                          }}
                        >
                          Sin imagen
                        </div>
                      )}
                      <p><strong>Fecha:</strong> {new Date(s.fecha).toLocaleString()}</p>
                      <p><strong>Descripción:</strong> {s.descripcion || '-'}</p>
                    </div>
                  ))}

                  {/* BOTÓN DE SUBIDA COMO TARJETA */}
                  <div
                    className="grid-item upload-card"
                    onClick={() => document.getElementById("zip-upload").click()}
                    style={{
                      background: "#fff",
                      border: "1px dashed #007bff",
                      borderRadius: "8px",
                      padding: "1rem",
                      textAlign: "center",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <FaCloudUploadAlt size={50} color="#007bff" />
                    <p style={{ fontWeight: "bold", marginTop: "0.5rem" }}>Agregar nuevo estudio</p>
                    <p style={{ fontSize: "0.85rem", color: "#666" }}>.zip con DICOMs</p>
                    <input
                      id="zip-upload"
                      type="file"
                      accept=".zip"
                      style={{ display: "none" }}
                      onChange={handleZipChange}
                    />
                  </div>
                </div>

          <div className="actions" style={{ marginTop: "2rem" }}>
            <button className="btn" onClick={() => navigate(`/analisis-detallado/${record.nss}`)}>
              Comparar volúmenes
            </button>
<button
  className="btn"
  onClick={() => navigate(`/render-pulmon?nss=${encodeURIComponent(record.nss)}`)}
>
  Comparar volúmenes VTK
</button>

          </div>
        </section>
      </div>
    </div>
  );
}
