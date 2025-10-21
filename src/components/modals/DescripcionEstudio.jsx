import { useState } from "react";
import axios from "axios";

const DescripcionEstudio = ({ descripcion, nss_expediente, fecha, onClose, onSave }) => {
  const [desc, setDesc] = useState(descripcion);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.patch("/api/estudios/descripcion", {
        nss_expediente,
        fecha,
        descripcion: desc,
      });
      if (onSave) onSave(desc);
      onClose();
    } catch (e) {
      alert("Error al guardar la descripción" + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Descripción del Estudio</h2>
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Ingrese la descripción del estudio"
        />
        <button onClick={handleSave} disabled={saving}>
          {saving ? "Guardando..." : "Guardar"}
        </button>
        <button onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
};

export default DescripcionEstudio;
