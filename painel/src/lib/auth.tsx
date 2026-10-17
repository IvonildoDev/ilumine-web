import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, getToken, send, setToken, type Me } from './api';

type Auth = {
  me: Me | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => void;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [carregando, setCarregando] = useState(() => !!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api<Me>('/me')
      .then(setMe)
      .catch(() => setToken(null))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    const onExpira = () => setMe(null);
    window.addEventListener('ilumine:sessao-expirada', onExpira);
    return () => window.removeEventListener('ilumine:sessao-expirada', onExpira);
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const r = await send<{ token: string }>('/auth/login', 'POST', { email, senha });
    setToken(r.token);
    setMe(await api<Me>('/me'));
  }, []);

  const sair = useCallback(() => {
    setToken(null);
    setMe(null);
  }, []);

  const value = useMemo(() => ({ me, carregando, entrar, sair }), [me, carregando, entrar, sair]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
