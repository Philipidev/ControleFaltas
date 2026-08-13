/**
 * §7.1 — a marcação de atestado.
 *
 * Sobrou uma função, e ela existe porque as duas pontas não têm o mesmo
 * formato: um atestado cobre um **período**, e uma falta é de um **dia**.
 * Ficar doente de segunda a sexta são oito faltas em quatro disciplinas, e
 * marcar uma a uma seria o app cobrando pelo que ele já sabe.
 *
 * O que este módulo NÃO faz, e não deve voltar a fazer:
 *
 * - **Não há prazo.** Havia `PRAZO_ATESTADO_DIAS = 7` e uma contagem
 *   regressiva por falta, espelhando o trigger `trg_prazo_atestado`. A janela
 *   de 7 dias é da secretaria; um app de controle pessoal que trava o registro
 *   só impede a pessoa de anotar o que aconteceu de verdade.
 * - **Não há desconto.** A marcação não entra em `horasQueContam` — ver o
 *   comentário lá, em risco.ts. Atestado é registro de que o papel existe.
 */

/**
 * As faltas que uma marcação por intervalo alcança.
 *
 * Só as **já registradas**: o app não guarda o período do atestado em lugar
 * nenhum, então uma falta lançada depois desta chamada não entra sozinha. O
 * número existe justamente para essa limitação ficar visível na tela antes de
 * confirmar, em vez de virar surpresa — daí o rótulo falar em "faltas já
 * registradas" e não em "até o dia tal".
 *
 * Já marcadas ficam de fora: a contagem promete quantas vão MUDAR.
 */
export function faltasCobertasPorAtestado<T extends { data: string; justificada: boolean }>(
  faltas: readonly T[],
  de: string,
  ate: string,
): T[] {
  // Um intervalo que não passa do próprio dia não é intervalo: a falta que
  // está sendo criada já leva a marcação pelo insert.
  if (ate <= de) return []
  return faltas.filter((f) => !f.justificada && f.data >= de && f.data <= ate)
}
