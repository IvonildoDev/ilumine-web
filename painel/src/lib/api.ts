const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';
const KEY = 'ilumine.painel.token';

export const getToken = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
export const setToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch {
    // Sem armazenamento (janela privada): a sessão vale só até recarregar.
  }
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('Não foi possível falar com o servidor. Confira se a API está no ar.', 0);
  }
  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('ilumine:sessao-expirada'));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.erro ?? `Erro ${res.status}`, res.status);
  }
  return res;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return (await request(path, init)).json() as Promise<T>;
}

export const send = <T>(path: string, method: 'POST' | 'PUT' | 'PATCH', body: unknown) =>
  api<T>(path, { method, body: JSON.stringify(body) });

export async function fetchBlobUrl(path: string): Promise<string> {
  return URL.createObjectURL(await (await request(path)).blob());
}

// ---------- tipos ----------
export type Prioridade = 'critica' | 'alta' | 'media';
export type Status = 'aguardando' | 'em_rota' | 'concluido';
export type Papel = 'campo' | 'gestor' | 'admin';

export type Me = { id: string; nome: string; email: string; papel: Papel; equipe_id: string | null };

export type Os = {
  id: string;
  codigo: string;
  status: Status;
  latitude: number;
  longitude: number;
  rua: string;
  bairro: string;
  equipe_id: string | null;
  equipe_nome: string | null;
  observacao: string | null;
  criado_em: string;
  concluida_em: string | null;
  defeito: string;
  defeito_nome: string;
  prioridade: Prioridade;
  fotos: string[];
};

export type OsDetalhe = Os & {
  materiais: { material_id: string; nome: string; unidade: string; quantidade: string }[];
  historico: { de_status: Status | null; para_status: Status; equipe_id: string | null; criado_em: string }[];
};

export type Equipe = { id: string; nome: string; numero: string | null; veiculo: string | null; turno: string | null; urgente: boolean; ativa: boolean };
export type TipoDefeito = { id: string; chave: string; nome: string; prioridade: Prioridade; icone: string | null; perigoso: boolean; ativo: boolean };
export type Material = { id: string; nome: string; unidade: string; estoque: string | null; estoque_minimo: string | null; codigo_barras: string | null; ativo: boolean };
export type CargaEquipe = { material_id: string; nome: string; unidade: string; codigo_barras: string | null; quantidade: number };
export type Usuario = { id: string; nome: string; email: string; papel: Papel; equipe_id: string | null; equipe_nome: string | null; ativo: boolean };

export type Resumo = {
  periodo: { de: string; ate: string };
  por_status: { status: Status; total: number }[];
  por_prioridade: { prioridade: Prioridade; total: number }[];
  por_defeito: { nome: string; prioridade: Prioridade; total: number }[];
  por_bairro: { bairro: string; total: number }[];
  por_equipe: { nome: string; total: number; concluidas: number; horas_medias: string | null }[];
  por_equipe_defeito: { equipe: string; defeito: string; total: number; concluidas: number }[];
  abertas_por_dia: { dia: string; total: number }[];
  concluidas_por_dia: { dia: string; total: number }[];
  horas_medias_atendimento: string | null;
};

export type RelMateriais = {
  por_material: { nome: string; unidade: string; quantidade: number; os: number }[];
  por_equipe: { equipe: string; material: string; unidade: string; quantidade: number }[];
  estoque: { nome: string; unidade: string; estoque: number; estoque_minimo: number | null }[];
};
