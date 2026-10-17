export type TomLinha = 'zerado' | 'baixo' | 'ok';

export type SecaoPdf = {
  titulo: string;
  colunas: string[];
  linhas: (string | number | null)[][];
  /** Índices das colunas alinhadas à direita (números). */
  direita?: number[];
  vazio?: string;
  /** Barras horizontais desenhadas acima da tabela. */
  barras?: { rotulo: string; valor: number; extra?: string; cor?: string }[];
  /** Colore a linha (mesmo índice de `linhas`), p.ex. estoque baixo/zerado. */
  tons?: (TomLinha | undefined)[];
  /** Mapa de calor nas colunas [de, ate] (inclusive): a intensidade acompanha o número. */
  calor?: [number, number];
  nota?: string;
};

export type AlertaPdf = { tom: 'critico' | 'baixo' | 'ok'; texto: string };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const barras = (b: NonNullable<SecaoPdf['barras']>) => {
  const max = Math.max(1, ...b.map((i) => i.valor));
  return `<div class="barras">${b
    .map(
      (i) =>
        `<div class="b"><span class="bl">${esc(i.rotulo)}</span><span class="bt"><span class="bv" style="width:${(i.valor / max) * 100}%;${i.cor ? `background:${i.cor}` : ''}"></span></span><span class="bn">${esc(i.valor)}${i.extra ? ` ${esc(i.extra)}` : ''}</span></div>`,
    )
    .join('')}</div>`;
};

/**
 * Abre o relatório em A4 já na janela de impressão: é só escolher "Salvar como PDF".
 * Não depende de biblioteca nem do servidor.
 */
export function gerarPdf(opts: {
  titulo: string;
  periodo: string;
  kpis?: { rotulo: string; valor: string | number; apoio?: string }[];
  alertas?: AlertaPdf[];
  secoes: SecaoPdf[];
}) {
  const agora = new Date();
  const secoes = opts.secoes
    .map((s) => {
      const dir = new Set(s.direita ?? []);
      const max = s.calor ? Math.max(1, ...s.linhas.flatMap((l) => l.slice(s.calor![0], s.calor![1] + 1).map((v) => Number(v) || 0))) : 1;
      const cab = s.colunas.map((c, i) => `<th${dir.has(i) ? ' class="r"' : ''}>${esc(c)}</th>`).join('');
      const corpo = s.linhas.length
        ? s.linhas
            .map((l, li) => {
              const tom = s.tons?.[li];
              const cels = l
                .map((v, i) => {
                  const calor = s.calor && i >= s.calor[0] && i <= s.calor[1] && Number(v) > 0 ? ` style="background:rgba(42,120,214,${(0.12 + (Number(v) / max) * 0.5).toFixed(2)})"` : '';
                  return `<td${dir.has(i) ? ' class="r"' : ''}${calor}>${esc(v ?? '—')}</td>`;
                })
                .join('');
              return `<tr${tom ? ` class="t-${tom}"` : ''}>${cels}</tr>`;
            })
            .join('')
        : `<tr><td colspan="${s.colunas.length}" class="vazio">${esc(s.vazio ?? 'Sem dados no período.')}</td></tr>`;
      return `<section><h2>${esc(s.titulo)}</h2>${s.barras?.length ? barras(s.barras) : ''}<table><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody></table>${s.nota ? `<p class="nota">${esc(s.nota)}</p>` : ''}</section>`;
    })
    .join('');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(opts.titulo)} — ${esc(opts.periodo)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font: 12px/1.45 Arial, Helvetica, sans-serif; color: #111; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 4px solid #f5a524; padding-bottom: 8px; margin-bottom: 14px; }
  .marca { font: 700 22px/1 Arial, sans-serif; letter-spacing: 5px; }
  .doc { text-align: right; } .doc h1 { font-size: 17px; margin: 0 0 2px; } .doc div { color: #444; font-size: 11px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
  .kpi { border: 1px solid #ccc; border-left: 5px solid #2a78d6; border-radius: 6px; padding: 6px 10px; }
  .kpi:nth-child(2n) { border-left-color: #eb6834; }
  .kpi b { display: block; font-size: 20px; line-height: 1.2; } .kpi span { font-size: 10.5px; color: #444; display: block; }
  .alerta { display: flex; gap: 8px; align-items: center; border: 1.5px solid; border-radius: 6px; padding: 7px 10px; font-weight: 700; margin-bottom: 8px; }
  .alerta-critico { background: #ffdad6; color: #8c1d18; border-color: #b3261e; }
  .alerta-baixo { background: #ffe7bd; color: #5c3a00; border-color: #f5a524; }
  .alerta-ok { background: #c8f0cf; color: #14532d; border-color: #1f7a3a; }
  section { margin-top: 14px; break-inside: avoid-page; }
  h2 { font-size: 12.5px; margin: 0 0 6px; padding: 4px 8px; background: #111; color: #fff; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; } th { text-align: left; font-size: 10.5px; border-bottom: 1.5px solid #111; padding: 4px 6px; }
  td { padding: 4px 6px; border-bottom: 1px solid #ddd; }
  tbody tr:nth-child(even) td { background-color: #f6f6f6; }
  .t-zerado td { background: #ffdad6 !important; color: #8c1d18; font-weight: 700; }
  .t-baixo td { background: #ffe7bd !important; color: #5c3a00; font-weight: 700; }
  .t-ok td:last-child { color: #14532d; font-weight: 700; }
  .r { text-align: right; white-space: nowrap; } .vazio { color: #666; font-style: italic; }
  .barras { margin: 0 0 8px; } .b { display: grid; grid-template-columns: 34% 1fr 64px; gap: 8px; align-items: center; padding: 2px 0; }
  .bl { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .bt { height: 10px; background: #eee; border-radius: 5px; overflow: hidden; }
  .bv { display: block; height: 100%; background: #2a78d6; border-radius: 5px; } .bn { text-align: right; font-weight: 700; white-space: nowrap; }
  .nota { font-size: 10px; color: #555; margin: 4px 0 0; }
  tr { break-inside: avoid; } thead { display: table-header-group; }
  footer { margin-top: 20px; padding-top: 6px; border-top: 1px solid #bbb; font-size: 10px; color: #555; display: flex; justify-content: space-between; }
  @media screen { body { padding: 16px; max-width: 820px; margin: 0 auto; } }
</style></head><body>
  <header>
    <div class="marca">ILUMINE</div>
    <div class="doc"><h1>${esc(opts.titulo)}</h1><div>Período: ${esc(opts.periodo)}</div></div>
  </header>
  ${opts.kpis?.length ? `<div class="kpis">${opts.kpis.map((k) => `<div class="kpi"><span>${esc(k.rotulo)}</span><b>${esc(k.valor)}</b>${k.apoio ? `<span>${esc(k.apoio)}</span>` : ''}</div>`).join('')}</div>` : ''}
  ${(opts.alertas ?? []).map((a) => `<div class="alerta alerta-${a.tom}"><span>${a.tom === 'critico' ? '✖' : a.tom === 'baixo' ? '⚠' : '✔'}</span>${esc(a.texto)}</div>`).join('')}
  ${secoes}
  <footer><span>Ilumine · iluminação pública</span><span>Emitido em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR')}</span></footer>
  <script>window.onload = function () { window.print(); };</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return alert('O navegador bloqueou a janela do relatório. Libere pop-ups para este site.');
  w.document.write(html);
  w.document.close();
}
