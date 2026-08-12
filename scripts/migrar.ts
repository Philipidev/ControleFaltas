/**
 * Aplicador de migrations.
 *
 *   npm run db:migrate          aplica as pendentes
 *   npm run db:migrate -- --lista   só mostra o que falta, sem aplicar
 *
 * Por que existe: até agora cada migration virava um arquivo para colar no SQL
 * Editor. Isso funciona uma vez; na quinta vez alguém cola fora de ordem, ou
 * pula uma, e o banco fica num estado que ninguém sabe reproduzir.
 *
 * Cada arquivo roda dentro de UMA transação e é registrado em
 * `public.schema_migrations`. Se algo falhar no meio, aquele arquivo é
 * revertido inteiro e nada fica pela metade.
 *
 * Precisa de DATABASE_URL no .env.local — a string de conexão que o botão
 * "Connect" do Supabase fornece. Diferente da service_role, ela dá acesso só a
 * este banco, e você pode rotacioná-la em Settings → Database.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import pg from 'pg'

process.loadEnvFile('.env.local')

/**
 * Conexão por campos separados, e não por URL.
 *
 * O próprio painel do Supabase avisa: "se a senha contém caracteres especiais,
 * faça percent-encoding na connection string". Senha gerada tem `@`, `?`, `#`
 * com frequência — e um `@` não escapado quebra a URL de um jeito que produz
 * um erro de host, não de senha, mandando quem depura para o lado errado.
 * Campo separado não tem esse problema.
 */
const SENHA = process.env.SUPABASE_DB_PASSWORD
if (SENHA === undefined || SENHA === '') {
  console.error(
    [
      'Falta SUPABASE_DB_PASSWORD no .env.local.',
      '',
      'É a senha do banco definida na criação do projeto. Ela NÃO é visível',
      'depois — se você não guardou, gere outra em:',
      '  Supabase → Connect → Direct → botão "Reset database password"',
      '',
      'Os outros campos já estão preenchidos no .env.local.',
    ].join('\n'),
  )
  process.exit(1)
}

const CONEXAO = {
  host: process.env.SUPABASE_DB_HOST ?? 'aws-0-sa-east-1.pooler.supabase.com',
  port: Number(process.env.SUPABASE_DB_PORT ?? '5432'),
  user: process.env.SUPABASE_DB_USER ?? 'postgres.pbevhkvihbgxclvnlbzp',
  database: process.env.SUPABASE_DB_NAME ?? 'postgres',
  password: SENHA,
  ssl: { rejectUnauthorized: false },
}

const PASTA = 'supabase/migrations'
const soLista = process.argv.includes('--lista')

async function main(): Promise<void> {
  console.log(`Conectando em ${CONEXAO.host}:${String(CONEXAO.port)} como ${CONEXAO.user}\n`)
  const cliente = new pg.Client(CONEXAO)

  await cliente.connect()

  try {
    await cliente.query(`
      create table if not exists public.schema_migrations (
        versao      text primary key,
        aplicada_em timestamptz not null default now()
      );
    `)

    const { rows } = await cliente.query<{ versao: string }>(
      'select versao from public.schema_migrations',
    )
    const jaAplicadas = new Set(rows.map((r) => r.versao))

    const arquivos = readdirSync(PASTA)
      .filter((n) => n.endsWith('.sql'))
      .sort() // 0001, 0002, … — a ordem do nome é a ordem de execução

    const pendentes = arquivos.filter((n) => !jaAplicadas.has(n))

    if (pendentes.length === 0) {
      console.log(`Nada a fazer — ${String(arquivos.length)} migrations já aplicadas.`)
      return
    }

    console.log(`${String(pendentes.length)} pendente(s):`)
    for (const nome of pendentes) console.log(`  · ${nome}`)

    if (soLista) return
    console.log('')

    for (const nome of pendentes) {
      const sql = readFileSync(join(PASTA, nome), 'utf8')
      process.stdout.write(`  ${nome.padEnd(34)}`)

      try {
        await cliente.query('begin')
        await cliente.query(sql)
        await cliente.query('insert into public.schema_migrations (versao) values ($1)', [nome])
        await cliente.query('commit')
        console.log('ok')
      } catch (e) {
        await cliente.query('rollback')
        console.log('FALHOU\n')
        throw new Error(
          `${nome}: ${e instanceof Error ? e.message : String(e)}\n` +
            '(o arquivo foi revertido inteiro; nada ficou pela metade)',
          { cause: e },
        )
      }
    }

    console.log('\nBanco atualizado.')
  } finally {
    await cliente.end()
  }
}

main().catch((e: unknown) => {
  console.error('\n' + (e instanceof Error ? e.message : String(e)))
  process.exit(1)
})
