-- ============================================================
-- Room Allocation & Occupancy Management System - Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT 'changeme',
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'warden', 'superadmin')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buildings (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  code        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS floors (
  id           SERIAL PRIMARY KEY,
  building_id  INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  floor_number INTEGER NOT NULL,
  label        TEXT,
  UNIQUE (building_id, floor_number)
);

CREATE TABLE IF NOT EXISTS rooms (
  id          SERIAL PRIMARY KEY,
  room_number TEXT NOT NULL,
  building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  floor_id    INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  room_type   TEXT NOT NULL DEFAULT 'Four Sharing'
              CHECK (room_type IN ('Single', 'Double Sharing', 'Triple Sharing', 'Four Sharing', 'Six Sharing')),
  capacity    INTEGER NOT NULL CHECK (capacity > 0),
  gender      TEXT NOT NULL DEFAULT 'any' CHECK (gender IN ('any', 'male', 'female')),
  amenities   TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (building_id, room_number)
);
CREATE INDEX IF NOT EXISTS idx_rooms_building ON rooms(building_id);
CREATE INDEX IF NOT EXISTS idx_rooms_floor ON rooms(floor_id);

CREATE TABLE IF NOT EXISTS occupants (
  id               SERIAL PRIMARY KEY,
  full_name        TEXT NOT NULL,
  occupant_code    TEXT NOT NULL UNIQUE,           -- roll number / staff ID
  gender           TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  phone            TEXT,
  email            TEXT,
  department       TEXT,
  course           TEXT,
  emergency_contact TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_occupants_name ON occupants(full_name);

-- Allocation history: released_at IS NULL means the occupant currently lives in the room
CREATE TABLE IF NOT EXISTS room_allocations (
  id          SERIAL PRIMARY KEY,
  room_id     INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  occupant_id INTEGER NOT NULL REFERENCES occupants(id) ON DELETE CASCADE,
  allocated_at DATE NOT NULL DEFAULT CURRENT_DATE,
  released_at  DATE,
  allocated_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- An occupant can only hold ONE active room at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_occupant
  ON room_allocations(occupant_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_alloc_room ON room_allocations(room_id);
CREATE INDEX IF NOT EXISTS idx_alloc_dates ON room_allocations(allocated_at, released_at);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Convenience view: rooms with live occupancy counts
CREATE OR REPLACE VIEW room_occupancy AS
SELECT r.id,
       r.room_number,
       r.building_id,
       r.floor_id,
       r.room_type,
       r.capacity,
       r.gender,
       r.amenities,
       f.floor_number,
       b.name  AS building_name,
       b.code  AS building_code,
       COALESCE(o.occupied, 0)::INTEGER AS occupied,
       (r.capacity - COALESCE(o.occupied, 0))::INTEGER AS available,
       CASE
         WHEN COALESCE(o.occupied, 0) = 0 THEN 'vacant'
         WHEN COALESCE(o.occupied, 0) >= r.capacity THEN 'full'
         ELSE 'partial'
       END AS status
FROM rooms r
JOIN floors f ON f.id = r.floor_id
JOIN buildings b ON b.id = r.building_id
LEFT JOIN (
  SELECT room_id, COUNT(*) AS occupied
  FROM room_allocations
  WHERE released_at IS NULL
  GROUP BY room_id
) o ON o.room_id = r.id;
