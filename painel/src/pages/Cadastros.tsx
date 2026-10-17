import { useMemo, useState, type FormEvent } from 'react';
import { Navigate, useParams } from 'react-router-dom';

import { send, type CargaEquipe, type Equipe, type Material, type Papel, type Prioridade, type TipoDefeito, type Usuario } from '../lib/api';
import { PRIORIDADE_LABEL, nivelEstoque } from '../lib/format';
import { useGet } from '../lib/hooks';
import { Aviso, Carregando, NivelEstoque, Pagina, PrioridadePill } from '../ui';

type Linha = Record<string, unknown> & { id: string };
type Campo = {
  chave: string;
  rotulo: string;
  tipo: 'texto' | 'email' | 'numero' | 'senha' | 'select' | 'check';
  opcoes?: { valor: string; rotulo: string }[];
  obrigatorio?: boolean;
  /** Só editável ao criar (ex.: a chave do defeito é o vínculo com o app). */
  soNaCriacao?: boolean;
  ajuda?: string;
  /** Campo preenchido por leitor óptico: o Enter do leitor não envia o formulário. */
  leitor?: boolean;
  /** Número inteiro (sem casas decimais). */
  inteiro?: boolean;
};
type Config = {
  /** Campo (chave) lido pelo leitor óptico para localizar ou cadastrar direto da lista. */
  busca?: string;
  /** Mostra o botão para definir os materiais que a equipe leva para o campo. */
  carga?: boolean;
  titulo: string;
  dica: string;
  rota: string;
  novo: string;
  campos: Campo[];
  colunas: { rotulo: string; ver: (l: Linha) => React.ReactNode }[];
  inicial: Record<string, unknown>;
};

const PRIORIDADES = (Object.keys(PRIORIDADE_LABEL) as Prioridade[]).map((p) => ({ valor: p, rotulo: PRIORIDADE_LABEL[p] }));
const PAPEIS: { valor: Papel; rotulo: string }[] = [
  { valor: 'campo', rotulo: 'Equipe de campo' },
  { valor: 'gestor', rotulo: 'Gestor' },
  { valor: 'admin', rotulo: 'Administrador' },
];

export default function Cadastros() {
  const { tipo } = useParams();
  const equipes = useGet<Equipe[]>('/equipes');

  const cfg = useMemo<Record<string, Config>>(
    () => ({
      equipes: {
        titulo: 'Equipes',
        dica: 'Equipes de campo que recebem as ordens de serviço.',
        rota: '/equipes',
        carga: true,
        novo: 'Nova equipe',
        inicial: { nome: '', numero: '', veiculo: '', turno: '', urgente: false, ativa: true },
        campos: [
          { chave: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
          { chave: 'numero', rotulo: 'Número', tipo: 'texto' },
          { chave: 'veiculo', rotulo: 'Veículo', tipo: 'texto' },
          { chave: 'turno', rotulo: 'Turno', tipo: 'texto', ajuda: 'Ex.: Saída 07:30h' },
          { chave: 'urgente', rotulo: 'Atende risco iminente (plantão)', tipo: 'check' },
          { chave: 'ativa', rotulo: 'Ativa', tipo: 'check', ajuda: 'Equipes inativas somem das listas.' },
        ],
        colunas: [
          { rotulo: 'Nome', ver: (l) => (l as unknown as Equipe).nome },
          { rotulo: 'Veículo', ver: (l) => (l as unknown as Equipe).veiculo ?? '—' },
          { rotulo: 'Turno', ver: (l) => (l as unknown as Equipe).turno ?? '—' },
          { rotulo: 'Plantão', ver: (l) => ((l as unknown as Equipe).urgente ? 'Risco iminente' : '—') },
        ],
      },
      defeitos: {
        titulo: 'Defeitos e prioridades',
        dica: 'Defina quais defeitos existem e a prioridade de cada um. A prioridade ordena as OS no painel e no app.',
        rota: '/tipos-defeito',
        novo: 'Novo tipo de defeito',
        inicial: { chave: '', nome: '', prioridade: 'media', icone: '', perigoso: false, ativo: true },
        campos: [
          { chave: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
          { chave: 'chave', rotulo: 'Chave', tipo: 'texto', obrigatorio: true, soNaCriacao: true, ajuda: 'Minúsculas e _ (ex.: poste_inclinado). Não muda depois.' },
          { chave: 'prioridade', rotulo: 'Prioridade', tipo: 'select', opcoes: PRIORIDADES, obrigatorio: true },
          { chave: 'icone', rotulo: 'Ícone do app', tipo: 'texto', ajuda: 'Nome de um ícone Ionicons (opcional).' },
          { chave: 'perigoso', rotulo: 'Destacar como perigoso no app', tipo: 'check' },
          { chave: 'ativo', rotulo: 'Ativo', tipo: 'check' },
        ],
        colunas: [
          { rotulo: 'Defeito', ver: (l) => (l as unknown as TipoDefeito).nome },
          { rotulo: 'Prioridade', ver: (l) => <PrioridadePill p={(l as unknown as TipoDefeito).prioridade} /> },
          { rotulo: 'Chave', ver: (l) => (l as unknown as TipoDefeito).chave },
        ],
      },
      materiais: {
        titulo: 'Materiais',
        dica: 'Catálogo usado pelas equipes ao concluir uma OS. O estoque é descontado quando informado.',
        rota: '/materiais',
        novo: 'Novo material',
        busca: 'codigo_barras',
        inicial: { nome: '', codigo_barras: '', unidade: 'un', estoque: null, estoque_minimo: null, ativo: true },
        campos: [
          { chave: 'codigo_barras', rotulo: 'Código de barras', tipo: 'texto', leitor: true, ajuda: 'Clique no campo e passe o leitor óptico. Opcional.' },
          { chave: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
          { chave: 'unidade', rotulo: 'Unidade', tipo: 'texto', obrigatorio: true, ajuda: 'un, m, kg…' },
          { chave: 'estoque', rotulo: 'Estoque atual', tipo: 'numero', inteiro: true, ajuda: 'Deixe vazio para não controlar estoque.' },
          { chave: 'estoque_minimo', rotulo: 'Estoque mínimo', tipo: 'numero', inteiro: true, ajuda: 'Abaixo (ou igual) a este valor o material aparece em alerta de estoque baixo.' },
          { chave: 'ativo', rotulo: 'Ativo', tipo: 'check' },
        ],
        colunas: [
          { rotulo: 'Código', ver: (l) => (l as unknown as Material).codigo_barras ?? '—' },
          { rotulo: 'Material', ver: (l) => (l as unknown as Material).nome },
          { rotulo: 'Unidade', ver: (l) => (l as unknown as Material).unidade },
          {
            rotulo: 'Estoque',
            ver: (l) => {
              const m = l as unknown as Material;
              if (m.estoque === null) return 'Não controlado';
              const nivel = nivelEstoque(Number(m.estoque), m.estoque_minimo === null ? null : Number(m.estoque_minimo));
              return (
                <>
                  {Number(m.estoque)} <NivelEstoque nivel={nivel} />
                </>
              );
            },
          },
          { rotulo: 'Mínimo', ver: (l) => ((l as unknown as Material).estoque_minimo === null ? '—' : Number((l as unknown as Material).estoque_minimo)) },
        ],
      },
      usuarios: {
        titulo: 'Usuários',
        dica: 'Quem acessa o app e o painel. Equipes de campo precisam estar ligadas a uma equipe.',
        rota: '/usuarios',
        novo: 'Novo usuário',
        inicial: { nome: '', email: '', papel: 'campo', equipe_id: '', ativo: true, senha: '' },
        campos: [
          { chave: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
          { chave: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true },
          { chave: 'papel', rotulo: 'Papel', tipo: 'select', opcoes: PAPEIS, obrigatorio: true },
          {
            chave: 'equipe_id',
            rotulo: 'Equipe',
            tipo: 'select',
            opcoes: [{ valor: '', rotulo: 'Sem equipe' }, ...(equipes.data ?? []).map((e) => ({ valor: e.id, rotulo: e.nome }))],
          },
          { chave: 'senha', rotulo: 'Senha', tipo: 'senha', ajuda: 'Mínimo de 8 caracteres. Ao editar, deixe vazio para manter a atual.' },
          { chave: 'ativo', rotulo: 'Ativo', tipo: 'check' },
        ],
        colunas: [
          { rotulo: 'Nome', ver: (l) => (l as unknown as Usuario).nome },
          { rotulo: 'E-mail', ver: (l) => (l as unknown as Usuario).email },
          { rotulo: 'Papel', ver: (l) => PAPEIS.find((p) => p.valor === (l as unknown as Usuario).papel)?.rotulo },
          { rotulo: 'Equipe', ver: (l) => (l as unknown as Usuario).equipe_nome ?? '—' },
          { rotulo: 'Situação', ver: (l) => ((l as unknown as Usuario).ativo ? 'Ativo' : 'Inativo') },
        ],
      },
    }),
    [equipes.data],
  );

  const c = tipo ? cfg[tipo] : undefined;
  if (!c) return <Navigate to="/" replace />;
  return <Crud key={tipo} cfg={c} />;
}

function Crud({ cfg }: { cfg: Config }) {
  const lista = useGet<Linha[]>(cfg.rota === '/usuarios' ? '/usuarios' : cfg.rota);
  const [edit, setEdit] = useState<{ id: string | null; valores: Record<string, unknown> } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [cargaDe, setCargaDe] = useState<Linha | null>(null);
  const [leitura, setLeitura] = useState('');

  // O leitor óptico digita o código e dá Enter: abre o material já cadastrado ou um novo com o código preenchido.
  const lerCodigo = () => {
    const codigo = leitura.trim();
    setLeitura('');
    if (!codigo || !cfg.busca) return;
    const achado = (lista.data ?? []).find((l) => l[cfg.busca!] === codigo);
    if (achado) abrir(achado);
    else setEdit({ id: null, valores: { ...cfg.inicial, [cfg.busca]: codigo } });
  };

  const abrir =(l?: Linha) =>
    setEdit({
      id: l?.id ?? null,
      valores: l
        ? Object.fromEntries(cfg.campos.map((f) => [f.chave, f.tipo === 'senha' ? '' : f.tipo === 'numero' && l[f.chave] != null ? Number(l[f.chave]) : (l[f.chave] ?? (f.tipo === 'check' ? false : ''))]))
        : { ...cfg.inicial },
    });

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setSalvando(true);
    setErro(null);
    const corpo: Record<string, unknown> = {};
    for (const f of cfg.campos) {
      const v = edit.valores[f.chave];
      if (f.soNaCriacao && edit.id) continue;
      if (f.tipo === 'senha') {
        if (v) corpo[f.chave] = v;
      } else if (f.tipo === 'numero') {
        corpo[f.chave] = v === '' || v === null ? null : Number(v);
      } else if (f.tipo === 'select' && v === '') {
        corpo[f.chave] = null;
      } else if (f.tipo === 'texto' && v === '' && !f.obrigatorio) {
        corpo[f.chave] = null;
      } else {
        corpo[f.chave] = v;
      }
    }
    try {
      if (edit.id) await send(`${cfg.rota}/${edit.id}`, 'PUT', corpo);
      else await send(cfg.rota, 'POST', corpo);
      setEdit(null);
      lista.recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const set = (chave: string, valor: unknown) => setEdit((s) => (s ? { ...s, valores: { ...s.valores, [chave]: valor } } : s));

  return (
    <Pagina titulo={cfg.titulo} dica={cfg.dica} acoes={<button onClick={() => abrir()}>{cfg.novo}</button>}>
      {lista.erro && <Aviso>{lista.erro}</Aviso>}
      {cfg.busca && !edit && (
        <div className="card">
          <label className="campo">
            Leitor de código de barras
            <input
              autoFocus
              value={leitura}
              onChange={(e) => setLeitura(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                lerCodigo();
              }}
              placeholder="Clique aqui e passe o leitor"
              autoComplete="off"
            />
            <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
              Código já cadastrado abre o material para editar; código novo abre o cadastro com o código preenchido.
            </span>
          </label>
        </div>
      )}
      <div className="card">
        {lista.carregando && !lista.data ? (
          <Carregando />
        ) : (lista.data ?? []).length === 0 ? (
          <p className="muted">Nada cadastrado ainda.</p>
        ) : (
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  {cfg.colunas.map((col) => (
                    <th key={col.rotulo}>{col.rotulo}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {(lista.data ?? []).map((l) => (
                  <tr key={l.id}>
                    {cfg.colunas.map((col) => (
                      <td key={col.rotulo}>{col.ver(l)}</td>
                    ))}
                    <td className="num">
                      {cfg.carga && (
                        <button className="sec" style={{ marginRight: 8 }} onClick={() => setCargaDe(l)}>
                          Materiais
                        </button>
                      )}
                      <button className="sec" onClick={() => abrir(l)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edit && (
        <div className="modal-fundo" onClick={() => setEdit(null)}>
          <form className="modal" onSubmit={salvar} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={edit.id ? 'Editar' : cfg.novo}>
            <h2 style={{ margin: 0 }}>{edit.id ? 'Editar' : cfg.novo}</h2>
            <div className="form">
              {cfg.campos.map((f) => {
                const v = edit.valores[f.chave];
                const travado = !!(f.soNaCriacao && edit.id);
                if (f.tipo === 'check') {
                  return (
                    <label key={f.chave} className="check">
                      <input type="checkbox" checked={!!v} onChange={(e) => set(f.chave, e.target.checked)} />
                      {f.rotulo}
                    </label>
                  );
                }
                return (
                  <label key={f.chave} className="campo">
                    {f.rotulo}
                    {f.tipo === 'select' ? (
                      <select value={String(v ?? '')} onChange={(e) => set(f.chave, e.target.value)} disabled={travado}>
                        {f.opcoes?.map((o) => (
                          <option key={o.valor} value={o.valor}>
                            {o.rotulo}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.tipo === 'senha' ? 'password' : f.tipo === 'numero' ? 'number' : f.tipo === 'email' ? 'email' : 'text'}
                        step={f.tipo === 'numero' ? (f.inteiro ? 1 : 'any') : undefined}
                        min={f.tipo === 'numero' ? 0 : undefined}
                        value={String(v ?? '')}
                        onChange={(e) => set(f.chave, e.target.value)}
                        required={f.obrigatorio && !(f.tipo === 'senha' && edit.id)}
                        disabled={travado}
                        minLength={f.tipo === 'senha' ? 8 : undefined}
                        autoFocus={f.leitor && !edit.id}
                        onKeyDown={f.leitor ? (e) => e.key === 'Enter' && e.preventDefault() : undefined}
                        autoComplete={f.tipo === 'senha' ? 'new-password' : 'off'}
                      />
                    )}
                    {f.ajuda && <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{f.ajuda}</span>}
                  </label>
                );
              })}
            </div>
            {erro && <Aviso>{erro}</Aviso>}
            <div className="acoes" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="sec" onClick={() => setEdit(null)}>
                Cancelar
              </button>
              <button disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        </div>
      )}
      {cargaDe && <CargaDaEquipe equipe={cargaDe} onClose={() => setCargaDe(null)} />}
    </Pagina>
  );
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Cupom de conferência da carga da equipe (sem valores), pronto para imprimir. */
function imprimirCupom(equipe: Linha, itens: CargaEquipe[]) {
  const agora = new Date();
  const n3 = (n: number) => String(n).padStart(3, '0');
  const linhas = itens
    .map(
      (c, i) => `<div class="item">
        <div class="l1"><span class="n">${n3(i + 1)}</span><span class="d">${esc(c.nome)}</span><span class="q">${esc(c.quantidade)} ${esc(c.unidade)}</span><span class="ck"></span></div>
        <div class="l2">${c.codigo_barras ? `CÓD. ${esc(c.codigo_barras)}` : 'sem código de barras'}</div>
      </div>`,
    )
    .join('');
  const totalUn = itens.reduce((s, c) => s + c.quantidade, 0);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cupom — ${esc(equipe.nome)}</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.35 'Courier New', monospace; color: #000; width: 74mm; margin: 0 auto; padding: 2mm 0; }
  .c { text-align: center; }
  .marca { font: 700 20px/1 Arial, sans-serif; letter-spacing: 4px; margin-top: 2px; }
  .sub { font-size: 10px; letter-spacing: 1px; margin-top: 3px; }
  .titulo { border: 2px solid #000; padding: 5px 4px; margin: 10px 0 8px; font: 700 13px/1.2 Arial, sans-serif; letter-spacing: 1px; }
  .serra { border: 0; border-top: 1px dashed #000; margin: 8px 0; }
  .dados div { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
  .dados b { font-weight: 700; } .dados span { text-align: right; }
  .sec { font: 700 12px Arial, sans-serif; letter-spacing: 1px; background: #000; color: #fff; padding: 3px 6px; margin: 10px 0 4px; }
  .cab, .l1 { display: grid; grid-template-columns: 22px 1fr auto 14px; gap: 6px; align-items: start; }
  .cab { font-size: 10px; font-weight: 700; border-bottom: 1px solid #000; padding-bottom: 2px; }
  .item { padding: 4px 0; border-bottom: 1px dotted #777; }
  .item .d { font-weight: 700; word-break: break-word; } .item .q { font-weight: 700; white-space: nowrap; text-align: right; }
  .ck { width: 11px; height: 11px; border: 1.5px solid #000; margin-top: 1px; }
  .l2 { font-size: 10px; color: #333; margin: 1px 0 0 28px; }
  .total { display: flex; justify-content: space-between; font: 700 13px Arial, sans-serif; padding: 6px 0 2px; }
  .nota { font-size: 10px; text-align: center; margin: 6px 0 0; }
  .ass { margin-top: 30px; border-top: 1px solid #000; padding-top: 3px; text-align: center; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; }
  .rodape { margin-top: 14px; text-align: center; font-size: 10px; }
</style></head><body>
  <div class="c marca">ILUMINE</div>
  <div class="c sub">ILUMINAÇÃO PÚBLICA</div>
  <div class="c titulo">COMPROVANTE DE CARGA<br>DA EQUIPE</div>
  <div class="dados">
    <div><b>Equipe</b><span>${esc(equipe.nome)}${equipe.numero ? ` · nº ${esc(equipe.numero)}` : ''}</span></div>
    ${equipe.veiculo ? `<div><b>Veículo</b><span>${esc(equipe.veiculo)}</span></div>` : ''}
    ${equipe.turno ? `<div><b>Turno</b><span>${esc(equipe.turno)}</span></div>` : ''}
    <div><b>Data</b><span>${agora.toLocaleDateString('pt-BR')}</span></div>
    <div><b>Hora</b><span>${agora.toLocaleTimeString('pt-BR')}</span></div>
  </div>
  <div class="sec">MATERIAIS RECEBIDOS</div>
  <div class="cab"><span>ITEM</span><span>DESCRIÇÃO</span><span>QTD</span><span></span></div>
  ${linhas}
  <hr class="serra">
  <div class="total"><span>ITENS</span><span>${itens.length}</span></div>
  <div class="total" style="padding-top:0"><span>QTD. TOTAL</span><span>${totalUn}</span></div>
  <div class="nota">Marque o quadrado de cada item conferido.</div>
  <div class="ass">Entregue por</div>
  <div class="ass">Recebido por (equipe)</div>
  <div class="rodape">Documento de conferência — sem valor fiscal</div>
  <script>window.onload = function () { window.print(); };</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return alert('O navegador bloqueou a janela do cupom. Libere pop-ups para este site.');
  w.document.write(html);
  w.document.close();
}

/** Materiais que a equipe leva para o campo. Carregar tira do estoque geral; concluir uma OS baixa daqui. */
function CargaDaEquipe({ equipe, onClose }: { equipe: Linha; onClose: () => void }) {
  const carga = useGet<CargaEquipe[]>(`/equipes/${equipe.id}/materiais`);
  const catalogo = useGet<Material[]>('/materiais');
  const [leitura, setLeitura] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [qtd, setQtd] = useState('1');
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const rodar = async (fn: () => Promise<unknown>) => {
    setOcupado(true);
    setErro(null);
    try {
      await fn();
      carga.recarregar();
      catalogo.recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const adicionar = async (id: string) => {
    const n = Number(qtd);
    if (!(n > 0)) return setErro('Informe uma quantidade maior que zero');
    await rodar(() => send(`/equipes/${equipe.id}/materiais`, 'POST', { material_id: id, quantidade: n }));
  };

  const lerCodigo = async () => {
    const codigo = leitura.trim();
    setLeitura('');
    if (!codigo) return;
    const m = (catalogo.data ?? []).find((x) => x.codigo_barras === codigo);
    if (!m) return setErro(`Código ${codigo} não cadastrado em Materiais`);
    await adicionar(m.id);
  };

  const ajustar = (id: string) =>
    rodar(async () => {
      await send(`/equipes/${equipe.id}/materiais/${id}`, 'PUT', { quantidade: Number(edicoes[id]) });
      setEdicoes((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== id)));
    });

  // Alterações de quantidade ainda não gravadas.
  const pendentes = (carga.data ?? []).filter((c) => {
    const v = edicoes[c.material_id];
    return v !== undefined && v !== '' && Number(v) !== c.quantidade;
  });

  const salvarTodos = () =>
    rodar(async () => {
      try {
        for (const c of pendentes) {
          await send(`/equipes/${equipe.id}/materiais/${c.material_id}`, 'PUT', { quantidade: Number(edicoes[c.material_id]) });
        }
      } finally {
        // Mantém só o que não foi gravado (ex.: parou num estoque insuficiente).
        setEdicoes({});
      }
    });

  return (
    <div className="modal-fundo" onClick={onClose}>
      <div className="modal" style={{ width: 'min(760px, 100%)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Materiais da equipe">
        <h2 style={{ margin: 0 }}>Materiais — {String(equipe.nome)}</h2>
        <p className="muted" style={{ margin: 0 }}>
          O que a equipe leva para o campo. Ao carregar, a quantidade sai do estoque geral; ao concluir uma OS, o uso é baixado daqui.
        </p>

        <div className="form">
          <label className="campo">
            Leitor de código de barras
            <input
              autoFocus
              value={leitura}
              onChange={(e) => setLeitura(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                void lerCodigo();
              }}
              placeholder="Passe o leitor: cada leitura soma a quantidade abaixo"
              autoComplete="off"
              disabled={ocupado}
            />
          </label>
          <label className="campo">
            Quantidade por leitura
            <input type="number" min="0" step="any" value={qtd} onChange={(e) => setQtd(e.target.value)} />
          </label>
          <label className="campo">
            Ou escolha o material
            <select value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
              <option value="">Selecione…</option>
              {(catalogo.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome} ({m.estoque === null ? 'estoque não controlado' : `estoque: ${Number(m.estoque)} ${m.unidade}`})
                </option>
              ))}
            </select>
          </label>
          <div className="acoes">
            <button type="button" disabled={ocupado || !materialId} onClick={() => void adicionar(materialId).then(() => setMaterialId(''))}>
              Adicionar à equipe
            </button>
          </div>
        </div>

        {erro && <Aviso>{erro}</Aviso>}
        {carga.erro && <Aviso>{carga.erro}</Aviso>}

        {carga.carregando && !carga.data ? (
          <Carregando />
        ) : (carga.data ?? []).length === 0 ? (
          <p className="muted">Nenhum material carregado nesta equipe.</p>
        ) : (
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Material</th>
                  <th>Quantidade</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(carga.data ?? []).map((c) => {
                  const valor = edicoes[c.material_id] ?? String(c.quantidade);
                  return (
                    <tr key={c.material_id}>
                      <td>{c.codigo_barras ?? '—'}</td>
                      <td>{c.nome}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          style={{ width: 90 }}
                          value={valor}
                          onChange={(e) => setEdicoes((s) => ({ ...s, [c.material_id]: e.target.value }))}
                        />{' '}
                        {c.unidade}
                      </td>
                      <td className="num">
                        <button className="sec" disabled={ocupado || valor === String(c.quantidade) || valor === ''} onClick={() => void ajustar(c.material_id)}>
                          Salvar
                        </button>{' '}
                        <button
                          className="sec"
                          disabled={ocupado}
                          onClick={() => void rodar(() => send(`/equipes/${equipe.id}/materiais/${c.material_id}`, 'PUT', { quantidade: 0 }))}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="acoes" style={{ justifyContent: 'flex-end' }}>
          <button type="button" disabled={ocupado || pendentes.length === 0} onClick={() => void salvarTodos()}>
            Salvar todos{pendentes.length > 0 ? ` (${pendentes.length})` : ''}
          </button>
          <button
            type="button"
            className="sec"
            disabled={(carga.data ?? []).length === 0 || pendentes.length > 0}
            title={pendentes.length > 0 ? 'Salve as alterações antes de gerar o cupom' : undefined}
            onClick={() => imprimirCupom(equipe, carga.data ?? [])}
          >
            Gerar cupom
          </button>
          <button type="button" className="sec" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
