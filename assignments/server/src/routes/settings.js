import { Router } from 'express';
import { query, HttpError, id } from '../common.js';

const router = Router();

const DEFAULT_SETTINGS = {
  facility_name: 'Campus Living — Residence Management',
  facility_short: 'CLRM',
  contact_email: 'residences@campus.edu',
  contact_phone: '+91 98000 00000',
  address: 'Knowledge Park, Sector 12, New Town',
  academic_year: '2026–2027',
  enforce_gender_rules: true,
  allow_overfill: false,
  show_vacant_publicly: false,
};

// Get all settings (merged over defaults)
router.get('/settings', async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT key, value FROM settings`);
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({ ...DEFAULT_SETTINGS, ...stored });
  } catch (err) {
    next(err);
  }
});

// Upsert settings (partial update)
router.put('/settings', async (req, res, next) => {
  try {
    const body = req.body || {};
    const entries = Object.entries(body).filter(([k]) => k in DEFAULT_SETTINGS);
    if (!entries.length) throw HttpError(400, 'No valid settings provided');

    for (const [key, value] of entries) {
      await query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, JSON.stringify(value)]
      );
    }
    const { rows } = await query(`SELECT key, value FROM settings`);
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({ ...DEFAULT_SETTINGS, ...stored });
  } catch (err) {
    next(err);
  }
});

// Admin users
router.get('/users', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, email, role, active, created_at FROM admins ORDER BY id`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const { name, email, role, password } = req.body || {};
    if (!name?.trim() || !email?.trim()) throw HttpError(400, 'Name and email are required');
    const { rows } = await query(
      `INSERT INTO admins (name, email, role, password_hash) VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, active, created_at`,
      [name.trim(), email.trim().toLowerCase(), role || 'admin', password || 'changeme']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return next(HttpError(409, 'That email is already registered'));
    if (err.code === '23514') return next(HttpError(400, 'Invalid role'));
    next(err);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const { name, email, role, active } = req.body || {};
    const { rows } = await query(
      `UPDATE admins SET name = COALESCE($1, name), email = COALESCE($2, email),
              role = COALESCE($3, role), active = COALESCE($4, active)
       WHERE id = $5 RETURNING id, name, email, role, active, created_at`,
      [name || null, email ? email.toLowerCase() : null, role || null,
       typeof active === 'boolean' ? active : null, id(req.params.id)]
    );
    if (!rows[0]) throw HttpError(404, 'User not found');
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return next(HttpError(409, 'That email is already registered'));
    next(err);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    const { rows } = await query(`DELETE FROM admins WHERE id = $1 RETURNING id`, [id(req.params.id)]);
    if (!rows[0]) throw HttpError(404, 'User not found');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
