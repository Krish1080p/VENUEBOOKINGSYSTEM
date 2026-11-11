import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

export default function Auth() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'organizer' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setError('');
    try {
      login(await api(`/auth/${mode}`, { method: 'POST', body: f }));
      navigate('/');
    } catch (err) { setError(err.message); }
  }
  const input = 'w-full border border-ink/20 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-pine';
  return (
    <form onSubmit={submit} className="max-w-sm mx-auto bg-white rounded-lg border border-ink/10 p-6 space-y-4">
      <h1 className="font-display text-2xl font-bold">{mode === 'login' ? 'Log in' : 'Create your account'}</h1>
      {mode === 'register' && <>
        <label className="block text-sm font-semibold">Name<input className={input} value={f.name} onChange={set('name')} required /></label>
        <label className="block text-sm font-semibold">I am a
          <select className={input} value={f.role} onChange={set('role')}>
            <option value="organizer">Event organiser</option><option value="owner">Venue owner</option>
          </select></label></>}
      <label className="block text-sm font-semibold">Email<input type="email" className={input} value={f.email} onChange={set('email')} required /></label>
      <label className="block text-sm font-semibold">Password<input type="password" minLength={6} className={input} value={f.password} onChange={set('password')} required /></label>
      {error && <p role="alert" className="text-danger text-sm font-semibold">{error}</p>}
      <button className="w-full py-2 rounded-md bg-pine text-white font-semibold hover:bg-pine-dark">{mode === 'login' ? 'Log in' : 'Sign up'}</button>
      <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="text-sm text-pine font-semibold underline">
        {mode === 'login' ? 'New here? Create an account' : 'Have an account? Log in'}
      </button>
      <p className="text-xs text-ink/60">Demo logins (password123): alice@demo.com, bob@demo.com, owner@demo.com</p>
    </form>
  );
}
