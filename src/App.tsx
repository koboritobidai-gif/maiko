import { useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { getPass, getToken } from './api/client';

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => !!(getToken() || getPass()));

  if (!authed) {
    return <Login onAuthenticated={() => setAuthed(true)} />;
  }
  return <Dashboard onLogout={() => setAuthed(false)} />;
}
