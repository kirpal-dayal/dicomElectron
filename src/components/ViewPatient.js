/**
 * ViewPatient.jsx
 *
 * FRONTEND – Página principal para visualizar el expediente de un paciente y sus estudios (DICOM).
 * - “Visualizar 3D (demo)” abre un overlay con VTK y usa máscaras locales (loadMaskFiles).
 * - Para la demo, intentamos leer spacing/origin reales desde un DICOM del expediente.
 */

import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaCloudUploadAlt } from "react-icons/fa";
import axios from "axios";

import cornerstone from "cornerstone-core";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import dicomParser from "dicom-parser";

import DescripcionEstudio from "./modals/DescripcionEstudio";
import VTKVolumeViewer from "./VTKVolumeViewer";
import { loadMaskFiles } from "../utils/loadMaskfiles";

// ---- Cornerstone config (WADO-URI desde backend) ----
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({ beforeSend: () => { } });

// Miniatura DICOM simple con Cornerstone
function DicomThumbnail({ imageId }) {
  const elementRef = useRef(null);

  useEffect(() => {
    const el = elementRef.current;
    if (!el || !imageId) return;

    let cancelled = false;

    const isEnabled = () => {
      try { cornerstone.getEnabledElement(el); return true; }
      catch { return false; }
    };

    if (!isEnabled()) { try { cornerstone.enable(el); } catch { } }

    cornerstone
      .loadAndCacheImage(imageId)
      .then((image) => {
        if (cancelled) return;
        try { if (isEnabled()) cornerstone.displayImage(el, image); } catch { }
      })
      .catch(() => { });

    return () => {
      cancelled = true;
      try { if (isEnabled()) cornerstone.disable(el); } catch { }
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
  const [isLungRenderVisible, setLungRenderVisible] = useState(false);
  const [lungVolArr, setLungVolArr] = useState(null);
  const [fibroVolArr, setFibroVolArr] = useState(null);
  const [dims, setDims] = useState(null);

  // Metadatos físicos para pasar al demo
  const [spacing, setSpacing] = useState([1, 1, 1]);
  const [origin, setOrigin] = useState([0, 0, 0]);

  //Descripcion del estudio
  const [showDescripcionModal, setShowDescripcionModal] = useState(false);
  const [descripcionActual, setDescripcionActual] = useState("");

  //  Ocultamos estos estados comentándolos
  // const [quality, setQuality] = useState("full"); // 'full' | 'half' | 'quarter'
  // const [progressMsg, setProgressMsg] = useState("");

  // Cargar expediente + preparar miniaturas por estudio
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
          try {
            const { data: files } = await axios.get(
              `http://localhost:5000/api/image/dicom-list/${folder}`
            );
            if (!files?.length) throw new Error("No DICOM files");
            const mid = files[Math.floor(files.length / 2)];
            const dicomUrl = `wadouri:http://localhost:5000/api/image/dicom/${folder}/${mid}`;
            return { ...s, folder, dicomUrl };
          } catch {
            return { ...s, folder, dicomUrl: null };
          }
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
  const probeSpacingFromAnyStudy = async () => {
    try {
      if (!record?.studies?.length) return { spacing: [1, 1, 1], origin: [0, 0, 0] };

      const s0 = record.studies.find(s => s.folder) || record.studies[0];
      const folder = s0.folder || `${record.nss}_${toSQLDateString(s0.fecha).replace(/[: ]/g, "_")}`;

      const { data: files } = await axios.get(`http://localhost:5000/api/image/dicom-list/${folder}`);
      if (!files?.length) return { spacing: [1, 1, 1], origin: [0, 0, 0] };

      const i0 = Math.max(0, Math.floor(files.length / 2) - 1);
      const i1 = Math.min(files.length - 1, i0 + 1);

      const id0 = `wadouri:http://localhost:5000/api/image/dicom/${folder}/${files[i0]}`;
      const id1 = `wadouri:http://localhost:5000/api/image/dicom/${folder}/${files[i1]}`;

      await cornerstone.loadAndCacheImage(id0);
      await cornerstone.loadAndCacheImage(id1);

      const p0 = cornerstone.metaData.get('imagePlaneModule', id0) || {};
      const p1 = cornerstone.metaData.get('imagePlaneModule', id1) || {};

      const sy = p0.rowPixelSpacing ?? p0.pixelSpacing?.[0] ?? 1;
      const sx = p0.columnPixelSpacing ?? p0.pixelSpacing?.[1] ?? 1;

      const rc = p0.rowCosines || p0.rowCosine || [1, 0, 0];
      const cc = p0.columnCosines || p0.columnCosine || [0, 1, 0];
      const n = [
        rc[1] * cc[2] - rc[2] * cc[1],
        rc[2] * cc[0] - rc[0] * cc[2],
        rc[0] * cc[1] - rc[1] * cc[0],
      ];

      const ipp0 = p0.imagePositionPatient || [0, 0, 0];
      const ipp1 = p1.imagePositionPatient || [0, 0, 0];
      const d = [ipp1[0] - ipp0[0], ipp1[1] - ipp0[1], ipp1[2] - ipp0[2]];
      const sz_from_ipp = Math.abs(d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) || 1;

      const origin = ipp0;
      const spacing = [sx, sy, sz_from_ipp];

      console.log("[DEMO 3D] Spacing calculado con IPP/IOP:", spacing, "Origin:", origin,
        "SliceThickness:", p0.sliceThickness, "SpacingBetweenSlices:", p0.spacingBetweenSlices);

      return { spacing, origin };
    } catch (e) {
      console.warn("[DEMO 3D] Fallback spacing/origin [1,1,1]/[0,0,0] ->", e?.message || e);
      return { spacing: [1, 1, 1], origin: [0, 0, 0] };
    }
  };

  // Demo: abre el overlay y carga máscaras de ejemplo + spacing/origin
  const handleShowLungRender = async () => {
    try {
      // setProgressMsg("Leyendo máscaras de demo…"); // oculto
      const [lungVol, fibroVol, dimensions] = await loadMaskFiles("nada");
      const { spacing: sp, origin: og } = await probeSpacingFromAnyStudy();

      console.log("[DEMO 3D] Dims (máscaras):", dimensions, "Spacing:", sp, "Origin:", og);

      setLungVolArr(lungVol);
      setFibroVolArr(fibroVol);
      setDims(dimensions);
      setSpacing(sp);
      setOrigin(og);
      setLungRenderVisible(true);
      // setProgressMsg("Listo."); // oculto
    } catch (e) {
      console.error("Error loading demo masks", e);
      alert("No se pudieron cargar las máscaras de demo.");
    }
  };

  const handleBackOrigin = () => {
    setLungRenderVisible(false);
  };

  // Subir ZIP con DICOMs
  const handleZipChange = async (e) => {
    const file = e.target.files?.[0];
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
    } catch (e) {
      console.error(e);
      alert("Error al subir ZIP");
    }
  };

  // Loading / error
  if (loading) {
    return <div style={{ padding: "2rem", textAlign: "center" }}>Cargando expediente…</div>;
  }
  if (error || !record) {
    return <div style={{ padding: "2rem", textAlign: "center", color: "red" }}>{error || "Error desconocido"}</div>;
  }

  return (
    <div>
      {isLungRenderVisible ? (
        // Overlay 3D a pantalla completa (demo)
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Barra superior con controles y metadatos */}
          <div style={{ padding: 10, display: "flex", gap: 12, alignItems: "center", color: "#fff" }}>
            <button
              onClick={handleBackOrigin}
              style={{
                padding: "6px 10px",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontWeight: "bold",
              }}
            >
              Volver
            </button>

            {/* Oculta la info de Dims/Spacing/Origin */}
            {/*
            <div style={{ opacity: 0.9 }}>
              <strong>Dims:</strong>{" "}
              {dims ? `${dims[0]}×${dims[1]}×${dims[2]}` : "-"}
              {"  ·  "}
              <strong>Spacing (mm):</strong>{" "}
              {spacing ? `${spacing[0]}×${spacing[1]}×${spacing[2]}` : "-"}
              {"  ·  "}
              <strong>Origin (mm):</strong>{" "}
              {origin ? `${origin[0].toFixed?.(1) ?? origin[0]},${origin[1].toFixed?.(1) ?? origin[1]},${origin[2].toFixed?.(1) ?? origin[2]}` : "-"}
            </div>
            */}

            {/*Oculta el selector de calidad */}
            {/*
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Calidad:</span>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                style={{ padding: "4px 6px", borderRadius: 6 }}
              >
                <option value="full">Full</option>
                <option value="half">Half</option>
                <option value="quarter">Quarter</option>
              </select>
            </div>
            */}
          </div>

          {/* Lienzo VTK */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <VTKVolumeViewer
              volumeArray={lungVolArr}
              fibrosisVolArr={fibroVolArr}
              dims={dims}
              spacing={spacing}
              origin={origin}
              quality="full"         //  fijo; no se muestra control
            // onProgress={(msg) => setProgressMsg(String(msg))} //  oculto
            />
          </div>

          {/* Oculta el pie con mensaje de progreso */}
          {/*
          <div style={{ padding: "6px 10px", color: "#bbb", fontSize: 12 }}>
            {progressMsg}
          </div>
          */}
        </div>
      ) : (
        // Página de lista de estudios
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
                      <strong>Fecha:</strong> {new Date(s.fecha).toLocaleString()}
                    </p>

                    {/* Ver (al pasar el cursor) y editar descripcion elaborada por el medico */}
                    <button
                      className="btn"
                      title={s.descripcion || "-"}
                      onClick={() => {
                        setDescripcionActual(s.descripcion || "");
                        setShowDescripcionModal({
                          open: true,
                          nss_expediente: record.nss,
                          //fecha: s.fecha, //Formato ISO no compatible con MySQL
                          fecha: toSQLDateString(s.fecha), // siempre en formato SQL
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
                          `/estudio/${record.nss}/${encodeURIComponent(toSQLDateString(s.fecha))}`
                        )
                      }
                      style={{ marginTop: 8 }}
                    >
                      Editar
                    </button>

                    {/* Demo: overlay 3D con máscaras locales */}
                    <button
                      className="btn"
                      onClick={handleShowLungRender}
                      style={{ marginTop: 8 }}
                    >
                      Visualizar 3D
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

              <div className="actions" style={{ marginTop: "2rem" }}>
                <button
                  className="btn"
                  onClick={() => navigate(`/analisis-detallado/${record.nss}`)}
                >
                  ...
                </button>

                {/* Página dedicada a VTK (si ya la tienes) */}
                <button
                  className="btn"
                  onClick={() =>
                    navigate(`/render-pulmon?nss=${encodeURIComponent(record.nss)}`)}
                  style={{ marginLeft: 8 }}
                >
                  ...
                </button>
              </div>
            </section>
          </div>
          <div>
            {showDescripcionModal && (
              <DescripcionEstudio
                descripcion={descripcionActual}
                nss_expediente={showDescripcionModal.nss_expediente}
                fecha={showDescripcionModal.fecha}
                onClose={() => setShowDescripcionModal(false )}
                onSave={async (desc) => {
                  // Aquí puedes actualizar el estado local
                  await fetchRecord(); // refresca la lista de estudios
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
