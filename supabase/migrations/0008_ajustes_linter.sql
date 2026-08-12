-- ============================================================================
-- Controle de Faltas — 0008: correções apontadas pelo linter do Supabase
--
-- Três achados, com gravidades bem diferentes:
--
-- 1. ERRO — schema_migrations sem RLS. Tabela criada pelo runner de
--    migrations (scripts/migrar.ts), e eu esqueci de protegê-la. Como o
--    projeto expõe tabelas novas na API automaticamente, ela ficou LEGÍVEL E
--    GRAVÁVEL por qualquer um com a anon key. Ninguém rouba dado de aluno com
--    isso, mas dá para apagar o registro de qual migration já rodou e deixar
--    o estado do banco irreprodutível.
--
-- 2. AVISO REAL — `revoke ... from anon` não era suficiente. O Postgres
--    concede EXECUTE ao papel PUBLIC por padrão em toda função nova, e `anon`
--    é membro de PUBLIC. Revogar de `anon` sem revogar de `public` deixa a
--    concessão herdada de pé: na prática as funções continuaram chamáveis sem
--    login. Nenhuma delas vaza dado (todas dependem de auth.uid(), que é nulo
--    para anon, então respondem "não"), mas o buraco existia e é o tipo de
--    coisa que só não dói por acaso.
--
-- 3. FALSO POSITIVO — "Signed-In Users Can Execute SECURITY DEFINER Function"
--    nas RPCs de comunidade. É exatamente o desenho: as tabelas estão
--    fechadas por RLS e as RPCs são a única porta, cada uma checando quem
--    pode o quê lá dentro. Fechá-las quebraria o app sem ganhar segurança.
--    Ficam como estão, de propósito.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. schema_migrations
--
-- RLS ligado e nenhuma policy: ninguém pela API enxerga ou escreve. O runner
-- continua funcionando porque conecta como dono da tabela, e dono não é
-- submetido a RLS (não usamos FORCE ROW LEVEL SECURITY).
-- ---------------------------------------------------------------------------
alter table if exists public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;

comment on table public.schema_migrations is
  'Controle do runner de migrations. Sem policy de propósito: só o dono acessa.';

-- ---------------------------------------------------------------------------
-- 2. search_path fixado nas duas funções que faltaram
--
-- Sem search_path fixo, um schema malicioso à frente no caminho pode
-- sequestrar as funções e operadores usados dentro do corpo. Nestas duas o
-- risco é pequeno — nenhuma lê tabela — mas o custo de fechar é uma linha, e
-- normalizar_busca roda DENTRO de buscar_comunidades, que é SECURITY DEFINER.
-- ---------------------------------------------------------------------------
create or replace function public.normalizar_busca(p_texto text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select lower(translate(
    coalesce(p_texto, ''),
    'áàâãäéèêëíìîïóòôõöúùûüñçºª',
    'aaaaaeeeeiiiiooooouuuunc  '
  ));
$$;

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Fechar o PUBLIC de verdade
--
-- Percorre TODA função SECURITY DEFINER de public e revoga de PUBLIC — que é
-- de onde vinha a permissão herdada. Feito em laço, e não à mão, porque uma
-- lista escrita manualmente é exatamente o que fica desatualizada na próxima
-- migration e reabre o buraco em silêncio.
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon', f.assinatura);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Devolver o acesso a quem precisa
--
-- Duas famílias precisam de EXECUTE para `authenticated`:
--
--   a) Os helpers usados DENTRO das policies. Quando uma policy chama uma
--      função, quem executa é o usuário da consulta — sem EXECUTE, toda
--      leitura protegida por essas policies falharia.
--   b) As RPCs que o app chama.
--
-- Ficam de fora, sem acesso para ninguém: as funções de trigger (rodam pelo
-- gatilho, como dono da tabela), normalizar_busca (roda dentro de uma DEFINER,
-- com os privilégios do dono) e as de cálculo interno horas_faltadas /
-- status_risco_de — estas duas ignoram RLS e, expostas, deixariam qualquer
-- aluno ler as faltas do colega passando o uuid dele.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
  permitidas text[] := array[
    -- (a) helpers das policies
    'is_admin()',
    'eh_membro_do_grupo(uuid)',
    'eh_admin_do_grupo(uuid)',
    'compartilha_grupo(uuid)',
    -- (b) RPCs do app
    'get_group_ranking(uuid, uuid)',
    'get_resumo_semanal(date)',
    'entrar_no_grupo(text)',
    'criar_comunidade(text, public.visibilidade_grupo, text, text, text, text, text, text)',
    'buscar_comunidades(text, integer)',
    'solicitar_acesso(uuid, text)',
    'responder_solicitacao(uuid, uuid, boolean)',
    'convidar_para_grupo(uuid, text)',
    'responder_convite(uuid, boolean)',
    'remover_membro(uuid, uuid)',
    'transferir_propriedade(uuid, uuid)',
    'definir_papel(uuid, uuid, boolean)',
    'vincular_disciplinas_ao_grupo(uuid)',
    'contar_pendencias()'
  ];
begin
  foreach f in array permitidas loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Conferência: o que sobrou acessível a quem
-- ---------------------------------------------------------------------------
select
  p.proname                                                   as funcao,
  has_function_privilege('anon', p.oid, 'EXECUTE')            as anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE')   as autenticado,
  case
    when has_function_privilege('anon', p.oid, 'EXECUTE') then '❌ ABERTA AO ANON'
    when p.proname in ('horas_faltadas', 'status_risco_de')
     and has_function_privilege('authenticated', p.oid, 'EXECUTE') then '❌ CALCULO EXPOSTO'
    else '✅'
  end                                                         as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by 4 desc, p.proname;
