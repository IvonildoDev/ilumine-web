import { useState, type FormEvent } from 'react';

import { useAuth } from '../lib/auth';
import { Aviso } from '../ui';

export default function Login() {
  const { entrar } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await entrar(email.trim(), senha);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login">
      <form className="card" onSubmit={enviar}>
        <div>
          <h1>Ilumine</h1>
          <p className="muted">Painel de gestão da iluminação pública</p>
        </div>
        {erro && <Aviso>{erro}</Aviso>}
        <label className="campo">
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label className="campo">
          Senha
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
        </label>
        <button disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
