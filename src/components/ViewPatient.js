/**
 * ViewPatient.jsx
 *
 * Página principal: lista estudios + overlay 3D full-screen sin redirección.
 */

import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaCloudUploadAlt } from "react-icons/fa";
import api, { wado } from "../api";
import cornerstone from "cornerstone-core";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import dicomParser from "dicom-parser";

import DescripcionEstudio from "./modals/DescripcionEstudio";
import EditFieldStudio from "./modals/EditFieldStudio";
import RenderPulmon from "./RenderPulmon";
import { descargarReportePaciente } from "../utils/reportes/descargarReportes";

// Endpoints de edición de campos por estudio
const diagnosticoEndpoint = "/api/estudios/diagnostico"; 

// ---- Cornerstone config (WADO-URI) ----
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({ beforeSend: () => {} });

// Registrar metaDataProvider (según versión del loader)
const wadoMetaProvider =
  cornerstoneWADOImageLoader?.wadouri?.metaDataProvider ??
  cornerstoneWADOImageLoader?.metaData?.metaDataProvider ??
  cornerstoneWADOImageLoader?.metaDataProvider;

if (cornerstone?.metaData?.addProvider && typeof wadoMetaProvider === "function") {
  cornerstone.metaData.addProvider((type, imageId) => wadoMetaProvider(type, imageId), 9999);
} else {
  console.warn("[DICOM] No hay metaDataProvider válido de WADO.");
}

// Miniatura DICOM
function DicomThumbnail({ imageId }) {
  const elementRef = useRef(null);

  useEffect(() => {
    const el = elementRef.current;
    if (!el || !imageId) return;
    let cancelled = false;

    const isEnabled = () => {
      try { cornerstone.getEnabledElement(el); return true; } catch { return false; }
    };
    if (!isEnabled()) { try { cornerstone.enable(el); } catch {} }

    cornerstone
      .loadAndCacheImage(imageId)
      .then((image) => {
        if (cancelled) return;
        try { if (isEnabled()) cornerstone.displayImage(el, image); } catch {}
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      try { if (isEnabled()) cornerstone.disable(el); } catch {}
    };
  }, [imageId]);

  return (
    <div
      ref={elementRef}
      style={{ width:160, height:160, background:"black", borderRadius:6, margin:"0 auto" }}
    />
  );
}

// Utilidades fecha
function toSQLFromDicomDateTime(dateStr, timeStr) {
  if (!dateStr || dateStr.length < 8) return null;
  const yyyy = dateStr.slice(0, 4);
  const mm = dateStr.slice(4, 6);
  const dd = dateStr.slice(6, 8);
  let hh = "00", mi = "00", ss = "00";
  if (timeStr && timeStr.length >= 2) {
    hh = timeStr.slice(0, 2) || "00";
    mi = timeStr.slice(2, 4) || "00";
    ss = timeStr.slice(4, 6) || "00";
  }
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function toSQLDateString(fecha) {
  if (!fecha) return "";
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  if (isNaN(d)) return String(fecha);
  return (
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ` +
    `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`
  );
}

export default function ViewPatient() {
  const { id: nss } = useParams();
  const navigate = useNavigate();

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [status, setStatus] = useState(null);

  const [showDescripcionModal, setShowDescripcionModal] = useState(false);
  const [descripcionActual, setDescripcionActual] = useState("");

  // estado para diagnóstico
  const [showDiagnosticoModal, setShowDiagnosticoModal] = useState(false);

  // Overlay 3D: si tiene folder => se muestra full-screen
  const [show3DForFolder, setShow3DForFolder] = useState(null);

  // Polling de estado del volcado/segmentación cuando el 3D está abierto
  useEffect(() => {
    if (!show3DForFolder) return;
    let canceled = false;
    let tries = 0;

    async function poll() {
      try {
        const { data } = await api.get(`/api/segment/status/${show3DForFolder}`);
        if (canceled) return;
        setStatus(data);
        if (data.ready) return; // listo → cortar polling
        tries++;
        setTimeout(poll, Math.min(3000, 1000 + tries * 200));
      } catch {
        if (!canceled) setTimeout(poll, 3000);
      }
    }

    setStatus(null);
    poll();
    return () => { canceled = true; };
  }, [show3DForFolder]);

  // Al terminar el volcado, refrescar estudios para ver cambios (máscaras/volumen visible en tarjetas)
  useEffect(() => {
    if (status?.ready) {
      fetchRecord();
    }
  }, [status?.ready]);

  // Cargar expediente
  const fetchRecord = async () => {
    try {
      setLoading(true); setError("");
      const { data: studiesArr } = await api.get(`/api/estudios/${nss}`);
      const exp = { nss, studies: studiesArr }; 
      console.log("exp.studies (raw):", exp?.studies?.slice?.(0, 3));
      const studiesWithThumbs = await Promise.all(
        studiesArr.map(async (s) => {
          const safeFecha = toSQLDateString(s.fecha).replace(/[: ]/g, "_");
          const folder = `${exp.nss}_${safeFecha}`;
          let dicomUrl = null;

          try {
            const { data: files } = await api.get(`/api/image/dicom-list/${folder}`);
            if (Array.isArray(files) && files.length) {
              const mid = files[Math.floor(files.length / 2)];
              dicomUrl = wado(`/api/image/dicom/${folder}/${encodeURIComponent(mid)}`);
            }
          } catch {}

          let fechaDicomSQL = null;
          if (dicomUrl) {
            try {
              const image = await cornerstone.loadAndCacheImage(dicomUrl);
              const gs = cornerstone.metaData.get("generalStudyModule", dicomUrl) || {};
              let studyDate = gs.studyDate;
              let studyTime = gs.studyTime;
              if ((!studyDate || studyDate.length < 8) && image?.data?.string) {
                const dsString = image.data.string.bind(image.data);
                studyDate = dsString?.("x00080020") || studyDate;
                studyTime = dsString?.("x00080030") || studyTime;
              }
              fechaDicomSQL = toSQLFromDicomDateTime(studyDate, studyTime);
            } catch {}
          }

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

  // Montaje
  useEffect(() => {
    if (!nss) {
      alert("NSS inválido");
      navigate("/doctor", { replace: true });
      return;
    }
    fetchRecord();
  }, [nss, navigate]);

  // Subir ZIP con DICOMs
  const handleZipChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file?.name.endsWith(".zip")) return alert("Selecciona un archivo .zip válido");

    const fd = new FormData();
    fd.append("zipFile", file);
    fd.append("nss", nss);
    fd.append("fecha", toSQLDateString(new Date()));

    try {
      await api.post("/api/image/upload-zip", fd, { headers: { "Content-Type": "multipart/form-data" } });
      alert("ZIP subido correctamente");
      await fetchRecord();
    } catch (e) {
      console.error(e);
      alert("Error al subir ZIP");
    }
  };

  // Loading / Error
  if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}>Cargando expediente…</div>;
  if (error || !record) return <div style={{ padding: "2rem", textAlign: "center", color: "red" }}>{error || "Error desconocido"}</div>;

  return (
    <div>
      {/* Página de lista de estudios */}
      <div style={{ display: "flex", padding: "2rem", gap: "2rem" }}>
        {/* Panel izquierdo: info paciente */}
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
                value={
                  record?.fecha_nacimiento
                    ? new Date(record.fecha_nacimiento).toISOString().split("T")[0]
                    : ""
                }
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
              <button className="btn" onClick={() => descargarReportePaciente(record.nss)}>
                Descargar reporte (.xlsx) 📋
              </button>
              <button className="btn" onClick={() => navigate(-1)}>
                Volver
              </button>
            </div>
          </section>
        </div>

        {/* Panel derecho: estudios */}
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
                        width: 160, height: 160, backgroundColor: "#eee",
                        display: "flex", justifyContent: "center", alignItems: "center",
                        color: "#666", fontWeight: "bold", borderRadius: 6, margin: "0 auto",
                      }}
                    >
                      Sin imagen
                    </div>
                  )}

                  <p>
                    <strong>Fecha (DICOM):</strong> {new Date(s.fechaMostrar).toLocaleString()}
                  </p>

                  {/* Descripción */}
                  <button
                    className="btn"
                    title={s.descripcion || "-"}
                    onClick={() => {
                      setDescripcionActual(s.descripcion || "");
                      setShowDescripcionModal({
                        open: true,
                        nss_expediente: record.nss,
                        fecha: toSQLDateString(s.fecha),
                      });
                    }}
                    style={{ marginTop: 8 }}
                  >
                    Descripción ✏️
                  </button>

                    <button
                      className="btn"
                      title={s.diagnostico || "-"}
                      onClick={() => {
                        const value = s.diagnostico ?? "";
                        const fechaSQL = typeof s.fecha === "string" ? s.fecha : toSQLDateString(s.fecha); 
                        setShowDiagnosticoModal({
                          open: true,
                          nss_expediente: record.nss,
                          fecha: fechaSQL,  
                          value,
                        });
                      }}
                      style={{ marginTop: 8 }}
                    >
                      Diagnóstico 🩺
                    </button>

                  {/* Barra de progreso (solo si el overlay 3D de este estudio está abierto) */}
                  {show3DForFolder === s.folder && status && !status.ready && (
                    <div style={{padding:'1rem', textAlign:'center', opacity:0.8}}>
                      {status.estado === 'segmenting' && 'Segmentando…'}
                      {status.estado === 'dumping' && 'Guardando resultados…'}
                      {!status.estado && 'Procesando…'}
                      {typeof status.progreso === 'number' && (
                        <div style={{width:280, height:8, margin:'8px auto 0', background:'#eee', borderRadius:6, overflow:'hidden'}}>
                          <div style={{width:`${Math.max(0,Math.min(100,status.progreso))}%`, height:'100%'}} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Visor 2D */}
                  <button
                    className="btn"
                    onClick={() =>
                      navigate(
                        `/estudio/${record.nss}/${encodeURIComponent(toSQLDateString(s.fecha))}` +
                          (s.fechaDicomSQL ? `?fechaDicom=${encodeURIComponent(s.fechaDicomSQL)}` : "")
                      )
                    }
                    style={{ marginTop: 8 }}
                  >
                    Etiquetado 🖥️
                  </button>

                  {/* Abrir overlay 3D */}
                  <button
                    className="btn"
                    onClick={() => {
                      setShow3DForFolder(prev => prev === s.folder ? null : s.folder);
                      setStatus(null); // limpiar barra/estado de otro estudio
                    }}
                    style={{ marginTop: 8 }}
                  >
                    {show3DForFolder === s.folder ? "Ocultar 3D" : "Visualizar 3D 🏗️"}
                  </button>
                </div>
              ))}

              {/* Tarjeta para subir ZIP */}
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
          </section>
        </div>

        {/* Modales */}
        <div>
          {showDescripcionModal && (
            <DescripcionEstudio
              descripcion={descripcionActual}
              nss_expediente={showDescripcionModal.nss_expediente}
              fecha={showDescripcionModal.fecha}
              onClose={() => setShowDescripcionModal(false)}
              onSave={async () => { await fetchRecord(); }}
            />
          )}

          {/* Modal Diagnóstico */}
          {showDiagnosticoModal && (
            <EditFieldStudio
              value={showDiagnosticoModal.value} 
              nss_expediente={showDiagnosticoModal.nss_expediente}
              fecha={showDiagnosticoModal.fecha}
              endpoint={diagnosticoEndpoint}
              fieldName="diagnostico"
              placeholder="Ingrese el diagnóstico del estudio"
              title="Diagnóstico del Estudio"
              onClose={() => setShowDiagnosticoModal(false)}
              onSave={async () => { await fetchRecord(); }}
            />
          )}
        </div>
      </div>

      {/* === OVERLAY FULL-SCREEN 3D === */}
      {show3DForFolder && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Barra superior */}
          <div style={{ padding: 10, display: "flex", gap: 12, alignItems: "center" }}>
            <button
              className="btn"
              onClick={() => setShow3DForFolder(null)}
              style={{ background: "#333", color: "#fff", border: "none", borderRadius: 6 }}
            >
              Cerrar
            </button>
            <span style={{ color: "#fff", opacity: 0.8 }}>
              Visualización 3D — {show3DForFolder}
            </span>
          </div>

          {/* Contenedor del viewer 3D (ocupa todo) */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <RenderPulmon
              embedded          // no crea overlay propio
              initialFolder={show3DForFolder}
              height="100%"     // ocupa todo el alto disponible
              key={show3DForFolder}
            />
          </div>
        </div>
      )}
    </div>
  );
}
