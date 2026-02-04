import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE } from '../../lib/env';
import { Button } from '../../components/ui/button';

const ADMIN_STORAGE_KEY = 'tenax.admin';

const AdminLoginPage = () => {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const response = await axios.post(`${API_BASE}/admin/login`, { passcode });
      const token = response.data?.token;
      if (token) {
        localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify({ token }));
        navigate('/admin');
      } else {
        setError('Invalid passcode.');
      }
    } catch (err) {
      setError('Invalid passcode.');
    }
  };

  return (
    <div className="min-h-screen bg-[#03040b] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8">
        <p className="text-xs uppercase tracking-[0.4em] text-white/50">Tenax Admin</p>
        <h1 className="mt-2 text-2xl font-semibold">Opik Observability</h1>
        <p className="text-white/60 mt-2 text-sm">Enter the admin passcode to continue.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <input
            type="password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Passcode"
            required
          />
          {error && <p className="text-red-300 text-sm">{error}</p>}
          <Button type="submit" className="w-full">Enter Admin</Button>
        </form>
      </div>
    </div>
  );
};

export default AdminLoginPage;
