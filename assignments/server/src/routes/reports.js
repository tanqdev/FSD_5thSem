import { Router } from 'express';
import { query, HttpError, id } from '../common.js';

const router = Router();

/**
 * Occupancy report.
 * Supports building filter and an as-of date: a bed counts as occupied on
 * `date` when the allocation started on/before it and was not released before it.
 */
router.get('/reports/occupancy', async (req, res, next) => {
  try {
    const { buildingId, date, from, to } = req.query;
    const params = [];
    const buildingFilter = [];

    if (buildingId) {
      params.push(id(buildingId));
      buildingFilter.push(`b.id = $${params.length}`);
    }
    const bWhere = buildingFilter.length ? `AND ${buildingFilter.join(' AND ')}` : '';

    // As-of date (defaults to today)
    const asOf = date || to || null;
    let allocJoin = '';
    if (asOf) {
      params.push(asOf);
      const p = `$${params.length}`;
      allocJoin = `AND a.allocated_at <= ${p}::date AND (a.released_at IS NULL OR a.released_at > ${p}::date)`;
    }

    // Optional "from" filter limits to allocations that started in the window
    let fromClause = '';
    if (from) {
      params.push(from);
      fromClause = `AND a.allocated_at >= $${params.length}::date`;
    }

    const totals = await query(
      `WITH scoped_rooms AS (
         SELECT r.id, r.capacity, b.id AS building_id
         FROM rooms r JOIN buildings b ON b.id = r.building_id
         WHERE TRUE ${bWhere}
       ),
       occ AS (
         SELECT a.room_id, COUNT(*)::int AS occupied
         FROM room_allocations a
         JOIN scoped_rooms sr ON sr.id = a.room_id
         WHERE a.released_at IS NULL
           ${allocJoin} ${fromClause}
         GROUP BY a.room_id
       ),
       room_stats AS (
         SELECT sr.id,
                sr.capacity,
                COALESCE(occ.occupied, 0) AS occupied,
                CASE WHEN COALESCE(occ.occupied, 0) = 0 THEN 'vacant'
                     WHEN COALESCE(occ.occupied, 0) >= sr.capacity THEN 'full'
                     ELSE 'partial' END AS status
         FROM scoped_rooms sr
         LEFT JOIN occ ON occ.room_id = sr.id
       )
       SELECT COUNT(*)::int AS total_rooms,
              COUNT(*) FILTER (WHERE status = 'vacant')::int AS vacant_rooms,
              COUNT(*) FILTER (WHERE status = 'partial')::int AS partial_rooms,
              COUNT(*) FILTER (WHERE status = 'full')::int AS full_rooms,
              COALESCE(SUM(capacity), 0)::int AS total_capacity,
              COALESCE(SUM(occupied), 0)::int AS occupied_beds,
              COALESCE(SUM(capacity - occupied), 0)::int AS available_beds
       FROM room_stats`,
      params
    );

    const t = totals.rows[0];

    const byBuilding = await query(
      `SELECT b.id, b.name, b.code,
              COUNT(r.id)::int AS total_rooms,
              COALESCE(SUM(r.capacity), 0)::int AS total_capacity,
              COUNT(r.id) FILTER (WHERE r.status = 'full')::int AS full_rooms,
              COUNT(r.id) FILTER (WHERE r.status = 'partial')::int AS partial_rooms,
              COUNT(r.id) FILTER (WHERE r.status = 'vacant')::int AS vacant_rooms,
              COALESCE(SUM(r.occupied), 0)::int AS occupied_beds,
              COALESCE(SUM(r.available), 0)::int AS available_beds,
              CASE WHEN COALESCE(SUM(r.capacity), 0) = 0 THEN 0
                   ELSE ROUND(SUM(r.occupied)::numeric / SUM(r.capacity) * 100, 2)::float END AS occupancy_rate
       FROM buildings b
       LEFT JOIN room_occupancy r ON r.building_id = b.id
       WHERE TRUE ${bWhere}
       GROUP BY b.id ORDER BY b.name`,
      buildingId ? params.slice(0, 1) : []
    );

    const byFloor = await query(
      `SELECT f.id, f.floor_number, b.name AS building_name, b.code AS building_code,
              COUNT(r.id)::int AS total_rooms,
              COALESCE(SUM(r.capacity), 0)::int AS total_capacity,
              COUNT(r.id) FILTER (WHERE r.status = 'full')::int AS full_rooms,
              COUNT(r.id) FILTER (WHERE r.status = 'partial')::int AS partial_rooms,
              COUNT(r.id) FILTER (WHERE r.status = 'vacant')::int AS vacant_rooms,
              COALESCE(SUM(r.occupied), 0)::int AS occupied_beds,
              COALESCE(SUM(r.available), 0)::int AS available_beds,
              CASE WHEN COALESCE(SUM(r.capacity), 0) = 0 THEN 0
                   ELSE ROUND(SUM(r.occupied)::numeric / SUM(r.capacity) * 100, 2)::float END AS occupancy_rate
       FROM floors f
       JOIN buildings b ON b.id = f.building_id
       LEFT JOIN room_occupancy r ON r.floor_id = f.id
       WHERE TRUE ${bWhere}
       GROUP BY f.id, b.name, b.code
       ORDER BY b.name, f.floor_number`,
      buildingId ? params.slice(0, 1) : []
    );

    const allocations = await query(
      `SELECT COUNT(*)::int AS n FROM room_allocations a
       JOIN rooms r ON r.id = a.room_id
       JOIN buildings b ON b.id = r.building_id
       WHERE TRUE ${bWhere} ${fromClause}
         ${asOf ? `AND a.allocated_at <= $${buildingId ? 2 : 1}::date` : ''}`,
      buildingId ? (asOf ? [id(buildingId), asOf] : [id(buildingId)]) : (asOf ? [asOf] : [])
    );

    res.json({
      filters: { buildingId: buildingId ? Number(buildingId) : null, date: asOf || null, from: from || null },
      totals: {
        ...t,
        occupancy_rate: t.total_capacity
          ? Number(((t.occupied_beds / t.total_capacity) * 100).toFixed(2))
          : 0,
        available_rooms: t.vacant_rooms + t.partial_rooms,
        occupied_rooms: t.partial_rooms + t.full_rooms,
        allocations_in_period: allocations.rows[0].n,
      },
      by_building: byBuilding.rows,
      by_floor: byFloor.rows,
    });
  } catch (err) {
    next(err);
  }
});

/** Occupancy trend: allocations active at the end of each of the last N days. */
router.get('/reports/trend', async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 180);
    const { rows } = await query(
      `SELECT d::date AS day,
              (SELECT COALESCE(SUM(r.capacity), 0) FROM rooms r) AS total_capacity,
              COUNT(*)::int AS occupied_beds
       FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, '1 day') d
       LEFT JOIN room_allocations a
         ON a.allocated_at <= d::date AND (a.released_at IS NULL OR a.released_at > d::date)
       GROUP BY d ORDER BY d`,
      [days]
    );
    res.json(
      rows.map((r) => ({
        day: r.day,
        total_capacity: Number(r.total_capacity),
        occupied_beds: Number(r.occupied_beds),
        occupancy_rate: r.total_capacity
          ? Number(((r.occupied_beds / r.total_capacity) * 100).toFixed(2))
          : 0,
      }))
    );
  } catch (err) {
    next(err);
  }
});

export default router;
