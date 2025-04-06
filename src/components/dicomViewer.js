// src/components/DicomViewer.jsx
import React, { useEffect, useRef } from 'react';
import * as cornerstone from '@cornerstonejs/core';
import * as dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import * as cornerstoneTools from '@cornerstonejs/tools';
import './DicomViewer.css'; // puedes crear estilos para el modal

const DicomViewer = ({ imageId, onClose }) => {
  const elementRef = useRef(null);

  useEffect(() => {
    // 1. Inicializar Cornerstone
    cornerstone.init();

    // 2. Configurar image loader
    dicomImageLoader.external.cornerstone = cornerstone;
    dicomImageLoader.configure({
      useWebWorkers: true,
    });

    // 3. Inicializar herramientas si es necesario
    cornerstoneTools.init();

    // 4. Habilitar el contenedor
    const element = elementRef.current;
    cornerstone.enable(element);

    // 5. Cargar y mostrar imagen
    cornerstone
      .loadAndCacheImage(imageId)
      .then((image) => {
        const viewport = cornerstone.getDefaultViewportForImage(element, image);
        cornerstone.displayImage(element, image, viewport);
      })
      .catch((err) => {
        console.error(' Error al cargar imagen DICOM:', err);
      });

    // Limpieza al desmontar
    return () => {
      cornerstone.disable(element);
    };
  }, [imageId]);

  return (
    <div className="dicom-modal-overlay" onClick={onClose}>
      <div className="dicom-modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Visor DICOM</h3>
        <div id="dicomImage" ref={elementRef} style={{ width: '512px', height: '512px', background: 'black' }} />
        <button onClick={onClose} style={{ marginTop: '1rem' }}>Cerrar</button>
      </div>
    </div>
  );
};

export default DicomViewer;
