const express = require('express');
const { getDb } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const recipients = db.prepare(`
    SELECT * FROM recipients
    WHERE status_aktif = 1
    ORDER BY nama ASC
  `).all();
  res.json(recipients);
});

router.get('/all', authMiddleware, (req, res) => {
  const db = getDb();
  const recipients = db.prepare(`
    SELECT * FROM recipients
    ORDER BY status_aktif DESC, nama ASC
  `).all();
  res.json(recipients);
});

router.post('/', authMiddleware, (req, res) => {
  const { nama, no_hp, jabatan } = req.body;

  if (!nama || !no_hp) {
    return res.status(400).json({ error: 'Nama dan nomor HP wajib diisi.' });
  }

  if (!/^0\d{8,13}$/.test(no_hp.replace(/[\s-]/g, ''))) {
    return res.status(400).json({ error: 'Format nomor HP tidak valid. Gunakan format 08xxxxxxxxxx.' });
  }

  const db = getDb();
  const result = db.prepare('INSERT INTO recipients (nama, no_hp, jabatan) VALUES (?, ?, ?)')
    .run(nama.trim(), no_hp.trim(), jabatan || null);

  res.status(201).json({
    message: 'Penerima berhasil ditambahkan.',
    recipient: { id: result.lastInsertRowid, nama, no_hp }
  });
});

router.put('/:id', authMiddleware, (req, res) => {
  const { nama, no_hp, jabatan, status_aktif } = req.body;
  const db = getDb();

  const existing = db.prepare('SELECT id FROM recipients WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Penerima tidak ditemukan.' });
  }

  db.prepare(`
    UPDATE recipients SET
      nama = COALESCE(?, nama),
      no_hp = COALESCE(?, no_hp),
      jabatan = COALESCE(?, jabatan),
      status_aktif = COALESCE(?, status_aktif)
    WHERE id = ?
  `).run(nama, no_hp, jabatan, status_aktif, req.params.id);

  res.json({ message: 'Penerima berhasil diperbarui.' });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM recipients WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Penerima tidak ditemukan.' });
  }

  db.prepare('DELETE FROM recipients WHERE id = ?').run(req.params.id);
  res.json({ message: 'Penerima berhasil dihapus.' });
});

module.exports = router;