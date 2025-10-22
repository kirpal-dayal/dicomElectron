import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const DescripcionEstudio = ({ descripcion, nss_expediente, fecha, onClose, onSave }) => {
  const [desc, setDesc] = useState(descripcion ?? "");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // 1) Mantén el texto sincronizado con la prop si cambia en el padre
  useEffect(() => {
    setDesc(descripcion ?? "");
  }, [descripcion, nss_expediente, fecha]);

  // 2) Lee SIEMPRE lo más reciente desde BD al montar y cuando cambian llaves
  useEffect(() => {
    let cancel = false;

    const fetchDescripcion = async () => {
      if (!nss_expediente || !fecha) {
        setDesc(descripcion ?? "");
        return;
      }
      setLoading(true);
      try {
        const { data } = await axios.get("/api/estudios/descripcion", {
          params: { nss_expediente, fecha },
        });
        if (!cancel) {
          // Prefiere BD; si no hay, cae a la prop
          setDesc(data?.descripcion ?? (descripcion ?? ""));
        }
      } catch {
        if (!cancel) {
          // Si falla el fetch, al menos usa la prop
          setDesc(descripcion ?? "");
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    };

    fetchDescripcion();
    return () => {
      cancel = true;
    };
  }, [nss_expediente, fecha]); // intencionalmente NO depende de `descripcion` para no sobrescribir lo traído de BD

  const handleClose = useCallback(() => {
    if (!saving) onClose?.();
  }, [saving, onClose]);

  const handleSave = async () => {
    const trimmed = (desc ?? "").trim();

    // Evita parches innecesarios si no hubo cambios respecto a la prop inicial
    if ((descripcion ?? "").trim() === trimmed) {
      onClose?.();
      return;
    }

    setSaving(true);
    try {
      await axios.patch("/api/estudios/descripcion", {
        nss_expediente,
        fecha,
        descripcion: trimmed,
      });
      onSave?.(trimmed); // el padre puede hacer fetchRecord() aquí
      onClose?.();
    } catch (e) {
      alert("Error al guardar la descripción: " + (e?.response?.data || e.message));
    } finally {
      setSaving(false);
    }
  };

  // Cerrar con ESC
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && handleClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="descripcion-title"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 id="descripcion-title">Descripción del Estudio</h2>

        <textarea
          autoFocus
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Ingrese la descripción del estudio"
          disabled={loading || saving}
          style={{ minHeight: 120, width: "100%" }}
        />

        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button onClick={handleClose} disabled={saving}>
            Cerrar
          </button>
        </div>

        {loading && <p style={{ marginTop: 8, opacity: 0.7 }}>Cargando descripción…</p>}
      </div>
    </div>
  );
};

export default DescripcionEstudio;
