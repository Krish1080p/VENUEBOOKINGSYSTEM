import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money, prettyDate } from '../api.js';
import { useAuth } from '../App.jsx';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const now = new Date();
const TODAY = ymd(now.getFullYear(), now.getMonth(), now.getDate());

export default function VenueDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [venue, setVenue] = useState(null);
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [booked, setBooked] = useState([]);
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(null);

  useEffect(() => { api('/venues/' + id).then(setVenue).catch((e) => setError(e.message)); }, [id]);

  const loadAvailability = useCallback(() => {
    const days = new Date(month.y, month.m + 1, 0).getDate();
    return api(`/venues/${id}/availability?from=${ymd(month.y, month.m, 1)}&to=${ymd(month.y, month.m, days)}`).then(setBooked);
  }, [id, month]);
  useEffect(() => { loadAvailability().catch(() => {}); }, [loadAvailability]);

  if (!venue) return <p>{error || 'Loading…'}</p>;

  // A slot is unavailable if any confirmed booking on that date overlaps its time range.
  const isTaken = (s, d) => booked.some((b) => b.date === d && b.start < s.end && b.end > s.start);
  const fullyBooked = (d) => venue.slots.length > 0 && venue.slots.every((s) => isTaken(s, d));

  async function book() {
    setBusy(true); setError('');
    try {
      const b = await api('/bookings', { method: 'POST', body: { venueId: venue.id, slotId: slot.id, date } });
      setConfirmed(b); setSlot(null);
    } catch (e) {
      setError(e.message);            // e.g. "Sorry, this slot is no longer available."
      setSlot(null);
    } finally { setBusy(false); loadAvailability().catch(() => {}); }  // refresh so the taken slot shows as unavailable
  }

  const first = new Date(month.y, month.m, 1).getDay();
  const days = new Date(month.y, month.m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const shift = (n) => { const d = new Date(month.y, month.m + n, 1); setMonth({ y: d.getFullYear(), m: d.getMonth() }); setDate(''); setSlot(null); };

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      <section className="lg:col-span-2">
        <h1 className="font-display text-3xl font-bold">{venue.name}</h1>
        <p className="text-ink/70">{venue.city}{venue.address && `, ${venue.address}`} · up to {venue.capacity} guests · {money(venue.price)} per slot</p>
        <p className="mt-3">{venue.description}</p>
        <div className="flex flex-wrap gap-1.5 mt-3">{venue.amenities.map((a) => <span key={a} className="text-xs bg-pine-soft text-pine-dark px-2 py-0.5 rounded">{a}</span>)}</div>

        <div className="bg-white border border-ink/10 rounded-lg p-5 mt-6">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => shift(-1)} className="px-3 py-1 rounded border border-ink/20" aria-label="Previous month">‹</button>
            <h2 className="font-display text-lg font-bold">{new Date(month.y, month.m).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2>
            <button onClick={() => shift(1)} className="px-3 py-1 rounded border border-ink/20" aria-label="Next month">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink/60 mb-1">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <div key={d}>{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const ds = ymd(month.y, month.m, d), past = ds < TODAY, full = fullyBooked(ds), sel = ds === date;
              return (
                <button key={i} disabled={past || full} onClick={() => { setDate(ds); setSlot(null); setError(''); setConfirmed(null); }}
                  className={`h-11 rounded text-sm font-semibold ${sel ? 'bg-pine text-white' : full ? 'bg-danger/10 text-danger line-through' : past ? 'text-ink/30' : 'hover:bg-pine-soft'}`}
                  title={full ? 'Fully booked' : ''}>{d}</button>
              );
            })}
          </div>
          <p className="text-xs text-ink/60 mt-3">Struck-through dates are fully booked. Availability reflects confirmed bookings right now.</p>
        </div>
      </section>

      <aside className="bg-white border border-ink/10 rounded-lg p-5 h-fit">
        {confirmed && (
          <div role="status" className="mb-4 p-3 rounded bg-pine-soft text-pine-dark text-sm">
            <p className="font-bold">Booking #{confirmed.id} confirmed</p>
            <p>{prettyDate(confirmed.booking_date.slice(0, 10))} · fee {money(confirmed.fee)} paid</p>
            <p className="text-xs">Made at {new Date(confirmed.created_at).toLocaleString()}</p>
            <Link to="/dashboard" className="underline font-semibold">View my bookings</Link>
          </div>
        )}
        {error && <p role="alert" className="mb-4 p-3 rounded bg-danger/10 text-danger text-sm font-semibold">{error}</p>}
        <h2 className="font-display text-lg font-bold mb-2">{date ? prettyDate(date) : 'Choose a date'}</h2>
        {date && (
          <ul className="space-y-2">
            {venue.slots.map((s) => {
              const taken = isTaken(s, date);
              return (
                <li key={s.id}>
                  <button disabled={taken} onClick={() => setSlot(s)}
                    className={`w-full text-left px-3 py-2 rounded border text-sm ${slot?.id === s.id ? 'border-pine bg-pine-soft' : 'border-ink/20'} ${taken ? 'opacity-50 line-through' : 'hover:border-pine'}`}>
                    <span className="font-semibold">{s.label}</span> · {s.start}–{s.end} {taken && '(booked)'}
                  </button>
                </li>
              );
            })}
            {venue.slots.length === 0 && <li className="text-sm text-ink/70">The owner hasn't added time slots yet.</li>}
          </ul>
        )}
        {slot && (
          <div className="mt-5 border-t border-ink/10 pt-4 text-sm space-y-2">
            <h3 className="font-display font-bold text-base">Checkout</h3>
            <p>{venue.name}<br />{prettyDate(date)}, {slot.start}–{slot.end}</p>
            <p className="flex justify-between font-bold"><span>Booking fee</span><span>{money(venue.price)}</span></p>
            {!user ? <Link to="/login" className="block text-center py-2 rounded bg-pine text-white font-semibold">Log in to book</Link>
              : user.role !== 'organizer' ? <p className="text-ink/70">Only organiser accounts can book venues.</p>
              : <button onClick={book} disabled={busy} className="w-full py-2 rounded bg-pine text-white font-semibold hover:bg-pine-dark disabled:opacity-60">
                  {busy ? 'Booking…' : `Pay ${money(venue.price)} and book`}</button>}
            <p className="text-xs text-ink/60">Demo checkout: payment is simulated.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
