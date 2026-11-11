// Fires many simultaneous booking requests for ONE venue/slot/date from two organisers.
// Usage (server running): npm run test:concurrency -- 20
const BASE = process.env.API || 'http://localhost:4000/api';
const N = parseInt(process.argv[2] || '20', 10);

async function call(path, method, token, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const login = async (email) => (await call('/auth/login', 'POST', null, { email, password: 'password123' })).data.token;

(async () => {
  const [alice, bob] = [await login('alice@demo.com'), await login('bob@demo.com')];
  const { data: venues } = await call('/venues', 'GET', alice);
  const venue = venues[0];
  const { data: detail } = await call('/venues/' + venue.id, 'GET', alice);
  const slot = detail.slots[0];
  const d = new Date(Date.now() + (60 + Math.floor(Math.random() * 300)) * 864e5); // fresh random future date
  const date = d.toISOString().slice(0, 10);
  console.log(`Venue "${venue.name}", slot "${slot.label}", date ${date}, ${N} simultaneous requests...`);

  const results = await Promise.all(Array.from({ length: N }, (_, i) =>
    call('/bookings', 'POST', i % 2 ? bob : alice, { venueId: venue.id, slotId: slot.id, date })));
  const ok = results.filter((r) => r.status === 201).length;
  const conflict = results.filter((r) => r.status === 409).length;
  console.log(`Confirmed: ${ok}   Rejected (409): ${conflict}   Other: ${N - ok - conflict}`);
  console.log('Sample rejection message:', results.find((r) => r.status === 409)?.data.error);

  const { data: avail } = await call(`/venues/${venue.id}/availability?from=${date}&to=${date}`, 'GET', alice);
  const held = avail.filter((b) => b.slotId === slot.id).length;
  console.log(`Confirmed bookings stored for that slot/date: ${held}`);
  const pass = ok === 1 && conflict === N - 1 && held === 1;
  console.log(pass ? 'PASS: exactly one booking holds the slot.' : 'FAIL: double-booking or unexpected result!');
  process.exit(pass ? 0 : 1);
})();
