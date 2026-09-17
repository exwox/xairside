'use client';

import { useEffect, useState, type FormEvent } from 'react';
import AppShell from '@/components/AppShell';
import { PAGE_DEFINITIONS, ROLES, canRoleUsePage, normalizeRolePageAccess, type PageKey, type RolePageAccess } from '@/lib/page-access';

type Role = 'SUPADMIN' | 'ADMIN' | 'USER' | 'VIEWER';
type User = { id: string; name: string; email: string; role: Role; isActive: boolean; airportId: string | null; airport?: { name: string } | null };
type Airport = { id: string; code: string; name: string };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [myRole, setMyRole] = useState<Role>('ADMIN');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('USER');
  const [airportId, setAirportId] = useState('');
  const [message, setMessage] = useState('');
  const [pagePermissions, setPagePermissions] = useState<RolePageAccess | null>(null);
  const [savingPermissions, setSavingPermissions] = useState(false);

  async function load() {
    const [usersResponse, airportsResponse, meResponse] = await Promise.all([
      fetch('/api/users', { cache: 'no-store' }), fetch('/api/airports', { cache: 'no-store' }), fetch('/api/auth/me', { cache: 'no-store' }),
    ]);
    if (!usersResponse.ok || !airportsResponse.ok || !meResponse.ok) throw new Error('Data akun gagal dimuat');
    const [userData, airportData, meData] = await Promise.all([usersResponse.json(), airportsResponse.json(), meResponse.json()]);
    setUsers(userData);
    setAirports(airportData);
    setMyRole(meData.user.role);
    setAirportId((current) => current || airportData[0]?.id || '');
    if (meData.user.role === 'SUPADMIN') {
      const accessResponse = await fetch('/api/role-pages', { cache: 'no-store' });
      if (!accessResponse.ok) throw new Error('Pengaturan akses halaman gagal dimuat');
      setPagePermissions(normalizeRolePageAccess(await accessResponse.json()));
    }
  }

  useEffect(() => { Promise.resolve().then(load).catch((error) => setMessage(error.message)); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password, role, airportId: role === 'SUPADMIN' ? null : airportId }) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Gagal membuat akun');
    setName(''); setEmail(''); setPassword(''); setMessage('Akun berhasil dibuat');
    await load();
  }

  async function update(user: User, patch: Partial<User> & { password?: string }) {
    const response = await fetch(`/api/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Gagal memperbarui akun');
    setMessage('Akun berhasil diperbarui. Sesi lama telah dicabut bila akses berubah.');
    await load();
  }

  async function deleteUser(user: User) {
    const confirmed = window.confirm(`Yakin hapus akun "${user.name}" (${user.email})? Tindakan ini tidak dapat dibatalkan.`);
    if (!confirmed) return;
    const response = await fetch(`/api/users/${user.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || 'Gagal menghapus akun');
    setMessage('Akun berhasil dihapus');
    await load();
  }

  function togglePage(role: Role, page: PageKey) {
    if (!pagePermissions || !canRoleUsePage(role, page) || role === 'SUPADMIN' || page === 'dashboard') return;
    setPagePermissions(normalizeRolePageAccess({
      ...pagePermissions,
      [role]: { ...pagePermissions[role], [page]: !pagePermissions[role][page] },
    }));
  }

  async function savePagePermissions() {
    if (!pagePermissions) return;
    setSavingPermissions(true);
    setMessage('');
    try {
      const response = await fetch('/api/role-pages', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pagePermissions),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Gagal menyimpan akses halaman');
      setPagePermissions(normalizeRolePageAccess(body));
      setMessage('Akses halaman per role berhasil disimpan. Pengguna lain akan melihat perubahan saat memuat ulang halaman.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menyimpan akses halaman');
    } finally {
      setSavingPermissions(false);
    }
  }

  return <AppShell><main className="mx-auto max-w-5xl p-6">
    <h1 className="text-2xl font-bold text-slate-900">Pengelolaan akun</h1>
    <p className="mt-1 text-sm text-slate-600">ADMIN mengelola USER dan VIEWER di bandara sendiri. SUPADMIN dapat mengelola semua role.</p>
    {message && <p role="status" className="my-4 rounded bg-sky-50 p-3 text-sm text-sky-900">{message}</p>}
    <form onSubmit={save} className="mt-6 grid gap-3 rounded-xl bg-white p-5 shadow sm:grid-cols-2">
      <h2 className="sm:col-span-2 font-semibold">Tambah akun</h2>
      <input aria-label="Nama" placeholder="Nama" required value={name} onChange={(e) => setName(e.target.value)} className="rounded border p-2" />
      <input aria-label="Email" placeholder="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="rounded border p-2" />
      <input aria-label="Kata sandi" placeholder="Kata sandi minimal 12 karakter" type="password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} className="rounded border p-2" />
      <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded border p-2">
        <option value="USER">USER</option><option value="VIEWER">VIEWER</option>
        {myRole === 'SUPADMIN' && <><option value="ADMIN">ADMIN</option><option value="SUPADMIN">SUPADMIN</option></>}
      </select>
      {myRole === 'SUPADMIN' && role !== 'SUPADMIN' && <select aria-label="Bandara" value={airportId} onChange={(e) => setAirportId(e.target.value)} className="rounded border p-2">{airports.map((airport) => <option key={airport.id} value={airport.id}>{airport.code} · {airport.name}</option>)}</select>}
      <button className="rounded bg-sky-700 px-4 py-2 font-semibold text-white">Buat akun</button>
    </form>
    <div className="mt-6 overflow-x-auto rounded-xl bg-white shadow"><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-3">Nama / email</th><th className="p-3">Bandara</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Sandi</th><th className="p-3">Aksi</th></tr></thead><tbody>
      {users.map((user) => { const editable = myRole === 'SUPADMIN' || (user.role === 'USER' || user.role === 'VIEWER'); const canDelete = (myRole === 'SUPADMIN' || (myRole === 'ADMIN' && user.airportId === airports[0]?.id)) && user.role !== 'SUPADMIN'; return <tr key={user.id} className="border-t"><td className="p-3">{user.name}<br /><span className="text-slate-500">{user.email}</span></td><td className="p-3">{myRole === 'SUPADMIN' && user.role !== 'SUPADMIN' ? <select aria-label={`Bandara ${user.name}`} value={user.airportId || ''} onChange={(e) => update(user, { airportId: e.target.value })} className="rounded border p-1">{airports.map((airport) => <option key={airport.id} value={airport.id}>{airport.code}</option>)}</select> : user.airport?.name || 'Semua bandara'}</td><td className="p-3"><select aria-label={`Role ${user.name}`} disabled={!editable} value={user.role} onChange={(e) => update(user, { role: e.target.value as Role, ...(user.role === 'SUPADMIN' && e.target.value !== 'SUPADMIN' ? { airportId: airportId } : {}) })} className="rounded border p-1"><option>USER</option><option>VIEWER</option>{myRole === 'SUPADMIN' && <><option>ADMIN</option><option>SUPADMIN</option></>}</select></td><td className="p-3"><button disabled={!editable} onClick={() => update(user, { isActive: !user.isActive })} className="rounded border px-2 py-1 disabled:opacity-50">{user.isActive ? 'Aktif' : 'Nonaktif'}</button></td><td className="p-3"><button disabled={!editable} onClick={() => { const next = window.prompt('Kata sandi baru (minimal 12 karakter)'); if (next) update(user, { password: next }); }} className="rounded border px-2 py-1 disabled:opacity-50">Atur ulang</button></td><td className="p-3"><button disabled={!canDelete} onClick={() => deleteUser(user)} className="rounded border border-red-300 bg-red-50 px-2 py-1 text-red-700 disabled:opacity-50 hover:bg-red-100">Hapus</button></td></tr>; })}
    </tbody></table></div>
    {myRole === 'SUPADMIN' && pagePermissions && <section className="mt-8 rounded-xl bg-white p-5 shadow">
      <h2 className="text-lg font-semibold text-slate-900">Akses halaman per role</h2>
      <p className="mt-1 text-sm text-slate-600">Centang halaman yang boleh tampil dan dibuka. Hak dasar role tetap berlaku; Dashboard dan akses SUPADMIN selalu aktif. Halaman di bawah Admin Panel ikut tertutup jika Admin Panel dimatikan.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm">
        <thead><tr className="border-b bg-slate-50"><th scope="col" className="p-3">Halaman</th>{ROLES.map((roleName) => <th scope="col" key={roleName} className="p-3 text-center">{roleName}</th>)}</tr></thead>
        <tbody>{PAGE_DEFINITIONS.map((page) => <tr key={page.key} className="border-b last:border-0">
          <th scope="row" className="p-3 font-medium text-slate-800">{page.label}</th>
          {ROLES.map((roleName) => {
            const fixed = roleName === 'SUPADMIN' || page.key === 'dashboard';
            const eligible = canRoleUsePage(roleName, page.key);
            const parentOff = page.key !== 'admin' && page.path.startsWith('/admin/') && !pagePermissions[roleName].admin;
            return <td key={roleName} className="p-3 text-center">
              <input type="checkbox" aria-label={`${page.label} untuk ${roleName}`} checked={pagePermissions[roleName][page.key]}
                disabled={fixed || !eligible || parentOff}
                onChange={() => togglePage(roleName, page.key)}
                className="h-4 w-4 accent-sky-700 disabled:opacity-40" />
            </td>;
          })}
        </tr>)}</tbody>
      </table></div>
      <button type="button" disabled={savingPermissions} onClick={savePagePermissions} className="mt-4 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingPermissions ? 'Menyimpan...' : 'Simpan akses halaman'}</button>
    </section>}
  </main></AppShell>;
}
