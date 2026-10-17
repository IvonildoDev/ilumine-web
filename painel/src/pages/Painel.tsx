import { Link } from 'react-router-dom';

import { type Os, type Resumo } from '../lib/api';
import { PRIORIDADE_RANK, STATUS_LABEL, fmtData, fmtHoras } from '../lib/format';
import { useGet } from '../lib/hooks';
import { Aviso, Barras, Carregando, Divisao, Pagina, PrioridadePill } from '../ui';

const COR_STATUS = { aguardando: 'var(--accent)', em_rota: 'var(--info)', concluido: 'var(--success)' } as const;

export default function Painel() {
  const resumo = useGet<Resumo>('/relatorios/resumo');
  const abertas = useGet<Os[]>('/os?status=aguardando&limite=200');

  if (resumo.erro) return <Aviso>{resumo.erro}</Aviso>;
  if (!resumo.data) return <Carregando />;
  const r = resumo.data;

  const total = (s: keyof typeof COR_STATUS) => r.por_status.find((x) => x.status === s)?.total ?? 0;
  const emAberto = total('aguardando') + total('em_rota');
  const criticas = [...(abertas.data ?? [])]
    .sort((a, b) => PRIORIDADE_RANK[a.prioridade] - PRIORIDADE_RANK[b.prioridade] || +new Date(a.criado_em) - +new Date(b.criado_em))
    .slice(0, 6);

  return (
    <Pagina titulo="Visão geral" dica="Últimos 30 dias">
      <div className="card">
        <p className="resumo">
          <strong>{emAberto}</strong> OS em aberto
          {' · '}tempo médio de atendimento <strong>{fmtHoras(r.horas_medias_atendimento)}</strong>
        </p>
        <Divisao partes={(['aguardando', 'em_rota', 'concluido'] as const).map((s) => ({ rotulo: STATUS_LABEL[s], valor: total(s), cor: COR_STATUS[s] }))} />
      </div>

      <div className="card">
        <h2>Próximas a atender</h2>
        {abertas.erro && <Aviso>{abertas.erro}</Aviso>}
        {abertas.carregando && !abertas.data ? (
          <Carregando />
        ) : criticas.length === 0 ? (
          <p className="muted">Nenhuma OS aguardando equipe.</p>
        ) : (
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>Plaqueta</th>
                  <th>Defeito</th>
                  <th>Prioridade</th>
                  <th>Local</th>
                  <th>Aberta em</th>
                </tr>
              </thead>
              <tbody>
                {criticas.map((o) => (
                  <tr key={o.id}>
                    <td className="codigo">{o.codigo}</td>
                    <td>{o.defeito_nome}</td>
                    <td>
                      <PrioridadePill p={o.prioridade} />
                    </td>
                    <td>
                      {o.rua} · {o.bairro}
                    </td>
                    <td>{fmtData(o.criado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ marginBottom: 0 }}>
          <Link to="/ordens">Ver todas as ordens de serviço</Link>
        </p>
      </div>

      <div className="grade">
        <div className="card">
          <h2>Por tipo de defeito</h2>
          <Barras itens={r.por_defeito.map((d) => ({ rotulo: d.nome, valor: d.total }))} />
        </div>
        <div className="card">
          <h2>Bairros com mais ocorrências</h2>
          <Barras itens={r.por_bairro.map((b) => ({ rotulo: b.bairro, valor: b.total }))} />
        </div>
      </div>

      <div className="card">
        <h2>Equipes</h2>
        {r.por_equipe.length === 0 ? (
          <p className="muted">Sem dados no período.</p>
        ) : (
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>Equipe</th>
                  <th className="num">OS</th>
                  <th className="num">Concluídas</th>
                  <th className="num">Tempo médio</th>
                </tr>
              </thead>
              <tbody>
                {r.por_equipe.map((e) => (
                  <tr key={e.nome}>
                    <td>{e.nome}</td>
                    <td className="num">{e.total}</td>
                    <td className="num">{e.concluidas}</td>
                    <td className="num">{fmtHoras(e.horas_medias)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Pagina>
  );
}
