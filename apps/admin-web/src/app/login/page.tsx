'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/api/admin/auth/login', { username, password });
      const { token } = res.data;

      localStorage.setItem('admin_token', token);
      // Also set a cookie so Next.js middleware can detect auth
      document.cookie = `admin_token=${token}; path=/; max-age=28800; SameSite=Strict`;

      router.replace('/liveops');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-900 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse" />
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 mb-4 shadow-lg">
            <span className="text-3xl">🎯</span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter mb-2">BinGo!</h1>
          <p className="text-purple-300 text-sm font-medium">Centro de Operaciones</p>
        </div>

        {/* Form Container */}
        <form
          onSubmit={handleSubmit}
          className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-8 space-y-6"
        >
          {/* Username Field */}
          <div>
            <label className="block text-xs font-bold text-purple-200 uppercase mb-3 tracking-wide">
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-5 py-3.5 bg-white/5 border border-white/20 rounded-2xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent focus:bg-white/10 transition-all duration-200"
              placeholder="admin"
              autoComplete="username"
              required
            />
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-xs font-bold text-purple-200 uppercase mb-3 tracking-wide">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-5 py-3.5 bg-white/5 border border-white/20 rounded-2xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent focus:bg-white/10 transition-all duration-200"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-500/20 border border-red-500/40 rounded-2xl text-red-300 text-sm text-center font-medium backdrop-blur-sm">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-purple-500/50 hover:shadow-xl"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                <span>Acceder al Panel</span>
                <span className="text-lg">→</span>
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-xs text-white/40 font-medium tracking-wide">
            BinGo! Operations · Acceso Administrativo
          </p>
        </div>
      </div>
    </div>
  );
}
