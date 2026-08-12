-- ============================================================================
-- Controle de Faltas — 0010: função nasce fechada
--
-- O DEFEITO QUE ISTO CORRIGE
--
-- Eu escrevi, em 0004 e 0006, coisas como:
--
--     revoke execute on function public.is_admin() from anon;
--
-- Isso NÃO fecha a função. O Postgres concede EXECUTE a PUBLIC por padrão em
-- toda função nova, e `anon` herda de PUBLIC — então revogar só de `anon`
-- deixa a concessão herdada intacta e a função continua chamável sem login.
--
-- A 0009 corrigiu a maioria, mas escapou de três: normalizar_busca,
-- set_atualizado_em e trg_prazo_atestado. Corrigir uma por uma repete o
-- mesmo erro na próxima função que alguém criar.
--
-- Então aqui a abordagem inverte: revoga de PUBLIC em TUDO e devolve só à
-- lista permitida. O que não estiver na lista fica fechado — inclusive o que
-- vier depois, por causa do ALTER DEFAULT PRIVILEGES no fim.
--
-- Nenhuma dessas revogações afeta triggers: trigger roda no contexto do dono
-- da tabela, não do chamador, e não consulta EXECUTE.
-- ============================================================================

do $$
declare
  f record;
  -- Só o que o cliente autenticado precisa chamar de verdade.
  permitidas constant text[] := array[
    'get_group_ranking',
    'get_resumo_semanal',
    'entrar_no_grupo',
    'is_admin',
    'eh_membro_do_grupo',
    'eh_admin_do_grupo',
    'compartilha_grupo',
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
    select p.oid::regprocedure as assinatura, p.proname as nome
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
  loop
    -- Tira de todo mundo (PUBLIC cobre anon e authenticated por herança).
    execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);

    -- Devolve só a quem está na lista, e só ao papel logado.
    if f.nome = any (permitidas) then
      execute format('grant execute on function %s to authenticated', f.assinatura);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Daqui pra frente, função nova nasce sem EXECUTE para anon e authenticated.
-- Quem criar uma que o cliente precise chamar tem de conceder explicitamente —
-- que é o comportamento certo: acesso é decisão consciente, não herança.
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;
