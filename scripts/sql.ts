/**
 * Executa SQL no banco do projeto.
 *
 *   npm run db:sql -- "select count(*) from public.grupos"
 *   npm run db:sql -- supabase/verificar.sql
 *
 * Usa a mesma conexão de scripts/migrar.ts. Serve para conferir o estado do
 * banco sem abrir o SQL Editor — e para o `verificar.sql`, que é uma bateria
 * de checagens e não uma migration.
 *
 * Só leitura por convenção: nada aqui abre transação nem grava. Para mudar
 * schema, crie uma migration — é o que deixa o estado do banco reproduzível.
 */

import { existsSync, readFileSync } from 'node:fs'

import pg from 'pg'

process.loadEnvFile('.env.local')

const SENHA = process.env.SUPABASE_DB_PASSWORD
if (SENHA === undefined || SENHA === '') {
  console.error('Falta SUPABASE_DB_PASSWORD no .env.local.')
  process.exit(1)
}

// Detecta arquivo em vez de usar flag: o PowerShell engole o `--` extra do
// npm, então `-- --arquivo x` chega aqui como `x` e a flag some. Terminar em
// .sql e existir no disco é sinal suficiente, e a chamada fica mais curta.
const entrada = process.argv.slice(2).join(' ').trim()
const ehArquivo = entrada.toLowerCase().endsWith('.sql') && existsSync(entrada)
const sql = ehArquivo ? readFileSync(entrada, 'utf8') : entrada

if (sql.trim() === '') {
  console.error('Uso: npm run db:sql -- "select 1"   ou   npm run db:sql -- caminho.sql')
  process.exit(1)
}

const cliente = new pg.Client({
  host: process.env.SUPABASE_DB_HOST ?? 'aws-0-sa-east-1.pooler.supabase.com',
  port: Number(process.env.SUPABASE_DB_PORT ?? '5432'),
  user: process.env.SUPABASE_DB_USER ?? 'postgres',
  database: process.env.SUPABASE_DB_NAME ?? 'postgres',
  password: SENHA,
  ssl: { rejectUnauthorized: false },
})

async function main(): Promise<void> {
  await cliente.connect()
  try {
    // Os tipos do `pg` declaram um QueryResult só, mas em runtime uma string
    // com vários comandos devolve um ARRAY de resultados. O cast é a forma
    // honesta de dizer isso — a biblioteca não modela esse caso.
    const bruto: unknown = await cliente.query(sql)
    const conjuntos = (
      Array.isArray(bruto) ? bruto : [bruto]
    ) as pg.QueryResult<Record<string, unknown>>[]

    for (const r of conjuntos) {
      if (r.rows.length > 0) {
        console.table(r.rows)
      } else {
        console.log(`(${r.command} — ${String(r.rowCount ?? 0)} linhas)`)
      }
    }
  } finally {
    await cliente.end()
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
