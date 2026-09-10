import { useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { getToken } from './api/client';

export default function App() {
  const [token, setTokenState] = useState<string>(() => getToken());

  if (!token) {
    return <Login onAuthenticated={(t) => setTokenState(t)} />;
  }
  return <Dashboard onLogout={() => setTokenState('')} />;
}
