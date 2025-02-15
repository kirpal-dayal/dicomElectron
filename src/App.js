import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import UserView from './components/UserView';
import DoctorView from './components/DoctorView';
import AdminView from './components/AdminView';
import ViewPatient from './components/ViewPatient';
import AnalisisDetallado from './components/AnalisisDetallado'; // Nueva vista
import StudyView from './components/StudyView'; // Nueva vista de estudio

import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        {/* Rutas existentes */}
        <Route path="/" element={<Home />} />
        <Route path="/user" element={<UserView />} />
        <Route path="/doctor" element={<DoctorView />} />
        <Route path="/admin" element={<AdminView />} />

        {/* Nueva ruta para vista del paciente */}
        <Route path="/view/:id" element={<ViewPatient />} />
        <Route path="/view-patient/:id" element={<ViewPatient />} />
        <Route path="/estudio/:id/:studyNumber" element={<StudyView />} /> {/* infopaciente>studyview */}
        {/* 🔹 Nueva ruta para análisis detallado */}
        <Route path="/analisis-detallado/:id" element={<AnalisisDetallado />} />
      </Routes>
    </Router>
  );
}

export default App;
