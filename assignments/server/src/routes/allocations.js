import { Router } from 'express';
import { query, withTransaction, HttpError, id } from '../common.js';

const router = Router();

// List allocations (active by default)
router.get('/allocations', async (req, res, next) => {
  try {
    const { roomId, occupantId, active = 'true', limit = 50 } = req.query;
    const params = [];
    const where = [];

    if (roomId) { params.push(id(roomId)); where.push(`a.room_id = $${params.length}`); }
    if (occupantId) { params.push(id(occupantId)); where.push(`a.occupant_id = $${params.length}`); }
    if (active === 'true') where.push('a.released_at IS NULL');
    if (active === 'false') where.push('a.released_at IS NOT NULL');

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT a.*, o.full_name, o.occupant_code, o.gender, o.department,
              r.room_number, r.capacity, b.name AS building_name, f.floor_number
       FROM room_allocations a
       JOIN occupants o ON o.id = a.occupant_id
       JOIN rooms r ON r.id = a.room_id
       JOIN buildings b ON b.id = r.building_id
       JOIN floors f ON f.id = r.floor_id
       ${whereSql}
       ORDER BY a.created_at DESC
       LIMIT ${Math.min(Number(limit) || 50, 200)}`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * Allocate an occupant to a room.
 * Validates: room exists, room not full, occupant not already allocated,
 * gender restriction. Runs in a transaction with a row lock so two
 * simultaneous requests can't overfill a room.
 */
router.post('/allocations', async (req, res, next) => {
  try {
    const { occupant_id, room_id, allocated_at } = req.body || {};
    if (!occupant_id || !room_id) throw HttpError(400, 'Occupant and room are required');

    const allocationId = await withTransaction(async (client) => {
      const roomRes = await client.query(
        `SELECT r.*, COALESCE(o.occupied, 0)::int AS occupied, b.name AS building_name
         FROM rooms r
         JOIN buildings b ON b.id = r.building_id
         LEFT JOIN (
           SELECT room_id, COUNT(*) AS occupied FROM room_allocations
           WHERE released_at IS NULL GROUP BY room_id
         ) o ON o.room_id = r.id
         WHERE r.id = $1 FOR UPDATE`,
        [id(room_id)]
      );
      const room = roomRes.rows[0];
      if (!room) throw HttpError(404, 'Room not found');

      const occRes = await client.query(`SELECT * FROM occupants WHERE id = $1 FOR UPDATE`, [id(occupant_id)]);
      const occupant = occRes.rows[0];
      if (!occupant) throw HttpError(404, 'Occupant not found');

      if (room.occupied >= room.capacity) {
        throw HttpError(409, `Room ${room.room_number} is full (${room.capacity}/${room.capacity}). Choose another room.`);
      }

      const dup = await client.query(
        `SELECT a.id, r.room_number FROM room_allocations a
         JOIN rooms r ON r.id = a.room_id
         WHERE a.occupant_id = $1 AND a.released_at IS NULL`,
        [occupant.id]
      );
      if (dup.rows[0]) {
        throw HttpError(409, `${occupant.full_name} is already allocated to room ${dup.rows[0].room_number}. Remove that allocation first.`);
      }

      if (room.gender !== 'any' && occupant.gender !== room.gender) {
        throw HttpError(409, `Room ${room.room_number} is restricted to ${room.gender} occupants.`);
      }

      const ins = await client.query(
        `INSERT INTO room_allocations (room_id, occupant_id, allocated_at, allocated_by)
         VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4) RETURNING *`,
        [room.id, occupant.id, allocated_at || null, req.body.allocated_by || null]
      );

      return { id: ins.rows[0].id, room };
    });

    const { rows } = await query(
      `SELECT a.*, o.full_name, o.occupant_code, r.room_number
       FROM room_allocations a
       JOIN occupants o ON o.id = a.occupant_id
       JOIN rooms r ON r.id = a.room_id
       WHERE a.id = $1`,
      [allocationId.id]
    );
    const stats = await query(
      `SELECT capacity, occupied, available, status FROM room_occupancy WHERE id = $1`,
      [allocationId.room.id]
    );
    res.status(201).json({ allocation: rows[0], room: stats.rows[0] });
  } catch (err) {
    if (err.code === '23505') return next(HttpError(409, 'This occupant already has an active room allocation'));
    next(err);
  }
});

// Release (remove occupant from room)
router.delete('/allocations/:id', async (req, res, next) => {
  try {
    const releaseId = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE room_allocations SET released_at = CURRENT_DATE
         WHERE id = $1 AND released_at IS NULL
         RETURNING id, room_id`,
        [id(req.params.id)]
      );
      if (!rows[0]) throw HttpError(404, 'Active allocation not found');
      return rows[0];
    });

    const stats = await query(
      `SELECT capacity, occupied, available, status FROM room_occupancy WHERE id = $1`,
      [releaseId.room_id]
    );
    res.json({ ok: true, room: stats.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
