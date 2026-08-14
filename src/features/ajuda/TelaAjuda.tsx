import {
  Bell,
  BookOpen,
  CalendarRange,
  ChevronDown,
  Gauge,
  Lock,
  Smartphone,
  Users,
} from 'lucide-react'
import { useState, type ComponentType, type ReactNode } from 'react'

import { Cartao } from '@/components/ui/Cartao.tsx'
import { Cabecalho } from '@/layout/pecas.tsx'
import { cn } from '@/lib/cn.ts'

/**
 * O manual, dentro do app.
 *
 * Existe porque as duas coisas que mais surpreendem aqui não são descobertas
 * usando: que a falta desconta as HORAS daquela aula (e não "uma falta"), e
 * que o limite de reprovação pode não ser seu — a turma responde por ele.
 * Quem não entende de onde vem o número não confia no semáforo, e um semáforo
 * em que não se confia não muda decisão nenhuma.
 *
 * Tudo recolhido por padrão: a tela serve para procurar uma resposta, não para
 * ser lida de cabo a rabo. Uma parede de texto aberta esconde o índice, que é
 * justamente a parte útil.
 */

interface Secao {
  readonly id: string
  readonly titulo: string
  readonly resumo: string
  readonly icone: ComponentType<{ className?: string }>
  readonly corpo: ReactNode
}

const SECOES: readonly Secao[] = [
  {
    id: 'falta',
    titulo: 'Como uma falta é contada',
    resumo: 'Horas da aula daquele dia, não "uma falta".',
    icone: BookOpen,
    corpo: (
      <>
        <p>
          Cada disciplina tem uma grade: quantas horas de aula ela tem em cada dia da semana.
          Faltar numa segunda de 4h custa <strong>4 horas</strong>; faltar numa quarta de 2h
          custa 2. É por isso que o app pede a data, e não um número — quem sabe o preço da
          falta é a grade.
        </p>
        <p>
          Faltar num dia em que a disciplina não tem aula é recusado. Não é frescura da tela:
          a recusa vem do banco, então vale mesmo que algo tente registrar por fora.
        </p>
        <p>
          <strong>Atestado:</strong> ao marcar a falta, o app pergunta se você tem atestado
          para ela. Se o atestado cobre vários dias, preencha o &ldquo;cobre até&rdquo; e ele
          marca de uma vez as faltas já registradas do período, em todas as disciplinas. Não
          há prazo: dá para marcar quando quiser, inclusive meses depois.
        </p>
        <p>
          <strong>Mas a falta com atestado continua contando</strong> para o limite, e isso é
          de propósito. Em boa parte das faculdades o atestado comum não abona frequência — só
          o regime de exercícios domiciliares faz isso, e ele é para afastamento longo, pedido
          na secretaria. Um app que descontasse sozinho mostraria verde para quem a secretaria
          vê em vermelho. A marcação é o seu registro de que o papel existe: aparece separada,
          em &ldquo;3 faltas, 2 com atestado&rdquo;, e vai no relatório em coluna própria. O
          que ela nunca faz é derrubar o seu percentual.
        </p>
      </>
    ),
  },
  {
    id: 'semaforo',
    titulo: 'O semáforo e o limite',
    resumo: 'De onde vem o número que decide se você está bem.',
    icone: Gauge,
    corpo: (
      <>
        <p>
          A barra de cada disciplina vai de zero até o <strong>limite</strong>, e não até 100%
          da carga horária. Faz diferença: esticar até 100% jogaria três quartos da barra numa
          região que ninguém alcança, e você não veria os 15% chegando.
        </p>
        <ul>
          <li>
            <strong>Verde</strong> — folga.
          </li>
          <li>
            <strong>Amarelo</strong> — o limite está se aproximando.
          </li>
          <li>
            <strong>Vermelho</strong> — mais algumas faltas e reprova por frequência.
          </li>
          <li>
            <strong>Passou do limite</strong> — não há mais saldo, e o app para de sugerir
            quanto você ainda pode faltar.
          </li>
        </ul>
        <p>
          <strong>O limite não é uma preferência.</strong> Ele vem do regimento do seu curso, e
          por isso o app procura por ele em ordem, do mais específico para o mais geral:
        </p>
        <ol>
          <li>a <strong>disciplina</strong>, quando ela tem regra própria (estágio, por exemplo);</li>
          <li>a sua <strong>turma</strong>, definida por quem administra a comunidade;</li>
          <li>o seu ajuste em <strong>Ajustes</strong>;</li>
          <li>e, na falta de todos, o padrão de 25%.</li>
        </ol>
        <p>
          Quando a turma define, o controle em Ajustes some e aparece escrito quem decidiu. Não
          é para tirar sua liberdade: é que um limite que cada um afrouxa sozinho não serve
          para comparar nada nem para avisar ninguém.
        </p>
        <p>
          <strong>As faixas de alerta continuam suas — só que para apertar.</strong> Verde e
          amarelo não reprovam ninguém: são o aviso de que a hora está chegando. Você pode
          pedir para ser avisado <em>antes</em> do que a turma combinou; depois, não.
        </p>
        <p>
          Na tela de uma disciplina há o <strong>simulador</strong>: ele responde "se eu faltar
          mais duas quartas, onde eu paro?" sem você precisar marcar nada.
        </p>
      </>
    ),
  },
  {
    id: 'turma',
    titulo: 'A turma',
    resumo: 'Regra do curso, semestre e a comparação com os colegas.',
    icone: Users,
    corpo: (
      <>
        <p>
          Entrar na comunidade da sua turma liga suas disciplinas a ela. Isso faz três coisas:
          traz a regra do curso, traz o calendário do período e destrava o ranking.
        </p>
        <p>
          <strong>O ranking mostra apenas a colocação.</strong> Nunca a porcentagem, as horas
          ou a faixa de ninguém — nem as suas para os outros, nem as dos outros para você. A
          ordenação acontece dentro do banco e o que sai pela porta é só "3º lugar". Ele também
          só aparece a partir de <strong>três membros ativos</strong>: com duas pessoas, saber
          que você é o segundo é saber exatamente quanto a outra faltou.
        </p>
        <p>
          Quem pediu para entrar e ainda não foi aprovado não é membro: não lê a lista, não lê
          os perfis, não vê o ranking e não conta para chegar aos três.
        </p>
        <p>
          <strong>Virada de semestre.</strong> Quem administra a turma anuncia o período novo,
          e todo mundo recebe um aviso. Mas ninguém apaga o dado de ninguém: quem arquiva o seu
          é você, em Relatórios. Guarda-se o resumo por disciplina no histórico; as faltas
          individuais — datas e marcações de atestado — não voltam, então baixe o backup antes, que fica
          logo acima do botão.
        </p>
      </>
    ),
  },
  {
    id: 'privacidade',
    titulo: 'Quem vê as suas faltas',
    resumo: 'Ninguém. Nem a coordenação, nem quem administra o app.',
    icone: Lock,
    corpo: (
      <>
        <p>
          Suas faltas são suas. A garantia não é a interface esconder — é o banco recusar:
          uma consulta que peça as faltas de outra pessoa volta vazia, venha de onde vier.
        </p>
        <p>
          A única leitura cruzada que existe no app inteiro é o ranking, e ela devolve
          exclusivamente a colocação. Nem a coordenação, nem quem mantém o catálogo de
          disciplinas, nem o dono da sua turma consegue ver um número seu.
        </p>
        <p>
          O relatório em PDF e o backup em JSON são gerados no seu aparelho, a partir dos seus
          dados. Quem decide mostrar para a coordenação é você.
        </p>
      </>
    ),
  },
  {
    id: 'avisos',
    titulo: 'Avisos',
    resumo: 'O que o app te conta sem você abrir.',
    icone: Bell,
    corpo: (
      <>
        <ul>
          <li>
            <strong>Mudou de faixa</strong> — uma disciplina entrou no amarelo ou no vermelho.
          </li>
          <li>
            <strong>Aviso preventivo</strong> — se faltar de novo nesta disciplina, passa do
            limite. Chega no único momento em que ainda muda uma decisão.
          </li>
          <li>
            <strong>Resumo da semana</strong> — quantas faltas, em quais disciplinas.
          </li>
          <li>
            <strong>Sequência</strong> — marcos de dias sem faltar.
          </li>
        </ul>
        <p>
          O ícone do app na tela de início carrega um número: quantas disciplinas estão em
          amarelo ou vermelho. Ele se atualiza a cada falta marcada.
        </p>
        <p>
          Notificação com o app fechado ainda não existe — isso depende de um serviço rodando
          fora do seu aparelho, que não está implantado.
        </p>
      </>
    ),
  },
  {
    id: 'disciplinas',
    titulo: 'Suas disciplinas',
    resumo: 'De onde elas vêm, e quem pode cadastrar cada tipo.',
    icone: BookOpen,
    corpo: (
      <>
        <p>
          A tela fica em <strong>Minhas disciplinas</strong>, no menu <strong>⋯</strong> do
          cabeçalho ou no botão abaixo dos cartões da tela inicial. Existem três origens
          possíveis, e a diferença entre elas é <em>quem tem a chave</em>:
        </p>
        <ul>
          <li>
            <strong>Do catálogo do seu período</strong> — cadastradas por quem administra o
            app inteiro, com carga e grade prontas. Você só escolhe quais cursa.
          </li>
          <li>
            <strong>Da sua turma</strong> — cadastradas por quem administra a comunidade, na
            tela dela. É o caso normal de quem montou a própria turma: não precisa de
            permissão de administrador do app.
          </li>
          <li>
            <strong>Pessoal</strong> — para optativa ou curso fora da lista. Só você a
            enxerga, e ela não entra no ranking: não haveria com quem comparar.
          </li>
        </ul>
        <p>
          As duas primeiras entram <strong>vinculadas à turma</strong> e contam no ranking; a
          terceira, não. Nas três, faltar custa as horas da grade daquele dia.
        </p>
        <p>
          <strong>Se a lista aparecer vazia</strong>, é porque ninguém cadastrou nada ainda
          para o seu curso e período. Quem administra a sua turma resolve isso em Turmas →
          a comunidade → <strong>Disciplinas da turma</strong>. Enquanto isso, a disciplina
          pessoal funciona para o controle de faltas.
        </p>
        <p>
          No fim desse formulário aparece <strong>"Regra desta disciplina"</strong>, com o campo
          em branco. <strong>Pode deixar assim.</strong> Em branco quer dizer "esta disciplina
          segue a mesma regra das outras" — e o texto embaixo mostra em quanto isso dá hoje. Se
          um dia a sua turma mudar o limite, esta disciplina muda junto, sozinha.
        </p>
        <p>
          Preencher só vale a pena quando uma disciplina foge do resto: estágio costuma exigir
          frequência maior que o restante do curso. Aí o número que você escrever passa a valer
          só nela, e para de acompanhar a regra geral.
        </p>
      </>
    ),
  },
  {
    id: 'celular',
    titulo: 'No celular',
    resumo: 'Instalar, e levar as aulas para o calendário.',
    icone: Smartphone,
    corpo: (
      <>
        <p>
          <strong>Instalar na tela de início.</strong> No Android, o botão instala num toque.
          No iPhone não existe API de instalação — nenhuma —, então lá o botão abre o passo a
          passo: Compartilhar → Adicionar à Tela de Início, e precisa ser pelo Safari. Em outro
          navegador o iOS cria um atalho que não vira app de verdade.
        </p>
        <p>
          <strong>Atalhos.</strong> Com o app instalado, segurar o ícone abre Marcar falta, Meu
          risco, Calendário e Turmas.
        </p>
        <p>
          <strong>Levar as aulas para o calendário.</strong> Em Calendário, o botão de agenda
          gera um arquivo com a sua grade como evento semanal até o fim do semestre. No celular
          ele abre direto a bandeja de compartilhamento, com o Calendário como destino.
        </p>
      </>
    ),
  },
  {
    id: 'semestre',
    titulo: 'Fim do semestre',
    resumo: 'O que fica guardado e o que não volta.',
    icone: CalendarRange,
    corpo: (
      <>
        <p>
          Arquivar um semestre, em Relatórios, faz três coisas: guarda um resumo por
          disciplina no histórico, apaga as faltas daquele período e desativa as matrículas —
          as disciplinas em si não são apagadas.
        </p>
        <p>
          <strong>O que não volta:</strong> as datas de cada falta e as marcações de atestado. O
          histórico guarda o retrato final (percentual, horas, situação), não o detalhe. Por
          isso o backup em JSON fica logo acima do botão: ele leva tudo, e é o único jeito de
          recuperar o detalhe depois.
        </p>
        <p>
          A confirmação pede que você digite o nome do semestre. É de propósito: é uma ação
          irreversível sobre meses de registro, e dois botões lado a lado são fáceis demais de
          tocar por engano no celular.
        </p>
      </>
    ),
  },
]

export function TelaAjuda() {
  const [aberta, setAberta] = useState<string | null>(null)

  return (
    <>
      <Cabecalho titulo="Como funciona" subtitulo="Manual" />

      <main className="mx-auto max-w-2xl space-y-3 px-5 pt-5 pb-28 lg:pb-10">
        <p className="px-1 text-sm font-semibold text-texto-suave">
          O app existe para responder uma pergunta: <strong className="text-texto">quanto
          ainda dá para faltar sem reprovar por frequência?</strong> Tudo aqui embaixo é
          detalhe de como ele chega nessa resposta.
        </p>

        {SECOES.map((s) => {
          const Icone = s.icone
          const estaAberta = aberta === s.id
          return (
            <Cartao key={s.id} className="overflow-hidden">
              <h2>
                <button
                  type="button"
                  aria-expanded={estaAberta}
                  aria-controls={`secao-${s.id}`}
                  onClick={() => {
                    setAberta(estaAberta ? null : s.id)
                  }}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-acento-suave">
                    <Icone className="size-5 text-acento" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold text-texto">{s.titulo}</span>
                    <span className="block text-xs font-semibold text-texto-suave">
                      {s.resumo}
                    </span>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      'size-5 shrink-0 text-texto-fraco transition-transform',
                      estaAberta && 'rotate-180',
                    )}
                  />
                </button>
              </h2>

              {estaAberta && (
                <div
                  id={`secao-${s.id}`}
                  className="prosa border-t border-borda px-4 pt-4 pb-5"
                >
                  {s.corpo}
                </div>
              )}
            </Cartao>
          )
        })}

        <p className="px-1 pt-2 text-center text-xs font-semibold text-texto-fraco">
          Ficou faltando alguma coisa aqui? É sinal de que a tela também não estava clara.
        </p>
      </main>
    </>
  )
}
