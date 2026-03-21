import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { TouchTextInput } from '../components/widgets/TouchTextInput';
import type { UserData } from '../types';

interface Props {
  onLogin: (token: string, user: UserData) => void;
  siteTitle?: string;
}

export function LoginPage({ onLogin, siteTitle }: Props) {
  const [mode, setMode] = useState<'password' | 'pin'>('pin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handlePasswordLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    try {
      const res = await api.login(username, password);
      onLogin(res.access_token, res.user);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.pinLogin(pin);
      onLogin(res.access_token, res.user);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex items-center justify-center h-screen overflow-auto py-2">
      <div className="w-full max-w-sm bg-[var(--hmi-bg-elevated)] rounded-2xl px-5 py-4 border border-[var(--hmi-border)]">
        <h1 className="text-lg font-bold text-center text-slate-100 mb-0.5">{siteTitle || 'Industrial HMI'}</h1>
        <p className="text-sm text-center text-slate-400 mb-3">Sign in to continue</p>

        {/* Mode toggle */}
        <div className="flex gap-1 mb-2 bg-[var(--hmi-bg-surface)] rounded-lg p-1">
          <button
            onClick={() => setMode('password')}
            className={`flex-1 py-2 min-h-[40px] text-sm rounded-md font-medium ${
              mode === 'password' ? 'bg-[var(--hmi-accent)] text-white' : 'text-slate-400'
            }`}
          >
            Username
          </button>
          <button
            onClick={() => setMode('pin')}
            className={`flex-1 py-2 min-h-[40px] text-sm rounded-md font-medium ${
              mode === 'pin' ? 'bg-[var(--hmi-accent)] text-white' : 'text-slate-400'
            }`}
          >
            PIN
          </button>
        </div>

        {/* Skip login */}
        <button
          onClick={() => navigate('/')}
          className="w-full text-sm py-1.5 min-h-[36px] text-slate-500 hover:text-slate-300 mb-2 transition-colors"
        >
          Continue without signing in
        </button>

        {error && (
          <div className="bg-red-500/20 text-red-400 text-sm px-3 py-1.5 rounded-lg mb-2">{error}</div>
        )}

        {mode === 'password' ? (
          <div className="space-y-2">
            <TouchTextInput
              value={username}
              onChange={setUsername}
              placeholder="Username"
              title="Username"
              className="w-full bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-lg px-3 py-2 min-h-[40px] text-sm text-white flex items-center"
            />
            <TouchTextInput
              value={password}
              onChange={setPassword}
              placeholder="Password"
              title="Password"
              type="password"
              className="w-full bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-lg px-3 py-2 min-h-[40px] text-sm text-white flex items-center"
            />
            <button onClick={handlePasswordLogin} className="w-full bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-dark)] text-white py-2.5 min-h-[44px] rounded-lg text-sm font-medium">
              Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handlePinLogin} className="space-y-2">
            <input
              type="password"
              placeholder="Enter PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-lg px-3 py-2 text-sm text-white text-center text-2xl tracking-widest outline-none focus:border-[var(--hmi-accent)]"
              maxLength={8}
              autoFocus
            />
            {/* PIN pad */}
            <div className="grid grid-cols-3 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((n, i) => (
                <button
                  key={i}
                  type={n === 'del' ? 'button' : 'button'}
                  onClick={() => {
                    if (n === 'del') setPin(p => p.slice(0, -1));
                    else if (n !== null) setPin(p => p + String(n));
                  }}
                  className={`py-2 min-h-[40px] rounded-lg text-lg font-medium ${
                    n === null ? 'invisible' : 'bg-[var(--hmi-bg-input)] hover:bg-[var(--hmi-border-subtle)] text-[var(--hmi-text-primary)]'
                  }`}
                >
                  {n === 'del' ? '⌫' : n}
                </button>
              ))}
            </div>
            <button type="submit" className="w-full bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-dark)] text-white py-2.5 min-h-[44px] rounded-lg text-sm font-medium">
              Sign In with PIN
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
