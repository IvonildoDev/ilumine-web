import { useMemo, useState } from 'react';

import { send, type Equipe, type Os, type OsDetalhe, type Status } from '../lib/api';
import { PRIORIDADE_RANK, STATUS_LABEL, baixarCsv, fmtData, mapsUrl } from '../lib/format';
import { useGet } from '../lib/hooks';
import { Aviso, Carregando, Foto, Pagina, PrioridadePill, StatusPill } from '../ui';

export default function Ordens() {
  const [status, setStatus] = useState<Status | ''>('');
  const [equipe, setEquipe] = useState('');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);

  const qs = new URLSearchParams({ limite: '500' });
  if (status) qs.set('status', status);
  if (equipe) qs.set('equipe_id', equipe);
  const lista = useGet<Os[]>(`/os?${qs}`);
  const equipes = useGet<Equipe[]>('/equipes');

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista.data ?? [])
      .filter((o) => !q || `${o.codigo} ${o.rua} ${o.bairro} ${o.defeito_nome}`.toLowerCase().includes(q))
      .sort((a, b) => PRIORIDADE_RANK[a.prioridade] - PRIORIDADE_RANK[b.prioridade] || +new Date(b.criado_em) - +new Date(a.criado_em));
  }, [lista.data, busca]);

  const exportar = () =>
    baixarCsv('ordens-de-servico.csv', [
      ['Plaqueta', 'Defeito', 'Prioridade', 'Status', 'Equipe', 'Rua', 'Bairro', 'Latitude', 'Longitude', 'Aberta em', 'Concluída em'],
      ...linhas.map((o) => [o.codigo, o.defeito_nome, o.prioridade, STATUS_LABEL[o.status], o.equipe_nome, o.rua, o.bairro, o.latitude, o.longitude, fmtData(o.criado_em), fmtData(o.concluida_em)]),
    ]);

  return (
    <Pagina
      titulo="Ordens de serviço"
      dica="Ordenadas por prioridade. Clique numa OS para ver detalhes e atribuir equipe."
      acoes={
        <button className="sec" onClick={exportar} disabled={!linhas.length}>
          Exportar CSV
        </button>
      }>
      <div className="filtros">
        <label className="campo">
          Buscar
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Plaqueta, rua, bairro ou defeito" style={{ minWidth: 260 }} />
        </label>
        <label className="campo">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as Status | '')}>
            <option value="">Todos</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          Equipe
          <select value={equipe} onChange={(e) => setEquipe(e.target.value)}>
            <option value="">Todas</option>
            {(equipes.data ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      {lista.erro && <Aviso>{lista.erro}</Aviso>}
      <div className="card">
        {lista.carregando && !lista.data ? (
          <Carregando />
        ) : linhas.length === 0 ? (
          <p className="muted">Nenhuma OS encontrada para esses filtros.</p>
        ) : (
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>Plaqueta</th>
                  <th>Defeito</th>
                  <th>Prioridade</th>
                  <th>Status</th>
                  <th>Equipe</th>
                  <th>Local</th>
                  <th>Aberta em</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((o) => (
                  <tr key={o.id} className="clicavel" onClick={() => setAberta(o.id)}>
                    <td className="codigo">
                      <button className="sec" style={{ border: 0, background: 'none', padding: 0, minHeight: 0, font: 'inherit', fontWeight: 800, color: 'inherit' }} onClick={() => setAberta(o.id)}>
                        {o.codigo}
                      </button>
                    </td>
                    <td>{o.defeito_nome}</td>
                    <td>
                      <PrioridadePill p={o.prioridade} />
                    </td>
                    <td>
                      <StatusPill s={o.status} />
                    </td>
                    <td>{o.equipe_nome ?? <span className="muted">Sem equipe</span>}</td>
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
      </div>

      {aberta && <Detalhe id={aberta} equipes={equipes.data ?? []} onFechar={() => setAberta(null)} onMudou={lista.recarregar} />}
    </Pagina>
  );
}

function Detalhe({ id, equipes, onFechar, onMudou }: { id: string; equipes: Equipe[]; onFechar: () => void; onMudou: () => void }) {
  const { data: os, erro, recarregar } = useGet<OsDetalhe>(`/os/${id}`);
  const [equipeSel, setEquipeSel] = useState<string | null>(null);
  const [statusSel, setStatusSel] = useState<Status | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  const salvar = async () => {
    if (!os) return;
    setSalvando(true);
    setFalha(null);
    try {
      await send(`/os/${id}`, 'PATCH', {
        ...(equipeSel !== null && { equipe_id: equipeSel || null }),
        ...(statusSel !== null && { status: statusSel }),
      });
      setEquipeSel(null);
      setStatusSel(null);
      recarregar();
      onMudou();
    } catch (e) {
      setFalha((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const mudou = equipeSel !== null || statusSel !== null;

  return (
    <div className="gaveta-fundo" onClick={onFechar}>
      <aside className="gaveta" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Detalhe da OS">
        <div className="pagina-topo">
          <h1>{os?.codigo ?? 'OS'}</h1>
          <button className="sec" onClick={onFechar}>
            Fechar
          </button>
        </div>
        {erro && <Aviso>{erro}</Aviso>}
        {!os ? (
          !erro && <Carregando />
        ) : (
          <>
            <div className="acoes">
              <PrioridadePill p={os.prioridade} />
              <StatusPill s={os.status} />
            </div>

            <div className="card">
              <dl className="dados">
                <dt>Defeito</dt>
                <dd>{os.defeito_nome}</dd>
                <dt>Local</dt>
                <dd>
                  {os.rua} · {os.bairro}
                  <br />
                  <a href={mapsUrl(os.latitude, os.longitude)} target="_blank" rel="noreferrer">
                    Abrir no mapa
                  </a>
                </dd>
                <dt>Aberta em</dt>
                <dd>{fmtData(os.criado_em)}</dd>
                <dt>Concluída em</dt>
                <dd>{fmtData(os.concluida_em)}</dd>
                {os.observacao && (
                  <>
                    <dt>Observação</dt>
                    <dd>{os.observacao}</dd>
                  </>
                )}
              </dl>
            </div>

            <div className="card">
              <h2>Atendimento</h2>
              <div className="form">
                <label className="campo">
                  Equipe
                  <select value={equipeSel ?? os.equipe_id ?? ''} onChange={(e) => setEquipeSel(e.target.value)}>
                    <option value="">Sem equipe</option>
                    {equipes.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="campo">
                  Status
                  <select value={statusSel ?? os.status} onChange={(e) => setStatusSel(e.target.value as Status)}>
                    {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {falha && <Aviso>{falha}</Aviso>}
              <p style={{ marginBottom: 0 }}>
                <button onClick={salvar} disabled={!mudou || salvando}>
                  {salvando ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </p>
            </div>

            {os.fotos.length > 0 && (
              <div className="card">
                <h2>Fotos</h2>
                <div className="fotos">
                  {os.fotos.map((f) => (
                    <Foto key={f} id={f} />
                  ))}
                </div>
              </div>
            )}

            <div className="card">
              <h2>Materiais usados</h2>
              {os.materiais.length === 0 ? (
                <p className="muted">Nenhum material informado.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {os.materiais.map((m) => (
                    <li key={m.material_id}>
                      {Number(m.quantidade)} {m.unidade} · {m.nome}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card">
              <h2>Histórico</h2>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {os.historico.map((h, i) => (
                  <li key={i}>
                    {fmtData(h.criado_em)} · {h.de_status ? `${STATUS_LABEL[h.de_status]} → ` : ''}
                    {STATUS_LABEL[h.para_status]}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
