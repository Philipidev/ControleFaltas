/**
 * Regras das comunidades — TypeScript puro, sem React e sem rede.
 *
 * Estas funções decidem o que a interface oferece. Elas NÃO são a segurança:
 * quem impede de verdade é o RLS mais as RPCs de 0007, que rodam no banco e
 * valem mesmo para quem chamar a API direto. Aqui é para a tela não oferecer
 * um botão que o servidor vai recusar.
 */

export type PapelComunidade = 'dono' | 'admin' | 'membro'
export type StatusMembro = 'ativo' | 'convidado' | 'solicitado' | 'recusado'
export type Visibilidade = 'publica' | 'fechada' | 'secreta'

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------

export const ROTULO_VISIBILIDADE: Readonly<Record<Visibilidade, string>> = {
  publica: 'Aberta',
  fechada: 'Com aprovação',
  secreta: 'Secreta',
}

export const DESCRICAO_VISIBILIDADE: Readonly<Record<Visibilidade, string>> = {
  publica: 'Aparece na busca e qualquer pessoa entra na hora.',
  fechada: 'Aparece na busca, mas você aprova quem entra.',
  secreta: 'Não aparece em busca nenhuma — só entra quem receber o código.',
}

export const EMOJI_VISIBILIDADE: Readonly<Record<Visibilidade, string>> = {
  publica: '🌐',
  fechada: '🔒',
  secreta: '🕵️',
}

export const ROTULO_PAPEL: Readonly<Record<PapelComunidade, string>> = {
  dono: 'Dono',
  admin: 'Administra',
  membro: 'Membro',
}

export const ROTULO_STATUS: Readonly<Record<StatusMembro, string>> = {
  ativo: 'Membro',
  convidado: 'Convidado',
  solicitado: 'Aguardando aprovação',
  recusado: 'Não aceito',
}

// ---------------------------------------------------------------------------
// Poderes
// ---------------------------------------------------------------------------

export interface Poderes {
  readonly podeAprovar: boolean
  readonly podeConvidar: boolean
  readonly podeRemoverOutros: boolean
  readonly podeEditar: boolean
  readonly podeDefinirAdmins: boolean
  readonly podeTransferir: boolean
  readonly podeApagar: boolean
  /** O dono não sai sem transferir — senão a comunidade fica sem quem a administre. */
  readonly podeSair: boolean
}

const SEM_PODER: Poderes = {
  podeAprovar: false,
  podeConvidar: false,
  podeRemoverOutros: false,
  podeEditar: false,
  podeDefinirAdmins: false,
  podeTransferir: false,
  podeApagar: false,
  podeSair: false,
}

export function poderesDe(
  papel: PapelComunidade | null,
  status: StatusMembro | null,
): Poderes {
  // Só membro ativo tem poder algum. Um convidado que ainda não aceitou não
  // administra nada, mesmo que o papel diga 'admin'.
  if (status !== 'ativo' || papel === null) return SEM_PODER

  if (papel === 'dono') {
    return {
      podeAprovar: true,
      podeConvidar: true,
      podeRemoverOutros: true,
      podeEditar: true,
      podeDefinirAdmins: true,
      podeTransferir: true,
      podeApagar: true,
      podeSair: false,
    }
  }

  if (papel === 'admin') {
    return {
      ...SEM_PODER,
      podeAprovar: true,
      podeConvidar: true,
      podeRemoverOutros: true,
      podeEditar: true,
      podeSair: true,
    }
  }

  return { ...SEM_PODER, podeSair: true }
}

export function administra(papel: PapelComunidade | null, status: StatusMembro | null): boolean {
  return poderesDe(papel, status).podeAprovar
}

// ---------------------------------------------------------------------------
// Qual ação a tela oferece
// ---------------------------------------------------------------------------

export type Acao =
  | 'abrir' // já sou membro
  | 'entrar' // pública: entra na hora
  | 'solicitar' // fechada: pede aprovação
  | 'aguardando' // já pedi, esperando
  | 'responder-convite' // fui convidado, aceito ou recuso
  | 'pedir-de-novo' // fui recusado, posso tentar outra vez
  | 'so-por-codigo' // secreta

export function acaoPara(visibilidade: Visibilidade, meuStatus: StatusMembro | null): Acao {
  if (meuStatus === 'ativo') return 'abrir'
  if (meuStatus === 'convidado') return 'responder-convite'
  if (meuStatus === 'solicitado') return 'aguardando'
  if (visibilidade === 'secreta') return 'so-por-codigo'
  if (meuStatus === 'recusado') return 'pedir-de-novo'
  return visibilidade === 'publica' ? 'entrar' : 'solicitar'
}

export const ROTULO_ACAO: Readonly<Record<Acao, string>> = {
  abrir: 'Abrir',
  entrar: 'Entrar',
  solicitar: 'Pedir para entrar',
  aguardando: 'Aguardando',
  'responder-convite': 'Responder convite',
  'pedir-de-novo': 'Pedir de novo',
  'so-por-codigo': 'Só por convite',
}

// ---------------------------------------------------------------------------
// E-mail
// ---------------------------------------------------------------------------

export function normalizarEmail(bruto: string): string {
  return bruto.trim().toLowerCase()
}

/**
 * Validação deliberadamente frouxa. E-mail válido de verdade só se prova
 * enviando; uma regex rígida rejeita endereços legítimos e não impede os
 * inválidos de existirem. Aqui é só para pegar o erro de digitação óbvio —
 * quem decide é o banco, que exige '@' via CHECK.
 */
export function emailValido(bruto: string): boolean {
  const e = normalizarEmail(bruto)
  const partes = e.split('@')
  return (
    partes.length === 2 &&
    (partes[0]?.length ?? 0) > 0 &&
    (partes[1]?.includes('.') ?? false) &&
    !e.includes(' ')
  )
}

// ---------------------------------------------------------------------------
// Busca e duplicatas
// ---------------------------------------------------------------------------

/** Mesma normalização do SQL (`normalizar_busca`), para os dois concordarem. */
export function normalizarBusca(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[ºª]/g, ' ')
}

interface Comparavel {
  readonly nome: string
  readonly instituicao?: string | null
  readonly curso?: string | null
  readonly periodo?: string | null
  readonly turma?: string | null
}

function textoDe(c: Comparavel): string {
  return normalizarBusca(
    [c.nome, c.instituicao, c.curso, c.periodo, c.turma].filter(Boolean).join(' '),
  )
}

/**
 * Aviso de duplicata na criação.
 *
 * Sem isto o catálogo vira cinco "Medicina 1 UNISA" com 8 pessoas cada, e o
 * ranking — que é o motivo de a turma se juntar — perde a graça. Casa quando
 * TODAS as palavras significativas do nome digitado aparecem numa comunidade
 * existente, então "medicina 1" encontra "Medicina 1º período · UNISA".
 */
export function parecidas<T extends Comparavel>(
  nomeDigitado: string,
  catalogo: readonly T[],
  minimoDePalavras = 1,
): T[] {
  const palavras = normalizarBusca(nomeDigitado)
    .split(/\s+/)
    // Letra solta casa com quase tudo e só gera ruído — esta função dispara a
    // cada tecla enquanto a pessoa digita o nome. Dígito solto é o oposto: num
    // catálogo de turmas, o "1" de "Medicina 1" é justamente o que separa uma
    // comunidade da outra, e descartá-lo faria "Medicina 2" sugerir as duas.
    .filter((p) => p.length > 1 || /^\d$/.test(p))

  if (palavras.length < minimoDePalavras) return []

  return catalogo.filter((c) => {
    const texto = textoDe(c)
    return palavras.every((p) => texto.includes(p))
  })
}

// ---------------------------------------------------------------------------
// Qual turma governa a minha matrícula
// ---------------------------------------------------------------------------

/** O lado acadêmico do perfil — o que identifica em qual turma a pessoa está. */
export interface PerfilAcademico {
  readonly curso: string | null
  readonly periodo: string | null
  readonly turma: string | null
}

export interface TurmaCandidata {
  readonly id: string
  /** `grupo_tipo`: uma roda de amigos não governa a regra de ninguém. */
  readonly tipo: string | null
  readonly curso: string | null
  readonly periodo: string | null
  readonly turma: string | null
}

/** Case, acento e espaço sobrando não podem separar "5º Período" de "5º período". */
function chave(valor: string): string {
  return normalizarBusca(valor).replace(/\s+/g, ' ').trim()
}

function preenchido(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

function casa(a: string | null, b: string | null): boolean {
  return preenchido(a) && preenchido(b) && chave(a) === chave(b)
}

/**
 * A turma que responde pelas disciplinas desta pessoa, ou `null`.
 *
 * É o elo que preenche `matriculas.grupo_id` — o que define o escopo do
 * ranking e, a partir dele, de qual comunidade a disciplina herda a regra do
 * curso.
 *
 * **Na dúvida, ninguém.** Duas comunidades candidatas devolvem `null` em vez de
 * um chute: vincular à turma errada joga a pessoa num ranking de gente que ela
 * não conhece e faz a disciplina herdar um limite de reprovação que não é o
 * dela. Sem vínculo, o pior que acontece é continuar valendo a configuração
 * pessoal — que é o padrão de hoje.
 *
 * Compara pelo perfil, e não pela disciplina, porque o catálogo já é filtrado
 * por `curso` e `periodo` do perfil (`useCatalogo`): os dois valores são
 * necessariamente os mesmos, e o perfil é quem tem `turma`.
 */
export function turmaDoAluno(
  comunidades: readonly TurmaCandidata[],
  perfil: PerfilAcademico,
): string | null {
  const candidatas = candidatasDeTurma(comunidades, perfil)
  return candidatas.length === 1 ? (candidatas[0]?.id ?? null) : null
}

/**
 * As turmas que casam com o perfil. Mais de uma significa que a interface
 * precisa perguntar em vez de escolher.
 */
export function candidatasDeTurma<T extends TurmaCandidata>(
  comunidades: readonly T[],
  perfil: PerfilAcademico,
): T[] {
  if (!preenchido(perfil.curso) || !preenchido(perfil.periodo)) return []

  return comunidades.filter((c) => {
    if (c.tipo === 'amigos') return false
    if (!casa(c.curso, perfil.curso)) return false
    if (!casa(c.periodo, perfil.periodo)) return false
    // A turma só desempata quando os DOIS lados a declaram. Uma comunidade do
    // período inteiro serve a quem está na turma A; e se existem a turma A e a
    // turma B enquanto o perfil não diz qual, as duas casam — e ficar com as
    // duas é justamente o que impede o chute.
    if (preenchido(c.turma) && preenchido(perfil.turma)) return casa(c.turma, perfil.turma)
    return true
  })
}

interface Ordenavel {
  readonly nome: string
  readonly membros: number
  readonly meu_status: StatusMembro | null
}

/**
 * Ordem do catálogo: convites primeiro (é uma pergunta esperando resposta),
 * depois as minhas, depois as maiores. Uma lista ordenada só por tamanho
 * enterraria um convite pendente na terceira página.
 */
export function ordenarCatalogo<T extends Ordenavel>(itens: readonly T[]): T[] {
  const peso = (s: StatusMembro | null): number => {
    if (s === 'convidado') return 0
    if (s === 'ativo') return 1
    if (s === 'solicitado') return 2
    return 3
  }

  return [...itens].sort((a, b) => {
    const p = peso(a.meu_status) - peso(b.meu_status)
    if (p !== 0) return p
    if (a.membros !== b.membros) return b.membros - a.membros
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })
}

/** "34 membros" · "1 membro" · "ainda sem membros" */
export function descreverMembros(quantidade: number): string {
  if (quantidade <= 0) return 'ainda sem membros'
  if (quantidade === 1) return '1 membro'
  return `${String(quantidade)} membros`
}

/** Linha de identificação: "UNISA · Medicina · 5º período · Turma A" */
export function descreverComunidade(c: Comparavel): string {
  const preenchido = (v: string | null | undefined): v is string =>
    typeof v === 'string' && v.trim() !== ''

  return [
    c.instituicao,
    c.curso,
    c.periodo,
    // Só prefixa "Turma" se houver turma — senão sai "Turma undefined".
    preenchido(c.turma) ? `Turma ${c.turma}` : null,
  ]
    .filter(preenchido)
    .join(' · ')
}
