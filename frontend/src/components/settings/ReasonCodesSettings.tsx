import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Dialog } from '../Dialog';
import type { ReasonCode } from '../../types';

const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500';

export function ReasonCodesSettings() {
  const [codes, setCodes] = useState<ReasonCode[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<ReasonCode | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ReasonCode | null>(null);

  // Form state
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [error, setError] = useState('');

  const loadCodes = useCallback(() => {
    api.getReasonCodes().then(setCodes).catch(() => {});
  }, []);

  useEffect(() => { loadCodes(); }, [loadCodes]);

  const openAdd = useCallback(() => {
    setEditing(null);
    setCode('');
    setDescription('');
    setCategory('');
    setSortOrder(codes.length);
    setError('');
    setShowDialog(true);
  }, [codes.length]);

  const openEdit = useCallback((rc: ReasonCode) => {
    setEditing(rc);
    setCode(rc.code);
    setDescription(rc.description || '');
    setCategory(rc.category || '');
    setSortOrder(rc.sort_order);
    setError('');
    setShowDialog(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!code.trim()) { setError('Code is required'); return; }
    setError('');
    try {
      if (editing) {
        await api.updateReasonCode(editing.id, { code, description, category, sort_order: sortOrder });
      } else {
        await api.createReasonCode({ code, description, category, sort_order: sortOrder });
      }
      setShowDialog(false);
      loadCodes();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    }
  }, [editing, code, description, category, sortOrder, loadCodes]);

  const handleDelete = useCallback(async (rc: ReasonCode) => {
    await api.deleteReasonCode(rc.id);
    setConfirmDelete(null);
    loadCodes();
  }, [loadCodes]);

  const handleToggleActive = useCallback(async (rc: ReasonCode) => {
    await api.updateReasonCode(rc.id, { is_active: !rc.is_active });
    loadCodes();
  }, [loadCodes]);

  // Unique categories for grouping
  const categories = [...new Set(codes.map(c => c.category || 'Uncategorized'))];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Downtime Reason Codes</h2>
          <p className="text-xs text-slate-400 mt-0.5">Managed list of reason codes for consistent downtime tracking and Pareto analysis.</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--hmi-accent)] hover:opacity-90 text-white rounded-lg text-sm font-medium">
          <Plus size={16} /> Add Code
        </button>
      </div>

      {codes.length === 0 ? (
        <div className="text-center text-slate-500 py-12">
          No reason codes configured. Add some to enable categorized downtime tracking.
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-left px-4 py-3 font-medium">Code</th>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-center px-4 py-3 font-medium">Order</th>
                <th className="text-center px-4 py-3 font-medium">Active</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {codes.map(rc => (
                <tr key={rc.id} className={`border-b border-slate-700/50 ${!rc.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-slate-200 font-mono text-xs">{rc.code}</td>
                  <td className="px-4 py-3 text-slate-300">{rc.description || '\u2014'}</td>
                  <td className="px-4 py-3 text-slate-400">{rc.category || '\u2014'}</td>
                  <td className="px-4 py-3 text-center text-slate-400">{rc.sort_order}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleActive(rc)}
                      className={`text-xs px-3 py-1.5 rounded min-h-[44px] flex items-center justify-center ${rc.is_active ? 'bg-green-900/50 text-green-400' : 'bg-slate-700 text-slate-500'}`}
                    >
                      {rc.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(rc)} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-700" title="Edit">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => setConfirmDelete(rc)} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-700" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {categories.length > 0 && (
        <p className="text-xs text-slate-500 mt-3">
          Categories: {categories.join(', ')}
        </p>
      )}

      {/* Add/Edit dialog */}
      {showDialog && (
        <Dialog title={editing ? 'Edit Reason Code' : 'Add Reason Code'} onClose={() => setShowDialog(false)}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Code</label>
              <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. MECHANICAL" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Description</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Category</label>
              <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Equipment, Material, Planned" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Sort Order</label>
              <input type="number" value={sortOrder} onChange={e => setSortOrder(parseInt(e.target.value, 10) || 0)} className={inputCls} />
            </div>
          </div>
          {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowDialog(false)} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-sm">Cancel</button>
            <button onClick={handleSave} className="px-3 py-1.5 bg-[var(--hmi-accent)] hover:opacity-90 text-white rounded-lg text-sm">
              {editing ? 'Update' : 'Add'}
            </button>
          </div>
        </Dialog>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <Dialog title="Deactivate Reason Code" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-slate-300 mb-4">
            Deactivate reason code <span className="font-mono">{confirmDelete.code}</span>? It will no longer appear in dropdowns but historical data will be preserved.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-sm">Cancel</button>
            <button onClick={() => handleDelete(confirmDelete)} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm">Deactivate</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
