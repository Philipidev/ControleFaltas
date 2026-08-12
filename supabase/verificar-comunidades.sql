-- ============================================================================
-- Conferência do schema de comunidades (0006 + 0007)
--   npm run db:sql -- supabase/verificar-comunidades.sql
--
-- O bloco 3 é o que mais importa: se qualquer uma das quatro funções de
-- membresia não filtrar por status, um simples solicitante passa a enxergar
-- coisas que só membro deveria ver.
-- ============================================================================

select
  '1. colunas novas' as checagem,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'grupos'
      and column_name in ('visibilidade','instituicao','descricao','emoji','arquivada')) as em_grupos,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'grupo_membros'
      and column_name in ('status','convidado_por','mensagem','respondido_em')) as em_membros,
  case when
    (select count(*) from information_schema.columns
      where table_schema='public' and table_name='grupos'
        and column_name in ('visibilidade','instituicao','descricao','emoji','arquivada')) = 5
   and
    (select count(*) from information_schema.columns
      where table_schema='public' and table_name='grupo_membros'
        and column_name in ('status','convidado_por','mensagem','respondido_em')) = 4
  then '✅' else '❌' end as ok;

select
  '2. RPCs criadas' as checagem,
  count(*) as encontradas,
  case when count(*) = 12 then '✅' else '❌ faltam ' || (12 - count(*))::text end as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'criar_comunidade','buscar_comunidades','solicitar_acesso','responder_solicitacao',
    'convidar_para_grupo','responder_convite','remover_membro','transferir_propriedade',
    'definir_papel','vincular_disciplinas_ao_grupo','contar_pendencias','eh_admin_do_grupo'
  );

-- ---------------------------------------------------------------------------
-- 3. O bloco crítico: pendente não pode contar como membro.
-- ---------------------------------------------------------------------------
select
  '3. filtra status ativo' as checagem,
  p.proname as funcao,
  case when p.prosrc like '%''ativo''%' then '✅' else '❌ NÃO FILTRA' end as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('eh_membro_do_grupo','compartilha_grupo','eh_admin_do_grupo','get_group_ranking')
order by p.proname;

-- ---------------------------------------------------------------------------
-- 4. grupo_membros não pode ter policy de INSERT nem de UPDATE: toda transição
--    de status passa pelas RPCs. Com escrita aberta, qualquer um se inseriria
--    como 'ativo' em qualquer comunidade.
-- ---------------------------------------------------------------------------
select
  '4. escrita fechada em grupo_membros' as checagem,
  coalesce(string_agg(cmd, ', ' order by cmd), '(nenhuma)') as comandos_com_policy,
  case when count(*) filter (where cmd in ('INSERT','UPDATE')) = 0
       then '✅' else '❌ ESCRITA ABERTA' end as ok
from pg_policies
where schemaname = 'public' and tablename = 'grupo_membros';

-- ---------------------------------------------------------------------------
-- 5. RLS ligado nas tabelas novas
-- ---------------------------------------------------------------------------
select
  '5. RLS' as checagem,
  c.relname as tabela,
  case when c.relrowsecurity then '✅' else '❌ DESLIGADO' end as ok
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('grupos','grupo_membros','grupo_convites_email');

-- ---------------------------------------------------------------------------
-- 6. Estado dos dados existentes
-- ---------------------------------------------------------------------------
select
  '6. dados' as checagem,
  count(*) as membros,
  count(*) filter (where status = 'ativo') as ativos,
  count(*) filter (where papel = 'dono') as donos,
  case when count(*) = count(*) filter (where status = 'ativo')
       then '✅ todos migraram como ativos' else '❌' end as ok
from public.grupo_membros;

select
  '7. comunidades' as checagem,
  g.nome,
  g.visibilidade::text,
  (select count(*) from public.grupo_membros gm
    where gm.grupo_id = g.id and gm.status = 'ativo') as membros_ativos
from public.grupos g
order by g.nome;
