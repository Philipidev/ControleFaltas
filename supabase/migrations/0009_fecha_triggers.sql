-- ============================================================================
-- Controle de Faltas — 0009: fecha as funções de trigger para o cliente
--
-- A 0008 revogou de `public` e `anon`, mas o Supabase mantém um DEFAULT
-- PRIVILEGE concedendo EXECUTE a `authenticated` em toda função nova de
-- public. Resultado: as quatro funções de trigger continuaram chamáveis por
-- usuário logado.
--
-- Chamar uma trigger function direto no Postgres já falha ("can only be called
-- as trigger"), então não era explorável — mas depender desse acidente para
-- estar seguro é frágil. Aqui a regra passa a ser explícita.
--
-- A abordagem também muda: em vez de revogar só de alguns papéis e torcer
-- para a lista estar completa, revoga-se de TODOS e devolve-se apenas ao que
-- está na lista de permitidas. Nega por padrão, permite por exceção — que é o
-- que faz uma função nova nascer fechada em vez de aberta.
-- ============================================================================

do $$
declare
  f record;
  permitidas text[] := array[
    -- helpers chamados de dentro das policies: sem EXECUTE, toda leitura
    -- protegida por elas falharia para o usuário logado
    'is_admin',
    'eh_membro_do_grupo',
    'eh_admin_do_grupo',
    'compartilha_grupo',
    -- RPCs que o app chama
    'get_group_ranking',
    'get_resumo_semanal',
    'entrar_no_grupo',
    'criar_comunidade',
    'buscar_comunidades',
    'solicitar_acesso',
    'responder_solicitacao',
    'convidar_para_grupo',
    'responder_convite',
    'remover_membro',
    'transferir_propriedade',
    'definir_papel',
    'vincular_disciplinas_ao_grupo',
    'contar_pendencias'
  ];
begin
  for f in
    select p.oid::regprocedure as assinatura, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);

    if f.proname = any (permitidas) then
      execute format('grant execute on function %s to authenticated', f.assinatura);
    end if;
  end loop;
end $$;

-- Funções novas em public nascem fechadas para o cliente. Sem isto, a próxima
-- SECURITY DEFINER criada volta a herdar EXECUTE por default privilege, e o
-- problema reaparece exatamente igual.
alter default privileges in schema public
  revoke execute on functions from anon;

select
  p.proname                                                 as funcao,
  has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as autenticado
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;
