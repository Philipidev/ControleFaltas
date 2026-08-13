# Controle de Faltas

App para estudantes registrarem faltas **por disciplina**, onde cada falta desconta **as horas
da aula daquele dia** — não "1 falta genérica". Mostra o risco de reprovação por frequência e
permite comparar presença com a turma **sem expor número nenhum de ninguém**.

Vite + React 19 + TypeScript strict · Supabase (Postgres + Auth + RLS) · PWA.

> **Retomando o trabalho?** Leia [`CONTINUAR.md`](./CONTINUAR.md) primeiro. Ele registra o
> que foi medido no iPhone sobre a faixa que o iOS reserva embaixo do PWA, o que ainda não
> foi testado de verdade, e o que ficou decidido mas não feito.

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
| **§5** — privacidade | RLS + `get_group_ranking` | `select * from faltas` devolve só as suas. O ranking é calculado dentro do banco e devolve **apenas a colocação**. |
| **Comunidades** — pendente não é membro | `status='ativo'` em 4 funções | Quem só pediu para entrar não lê a lista de membros, nem os perfis, nem o ranking — e não conta na guarda de 3 pessoas. |

> Havia uma terceira regra aqui, a **§7.1**: `trg_prazo_atestado` recusava justificar uma falta
> com mais de 7 dias. A 0015 apagou o trigger. O prazo é da secretaria, não do app, e travar o
> registro só impedia a pessoa de anotar o que de fato aconteceu.

### Por que "pendente não é membro" é a regra mais delicada

Quatro funções perguntam "essa pessoa está no grupo?". A mais perigosa é
`compartilha_grupo()`, que é o que libera o SELECT em `profiles`: sem o filtro de status,
bastaria pedir para entrar numa comunidade pública para ler nome, curso e turma de todos os
membros — **sem nunca ser aprovado**. A guarda de "mínimo 3 membros" do ranking tem o mesmo
problema pelo avesso: dois amigos mais um convite fantasma a destravariam.

`npm run db:test-rls` verifica as três atacando a API de verdade, com um usuário autenticado
tentando o que a spec proíbe.

---

## De quem é a regra do curso

"Reprova por falta acima de 25%" vem do regimento da faculdade, não do gosto de quem usa o
app. Enquanto foi um controle deslizante pessoal, dava para arrastá-lo até 50% e ficar verde
— e o ranking comparava colegas sob fórmulas diferentes, porque cada um levava a própria
régua para dentro da soma.

A regra é resolvida em cascata, do específico ao geral. Cada nível guarda `null` para dizer
"não decido isto, pergunte acima":

| Nível | Guarda | Quem preenche |
|---|---|---|
| Disciplina | limite de reprovação | admin do catálogo, ou quem cria a avulsa |
| Comunidade | limite + faixas de alerta | dono/admin da turma |
| Você | tudo, em Ajustes | você |
| Padrão | 25% / 15% / 20% | — |

O elo entre disciplina e comunidade é `matriculas.grupo_id`, preenchido por
`vincular_disciplinas_ao_grupo()` ao entrar na turma. Sem turma, ou numa disciplina avulsa,
o nível pessoal continua valendo — é o mesmo mecanismo, não uma exceção.

**As faixas de alerta são a única exceção, e só para baixo.** Verde e amarelo não reprovam
ninguém: são o aviso de que a hora está chegando. Quem quer ser avisado antes está ajustando
o próprio alarme; quem quer ser avisado depois está mexendo na régua coletiva pela porta dos
fundos.

A cascata mora em `src/domain/limites.ts` (função pura, com teste tabelado) e é repetida em
`v_disciplina_status` para o servidor não discordar do cliente. O ranking (§5) usa **só** os
níveis coletivos: disciplina e comunidade, nunca a configuração pessoal de cada um — do
contrário, duas pessoas com o mesmo histórico trocariam de lugar por causa de uma chave que
só uma delas viu.

### O semestre é da turma; o arquivo é de cada um

O rótulo "2026.2" saía do calendário — até junho `.1`, depois `.2` —, o que erra para quem
cursa um período que atravessa o meio do ano e deixava cada colega virar o semestre num dia
diferente. Quem sabe quando o período acaba é a turma, então ela diz (`grupos.semestre`).

Mas **virar o semestre não apaga nada de ninguém**: quem administra marca a data e os
membros recebem um aviso; cada pessoa arquiva o seu em Relatórios, com os próprios dados na
mão e depois do backup. Um botão que apagasse o semestre de 40 pessoas não deveria caber na
mão de um colega.

---

## Scripts

| | |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | `tsc --noEmit` + build estático em `dist/` |
| `npm run test` | 319 testes (Vitest), quase todos do domínio puro |
| `npm run typecheck` / `lint` | TypeScript strict / ESLint |
| `npm run db:migrate` | aplica as migrations pendentes |
| `npm run db:sql` | consulta avulsa ou arquivo `.sql` |
| `npm run db:seed` | usuários, faltas e comunidades de demonstração |
| `npm run db:test-rls` | ataques reais contra o banco |

---

## Estrutura

```
supabase/migrations/   0001 tabelas · 0002 triggers · 0003 RLS · 0004 ranking · 0005 storage
                       0006 comunidades · 0007 RPCs das comunidades
                       0013 regra do curso em cascata · 0014 semestre da turma
                       0015 atestado vira anotação (e desfaz a 0005)
src/domain/            matemática da spec — TypeScript puro, sem React e sem rede
src/data/              repositório tipado + hooks TanStack Query (nenhuma tela importa supabase)
src/theme/             6 temas × claro/escuro, derivados em oklch
src/features/          uma pasta por tela
scripts/               migrate · sql · seed · test-rls (TypeScript, rodam com --experimental-strip-types)
```

**Os cálculos rodam no cliente**, em `src/domain`, mesmo existindo a view `v_disciplina_status`.
Isso dá uma fonte única para a matemática, funcionamento offline no PWA, e o simulador (§7.3)
respondendo sem ida e volta de rede. A view existe para o que roda no servidor.

---

## Decisões que valem explicação

**O atestado é anotação, não desconto.** Marcar uma falta como "com atestado" não derruba o
percentual: ela conta igual a qualquer outra. Isso é o contrário do que o app fazia, e a troca
foi deliberada. Em boa parte das faculdades brasileiras o atestado comum **não** abona
frequência — quem tira falta da frequência é o regime de exercícios domiciliares
(Decreto-Lei 1.044/69), que é para afastamento longo e se pede na secretaria. Enquanto o
desconto era configurável, a resposta certa dependia de um regimento que quem cadastra a
disciplina não tem em mãos, e a pergunta aparecia em quatro telas com cinco redações
diferentes. Escolher errar para o lado seguro custa mostrar um percentual mais alto do que o
da secretaria em algumas faculdades; escolher o outro lado custa dizer "verde" para quem
reprovou.

O que a marcação faz é ficar registrada: `qtd_justificadas`/`total_justificado` alimentam
"3 faltas, 2 com atestado" na disciplina e uma coluna própria no PDF. É o seu controle de qual
falta tem papel — útil na hora de conversar com a secretaria, inútil como analgésico.

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

## Celular: ícone, atalhos e widget (§7.4)

### Ícone na tela de início

Funciona nos dois sistemas. O detalhe que quebrava só o iOS: **o iPhone ignora SVG em
`apple-touch-icon`** — enquanto o link apontava para `/icone.svg`, "Adicionar à Tela de
Início" usava um print da página no lugar do ícone. Os PNGs vêm de `npm run icones`, um
rasterizador em Node puro (`node:zlib`, sem `sharp`) que desenha a mesma geometria do SVG.

O `apple-touch-icon.png` é **quadrado e opaco** de propósito: o iOS aplica o próprio recorte
squircle por cima. Se o PNG já viesse arredondado, os cantos transparentes cairiam dentro da
máscara do sistema, e o iOS compõe transparência sobre preto — quatro lascas escuras na borda.

### O botão "Colocar na tela de início"

Aparece no login (discreto) e no Perfil (cartão). Ele **se comporta diferente em cada
sistema**, porque os sistemas são diferentes:

| Situação | O que o botão faz |
|---|---|
| Android / Chrome / Edge | Instala de verdade, num toque (`beforeinstallprompt` → `prompt()`) |
| iPhone no Safari | Abre o passo a passo: Compartilhar → Adicionar à Tela de Início |
| iPhone em outro navegador | Avisa que só o Safari cria o app de verdade |
| Já instalado | Some |
| Navegador sem suporte | Some |

**No iOS não existe API de instalação** — nem `beforeinstallprompt`, nem equivalente. Lá
o passo a passo *é* o recurso; um botão "Instalar" que não instala seria pior que nenhum.

Dois detalhes que quebram silenciosamente:

- O listener de `beforeinstallprompt` é registrado em `main.tsx`, **antes do render**. O
  evento costuma disparar antes de o React montar, e um listener criado em `useEffect`
  chegaria tarde — o botão nunca apareceria no Android.
- A detecção de plataforma é uma função pura (`classificar`) com teste próprio. A diferença
  entre iPad e Mac (user agent idêntico; só `maxTouchPoints` separa) e entre Safari e Chrome
  do iPhone mora em detalhes de string impossíveis de conferir de um computador com Windows.

### Atalhos (o mais perto de um widget)

Segurar o ícone abre os `shortcuts` do manifest: Marcar falta, Meu risco, Calendário, Turmas.
Toda URL de atalho precisa ser rota real — `/faltas/nova` apontava para rota inexistente e caía
no catch-all, então o atalho "Marcar falta" levava para a home sem abrir nada.

### Widget nativo: não dá, e por quê

Widget de tela inicial no iOS é WidgetKit (Swift) e no Android é App Widget (Kotlin/Glance).
**Não existe API web para nenhum dos dois**, nem para PWA instalado. O membro `widgets` do Web
App Manifest existe, mas só alimenta o painel de widgets do Windows 11 no Edge — não é iOS nem
Android.

O que existe de fato, e está implementado: o **badge numérico no ícone**
(`navigator.setAppBadge`) com as disciplinas em amarelo ou vermelho, atualizado a cada falta,
mais os atalhos acima.

Widget de verdade exigiria embrulhar o app em Capacitor e escrever uma extensão nativa por
plataforma — outro projeto, com build de Xcode e Android Studio, conta de desenvolvedor Apple e
revisão nas lojas. Fica registrado aqui para a decisão ser consciente, não uma surpresa.

### Levar as aulas para o calendário do celular

`Calendário → botão de agenda no topo` gera um `.ics` (RFC 5545) com a grade como evento
semanal até o fim do semestre.

Também não há API para escrever no calendário nativo — o `.ics` é a ponte. O que muda a
experiência é como ele chega lá: o caminho principal é `navigator.share` **com o arquivo**, que
abre a bandeja do sistema com "Calendário" como destino (um toque). Baixar o arquivo é o que
sobra no desktop, onde não há bandeja.

Três detalhes do formato que costumam passar batido, e que `src/domain/ics.ts` cobre com testes:
escape de `,` `;` `\` em TEXT (o nome "Medicina, Família e Comunidade" quebra o parser sem
isso), dobra de linha em **75 octetos** e não caracteres (acento em UTF-8 ocupa dois bytes), e
CRLF — com LF puro o iOS recusa o arquivo inteiro.

O horário da aula vem de `disciplina_grade.hora_inicio` (migration 0012), que é nullable e não
participa de cálculo nenhum de falta. Para as aulas sem horário, a exportação pergunta um
padrão em vez de chutar em silêncio.

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
