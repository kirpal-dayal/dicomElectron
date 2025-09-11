// src/components/RenderPulmon.js
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";

import cornerstone from "cornerstone-core";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import dicomParser from "dicom-parser";

import VTKVolumeViewer from "./VTKVolumeViewer";
import { createVolumeFromContours } from "./../utils/rasterizeContours";

// --- Cornerstone + WADO config ---
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({ beforeSend: () => {} });

// Registra el metaDataProvider de wadouri (necesario para imagePlaneModule)
(function ensureMetaProvider() {
  try {
    const provider =
      cornerstoneWADOImageLoader?.wadouri?.metaDataProvider ||
      cornerstoneWADOImageLoader?.metaData?.metaDataProvider;
    if (provider) {
      cornerstone.metaData.addProvider(provider, 9999);
      console.info("[Cornerstone] metaDataProvider de WADO-URI registrado.");
    } else {
      console.warn(
        "[Cornerstone] No se encontró wadouri.metaDataProvider; metadata puede fallar."
      );
    }
  } catch (e) {
    console.warn("[Cornerstone] Error registrando metaDataProvider:", e);
  }
})();

const API = {
  expediente:         (nss)               => `http://localhost:5000/api/expedientes/${nss}`,
  dicomList:          (folder)            => `http://localhost:5000/api/image/dicom-list/${folder}`,
  dicomFile:          (folder, file)      => `http://localhost:5000/api/image/dicom/${folder}/${file}`,
  // BD (preferido)
  maskStackByFolder:  (folder)            => `http://localhost:5000/api/segment/mask-stack-by-folder/${folder}`,
  maskDbByFolder:     (folder, index0)    => `http://localhost:5000/api/segment/mask-db-by-folder/${folder}/${index0}`,
  // Filesystem (fallback legacy)
  validIndices:       (folder)            => `http://localhost:5000/api/segment/valid-indices/${folder}`,
  maskJson:           (folder, paddedIdx) => `http://localhost:5000/api/segment/mask-json/${folder}/${paddedIdx}`,
};

function toSQLDateString(fecha) {
  if (!fecha) return "";
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  if (isNaN(d)) return String(fecha);
  return (
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2,"0")} ` +
    `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`
  );
}

function DicomThumbnail({ imageId }) {
  const elementRef = useRef(null);
  useEffect(() => {
    const el = elementRef.current;
    if (!el || !imageId) return;
    const isEnabled = () => {
      try { cornerstone.getEnabledElement(el); return true; } catch { return false; }
    };
    if (!isEnabled()) { try { cornerstone.enable(el); } catch {} }
    cornerstone
      .loadAndCacheImage(imageId)
      .then((image) => { try { if (isEnabled()) cornerstone.displayImage(el, image); } catch {} })
      .catch(() => {});
    return () => { try { if (isEnabled()) cornerstone.disable(el); } catch {} };
  }, [imageId]);
  return <div ref={elementRef} style={{ width:160, height:160, background:"black", borderRadius:6, margin:"0 auto" }} />;
}

function extractSlicePolygons(json) {
  if (!json || typeof json !== "object") return { lung: [], fibrosis: [] };
  const lung     = json.lung_editable ?? json.lung ?? [];
  const fibrosis = json.fibrosis_editable ?? json.fibrosis ?? [];
  return {
    lung: Array.isArray(lung) ? lung : [],
    fibrosis: Array.isArray(fibrosis) ? fibrosis : [],
  };
}

function padToLength(arr, length, filler) {
  const out = arr.slice();
  while (out.length < length) out.push(typeof filler === "function" ? filler() : filler);
  return out.slice(0, length);
}

const naturalSort = (a, b) =>
  String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });

export default function RenderPulmon() {
  const navigate = useNavigate();
  const location = useLocation();

  const [nss, setNss] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [record, setRecord] = useState(null);

  const [open3D, setOpen3D] = useState(false);
  const [vtkData, setVtkData] = useState({
    volumeArray: null,
    fibrosisVolArr: null,
    dims: [0, 0, 0],
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    quality: "full",
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
    const folder = params.get("folder");
    if (!qp || folder) return;   // si viene folder, saltamos la grilla
    fetchRecord(qp);
  }, [location.search]);
// ¿Entramos con ?folder=... para abrir 3D directo?
const hasFolder = React.useMemo(() => {
  const params = new URLSearchParams(location.search);
  return !!params.get("folder");
}, [location.search]);

 useEffect(() => {
   const params = new URLSearchParams(location.search);
   const folder = params.get("folder");
   if (folder) {
     console.info("[RenderPulmon] autoload folder:", folder);
     open3DForStudy({ folder }); // open3DForStudy sólo usa study.folder
 }
 }, [location.search]);


  const fetchRecord = async (nssValue) => {
    console.groupCollapsed("[RenderPulmon] fetchRecord");
    console.log("nss:", nssValue);
    try {
      setLoading(true);
      setError("");
      const { data: exp } = await axios.get(API.expediente(nssValue));
      console.log("expediente:", exp);

      const studiesWithThumbs = await Promise.all(
        (exp.studies || []).map(async (s) => {
          const safeFecha = toSQLDateString(s.fecha).replace(/[: ]/g, "_");
          const folder = s.folder || `${exp.nss}_${safeFecha}`;
          let dicomUrl = null;
          try {
            let files = (await axios.get(API.dicomList(folder))).data;
            files = Array.isArray(files) ? files.slice().sort(naturalSort) : [];
            if (files?.length) {
              const mid = files[Math.floor(files.length / 2)];
              dicomUrl = `wadouri:${API.dicomFile(folder, mid)}`;
            }
            console.log(`estudio folder=${folder} files=${files?.length ?? 0}`);
          } catch (e) {
            console.warn("dicom-list fallo:", e?.message || e);
          }
          return { ...s, folder, dicomUrl };
        })
      );
      setRecord({ ...exp, studies: studiesWithThumbs });
    } catch (e) {
      console.error("fetchRecord error:", e?.message || e, e?.response?.data);
      setError("No se pudo cargar el expediente o sus estudios");
    } finally {
      setLoading(false);
      console.groupEnd();
    }
  };

  // ==== Utilidades geométricas ====
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const dot   = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

  const open3DForStudy = async (study) => {
    const folder = study.folder;
    console.groupCollapsed("[3D] open3DForStudy");
    console.log("folder:", folder);

    try {
      setLoading3D(true);
      setError3D("");
      setProgress3D({ loaded: 0, total: 0 });

      // 1) DICOMs → dims + spacing + origin
      let files = (await axios.get(API.dicomList(folder))).data || [];
      files = files.slice().sort(naturalSort);
      if (!files.length) throw new Error("El estudio no tiene DICOMs.");
      const imageIds = files.map((f) => `wadouri:${API.dicomFile(folder, f)}`);
      console.log("DICOM slices:", imageIds.length);

      // Carga 1ª y última para asegurar metadatos
      const imgFirst = await cornerstone.loadAndCacheImage(imageIds[0]);
      await cornerstone.loadAndCacheImage(imageIds[imageIds.length - 1]);

      const ipFirst = cornerstone.metaData.get("imagePlaneModule", imageIds[0]) || {};
      const ipLast  = cornerstone.metaData.get("imagePlaneModule", imageIds[imageIds.length - 1]) || {};

      const cols   = ipFirst.columns || imgFirst.width  || 512;
      const rows   = ipFirst.rows    || imgFirst.height || 512;
      const slices = imageIds.length;

      const ps = ipFirst.pixelSpacing || [1, 1]; // [row, col]
      const spacingX = ps[1] ?? 1; // column
      const spacingY = ps[0] ?? 1; // row

      const r = ipFirst.rowCosines    || [1,0,0];
      const c = ipFirst.columnCosines || [0,1,0];
      const n = cross(r, c);

      const p0 = ipFirst.imagePositionPatient || [0,0,0];
      const p1 = ipLast.imagePositionPatient  || [0,0,0];
      const delta = [p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]];
      const totalZmm = Math.abs(dot(delta, n));
      const spacingZ = slices > 1 ? (totalZmm / (slices - 1)) : (ipFirst.spacingBetweenSlices || ipFirst.sliceThickness || 1);

      const spacing = [spacingX, spacingY, spacingZ];
      const origin  = p0;
      console.log("dims:", { cols, rows, slices }, "spacing:", spacing, "origin:", origin);

      // 2) Máscaras — 1) stack BD → 2) BD por slice → 3) filesystem
      let lungLayers = [];
      let fibroLayers = [];

      try {
        console.log("Intentando BD: mask-stack-by-folder…");
        const { data: stack } = await axios.get(API.maskStackByFolder(folder));
        console.log("stack-resp:", stack);
        if (Array.isArray(stack?.bySlice) && stack.bySlice.length) {
          lungLayers  = stack.bySlice.map((s) => (Array.isArray(s?.lung) ? s.lung : []));
          fibroLayers = stack.bySlice.map((s) => (Array.isArray(s?.fibrosis) ? s.fibrosis : []));
          console.log(`stack OK → slices=${stack.bySlice.length}`);
        } else {
          console.log("stack vacío.");
        }
      } catch (e) {
        console.warn("mask-stack-by-folder fallo:", e?.message || e, e?.response?.data);
      }

      if (!lungLayers.length || !fibroLayers.length) {
        console.log("Fallback BD por slice…");
        const tmpL = [], tmpF = [];
        setProgress3D({ loaded: 0, total: slices });
        for (let i = 0; i < slices; i++) {
          try {
            const { data } = await axios.get(API.maskDbByFolder(folder, i));
            const { lung, fibrosis } = extractSlicePolygons(data);
            tmpL.push(lung); tmpF.push(fibrosis);
          } catch (e) {
            console.warn(`mask-db-by-folder fallo slice ${i}:`, e?.message || e);
            tmpL.push([]); tmpF.push([]);
          } finally {
            setProgress3D((p) => ({ ...p, loaded: p.loaded + 1 }));
          }
        }
        lungLayers  = tmpL;
        fibroLayers = tmpF;
        console.log(`BD por slice → llenado: L=${lungLayers.length} F=${fibroLayers.length}`);
      }

      if (!lungLayers.length || !fibroLayers.length) {
        console.log("Último fallback: filesystem (valid-indices + mask-json) …");
        let indices = [];
        try {
          const { data } = await axios.get(API.validIndices(folder));
          if (Array.isArray(data)) indices = data.map((v) => String(v).padStart(3, "0"));
          else if (Array.isArray(data?.indices)) indices = data.indices.map((v) => String(v).padStart(3, "0"));
        } catch (e) {
          console.warn("valid-indices fallo:", e?.message || e);
        }
        if (!indices.length) indices = Array.from({ length: slices }, (_, i) => String(i).padStart(3, "0"));

        setProgress3D({ loaded: 0, total: indices.length });

        const tmpL = [], tmpF = [];
        for (let k = 0; k < indices.length; k++) {
          const idx = indices[k];
          try {
            const { data: sliceJson } = await axios.get(API.maskJson(folder, idx));
            const { lung, fibrosis } = extractSlicePolygons(sliceJson);
            tmpL.push(lung || []); tmpF.push(fibrosis || []);
          } catch (e) {
            console.warn(`mask-json fallo idx ${idx}:`, e?.message || e);
            tmpL.push([]); tmpF.push([]);
          } finally {
            setProgress3D((p) => ({ ...p, loaded: p.loaded + 1 }));
          }
        }
        lungLayers  = tmpL;
        fibroLayers = tmpF;
        console.log(`filesystem → llenado: L=${lungLayers.length} F=${fibroLayers.length}`);
      }

      // Asegurar longitud = nº slices de DICOM
      lungLayers  = padToLength(lungLayers,  slices, []);
      fibroLayers = padToLength(fibroLayers, slices, []);

      // 3) Rasterizar
      console.time("[3D] raster lung");
      const volumeArray    = createVolumeFromContours(lungLayers,  cols, rows);
      console.timeEnd("[3D] raster lung");
      console.time("[3D] raster fibrosis");
      const fibrosisVolArr = createVolumeFromContours(fibroLayers, cols, rows);
      console.timeEnd("[3D] raster fibrosis");

      const dims = [cols, rows, slices];
      const quality = slices >= 250 ? "half" : "full";

      console.log("VTK ready → dims:", dims, "quality:", quality);
      setVtkData({ volumeArray, fibrosisVolArr, dims, spacing, origin, quality });
      setOpen3D(true);
    } catch (e) {
      console.error("[3D] error:", e?.message || e, e?.response?.data);
      setError3D(e?.message || "No se pudo abrir el 3D.");
    } finally {
      setLoading3D(false);
      console.groupEnd();
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
      <h2>Visualización 3D VTK — máscaras desde BD (con fallback)</h2>

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
