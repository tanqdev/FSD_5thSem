import { Router } from 'express';
import { query, HttpError, id } from '../common.js';

const router = Router();

// ---------------- Buildings ----------------

router.get('/buildings', async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT b.*,
             COUNT(DISTINCT f.id)::int AS floor_count,
             COUNT(r.id)::int AS total_rooms,
             COALESCE(SUM(r.capacity), 0)::int AS total_capacity,
             COALESCE(SUM(r.occupied), 0)::int AS occupied_beds,
             COALESCE(SUM(r.available), 0)::int AS available_beds,
             COUNT(r.id) FILTER (WHERE r.status = 'full')::int AS full_rooms,
             COUNT(r.id) FILTER (WHERE r.status = 'partial')::int AS partial_rooms,
             COUNT(r.id) FILTER (WHERE r.status = 'vacant')::int AS vacant_rooms,
             CASE WHEN COALESCE(SUM(r.capacity), 0) = 0 THEN 0
                  ELSE ROUND(SUM(r.occupied)::numeric / SUM(r.capacity) * 100, 2)::float
             END AS occupancy_rate
      FROM buildings b
      LEFT JOIN floors f ON f.building_id = b.id
      LEFT JOIN room_occupancy r ON r.building_id = b.id
      GROUP BY b.id
      ORDER BY b.name
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/buildings', async (req, res, next) => {
  try {
    const { name, code, description } = req.body || {};
    if (!name?.trim() || !code?.trim()) throw HttpError(400, 'Name and code are required');
    const { rows } = await query(
      `INSERT INTO buildings (name, code, description) VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), code.trim().toUpperCase(), description || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return next(HttpError(409, 'A building with this name or code already exists'));
    next(err);
  }
});

router.put('/buildings/:id', async (req, res, next) => {
  try {
    const { name, code, description } = req.body || {};
    if (!name?.trim() || !code?.trim()) throw HttpError(400, 'Name and code are required');
    const { rows } = await query(
      `UPDATE buildings SET name=$1, code=$2, description=$3 WHERE id=$4 RETURNING *`,
      [name.trim(), code.trim().toUpperCase(), description || null, id(req.params.id)]
    );
    if (!rows[0]) throw HttpError(404, 'Building not found');
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return next(HttpError(409, 'A building with this name or code already exists'));
    next(err);
  }
});

router.delete('/buildings/:id', async (req, res, next) => {
  try {
    const used = await query(
      `SELECT COUNT(*)::int AS n FROM rooms WHERE building_id = $1`,
      [id(req.params.id)]
    );
    if (used.rows[0].n > 0) {
      throw HttpError(409, `Cannot delete: building still has ${used.rows[0].n} room(s)`);
    }
    const { rows } = await query(`DELETE FROM buildings WHERE id = $1 RETURNING id`, [id(req.params.id)]);
    if (!rows[0]) throw HttpError(404, 'Building not found');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------- Floors ----------------

router.get('/floors', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.query.buildingId) {
      params.push(Number(req.query.buildingId));
      where = 'WHERE f.building_id = $1';
    }
    const { rows } = await query(
      `SELECT f.*, b.name AS building_name, b.code AS building_code,
              COUNT(r.id)::int AS total_rooms,
              COALESCE(SUM(r.capacity), 0)::int AS total_capacity,
              COALESCE(SUM(r.occupied), 0)::int AS occupied_beds,
              COALESCE(SUM(r.available), 0)::int AS available_beds,
              COUNT(r.id) FILTER (WHERE r.status = 'full')::int AS full_rooms,
              COUNT(r.id) FILTER (WHERE r.status = 'partial')::int AS partial_rooms,
              COUNT(r.id) FILTER (WHERE r.status = 'vacant')::int AS vacant_rooms,
              CASE WHEN COALESCE(SUM(r.capacity), 0) = 0 THEN 0
                   ELSE ROUND(SUM(r.occupied)::numeric / SUM(r.capacity) * 100, 2)::float
              END AS occupancy_rate
       FROM floors f
       JOIN buildings b ON b.id = f.building_id
       LEFT JOIN room_occupancy r ON r.floor_id = f.id
       ${where}
       GROUP BY f.id, b.name, b.code
       ORDER BY b.name, f.floor_number`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/floors', async (req, res, next) => {
  try {
    const { building_id, floor_number, label } = req.body || {};
    if (!building_id || floor_number === undefined || floor_number === null) {
      throw HttpError(400, 'Building and floor number are required');
    }
    const { rows } = await query(
      `INSERT INTO floors (building_id, floor_number, label) VALUES ($1, $2, $3) RETURNING *`,
      [id(building_id), Number(floor_number), label || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return next(HttpError(409, 'This floor already exists in the building'));
    if (err.code === '23503') return next(HttpError(400, 'Building does not exist'));
    next(err);
  }
});

router.put('/floors/:id', async (req, res, next) => {
  try {
    const { floor_number, label } = req.body || {};
    const { rows } = await query(
      `UPDATE floors SET floor_number = $1, label = $2 WHERE id = $3 RETURNING *`,
      [Number(floor_number), label || null, id(req.params.id)]
    );
    if (!rows[0]) throw HttpError(404, 'Floor not found');
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return next(HttpError(409, 'This floor already exists in the building'));
    next(err);
  }
});

router.delete('/floors/:id', async (req, res, next) => {
  try {
    const used = await query(`SELECT COUNT(*)::int AS n FROM rooms WHERE floor_id = $1`, [id(req.params.id)]);
    if (used.rows[0].n > 0) throw HttpError(409, `Cannot delete: floor still has ${used.rows[0].n} room(s)`);
    const { rows } = await query(`DELETE FROM floors WHERE id = $1 RETURNING id`, [id(req.params.id)]);
    if (!rows[0]) throw HttpError(404, 'Floor not found');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
