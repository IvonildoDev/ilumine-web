import { useCallback, useEffect, useState } from 'react';

import { api } from './api';

/** Carrega um GET e permite recarregar depois de uma alteração. */
export function useGet<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(path !== null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCarregando(true);
    api<T>(path)
      .then((d) => vivo && (setData(d), setErro(null)))
      .catch((e: Error) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [path, tick]);

  const recarregar = useCallback(() => setTick((t) => t + 1), []);
  return { data, erro, carregando, recarregar };
}
