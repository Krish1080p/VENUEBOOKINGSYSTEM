require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
const SECRET = process.env.JWT_SECRET || 'dev-secret';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- auth middleware ---------- */
const auth = (role) => (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    req.user = jwt.verify(token, SECRET);
  } catch { return next(new HttpError(401, 'Please log in')); }
  if (role && req.user.role !== role) return next(new HttpError(403, `Only ${role}s can do this`));
  next();
};
const sign = (u) => jwt.sign({ id: u.id, role: u.role, name: u.name }, SECRET, { expiresIn: '7d' });

/* ---------- transaction helper ---------- */
async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}

/* ---------- auth routes ---------- */
app.post('/api/auth/register', wrap(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || password.length < 6) throw new HttpError(400, 'Name, email and a password of 6+ characters are required');
  if (!['organizer', 'owner'].includes(role)) throw new HttpError(400, 'Role must be organizer or owner');
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows: [u] } = await pool.query(
      'INSERT INTO users(name,email,password_hash,role) VALUES($1,lower($2),$3,$4) RETURNING id,name,role', [name, email, hash, role]);
    res.status(201).json({ token: sign(u), user: u });
  } catch (e) { if (e.code === '23505') throw new HttpError(409, 'Email already registered'); throw e; }
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  const { rows: [u] } = await pool.query('SELECT * FROM users WHERE email=lower($1)', [email || '']);
  if (!u || !(await bcrypt.compare(password || '', u.password_hash))) throw new HttpError(401, 'Invalid email or password');
  res.json({ token: sign(u), user: { id: u.id, name: u.name, role: u.role } });
}));

/* ---------- venues ---------- */
app.get('/api/venues', wrap(async (req, res) => {
  const { q, city, minCapacity, maxPrice, amenity } = req.query;
  const where = [], p = [];
  if (q) { p.push(`%${q}%`); where.push(`(name ILIKE $${p.length} OR description ILIKE $${p.length})`); }
  if (city) { p.push(`%${city}%`); where.push(`city ILIKE $${p.length}`); }
  if (minCapacity) { p.push(+minCapacity); where.push(`capacity >= $${p.length}`); }
  if (maxPrice) { p.push(+maxPrice); where.push(`price <= $${p.length}`); }
  if (amenity) { p.push(amenity); where.push(`EXISTS (SELECT 1 FROM unnest(amenities) a WHERE a ILIKE $${p.length})`); }
  const { rows } = await pool.query(
    `SELECT * FROM venues ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`, p);
  res.json(rows);
}));

app.get('/api/venues/:id', wrap(async (req, res) => {
  const { rows: [v] } = await pool.query('SELECT * FROM venues WHERE id=$1', [req.params.id]);
  if (!v) throw new HttpError(404, 'Venue not found');
  const { rows: slots } = await pool.query(
    `SELECT id,label,to_char(start_time,'HH24:MI') AS "start",to_char(end_time,'HH24:MI') AS "end"
     FROM venue_slots WHERE venue_id=$1 ORDER BY start_time`, [v.id]);
  res.json({ ...v, slots });
}));

// Confirmed bookings in a date range -> drives the live availability calendar.
app.get('/api/venues/:id/availability', wrap(async (req, res) => {
  const { from, to } = req.query;
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) throw new HttpError(400, 'from/to must be YYYY-MM-DD');
  const { rows } = await pool.query(
    `SELECT b.slot_id AS "slotId", b.booking_date::text AS date,
            to_char(b.starts_at,'HH24:MI') AS "start", to_char(b.ends_at,'HH24:MI') AS "end"
     FROM bookings b WHERE b.venue_id=$1 AND b.status='confirmed' AND b.booking_date BETWEEN $2 AND $3`,
    [req.params.id, from, to]);
  res.json(rows);
}));

app.post('/api/venues', auth('owner'), wrap(async (req, res) => {
  const { name, description = '', city, address = '', capacity, price, amenities = [] } = req.body;
  if (!name || !city || !(capacity > 0) || !(price >= 0)) throw new HttpError(400, 'Name, city, capacity and price are required');
  const list = Array.isArray(amenities) ? amenities : String(amenities).split(',').map((s) => s.trim()).filter(Boolean);
  const { rows: [v] } = await pool.query(
    'INSERT INTO venues(owner_id,name,description,city,address,capacity,price,amenities) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [req.user.id, name, description, city, address, capacity, price, list]);
  res.status(201).json(v);
}));

app.post('/api/venues/:id/slots', auth('owner'), wrap(async (req, res) => {
  const { label, start, end } = req.body;
  if (!label || !start || !end || end <= start) throw new HttpError(400, 'Label, start and a later end time are required');
  const { rows: [v] } = await pool.query('SELECT 1 FROM venues WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
  if (!v) throw new HttpError(404, 'Venue not found');
  try {
    const { rows: [s] } = await pool.query(
      'INSERT INTO venue_slots(venue_id,label,start_time,end_time) VALUES($1,$2,$3,$4) RETURNING id', [req.params.id, label, start, end]);
    res.status(201).json(s);
  } catch (e) { if (e.code === '23505') throw new HttpError(409, 'That time slot already exists'); throw e; }
}));

app.get('/api/owner/venues', auth('owner'), wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM venues WHERE owner_id=$1 ORDER BY id DESC', [req.user.id]);
  res.json(rows);
}));

app.get('/api/owner/bookings', auth('owner'), wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.id, b.booking_date::text AS date, b.status, b.fee, b.created_at, v.name AS venue, u.name AS organizer,
            s.label AS slot, to_char(s.start_time,'HH24:MI') AS "start", to_char(s.end_time,'HH24:MI') AS "end"
     FROM bookings b JOIN venues v ON v.id=b.venue_id JOIN users u ON u.id=b.organizer_id JOIN venue_slots s ON s.id=b.slot_id
     WHERE v.owner_id=$1 AND b.booking_date >= CURRENT_DATE ORDER BY b.booking_date, s.start_time`, [req.user.id]);
  res.json(rows);
}));

/* ---------- bookings (the concurrency-critical part) ---------- */

/**
 * Atomically claim a slot. Three layers of protection:
 *  1. SELECT ... FOR UPDATE on the venue row: concurrent requests for the same venue queue up
 *     here, so the second one only proceeds after the first has committed.
 *  2. The INSERT/UPDATE below is then evaluated against already-committed data.
 *  3. The EXCLUDE constraint (and unique index) in the DB reject any overlap even if (1) were bypassed;
 *     Postgres raises 23P01/23505, which the error handler converts into HTTP 409.
 */
async function claimSlot(client, { bookingId, venueId, slotId, date, organizerId }) {
  await client.query('SELECT id FROM venues WHERE id=$1 FOR UPDATE', [venueId]);

  // Application-level overlap check (gives a clean message; the constraint is the real guarantee).
  const { rows: clash } = await client.query(
    `SELECT 1 FROM venue_slots s JOIN bookings b ON b.venue_id=s.venue_id AND b.status='confirmed'
     WHERE s.id=$1 AND b.booking_date=$2::date AND ($3::int IS NULL OR b.id<>$3)
       AND tsrange(b.starts_at,b.ends_at) && tsrange($2::date+s.start_time,$2::date+s.end_time) LIMIT 1`,
    [slotId, date, bookingId || null]);
  if (clash.length) throw new HttpError(409, 'Sorry, this slot is no longer available.');

  if (bookingId) {
    const { rows } = await client.query(
      `UPDATE bookings b SET slot_id=s.id, booking_date=$2::date, starts_at=$2::date+s.start_time, ends_at=$2::date+s.end_time
       FROM venue_slots s WHERE b.id=$1 AND s.id=$3 AND s.venue_id=b.venue_id AND $2::date>=CURRENT_DATE RETURNING b.*`,
      [bookingId, date, slotId]);
    if (!rows.length) throw new HttpError(400, 'Invalid slot or date in the past');
    return rows[0];
  }
  const { rows } = await client.query(
    `INSERT INTO bookings(venue_id,slot_id,organizer_id,booking_date,starts_at,ends_at,fee)
     SELECT v.id,s.id,$4,$3::date,$3::date+s.start_time,$3::date+s.end_time,v.price
     FROM venue_slots s JOIN venues v ON v.id=s.venue_id
     WHERE s.id=$2 AND v.id=$1 AND $3::date>=CURRENT_DATE RETURNING *`,
    [venueId, slotId, date, organizerId]);
  if (!rows.length) throw new HttpError(400, 'Invalid slot or date in the past');
  return rows[0];
}

app.post('/api/bookings', auth('organizer'), wrap(async (req, res) => {
  const { venueId, slotId, date } = req.body;
  if (!venueId || !slotId || !DATE_RE.test(date || '')) throw new HttpError(400, 'venueId, slotId and date (YYYY-MM-DD) are required');
  // Payment is simulated: the fee is recorded as paid once the slot is successfully held.
  const booking = await withTx((c) => claimSlot(c, { venueId, slotId, date, organizerId: req.user.id }));
  res.status(201).json(booking);
}));

app.get('/api/bookings/mine', auth('organizer'), wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.id, b.venue_id AS "venueId", b.slot_id AS "slotId", b.booking_date::text AS date, b.status, b.fee, b.created_at,
            v.name AS venue, v.city, s.label AS slot, to_char(s.start_time,'HH24:MI') AS "start", to_char(s.end_time,'HH24:MI') AS "end"
     FROM bookings b JOIN venues v ON v.id=b.venue_id JOIN venue_slots s ON s.id=b.slot_id
     WHERE b.organizer_id=$1 ORDER BY b.booking_date DESC, s.start_time`, [req.user.id]);
  res.json(rows);
}));

// Modify (reschedule) a booking: runs through the same locking path.
app.put('/api/bookings/:id', auth('organizer'), wrap(async (req, res) => {
  const { slotId, date } = req.body;
  if (!slotId || !DATE_RE.test(date || '')) throw new HttpError(400, 'slotId and date are required');
  const booking = await withTx(async (c) => {
    const { rows: [b] } = await c.query(
      "SELECT * FROM bookings WHERE id=$1 AND organizer_id=$2 AND status='confirmed'", [req.params.id, req.user.id]);
    if (!b) throw new HttpError(404, 'Booking not found');
    return claimSlot(c, { bookingId: b.id, venueId: b.venue_id, slotId, date, organizerId: req.user.id });
  });
  res.json(booking);
}));

app.delete('/api/bookings/:id', auth('organizer'), wrap(async (req, res) => {
  const { rowCount } = await pool.query(
    "UPDATE bookings SET status='cancelled', cancelled_at=now() WHERE id=$1 AND organizer_id=$2 AND status='confirmed'",
    [req.params.id, req.user.id]);
  if (!rowCount) throw new HttpError(404, 'Booking not found');
  res.json({ ok: true });
}));

/* ---------- error handler ---------- */
app.use((err, req, res, next) => {
  // DB-level conflicts (exclusion / unique violation) => the slot was taken by someone else.
  if (err.code === '23P01' || (err.code === '23505' && /uq_confirmed_slot_date/.test(err.constraint || '')))
    return res.status(409).json({ error: 'Sorry, this slot is no longer available.' });
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
