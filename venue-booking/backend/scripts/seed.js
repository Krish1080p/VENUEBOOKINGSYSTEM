require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/db');

const SLOTS = [['Morning', '09:00', '13:00'], ['Afternoon', '14:00', '18:00'], ['Evening', '19:00', '23:00']];
const VENUES = [
  ['Lotus Banquet Hall', 'Elegant hall for weddings and receptions.', 'Delhi', 'Rajouri Garden', 400, 45000, ['AC', 'Parking', 'Catering', 'Stage']],
  ['Skyline Rooftop', 'Open-air rooftop with city views.', 'Gurgaon', 'Cyber Hub', 120, 30000, ['Bar', 'Sound system', 'Parking']],
  ['The Conference Loft', 'Modern space for talks and workshops.', 'Delhi', 'Connaught Place', 80, 15000, ['AC', 'Projector', 'WiFi']],
  ['Green Lawn Estate', 'Sprawling lawn for large outdoor events.', 'Noida', 'Sector 62', 800, 70000, ['Parking', 'Catering', 'Stage', 'Generator']],
];

(async () => {
  const hash = await bcrypt.hash('password123', 10);
  const users = [['Demo Owner', 'owner@demo.com', 'owner'], ['Alice Organizer', 'alice@demo.com', 'organizer'], ['Bob Organizer', 'bob@demo.com', 'organizer']];
  for (const [n, e, r] of users)
    await pool.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING', [n, e, hash, r]);
  const { rows: [owner] } = await pool.query("SELECT id FROM users WHERE email='owner@demo.com'");
  const { rows: [{ count }] } = await pool.query('SELECT count(*)::int FROM venues');
  if (count === 0) {
    for (const [name, desc, city, addr, cap, price, am] of VENUES) {
      const { rows: [v] } = await pool.query(
        'INSERT INTO venues(owner_id,name,description,city,address,capacity,price,amenities) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [owner.id, name, desc, city, addr, cap, price, am]);
      for (const [l, s, e] of SLOTS)
        await pool.query('INSERT INTO venue_slots(venue_id,label,start_time,end_time) VALUES($1,$2,$3,$4)', [v.id, l, s, e]);
    }
  }
  console.log('Seeded. Logins (password: password123): owner@demo.com, alice@demo.com, bob@demo.com');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
