# Venuely – Venue Booking System (no double-booking)

Stack: **Node/Express + PostgreSQL** backend, **React (Vite) + Tailwind** frontend.

## 1. Setup
Requirements: Node 18+, PostgreSQL 12+.

```bash
createdb venue_booking                 # or create the DB any way you like
cd backend
cp .env.example .env                   # edit DATABASE_URL / JWT_SECRET if needed
npm install
npm run migrate                        # applies schema.sql (tables, indexes, constraints)
npm run seed                           # demo users + 4 venues with Morning/Afternoon/Evening slots
npm run dev                            # API on http://localhost:4000

# new terminal
cd frontend
npm install
npm run dev                            # app on http://localhost:5173
```
Demo logins (password `password123`): `owner@demo.com`, `alice@demo.com`, `bob@demo.com`.
(The UI loads Tailwind from its CDN, so an internet connection is needed in the browser.)

## 2. How double-booking is prevented
Three independent layers (see `backend/src/server.js` → `claimSlot`, and `backend/schema.sql`):
1. **Row lock** – each booking transaction starts with `SELECT … FROM venues WHERE id=$1 FOR UPDATE`, so concurrent requests for one venue are serialised.
2. **Overlap check inside the lock** – a clean "slot no longer available" 409 for the loser.
3. **Database constraint** – `EXCLUDE USING gist (venue_id WITH =, tsrange(starts_at, ends_at) WITH &&) WHERE (status='confirmed')`, plus a unique partial index on `(slot_id, booking_date)`. Even if application code were wrong, PostgreSQL rejects overlapping confirmed bookings (error `23P01`, mapped to HTTP 409). Overlapping slot definitions (e.g. 09–13 and 12–16) are also covered because the check is on time ranges, not slot ids.

Modifying a booking uses the same path; cancelling sets `status='cancelled'`, which frees the slot.

## 3. Testing the concurrency requirement

### A. Two browser windows
1. Use two *different* browser profiles (or one normal + one incognito) – login state is stored in localStorage.
2. Window 1: log in as `alice@demo.com`; Window 2: `bob@demo.com`.
3. In both, open the same venue, choose the same future date and the same slot. Both show it as open.
4. In Window 1 click **Pay … and book**, but do NOT click in Window 2 yet. Then click in Window 2 (to hit the exact-same-moment case, use test B).
5. Expected: Window 1 shows "Booking #N confirmed"; Window 2 shows **"Sorry, this slot is no longer available."**, and the slot now appears as booked. Bob's *My bookings* contains nothing for that slot.
6. Inspect the DB:
```sql
SELECT b.id, u.name, b.venue_id, b.booking_date, b.starts_at, b.ends_at, b.status, b.created_at
FROM bookings b JOIN users u ON u.id = b.organizer_id ORDER BY b.id DESC LIMIT 5;
```
   Exactly one `confirmed` row exists for that venue/slot/date, with the holder and `created_at`.

### B. Truly simultaneous requests (script)
With the API running:
```bash
cd backend
npm run test:concurrency -- 20        # 20 parallel requests from alice & bob for one slot
```
Expected output: `Confirmed: 1   Rejected (409): 19`, then `PASS`. Run it several times with larger numbers (e.g. 100).

### C. Prove the database itself blocks overlaps
Bypass the API in `psql` (adjust ids) – the second insert must fail with `conflicting key value violates exclusion constraint "no_overlapping_confirmed_bookings"`:
```sql
INSERT INTO bookings(venue_id,slot_id,organizer_id,booking_date,starts_at,ends_at,fee)
VALUES (1,1,2,'2030-01-01','2030-01-01 09:00','2030-01-01 13:00',100);
INSERT INTO bookings(venue_id,slot_id,organizer_id,booking_date,starts_at,ends_at,fee)
VALUES (1,1,3,'2030-01-01','2030-01-01 10:00','2030-01-01 12:00',100);
```

## 4. API summary
`POST /api/auth/register|login` · `GET /api/venues?q&city&minCapacity&maxPrice&amenity` · `GET /api/venues/:id` · `GET /api/venues/:id/availability?from&to` · `POST /api/venues` (owner) · `POST /api/venues/:id/slots` (owner) · `GET /api/owner/venues|bookings` (owner) · `POST /api/bookings` · `GET /api/bookings/mine` · `PUT /api/bookings/:id` · `DELETE /api/bookings/:id`

Note: payment is simulated (fee recorded as paid after the slot is secured).
