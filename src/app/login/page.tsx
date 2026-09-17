'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = await response.json();
        setError(body.error || 'Login gagal');
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('Tidak dapat menghubungi server');
    } finally {
      setLoading(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
    <form onSubmit={submit} className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg">
      <h1 className="text-2xl font-bold text-slate-900">Masuk X-Airside</h1>
      <p className="mt-1 text-sm text-slate-500">Gunakan akun yang diberikan administrator.</p>
      <label className="mt-6 block text-sm font-medium text-slate-700" htmlFor="email">Email</label>
      <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" />
      <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="password">Kata sandi</label>
      <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" />
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <button disabled={loading} className="mt-6 w-full rounded-lg bg-sky-700 px-4 py-2 font-semibold text-white disabled:opacity-60">{loading ? 'Memproses...' : 'Masuk'}</button>
    </form>
  </main>;
}
