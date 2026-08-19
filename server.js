require('dotenv').config();

const express = require('express');
const path = require('path');
const { initDatabase } = require('./database/init');
const { startScheduler } = require('./services/scheduler');

const authRoutes = require('./routes/auth');
const vehicleRoutes = require('./routes/vehicles');
const reminderRoutes = require('./routes/reminders');
const calendarRoutes = require('./routes/calendar');
const configRoutes = require('./routes/config');
const recipientRoutes = require('./routes/recipients');

const app = express();
const PORT = process.env.PORT || 3000;

initDatabase();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/config', configRoutes);
app.use('/api/recipients', recipientRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  Reminder Samsat Kendaraan Dinas`);
  console.log(`  Server berjalan di http://localhost:${PORT}`);
  console.log(`========================================\n`);

  startScheduler();
});
