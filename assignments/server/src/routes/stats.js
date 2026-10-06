import { Router } from 'express';
import { query, HttpError } from '../common.js';

const router = Router();

/**
 * Aggregate statistics computed live from rooms + active allocations.
 */
router.get('/stats', async (_req, res, next) => {
  try {
    const { rows } = await query(`
      WITH occ AS (SELECT * FROM room_occupancy)
      SELECT
        COUNT(*)::int                                            AS total_rooms,
        COUNT(*) FILTER (WHERE status = 'vacant')::int           AS vacant_rooms,
        COUNT(*) FILTER (WHERE status = 'partial')::int          AS partial_rooms,
        COUNT(*) FILTER (WHERE status = 'full')::int             AS full_rooms,
        COALESCE(SUM(capacity), 0)::int                          AS total_capacity,
        COALESCE(SUM(occupied), 0)::int                          AS occupied_beds,
        COALESCE(SUM(available), 0)::int                         AS available_beds,
        COUNT(DISTINCT building_id)::int                         AS total_buildings,
        COUNT(DISTINCT floor_id)::int                            AS total_floors
      FROM occ
    `);

    const alloc = await query(`
      SELECT
        COUNT(*) FILTER (WHERE a.released_at IS NULL)::int AS current_occupants,
        COUNT(*) FILTER (WHERE a.allocated_at >= date_trunc('month', CURRENT_DATE))::int AS new_this_month,
        COUNT(*)::int AS total_allocations
      FROM room_allocations a
    `);

    const unallocated = await query(`
      SELECT COUNT(*)::int AS n FROM occupants o
      WHERE NOT EXISTS (
        SELECT 1 FROM room_allocations a
        WHERE a.occupant_id = o.id AND a.released_at IS NULL
      )
    `);

    const recent = await query(`
      SELECT a.id, a.allocated_at, a.released_at,
             o.full_name, o.occupant_code, o.gender,
             r.room_number, r.capacity, b.name AS building_name
      FROM room_allocations a
      JOIN occupants o ON o.id = a.occupant_id
      JOIN rooms r ON r.id = a.room_id
      JOIN buildings b ON b.id = r.building_id
      WHERE a.released_at IS NULL
      ORDER BY a.created_at DESC
      LIMIT 8
    `);

    const s = rows[0];
    const occupancy_rate = s.total_capacity
      ? Number(((s.occupied_beds / s.total_capacity) * 100).toFixed(2))
      : 0;

    res.json({
      total_rooms: s.total_rooms,
      vacant_rooms: s.vacant_rooms,
      partial_rooms: s.partial_rooms,
      full_rooms: s.full_rooms,
      available_rooms: s.vacant_rooms + s.partial_rooms, // rooms with >= 1 free bed
      occupied_rooms: s.partial_rooms + s.full_rooms,    // rooms with >= 1 occupant
      total_capacity: s.total_capacity,
      occupied_beds: s.occupied_beds,
      available_beds: s.available_beds,
      occupancy_rate,
      total_buildings: s.total_buildings,
      total_floors: s.total_floors,
      current_occupants: alloc.rows[0].current_occupants,
      new_this_month: alloc.rows[0].new_this_month,
      total_allocations: alloc.rows[0].total_allocations,
      unallocated_occupants: unallocated.rows[0].n,
      recent_allocations: recent.rows,
      room_status: [
        { key: 'full', label: 'Occupied', value: s.full_rooms },
        { key: 'partial', label: 'Partially Occupied', value: s.partial_rooms },
        { key: 'vacant', label: 'Available', value: s.vacant_rooms },
      ],
      bed_status: [
        { key: 'occupied', label: 'Occupied Beds', value: s.occupied_beds },
        { key: 'available', label: 'Available Beds', value: s.available_beds },
      ],
    });
  } catch (err) {
    next(err);
  }
});

/** Building-wise occupancy (used by dashboard + reports). */
router.get('/stats/buildings', async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT b.id, b.name, b.code,
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
      LEFT JOIN room_occupancy r ON r.building_id = b.id
      GROUP BY b.id
      ORDER BY b.name
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** Floor-wise occupancy, optionally scoped to a building. */
router.get('/stats/floors', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.query.buildingId) {
      params.push(Number(req.query.buildingId));
      where = 'WHERE r.building_id = $1';
    }
    const { rows } = await query(
      `SELECT f.id, f.floor_id AS floor_id, f.floor_number, f.building_id,
              b.name AS building_name, b.code AS building_code,
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

export default router;
