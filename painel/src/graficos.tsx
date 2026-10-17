import { useMemo, useState, type ReactNode } from 'react';

import { fmtDia, nivelEstoque } from './lib/format';
import { NivelEstoque } from './ui';

/** Número de destaque (KPI) com um texto de apoio. `tom` só colore a margem, o texto continua em tinta normal. */
export function Kpi({ rotulo, valor, apoio, tom }: { rotulo: string; valor: ReactNode; apoio?: string; tom?: 'serie1' | 'serie2' | 'ok' | 'alerta' }) {
  return (
    <div className={`kpi${tom ? ` kpi-${tom}` : ''}`}>
      <span className="kpi-rotulo">{rotulo}</span>
      <strong className="kpi-valor">{valor}</strong>
      {apoio && <span className="kpi-apoio">{apoio}</span>}
    </div>
  );
}

export type Serie = { nome: string; cor: string; valores: number[] };

const W = 720;
const H = 240;
const M = { t: 12, r: 16, b: 28, l: 36 };

/** Último dia (inclusive) de uma sequência de dias consecutivos entre `de` e `ate` (YYYY-MM-DD), com no máximo 120 dias. */
export function diasDoPeriodo(de: string, ate: string) {
  const out: string[] = [];
  const fim = new Date(`${ate}T00:00:00Z`).getTime();
  for (let t = new Date(`${de}T00:00:00Z`).getTime(); t <= fim && out.length < 120; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

const teto = (max: number) => {
  if (max <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / (p / 2)) * (p / 2);
};

/** Linhas de 2px, grade discreta, cruz + dica ao passar o mouse. Ao menos 2 séries: a legenda fica sempre visível. */
export function Linhas({ dias, series, rotuloY = 'OS' }: { dias: string[]; series: Serie[]; rotuloY?: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = useMemo(() => teto(Math.max(1, ...series.flatMap((s) => s.valores))), [series]);
  const n = dias.length;
  const x = (i: number) => M.l + (n <= 1 ? (W - M.l - M.r) / 2 : (i / (n - 1)) * (W - M.l - M.r));
  const y = (v: number) => M.t + (1 - v / max) * (H - M.t - M.b);
  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f * 100) / 100);
  const passo = Math.max(1, Math.ceil(n / 7));

  const mover = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setSel(Math.min(n - 1, Math.max(0, Math.round(((px - M.l) / (W - M.l - M.r)) * (n - 1)))));
  };

  const descricao = series.map((s) => `${s.nome}: total ${s.valores.reduce((a, b) => a + b, 0)}`).join('; ');

  return (
    <div className="grafico">
      <ul className="legenda" style={{ marginBottom: 8 }}>
        {series.map((s) => (
          <li key={s.nome}>
            <span className="legenda-traco" style={{ background: s.cor }} />
            {s.nome} <strong>{s.valores.reduce((a, b) => a + b, 0)}</strong>
          </li>
        ))}
      </ul>
      <div className="grafico-area">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gráfico de linhas por dia. ${descricao}`} onMouseMove={mover} onMouseLeave={() => setSel(null)}>
          {ticksY.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'eixo' : 'grade-h'} />
              <text x={M.l - 6} y={y(t) + 4} textAnchor="end" className="eixo-txt">
                {t}
              </text>
            </g>
          ))}
          {dias.map((d, i) =>
            i % passo === 0 ? (
              <text key={d} x={x(i)} y={H - 8} textAnchor="middle" className="eixo-txt">
                {fmtDia(d)}
              </text>
            ) : null,
          )}
          {series.map((s) => (
            <polyline key={s.nome} fill="none" stroke={s.cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={s.valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
          ))}
          {sel !== null && (
            <g>
              <line x1={x(sel)} x2={x(sel)} y1={M.t} y2={H - M.b} className="cruz" />
              {series.map((s) => (
                <circle key={s.nome} cx={x(sel)} cy={y(s.valores[sel])} r="4.5" fill={s.cor} className="ponto" />
              ))}
            </g>
          )}
          <text x={4} y={10} className="eixo-txt">
            {rotuloY}
          </text>
        </svg>
        {sel !== null && (
          <div className="dica" style={{ left: `${(x(sel) / W) * 100}%` }} role="status">
            <strong>{fmtDia(dias[sel])}</strong>
            {series.map((s) => (
              <span key={s.nome}>
                <i style={{ background: s.cor }} />
                {s.nome}: <b>{s.valores[sel]}</b>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Barras horizontais empilhadas (duas ou mais partes), segmentos separados por 2px e valor escrito em cada linha. */
export function Empilhadas({ linhas, partes }: { linhas: { rotulo: string; valores: number[] }[]; partes: { nome: string; cor: string }[] }) {
  const max = Math.max(1, ...linhas.map((l) => l.valores.reduce((a, b) => a + b, 0)));
  if (!linhas.length) return <p className="muted">Sem dados no período.</p>;
  return (
    <div>
      <ul className="legenda" style={{ marginBottom: 10 }}>
        {partes.map((p) => (
          <li key={p.nome}>
            <span className="legenda-cor" style={{ background: p.cor }} />
            {p.nome}
          </li>
        ))}
      </ul>
      <ul className="barras">
        {linhas.map((l) => {
          const total = l.valores.reduce((a, b) => a + b, 0);
          return (
            <li key={l.rotulo}>
              <span className="barra-rotulo" title={l.rotulo}>
                {l.rotulo}
              </span>
              <span className="barra-trilho" style={{ background: 'transparent', display: 'flex', gap: 2 }} title={partes.map((p, i) => `${p.nome}: ${l.valores[i]}`).join(' · ')}>
                {l.valores.map((v, i) =>
                  v > 0 ? <span key={partes[i].nome} className="barra-valor" style={{ width: `${(v / max) * 100}%`, background: partes[i].cor, borderRadius: 3 }} /> : null,
                )}
              </span>
              <span className="barra-num">{l.valores.join(' / ')}</span>
              <span className="visually-hidden">total {total}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Matriz equipe × tipo de ocorrência: a intensidade da célula acompanha a quantidade e o número fica escrito nela. */
export function Matriz({ linhas, colunas, valor, vazio }: { linhas: string[]; colunas: string[]; valor: (l: string, c: string) => number; vazio?: string }) {
  const max = Math.max(1, ...linhas.flatMap((l) => colunas.map((c) => valor(l, c))));
  if (!linhas.length || !colunas.length) return <p className="muted">{vazio ?? 'Sem serviços no período.'}</p>;
  return (
    <div className="tabela-wrap">
      <table className="matriz">
        <thead>
          <tr>
            <th>Equipe</th>
            {colunas.map((c) => (
              <th key={c} className="num" title={c}>
                {c}
              </th>
            ))}
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const total = colunas.reduce((a, c) => a + valor(l, c), 0);
            return (
              <tr key={l}>
                <td>{l}</td>
                {colunas.map((c) => {
                  const v = valor(l, c);
                  return (
                    <td key={c} className="num celula" style={v > 0 ? { background: `color-mix(in srgb, var(--series-1) ${10 + Math.round((v / max) * 45)}%, transparent)` } : undefined}>
                      {v > 0 ? v : <span className="muted">·</span>}
                    </td>
                  );
                })}
                <td className="num">
                  <strong>{total}</strong>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type ItemEstoque = { nome: string; unidade: string; estoque: number; estoque_minimo: number | null };

const ORDEM = { zerado: 0, baixo: 1, ok: 2 } as const;

/** Estoque atual de cada material com faixa colorida por nível. Cor sempre acompanhada de ícone e texto. */
export function Estoque({ itens }: { itens: ItemEstoque[] }) {
  if (!itens.length) return <p className="muted">Nenhum material com estoque controlado. Informe o estoque em Cadastros → Materiais.</p>;
  const ordenado = [...itens]
    .map((i) => ({ ...i, nivel: nivelEstoque(i.estoque, i.estoque_minimo) }))
    .sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel] || a.nome.localeCompare(b.nome));
  return (
    <ul className="estoque">
      {ordenado.map((i) => {
        const ref = Math.max(i.estoque, (i.estoque_minimo ?? 0) * 2, 1);
        return (
          <li key={i.nome} className={`estoque-${i.nivel}`}>
            <span className="estoque-nome">{i.nome}</span>
            <span className="estoque-trilho" title={i.estoque_minimo === null ? 'Sem estoque mínimo definido' : `Mínimo: ${i.estoque_minimo} ${i.unidade}`}>
              <span className={`estoque-nivel nivel-${i.nivel}`} style={{ width: `${Math.max(0, Math.min(1, i.estoque / ref)) * 100}%` }} />
              {i.estoque_minimo !== null && <span className="estoque-min" style={{ left: `${Math.min(1, i.estoque_minimo / ref) * 100}%` }} />}
            </span>
            <span className="estoque-num">
              {i.estoque} {i.unidade}
              {i.estoque_minimo !== null && <span className="muted"> / mín. {i.estoque_minimo}</span>}
            </span>
            <NivelEstoque nivel={i.nivel} />
          </li>
        );
      })}
    </ul>
  );
}

export const resumoEstoque = (itens: ItemEstoque[]) => {
  const c = { zerado: 0, baixo: 0, ok: 0 };
  for (const i of itens) c[nivelEstoque(i.estoque, i.estoque_minimo)]++;
  return c;
};
