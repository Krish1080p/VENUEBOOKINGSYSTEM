-- Venue Booking System schema (PostgreSQL 12+)
-- Run: npm run migrate   (or: psql $DATABASE_URL -f schema.sql)

-- btree_gist lets an EXCLUDE constraint combine "=" on venue_id with "&&" on a time range.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('organizer', 'owner')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS venues (
  id          SERIAL PRIMARY KEY,
  owner_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL,
  address     TEXT NOT NULL DEFAULT '',
  capacity    INT  NOT NULL CHECK (capacity > 0),
  price       INT  NOT NULL CHECK (price >= 0),          -- booking fee per slot, in rupees
  amenities   TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_venues_city     ON venues (lower(city));
CREATE INDEX IF NOT EXISTS idx_venues_capacity ON venues (capacity);
CREATE INDEX IF NOT EXISTS idx_venues_price    ON venues (price);
CREATE INDEX IF NOT EXISTS idx_venues_owner    ON venues (owner_id);

-- Reusable daily time slots defined by the venue owner (e.g. Morning 09:00-13:00).
CREATE TABLE IF NOT EXISTS venue_slots (
  id         SERIAL PRIMARY KEY,
  venue_id   INT  NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  CHECK (end_time > start_time),
  UNIQUE (venue_id, start_time, end_time)
);

CREATE TABLE IF NOT EXISTS bookings (
  id             SERIAL PRIMARY KEY,
  venue_id       INT  NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  slot_id        INT  NOT NULL REFERENCES venue_slots(id) ON DELETE RESTRICT,
  organizer_id   INT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_date   DATE NOT NULL,
  starts_at      TIMESTAMP NOT NULL,       -- booking_date + slot.start_time
  ends_at        TIMESTAMP NOT NULL,       -- booking_date + slot.end_time
  status         TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  fee            INT  NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'paid',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),   -- when the booking was made
  cancelled_at   TIMESTAMPTZ,
  CHECK (ends_at > starts_at),

  -- CONCURRENCY GUARANTEE (last line of defence, enforced by PostgreSQL itself):
  -- no two CONFIRMED bookings of the same venue may have overlapping time ranges.
  -- Even if application code has a bug, the second overlapping INSERT fails (SQLSTATE 23P01).
  CONSTRAINT no_overlapping_confirmed_bookings
    EXCLUDE USING gist (venue_id WITH =, tsrange(starts_at, ends_at) WITH &&)
    WHERE (status = 'confirmed')
);
CREATE INDEX IF NOT EXISTS idx_bookings_organizer ON bookings (organizer_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_venue_date ON bookings (venue_id, booking_date);

-- Extra safety net: one confirmed booking per (slot, date).
CREATE UNIQUE INDEX IF NOT EXISTS uq_confirmed_slot_date
  ON bookings (slot_id, booking_date) WHERE status = 'confirmed';
