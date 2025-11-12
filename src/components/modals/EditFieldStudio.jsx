// src/components/modals/EditFieldStudio.jsx
import { useState, useEffect, useCallback } from "react";
import api from "../../api"; // usa el mismo cliente que el resto del front

export default function EditFieldStudio({
  value = "",
  nss_expediente,
  fecha,
  endpoint = "/api/estudios/diagnostico",
  fieldName = "diagnostico",
  title = "Editar campo",
  placeholder = "",
  onClose,
  onSave,
}) {
  const [text, setText] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(value ?? "");
  }, [value]);

  const handleClose = useCallback(() => {
    if (!saving) onClose?.();
  }, [saving, onClose]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && handleClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  const handleSave = async () => {
    if (!nss_expediente || !fecha) {
      alert("Faltan nss_expediente o fecha");
      return;
    }
    const trimmed = (text ?? "").trim();

    // Evita parches si no hay cambios
    if ((value ?? "").trim() === trimmed) {
      onClose?.();
      return;
    }

    setSaving(true);
    try {
      const payload = { nss_expediente, fecha, [fieldName]: trimmed };
      const { data } = await api.patch(endpoint, payload);

      onSave?.(trimmed); // el padre suele hacer fetchRecord()
      onClose?.();
    } catch (e) {
      const status = e?.response?.status;
      const msg =
        e?.response?.data ||
        (status === 404
          ? "Estudio no encontrado (verifica que la fecha coincida exactamente)."
          : e?.message || "Error desconocido");
      alert("Error al guardar: " + msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="efs-title"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 id="efs-title">{title}</h2>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder || `Ingresa ${fieldName}`}
          rows={6}
          style={{ width: "100%" }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn" onClick={handleClose} disabled={saving}>
            Cerrar
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>

      </div>
    </div>
  );
}
