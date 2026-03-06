import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { UserData } from '../types';

interface Props {
  onLogin: (token: string, user: UserData) => void;
}

export function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<'password' | 'pin'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="w-full max-w-sm bg-slate-800 rounded-2xl p-6 border border-slate-700">
        <h1 className="text-xl font-bold text-center text-slate-100 mb-1">Industrial HMI</h1>
        <p className="text-sm text-center text-slate-400 mb-6">Sign in to continue</p>

        {/* Mode toggle */}
        <div className="flex gap-1 mb-4 bg-slate-900 rounded-lg p-1">
          <button
            onClick={() => setMode('password')}
            className={`flex-1 py-2 text-sm rounded-md font-medium ${
              mode === 'password' ? 'bg-blue-600 text-white' : 'text-slate-400'
            }`}
          >
            Username
          </button>
          <button
            onClick={() => setMode('pin')}
            className={`flex-1 py-2 text-sm rounded-md font-medium ${
              mode === 'pin' ? 'bg-blue-600 text-white' : 'text-slate-400'
            }`}
          >
            PIN
          </button>
        </div>

        {error && (
          <div className="bg-red-500/20 text-red-400 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>
        )}

        {mode === 'password' ? (
          <form onSubmit={handlePasswordLogin} className="space-y-3">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
              autoFocus
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
            />
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium">
              Sign In
            </button>
          </form>
        ) : (
          <form onSubmit={handlePinLogin} className="space-y-3">
            <input
              type="password"
              placeholder="Enter PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white text-center text-2xl tracking-widest outline-none focus:border-blue-500"
              maxLength={8}
              autoFocus
            />
            {/* PIN pad */}
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((n, i) => (
                <button
                  key={i}
                  type={n === 'del' ? 'button' : 'button'}
                  onClick={() => {
                    if (n === 'del') setPin(p => p.slice(0, -1));
                    else if (n !== null) setPin(p => p + String(n));
                  }}
                  className={`py-3 rounded-lg text-lg font-medium ${
                    n === null ? 'invisible' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                  }`}
                >
                  {n === 'del' ? '⌫' : n}
                </button>
              ))}
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium">
              Sign In with PIN
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
