// src/components/RenderPulmon.js
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";

import cornerstone from "cornerstone-core";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import dicomParser from "dicom-parser";

import VTKVolumeViewer from "./VTKVolumeViewer";
import { createVolumeFromContours } from "./../utils/rasterizeContours";

cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({ beforeSend: () => {} });

const API = {
  expediente:   (nss)              => `http://localhost:5000/api/expedientes/${nss}`,
  dicomList:    (folder)           => `http://localhost:5000/api/image/dicom-list/${folder}`,
  dicomFile:    (folder, file)     => `http://localhost:5000/api/image/dicom/${folder}/${file}`,
  // Si estás leyendo polígonos desde archivos:
  validIndices: (folder)           => `http://localhost:5000/api/segment/valid-indices/${folder}`,
  maskJson:     (folder, index)    => `http://localhost:5000/api/segment/mask-json/${folder}/${index}`,
};

function toSQLDateString(fecha) {
  if (!fecha) return "";
  let d = typeof fecha === "string" ? new Date(fecha) : fecha;
  if (isNaN(d)) return fecha;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function DicomThumbnail({ imageId }) {
  const elementRef = useRef(null);
  useEffect(() => {
    if (!elementRef.current || !imageId) return;
    try {
      cornerstone.enable(elementRef.current);
      cornerstone
        .loadImage(imageId)
        .then((image) => cornerstone.displayImage(elementRef.current, image))
        .catch(() => {});
    } catch {}
    return () => {
      if (elementRef.current) {
        try { cornerstone.disable(elementRef.current); } catch {}
      }
    };
  }, [imageId]);
  return (
    <div ref={elementRef} style={{ width: 160, height: 160, background: "black", borderRadius: 6, margin: "0 auto" }} />
  );
}

function extractSlicePolygons(json) {
  const lungPolys     = json?.lung_editable ?? json?.lung ?? [];
  const fibrosisPolys = json?.fibrosis_editable ?? json?.fibrosis ?? [];
  return { lung: Array.isArray(lungPolys) ? lungPolys : [], fibrosis: Array.isArray(fibrosisPolys) ? fibrosisPolys : [] };
}

export default function RenderPulmon() {
  const navigate = useNavigate();
  const location = useLocation();

  const [nss, setNss] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [record, setRecord] = useState(null);

  // overlay VTK
  const [open3D, setOpen3D] = useState(false);
  const [vtkData, setVtkData] = useState({
    volumeArray: null,
    fibrosisVolArr: null,
    dims: [0, 0, 0],
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
  });
  const [loading3D, setLoading3D] = useState(false);
  const [error3D, setError3D] = useState("");
  const [progress3D, setProgress3D] = useState({ loaded: 0, total: 0 });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const qp = params.get("nss");
    if (qp && qp !== nss) setNss(qp);
  }, [location.search, nss]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const qp = params.get("nss");
    if (!qp) return;
    fetchRecord(qp);
  }, [location.search]);

  const fetchRecord = async (nssValue) => {
    try {
      setLoading(true);
      setError("");
      const { data: exp } = await axios.get(API.expediente(nssValue));
      const studiesWithThumbs = await Promise.all(
        (exp.studies || []).map(async (s) => {
          const safeFecha = toSQLDateString(s.fecha).replace(/[: ]/g, "_");
          const folder = s.folder || `${exp.nss}_${safeFecha}`;
          let dicomUrl = null;
          try {
            const files = (await axios.get(API.dicomList(folder))).data;
            if (files?.length) {
              const mid = files[Math.floor(files.length / 2)];
              dicomUrl = `wadouri:${API.dicomFile(folder, mid)}`;
            }
          } catch {}
          return { ...s, folder, dicomUrl };
        })
      );
      setRecord({ ...exp, studies: studiesWithThumbs });
    } catch (e) {
      setError("No se pudo cargar el expediente o sus estudios");
    } finally {
      setLoading(false);
    }
  };

  // === Utilidad DICOM → spacing/origin ===
  function cross(a, b) {
    return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
  }
  function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }

  const open3DForStudy = async (study) => {
    const folder = study.folder;
    try {
      setLoading3D(true);
      setError3D("");
      setProgress3D({ loaded: 0, total: 0 });

      // 1) DICOMs del estudio
      const files = (await axios.get(API.dicomList(folder))).data || [];
      if (!files.length) throw new Error("El estudio no tiene DICOMs.");
      const imageIds = files.map(f => `wadouri:${API.dicomFile(folder, f)}`);

      // Carga primero y último para metadata (asegura metaData disponible)
      await cornerstone.loadAndCacheImage(imageIds[0]);
      await cornerstone.loadAndCacheImage(imageIds[imageIds.length - 1]);

      const ipFirst = cornerstone.metaData.get('imagePlaneModule', imageIds[0]) || {};
      const ipLast  = cornerstone.metaData.get('imagePlaneModule', imageIds[imageIds.length - 1]) || {};

      const cols = ipFirst.columns || ipFirst.width  || 512;
      const rows = ipFirst.rows    || ipFirst.height || 512;
      const slices = imageIds.length;

      // pixelSpacing: [row, column] → VTK usa [x=column, y=row, z]
      const ps = ipFirst.pixelSpacing || [1, 1];
      const colSpacing = ps[1] ?? 1;
      const rowSpacing = ps[0] ?? 1;

      // normal del stack
      const r = ipFirst.rowCosines    || [1, 0, 0];
      const c = ipFirst.columnCosines || [0, 1, 0];
      const n = cross(r, c);

      // Δpos (mm) proyectado en la normal → total Z (mm)
      const p0 = ipFirst.imagePositionPatient || [0, 0, 0];
      const p1 = ipLast.imagePositionPatient  || [0, 0, 0];
      const delta = [p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]];
      const totalZmm = Math.abs(dot(delta, n));
      const zSpacing = slices > 1
        ? totalZmm / (slices - 1)
        : (ipFirst.spacingBetweenSlices || ipFirst.sliceThickness || 1);

      const spacing = [colSpacing, rowSpacing, zSpacing];
      const origin  = p0;

      // 2) Cargar máscaras por corte y rasterizar
      // ---- Si tienes valid-indices ----
      let indices = [];
      try {
        const { data } = await axios.get(API.validIndices(folder));
        if (Array.isArray(data)) indices = data.map((v) => String(v).padStart(3, "0"));
        else if (Array.isArray(data?.indices)) indices = data.indices.map((v) => String(v).padStart(3, "0"));
      } catch {
        indices = Array.from({ length: slices }, (_, i) => String(i).padStart(3, "0"));
      }
      if (!indices.length) throw new Error("No hay máscaras disponibles para este estudio.");

      setProgress3D({ loaded: 0, total: indices.length });

      const lungLayers = [];
      const fibroLayers = [];
      for (let k = 0; k < indices.length; k++) {
        const idx = indices[k];
        try {
          const { data: sliceJson } = await axios.get(API.maskJson(folder, idx));
          const { lung, fibrosis } = extractSlicePolygons(sliceJson);
          lungLayers.push(lung || []);
          fibroLayers.push(fibrosis || []);
        } catch {
          lungLayers.push([]);
          fibroLayers.push([]);
        } finally {
          setProgress3D(p => ({ ...p, loaded: p.loaded + 1 }));
        }
      }

      const volumeArray    = createVolumeFromContours(lungLayers,  cols, rows);
      const fibrosisVolArr = createVolumeFromContours(fibroLayers, cols, rows);
      const dims = [cols, rows, lungLayers.length];

      // 3) Elegir calidad según nº cortes
      const quality = dims[2] >= 250 ? 'half' : 'full';

      setVtkData({ volumeArray, fibrosisVolArr, dims, spacing, origin, quality });
      setOpen3D(true);
    } catch (e) {
      setError3D(e?.message || "No se pudo abrir el 3D.");
    } finally {
      setLoading3D(false);
    }
  };

  const onSearch = () => {
    if (!nss) return;
    const usp = new URLSearchParams(location.search);
    usp.set("nss", nss);
    navigate(`?${usp.toString()}`);
  };

  return (
    <div style={{ padding: "1.5rem" }}>
      <h2>Visualización 3D VTK — rasterizando desde polígonos (spacing/origin reales)</h2>

      {/* BUSCADOR */}
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <input
          placeholder="NSS del paciente"
          value={nss}
          onChange={(e) => setNss(e.target.value)}
          style={{ padding: "0.6rem 0.8rem", minWidth: 260 }}
        />
        <button
          onClick={onSearch}
          style={{ padding: "0.6rem 1rem", background: "#1677ff", color: "#fff", border: "none", borderRadius: 6 }}
        >
          Buscar
        </button>
        <button onClick={() => navigate(-1)} style={{ padding: "0.6rem 0.9rem", borderRadius: 6 }}>
          Volver
        </button>
      </div>

      {loading && <p>Cargando estudios…</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {/* GRID de estudios */}
      {record && (
        <section className="card" style={{ background: "#fff", borderRadius: 8, padding: "1rem" }}>
          <h3>
            Paciente: <span style={{ fontWeight: 400 }}>{record.nss}</span> — Estudios ({record.studies.length})
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "1rem",
              marginTop: "1rem",
            }}
          >
            {record.studies.map((s, i) => {
              const fechaLabel = new Date(s.fecha).toLocaleString();
              return (
                <div
                  key={i}
                  style={{
                    background: "#fafafa",
                    border: "1px solid #eee",
                    borderRadius: 8,
                    padding: "1rem",
                    textAlign: "center",
                  }}
                >
                  {s.dicomUrl ? (
                    <DicomThumbnail imageId={s.dicomUrl} />
                  ) : (
                    <div
                      style={{
                        width: 160, height: 160, background: "#eee", borderRadius: 6, margin: "0 auto",
                        display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontWeight: 600,
                      }}
                    >
                      Sin imagen
                    </div>
                  )}

                  <div style={{ marginTop: 8 }}>
                    <div><strong>Fecha:</strong> {fechaLabel}</div>
                    <div><strong>Desc.:</strong> {s.descripcion || "-"}</div>
                  </div>

                  <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
                    {/* ← Quitamos “Ver 2D” */}
                    <button
                      className="btn"
                      onClick={() => open3DForStudy(s)}
                      style={{ padding: "0.45rem 0.7rem", background: "#0a7", color: "#fff", border: "none", borderRadius: 6 }}
                    >
                      Visualizar 3D
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* OVERLAY VTK */}
      {open3D && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 10000, display: "flex", flexDirection: "column",
          }}
        >
          <div style={{ padding: 10, display: "flex", gap: 12, alignItems: "center" }}>
            <button
              onClick={() => setOpen3D(false)}
              style={{ padding: "6px 10px", background: "#333", color: "#fff", border: "none", borderRadius: 6 }}
            >
              Cerrar
            </button>
            {loading3D && (
              <span style={{ color: "#fff" }}>
                Preparando 3D… {progress3D.loaded}/{progress3D.total}
              </span>
            )}
            {error3D && <span style={{ color: "salmon" }}>{error3D}</span>}
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            <VTKVolumeViewer
              volumeArray={vtkData.volumeArray}
              fibrosisVolArr={vtkData.fibrosisVolArr}
              dims={vtkData.dims}
              spacing={vtkData.spacing}
              origin={vtkData.origin}
              quality={vtkData.quality}
            />
          </div>
        </div>
      )}
    </div>
  );
}
