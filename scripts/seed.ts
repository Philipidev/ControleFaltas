/**
 * Seed dos usuários de demonstração (§5 — ranking precisa de gente).
 *
 *   npm run db:seed
 *
 * Roda com `node --experimental-strip-types`, que só apaga os tipos — por isso
 * o projeto inteiro tem `erasableSyntaxOnly` ligado: enum, namespace e
 * parameter property quebrariam aqui.
 *
 * Usa a SECRET KEY, que ignora todo o RLS. É script de desenvolvimento, roda
 * na sua máquina, e a chave nunca entra no bundle (só variáveis com prefixo
 * VITE_ são embutidas pelo Vite).
 *
 * Duas regras do banco continuam valendo mesmo com a secret key, porque são
 * TRIGGERS e não policies:
 *   - as horas de cada falta vêm da grade, e uma data em dia sem aula é
 *     recusada (trg_falta_horas);
 *   - justificar uma falta com mais de 7 dias é recusado (trg_prazo_atestado).
 * O script respeita as duas — o dado de demonstração obedece às mesmas regras
 * do dado de verdade.
 */

import { createClient } from '@supabase/supabase-js'

import type { Database } from '../src/types/database.ts'

process.loadEnvFile('.env.local')

/** Lê a variável ou aborta — devolve `string`, não `string | undefined`. */
function precisa(nome: string): string {
  const valor = process.env[nome]
  if (valor === undefined || valor === '') {
    console.error(`Falta ${nome} no .env.local`)
    process.exit(1)
  }
  return valor
}

const URL = precisa('VITE_SUPABASE_URL')
const SECRET = precisa('SUPABASE_SECRET_KEY')

const db = createClient<Database>(URL, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const GRUPO_TURMA = '9a0b0000-0000-4000-8000-00000000000a'
const SENHA_DEMO = 'faltas123'

interface Pessoa {
  readonly email: string
  readonly nome: string
  readonly emoji: string
  readonly admin: boolean
  /**
   * Quanto essa pessoa falta, de 0 (nunca falta) a 1 (falta muito).
   * Define a ordem do ranking sem que nenhum número saia do servidor.
   */
  readonly tendencia: number
}

const PESSOAS: readonly Pessoa[] = [
  { email: 'admin@demo.test', nome: 'Coordenação', emoji: '🗂️', admin: true, tendencia: 0 },
  { email: 'voce@demo.test', nome: 'Você', emoji: '🎓', admin: false, tendencia: 0.55 },
  { email: 'marina@demo.test', nome: 'Marina Alves', emoji: '🦉', admin: false, tendencia: 0.15 },
  { email: 'rafael@demo.test', nome: 'Rafael Nunes', emoji: '🐙', admin: false, tendencia: 0.35 },
  { email: 'bia@demo.test', nome: 'Bia Carvalho', emoji: '🦊', admin: false, tendencia: 0.75 },
  { email: 'teo@demo.test', nome: 'Téo Menezes', emoji: '🐢', admin: false, tendencia: 0.9 },
  { email: 'lu@demo.test', nome: 'Lu Ferreira', emoji: '🦩', admin: false, tendencia: 0.25 },
]

// ---------------------------------------------------------------------------
// Datas — mesma convenção do domínio: 'YYYY-MM-DD' em horário local
// ---------------------------------------------------------------------------
function paraISO(d: Date): string {
  return [
    String(d.getFullYear()).padStart(4, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const data = new Date(a ?? 2026, (m ?? 1) - 1, (d ?? 1))
  data.setDate(data.getDate() + dias)
  return paraISO(data)
}

function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a ?? 2026, (m ?? 1) - 1, (d ?? 1)).getDay()
}

const HOJE = paraISO(new Date())
const INICIO = somarDias(HOJE, -77) // ~11 semanas de semestre

// ---------------------------------------------------------------------------

async function criarUsuario(p: Pessoa): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email: p.email,
    password: SENHA_DEMO,
    email_confirm: true,
    user_metadata: { nome: p.nome },
  })

  if (error !== null) {
    // Já existe de uma execução anterior: reaproveita em vez de falhar.
    if (error.message.includes('already been registered')) {
      const { data: lista } = await db.auth.admin.listUsers({ perPage: 200 })
      const achado = lista.users.find((u) => u.email === p.email)
      if (achado !== undefined) return achado.id
    }
    throw new Error(`Não consegui criar ${p.email}: ${error.message}`)
  }

  return data.user.id
}

async function main(): Promise<void> {
  console.log(`Semeando ${URL}\n`)

  // ---- catálogo: lido do banco, não hardcoded ----
  const { data: disciplinas, error: erroDisc } = await db
    .from('disciplinas')
    .select('id, nome, carga_horaria_total, disciplina_grade(dia_semana, horas)')
    .eq('personalizada', false)
    .order('nome')

  if (erroDisc !== null) throw new Error(`Falha ao ler disciplinas: ${erroDisc.message}`)
  if (disciplinas.length === 0) {
    throw new Error(
      'Nenhuma disciplina no catálogo. Rode supabase/APLICAR-TUDO.sql antes deste script.',
    )
  }
  console.log(`Catálogo: ${String(disciplinas.length)} disciplinas.\n`)

  for (const pessoa of PESSOAS) {
    const uid = await criarUsuario(pessoa)

    await db
      .from('profiles')
      .update({
        nome: pessoa.nome,
        emoji: pessoa.emoji,
        role: pessoa.admin ? 'admin' : 'aluno',
        curso: 'Medicina',
        periodo: '5º período',
        turma: 'A',
        onboarding_concluido: true,
      })
      .eq('id', uid)

    if (pessoa.admin) {
      console.log(`  ${pessoa.emoji} ${pessoa.nome} (admin) — sem matrículas`)
      continue
    }

    await db
      .from('grupo_membros')
      .upsert({ grupo_id: GRUPO_TURMA, usuario_id: uid }, { onConflict: 'grupo_id,usuario_id' })

    let totalFaltas = 0

    for (const d of disciplinas) {
      await db
        .from('matriculas')
        .upsert(
          { usuario_id: uid, disciplina_id: d.id, grupo_id: GRUPO_TURMA },
          { onConflict: 'usuario_id,disciplina_id' },
        )

      const grade = d.disciplina_grade
      if (grade.length === 0) continue

      // Todas as aulas reais da disciplina, do início do semestre até hoje.
      const aulas: { data: string; horas: number }[] = []
      for (let dia = INICIO; dia <= HOJE; dia = somarDias(dia, 1)) {
        const dow = diaDaSemana(dia)
        const aula = grade.find((g) => g.dia_semana === dow)
        if (aula !== undefined) aulas.push({ data: dia, horas: aula.horas })
      }

      // A tendência define quantas dessas aulas viram falta. O teto é 30% da
      // carga, então o demo alcança "reprovado" sem virar caricatura.
      const tetoHoras = d.carga_horaria_total * 0.3 * pessoa.tendencia
      let horasAcumuladas = 0
      const escolhidas: { data: string; horas: number }[] = []

      // Passo largo espalha as faltas pelo semestre em vez de amontoá-las no
      // começo — o gráfico de evolução fica com forma.
      for (let i = 0; i < aulas.length; i += 3) {
        const aula = aulas[i]
        if (aula === undefined) break
        if (horasAcumuladas + aula.horas > tetoHoras) break
        horasAcumuladas += aula.horas
        escolhidas.push(aula)
      }

      for (const aula of escolhidas) {
        // §7.1: o trigger recusa justificar fora dos 7 dias. Só as recentes
        // podem nascer com atestado.
        const dentroDoPrazo = somarDias(aula.data, 7) >= HOJE

        const { error } = await db.from('faltas').upsert(
          {
            usuario_id: uid,
            disciplina_id: d.id,
            data: aula.data,
            // horas_perdidas omitido de propósito: o trigger preenche (§3)
            justificada: dentroDoPrazo && escolhidas.indexOf(aula) % 5 === 0,
          },
          { onConflict: 'usuario_id,disciplina_id,data' },
        )

        if (error !== null) {
          console.warn(`    ! ${d.nome} ${aula.data}: ${error.message}`)
        } else {
          totalFaltas += 1
        }
      }
    }

    console.log(
      `  ${pessoa.emoji} ${pessoa.nome.padEnd(16)} ${String(totalFaltas).padStart(3)} faltas`,
    )
  }

  await semearComunidades()

  console.log(`\nPronto. Entre com qualquer e-mail acima e a senha "${SENHA_DEMO}".`)
  console.log('O perfil "Coordenação" é o admin — use-o para abrir o back-office.')
}

/**
 * Comunidades com estados variados.
 *
 * O objetivo não é ter dado bonito: é que ao abrir o app você já encontre um
 * convite esperando resposta e um pedido esperando aprovação. Esses dois
 * fluxos são o coração do recurso e são justamente os que ninguém testa
 * quando o banco só tem membros ativos.
 */
async function semearComunidades(): Promise<void> {
  console.log('\nComunidades:')

  const { data: perfis } = await db.from('profiles').select('id, nome')
  const porNome = new Map((perfis ?? []).map((p) => [p.nome, p.id]))
  const id = (nome: string): string => porNome.get(nome) ?? ''

  const TURMA = '9a0b0000-0000-4000-8000-00000000000a'

  // A turma semeada vira uma comunidade de verdade, com dono.
  await db
    .from('grupos')
    .update({
      nome: 'Medicina 5º período',
      emoji: '🩺',
      instituicao: 'UNISA',
      visibilidade: 'fechada',
      descricao: 'Turma do 5º período de Medicina.',
      criado_por: id('Você'),
    })
    .eq('id', TURMA)

  await db
    .from('grupo_membros')
    .update({ papel: 'dono' })
    .eq('grupo_id', TURMA)
    .eq('usuario_id', id('Você'))

  // Marina administra junto: dá para testar o painel com dois perfis.
  await db
    .from('grupo_membros')
    .update({ papel: 'admin' })
    .eq('grupo_id', TURMA)
    .eq('usuario_id', id('Marina Alves'))

  const outras = [
    {
      id: '9a0b0000-0000-4000-8000-00000000000b',
      nome: 'Medicina 1º período',
      emoji: '🧬',
      instituicao: 'UNISA',
      visibilidade: 'publica' as const,
      descricao: 'Quem está começando agora.',
      periodo: '1º período',
      codigo_convite: 'MED1A',
    },
    {
      id: '9a0b0000-0000-4000-8000-00000000000c',
      nome: 'Plantão dos amigos',
      emoji: '🌙',
      instituicao: null,
      visibilidade: 'secreta' as const,
      descricao: 'Grupo pequeno, só no código.',
      periodo: null,
      codigo_convite: 'PLANT1',
    },
  ]

  for (const c of outras) {
    await db.from('grupos').upsert({
      id: c.id,
      nome: c.nome,
      emoji: c.emoji,
      tipo: 'turma',
      curso: 'Medicina',
      periodo: c.periodo,
      instituicao: c.instituicao,
      visibilidade: c.visibilidade,
      descricao: c.descricao,
      codigo_convite: c.codigo_convite,
      criado_por: id('Marina Alves'),
    })

    await db.from('grupo_membros').upsert(
      { grupo_id: c.id, usuario_id: id('Marina Alves'), papel: 'dono', status: 'ativo' },
      { onConflict: 'grupo_id,usuario_id' },
    )
  }

  // Estados pendentes — é o que faz a tela ter o que mostrar.
  const pendentes = [
    // Convite esperando resposta SUA: abre o app e já tem o que fazer.
    {
      grupo_id: outras[0]?.id ?? '',
      usuario_id: id('Você'),
      status: 'convidado' as const,
      convidado_por: id('Marina Alves'),
      mensagem: null,
    },
    // Pedido esperando aprovação sua na turma que você é dono.
    {
      grupo_id: TURMA,
      usuario_id: id('Téo Menezes'),
      status: 'solicitado' as const,
      convidado_por: null,
      mensagem: 'Sou da mesma turma, entrei atrasado no semestre!',
    },
  ]

  for (const p of pendentes) {
    if (p.usuario_id === '' || p.grupo_id === '') continue
    await db
      .from('grupo_membros')
      .upsert({ ...p, papel: 'membro' }, { onConflict: 'grupo_id,usuario_id' })
  }

  // Convite por e-mail para quem ainda não tem conta: cadastre esse endereço
  // no app e o convite aparece sozinho (trg_novo_usuario resgata).
  await db.from('grupo_convites_email').upsert(
    { grupo_id: TURMA, email: 'novato@demo.test', convidado_por: id('Você') },
    { onConflict: 'grupo_id,email' },
  )

  const { data: resumo } = await db
    .from('grupos')
    .select('nome, visibilidade, grupo_membros(status)')
    .order('nome')

  for (const g of resumo ?? []) {
    const ativos = g.grupo_membros.filter((m) => m.status === 'ativo').length
    const pend = g.grupo_membros.length - ativos
    console.log(
      `  ${g.nome.padEnd(24)} ${g.visibilidade.padEnd(8)} ${String(ativos)} ativos` +
        (pend > 0 ? `, ${String(pend)} pendente(s)` : ''),
    )
  }

  console.log('\n  Você tem 1 convite e 1 pedido para aprovar.')
  console.log('  Cadastre novato@demo.test para ver o convite por e-mail sendo resgatado.')
}

main().catch((e: unknown) => {
  console.error('\nFalhou:', e instanceof Error ? e.message : e)
  process.exit(1)
})
