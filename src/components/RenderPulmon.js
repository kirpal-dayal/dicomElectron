// src/components/RenderPulmon.js
import React, { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api, { wado } from "../api";
import cornerstone from "cornerstone-core";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import dicomParser from "dicom-parser";

import VTKVolumeViewer from "./VTKVolumeViewer";
import { createVolumeFromContours } from "./../utils/rasterizeContours";

// Cornerstone + WADO
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({ beforeSend: () => {} });

// Registrar metaDataProvider
(() => {
  try {
    const provider =
      cornerstoneWADOImageLoader?.wadouri?.metaDataProvider ||
      cornerstoneWADOImageLoader?.metaData?.metaDataProvider;
    if (provider && cornerstone.metaData?.addProvider) {
      cornerstone.metaData.addProvider((type, imageId) => provider(type, imageId), 9999);
      console.info("[Cornerstone] metaDataProvider WADO registrado.");
    } else {
      console.warn("[Cornerstone] No se encontró wadouri.metaDataProvider; metadata puede fallar.");
    }
  } catch (e) {
    console.warn("[Cornerstone] Error registrando metaDataProvider:", e);
  }
})();

const API = {
  expediente:         (nss)               => `/api/expedientes/${nss}`,
  dicomList:          (folder)            => `/api/image/dicom-list/${folder}`,
  dicomFile:          (folder, file)      => `/api/image/dicom/${folder}/${encodeURIComponent(file)}`,
  maskStackByFolder:  (folder)            => `/api/segment/mask-stack-by-folder/${folder}`,
  maskDbByFolder:     (folder, index0)    => `/api/segment/mask-db-by-folder/${folder}/${index0}`,
  validIndices:       (folder)            => `/api/segment/valid-indices/${folder}`,
  maskJson:           (folder, paddedIdx) => `/api/segment/mask-json/${folder}/${paddedIdx}`,
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
    const isEnabled = () => { try { cornerstone.getEnabledElement(el); return true; } catch { return false; } };
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
  return { lung: Array.isArray(lung) ? lung : [], fibrosis: Array.isArray(fibrosis) ? fibrosis : [] };
}

function padToLength(arr, length, filler) {
  const out = arr.slice();
  while (out.length < length) out.push(typeof filler === "function" ? filler() : filler);
  return out.slice(0, length);
}

function SimpleProgress({ loaded = 0, total = 0, text = "Cargando…" }) {
  const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  return (
    <div style={{ position: "absolute", top: 10, left: 10, right: 10, zIndex: 2 }}>
      <div style={{ color: "#fff", fontSize: 12, marginBottom: 6 }}>
        {text} {total ? `(${loaded}/${total})` : ""} — {percent}%
      </div>
      <div style={{ height: 8, background: "rgba(255,255,255,0.15)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${percent}%`, height: "100%", background: "#1abc9c`" }} />
      </div>
    </div>
  );
}
const naturalSort = (a, b) =>
  String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });

export default function RenderPulmon({
  embedded = false,
  initialFolder = null,
  height = "70vh",
}) {
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

  // ===== efectos para modo NO embebido (query params) =====
  useEffect(() => {
    if (embedded) return;
    const params = new URLSearchParams(location.search);
    const qp = params.get("nss");
    if (qp && qp !== nss) setNss(qp);
  }, [location.search, nss, embedded]);

  useEffect(() => {
    if (embedded) return;
    const params = new URLSearchParams(location.search);
    const qp = params.get("nss");
    const folder = params.get("folder");
    if (!qp || folder) return;   // si viene folder, saltamos la grilla
    fetchRecord(qp);
  }, [location.search, embedded]);

  const hasFolder = useMemo(() => {
    if (embedded) return false;
    const params = new URLSearchParams(location.search);
    return !!params.get("folder");
  }, [location.search, embedded]);

  useEffect(() => {
    if (embedded) return;
    const params = new URLSearchParams(location.search);
    const folder = params.get("folder");
    if (folder) {
      console.info("[RenderPulmon] autoload folder:", folder);
      open3DForStudy({ folder });
    }
  }, [location.search, embedded]);

  // ===== efectos para modo EMBEBIDO =====
  useEffect(() => {
    if (!embedded || !initialFolder) return;
    // reset por si cambia de estudio
    setVtkData({
      volumeArray: null,
      fibrosisVolArr: null,
      dims: [0, 0, 0],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      quality: "full",
    });
    setError3D("");
    open3DForStudy({ folder: initialFolder });
  }, [embedded, initialFolder]);

  const fetchRecord = async (nssValue) => {
    console.groupCollapsed("[RenderPulmon] fetchRecord");
    try {
      setLoading(true);
      setError("");
      const { data: exp } = await api.get(API.expediente(nssValue));
      const studiesWithThumbs = await Promise.all(
        (exp.studies || []).map(async (s) => {
          const safeFecha = toSQLDateString(s.fecha).replace(/[: ]/g, "_");
          const folder = s.folder || `${exp.nss}_${safeFecha}`;
          let dicomUrl = null;
          try {
            let files = (await api.get(API.dicomList(folder))).data || [];
            files = Array.isArray(files) ? files.slice().sort(naturalSort) : [];
            if (files?.length) {
              const mid = files[Math.floor(files.length / 2)];
              dicomUrl = wado(API.dicomFile(folder, mid));
            }
          } catch {}
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

  // utilidades
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
      let files = (await api.get(API.dicomList(folder))).data || [];
      files = files.slice().sort(naturalSort);
      if (!files.length) throw new Error("El estudio no tiene DICOMs.");
      const imageIds = files.map((f) => wado(API.dicomFile(folder, f)));
      console.log("DICOM slices:", imageIds.length);

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

      // 2) Máscaras (BD → fallback)
      let lungLayers = [];
      let fibroLayers = [];

      try {
        const { data: stack } = await api.get(API.maskStackByFolder(folder));
        if (Array.isArray(stack?.bySlice) && stack.bySlice.length) {
          lungLayers  = stack.bySlice.map((s) => (Array.isArray(s?.lung) ? s.lung : []));
          fibroLayers = stack.bySlice.map((s) => (Array.isArray(s?.fibrosis) ? s.fibrosis : []));
        }
      } catch {}

      if (!lungLayers.length || !fibroLayers.length) {
        const tmpL = [], tmpF = [];
        setProgress3D({ loaded: 0, total: slices });
        for (let i = 0; i < slices; i++) {
          try {
            const { data } = await api.get(API.maskDbByFolder(folder, i));
            const { lung, fibrosis } = extractSlicePolygons(data);
            tmpL.push(lung); tmpF.push(fibrosis);
          } catch {
            tmpL.push([]); tmpF.push([]);
          } finally {
            setProgress3D((p) => ({ ...p, loaded: p.loaded + 1 }));
          }
        }
        lungLayers  = tmpL;
        fibroLayers = tmpF;
      }

      if (!lungLayers.length || !fibroLayers.length) {
        let indices = [];
        try {
          const { data } = await api.get(API.validIndices(folder));
          if (Array.isArray(data)) indices = data.map((v) => String(v).padStart(3, "0"));
          else if (Array.isArray(data?.indices)) indices = data.indices.map((v) => String(v).padStart(3, "0"));
        } catch {}
        if (!indices.length) indices = Array.from({ length: slices }, (_, i) => String(i).padStart(3, "0"));

        setProgress3D({ loaded: 0, total: indices.length });

        const tmpL = [], tmpF = [];
        for (let k = 0; k < indices.length; k++) {
          const idx = indices[k];
          try {
            const { data: sliceJson } = await api.get(API.maskJson(folder, idx));
            const { lung, fibrosis } = extractSlicePolygons(sliceJson);
            tmpL.push(lung || []); tmpF.push(fibrosis || []);
          } catch {
            tmpL.push([]); tmpF.push([]);
          } finally {
            setProgress3D((p) => ({ ...p, loaded: p.loaded + 1 }));
          }
        }
        lungLayers  = tmpL;
        fibroLayers = tmpF;
      }

      // Igualar longitud
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

  // ======= RENDER =======
if (embedded) {
  return (
    <div style={{ width: "100%", height, background: "#111", borderRadius: 8, overflow: "hidden", position: "relative" }}>
      {(loading3D || (progress3D.total > 0 && progress3D.loaded < progress3D.total)) && (
        <SimpleProgress
          loaded={progress3D.loaded}
          total={progress3D.total}
          text="Cargando máscaras"
        />
      )}

      {error3D && (
        <div style={{ position: "absolute", top: 10, left: 10, color: "salmon" }}>
          {error3D}
        </div>
      )}

      {vtkData.volumeArray && vtkData.fibrosisVolArr ? (
        <VTKVolumeViewer
          volumeArray={vtkData.volumeArray}
          fibrosisVolArr={vtkData.fibrosisVolArr}
          dims={vtkData.dims}
          spacing={vtkData.spacing}
          origin={vtkData.origin}
          quality={vtkData.quality}
        />
      ) : (
        <div style={{ color: "#aaa", padding: 16 }}>Cargando volumen…</div>
      )}
    </div>
  );
}


  // Vista completa (con buscador + grid + overlay propio)
  return (
    <div style={{ padding: "1.5rem" }}>
      <h2>Visualización 3D VTK — máscaras desde BD (con fallback)</h2>

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

{open3D && (
  <div
    style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)",
      zIndex: 10000, display: "flex", flexDirection: "column"
    }}
  >
    <div style={{ padding: 10, display: "flex", gap: 12, alignItems: "center", position: "relative" }}>
      <button
        onClick={() => setOpen3D(false)}
        style={{ padding: "6px 10px", background: "#333", color: "#fff", border: "none", borderRadius: 6 }}
      >
        Cerrar
      </button>

      {(loading3D || (progress3D.total > 0 && progress3D.loaded < progress3D.total)) && (
        <SimpleProgress
          loaded={progress3D.loaded}
          total={progress3D.total}
          text="Cargando máscaras"
        />
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
