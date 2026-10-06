/**
 * Seed the database with realistic sample data.
 * Deterministic (seeded PRNG) so numbers are reproducible:
 *   100 rooms / 400 beds / 327 occupied -> 81.75% occupancy.
 */
import { pool, query } from './db.js';
import { applySchema } from './common.js';

// --- tiny deterministic PRNG -------------------------------------------------
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(42);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));

const TARGET_OCCUPIED = 327;

// --- name pools --------------------------------------------------------------
const MALE_FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Reyansh', 'Krishna', 'Ishaan', 'Shaurya', 'Atharv', 'Advik',
  'Kabir', 'Ansh', 'Dhruv', 'Rudra', 'Aryan', 'Kian', 'Darsh', 'Veer', 'Samar', 'Parth',
  'Rohan', 'Nikhil', 'Siddharth', 'Harsh', 'Yash', 'Karthik', 'Manish', 'Pranav', 'Sahil', 'Tanish'];
const FEMALE_FIRST = ['Aanya', 'Aadhya', 'Ananya', 'Diya', 'Ira', 'Myra', 'Sara', 'Pari', 'Anika', 'Navya',
  'Riya', 'Priya', 'Kavya', 'Shreya', 'Megha', 'Ishita', 'Tanvi', 'Sneha', 'Aditi', 'Pooja',
  'Neha', 'Simran', 'Divya', 'Swati', 'Payal', 'Ritika', 'Sakshi', 'Vidya', 'Lakshmi', 'Harini'];
const LAST = ['Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Gupta', 'Singh', 'Kumar', 'Joshi',
  'Mehta', 'Shah', 'Banerjee', 'Chatterjee', 'Das', 'Rao', 'Kulkarni', 'Desai', 'Chauhan', 'Mishra',
  'Pandey', 'Saxena', 'Kapoor', 'Malhotra', 'Bhatt', 'Ghosh', 'Menon', 'Pillai', 'Yadav', 'Thakur'];

const DEPTS = [
  { name: 'Computer Science & Engineering', code: 'CSE', courses: ['B.Tech CSE', 'B.Tech AI/ML', 'M.Tech CSE'] },
  { name: 'Electronics & Communication', code: 'ECE', courses: ['B.Tech ECE', 'M.Tech ECE'] },
  { name: 'Mechanical Engineering', code: 'ME', courses: ['B.Tech ME', 'M.Tech ME'] },
  { name: 'Civil Engineering', code: 'CE', courses: ['B.Tech CE'] },
  { name: 'Electrical Engineering', code: 'EE', courses: ['B.Tech EE'] },
  { name: 'Information Technology', code: 'IT', courses: ['B.Tech IT', 'BCA'] },
  { name: 'Business Administration', code: 'MBA', courses: ['MBA', 'PGDM'] },
  { name: 'Pharmacy', code: 'PHR', courses: ['B.Pharm', 'M.Pharm'] },
];

async function main() {
  console.log('Applying schema...');
  await applySchema();

  console.log('Clearing existing data...');
  await query(
    `TRUNCATE room_allocations, occupants, rooms, floors, buildings, admins, settings
     RESTART IDENTITY CASCADE`
  );

  // ---------------- Buildings ----------------
  console.log('Inserting buildings & floors...');
  const buildingsData = [
    { name: 'A-Block Boys Hostel', code: 'A', description: 'Main boys residence — 4 floors', gender: 'male' },
    { name: 'B-Block Girls Hostel', code: 'B', description: 'Main girls residence — 4 floors', gender: 'female' },
    { name: 'C-Block PG Residency', code: 'C', description: 'Post-graduate & research scholars — 2 floors', gender: 'any' },
  ];
  const buildingIds = {};
  for (const b of buildingsData) {
    const { rows } = await query(
      `INSERT INTO buildings (name, code, description) VALUES ($1, $2, $3) RETURNING id`,
      [b.name, b.code, b.description]
    );
    buildingIds[b.code] = rows[0].id;
  }

  const floorCounts = { A: 4, B: 4, C: 2 };
  const floorIds = {}; // `${building}-${n}` -> id
  for (const [code, count] of Object.entries(floorCounts)) {
    for (let n = 1; n <= count; n++) {
      const { rows } = await query(
        `INSERT INTO floors (building_id, floor_number, label) VALUES ($1, $2, $3) RETURNING id`,
        [buildingIds[code], n, n === 1 ? 'Ground Floor' : `Floor ${n}`]
      );
      floorIds[`${code}-${n}`] = rows[0].id;
    }
  }

  // ---------------- Rooms ----------------
  // Layout chosen to hit exactly 100 rooms / 400 beds:
  //   10 Single (C-1), 10 Triple (A-1), 60 Four (A 2-4, B 1-3), 20 Six (B-4, C-2)
  console.log('Inserting rooms...');
  const rooms = [];
  const addRooms = (building, floor, count, type, capacity, startNo) => {
    for (let i = 0; i < count; i++) {
      rooms.push({
        building,
        floor,
        number: `${building}-${startNo + i}`,
        type,
        capacity,
        floorId: floorIds[`${building}-${floor}`],
        buildingId: buildingIds[building],
      });
    }
  };

  addRooms('C', 1, 10, 'Single', 1, 101);
  addRooms('A', 1, 10, 'Triple Sharing', 3, 101);
  addRooms('A', 2, 10, 'Four Sharing', 4, 201);
  addRooms('A', 3, 10, 'Four Sharing', 4, 301);
  addRooms('A', 4, 10, 'Four Sharing', 4, 401);
  addRooms('B', 1, 10, 'Four Sharing', 4, 101);
  addRooms('B', 2, 10, 'Four Sharing', 4, 201);
  addRooms('B', 3, 10, 'Four Sharing', 4, 301);
  addRooms('B', 4, 10, 'Six Sharing', 6, 401);
  addRooms('C', 2, 10, 'Six Sharing', 6, 201);

  const genderByBuilding = { A: 'male', B: 'female', C: 'any' };
  const amenitiesPool = [
    ['Fan', 'Study Table', 'Wardrobe'],
    ['Fan', 'Study Table', 'Wardrobe', 'AC'],
    ['Fan', 'Study Table', 'Wardrobe', 'Attached Bath'],
    ['Fan', 'Study Table', 'Wardrobe', 'AC', 'Attached Bath', 'Balcony'],
  ];
  const roomIds = [];
  for (const r of rooms) {
    const { rows } = await query(
      `INSERT INTO rooms (room_number, building_id, floor_id, room_type, capacity, gender, amenities)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, capacity, gender`,
      [r.number, r.buildingId, r.floorId, r.type, r.capacity,
       genderByBuilding[r.building], pick(amenitiesPool)]
    );
    roomIds.push({ id: rows[0].id, capacity: rows[0].capacity, gender: rows[0].gender, number: r.number });
  }

  const totalCapacity = roomIds.reduce((s, r) => s + r.capacity, 0);
  console.log(`  ${roomIds.length} rooms, ${totalCapacity} beds`);

  // ---------------- Occupancy plan ----------------
  // Start with a realistic mix, then adjust to hit the target exactly.
  const plan = roomIds.map(() => {
    const roll = rnd();
    if (roll < 0.18) return 0;            // vacant
    if (roll < 0.8) return null;          // full (set below)
    return null;                          // partial (set below)
  });
  roomIds.forEach((r, i) => {
    const roll = rnd();
    if (plan[i] !== 0) {
      plan[i] = roll < 0.78 ? r.capacity : Math.min(int(1, r.capacity - 1) || 1, r.capacity);
    }
  });

  let sum = plan.reduce((s, n) => s + n, 0);
  // Adjust to exactly TARGET_OCCUPIED
  let guard = 0;
  while (sum !== TARGET_OCCUPIED && guard++ < 100000) {
    if (sum < TARGET_OCCUPIED) {
      // top up: prefer partial rooms, then vacant
      let idx = plan.findIndex((n, i) => n > 0 && n < roomIds[i].capacity);
      if (idx === -1) idx = plan.findIndex((n) => n === 0);
      if (idx === -1) break;
      plan[idx] += 1;
      sum += 1;
    } else {
      // trim: prefer full rooms -> partial, then partial -> smaller
      let idx = plan.findIndex((n, i) => n === roomIds[i].capacity);
      if (idx === -1) idx = plan.findIndex((n, i) => n > 1);
      if (idx === -1) idx = plan.findIndex((n) => n === 1);
      if (idx === -1) break;
      plan[idx] -= 1;
      sum -= 1;
    }
  }
  console.log(`  target occupancy: ${sum}/${totalCapacity}`);

  // ---------------- Occupants ----------------
  console.log('Inserting occupants & allocations...');
  const totalOccupantsToCreate = sum + 25; // a few unallocated for the allocation screen
  const usedCodes = new Set();

  const occupants = [];
  for (let i = 0; i < totalOccupantsToCreate; i++) {
    const gender = rnd() < 0.05 ? 'other' : i % 2 === 0 ? 'male' : 'female';
    const first = gender === 'female' ? pick(FEMALE_FIRST) : pick(MALE_FIRST);
    const last = pick(LAST);
    const dept = pick(DEPTS);
    let code;
    do {
      code = `${pick(['22', '23', '24', '25'])}${dept.code}${String(int(1, 999)).padStart(4, '0')}`;
    } while (usedCodes.has(code));
    usedCodes.add(code);

    const phone = `9${String(int(100000000, 999999999)).slice(0, 9)}`;
    occupants.push({
      full_name: `${first} ${last}`,
      occupant_code: code,
      gender,
      phone,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@campus.edu`,
      department: dept.name,
      course: pick(dept.courses),
      emergency_contact: `9${String(int(100000000, 999999999)).slice(0, 9)}`,
    });
  }

  // Insert occupants
  const occupantIds = [];
  for (const o of occupants) {
    const { rows } = await query(
      `INSERT INTO occupants (full_name, occupant_code, gender, phone, email, department, course, emergency_contact)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, gender`,
      [o.full_name, o.occupant_code, o.gender,
       o.phone, o.email, o.department, o.course, o.emergency_contact]
    );
    occupantIds.push({ id: rows[0].id, gender: rows[0].gender });
  }

  // ---------------- Allocations ----------------
  // Walk rooms in a shuffled order, filling each to its planned occupancy.
  const order = roomIds.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const genderPool = { male: [], female: [], other: [] };
  occupantIds.forEach((o) => genderPool[o.gender]?.push(o));

  let allocated = 0;
  const startOfTerm = new Date('2026-07-01');
  const today = new Date('2026-09-22');

  for (const roomIdx of order) {
    const room = roomIds[roomIdx];
    const want = plan[roomIdx];
    for (let k = 0; k < want; k++) {
      // pick a compatible, unallocated occupant
      let pool = genderPool.male, key = 'male';
      if (room.gender === 'female') { pool = genderPool.female; key = 'female'; }
      else if (room.gender === 'male') { pool = genderPool.male; key = 'male'; }
      else {
        pool = genderPool.male.length >= genderPool.female.length ? genderPool.female : genderPool.male;
        key = pool === genderPool.female ? 'female' : 'male';
      }
      if (!pool.length) { pool = genderPool.male.length ? genderPool.male : genderPool.female; key = pool === genderPool.male ? 'male' : 'female'; }
      if (!pool.length) break;
      const occ = pool.pop();
      allocated++;
      if (allocated > sum) break;

      const daysAgo = int(0, 82);
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      const allocatedAt = d < startOfTerm ? new Date(startOfTerm) : d;
      await query(
        `INSERT INTO room_allocations (room_id, occupant_id, allocated_at) VALUES ($1, $2, $3)`,
        [room.id, occ.id, allocatedAt.toISOString().slice(0, 10)]
      );
    }
    if (allocated >= sum) break;
  }
  console.log(`  ${allocated} active allocations created`);

  // ---------------- Admins & settings ----------------
  await query(
    `INSERT INTO admins (name, email, role, password_hash) VALUES
     ('Priya Menon', 'priya.menon@campus.edu', 'superadmin', 'changeme'),
     ('Rahul Sharma', 'rahul.sharma@campus.edu', 'warden', 'changeme'),
     ('Anil Kumar', 'anil.kumar@campus.edu', 'admin', 'changeme')`
  );

  const settings = {
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
  for (const [key, value] of Object.entries(settings)) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(value)]
    );
  }

  const verify = await query(`
    SELECT (SELECT COUNT(*) FROM rooms) AS rooms,
           (SELECT COALESCE(SUM(capacity),0) FROM rooms) AS capacity,
           (SELECT COUNT(*) FROM room_allocations WHERE released_at IS NULL) AS occupied,
           (SELECT COUNT(*) FROM occupants) AS occupants
  `);
  const v = verify.rows[0];
  console.log(`Done. rooms=${v.rooms} capacity=${v.capacity} occupied=${v.occupied} occupants=${v.occupants}`);
  console.log(`Occupancy: ${((v.occupied / v.capacity) * 100).toFixed(2)}%`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
