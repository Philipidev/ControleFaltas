# Controle de Faltas

App para estudantes registrarem faltas **por disciplina**, onde cada falta desconta **as horas
da aula daquele dia** — não "1 falta genérica". Mostra o risco de reprovação por frequência e
permite comparar presença com a turma **sem expor número nenhum de ninguém**.

Vite + React 19 + TypeScript strict · Supabase (Postgres + Auth + Storage + RLS) · PWA.

---

## Rodando

```bash
npm install
cp .env.example .env.local     # preencha com as chaves do seu projeto Supabase
npm run dev
```

Sem as chaves, o app abre numa tela de setup explicando o que falta em vez de uma página em
branco.

### Banco

Preencha `SUPABASE_DB_PASSWORD` no `.env.local` (Supabase → Connect → Direct → *Session
pooler*; a senha não é visível depois da criação, então use "Reset database password" se
não a guardou). Depois:

```bash
npm run db:migrate    # aplica as migrations pendentes, cada uma numa transação
npm run db:seed       # admin + 6 alunos + 3 comunidades (senha faltas123)
npm run db:test-rls   # ataca o banco de fora e prova que a privacidade vale
```

`npm run db:sql -- "select …"` ou `npm run db:sql -- supabase/verificar.sql` rodam consultas
avulsas, sem abrir o SQL Editor.

> Nunca edite uma migration já aplicada — crie a próxima. `schema_migrations` registra o que
> rodou, e é isso que torna o estado do banco reproduzível.

---

## As três regras que moram no banco

A interface é conveniência; a garantia é o Postgres. Se alguém trocar o app por um `curl`,
estas continuam valendo:

| Regra | Onde vive | O que acontece |
|---|---|---|
| **§3** — as horas vêm da grade | trigger `trg_falta_horas` | O cliente manda `horas_perdidas: 99` numa segunda de 4h; o banco grava **4**. Falta em dia sem aula é recusada. |
| **§7.1** — atestado em 7 dias | trigger `trg_prazo_atestado` | Justificar uma falta de 8+ dias estoura com mensagem, venha de onde vier. |
| **§5** — privacidade | RLS + `get_group_ranking` | `select * from faltas` devolve só as suas. O ranking é calculado dentro do banco e devolve **apenas a colocação**. |
| **Comunidades** — pendente não é membro | `status='ativo'` em 4 funções | Quem só pediu para entrar não lê a lista de membros, nem os perfis, nem o ranking — e não conta na guarda de 3 pessoas. |

### Por que "pendente não é membro" é a regra mais delicada

Quatro funções perguntam "essa pessoa está no grupo?". A mais perigosa é
`compartilha_grupo()`, que é o que libera o SELECT em `profiles`: sem o filtro de status,
bastaria pedir para entrar numa comunidade pública para ler nome, curso e turma de todos os
membros — **sem nunca ser aprovado**. A guarda de "mínimo 3 membros" do ranking tem o mesmo
problema pelo avesso: dois amigos mais um convite fantasma a destravariam.

`npm run db:test-rls` verifica as três atacando a API de verdade, com um usuário autenticado
tentando o que a spec proíbe.

---

## Scripts

| | |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | `tsc --noEmit` + build estático em `dist/` |
| `npm run test` | 195 testes do domínio (Vitest) |
| `npm run typecheck` / `lint` | TypeScript strict / ESLint |
| `npm run db:seed` | usuários e faltas de demonstração |
| `npm run db:test-rls` | suíte de segurança contra o banco real |

---

## Estrutura

```
supabase/migrations/   0001 tabelas · 0002 triggers · 0003 RLS · 0004 ranking · 0005 storage
src/domain/            matemática da spec — TypeScript puro, sem React e sem rede, 195 testes
src/data/              repositório tipado + hooks TanStack Query (nenhuma tela importa supabase)
src/theme/             6 temas × claro/escuro, derivados em oklch
src/features/          uma pasta por tela
```

**Os cálculos rodam no cliente**, em `src/domain`, mesmo existindo a view `v_disciplina_status`.
Isso dá uma fonte única para a matemática, funcionamento offline no PWA, e o simulador (§7.3)
respondendo sem ida e volta de rede. A view existe para o que roda no servidor.

---

## Decisões que valem explicação

**O semáforo é um medidor linear, não um gauge radial.** "8h de um teto de 17,5h" é uma razão
contra um limite, e um arco de duas fatias mostraria isso com menos precisão — além de não ter
onde marcar as faixas de 15% e 20%, que é justamente o que a pessoa precisa ver. A escala vai
de 0 aos 25%, não aos 100% da carga: esticar até 100% jogaria três quartos da barra numa região
que ninguém alcança.

**Cores de matéria não usam as faixas do semáforo.** A paleta de identidade evita verde (~145°),
âmbar (~90°) e vermelho (~28°). O motivo apareceu na primeira renderização: uma disciplina com
faixa lateral verde exibindo "Passou do limite" em vermelho lê como contradição. Cor de matéria
é identidade; cor de status é estado.

**Existe um 4º estado, "Passou do limite" (>25%).** A tabela da spec para em "risco", mas a regra
dos 25% implica um ponto sem volta — e a UI precisa parar de oferecer saldo quando não há mais.

**O ranking some abaixo de 3 membros.** Com duas pessoas, saber que você é o 2º é saber
exatamente que a outra faltou menos. Adição nossa à spec.

**Datas trafegam como `'YYYY-MM-DD'`, nunca `Date`.** `new Date('2026-08-12')` é meia-noite UTC,
que em São Paulo cai em 11/08 às 21h — e `getDay()` devolveria terça em vez de quarta. Numa
disciplina com "quarta = 2h", isso descontaria a carga errada.

---

## Widget (§7.4) — o que é possível de verdade

Widget nativo de tela inicial só existe no Windows 11; iOS e Android não expõem isso para PWA.
A tradução honesta é o **badge numérico no ícone** do app instalado (`navigator.setAppBadge`),
com o número de disciplinas em amarelo ou vermelho, atualizado a cada falta — mais os
`shortcuts` do manifest (segurar o ícone → "Marcar falta"). É o mais perto que dá para chegar.

---

## Deploy na Vercel

O projeto é estático: `vite build` gera arquivos, a Vercel só serve. Não há runtime de
servidor nem funções serverless.

### Variáveis de ambiente

Só duas, e ambas são públicas por natureza — vão para dentro do bundle JavaScript:

| Nome | Onde achar |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | idem (a chave `sb_publishable_...`) |

Os nomes precisam ser exatamente esses: o Vite só embute variáveis com prefixo `VITE_`.

**A `SUPABASE_SECRET_KEY` NÃO vai para a Vercel.** Ela ignora todo o RLS e só serve aos
scripts `db:seed` e `db:test-rls`, que rodam na sua máquina lendo o `.env.local`. Num deploy
estático não existe nada que possa usá-la — seria uma credencial de acesso total parada num
lugar sem função.

> **Atenção:** o Vite lê as variáveis no **build**, não em runtime. Mudar um valor na Vercel
> não afeta um deploy já publicado — é preciso redeployar.

### `vercel.json`

Três regras, todas com um motivo concreto:

| Regra | Por quê |
|---|---|
| `rewrites: /(.*) → /index.html` | Fallback de SPA. Sem ele, abrir `/faltas` direto ou dar F5 em `/disciplinas/:id` devolve 404 — esses caminhos não existem como arquivo, e a Vercel não adiciona o fallback automaticamente para Vite puro. A checagem do sistema de arquivos acontece **antes** dos rewrites, então assets, `sw.js` e o manifest continuam sendo servidos direto. |
| `sw.js` e manifest com `max-age=0` | Se o CDN cachear o service worker, o app fica preso numa versão antiga mesmo depois do deploy, e o usuário vê a build velha até limpar o navegador. |
| `/assets/*` com `immutable` | Esses arquivos levam hash no nome, então podem ser cacheados para sempre. |

> Não adicione campos `comment` a este arquivo para documentá-lo. A Vercel valida o schema
> estritamente e recusa propriedades desconhecidas — o build falha com
> *"should NOT have additional property"*. JSON não tem comentário; a documentação é esta tabela.

### Supabase Auth

Em **Authentication → URL Configuration**, aponte para o domínio da Vercel:

- **Site URL**: `https://seu-app.vercel.app`
- **Redirect URLs**: `https://seu-app.vercel.app/**`

Sem isso o e-mail de confirmação de cadastro leva a pessoa de volta para `localhost`.

---

## O que ainda não existe

- **Push fora do app.** Os alertas da §6 funcionam dentro do app e no badge do ícone. Notificação
  com o app fechado exige uma Edge Function + `pg_cron` + Web Push, ainda não implantados.
