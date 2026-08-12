-- ============================================================================
-- Controle de Faltas — conferência do schema
--
-- Rode no SQL Editor DEPOIS de 0001..0005 + seed.sql.
-- Cada bloco devolve uma coluna `ok`. Qualquer ❌ significa que a migration
-- correspondente não subiu como deveria — e, nos blocos 3 e 4, que a
-- privacidade exigida pela §5 da spec NÃO está garantida.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RLS habilitado em todas as tabelas de public
--    (o projeto foi criado sem "Enable automatic RLS", então isto importa)
-- ---------------------------------------------------------------------------
select
  '1. RLS por tabela'          as verificacao,
  c.relname                    as tabela,
  case when c.relrowsecurity then '✅' else '❌ RLS DESLIGADO' end as ok
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;

-- ---------------------------------------------------------------------------
-- 2. Toda tabela tem pelo menos uma policy
--    (RLS ligado sem policy = tabela vazia para todo mundo; RLS desligado com
--     policy = policy decorativa. As duas pontas precisam bater.)
-- ---------------------------------------------------------------------------
select
  '2. Policies por tabela' as verificacao,
  c.relname                as tabela,
  count(p.polname)         as policies,
  case when count(p.polname) > 0 then '✅' else '❌ SEM POLICY' end as ok
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname
order by count(p.polname) asc, c.relname;

-- ---------------------------------------------------------------------------
-- 3. Funções SECURITY DEFINER precisam ter search_path fixado
--    Sem isso, um schema malicioso no search_path pode sequestrar as tabelas
--    referenciadas dentro da função, que roda com privilégios do dono.
-- ---------------------------------------------------------------------------
select
  '3. search_path das DEFINER' as verificacao,
  p.proname                    as funcao,
  case
    when array_to_string(coalesce(p.proconfig, '{}'), ',') like '%search_path%' then '✅'
    else '❌ SEARCH_PATH SOLTO'
  end as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by 3 desc, p.proname;

-- ---------------------------------------------------------------------------
-- 4. As funções de cálculo interno NÃO podem ser chamáveis pelo cliente
--    horas_faltadas() e status_risco_de() são SECURITY DEFINER e ignoram RLS.
--    Se `authenticated` puder executá-las, qualquer aluno lê as faltas do
--    colega passando o uuid dele — violação direta da §5.
-- ---------------------------------------------------------------------------
select
  '4. Cálculo interno fechado' as verificacao,
  p.proname                    as funcao,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_executa,
  case
    when has_function_privilege('authenticated', p.oid, 'EXECUTE') then '❌ EXPOSTA AO CLIENTE'
    else '✅'
  end as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('horas_faltadas', 'status_risco_de');

-- ---------------------------------------------------------------------------
-- 5. get_group_ranking não pode devolver número nenhum (§5)
--    Confere a assinatura de retorno: só id, nome, avatar, emoji, posição e
--    "sou eu". Se aparecer percentual/horas aqui, a spec foi violada.
-- ---------------------------------------------------------------------------
select
  '5. Retorno do ranking' as verificacao,
  pg_get_function_result(p.oid) as retorno,
  case
    when pg_get_function_result(p.oid) ~* '(percentual|horas|carga|faixa|status)'
      then '❌ VAZA NÚMERO'
    else '✅'
  end as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_group_ranking';

-- ---------------------------------------------------------------------------
-- 6. Catálogo do seed: grade e teto de 25% por disciplina
--    "Medicina, Família e Comunidade" precisa aparecer com 70h,
--    seg=4h, qua=2h e 17.5h até a reprovação.
-- ---------------------------------------------------------------------------
select
  '6. Catálogo'                        as verificacao,
  d.nome,
  d.carga_horaria_total                as carga,
  string_agg(
    (array['dom','seg','ter','qua','qui','sex','sáb'])[g.dia_semana + 1]
      || '=' || trim(to_char(g.horas, 'FM990.9')) || 'h',
    ', ' order by g.dia_semana
  )                                    as grade,
  round(d.carga_horaria_total * 0.25, 2) as horas_ate_reprovar
from public.disciplinas d
join public.disciplina_grade g on g.disciplina_id = d.id
where not d.personalizada
group by d.id, d.nome, d.carga_horaria_total
order by d.nome;

-- ---------------------------------------------------------------------------
-- 7. Trigger da §3 funcionando: falta em dia sem aula tem que estourar
--    Roda dentro de um bloco que desfaz tudo — não grava nada.
-- ---------------------------------------------------------------------------
do $$
declare
  v_erro text;
begin
  begin
    -- 2026-08-14 é uma sexta-feira; MFC só tem aula segunda e quarta.
    insert into public.faltas (usuario_id, disciplina_id, data)
    values (
      '00000000-0000-4000-8000-000000000000',
      'd15c0000-0000-4000-8000-000000000001',
      date '2026-08-14'
    );
    raise warning '7. Trigger de grade: ❌ ACEITOU falta em dia sem aula';
  exception
    when others then
      v_erro := sqlerrm;
      if v_erro like '%não tem aula%' then
        raise notice '7. Trigger de grade: ✅ recusou falta em dia sem aula';
      else
        raise notice '7. Trigger de grade: ⚠️  falhou por outro motivo: %', v_erro;
      end if;
  end;
  -- nada é persistido: ou o insert falhou, ou o raise abaixo desfaz
  raise exception using message = 'rollback proposital da verificação';
exception
  when others then null;
end;
$$;
