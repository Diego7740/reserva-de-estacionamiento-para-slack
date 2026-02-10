/* =========================
   ⚠️ DOTENV (PRIMERA LÍNEA)
========================= */
require('dotenv').config();
console.log('ENV SLACK:', process.env.SLACK_WEBHOOK_URL);
/* =========================
   📦 IMPORTS
========================= */
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3000;

/* =========================
   📂 PATHS
========================= */

const DB_FILE = path.join(__dirname, 'reservas.json');
const frontendPath = path.join(__dirname, '../frontend');

/* =========================
   ⚙️ MIDDLEWARE
========================= */

app.use(cors());
app.use(express.json());
app.use(express.static(frontendPath));

/* =========================
   🌐 FRONTEND
========================= */

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

/* =========================
   📂 DB JSON SIMPLE
========================= */

function leerReservas() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, '[]');
      return [];
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('❌ Error leyendo reservas:', err);
    return [];
  }
}

function guardarReservas(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Error guardando reservas:', err);
  }
}

/* =========================
   🔒 ANTI SOLAPAMIENTO
========================= */

function hayCruce(nueva, existentes) {
  return existentes.some(r =>
    r.estacionamiento === nueva.estacionamiento &&
    new Date(nueva.start) < new Date(r.end) &&
    new Date(nueva.end) > new Date(r.start)
  );
}

/* =========================
   📥 GET RESERVAS
========================= */

app.get('/reservas', (req, res) => {
  const estacionamiento = Number(req.query.estacionamiento);
  const reservas = leerReservas();

  if (estacionamiento) {
    return res.json(
      reservas.filter(r => r.estacionamiento === estacionamiento)
    );
  }

  res.json(reservas);
});

/* =========================
   ➕ POST RESERVA + SLACK
========================= */

app.post('/reservas', async (req, res) => {
  const { title, start, end, estacionamiento } = req.body;

  if (!title || !start || !end || !estacionamiento) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  const inicio = new Date(start);
  const fin = new Date(end);

  if (isNaN(inicio) || isNaN(fin) || inicio >= fin) {
    return res.status(400).json({ error: 'Horario inválido' });
  }

  const reservas = leerReservas();

  const nueva = {
    id: Date.now().toString(),
    title: title.trim(),
    start: inicio.toISOString(),
    end: fin.toISOString(),
    estacionamiento: Number(estacionamiento)
  };

  if (hayCruce(nueva, reservas)) {
    return res.status(409).json({ error: 'Horario ocupado' });
  }

  reservas.push(nueva);
  guardarReservas(reservas);

  /* 🔔 SLACK */
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      await axios.post(
        process.env.SLACK_WEBHOOK_URL,
        {
          text:
            `🚗 *Nueva reserva creada*\n\n` +
            `👤 *Nombre:* ${nueva.title}\n` +
            `🅿️ *Estacionamiento:* ${nueva.estacionamiento}\n` +
            `⏰ *Horario:* ${inicio.toLocaleTimeString('es-CL')} → ${fin.toLocaleTimeString('es-CL')}`
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
      console.log('✅ Slack notificado');
    } catch (err) {
      console.error('❌ Error Slack:', err.response?.data || err.message);
    }
  } else {
    console.warn('⚠️ SLACK_WEBHOOK_URL no configurada');
  }

  res.status(201).json(nueva);
});

/* =========================
   🗑 DELETE RESERVA
========================= */

app.delete('/reservas/:id', (req, res) => {
  const reservas = leerReservas();
  const nuevas = reservas.filter(r => r.id !== req.params.id);

  if (reservas.length === nuevas.length) {
    return res.status(404).json({ error: 'Reserva no encontrada' });
  }

  guardarReservas(nuevas);
  res.sendStatus(204);
});

/* =========================
   🚀 START SERVER
========================= */

app.listen(PORT, '0.0.0.0', () => {
  console.log('====================================');
  console.log('✅ SERVIDOR ACTIVO');
  console.log(`👉 http://localhost:${PORT}`);
  console.log('SLACK:', process.env.SLACK_WEBHOOK_URL ? 'OK' : 'NO CONFIGURADO');
  console.log('====================================');
});






