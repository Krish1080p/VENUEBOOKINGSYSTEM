import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';

export default function Venues() {
  const [filters, setFilters] = useState({ q: '', city: '', minCapacity: '', maxPrice: '', amenity: '' });
  const [venues, setVenues] = useState(null);
  const [error, setError] = useState('');

  // Re-query (debounced) whenever a filter changes.
  useEffect(() => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    const t = setTimeout(() => api('/venues?' + qs).then(setVenues).catch((e) => setError(e.message)), 250);
    return () => clearTimeout(t);
  }, [filters]);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const input = 'border border-ink/20 rounded-md px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-pine';
  return (
    <>
      <h1 className="font-display text-3xl font-bold mb-1">Find a venue for your event</h1>
      <p className="text-ink/70 mb-6">Pick a venue, check its live calendar, and book a slot that nobody else can take.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-8">
        <input className={input} placeholder="Search by name" value={filters.q} onChange={set('q')} aria-label="Search" />
        <input className={input} placeholder="City" value={filters.city} onChange={set('city')} aria-label="City" />
        <input className={input} type="number" min="1" placeholder="Min guests" value={filters.minCapacity} onChange={set('minCapacity')} aria-label="Minimum capacity" />
        <input className={input} type="number" min="0" placeholder="Max price (₹)" value={filters.maxPrice} onChange={set('maxPrice')} aria-label="Maximum price" />
        <input className={input} placeholder="Amenity (e.g. Parking)" value={filters.amenity} onChange={set('amenity')} aria-label="Amenity" />
      </div>
      {error && <p className="text-danger font-semibold">{error}</p>}
      {venues && venues.length === 0 && <p className="text-ink/70">No venues match these filters. Try widening your price or capacity.</p>}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(venues || []).map((v) => (
          <Link key={v.id} to={`/venues/${v.id}`} className="bg-white rounded-lg border border-ink/10 p-5 hover:border-pine focus:outline-none focus:ring-2 focus:ring-pine">
            <h2 className="font-display text-xl font-bold">{v.name}</h2>
            <p className="text-sm text-ink/70">{v.city}{v.address && `, ${v.address}`}</p>
            <p className="text-sm mt-3 line-clamp-2">{v.description}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {v.amenities.map((a) => <span key={a} className="text-xs bg-pine-soft text-pine-dark px-2 py-0.5 rounded">{a}</span>)}
            </div>
            <div className="flex justify-between mt-4 text-sm font-semibold"><span>Up to {v.capacity} guests</span><span className="text-pine">{money(v.price)} / slot</span></div>
          </Link>
        ))}
      </div>
    </>
  );
}
