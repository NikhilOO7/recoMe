'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://recome-api.fly.dev';

interface User {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  tier: string;
  createdAt: string;
  updatedAt: string;
  googleId: string | null;
  githubId: string | null;
  facebookId: string | null;
  _count: { syncStates: number; devices: number };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  function loadUsers(s?: string, p?: number) {
    const token = localStorage.getItem('recome_token');
    if (!token) return;
    const params = new URLSearchParams();
    if (s ?? search) params.set('search', s ?? search);
    params.set('page', String(p ?? page));
    params.set('limit', '20');

    fetch(`${API_URL}/admin/users?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.users);
        setTotal(data.total);
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function updateRole(userId: string, role: string) {
    const token = localStorage.getItem('recome_token');
    if (!token) return;
    fetch(`${API_URL}/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }).then(() => loadUsers());
  }

  function updateTier(userId: string, tier: string) {
    const token = localStorage.getItem('recome_token');
    if (!token) return;
    fetch(`${API_URL}/admin/users/${userId}/tier`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    }).then(() => loadUsers());
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Users</h1>
      <p className="text-sm text-white/40 mb-6">{total} total users</p>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by email or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(0);
              loadUsers(search, 0);
            }
          }}
          className="w-full max-w-md px-4 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-white placeholder:text-white/30 outline-none focus:border-[#5eead4]/50"
        />
      </div>

      {/* Users table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-white/30 uppercase tracking-wider border-b border-white/[0.08]">
              <th className="pb-3 pr-4">User</th>
              <th className="pb-3 pr-4">Role</th>
              <th className="pb-3 pr-4">Tier</th>
              <th className="pb-3 pr-4">Auth</th>
              <th className="pb-3 pr-4">Sync</th>
              <th className="pb-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-white/[0.05] hover:bg-white/[0.02]">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-3">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#2356e8]/20 flex items-center justify-center text-xs font-bold text-[#93b4fd]">
                        {(user.displayName || user.email)[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-white">{user.displayName || 'No name'}</div>
                      <div className="text-xs text-white/40">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <select
                    value={user.role}
                    onChange={(e) => updateRole(user.id, e.target.value)}
                    className="bg-white/[0.06] border border-white/[0.12] rounded px-2 py-1 text-xs text-white cursor-pointer"
                  >
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  </select>
                </td>
                <td className="py-3 pr-4">
                  <select
                    value={user.tier}
                    onChange={(e) => updateTier(user.id, e.target.value)}
                    className="bg-white/[0.06] border border-white/[0.12] rounded px-2 py-1 text-xs text-white cursor-pointer"
                  >
                    <option value="FREE">FREE</option>
                    <option value="PRO">PRO</option>
                    <option value="PREMIUM">PREMIUM</option>
                  </select>
                </td>
                <td className="py-3 pr-4 text-xs text-white/40">
                  {user.googleId && (
                    <span title="Google" className="mr-1">
                      G
                    </span>
                  )}
                  {user.githubId && (
                    <span title="GitHub" className="mr-1">
                      GH
                    </span>
                  )}
                  {user.facebookId && <span title="Facebook">FB</span>}
                  {!user.googleId && !user.githubId && !user.facebookId && 'Email'}
                </td>
                <td className="py-3 pr-4 text-xs text-white/40">
                  {user._count.syncStates}s / {user._count.devices}d
                </td>
                <td className="py-3 text-xs text-white/40">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => {
              const p = Math.max(0, page - 1);
              setPage(p);
              loadUsers(search, p);
            }}
            disabled={page === 0}
            className="px-3 py-1.5 text-xs bg-white/[0.06] rounded disabled:opacity-30 cursor-pointer"
          >
            Prev
          </button>
          <span className="text-xs text-white/40 self-center">
            Page {page + 1} of {Math.ceil(total / 20)}
          </span>
          <button
            onClick={() => {
              const p = page + 1;
              setPage(p);
              loadUsers(search, p);
            }}
            disabled={(page + 1) * 20 >= total}
            className="px-3 py-1.5 text-xs bg-white/[0.06] rounded disabled:opacity-30 cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
