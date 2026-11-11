import React, { createContext, useContext, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Venues from './pages/Venues.jsx';
import VenueDetail from './pages/VenueDetail.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Auth from './pages/Auth.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const navigate = useNavigate();
  const login = ({ token, user }) => { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); setUser(user); };
  const logout = () => { localStorage.clear(); setUser(null); navigate('/'); };
  const link = ({ isActive }) => `px-3 py-1.5 rounded-md text-sm font-semibold ${isActive ? 'bg-pine text-white' : 'text-ink hover:bg-pine-soft'}`;

  return (
    <AuthCtx.Provider value={{ user, login, logout }}>
      <header className="border-b border-ink/10 bg-white">
        <nav className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-2">
          <Link to="/" className="font-display text-xl font-bold text-pine mr-4">Venuely</Link>
          <NavLink to="/" end className={link}>Venues</NavLink>
          {user && <NavLink to="/dashboard" className={link}>{user.role === 'owner' ? 'My venues' : 'My bookings'}</NavLink>}
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user ? (<><span className="hidden sm:inline">{user.name} ({user.role})</span>
              <button onClick={logout} className="px-3 py-1.5 rounded-md border border-ink/20 font-semibold hover:bg-paper">Log out</button></>)
              : <Link to="/login" className="px-3 py-1.5 rounded-md bg-pine text-white font-semibold hover:bg-pine-dark">Log in</Link>}
          </div>
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Venues />} />
          <Route path="/venues/:id" element={<VenueDetail />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" />} />
        </Routes>
      </main>
    </AuthCtx.Provider>
  );
}
