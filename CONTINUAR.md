# Continuar daqui

Documento de passagem entre sessões. O assunto aberto é **um bug de layout no
PWA instalado no iPhone**, e a instrumentação para diagnosticá-lo já está em
produção — falta ler os números do aparelho.

Estado do repositório: `main` em `9aa9629`, já publicado. Nada pendente de
commit. Todo push em `main` dispara deploy na Vercel automaticamente.

---

## 1. O bug aberto (prioridade)

### O relato

No **iPhone 17 Pro Max**, com o app adicionado à tela de início (modo
standalone), a barra de menu inferior — Início / Faltas / Calendário / Turmas /
Ranking — fica com **espaço a mais embaixo**. Nas palavras do usuário:

> "como se fosse o espaço reservado daquele campo de url do safari, mas quando
> estou no pwa na home screen isso não aparece"

Ou seja: o app parece reservar altura para uma barra de navegador que, em
standalone, não existe.

**Importante:** o usuário mandou prints várias vezes e **as imagens não
chegaram com conteúdo visível** para o assistente. Se acontecer de novo, peça
para ele **salvar o print num arquivo no PC e passar o caminho** (ex.:
`C:\Users\phili\Downloads\print.png`) — a ferramenta `Read` lê imagem do disco
e isso funciona quando o anexo do chat falha.

### O que JÁ foi descartado por auditoria de código

- **Não há dupla contagem de safe-area.** A barra aplica o padding uma vez só,
  em `src/layout/Layout.tsx`, via
  `pb-[max(env(safe-area-inset-bottom,0px),0.5rem)]`. A classe utilitária
  `.area-segura-base` foi removida da barra justamente para não somar duas
  vezes; ela segue em uso só nas folhas (modais), onde está correta.
- **`viewport-fit=cover` está presente** em `index.html`, que é pré-requisito
  para os insets serem diferentes de zero no iOS.
- **A altura da barra está certa em todos os aparelhos simulados.** Medido com
  viewport real de 360×740, 375×667, 390×844 e 430×932: item de 48px, nenhum
  rótulo cortado, total entre 57px e 83px conforme o inset.

### A hipótese principal

O `100dvh` da casca do app (`h-dvh` no `<div>` raiz do `Layout`) pode estar
computando **maior que a tela real** dentro do PWA em standalone no iOS. É um
comportamento conhecido e errático do WebKit, e bate exatamente com a descrição
de "espaço reservado da barra de URL".

Se for isso, a correção é trocar a unidade da casca — `100svh`, ou `height:
100%` com `html, body { height: 100% }`, que em standalone equivale à tela
real. **Não mude no escuro:** confirme com os números primeiro.

### Como confirmar — o diagnóstico já está no ar

1. Abrir o app **instalado na tela de início** do iPhone (não no Safari — o
   ponto é justamente o modo standalone).
2. Ir em **Ajustes** → rolar até o fim → tocar em **"Diagnóstico do aparelho"**.
3. Ler os valores.

O componente é `src/features/config/DiagnosticoViewport.tsx`. Ele mede
`env()` por sonda (não é legível por JS direto) e usa três réguas de altura.

### Como interpretar

| Leitura | Conclusão | Correção |
|---|---|---|
| `100dvh` **maior** que `innerHeight` | Confirmado: o iOS reserva altura de uma barra que não existe | Trocar `h-dvh` da casca por `h-svh`, ou `height:100%` com `html,body{height:100%}` |
| `100dvh` **igual** a `innerHeight`, mas `sobra abaixo da barra` > 0 | A barra não está encostando no fundo do viewport | Investigar o `fixed bottom-0` — provável bloco de contenção criado por algum ancestral |
| `inset base` **maior que 34px** | O iPhone 17 reporta safe-area maior que os modelos anteriores | Rever o `max(inset, 0.5rem)`; talvez limitar com `min(inset, 34px)` |
| Tudo consistente e `sobra` = 0 | O espaço é o próprio safe-area, e está correto | Aí é decisão de gosto: reduzir o item de 48px, ou aceitar como está |

### Depois de resolver

**Remover o diagnóstico.** É instrumentação temporária: apagar
`DiagnosticoViewport.tsx` e o `<DiagnosticoViewport />` em
`src/features/config/TelaConfiguracoes.tsx`.

---

## 2. Outros pendentes

### Nunca testado de verdade

- **Brevo → Supabase, com e-mail real.** A cadeia está configurada (SMTP,
  domínio `philipidev.com` autenticado com DKIM/DMARC, remetente
  `nao-responda@philipidev.com`), mas **nenhuma mensagem passou por ela**. Um
  cadastro real com confirmação por e-mail resolve em um minuto. Já está em
  produção, então é melhor descobrir antes de um usuário.
- **Exportar PDF** (`Relatórios`) nunca foi acionado — baixar arquivo exige
  autorização do usuário e ela não foi pedida.
- **O `.ics` nunca foi baixado de fato.** O conteúdo foi validado
  interceptando o blob, e o `navigator.share` foi validado substituindo a
  função. O fluxo real no celular segue sem teste.
- **O botão de instalar no Android real.** Ele só aparece com service worker
  ativo, ou seja, em produção — nunca no `npm run dev`.

### Melhoria já identificada, não feita

**Nome de comunidade trunca em todas as larguras**, até nos 430px do iPhone
Pro Max: *"Medicina 5º período — Turm..."*. A causa não é falta de espaço, é
repetição: o título diz "Medicina 5º período — Turma A" e o subtítulo logo
abaixo repete "UNISA · Medicina · 5º período · Turma A". A mesma informação
duas vezes disputando a largura mais escassa do app. Resolver tirando do
subtítulo o que já está no título. O usuário foi perguntado e ainda não
respondeu.

---

## 3. O que um chat novo precisa saber

### Comandos

```
npm run dev          # Vite em :5173 (service worker DESLIGADO em dev)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test         # vitest — 285 testes
npm run build        # tsc + vite build (é o que a Vercel roda)
npm run icones       # regera os PNGs do ícone a partir da geometria do SVG

npm run db:migrate   # aplica migrations pendentes (12 aplicadas)
npm run db:seed      # recria os 7 usuários demo, senha faltas123
npm run db:sql -- "<sql>" | <arquivo.sql>
npm run db:test-rls  # 31 ataques reais contra o banco
```

Contas demo: `voce@demo.test` (aluno), `admin@demo.test` (back-office), mais
marina/rafael/bia/teo/lu. Senha `faltas123` em todas.

### Testar layout mobile no Windows

O Chrome **não deixa a janela ficar menor que ~500px** de viewport, e o
`resize_window` da extensão falha em silêncio quando a janela está
maximizada. Dois truques que funcionaram:

1. **PowerShell + user32.dll** para restaurar e mover a janela
   (`ShowWindow(h, 9)` e depois `MoveWindow`). Achar o handle enumerando
   janelas de classe `Chrome_WidgetWin_1` — o título é "Controle de Faltas -
   Google Chrome".
2. **Iframe do tamanho do aparelho.** As media queries dentro de um iframe
   respondem ao tamanho **dele**, não ao da janela. É assim que dá para testar
   360px numa janela de 500. Limitação: `env(safe-area-inset-*)` é sempre 0
   dentro do iframe, então safe-area precisa ser calculada, não observada.

### Armadilhas já pagas neste projeto

- **`capitalize` do CSS maiúsculiza toda palavra** — virou "Agosto **De**
  2026". Para texto de várias palavras use `first-letter:uppercase`.
- **`overscroll-behavior` no `body` não chega à viewport** se o `html` tem
  `overflow` diferente de `visible`. Tem que estar no `html`.
- **`backdrop-filter` cria bloco de contenção para `position: fixed`.** Uma
  folha dentro do `<header>` (que tem `backdrop-blur`) media 68px em vez da
  tela inteira. Solução: `createPortal` para o `body`.
- **Duas queries não podem dividir chave de cache** com formatos diferentes.
  `useGrupos` e `useMinhasComunidades` faziam isso e o ranking travava com
  chips sem texto. Há `src/data/chaves.test.ts` guardando contra a volta.
- **`profiles!inner` é ambíguo** em `grupo_membros` — a tabela tem dois FKs
  para `profiles`. Nomeie a constraint.
- **O iOS ignora SVG em `apple-touch-icon`.** Precisa de PNG.
- **`beforeinstallprompt` dispara antes do React montar.** O listener está em
  `main.tsx`, fora de qualquer `useEffect`.
- **`vercel.json` é validado com rigor pela Vercel** e não aceita campos
  extras. Já quebrou o build por causa de um campo `comment`.

### Onde estão as regras de negócio

As três regras da spec moram **no banco**, não na interface:

- `trg_falta_horas` — a falta desconta as horas daquele dia da grade, e
  sobrescreve o que o cliente mandar.
- `trg_prazo_atestado` — janela de 7 dias para justificar.
- RLS + `get_group_ranking` — o ranking devolve posição, nunca número.

`npm run db:test-rls` prova as três contra o banco de verdade.
