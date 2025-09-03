import { useState } from "react";

const DescripcionEstudio = ({ descripcion, onClose }) => {
  const [desc, setDesc] = useState(descripcion);

  return (
    <div className="modal-overlay"> {/**No se donde se definieron estos estilos */}
      <div className="modal-content">
        <h2>Descripción del Estudio</h2>
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Ingrese la descripción del estudio"
        />
        <button onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
};

export default DescripcionEstudio;
