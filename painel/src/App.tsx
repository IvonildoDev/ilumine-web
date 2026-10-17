import { NavLink, Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './lib/auth';
import Cadastros from './pages/Cadastros';
import Login from './pages/Login';
import Ordens from './pages/Ordens';
import Painel from './pages/Painel';
import Relatorios from './pages/Relatorios';
import { Aviso, Carregando } from './ui';

export default function App() {
  const { me, carregando, sair } = useAuth();

  if (carregando) return <div className="login"><Carregando /></div>;
  if (!me) return <Login />;
  if (me.papel === 'campo') {
    return (
      <div className="login">
        <div className="card" style={{ maxWidth: 420 }}>
          <Aviso tipo="info">O painel é para gestores e administradores. Equipes de campo usam o aplicativo.</Aviso>
          <p>
            <button onClick={sair}>Sair</button>
          </p>
        </div>
      </div>
    );
  }
  const admin = me.papel === 'admin';

  return (
    <div className="shell">
      <nav className="lateral" aria-label="Principal">
        <div className="marca">
          <span className="marca-logo" aria-hidden>
            ☀
          </span>
          Ilumine
        </div>
        <NavLink to="/" end>
          Visão geral
        </NavLink>
        <NavLink to="/ordens">Ordens de serviço</NavLink>
        <NavLink to="/relatorios">Relatórios</NavLink>
        {admin && (
          <>
            <NavLink to="/cadastros" end className="grupo">
              Cadastros
            </NavLink>
            <NavLink to="/cadastros/equipes">Equipes</NavLink>
            <NavLink to="/cadastros/defeitos">Defeitos e prioridades</NavLink>
            <NavLink to="/cadastros/materiais">Materiais</NavLink>
            <NavLink to="/cadastros/usuarios">Usuários</NavLink>
          </>
        )}
        <div className="rodape">
          <strong>{me.nome}</strong>
          <div className="muted">{me.papel === 'admin' ? 'Administrador' : 'Gestor'}</div>
          <button className="sec" style={{ marginTop: 8 }} onClick={sair}>
            Sair
          </button>
        </div>
      </nav>
      <main className="conteudo">
        <Routes>
          <Route path="/" element={<Painel />} />
          <Route path="/ordens" element={<Ordens />} />
          <Route path="/relatorios" element={<Relatorios />} />
          {admin && <Route path="/cadastros" element={<Navigate to="/cadastros/equipes" replace />} />}
          {admin && <Route path="/cadastros/:tipo" element={<Cadastros />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
