import { Router } from 'express';
import { query, withTransaction, HttpError, id } from '../common.js';

const router = Router();

const GENDERS = ['male', 'female', 'other'];

// List occupants (with current allocation joined)
router.get('/occupants', async (req, res, next) => {
  try {
    const { search, gender, department, status, buildingId } = req.query;
    const params = [];
    const where = [];

    if (search) {
      params.push(`%${String(search).trim()}%`);
      where.push(`(o.full_name ILIKE $${params.length} OR o.occupant_code ILIKE $${params.length}
                   OR o.department ILIKE $${params.length} OR r.room_number ILIKE $${params.length})`);
    }
    if (gender) {
      params.push(gender);
      where.push(`o.gender = $${params.length}`);
    }
    if (department) {
      params.push(department);
      where.push(`o.department = $${params.length}`);
    }
    if (buildingId) {
      params.push(id(buildingId));
      where.push(`r.building_id = $${params.length}`);
    }
    if (status === 'allocated') where.push('a.id IS NOT NULL');
    if (status === 'unallocated') where.push('a.id IS NULL');

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const counts = await query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE a.id IS NOT NULL)::int AS allocated,
        COUNT(*) FILTER (WHERE a.id IS NULL)::int AS unallocated
      FROM occupants o
      LEFT JOIN room_allocations a ON a.occupant_id = o.id AND a.released_at IS NULL
      LEFT JOIN rooms r ON r.id = a.room_id
    `);

    const { rows } = await query(
      `SELECT o.*, a.id AS allocation_id, a.allocated_at,
              r.id AS room_id, r.room_number, r.capacity, r.room_type,
              b.name AS building_name, f.floor_number,
              COALESCE((SELECT COUNT(*) FROM room_allocations ra WHERE ra.occupant_id = o.id), 0)::int AS allocation_count
       FROM occupants o
       LEFT JOIN room_allocations a ON a.occupant_id = o.id AND a.released_at IS NULL
       LEFT JOIN rooms r ON r.id = a.room_id
       LEFT JOIN buildings b ON b.id = r.building_id
       LEFT JOIN floors f ON f.id = r.floor_id
       ${whereSql}
       ORDER BY (a.id IS NULL), o.full_name`,
      params
    );

    res.json({ occupants: rows, ...counts.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/occupants/departments', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT DISTINCT department FROM occupants WHERE department IS NOT NULL ORDER BY department`
    );
    res.json(rows.map((r) => r.department));
  } catch (err) {
    next(err);
  }
});

router.get('/occupants/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.* FROM occupants o WHERE o.id = $1`,
      [id(req.params.id)]
    );
    if (!rows[0]) throw HttpError(404, 'Occupant not found');

    const history = await query(
      `SELECT a.*, r.room_number, b.name AS building_name
       FROM room_allocations a
       JOIN rooms r ON r.id = a.room_id
       JOIN buildings b ON b.id = r.building_id
       WHERE a.occupant_id = $1
       ORDER BY a.allocated_at DESC`,
      [id(req.params.id)]
    );
    res.json({ ...rows[0], allocations: history.rows });
  } catch (err) {
    next(err);
  }
});

// Create occupant
router.post('/occupants', async (req, res, next) => {
  try {
    const { full_name, occupant_code, gender, phone, email, department, course, emergency_contact } = req.body || {};
    if (!full_name?.trim() || !occupant_code?.trim()) {
      throw HttpError(400, 'Name and ID/Roll number are required');
    }
    if (!GENDERS.includes(gender)) throw HttpError(400, 'Valid gender is required');

    const { rows } = await query(
      `INSERT INTO occupants (full_name, occupant_code, gender, phone, email, department, course, emergency_contact)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        full_name.trim(), occupant_code.trim().toUpperCase(), gender,
        phone || null, email || null, department || null, course || null, emergency_contact || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return next(HttpError(409, 'That ID/Roll number already exists'));
    next(err);
  }
});

// Edit occupant
router.put('/occupants/:id', async (req, res, next) => {
  try {
    const { full_name, occupant_code, gender, phone, email, department, course, emergency_contact } = req.body || {};
    if (!full_name?.trim() || !occupant_code?.trim()) throw HttpError(400, 'Name and ID are required');
    if (!GENDERS.includes(gender)) throw HttpError(400, 'Valid gender is required');

    const { rows } = await query(
      `UPDATE occupants SET full_name=$1, occupant_code=$2, gender=$3, phone=$4, email=$5,
              department=$6, course=$7, emergency_contact=$8
       WHERE id=$9 RETURNING *`,
      [
        full_name.trim(), occupant_code.trim().toUpperCase(), gender,
        phone || null, email || null, department || null, course || null, emergency_contact || null,
        id(req.params.id),
      ]
    );
    if (!rows[0]) throw HttpError(404, 'Occupant not found');
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return next(HttpError(409, 'That ID/Roll number already exists'));
    next(err);
  }
});

// Delete occupant (cascades to allocations)
router.delete('/occupants/:id', async (req, res, next) => {
  try {
    const { rows } = await query(`DELETE FROM occupants WHERE id = $1 RETURNING id`, [id(req.params.id)]);
    if (!rows[0]) throw HttpError(404, 'Occupant not found');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
