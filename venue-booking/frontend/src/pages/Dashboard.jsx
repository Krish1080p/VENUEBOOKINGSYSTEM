import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, prettyDate } from '../api.js';
import { useAuth } from '../App.jsx';

const input = 'border border-ink/20 rounded-md px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-pine';
const TODAY = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

export default function Dashboard() {
  const { user } = useAuth();
  return user.role === 'owner' ? <OwnerDashboard /> : <OrganizerDashboard />;
}

/* ---------------- Organiser: view / modify / cancel ---------------- */
function OrganizerDashboard() {
  const [bookings, setBookings] = useState(null);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const load = useCallback(() => api('/bookings/mine').then(setBookings), []);
  useEffect(() => { load().catch((e) => setMsg({ type: 'error', text: e.message })); }, [load]);

  async function cancel(b) {
    if (!window.confirm('Cancel this booking?')) return;
    try { await api('/bookings/' + b.id, { method: 'DELETE' }); setMsg({ type: 'ok', text: 'Booking cancelled.' }); load(); }
    catch (e) { setMsg({ type: 'error', text: e.message }); }
  }
  const upcoming = (bookings || []).filter((b) => b.status === 'confirmed' && b.date >= TODAY);
  const past = (bookings || []).filter((b) => !upcoming.includes(b));

  return (
    <>
      <h1 className="font-display text-3xl font-bold mb-4">My bookings</h1>
      {msg.text && <p role="status" className={`mb-4 p-3 rounded text-sm font-semibold ${msg.type === 'error' ? 'bg-danger/10 text-danger' : 'bg-pine-soft text-pine-dark'}`}>{msg.text}</p>}
      <h2 className="font-display text-xl font-bold mb-2">Upcoming</h2>
      {bookings && upcoming.length === 0 && <p className="text-ink/70 mb-6">No upcoming bookings. <Link to="/" className="text-pine font-semibold underline">Browse venues</Link></p>}
      <ul className="space-y-3 mb-8">
        {upcoming.map((b) => (
          <li key={b.id} className="bg-white border border-ink/10 rounded-lg p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <Link to={`/venues/${b.venueId}`} className="font-display text-lg font-bold hover:underline">{b.venue}</Link>
                <p className="text-sm">{prettyDate(b.date)} · {b.slot} {b.start}–{b.end} · {money(b.fee)}</p>
                <p className="text-xs text-ink/60">Booked {new Date(b.created_at).toLocaleString()}</p>
              </div>
              <div className="flex gap-2 items-start">
                <button onClick={() => setEditing(editing === b.id ? null : b.id)} className="px-3 py-1.5 rounded border border-ink/20 text-sm font-semibold">Change date or slot</button>
                <button onClick={() => cancel(b)} className="px-3 py-1.5 rounded border border-danger text-danger text-sm font-semibold">Cancel booking</button>
              </div>
            </div>
            {editing === b.id && <Reschedule booking={b} onDone={(m) => { setEditing(null); setMsg(m); load(); }} />}
          </li>
        ))}
      </ul>
      {past.length > 0 && <>
        <h2 className="font-display text-xl font-bold mb-2">Past and cancelled</h2>
        <ul className="space-y-2 text-sm text-ink/70">
          {past.map((b) => <li key={b.id}>{b.venue} · {prettyDate(b.date)} · {b.slot} · {b.status}</li>)}
        </ul></>}
    </>
  );
}

function Reschedule({ booking, onDone }) {
  const [slots, setSlots] = useState([]);
  const [date, setDate] = useState(booking.date);
  const [slotId, setSlotId] = useState(booking.slotId);
  const [error, setError] = useState('');
  useEffect(() => { api('/venues/' + booking.venueId).then((v) => setSlots(v.slots)); }, [booking.venueId]);

  async function save() {
    try { await api('/bookings/' + booking.id, { method: 'PUT', body: { date, slotId: +slotId } }); onDone({ type: 'ok', text: 'Booking updated.' }); }
    catch (e) { setError(e.message); }   // 409 => "slot no longer available"
  }
  return (
    <div className="mt-3 pt-3 border-t border-ink/10 flex flex-wrap gap-2 items-center">
      <input type="date" min={TODAY} className={input} value={date} onChange={(e) => setDate(e.target.value)} aria-label="New date" />
      <select className={input} value={slotId} onChange={(e) => setSlotId(e.target.value)} aria-label="New slot">
        {slots.map((s) => <option key={s.id} value={s.id}>{s.label} {s.start}–{s.end}</option>)}
      </select>
      <button onClick={save} className="px-3 py-2 rounded bg-pine text-white text-sm font-semibold">Save changes</button>
      {error && <span role="alert" className="text-danger text-sm font-semibold">{error}</span>}
    </div>
  );
}

/* ---------------- Owner: list venues, set pricing/slots, booking calendar ---------------- */
function OwnerDashboard() {
  const [venues, setVenues] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [f, setF] = useState({ name: '', city: '', address: '', capacity: '', price: '', amenities: '', description: '' });
  const [slotForm, setSlotForm] = useState({ venueId: '', label: '', start: '09:00', end: '13:00' });
  const load = useCallback(() => Promise.all([api('/owner/venues'), api('/owner/bookings')])
    .then(([v, b]) => { setVenues(v); setBookings(b); if (v[0] && !slotForm.venueId) setSlotForm((s) => ({ ...s, venueId: v[0].id })); }), []); // eslint-disable-line
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  async function addVenue(e) {
    e.preventDefault(); setError('');
    try { await api('/venues', { method: 'POST', body: { ...f, capacity: +f.capacity, price: +f.price } });
      setF({ name: '', city: '', address: '', capacity: '', price: '', amenities: '', description: '' }); load(); }
    catch (err) { setError(err.message); }
  }
  async function addSlot(e) {
    e.preventDefault(); setError('');
    try { await api(`/venues/${slotForm.venueId}/slots`, { method: 'POST', body: slotForm }); setSlotForm({ ...slotForm, label: '' }); setError(''); alert('Slot added'); }
    catch (err) { setError(err.message); }
  }
  const grouped = bookings.reduce((a, b) => ((a[b.date] ||= []).push(b), a), {});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="space-y-10">
      <h1 className="font-display text-3xl font-bold">My venues</h1>
      {error && <p role="alert" className="p-3 rounded bg-danger/10 text-danger text-sm font-semibold">{error}</p>}
      <div className="grid md:grid-cols-2 gap-6">
        <form onSubmit={addVenue} className="bg-white border border-ink/10 rounded-lg p-5 grid grid-cols-2 gap-3">
          <h2 className="col-span-2 font-display text-lg font-bold">List a new venue</h2>
          <input className={`${input} col-span-2`} placeholder="Venue name" value={f.name} onChange={set('name')} required />
          <input className={input} placeholder="City" value={f.city} onChange={set('city')} required />
          <input className={input} placeholder="Address" value={f.address} onChange={set('address')} />
          <input className={input} type="number" min="1" placeholder="Capacity" value={f.capacity} onChange={set('capacity')} required />
          <input className={input} type="number" min="0" placeholder="Price per slot (₹)" value={f.price} onChange={set('price')} required />
          <input className={`${input} col-span-2`} placeholder="Amenities, comma separated" value={f.amenities} onChange={set('amenities')} />
          <textarea className={`${input} col-span-2`} placeholder="Description" value={f.description} onChange={set('description')} />
          <button className="col-span-2 py-2 rounded bg-pine text-white font-semibold">Add venue</button>
        </form>
        <form onSubmit={addSlot} className="bg-white border border-ink/10 rounded-lg p-5 grid grid-cols-2 gap-3 h-fit">
          <h2 className="col-span-2 font-display text-lg font-bold">Define a daily time slot</h2>
          <select className={`${input} col-span-2`} value={slotForm.venueId} onChange={(e) => setSlotForm({ ...slotForm, venueId: e.target.value })} required>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <input className={`${input} col-span-2`} placeholder="Label (e.g. Evening)" value={slotForm.label} onChange={(e) => setSlotForm({ ...slotForm, label: e.target.value })} required />
          <input type="time" className={input} value={slotForm.start} onChange={(e) => setSlotForm({ ...slotForm, start: e.target.value })} required />
          <input type="time" className={input} value={slotForm.end} onChange={(e) => setSlotForm({ ...slotForm, end: e.target.value })} required />
          <button className="col-span-2 py-2 rounded bg-pine text-white font-semibold">Add slot</button>
        </form>
      </div>

      <section>
        <h2 className="font-display text-xl font-bold mb-2">Your venues</h2>
        <ul className="grid sm:grid-cols-2 gap-3">
          {venues.map((v) => (
            <li key={v.id} className="bg-white border border-ink/10 rounded-lg p-4">
              <Link to={`/venues/${v.id}`} className="font-bold hover:underline">{v.name}</Link>
              <p className="text-sm text-ink/70">{v.city} · {v.capacity} guests · {money(v.price)} / slot</p>
            </li>))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold mb-2">Booking calendar (upcoming)</h2>
        {Object.keys(grouped).length === 0 && <p className="text-ink/70">No upcoming bookings yet.</p>}
        {Object.entries(grouped).map(([d, list]) => (
          <div key={d} className="mb-4">
            <h3 className="font-semibold">{prettyDate(d)}</h3>
            <ul className="text-sm divide-y divide-ink/10 bg-white border border-ink/10 rounded-lg">
              {list.map((b) => (
                <li key={b.id} className={`p-3 flex flex-wrap justify-between gap-2 ${b.status === 'cancelled' ? 'text-ink/40 line-through' : ''}`}>
                  <span>{b.venue} · {b.slot} {b.start}–{b.end}</span><span>{b.organizer} · {money(b.fee)} · {b.status}</span>
                </li>))}
            </ul>
          </div>))}
      </section>
    </div>
  );
}
