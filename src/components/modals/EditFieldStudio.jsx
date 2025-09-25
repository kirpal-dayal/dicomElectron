import { useState } from "react";
import axios from "axios";

const EditFieldStudio = ({
  value,
  nss_expediente,
  fecha,
  endpoint,
  fieldName,
  placeholder,
  title,
  onClose,
  onSave,
}) => {
  const [fieldValue, setFieldValue] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.patch(endpoint, {
        nss_expediente,
        fecha,
        [fieldName]: fieldValue,
      });
      if (onSave) onSave(fieldValue);
      onClose();
    } catch (e) {
      alert("Error al guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{title}</h2>
        <textarea
          value={fieldValue}
          onChange={e => setFieldValue(e.target.value)}
          placeholder={placeholder}
        />
        <button onClick={handleSave} disabled={saving}>
          {saving ? "Guardando..." : "Guardar"}
        </button>
        <button onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
};

export default EditFieldStudio;