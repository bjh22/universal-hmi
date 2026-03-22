import { useState } from 'react';
import { UserPlus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { DeleteConfirmDialog } from './shared';
import { TouchTextInput } from '../widgets/TouchTextInput';
import type { UserData, UserListEntry } from '../../types';

export interface UsersSettingsProps {
  user: UserData | null;
  users: UserListEntry[];
  canManage: boolean;
  refreshUsers: () => void;
}

export function UsersSettings({ user, users, canManage, refreshUsers }: UsersSettingsProps) {
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', display_name: '', password: '', role: 'operator', login_mode: 'password' });
  const [deleteUserTarget, setDeleteUserTarget] = useState<UserListEntry | null>(null);

  const handleCreateUser = async () => {
    if (!newUser.username.trim()) return;
    try {
      await api.createUser(newUser);
      setShowCreateUser(false);
      setNewUser({ username: '', display_name: '', password: '', role: 'operator', login_mode: 'password' });
      refreshUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserTarget) return;
    try {
      await api.deleteUser(deleteUserTarget.id);
      setDeleteUserTarget(null);
      refreshUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setDeleteUserTarget(null);
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        {canManage && (
          <button
            onClick={() => setShowCreateUser(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-dark)] text-white rounded-lg text-sm font-medium"
          >
            <UserPlus size={16} /> Add User
          </button>
        )}
      </div>
      {showCreateUser && (
        <div className="bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border)] rounded-xl p-4 mb-4">
          <div className="text-sm font-medium text-[var(--hmi-text-secondary)] mb-3">Create User</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--hmi-text-secondary)]">Username</label>
              <TouchTextInput value={newUser.username} onChange={v => setNewUser(p => ({ ...p, username: v }))} title="Username"
                className="w-full bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-md px-3 py-2 text-sm text-white mt-1 min-h-[44px]" />
            </div>
            <div>
              <label className="text-xs text-[var(--hmi-text-secondary)]">Display Name</label>
              <TouchTextInput value={newUser.display_name} onChange={v => setNewUser(p => ({ ...p, display_name: v }))} title="Display Name"
                className="w-full bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-md px-3 py-2 text-sm text-white mt-1 min-h-[44px]" />
            </div>
            <div>
              <label className="text-xs text-[var(--hmi-text-secondary)]">Password / PIN</label>
              <TouchTextInput type="password" value={newUser.password} onChange={v => setNewUser(p => ({ ...p, password: v }))} title="Password / PIN"
                className="w-full bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-md px-3 py-2 text-sm text-white mt-1 min-h-[44px]" />
            </div>
            <div>
              <label className="text-xs text-[var(--hmi-text-secondary)]">Role</label>
              <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                className="w-full bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-md px-3 py-2 text-sm text-white outline-none mt-1">
                <option value="operator">Operator</option>
                <option value="supervisor">Supervisor</option>
                <option value="engineer">Engineer</option>
                <option value="designer">Designer</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--hmi-text-secondary)]">Login Mode</label>
              <select value={newUser.login_mode} onChange={e => setNewUser(p => ({ ...p, login_mode: e.target.value }))}
                className="w-full bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-md px-3 py-2 text-sm text-white outline-none mt-1">
                <option value="password">Password</option>
                <option value="pin">PIN</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleCreateUser} className="px-4 py-2 bg-[var(--hmi-accent)] rounded-md text-sm text-white">Create</button>
            <button onClick={() => setShowCreateUser(false)} className="px-4 py-2 bg-[var(--hmi-bg-input)] rounded-md text-sm text-[var(--hmi-text-secondary)]">Cancel</button>
          </div>
        </div>
      )}
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hmi-border)] text-[var(--hmi-text-secondary)]">
              <th className="text-left px-4 py-3 font-medium">Username</th>
              <th className="text-left px-4 py-3 font-medium">Display Name</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-center px-4 py-3 font-medium">Active</th>
              {canManage && <th className="px-4 py-3 font-medium w-16"></th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-[var(--hmi-border)]/50 hover:bg-[var(--hmi-bg-input)]/30">
                <td className="px-4 py-2 text-[var(--hmi-text-primary)]">{u.username}</td>
                <td className="px-4 py-2 text-[var(--hmi-text-secondary)]">{u.display_name}</td>
                <td className="px-4 py-2 capitalize text-[var(--hmi-text-secondary)]">{u.role}</td>
                <td className="px-4 py-2 text-center">{u.is_active ? '\u2713' : '\u2717'}</td>
                {canManage && (
                  <td className="px-4 py-2">
                    <button
                      onClick={() => setDeleteUserTarget(u)}
                      disabled={u.username === user?.username}
                      className="p-1 text-[var(--hmi-text-muted)] hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={u.username === user?.username ? 'Cannot delete yourself' : 'Delete user'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {deleteUserTarget && (
        <DeleteConfirmDialog
          title="Delete User"
          name={deleteUserTarget.username}
          onConfirm={handleDeleteUser}
          onCancel={() => setDeleteUserTarget(null)}
        />
      )}
    </div>
  );
}
