import { Router } from 'express';
import { query, withTransaction, HttpError, id, ROOM_OCCUPANCY_SQL, decorateRoom } from '../common.js';

const router = Router();

const ROOM_TYPES = ['Single', 'Double Sharing', 'Triple Sharing', 'Four Sharing', 'Six Sharing'];

// List rooms with search + filters
router.get('/rooms', async (req, res, next) => {
  try {
    const { search, buildingId, floorId, type, status, page = 1, limit = 50 } = req.query;
    const params = [];
    const where = [];

    if (search) {
      params.push(`%${String(search).trim()}%`);
      where.push(`(room_number ILIKE $${params.length} OR building_name ILIKE $${params.length})`);
    }
    if (buildingId) {
      params.push(id(buildingId));
      where.push(`building_id = $${params.length}`);
    }
    if (floorId) {
      params.push(id(floorId));
      where.push(`floor_id = $${params.length}`);
    }
    if (type) {
      params.push(type);
      where.push(`room_type = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM room_occupancy ${whereSql}`,
      params
    );
    const total = countResult.rows[0].total;

    const lim = Math.min(Number(limit) || 50, 200);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * lim;
    params.push(lim, offset);

    const { rows } = await query(
      `${ROOM_OCCUPANCY_SQL} ${whereSql} ORDER BY building_name, floor_number, room_number
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      rooms: rows.map(decorateRoom),
      total,
      page: Number(page) || 1,
      limit: lim,
      pages: Math.ceil(total / lim) || 1,
    });
  } catch (err) {
    next(err);
  }
});

// Room detail incl. active occupants
router.get('/rooms/:id', async (req, res, next) => {
  try {
    const { rows } = await query(`${ROOM_OCCUPANCY_SQL} WHERE id = $1`, [id(req.params.id)]);
    const room = rows[0];
    if (!room) throw HttpError(404, 'Room not found');

    const occupants = await query(
      `SELECT a.id AS allocation_id, a.allocated_at, a.released_at,
              o.id, o.full_name, o.occupant_code, o.gender, o.phone, o.email,
              o.department, o.course
       FROM room_allocations a
       JOIN occupants o ON o.id = a.occupant_id
       WHERE a.room_id = $1 AND a.released_at IS NULL
       ORDER BY a.allocated_at, o.full_name`,
      [id(req.params.id)]
    );

    res.json({ ...decorateRoom(room), occupants: occupants.rows });
  } catch (err) {
    next(err);
  }
});

// Add room
router.post('/rooms', async (req, res, next) => {
  try {
    const { room_number, building_id, floor_id, room_type, capacity, gender, amenities } = req.body || {};
    if (!room_number?.trim() || !building_id || !floor_id) {
      throw HttpError(400, 'Room number, building and floor are required');
    }
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 20) {
      throw HttpError(400, 'Capacity must be between 1 and 20');
    }
    if (room_type && !ROOM_TYPES.includes(room_type)) throw HttpError(400, 'Invalid room type');

    const result = await withTransaction(async (client) => {
      const floorCheck = await client.query(
        `SELECT building_id FROM floors WHERE id = $1`,
        [id(floor_id)]
      );
      if (!floorCheck.rows[0]) throw HttpError(400, 'Floor does not exist');
      if (floorCheck.rows[0].building_id !== id(building_id)) {
        throw HttpError(400, 'Floor does not belong to the selected building');
      }
      const { rows } = await client.query(
        `INSERT INTO rooms (room_number, building_id, floor_id, room_type, capacity, gender, amenities)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          room_number.trim().toUpperCase(), id(building_id), id(floor_id),
          room_type || 'Four Sharing', cap, gender || 'any',
          Array.isArray(amenities) ? amenities : [],
        ]
      );
      return rows[0].id;
    });

    const { rows } = await query(`${ROOM_OCCUPANCY_SQL} WHERE id = $1`, [result]);
    res.status(201).json(decorateRoom(rows[0]));
  } catch (err) {
    if (err.code === '23505') return next(HttpError(409, 'That room number already exists in this building'));
    next(err);
  }
});

// Edit room (capacity cannot drop below current occupants)
router.put('/rooms/:id', async (req, res, next) => {
  try {
    const roomId = id(req.params.id);
    const { room_number, building_id, floor_id, room_type, capacity, gender, amenities } = req.body || {};
    if (!room_number?.trim()) throw HttpError(400, 'Room number is required');
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 20) throw HttpError(400, 'Capacity must be between 1 and 20');
    if (room_type && !ROOM_TYPES.includes(room_type)) throw HttpError(400, 'Invalid room type');

    await withTransaction(async (client) => {
      const occ = await client.query(
        `SELECT COUNT(*)::int AS n FROM room_allocations WHERE room_id = $1 AND released_at IS NULL`,
        [roomId]
      );
      const occupied = occ.rows[0].n;
      if (cap < occupied) {
        throw HttpError(400, `Cannot set capacity to ${cap}: room already has ${occupied} occupant(s). Remove occupants first.`);
      }
      const { rows } = await client.query(
        `UPDATE rooms SET room_number=$1, building_id=$2, floor_id=$3, room_type=$4, capacity=$5, gender=$6, amenities=$7
         WHERE id = $8 RETURNING id`,
        [
          room_number.trim().toUpperCase(), id(building_id), id(floor_id),
          room_type || 'Four Sharing', cap, gender || 'any',
          Array.isArray(amenities) ? amenities : [], roomId,
        ]
      );
      if (!rows[0]) throw HttpError(404, 'Room not found');
    });

    const { rows } = await query(`${ROOM_OCCUPANCY_SQL} WHERE id = $1`, [roomId]);
    res.json(decorateRoom(rows[0]));
  } catch (err) {
    if (err.code === '23505') return next(HttpError(409, 'That room number already exists in this building'));
    next(err);
  }
});

// Delete room (blocked when occupied)
router.delete('/rooms/:id', async (req, res, next) => {
  try {
    const roomId = id(req.params.id);
    const occ = await query(
      `SELECT COUNT(*)::int AS n FROM room_allocations WHERE room_id = $1 AND released_at IS NULL`,
      [roomId]
    );
    if (occ.rows[0].n > 0) {
      throw HttpError(409, `Cannot delete: room has ${occ.rows[0].n} active occupant(s). Remove them first.`);
    }
    const { rows } = await query(`DELETE FROM rooms WHERE id = $1 RETURNING id`, [roomId]);
    if (!rows[0]) throw HttpError(404, 'Room not found');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export { ROOM_TYPES };
export default router;
