import { useEffect, useState, type ReactNode } from 'react';

import { fetchBlobUrl, type Prioridade, type Status } from './lib/api';
import { NIVEL_ESTOQUE_LABEL, PRIORIDADE_LABEL, STATUS_LABEL, type NivelEstoque as Nivel } from './lib/format';

export const PrioridadePill = ({ p }: { p: Prioridade }) => <span className={`pill pill-${p}`}>{PRIORIDADE_LABEL[p]}</span>;

export const StatusPill = ({ s }: { s: Status }) => <span className={`pill status-${s}`}>{STATUS_LABEL[s]}</span>;

const ICONE_NIVEL: Record<Nivel, string> = { zerado: '✖', baixo: '⚠', ok: '✔' };

/** Nível de estoque: cor + ícone + texto, nunca só a cor. */
export const NivelEstoque = ({ nivel }: { nivel: Nivel }) => (
  <span className={`pill nivel-pill nivel-pill-${nivel}`}>
    <span aria-hidden>{ICONE_NIVEL[nivel]}</span> {NIVEL_ESTOQUE_LABEL[nivel]}
  </span>
);

export function Aviso({ children, tipo = 'erro' }: { children: ReactNode; tipo?: 'erro' | 'info' }) {
  return (
    <p className={`aviso aviso-${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

export const Carregando = () => <p className="muted">Carregando…</p>;

export function Pagina({ titulo, dica, acoes, children }: { titulo: string; dica?: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>{titulo}</h1>
          {dica && <p className="muted">{dica}</p>}
        </div>
        {acoes && <div className="acoes">{acoes}</div>}
      </header>
      {children}
    </section>
  );
}

/** Barras horizontais de uma série só: o valor fica escrito ao lado, então nada depende de cor. */
export function Barras({ itens, vazio = 'Sem dados no período.' }: { itens: { rotulo: string; valor: number; extra?: string }[]; vazio?: string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  if (!itens.length) return <p className="muted">{vazio}</p>;
  return (
    <ul className="barras">
      {itens.map((i) => (
        <li key={i.rotulo}>
          <span className="barra-rotulo">{i.rotulo}</span>
          <span className="barra-trilho">
            <span className="barra-valor" style={{ width: `${(i.valor / max) * 100}%` }} />
          </span>
          <span className="barra-num">
            {i.valor}
            {i.extra ? ` ${i.extra}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Divisão de um total em partes, com legenda escrita (cor + nome + número). */
export function Divisao({ partes }: { partes: { rotulo: string; valor: number; cor: string }[] }) {
  const total = partes.reduce((a, p) => a + p.valor, 0);
  return (
    <div>
      <div className="divisao" role="img" aria-label={partes.map((p) => `${p.rotulo}: ${p.valor}`).join(', ')}>
        {total === 0 ? (
          <span style={{ flex: 1, background: 'var(--chip)' }} />
        ) : (
          partes.filter((p) => p.valor > 0).map((p) => <span key={p.rotulo} style={{ flex: p.valor, background: p.cor }} />)
        )}
      </div>
      <ul className="legenda">
        {partes.map((p) => (
          <li key={p.rotulo}>
            <span className="legenda-cor" style={{ background: p.cor }} />
            {p.rotulo} <strong>{p.valor}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A foto só sai com o token, então é baixada pela API e exibida como blob. */
export function Foto({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    let vivo = true;
    let obj: string | null = null;
    fetchBlobUrl(`/fotos/${id}`)
      .then((u) => {
        obj = u;
        if (vivo) setUrl(u);
      })
      .catch(() => vivo && setFalhou(true));
    return () => {
      vivo = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [id]);
  if (falhou) return <div className="foto foto-vazia">Foto indisponível</div>;
  if (!url) return <div className="foto foto-vazia">Carregando…</div>;
  return <img className="foto" src={url} alt="Foto do defeito no local" />;
}
