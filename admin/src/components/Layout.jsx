import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';

const navItems = [
  { to: '/config', label: 'Configurações' },
  { to: '/slots', label: 'Horários' },
  { to: '/appointments', label: 'Agendamentos' },
  { to: '/contacts', label: 'Contatos' },
];

export function Layout({ children }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex">
      <nav className="w-48 bg-slate-900 text-white flex flex-col p-4 gap-2">
        <p className="text-sm font-semibold text-slate-400 mb-4">Agendamentos</p>
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `text-sm px-3 py-2 rounded hover:bg-slate-700 transition-colors ${
                isActive ? 'bg-slate-700 text-white' : 'text-slate-300'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="mt-auto text-slate-300 hover:text-white"
          onClick={handleLogout}
        >
          Sair
        </Button>
      </nav>
      <main className="flex-1 p-6 bg-slate-50 overflow-auto">{children}</main>
    </div>
  );
}
