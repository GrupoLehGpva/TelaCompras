-- ============================================================================
-- ABRIR UM PEDIDO É UMA OPERAÇÃO, NÃO UM INSERT
--
-- O formulário gravava direto na tabela, com `Prefer: return=representation`
-- para receber o id de volta. Isso é um INSERT ... RETURNING — e no Postgres o
-- RETURNING também passa pela política de LEITURA. Quando a leitura pública foi
-- fechada (a correção de LGPD), o insert continuou permitido e o retorno não:
-- o formulário parou de gravar com "new row violates row-level security policy".
--
-- Duas lições ficaram no código:
--   1. fechar leitura quebra escrita que lê de volta. Não é óbvio, e não foi
--      previsto;
--   2. as baterias simulam o Supabase, e o contrato.html testava leitura e
--      escrita PROIBIDA — nunca a escrita que precisa dar certo. O teste que
--      faltava é o que teria pegado isto em segundos.
--
-- Além de resolver, esta função conserta um problema que estava lá desde o
-- começo: cabeçalho e itens iam em duas chamadas. Falha entre uma e outra
-- deixava um pedido sem itens, e ninguém ficava sabendo. Agora é uma coisa só:
-- ou grava tudo, ou não grava nada.
--
-- As colunas aceitas são uma lista fechada. Quem chama esta função é uma página
-- pública; deixá-la escrever coluna livre seria entregar o controle do fluxo —
-- card_id, etapa_atual e aprovador_atual são de quem conduz, não de quem pede.
-- ============================================================================

create or replace function public.criar_solicitacao(
  p_cabecalho jsonb,
  p_itens     jsonb default '[]'::jsonb,
  -- Modo ensaio: grava e desfaz na mesma chamada. Existe para o conferidor de
  -- contrato poder testar a ESCRITA QUE PRECISA DAR CERTO — o teste que faltava
  -- e que teria pegado este bug em segundos — sem deixar pedido de mentira na
  -- base. Mesmo caminho, mesmas colunas, mesmas travas; só não sobra nada.
  p_ensaio    boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id     uuid := gen_random_uuid();
  v_numero text := nullif(trim(p_cabecalho->>'numero'), '');
  v_quem   text := nullif(trim(p_cabecalho->>'solicitante'), '');
  v_itens  int  := 0;
begin
  if v_numero is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_numero',
      'mensagem', 'A solicitação precisa de um número.');
  end if;
  if v_quem is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_solicitante',
      'mensagem', 'A solicitação precisa dizer quem está pedindo.');
  end if;

  -- Aqui entra, quando for a hora, a trava de que só facilitador abre pedido.
  -- Fica marcada de propósito: é uma linha, e o lugar dela é este — no servidor,
  -- não na tela, que qualquer um contorna.

  insert into solicitacoes (
    id, numero, solicitante, facilitador, facilitador_email, solicitante_nome,
    slack_user_id, observacao, centro_custo, unidade_destino, local_entrega,
    tipo_compra, definicao_fornecedor, justificativa_fornecedor,
    data_necessidade, prioridade, motivo, status, aberto_em
  ) values (
    v_id,
    v_numero,
    v_quem,
    nullif(trim(p_cabecalho->>'facilitador'), ''),
    lower(nullif(trim(p_cabecalho->>'facilitador_email'), '')),
    nullif(trim(p_cabecalho->>'solicitante_nome'), ''),
    nullif(trim(p_cabecalho->>'slack_user_id'), ''),
    nullif(trim(p_cabecalho->>'observacao'), ''),
    nullif(trim(p_cabecalho->>'centro_custo'), ''),
    nullif(trim(p_cabecalho->>'unidade_destino'), ''),
    nullif(trim(p_cabecalho->>'local_entrega'), ''),
    nullif(trim(p_cabecalho->>'tipo_compra'), ''),
    nullif(trim(p_cabecalho->>'definicao_fornecedor'), ''),
    nullif(trim(p_cabecalho->>'justificativa_fornecedor'), ''),
    nullif(p_cabecalho->>'data_necessidade', '')::date,
    coalesce(nullif(trim(p_cabecalho->>'prioridade'), ''), 'normal'),
    nullif(trim(p_cabecalho->>'motivo'), ''),
    coalesce(nullif(trim(p_cabecalho->>'status'), ''), 'aguardando aprovacao'),
    now()
  );

  insert into solicitacao_itens (id, solicitacao_id, codigo, descricao, unidade,
                                 quantidade, fora_catalogo)
  select gen_random_uuid(), v_id,
         nullif(trim(i->>'codigo'), ''),
         nullif(trim(i->>'descricao'), ''),
         nullif(trim(i->>'unidade'), ''),
         coalesce(nullif(i->>'quantidade','')::numeric, 1),
         coalesce((i->>'fora_catalogo')::boolean, false)
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) i
   where nullif(trim(i->>'descricao'), '') is not null;

  get diagnostics v_itens = row_count;

  if p_ensaio then
    delete from solicitacao_itens where solicitacao_id = v_id;
    delete from solicitacoes      where id = v_id;
    return jsonb_build_object('ok', true, 'ensaio', true, 'itens', v_itens,
      'mensagem', 'gravou e desfez: o caminho de escrita está de pé');
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'numero', v_numero, 'itens', v_itens);
exception
  when others then
    -- A transação da função desfaz o cabeçalho junto. Devolve o motivo em vez
    -- de estourar: a tela precisa dizer à pessoa o que aconteceu.
    return jsonb_build_object('ok', false, 'erro', 'falha_ao_gravar',
      'mensagem', sqlerrm);
end
$function$;

revoke all on function public.criar_solicitacao(jsonb, jsonb, boolean) from public;
grant execute on function public.criar_solicitacao(jsonb, jsonb, boolean) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RODAR SÓ DEPOIS que o index.html novo estiver no ar.
--
-- Com a função no lugar, a tabela não precisa mais aceitar escrita direta, e
-- fechar isto tira do ar a possibilidade de qualquer um com a chave pública
-- despejar linhas soltas na base.
--
-- Mas a ordem importa, e é a mesma lição de hoje de manhã: mudar a política
-- antes da tela subir derruba o formulário publicado. Primeiro a tela, depois
-- a política.
-- ---------------------------------------------------------------------------
-- drop policy if exists "solicitacoes criacao publica"      on public.solicitacoes;
-- drop policy if exists "solicitacao_itens criacao publica" on public.solicitacao_itens;
