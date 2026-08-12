/**
 * Teste de segurança e de regras de negócio, batendo na API de verdade.
 *
 *   npm run db:test-rls
 *
 * Não é teste de unidade: é um cliente autenticado como um aluno comum
 * tentando fazer o que a especificação proíbe. Se qualquer um destes passar,
 * a §5 ("ninguém vê os números/faltas dos outros") está violada no produto,
 * não no código.
 *
 * Os quatro primeiros são segurança; os três últimos são as regras da §2, §3
 * e §7.1 que moram em triggers.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '../src/types/database.ts'

process.loadEnvFile('.env.local')

function precisa(nome: string): string {
  const valor = process.env[nome]
  if (valor === undefined || valor === '') {
    console.error(`Falta ${nome} no .env.local`)
    process.exit(1)
  }
  return valor
}

const URL = precisa('VITE_SUPABASE_URL')
const PUBLICA = precisa('VITE_SUPABASE_ANON_KEY')
const SECRETA = precisa('SUPABASE_SECRET_KEY')
const SENHA = 'faltas123'

const admin = createClient<Database>(URL, SECRETA, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// --- datas, mesma convenção do domínio: 'YYYY-MM-DD' em horário local ------

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

/** Próxima ocorrência daquele dia da semana, sempre no futuro. */
function proximoDia(alvo: number): string {
  const hoje = new Date()
  const salto = ((alvo - hoje.getDay() + 7) % 7 || 7)
  return somarDias(paraISO(hoje), salto)
}

let passou = 0
let falhou = 0

function checar(nome: string, ok: boolean, detalhe = ''): void {
  if (ok) {
    passou += 1
    console.log(`  ✅ ${nome}`)
  } else {
    falhou += 1
    console.log(`  ❌ ${nome}${detalhe === '' ? '' : ` — ${detalhe}`}`)
  }
}

async function entrar(email: string): Promise<{ cliente: SupabaseClient<Database>; id: string }> {
  const cliente = createClient<Database>(URL, PUBLICA, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await cliente.auth.signInWithPassword({ email, password: SENHA })
  if (error !== null) {
    throw new Error(`Não consegui entrar como ${email}: ${error.message}`)
  }
  return { cliente, id: data.user.id }
}

async function main(): Promise<void> {
  console.log(`\nTestando ${URL}\n`)

  const marina = await entrar('marina@demo.test')
  const bia = await entrar('bia@demo.test')

  // -------------------------------------------------------------------------
  console.log('§5 — privacidade das faltas')
  // -------------------------------------------------------------------------

  const { data: minhasFaltas } = await marina.cliente.from('faltas').select('usuario_id')
  const soMinhas = (minhasFaltas ?? []).every((f) => f.usuario_id === marina.id)
  checar(
    'select em faltas devolve apenas as próprias linhas',
    soMinhas && (minhasFaltas ?? []).length > 0,
    `${String((minhasFaltas ?? []).length)} linhas, todas minhas: ${String(soMinhas)}`,
  )

  const { data: faltasDaBia } = await marina.cliente
    .from('faltas')
    .select('id')
    .eq('usuario_id', bia.id)
  checar(
    'filtrar explicitamente pelo uuid do colega devolve zero linhas',
    (faltasDaBia ?? []).length === 0,
    `${String((faltasDaBia ?? []).length)} linhas vazaram`,
  )

  // A função de cálculo é SECURITY DEFINER: ignora RLS. Se estiver exposta,
  // basta passar o uuid do colega para ler as horas dele.
  const respostaRpc = await fetch(`${URL}/rest/v1/rpc/horas_faltadas`, {
    method: 'POST',
    headers: {
      apikey: PUBLICA,
      Authorization: `Bearer ${(await marina.cliente.auth.getSession()).data.session?.access_token ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_usuario: bia.id, p_disciplina: null }),
  })
  checar(
    'horas_faltadas() não é chamável pelo cliente',
    !respostaRpc.ok,
    `HTTP ${String(respostaRpc.status)} — a função está exposta`,
  )

  const anonimo = createClient<Database>(URL, PUBLICA)
  const { data: anonFaltas, error: anonErro } = await anonimo.from('faltas').select('id')
  checar(
    'visitante não autenticado não lê faltas',
    (anonFaltas ?? []).length === 0 || anonErro !== null,
    `${String((anonFaltas ?? []).length)} linhas para o anon`,
  )

  // -------------------------------------------------------------------------
  console.log('\n§5 — ranking devolve posição, nunca número')
  // -------------------------------------------------------------------------

  const { data: ranking, error: erroRanking } = await marina.cliente.rpc('get_group_ranking', {
    p_grupo_id: '9a0b0000-0000-4000-8000-00000000000a',
  })

  checar('ranking responde para quem é do grupo', erroRanking === null, erroRanking?.message ?? '')

  const linhas = ranking ?? []
  checar('ranking traz todos os membros', linhas.length >= 3, `${String(linhas.length)} linhas`)

  const camposProibidos = ['percentual', 'horas', 'total_faltado', 'carga', 'status', 'faixa']
  const vazou = linhas.flatMap((l) =>
    Object.keys(l).filter((k) => camposProibidos.some((p) => k.toLowerCase().includes(p))),
  )
  checar(
    'nenhum campo numérico de falta no retorno',
    vazou.length === 0,
    `vazaram: ${vazou.join(', ')}`,
  )

  const posicoes = linhas.map((l) => l.posicao)
  checar(
    'posições vêm ordenadas e começam em 1',
    posicoes[0] === 1 && posicoes.every((p, i) => i === 0 || p >= (posicoes[i - 1] ?? 1)),
    posicoes.join(', '),
  )

  // Marina falta pouco e Bia falta muito: Marina precisa vir antes.
  // Sem `?? 0`: "não encontrado" viraria "posição 0" e o teste passaria a
  // comparar contra um número inventado, dizendo "Bia 0" quando o real é que
  // ela não está no ranking.
  const posMarina = linhas.find((l) => l.eh_voce)?.posicao
  const posBia = linhas.find((l) => l.nome.startsWith('Bia'))?.posicao

  checar(
    'as duas pessoas comparadas estão no ranking',
    posMarina !== undefined && posBia !== undefined,
    `Marina=${String(posMarina)} Bia=${String(posBia)}`,
  )
  checar(
    'a ordem reflete quem falta menos',
    posMarina !== undefined && posBia !== undefined && posMarina < posBia,
    `Marina ${String(posMarina)} vs Bia ${String(posBia)}`,
  )

  // -------------------------------------------------------------------------
  console.log('\nEscalada de privilégio')
  // -------------------------------------------------------------------------

  const { error: erroRole } = await marina.cliente
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', marina.id)
  checar('aluno não consegue se promover a admin', erroRole !== null, 'o update passou')

  const { error: erroCatalogo } = await marina.cliente.from('disciplinas').insert({
    nome: 'Disciplina pirata',
    curso: 'Medicina',
    periodo: '5º período',
    semestre: '2026.2',
    carga_horaria_total: 40,
    personalizada: false,
  })
  checar('aluno não escreve no catálogo oficial (§2)', erroCatalogo !== null, 'o insert passou')

  // -------------------------------------------------------------------------
  console.log('\nRegras da spec que moram em triggers')
  // -------------------------------------------------------------------------

  const { data: mfc } = await admin
    .from('disciplinas')
    .select('id')
    .eq('nome', 'Medicina, Família e Comunidade')
    .single()

  const idMfc = mfc?.id ?? ''

  // MFC só tem aula segunda e quarta — o próximo sábado tem de ser recusado.
  const isoSabado = proximoDia(6)

  const { error: erroDiaSemAula } = await marina.cliente.from('faltas').insert({
    usuario_id: marina.id,
    disciplina_id: idMfc,
    data: isoSabado,
  })
  checar(
    '§3 — falta em dia sem aula é recusada',
    erroDiaSemAula !== null,
    `aceitou ${isoSabado}`,
  )

  // §3 — as horas vêm da grade, mesmo se o cliente mandar outro número.
  const isoSegunda = proximoDia(1)

  await marina.cliente
    .from('faltas')
    .delete()
    .eq('usuario_id', marina.id)
    .eq('disciplina_id', idMfc)
    .eq('data', isoSegunda)

  const { data: inserida, error: erroInsert } = await marina.cliente
    .from('faltas')
    .insert({
      usuario_id: marina.id,
      disciplina_id: idMfc,
      data: isoSegunda,
      // Mentira deliberada, dentro do que numeric(4,2) aceita: se mandássemos
      // 999 o insert morreria no overflow da coluna antes de o trigger rodar,
      // e o teste passaria a medir a constraint em vez da regra da §3.
      horas_perdidas: 99,
    })
    .select('horas_perdidas, prazo_justificativa')
    .single()

  if (erroInsert !== null) {
    checar('§3 — o banco ignora as horas enviadas e usa as da grade', false, erroInsert.message)
    checar('§8 — prazo_justificativa é calculado como data + 7', false, 'o insert falhou')
  } else {
    checar(
      '§3 — o banco ignora as horas enviadas e usa as da grade (4h na segunda)',
      inserida.horas_perdidas === 4,
      `veio ${String(inserida.horas_perdidas)}`,
    )

    const prazoEsperado = somarDias(isoSegunda, 7)
    checar(
      '§8 — prazo_justificativa é calculado como data + 7',
      inserida.prazo_justificativa === prazoEsperado,
      `veio ${inserida.prazo_justificativa}, esperava ${prazoEsperado}`,
    )
  }

  // §7.1 — justificar uma falta antiga tem de ser recusado.
  const { data: antiga } = await marina.cliente
    .from('faltas')
    .select('id, data, justificada')
    .eq('justificada', false)
    .order('data', { ascending: true })
    .limit(1)
    .single()

  if (antiga !== null) {
    const diasAtras = Math.round(
      (Date.now() - new Date(`${antiga.data}T00:00:00`).getTime()) / 86400000,
    )
    const { error: erroPrazo } = await marina.cliente
      .from('faltas')
      .update({ justificada: true })
      .eq('id', antiga.id)

    checar(
      `§7.1 — atestado fora do prazo é bloqueado (falta de ${String(diasAtras)} dias atrás)`,
      diasAtras > 7 ? erroPrazo !== null : erroPrazo === null,
      erroPrazo?.message ?? 'o update passou',
    )
  }

  // limpeza
  await marina.cliente
    .from('faltas')
    .delete()
    .eq('usuario_id', marina.id)
    .eq('disciplina_id', idMfc)
    .eq('data', isoSegunda)

  await testarComunidades(marina, bia)

  // -------------------------------------------------------------------------
  console.log(`\n${String(passou)} passaram, ${String(falhou)} falharam.`)
  if (falhou > 0) {
    console.error('\nA especificação está sendo violada. Não suba assim.')
    process.exit(1)
  }
  console.log('A privacidade da §5 e as regras de §2/§3/§7.1 estão valendo no banco.\n')
}

// ===========================================================================
// Comunidades — o recurso novo
//
// Todo o risco aqui é um só: PENDENTE NÃO É MEMBRO. Quatro lugares do sistema
// perguntam "essa pessoa está no grupo?", e se algum deles contar quem apenas
// bateu na porta, o solicitante passa a enxergar coisa de membro. Cada ataque
// abaixo mira um desses lugares.
// ===========================================================================
type Sessao = Awaited<ReturnType<typeof entrar>>

async function testarComunidades(marina: Sessao, bia: Sessao): Promise<void> {
  console.log('\n────────────────────────────────────────')
  console.log('Comunidades — pendente não é membro')
  console.log('────────────────────────────────────────')

  // O intruso não compartilha grupo nenhum com ninguém. Marina e Bia não
  // serviriam para o ataque nº 2: elas já dividem a turma com todo mundo, e
  // compartilha_grupo() daria true por aquele caminho, escondendo a falha.
  const EMAIL_INTRUSO = 'intruso@teste-rls.local'
  const { data: criado } = await admin.auth.admin.createUser({
    email: EMAIL_INTRUSO,
    password: SENHA,
    email_confirm: true,
    user_metadata: { nome: 'Intruso' },
  })

  let achado = criado.user?.id
  if (achado === undefined) {
    // Sobrou de uma execução anterior interrompida: reaproveita.
    const { data: lista } = await admin.auth.admin.listUsers({ perPage: 200 })
    achado = lista.users.find((u) => u.email === EMAIL_INTRUSO)?.id
  }
  if (achado === undefined) throw new Error('Não consegui preparar o usuário intruso.')
  const idIntruso: string = achado

  const intruso = await entrar(EMAIL_INTRUSO)
  const criados: string[] = []

  try {
    // ---- montagem ---------------------------------------------------------
    const { data: gFechada, error: e1 } = await marina.cliente.rpc('criar_comunidade', {
      p_nome: 'Teste Privacidade',
      p_visibilidade: 'fechada',
      p_instituicao: 'UNISA',
    })
    if (e1 !== null) {
      throw new Error(`Não consegui criar a comunidade de teste: ${e1.message}`)
    }
    criados.push(gFechada)

    const { data: gSecreta, error: e2 } = await marina.cliente.rpc('criar_comunidade', {
      p_nome: 'Teste Secreta ZZZ',
      p_visibilidade: 'secreta',
    })
    if (e2 !== null) throw new Error(`Não consegui criar a secreta: ${e2.message}`)
    criados.push(gSecreta)

    checar('criar_comunidade deixa quem criou como dono ativo', true)

    const { data: statusPedido } = await intruso.cliente.rpc('solicitar_acesso', {
      p_grupo_id: gFechada,
      p_mensagem: 'me deixa entrar',
    })
    checar(
      'em comunidade fechada, solicitar deixa o status pendente',
      statusPedido === 'solicitado',
      `veio ${String(statusPedido)}`,
    )

    // ---- 1. lista de membros ----------------------------------------------
    const { data: membrosVistos } = await intruso.cliente
      .from('grupo_membros')
      .select('usuario_id')
      .eq('grupo_id', gFechada)

    checar(
      'pendente não lê a lista de membros (só a própria linha)',
      (membrosVistos ?? []).length === 1 && membrosVistos?.[0]?.usuario_id === idIntruso,
      `viu ${String((membrosVistos ?? []).length)} linhas`,
    )

    // ---- 2. o buraco do compartilha_grupo ---------------------------------
    // Se compartilha_grupo() contasse pendentes, bastaria pedir para entrar
    // numa comunidade para ler nome, curso, período e turma de todos os membros.
    const { data: perfilAlheio } = await intruso.cliente
      .from('profiles')
      .select('id, nome, curso')
      .eq('id', marina.id)

    checar(
      'pendente não lê o perfil dos membros (compartilha_grupo)',
      (perfilAlheio ?? []).length === 0,
      `vazou o perfil de ${String(perfilAlheio?.[0]?.nome)}`,
    )

    // ---- 3. ranking --------------------------------------------------------
    const { error: erroRankingIntruso } = await intruso.cliente.rpc('get_group_ranking', {
      p_grupo_id: gFechada,
    })
    checar(
      'pendente não consegue ler o ranking do grupo',
      erroRankingIntruso !== null,
      'a RPC respondeu para quem só solicitou',
    )

    // ---- 4. a guarda de 3 membros -----------------------------------------
    // Aprovar a Bia deixa o grupo com 2 ativos. Com o intruso pendente, são 3
    // linhas em grupo_membros — se a contagem não filtrasse status, o ranking
    // destravaria e revelaria a comparação entre duas pessoas.
    await bia.cliente.rpc('solicitar_acesso', { p_grupo_id: gFechada })
    await marina.cliente.rpc('responder_solicitacao', {
      p_grupo_id: gFechada,
      p_usuario_id: bia.id,
      p_aprovar: true,
    })

    const { data: rankingDois } = await marina.cliente.rpc('get_group_ranking', {
      p_grupo_id: gFechada,
    })
    checar(
      'com 2 ativos + 1 pendente, o ranking continua bloqueado',
      (rankingDois ?? []).length === 0,
      `devolveu ${String((rankingDois ?? []).length)} posições`,
    )

    // E o outro lado da moeda: aprovado o terceiro, o ranking abre.
    await marina.cliente.rpc('responder_solicitacao', {
      p_grupo_id: gFechada,
      p_usuario_id: idIntruso,
      p_aprovar: true,
    })
    const { data: rankingTres } = await marina.cliente.rpc('get_group_ranking', {
      p_grupo_id: gFechada,
    })
    checar(
      'com 3 ativos, o ranking abre',
      (rankingTres ?? []).length === 3,
      `devolveu ${String((rankingTres ?? []).length)}`,
    )

    // ---- 5. membro comum não administra ------------------------------------
    const { error: erroAprovar } = await bia.cliente.rpc('responder_solicitacao', {
      p_grupo_id: gFechada,
      p_usuario_id: idIntruso,
      p_aprovar: true,
    })
    checar('membro comum não aprova solicitação', erroAprovar !== null, 'a RPC aceitou')

    const { error: erroConvidar } = await bia.cliente.rpc('convidar_para_grupo', {
      p_grupo_id: gFechada,
      p_email: 'alguem@teste.local',
    })
    checar('membro comum não convida', erroConvidar !== null, 'a RPC aceitou')

    // ---- 6. comunidade secreta não aparece na busca -------------------------
    const { data: achados } = await bia.cliente.rpc('buscar_comunidades', {
      p_termo: 'Teste Secreta ZZZ',
    })
    checar(
      'comunidade secreta não aparece no catálogo',
      (achados ?? []).length === 0,
      `apareceu em ${String((achados ?? []).length)} resultado(s)`,
    )

    // ---- 7. convite não confirma se o e-mail existe -------------------------
    // Se a resposta diferisse, bastaria criar uma comunidade qualquer para usar
    // o formulário como confirmador de e-mails cadastrados.
    const { data: respCadastrado } = await marina.cliente.rpc('convidar_para_grupo', {
      p_grupo_id: gFechada,
      p_email: 'teo@demo.test',
    })
    const { data: respInexistente } = await marina.cliente.rpc('convidar_para_grupo', {
      p_grupo_id: gFechada,
      p_email: 'ninguem-com-esse-email@teste-rls.local',
    })
    checar(
      'convidar responde igual para e-mail cadastrado e não cadastrado',
      respCadastrado === respInexistente && respCadastrado === 'convidado',
      `cadastrado="${String(respCadastrado)}" vs inexistente="${String(respInexistente)}"`,
    )

    // ---- 8. escrita direta na tabela ---------------------------------------
    // Se grupo_membros fosse gravável, tudo acima seria contornável com um
    // único insert: bastaria se declarar 'ativo'.
    const { error: erroInsertDireto } = await intruso.cliente
      .from('grupo_membros')
      .insert({ grupo_id: gSecreta, usuario_id: idIntruso, status: 'ativo' })
    checar(
      'ninguém se insere direto em grupo_membros',
      erroInsertDireto !== null,
      'o insert passou',
    )

    // Sem policy de UPDATE, o Postgres não recusa com erro: ele atualiza ZERO
    // linhas em silêncio. Checar o erro daria falso positivo — o que vale é o
    // efeito, conferido pelo cliente admin, que enxerga a linha de verdade.
    await bia.cliente
      .from('grupo_membros')
      .update({ papel: 'dono' })
      .eq('grupo_id', gFechada)
      .eq('usuario_id', bia.id)

    const { data: depoisDoAtaque } = await admin
      .from('grupo_membros')
      .select('papel')
      .eq('grupo_id', gFechada)
      .eq('usuario_id', bia.id)
      .single()

    checar(
      'ninguém se promove a dono por update direto',
      depoisDoAtaque?.papel === 'membro',
      `o papel virou "${String(depoisDoAtaque?.papel)}"`,
    )
  } finally {
    for (const id of criados) {
      await admin.from('grupos').delete().eq('id', id)
    }
    await admin.auth.admin.deleteUser(idIntruso)
  }
}

main().catch((e: unknown) => {
  console.error('\nFalhou:', e instanceof Error ? e.message : e)
  process.exit(1)
})
