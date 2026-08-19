const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/init');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password harus diisi.' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    return res.status(401).json({ error: 'Username atau password salah.' });
  }

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Username atau password salah.' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, nama: user.nama },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      nama: user.nama,
      jabatan: user.jabatan,
      no_hp: user.no_hp
    }
  });
});

router.post('/register', authMiddleware, adminOnly, (req, res) => {
  const { username, password, nama, role, no_hp, jabatan } = req.body;

  if (!username || !password || !nama) {
    return res.status(400).json({ error: 'Username, password, dan nama harus diisi.' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username sudah digunakan.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, password, nama, role, no_hp, jabatan) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(username, hash, nama, role || 'user', no_hp || null, jabatan || null);

  res.status(201).json({
    message: 'Akun berhasil dibuat.',
    user: { id: result.lastInsertRowid, username, nama, role: role || 'user' }
  });
});

router.get('/users', authMiddleware, adminOnly, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, username, nama, role, no_hp, jabatan, created_at FROM users').all();
  res.json(users);
});

router.put('/users/:id', authMiddleware, adminOnly, (req, res) => {
  const { nama, role, no_hp, jabatan } = req.body;
  const db = getDb();

  db.prepare('UPDATE users SET nama = COALESCE(?, nama), role = COALESCE(?, role), no_hp = COALESCE(?, no_hp), jabatan = COALESCE(?, jabatan) WHERE id = ?')
    .run(nama, role, no_hp, jabatan, req.params.id);

  res.json({ message: 'Data pengguna berhasil diperbarui.' });
});

router.delete('/users/:id', authMiddleware, adminOnly, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Tidak dapat menghapus akun sendiri.' });
  }
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'Pengguna berhasil dihapus.' });
});

router.get('/me', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, nama, role, no_hp, jabatan FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

module.exports = router;
