/**
 * ViewPatient.jsx
 *
 * FRONTEND – Página principal para visualizar el expediente de un paciente y sus estudios (DICOM).
 * - “Visualizar 3D (demo)” abre un overlay con VTK y usa máscaras locales (loadMaskFiles).
 * - Además, lee StudyDate/StudyTime desde un DICOM para mostrar la fecha real del estudio.
 */

import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaCloudUploadAlt } from "react-icons/fa";
import axios from "axios";

import cornerstone from "cornerstone-core";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import dicomParser from "dicom-parser";

import DescripcionEstudio from "./modals/DescripcionEstudio";
// import VTKVolumeViewer from "./VTKVolumeViewer";
// import { loadMaskFiles } from "../utils/loadMaskfiles";

import { descargarReportePaciente } from "../utils/reportes/descargarReportes";

// ---- Cornerstone config (WADO-URI desde backend) ----
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({ beforeSend: () => {} });

// Registrar metaDataProvider de forma segura (según versión del loader)
const wadoMetaProvider =
  cornerstoneWADOImageLoader?.wadouri?.metaDataProvider ??
  cornerstoneWADOImageLoader?.metaData?.metaDataProvider ??
  cornerstoneWADOImageLoader?.metaDataProvider;

if (cornerstone?.metaData?.addProvider && typeof wadoMetaProvider === "function") {
  cornerstone.metaData.addProvider(
    (type, imageId) => wadoMetaProvider(type, imageId),
    9999
  );
} else {
  console.warn("[DICOM] No se encontró un metaDataProvider válido en cornerstone-wado-image-loader.");
}

// Miniatura DICOM simple con Cornerstone
function DicomThumbnail({ imageId }) {
  const elementRef = useRef(null);

  useEffect(() => {
    const el = elementRef.current;
    if (!el || !imageId) return;

    let cancelled = false;

    const isEnabled = () => {
      try {
        cornerstone.getEnabledElement(el);
        return true;
      } catch {
        return false;
      }
    };

    if (!isEnabled()) {
      try {
        cornerstone.enable(el);
      } catch {}
    }

    cornerstone
      .loadAndCacheImage(imageId)
      .then((image) => {
        if (cancelled) return;
        try {
          if (isEnabled()) cornerstone.displayImage(el, image);
        } catch {}
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      try {
        if (isEnabled()) cornerstone.disable(el);
      } catch {}
    };
  }, [imageId]);

  return (
    <div
      ref={elementRef}
      style={{
        width: 160,
        height: 160,
        backgroundColor: "black",
        borderRadius: 6,
        margin: "0 auto",
      }}
    />
  );
}

// Convierte DICOM StudyDate/StudyTime -> 'YYYY-MM-DD HH:mm:ss'
function toSQLFromDicomDateTime(dateStr, timeStr) {
  // dateStr: 'YYYYMMDD'  | timeStr: 'HHMMSS.FFFFFF' (opcional)
  if (!dateStr || dateStr.length < 8) return null;
  const yyyy = dateStr.slice(0, 4);
  const mm = dateStr.slice(4, 6);
  const dd = dateStr.slice(6, 8);

  // HHMMSS(.xxxxx) opcional
  let hh = "00",
    mi = "00",
    ss = "00";
  if (timeStr && timeStr.length >= 2) {
    hh = timeStr.slice(0, 2) || "00";
    mi = timeStr.slice(2, 4) || "00";
    ss = timeStr.slice(4, 6) || "00";
  }
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

// Fecha JS -> string SQL
function toSQLDateString(fecha) {
  if (!fecha) return "";
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  if (isNaN(d)) return String(fecha);
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")} ` +
    `${String(d.getHours()).padStart(2, "0")}:` +
    `${String(d.getMinutes()).padStart(2, "0")}:` +
    `${String(d.getSeconds()).padStart(2, "0")}`
  );
}

export default function ViewPatient() {
  const { id: nss } = useParams();
  const navigate = useNavigate();

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Overlay 3D (VTK) – demo
  // const [isLungRenderVisible, setLungRenderVisible] = useState(false);
  // const [lungVolArr, setLungVolArr] = useState(null);
  // const [fibroVolArr, setFibroVolArr] = useState(null);
  // const [dims, setDims] = useState(null);

  // // Metadatos físicos para pasar al demo
  // const [spacing, setSpacing] = useState([1, 1, 1]);
  // const [origin, setOrigin] = useState([0, 0, 0]);

  //Descripcion del estudio
  const [showDescripcionModal, setShowDescripcionModal] = useState(false);
  const [descripcionActual, setDescripcionActual] = useState("");

  // Cargar expediente + preparar miniaturas por estudio (y leer fecha DICOM)
  const fetchRecord = async () => {
    try {
      setLoading(true);
      setError("");
      const { data: exp } = await axios.get(
        `http://localhost:5000/api/expedientes/${nss}`
      );

      const studiesWithThumbs = await Promise.all(
        (exp.studies || []).map(async (s) => {
          const safeFecha = toSQLDateString(s.fecha).replace(/[: ]/g, "_");
          const folder = `${exp.nss}_${safeFecha}`;
          let dicomUrl = null;

          try {
            const { data: files } = await axios.get(
              `http://localhost:5000/api/image/dicom-list/${folder}`
            );
            if (files?.length) {
              const mid = files[Math.floor(files.length / 2)];
              dicomUrl = `wadouri:http://localhost:5000/api/image/dicom/${folder}/${encodeURIComponent(
                mid
              )}`;
            }
          } catch {
            // sin DICOMs; dejamos dicomUrl = null
          }

          // Leer fecha DICOM real (si existe dicomUrl)
          let fechaDicomSQL = null;
          if (dicomUrl) {
            try {
              const image = await cornerstone.loadAndCacheImage(dicomUrl);
              // Preferir módulo generalStudyModule
              const gs =
                cornerstone.metaData.get("generalStudyModule", dicomUrl) || {};
              let studyDate = gs.studyDate; // 'YYYYMMDD'
              let studyTime = gs.studyTime; // 'HHMMSS(.ffffff)'

              // Fallback directo al dataset crudo
              if ((!studyDate || studyDate.length < 8) && image?.data?.string) {
                const dsString = image.data.string.bind(image.data);
                studyDate = dsString?.("x00080020") || studyDate; // StudyDate
                studyTime = dsString?.("x00080030") || studyTime; // StudyTime
              }

              fechaDicomSQL = toSQLFromDicomDateTime(studyDate, studyTime);
            } catch {
              // silencioso: si falla, usamos s.fecha original
            }
          }

          // Fecha a mostrar en UI (DICOM si la logramos leer; si no, la original)
          const fechaMostrar = fechaDicomSQL || s.fecha;

          return { ...s, folder, dicomUrl, fechaMostrar, fechaDicomSQL };
        })
      );

      setRecord({ ...exp, studies: studiesWithThumbs });
    } catch (e) {
      console.error(e);
      setError("No se pudo cargar el expediente o sus estudios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!nss) {
      alert("NSS inválido");
      navigate("/doctor", { replace: true });
      return;
    }
    fetchRecord();
  }, [nss, navigate]);

  // Spacing/origin desde dos cortes adyacentes
  // const probeSpacingFromAnyStudy = async () => {
  //   try {
  //     if (!record?.studies?.length)
  //       return { spacing: [1, 1, 1], origin: [0, 0, 0] };

  //     const s0 = record.studies.find((s) => s.folder) || record.studies[0];
  //     const folder =
  //       s0.folder ||
  //       `${record.nss}_${toSQLDateString(s0.fecha).replace(/[: ]/g, "_")}`;

  //     const { data: files } = await axios.get(
  //       `http://localhost:5000/api/image/dicom-list/${folder}`
  //     );
  //     if (!files?.length) return { spacing: [1, 1, 1], origin: [0, 0, 0] };

  //     const i0 = Math.max(0, Math.floor(files.length / 2) - 1);
  //     const i1 = Math.min(files.length - 1, i0 + 1);

  //     const id0 = `wadouri:http://localhost:5000/api/image/dicom/${folder}/${encodeURIComponent(
  //       files[i0]
  //     )}`;
  //     const id1 = `wadouri:http://localhost:5000/api/image/dicom/${folder}/${encodeURIComponent(
  //       files[i1]
  //     )}`;

  //     await cornerstone.loadAndCacheImage(id0);
  //     await cornerstone.loadAndCacheImage(id1);

  //     const p0 = cornerstone.metaData.get("imagePlaneModule", id0) || {};
  //     const p1 = cornerstone.metaData.get("imagePlaneModule", id1) || {};

  //     const sy = p0.rowPixelSpacing ?? p0.pixelSpacing?.[0] ?? 1;
  //     const sx = p0.columnPixelSpacing ?? p0.pixelSpacing?.[1] ?? 1;

  //     const rc = p0.rowCosines || p0.rowCosine || [1, 0, 0];
  //     const cc = p0.columnCosines || p0.columnCosine || [0, 1, 0];
  //     const n = [
  //       rc[1] * cc[2] - rc[2] * cc[1],
  //       rc[2] * cc[0] - rc[0] * cc[2],
  //       rc[0] * cc[1] - rc[1] * cc[0],
  //     ];

  //     const ipp0 = p0.imagePositionPatient || [0, 0, 0];
  //     const ipp1 = p1.imagePositionPatient || [0, 0, 0];
  //     const d = [ipp1[0] - ipp0[0], ipp1[1] - ipp0[1], ipp1[2] - ipp0[2]];
  //     const sz_from_ipp =
  //       Math.abs(d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) || 1;

  //     const origin = ipp0;
  //     const spacing = [sx, sy, sz_from_ipp];

  //     console.log(
  //       "[DEMO 3D] Spacing calculado con IPP/IOP:",
  //       spacing,
  //       "Origin:",
  //       origin,
  //       "SliceThickness:",
  //       p0.sliceThickness,
  //       "SpacingBetweenSlices:",
  //       p0.spacingBetweenSlices
  //     );

  //     return { spacing, origin };
  //   } catch (e) {
  //     console.warn(
  //       "[DEMO 3D] Fallback spacing/origin [1,1,1]/[0,0,0] ->",
  //       e?.message || e
  //     );
  //     return { spacing: [1, 1, 1], origin: [0, 0, 0] };
  //   }
  // };

  // Demo: abre el overlay y carga máscaras de ejemplo + spacing/origin
  // const handleShowLungRender = async () => {
  //   try {
  //     const [lungVol, fibroVol, dimensions] = await loadMaskFiles("nada");
  //     const { spacing: sp, origin: og } = await probeSpacingFromAnyStudy();

  //     console.log(
  //       "[DEMO 3D] Dims (máscaras):",
  //       dimensions,
  //       "Spacing:",
  //       sp,
  //       "Origin:",
  //       og
  //     );

  //     setLungVolArr(lungVol);
  //     setFibroVolArr(fibroVol);
  //     setDims(dimensions);
  //     setSpacing(sp);
  //     setOrigin(og);
  //     setLungRenderVisible(true);
  //   } catch (e) {
  //     console.error("Error loading demo masks", e);
  //     alert("No se pudieron cargar las máscaras de demo.");
  //   }
  // };

  // const handleBackOrigin = () => {
  //   setLungRenderVisible(false);
  // };

  // Subir ZIP con DICOMs
  const handleZipChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file?.name.endsWith(".zip"))
      return alert("Selecciona un archivo .zip válido");

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
    } catch (e) {
      console.error(e);
      alert("Error al subir ZIP");
    }
  };

  // Loading / error
  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        Cargando expediente…
      </div>
    );
  }
  if (error || !record) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "red" }}>
        {error || "Error desconocido"}
      </div>
    );
  }

  return (
    <div>
        {/* // Página de lista de estudios */}
        <div style={{ display: "flex", padding: "2rem", gap: "2rem" }}>
          {/* Panel izquierdo: info paciente */}
          <div style={{ flex: "1", maxWidth: "350px" }}>
            <section className="card">
              <h2>Información del Paciente J</h2>
              <div className="form-group">
                <label>NSS</label>
                <input value={record.nss} disabled />
              </div>
              <div className="form-group">
                <label>Fecha de Nacimiento</label>
                <input
                  type="date"
                  value={
                    new Date(record.fecha_nacimiento)
                      .toISOString()
                      .split("T")[0]
                  }
                  disabled
                />
              </div>
              <div className="form-group">
                <label>Sexo</label>
                <input
                  value={
                    record.sexo === 1
                      ? "Hombre"
                      : record.sexo === 2
                      ? "Mujer"
                      : "Otro"
                  }
                  disabled
                />
              </div>
              <div className="actions">
                <button className="btn" onClick={() => descargarReportePaciente(record.nss)}>
                  Descargar reporte (.xlsx) 📋
                </button>
                <button className="btn" onClick={() => navigate(-1)}>
                  Volver
                </button>
              </div>
            </section>
          </div>

          {/* Panel derecho: estudios y acciones */}
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
                    style={{
                      background: "#fff",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      padding: "1rem",
                      textAlign: "center",
                    }}
                  >
                    {s.dicomUrl ? (
                      <DicomThumbnail imageId={s.dicomUrl} />
                    ) : (
                      <div
                        style={{
                          width: 160,
                          height: 160,
                          backgroundColor: "#eee",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          color: "#666",
                          fontWeight: "bold",
                          borderRadius: 6,
                          margin: "0 auto",
                        }}
                      >
                        Sin imagen
                      </div>
                    )}

                    <p>
                      <strong>Fecha (DICOM):</strong>{" "}
                      {new Date(s.fechaMostrar).toLocaleString()}
                    </p>

                    {/* Ver/editar descripción */}
                    <button
                      className="btn"
                      title={s.descripcion || "-"}
                      onClick={() => {
                        setDescripcionActual(s.descripcion || "");
                        setShowDescripcionModal({
                          open: true,
                          nss_expediente: record.nss,
                          // fecha: s.fecha (ISO puede fallar en MySQL)
                          fecha: toSQLDateString(s.fecha), // siempre SQL
                        });
                      }}
                      style={{ marginTop: 8 }}
                    >
                      Descripción ✏️
                    </button>

                    {/* Ir al visor 2D del estudio */}
                    <button
                      className="btn"
                      onClick={() =>
                        navigate(
                          `/estudio/${record.nss}/${encodeURIComponent(
                            toSQLDateString(s.fecha)
                          )}` +
                            (s.fechaDicomSQL
                              ? `?fechaDicom=${encodeURIComponent(
                                  s.fechaDicomSQL
                                )}`
                              : "")
                        )
                      }
                      style={{ marginTop: 8 }}
                    >
                      Etiquetado 🖥️
                    </button>

                    {/* Demo: overlay 3D con máscaras locales */}
                    <button
                      className="btn"
                      onClick={() => navigate( `/render-pulmon?nss=${encodeURIComponent(record.nss)}&folder=${encodeURIComponent(s.folder)}`)}
                      style={{ marginTop: 8 }}
                    >
                      Visualizar 3D 🏗️
                    </button>
                  </div>
                ))}

                {/* Tarjeta para subir ZIP */}
                <div
                  className="grid-item upload-card"
                  onClick={() =>
                    document.getElementById("zip-upload").click()
                  }
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
                  <p style={{ fontWeight: "bold", marginTop: "0.5rem" }}>
                    Agregar nuevo estudio
                  </p>
                  <p style={{ fontSize: "0.85rem", color: "#666" }}>
                    .zip con DICOMs
                  </p>
                  <input
                    id="zip-upload"
                    type="file"
                    accept=".zip"
                    style={{ display: "none" }}
                    onChange={handleZipChange}
                  />
                </div>
              </div>


            </section>
          </div>

          <div>
            {showDescripcionModal && (
              <DescripcionEstudio
                descripcion={descripcionActual}
                nss_expediente={showDescripcionModal.nss_expediente}
                fecha={showDescripcionModal.fecha}
                onClose={() => setShowDescripcionModal(false)}
                onSave={async () => {
                  await fetchRecord(); // refresca la lista de estudios
                }}
              />
            )}
          </div>
        </div>
    </div>
  );
}
