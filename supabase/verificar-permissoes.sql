-- ============================================================================
-- Conferência de permissões de execução
--   npm run db:sql -- supabase/verificar-permissoes.sql
--
-- Existe por causa de um defeito real: `revoke execute ... from anon` NÃO
-- fecha a função. O Postgres concede EXECUTE a PUBLIC por padrão em toda
-- função nova, e `anon` herda de PUBLIC — então revogar só de `anon` deixa a
-- concessão herdada de pé e a função continua chamável sem login.
--
-- O jeito correto é revogar de PUBLIC (o que também tira de anon) e devolver
-- explicitamente a quem deve ter.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Nenhuma função de public pode ser executável por anon
-- ---------------------------------------------------------------------------
select
  '1. anon não executa' as checagem,
  p.proname            as funcao,
  case when has_function_privilege('anon', p.oid, 'EXECUTE')
       then '❌ ABERTA AO ANON' else '✅' end as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
order by has_function_privilege('anon', p.oid, 'EXECUTE') desc, p.proname;

-- ---------------------------------------------------------------------------
-- 2. As funções de cálculo interno seguem fechadas até para authenticated.
--    São SECURITY DEFINER e ignoram RLS: expostas, leem faltas alheias.
-- ---------------------------------------------------------------------------
select
  '2. cálculo interno fechado' as checagem,
  p.proname as funcao,
  case when has_function_privilege('authenticated', p.oid, 'EXECUTE')
       then '❌ EXPOSTA' else '✅' end as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('horas_faltadas', 'status_risco_de');

-- ---------------------------------------------------------------------------
-- 3. Toda SECURITY DEFINER precisa de search_path pinado
-- ---------------------------------------------------------------------------
select
  '3. search_path' as checagem,
  p.proname as funcao,
  case when array_to_string(coalesce(p.proconfig, '{}'), ',') like '%search_path%'
       then '✅' else '❌ SOLTO' end as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by 3 desc, p.proname;

-- ---------------------------------------------------------------------------
-- 4. schema_migrations com RLS e sem policy: é tabela de controle do runner,
--    ninguém pela API deve tocá-la. O runner conecta como dono, e dono não é
--    submetido a RLS.
-- ---------------------------------------------------------------------------
select
  '4. schema_migrations' as checagem,
  c.relrowsecurity as rls_ligado,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename = 'schema_migrations') as policies,
  case when c.relrowsecurity then '✅' else '❌ SEM RLS' end as ok
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'schema_migrations';
