# Continuar daqui

Documento de passagem entre sessões. O assunto aberto é **um bug de layout no
PWA instalado no iPhone**. Os números do aparelho **já foram lidos** — a causa
está medida e resta uma pergunta, que só o aparelho responde.

Todo push em `main` dispara deploy na Vercel automaticamente.

---

## 1. O bug aberto (prioridade)

### O relato

No **iPhone 17 Pro Max**, com o app adicionado à tela de início (modo
standalone), a barra de menu inferior — Início / Faltas / Calendário / Turmas /
Ranking — fica com **espaço a mais embaixo**. Nas palavras do usuário:

> "como se fosse o espaço reservado daquele campo de url do safari, mas quando
> estou no pwa na home screen isso não aparece"

A intuição estava certa, e é literalmente o que os números mostram.

### O que o aparelho respondeu (12/08/2026)

Diagnóstico do aparelho, iPhone 17 Pro Max em standalone:

| | |
|---|---|
| `display-mode` / `navigator.standalone` | standalone / true |
| `inset topo` / `inset base` | 62px / 34px |
| `innerHeight` = `100dvh` = `visualViewport` | **912px** |
| `100vh` = `screen.height` | **956px** |
| `100svh` | 894px |
| barra: altura / base em / sobra abaixo | 83px / 912px / **0px** |

**A leitura:** a tela tem 956px de CSS, o viewport tem 912. **Sobram 44px de
tela que o WebKit não entrega para o layout** e nos quais o sistema não desenha
nada. `bottom: 0` é o fim do viewport, não a borda do vidro — por isso a barra
para 44px acima do fundo, com o menu correto e encostado *no lugar errado*.

O trio `svh 894 / dvh 912 / vh 956` é a assinatura de um navegador com barra
retrátil: 62px de chrome no menor viewport, 44px no atual, zero no maior. Em
standalone essa barra não existe — o WebKit reserva o espaço mesmo assim.

Somando o que empurra os rótulos para cima: **44px da faixa fantasma + 34px do
`safe-area-inset-bottom`**, e esse inset é recuo para um indicador de gesto que
está do outro lado da faixa e nem encosta na barra. Dá ~78px de vazio embaixo
dos rótulos, que é exatamente o que se vê no print.

### O print, medido pixel a pixel

O PNG foi decodificado (zlib + un-filter, ~60 linhas de Node) e conferido
linha a linha. Vale repetir a técnica: **o print é fonte de medida, não só
ilustração**.

- Escala: 736px de imagem = 440pt de tela e 1600 = 956 → o print é a tela
  inteira, sem corte, em ambos os eixos.
- A borda superior da barra (`border-t`) aparece na linha 1388 da imagem =
  **829pt** = 912 − 83. Confere com o `getBoundingClientRect`.
- De 1456 até o fim (1599) a cor é **uniforme**, `rgb(19,14,10)` — idêntica ao
  fundo da página no topo da tela. Não há emenda visível onde o viewport
  termina.
- `background_color` do manifest é `#0b0b12` (azulado). O que está pintado na
  faixa é o fundo do tema *fogo* (quente). Indício de que quem pinta ali é a
  página, não o sistema — mas não é prova: o WKWebView também deriva a cor de
  fundo da própria página para pintar o que está fora dela.
- O indicador de gesto não aparece no print, o que continua sem explicação.

### A pergunta que sobrou

**O WebKit desenha dentro da faixa de 44px?**

- Se **sim** (modelo de "obscured insets", como o conteúdo que passa por baixo
  da barra translúcida do Safari): a superfície tem os 956px e basta puxar a
  barra para dentro da faixa. Fica com a geometria da barra de abas nativa.
- Se **não**: a superfície tem 912px mesmo, e puxar a barra corta 44px dela.
  Aí o certo é só descontar o inset, que naquele caso não protege nada.

Não dá para responder isso do Windows, e as duas correções são incompatíveis.
Por isso foi ao ar um **seletor de modo** dentro do Diagnóstico do aparelho:

| Modo | O que faz |
|---|---|
| `normal` | comportamento antigo, para comparar |
| `rasa` | desconta a faixa do recuo (**padrão** — melhora sem risco de corte) |
| `puxada` | joga a barra para dentro da faixa, até a borda física |

**Como decidir:** com `puxada`, olhar o aparelho. Barra encostada na borda e
rótulos inteiros → o iOS desenha na faixa, `puxada` é a correção. Barra cortada
ou rótulos comidos → `rasa` é a correção. Os números do diagnóstico *não*
respondem isso: `barra: base em` vira 956 e `sobra` vira −44 de qualquer jeito,
porque é o que o CSS pediu. Quem responde é o olho.

O código: `src/features/pwa/faixaFantasma.ts` (mede a faixa e publica
`--faixa-fantasma`, com teste da função pura), as três regras de
`.barra-inferior` em `src/styles/index.css`, e o seletor em
`DiagnosticoViewport.tsx`.

### O que a medição já descartou

- **A hipótese antiga estava errada.** Achava-se que `100dvh` computava *maior*
  que a tela. É o contrário: `dvh` = `innerHeight` = 912, certinho, e quem
  estoura é `100vh` = 956 = a tela inteira. Trocar `h-dvh` por `h-svh` teria
  **piorado** (894 é ainda menor).
- **A barra não tem defeito de posicionamento.** `sobra abaixo da barra = 0`:
  ela está colada no fundo do viewport que recebeu. Não há bloco de contenção,
  não há dupla contagem de safe-area.
- **Nenhum ancestral com `backdrop-filter` atrapalha** o `position: fixed` da
  barra (armadilha que já custou caro neste projeto — ver a lista mais abaixo).
- **`viewport-fit=cover` e `black-translucent` estão corretos**: o `inset topo`
  de 62px só é diferente de zero por causa deles, e o conteúdo sobe até o topo
  físico da tela.

### Depois de resolver

1. Fixar o modo vencedor direto no CSS e apagar os outros dois.
2. **Remover o diagnóstico**: `DiagnosticoViewport.tsx`, o
   `<DiagnosticoViewport />` em `TelaConfiguracoes.tsx` e o seletor de modo.
   `faixaFantasma.ts` **fica** — a medição continua sendo necessária.

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
npm run test         # vitest — 292 testes
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
