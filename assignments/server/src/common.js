import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool, query, withTransaction } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function applySchema() {
  const sql = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

/** Status of a room given its occupancy. */
export function statusOf(occupied, capacity) {
  if (occupied <= 0) return 'vacant';
  if (occupied >= capacity) return 'full';
  return 'partial';
}

export const STATUS_LABEL = {
  vacant: 'Vacant',
  partial: 'Partially Occupied',
  full: 'Fully Occupied',
};

/** Base SELECT that joins rooms with live occupancy numbers. */
export const ROOM_OCCUPANCY_SQL = `
  SELECT id, room_number, building_id, floor_id, room_type, capacity, gender, amenities,
         floor_number, building_name, building_code, occupied, available, status
  FROM room_occupancy
`;

export function decorateRoom(room) {
  return {
    ...room,
    capacity: Number(room.capacity),
    occupied: Number(room.occupied),
    available: Number(room.available),
    status_label: STATUS_LABEL[room.status],
  };
}

export const id = (v) => Number(v);

export const HttpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

export { query, withTransaction };
