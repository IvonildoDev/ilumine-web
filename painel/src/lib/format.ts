import type { Prioridade, Status } from './api';

export const STATUS_LABEL: Record<Status, string> = {
  aguardando: 'Aguardando equipe',
  em_rota: 'Em rota',
  concluido: 'Concluído',
};

export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  critica: 'Risco iminente',
  alta: 'Alta prioridade',
  media: 'Média',
};

export const PRIORIDADE_RANK: Record<Prioridade, number> = { critica: 0, alta: 1, media: 2 };

export const fmtData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export const fmtDia = (yyyyMmDd: string) => {
  const [, m, d] = yyyyMmDd.split('-');
  return `${d}/${m}`;
};

export const fmtHoras = (h: string | number | null) => {
  if (h === null || h === undefined) return '—';
  const n = Number(h);
  return n >= 48 ? `${(n / 24).toFixed(1)} dias` : `${n.toFixed(1)} h`;
};

export const hoje = () => new Date().toISOString().slice(0, 10);
export const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/** CSV com BOM e separador ";" para abrir direto no Excel em pt-BR. */
export function baixarCsv(nome: string, linhas: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(['﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

export type NivelEstoque = 'zerado' | 'baixo' | 'ok';
/** Zerado: acabou; baixo: no mínimo ou abaixo (quando há mínimo definido). */
export const nivelEstoque = (estoque: number, minimo: number | null): NivelEstoque =>
  estoque <= 0 ? 'zerado' : minimo !== null && estoque <= minimo ? 'baixo' : 'ok';

export const NIVEL_ESTOQUE_LABEL: Record<NivelEstoque, string> = { zerado: 'Zerado', baixo: 'Estoque baixo', ok: 'Estoque ok' };
