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

// Importación de React y hooks
import React, { useState, useEffect, useRef } from "react";

// Hook para obtener parámetros de la URL (NSS del paciente) y para navegación
import { useParams, useNavigate } from "react-router-dom";

// Ícono para botón de subir ZIP
import { FaCloudUploadAlt } from "react-icons/fa";

// Cliente HTTP para llamadas al backend
import axios from "axios";

// Cornerstone y dependencias necesarias para cargar y mostrar imágenes DICOM
import cornerstone from "cornerstone-core";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import dicomParser from "dicom-parser";

// Configuración de Cornerstone para poder interpretar imágenes DICOM vía WADO
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

// Configuración adicional para posibles headers HTTP
cornerstoneWADOImageLoader.configure({
  beforeSend: function (xhr) {
    // Aquí se pueden agregar headers personalizados si el backend lo requiere
  }
});

// Componente que renderiza una imagen DICOM en una celda usando Cornerstone
function DicomThumbnail({ imageId }) {
  const elementRef = useRef(null);

  useEffect(() => {
    if (elementRef.current && imageId) {
      // Habilita el contenedor para Cornerstone
      cornerstone.enable(elementRef.current);

      // Carga y muestra la imagen DICOM
      cornerstone
        .loadImage(imageId)
        .then((image) => {
          cornerstone.displayImage(elementRef.current, image);
        })
        .catch((err) => {
          console.error("Error cargando imagen DICOM:", err);
        });
    }

    // Limpieza cuando el componente se desmonta
    return () => {
      if (elementRef.current) {
        cornerstone.disable(elementRef.current);
      }
    };
  }, [imageId]);

  return (
    <div
      ref={elementRef}
      style={{
        width: "150px",
        height: "150px",
        backgroundColor: "black",
        margin: "auto",
        borderRadius: "5px",
      }}
    />
  );
}

// Utilidad para convertir una fecha JS a formato SQL (YYYY-MM-DD HH:mm:ss)
function toSQLDateString(fecha) {
  if (!fecha) return "";
  let d = typeof fecha === "string" ? new Date(fecha) : fecha;
  if (isNaN(d)) return fecha;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export default function ViewPatient() {
  // Obtiene el NSS desde la URL
  const { id: nss } = useParams();

  // Hook para redirigir a otras páginas
  const navigate = useNavigate();

  // Estado para almacenar el expediente completo del paciente
  const [record, setRecord] = useState(null);

  // Estado de carga y error
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Función principal para cargar expediente y estudios desde backend
  const fetchRecord = async () => {
    try {
      setLoading(true);

      // 1. Obtener expediente del paciente
      const { data: exp } = await axios.get(`http://localhost:5000/api/expedientes/${nss}`);

      // 2. Para cada estudio del paciente, obtener la lista de archivos DICOM
      const studiesWithDicom = await Promise.all(
        (exp.studies || []).map(async (s) => {
          const safeFecha = toSQLDateString(s.fecha).replace(/[: ]/g, "_");
          const folder = `${exp.nss}_${safeFecha}`; // carpeta física del estudio

          try {
            // Solicita la lista de archivos DICOM para ese estudio
            const res = await axios.get(`http://localhost:5000/api/image/dicom-list/${folder}`);
            const files = res.data;

            if (!files || files.length === 0) throw new Error("No DICOM files");

            // Toma el archivo DICOM "de en medio" para mostrar como preview
            const midIdx = Math.floor(files.length / 2);
            const dicomFile = files[midIdx];

            // Genera URL compatible con Cornerstone
            const dicomUrl = `wadouri:http://localhost:5000/api/image/dicom/${folder}/${dicomFile}`;

            return {
              ...s,
              dicomUrl, // se usará para el mini visor
            };
          } catch (err) {
            // En caso de error, se omite el visor
            return { ...s, dicomUrl: null };
          }
        })
      );

      // Almacena expediente con estudios enriquecidos con dicomUrl
      setRecord({ ...exp, studies: studiesWithDicom });
      setError("");
    } catch (err) {
      setError("No se pudo cargar el expediente o sus estudios");
    } finally {
      setLoading(false);
    }
  };

  // Ejecuta fetchRecord al cargar el componente
  useEffect(() => {
    if (!nss) {
      alert("NSS inválido");
      return navigate("/doctor", { replace: true });
    }
    fetchRecord();
  }, [nss, navigate]);

  // Maneja la subida de un archivo ZIP con estudios DICOM
  const handleZipChange = async (e) => {
    const file = e.target.files[0];
    if (!file?.name.endsWith(".zip")) return alert("Selecciona un archivo .zip válido");

    const now = new Date();
    const formatted = toSQLDateString(now);

    const fd = new FormData();
    fd.append("zipFile", file); // archivo ZIP
    fd.append("nss", nss);      // paciente
    fd.append("fecha", formatted); // timestamp para el nuevo estudio

    try {
      // Llama al endpoint de subida ZIP definido en backend/routes/imageRoutes.js
      await axios.post("http://localhost:5000/api/image/upload-zip", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      alert("ZIP subido correctamente");

      // Recarga expediente y estudios
      await fetchRecord();
    } catch (err) {
      alert("Error al subir ZIP");
    }
  };

  // Renderiza mensaje de carga o error
  if (loading) {
    return <div style={{ padding: "2rem", textAlign: "center" }}>Cargando expediente…</div>;
  }
  if (error || !record) {
    return <div style={{ padding: "2rem", textAlign: "center", color: "red" }}>{error || "Error desconocido"}</div>;
  }

  // Render principal de la vista del paciente
  return (
    <div className="view-container">
      {/* Información del Paciente */}
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

      {/* Estudios con mini visores DICOM */}
      <section className="card">
        <h2>Estudios ({record.studies.length})</h2>
        <div className="grid-container">
          {record.studies.map((s, i) => (
            <div
              key={i}
              className="grid-item"
              onClick={() =>
                navigate(`/estudio/${record.nss}/${encodeURIComponent(toSQLDateString(s.fecha))}`)
              }
              style={{ cursor: "pointer" }}
            >
              {/* Visor DICOM si hay imagen disponible */}
              {s.dicomUrl ? (
                <DicomThumbnail imageId={s.dicomUrl} />
              ) : (
                // Si no hay imagen, muestra placeholder
                <div
                  style={{
                    width: "150px",
                    height: "150px",
                    backgroundColor: "#eee",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    color: "#666",
                    fontWeight: "bold",
                    borderRadius: "5px",
                    margin: "auto",
                  }}
                >
                  Sin imagen
                </div>
              )}
              <p><strong>Fecha:</strong> {new Date(s.fecha).toLocaleString()}</p>
              <p><strong>Tratamiento:</strong> {s.tratamiento || s.descripcion || '-'}</p>
            </div>
          ))}

          {/* Botón para subir nuevo ZIP */}
          <div className="grid-item">
            <label htmlFor="zip-upload" className="btn-icon">
              <FaCloudUploadAlt size={40} />
              <p>Subir ZIP</p>
            </label>
            <input
              id="zip-upload"
              type="file"
              accept=".zip"
              style={{ display: "none" }}
              onChange={handleZipChange}
            />
          </div>
        </div>

        {/* Botón para análisis detallado */}
        <div className="actions">
          <button className="btn" onClick={() => navigate(`/analisis-detallado/${record.nss}`)}>
            Comparar volúmenes
          </button>
        </div>
      </section>
    </div>
  );
}
