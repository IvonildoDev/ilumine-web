import { useMemo, useState } from 'react';

import { Empilhadas, Estoque, Kpi, Linhas, Matriz, diasDoPeriodo, resumoEstoque } from '../graficos';
import { type RelMateriais, type Resumo } from '../lib/api';
import { NIVEL_ESTOQUE_LABEL, PRIORIDADE_LABEL, diasAtras, fmtDia, fmtHoras, hoje, nivelEstoque } from '../lib/format';
import { useGet } from '../lib/hooks';
import { gerarPdf, type AlertaPdf } from '../lib/pdf';
import { Aviso, Barras, Carregando, Divisao, Pagina } from '../ui';

const COR_STATUS = { aguardando: 'var(--series-2)', em_rota: 'var(--info)', concluido: 'var(--series-1)' } as const;
const NOME_STATUS = { aguardando: 'Aguardando equipe', em_rota: 'Em rota', concluido: 'Concluído' } as const;
const COR_PRIORIDADE = { critica: 'var(--danger)', alta: 'var(--high)', media: 'var(--accent)' } as const;
const MAX_TIPOS = 8;

const pct = (a: number, b: number) => (b === 0 ? '—' : `${Math.round((a / b) * 100)}%`);

export default function Relatorios() {
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hoje());
  const periodo = `de=${de}&ate=${ate}`;
  const valido = de !== '' && ate !== '' && de <= ate;

  const resumo = useGet<Resumo>(valido ? `/relatorios/resumo?${periodo}` : null);
  const mats = useGet<RelMateriais>(valido ? `/relatorios/materiais?${periodo}` : null);
  const r = resumo.data;
  const m = mats.data;

  const periodoTxt = `${fmtDia(de)} a ${fmtDia(ate)}`;

  // ---------- cálculos do período ----------
  const k = useMemo(() => {
    if (!r) return null;
    const por = (s: string) => r.por_status.find((x) => x.status === s)?.total ?? 0;
    const total = r.por_status.reduce((a, x) => a + x.total, 0);
    const concluidas = por('concluido');
    return { total, concluidas, pendentes: total - concluidas, criticas: r.por_prioridade.find((x) => x.prioridade === 'critica')?.total ?? 0, por };
  }, [r]);

  const serie = useMemo(() => {
    if (!r) return null;
    const dias = diasDoPeriodo(de, ate);
    const ab = new Map(r.abertas_por_dia.map((d) => [d.dia, d.total]));
    const co = new Map(r.concluidas_por_dia.map((d) => [d.dia, d.total]));
    return { dias, abertas: dias.map((d) => ab.get(d) ?? 0), concluidas: dias.map((d) => co.get(d) ?? 0) };
  }, [r, de, ate]);

  // Colunas da matriz: os tipos mais frequentes; o resto vai para "Outros".
  const matriz = useMemo(() => {
    if (!r) return null;
    const tipos = r.por_defeito.map((d) => d.nome);
    const topo = tipos.slice(0, MAX_TIPOS);
    const colunas = tipos.length > MAX_TIPOS ? [...topo, 'Outros'] : topo;
    const linhas = r.por_equipe.map((e) => e.nome);
    const valor = (equipe: string, col: string) =>
      r.por_equipe_defeito
        .filter((x) => x.equipe === equipe && (col === 'Outros' && tipos.length > MAX_TIPOS ? !topo.includes(x.defeito) : x.defeito === col))
        .reduce((a, x) => a + x.concluidas, 0);
    return { colunas, linhas, valor };
  }, [r]);

  const nivel = m ? resumoEstoque(m.estoque) : null;
  const alertas = (): AlertaPdf[] => {
    if (!nivel) return [];
    const out: AlertaPdf[] = [];
    if (nivel.zerado) out.push({ tom: 'critico', texto: `${nivel.zerado} material(is) com estoque ZERADO` });
    if (nivel.baixo) out.push({ tom: 'baixo', texto: `${nivel.baixo} material(is) com estoque BAIXO (no mínimo ou abaixo)` });
    if (!nivel.zerado && !nivel.baixo) out.push({ tom: 'ok', texto: 'Nenhum material com estoque baixo ou zerado' });
    return out;
  };

  // ---------- PDF ----------
  const pdfIncidencias = () => {
    if (!r || !k || !serie || !matriz) return;
    gerarPdf({
      titulo: 'Relatório de serviços e ocorrências',
      periodo: periodoTxt,
      kpis: [
        { rotulo: 'Ordens de serviço', valor: k.total, apoio: 'abertas no período' },
        { rotulo: 'Concluídas', valor: k.concluidas, apoio: `${pct(k.concluidas, k.total)} do total` },
        { rotulo: 'Em aberto', valor: k.pendentes, apoio: `${k.por('aguardando')} aguardando · ${k.por('em_rota')} em rota` },
        { rotulo: 'Tempo médio', valor: fmtHoras(r.horas_medias_atendimento), apoio: 'até concluir' },
      ],
      alertas: k.criticas ? [{ tom: 'critico', texto: `${k.criticas} ocorrência(s) de risco iminente no período` }] : [],
      secoes: [
        {
          titulo: 'Tipos de ocorrência',
          barras: r.por_defeito.map((d) => ({ rotulo: d.nome, valor: d.total })),
          colunas: ['Tipo de ocorrência', 'Prioridade', 'Ocorrências'],
          direita: [2],
          linhas: r.por_defeito.map((d) => [d.nome, PRIORIDADE_LABEL[d.prioridade], d.total]),
        },
        {
          titulo: 'Serviços por equipe',
          barras: r.por_equipe.map((e) => ({ rotulo: e.nome, valor: e.concluidas, extra: 'concluídas' })),
          colunas: ['Equipe', 'Recebidas', 'Concluídas', 'Em aberto', 'Conclusão', 'Tempo médio'],
          direita: [1, 2, 3, 4, 5],
          linhas: r.por_equipe.map((e) => [e.nome, e.total, e.concluidas, e.total - e.concluidas, pct(e.concluidas, e.total), fmtHoras(e.horas_medias)]),
        },
        {
          titulo: 'Serviços concluídos por equipe e tipo de ocorrência',
          colunas: ['Equipe', ...matriz.colunas, 'Total'],
          direita: matriz.colunas.map((_, i) => i + 1).concat(matriz.colunas.length + 1),
          calor: [1, matriz.colunas.length],
          linhas: matriz.linhas.map((l) => {
            const v = matriz.colunas.map((c) => matriz.valor(l, c));
            return [l, ...v.map((n) => (n > 0 ? n : '·')), v.reduce((a, b) => a + b, 0)];
          }),
          nota: 'Cada célula é a quantidade de serviços concluídos pela equipe naquele tipo de ocorrência.',
        },
        {
          titulo: 'Por bairro',
          barras: r.por_bairro.map((b) => ({ rotulo: b.bairro, valor: b.total })),
          colunas: ['Bairro', 'Ocorrências'],
          direita: [1],
          linhas: r.por_bairro.map((b) => [b.bairro, b.total]),
        },
        {
          titulo: 'Por dia',
          colunas: ['Dia', 'Abertas', 'Concluídas'],
          direita: [1, 2],
          linhas: serie.dias.map((d, i) => [fmtDia(d), serie.abertas[i], serie.concluidas[i]]).filter((l) => l[1] || l[2]),
        },
      ],
    });
  };

  const pdfMateriais = () => {
    if (!m) return;
    gerarPdf({
      titulo: 'Relatório de materiais e estoque',
      periodo: periodoTxt,
      kpis: nivel
        ? [
            { rotulo: 'Materiais controlados', valor: m.estoque.length },
            { rotulo: 'Estoque zerado', valor: nivel.zerado },
            { rotulo: 'Estoque baixo', valor: nivel.baixo },
            { rotulo: 'Usados no período', valor: m.por_material.length, apoio: 'tipos de material' },
          ]
        : [],
      alertas: alertas(),
      secoes: [
        {
          titulo: 'Estoque atual',
          colunas: ['Material', 'Estoque', 'Mínimo', 'Situação'],
          direita: [1, 2],
          tons: m.estoque.map((e) => nivelEstoque(e.estoque, e.estoque_minimo)),
          linhas: m.estoque.map((e) => [e.nome, `${e.estoque} ${e.unidade}`, e.estoque_minimo === null ? '—' : `${e.estoque_minimo} ${e.unidade}`, NIVEL_ESTOQUE_LABEL[nivelEstoque(e.estoque, e.estoque_minimo)]]),
          vazio: 'Nenhum material com estoque controlado.',
          nota: 'Situação: "Estoque baixo" quando o estoque está no mínimo ou abaixo; "Zerado" quando acabou. Materiais sem mínimo definido só alertam ao zerar.',
        },
        {
          titulo: 'Materiais usados no período',
          barras: m.por_material.map((x) => ({ rotulo: x.nome, valor: x.quantidade, extra: x.unidade })),
          colunas: ['Material', 'Unidade', 'Quantidade', 'OS'],
          direita: [2, 3],
          linhas: m.por_material.map((x) => [x.nome, x.unidade, x.quantidade, x.os]),
        },
        {
          titulo: 'Materiais usados por equipe',
          colunas: ['Equipe', 'Material', 'Quantidade'],
          direita: [2],
          linhas: m.por_equipe.map((x) => [x.equipe, x.material, `${x.quantidade} ${x.unidade}`]),
        },
      ],
    });
  };

  return (
    <Pagina titulo="Relatórios" dica="Serviços das equipes, tipos de ocorrência e materiais, por período.">
      <div className="filtros">
        <label className="campo">
          De
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} max={ate} />
        </label>
        <label className="campo">
          Até
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} min={de} />
        </label>
      </div>
      {!valido && <Aviso>Escolha um período em que a data inicial não seja depois da final.</Aviso>}
      {resumo.erro && <Aviso>{resumo.erro}</Aviso>}
      {mats.erro && <Aviso>{mats.erro}</Aviso>}

      <div className="card">
        <div className="pagina-topo">
          <h2>Serviços e ocorrências</h2>
          <button className="sec" onClick={pdfIncidencias} disabled={!r}>
            Gerar PDF
          </button>
        </div>
        {!r || !k || !serie || !matriz ? (
          valido && <Carregando />
        ) : (
          <>
            <div className="kpis">
              <Kpi rotulo="Ordens de serviço" valor={k.total} apoio="abertas no período" tom="serie1" />
              <Kpi rotulo="Concluídas" valor={k.concluidas} apoio={`${pct(k.concluidas, k.total)} do total`} tom="ok" />
              <Kpi rotulo="Em aberto" valor={k.pendentes} apoio={`${k.por('aguardando')} aguardando · ${k.por('em_rota')} em rota`} tom="serie2" />
              <Kpi rotulo="Risco iminente" valor={k.criticas} apoio={k.criticas ? 'precisam de atenção' : 'nenhum no período'} tom={k.criticas ? 'alerta' : undefined} />
              <Kpi rotulo="Tempo médio" valor={fmtHoras(r.horas_medias_atendimento)} apoio="até concluir" />
            </div>

            <div className="grade" style={{ marginTop: 20 }}>
              <div>
                <h2>Situação das OS</h2>
                <Divisao partes={(['aguardando', 'em_rota', 'concluido'] as const).map((s) => ({ rotulo: NOME_STATUS[s], valor: k.por(s), cor: COR_STATUS[s] }))} />
              </div>
              <div>
                <h2>Por prioridade</h2>
                <Divisao partes={(['critica', 'alta', 'media'] as const).map((p) => ({ rotulo: PRIORIDADE_LABEL[p], valor: r.por_prioridade.find((x) => x.prioridade === p)?.total ?? 0, cor: COR_PRIORIDADE[p] }))} />
              </div>
            </div>

            <h2 style={{ marginTop: 24 }}>Evolução por dia</h2>
            <Linhas
              dias={serie.dias}
              series={[
                { nome: 'Concluídas', cor: 'var(--series-1)', valores: serie.concluidas },
                { nome: 'Abertas', cor: 'var(--series-2)', valores: serie.abertas },
              ]}
            />

            <div className="grade" style={{ marginTop: 24 }}>
              <div>
                <h2>Tipos de ocorrência</h2>
                <Barras itens={r.por_defeito.map((d) => ({ rotulo: d.nome, valor: d.total }))} />
              </div>
              <div>
                <h2>Por bairro</h2>
                <Barras itens={r.por_bairro.map((b) => ({ rotulo: b.bairro, valor: b.total }))} />
              </div>
            </div>

            <h2 style={{ marginTop: 24 }}>Serviços por equipe</h2>
            <Empilhadas
              partes={[
                { nome: 'Concluídas', cor: 'var(--series-1)' },
                { nome: 'Em aberto', cor: 'var(--series-2)' },
              ]}
              linhas={r.por_equipe.map((e) => ({ rotulo: e.nome, valores: [e.concluidas, e.total - e.concluidas] }))}
            />
            <div className="tabela-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Equipe</th>
                    <th className="num">Recebidas</th>
                    <th className="num">Concluídas</th>
                    <th className="num">Em aberto</th>
                    <th className="num">Conclusão</th>
                    <th className="num">Tempo médio</th>
                  </tr>
                </thead>
                <tbody>
                  {r.por_equipe.map((e) => (
                    <tr key={e.nome}>
                      <td>{e.nome}</td>
                      <td className="num">{e.total}</td>
                      <td className="num">{e.concluidas}</td>
                      <td className="num">{e.total - e.concluidas}</td>
                      <td className="num">{pct(e.concluidas, e.total)}</td>
                      <td className="num">{fmtHoras(e.horas_medias)}</td>
                    </tr>
                  ))}
                  {r.por_equipe.length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted">
                        Sem dados no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <h2 style={{ marginTop: 24 }}>Serviços concluídos por equipe e tipo de ocorrência</h2>
            <Matriz linhas={matriz.linhas} colunas={matriz.colunas} valor={matriz.valor} />
          </>
        )}
      </div>

      <div className="card">
        <div className="pagina-topo">
          <h2>Materiais e estoque</h2>
          <button className="sec" onClick={pdfMateriais} disabled={!m}>
            Gerar PDF
          </button>
        </div>
        {!m || !nivel ? (
          valido && <Carregando />
        ) : (
          <>
            {m.estoque.length > 0 && (
              <div className={`alerta-estoque alerta-estoque-${nivel.zerado ? 'critico' : nivel.baixo ? 'baixo' : 'ok'}`} role="alert">
                <span aria-hidden>{nivel.zerado ? '✖' : nivel.baixo ? '⚠' : '✔'}</span>
                {nivel.zerado + nivel.baixo === 0 ? (
                  'Estoque em dia: nenhum material baixo ou zerado.'
                ) : (
                  <>
                    {nivel.zerado > 0 && <span>{nivel.zerado} zerado(s)</span>}
                    {nivel.baixo > 0 && <span>{nivel.baixo} com estoque baixo</span>}
                    <span style={{ fontWeight: 400 }}>— reponha os itens destacados abaixo.</span>
                  </>
                )}
              </div>
            )}
            <h2>Estoque atual</h2>
            <Estoque itens={m.estoque} />

            <h2 style={{ marginTop: 24 }}>Materiais usados no período</h2>
            {m.por_material.length === 0 ? (
              <p className="muted">Nenhum material informado em OS concluídas no período.</p>
            ) : (
              <>
                <Barras itens={m.por_material.map((x) => ({ rotulo: x.nome, valor: x.quantidade, extra: x.unidade }))} />
                <h2 style={{ marginTop: 24 }}>Por equipe</h2>
                <div className="tabela-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Equipe</th>
                        <th>Material</th>
                        <th className="num">Quantidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.por_equipe.map((x) => (
                        <tr key={`${x.equipe}-${x.material}`}>
                          <td>{x.equipe}</td>
                          <td>{x.material}</td>
                          <td className="num">
                            {x.quantidade} {x.unidade}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Pagina>
  );
}
