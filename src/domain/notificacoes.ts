/**
 * Para onde cada alerta leva — TypeScript puro, sem React e sem rede.
 *
 * §6 dá o alerta, mas não diz o que fazer com ele. Um aviso de "Fulano quer
 * entrar na sua comunidade" que só pode ser marcado como lido obriga a pessoa
 * a procurar a turma na mão — o alerta avisa e abandona. Aqui cada tipo ganha
 * o destino que resolve o assunto.
 *
 * O `dados` da notificação é jsonb: chega como `unknown` e é lido com guarda,
 * nunca com cast. Um alerta antigo, gravado antes de o campo existir, tem que
 * degradar para "sem link" em vez de gerar `/comunidades/undefined`.
 */

import type { TipoNotificacao } from '@/types/database.ts'

/** Faixas de risco e prazo apontam para a disciplina; grupo, para a turma. */
export type DestinoAlerta = string | null

/**
 * Lê uma chave string de um jsonb sem confiar no formato.
 *
 * `dados` é `Json` no tipo gerado, o que inclui array, número e null. Sem esta
 * guarda, `dados.grupoId` seria um erro de tipo — e um `as` calaria o erro
 * mantendo o bug.
 */
export function textoEm(dados: unknown, chave: string): string | null {
  if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) return null
  const valor = (dados as Record<string, unknown>)[chave]
  return typeof valor === 'string' && valor !== '' ? valor : null
}

/**
 * A rota que resolve o alerta, ou null quando não há para onde ir.
 *
 * `resumo_semanal` e `streak` não têm destino de propósito: o conteúdo do
 * alerta já é a informação inteira. Mandar para algum lugar seria movimento
 * sem ganho.
 */
export function destinoDoAlerta(
  tipo: TipoNotificacao,
  dados: unknown,
  disciplinaId: string | null,
): DestinoAlerta {
  switch (tipo) {
    case 'convite_grupo':
    case 'solicitacao_grupo':
    case 'resposta_grupo': {
      const grupoId = textoEm(dados, 'grupoId')
      return grupoId === null ? null : `/comunidades/${grupoId}`
    }

    case 'faixa_alterada':
    case 'aviso_preventivo':
      return disciplinaId === null ? null : `/disciplinas/${disciplinaId}`

    // O prazo se resolve anexando o atestado, e isso vive na tela de faltas.
    case 'prazo_atestado':
      return '/faltas'

    // A virada de semestre se resolve arquivando, e o arquivo mora em
    // Relatórios — junto do backup, que é o passo anterior.
    case 'virada_semestre':
      return '/relatorios'

    case 'resumo_semanal':
    case 'streak':
      return null
  }
}

/**
 * O emoji que abre a linha do alerta.
 *
 * Os títulos vindos do banco já começam com emoji nas notificações de
 * comunidade ('🙋 Novo pedido...'). Repetir ao lado ficaria duplicado, então
 * quem já traz emoji no título é marcado aqui como `null` e a tela não
 * desenha o segundo.
 */
export function emojiDoAlerta(tipo: TipoNotificacao, titulo: string): string | null {
  if (comecaComEmoji(titulo)) return null

  const porTipo: Readonly<Record<TipoNotificacao, string>> = {
    faixa_alterada: '📊',
    aviso_preventivo: '⚠️',
    resumo_semanal: '🗓️',
    prazo_atestado: '📄',
    streak: '🔥',
    convite_grupo: '✉️',
    solicitacao_grupo: '🙋',
    resposta_grupo: '👥',
    virada_semestre: '🗄️',
  }
  return porTipo[tipo]
}

/**
 * Detecta emoji no início do texto.
 *
 * `\p{Extended_Pictographic}` em vez de `\p{Emoji}`: este último dá true para
 * os dígitos 0–9 e para `#` e `*`, porque eles participam de emojis de teclado
 * (`1️⃣`). Um título começando com "3 disciplinas..." viraria falso positivo e
 * perderia o ícone.
 */
function comecaComEmoji(texto: string): boolean {
  return /^\p{Extended_Pictographic}/u.test(texto.trimStart())
}

/**
 * O rótulo curto que explica o que fazer, quando há destino.
 *
 * Aparece como afordância: sem ele, um cartão clicável parece um cartão comum
 * e a pessoa não descobre que dá para tocar.
 */
export function acaoDoAlerta(tipo: TipoNotificacao): string | null {
  switch (tipo) {
    case 'convite_grupo':
      return 'Responder convite'
    case 'solicitacao_grupo':
      return 'Ver pedido'
    case 'resposta_grupo':
      return 'Abrir comunidade'
    case 'faixa_alterada':
    case 'aviso_preventivo':
      return 'Ver disciplina'
    case 'prazo_atestado':
      return 'Anexar atestado'
    case 'virada_semestre':
      return 'Arquivar semestre'
    case 'resumo_semanal':
    case 'streak':
      return null
  }
}
