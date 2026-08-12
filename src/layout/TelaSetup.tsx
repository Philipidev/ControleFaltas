import { env } from '@/lib/env.ts'

/**
 * Mostrada quando o .env.local não tem as chaves do Supabase.
 *
 * Uma tela em branco com "Failed to fetch" no console é o pior jeito de
 * comunicar "faltou configurar". Aqui a pessoa vê exatamente o que falta.
 */
export function TelaSetup() {
  return (
    <div className="grid min-h-dvh place-items-center bg-fundo px-5 py-10">
      <div className="w-full max-w-lg">
        <div className="cartao p-7">
          <p className="text-3xl" aria-hidden="true">
            🔌
          </p>
          <h1 className="mt-3 text-xl font-extrabold text-texto">Falta conectar o Supabase</h1>
          <p className="mt-2 text-sm font-semibold text-texto-suave">
            Crie um arquivo <code className="text-acento">.env.local</code> na raiz do
            projeto com:
          </p>

          <pre className="mt-4 overflow-x-auto rounded-interno bg-superficie-2 p-4 text-xs font-semibold text-texto">
            {`VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...`}
          </pre>

          <p className="mt-4 text-sm font-semibold text-texto-suave">
            As duas estão em <strong className="text-texto">Settings → API</strong> no painel
            do Supabase. Depois de salvar, reinicie o <code className="text-acento">npm run dev</code>{' '}
            — o Vite só lê variáveis de ambiente na inicialização.
          </p>

          {env.problemas.length > 0 && (
            <div className="mt-5 rounded-interno bg-vermelho-suave p-4">
              <p className="text-sm font-extrabold text-vermelho">Problemas encontrados:</p>
              <ul className="mt-1.5 list-inside list-disc text-sm font-semibold text-vermelho">
                {env.problemas.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-5 text-xs font-semibold text-texto-fraco">
            Antes disso, aplique <code>supabase/APLICAR-TUDO.sql</code> no SQL Editor — sem as
            tabelas, o app conecta mas não encontra nada.
          </p>
        </div>
      </div>
    </div>
  )
}
