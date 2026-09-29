-- SÓ FACILITADOR ABRE PEDIDO
--
-- 29/09/2026. Esta é a versão viva de `criar_solicitacao`; o cabeçalho e a
-- história anterior da função continuam em criar-solicitacao.sql.
--
-- O QUE ACONTECEU
-- Em 28 e 29/09 duas pessoas que não estão na tabela `facilitadores` abriram
-- pedido (C2609-00017 e C2609-00021). A função gravava a solicitação primeiro e
-- só DEPOIS procurava o facilitador. Não achando, seguia em frente: o pedido
-- nascia sem facilitador_id, sem etapa e sem aprovador. Um pedido órfão — que
-- não aparece em fila nenhuma, não avisa ninguém e fica parado para sempre.
-- Ninguém descobriu pelo sistema; descobriu-se porque as pessoas perguntaram.
--
-- A tela já tinha a trava (`EXIGIR_FACILITADOR` em index.html), desligada desde
-- antes de a lista existir — ligar antes trancaria todo mundo. A lista existe
-- desde agosto; a trava continuou desligada por esquecimento.
--
-- AS DUAS PORTAS
-- Ligar a constante fecha a porta da frente. Esta função fecha a de trás: link
-- antigo, aba aberta há dias, chamada direta ao endpoint. Uma trava que mora só
-- no navegador não é trava — é pedido de gentileza.
--
-- QUEM ESTÁ NA LISTA
-- O facilitador da área, e o responsável que o substitui na ausência dele. Na
-- tabela de hoje todo nome que aparece em `substituto` já é, ele próprio,
-- facilitador ativo — então conferir `facilitadores` cobre os dois casos. Se um
-- dia entrar um substituto que não seja facilitador, é aqui que a regra muda.
--
-- POR QUE A RECUSA VEM ANTES DO INSERT
-- Recusar depois de gravar deixa lixo no banco e queima um número de
-- solicitação — a numeração é sequencial e não volta atrás.
--
-- O ENSAIO PASSA POR FORA
-- `p_ensaio` grava e desfaz só para provar que o caminho de escrita está de pé
-- (é o que o contrato.html usa). Ele não tem facilitador e não deve ter.
create or replace function public.criar_solicitacao(
  p_cabecalho jsonb,
  p_itens     jsonb default '[]'::jsonb,
  p_ensaio    boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id      uuid := gen_random_uuid();
  v_numero  text;
  v_quem    text := nullif(trim(p_cabecalho->>'solicitante'), '');
  v_itens   int  := 0;
  v_fac     text;
  v_ini     jsonb;
  v_emp     text := nullif(trim(p_cabecalho->>'empresa_id'), '');
  v_empnome text;
begin
  if v_quem is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_solicitante',
      'mensagem', 'A solicitacao precisa dizer quem esta pedindo.');
  end if;

  -- A TRAVA. Antes de gravar qualquer coisa.
  v_fac := facilitador_de(nullif(trim(p_cabecalho->>'slack_user_id'), ''),
                          nullif(trim(p_cabecalho->>'facilitador_email'), ''));
  if not p_ensaio and v_fac is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_e_facilitador',
      'mensagem', 'Só o facilitador de compras da área — ou quem o substitui na '
               || 'ausência dele — pode abrir pedido. Este acesso não está na lista. '
               || 'Peça ao facilitador da sua área para abrir, ou fale com o setor '
               || 'de compras para ser incluído.');
  end if;

  -- A empresa e lista fechada. A tela cobra a escolha; aqui se cobra que a
  -- escolha EXISTA. Aceitar texto livre num campo que o ERP vai consumir e
  -- entregar ao RPA uma empresa que nao esta na lista do GR.
  if v_emp is not null then
    select nome into v_empnome from empresas where id = v_emp and ativo;
    if v_empnome is null then
      return jsonb_build_object('ok', false, 'erro', 'empresa_invalida',
        'mensagem', 'Empresa não encontrada na lista.');
    end if;
  end if;

  if p_ensaio then
    v_numero := 'ENSAIO-' || substring(v_id::text, 1, 8);
  else
    v_numero := proximo_numero();
  end if;

  insert into solicitacoes (
    id, numero, solicitante, facilitador, facilitador_email, solicitante_nome,
    slack_user_id, observacao, centro_custo, unidade_destino, local_entrega,
    tipo_compra, definicao_fornecedor, justificativa_fornecedor,
    data_necessidade, prioridade, motivo, status, empresa_id, facilitador_id, aberto_em
  ) values (
    v_id, v_numero, v_quem,
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
    v_emp,
    -- Gravado já aqui: até 29/09 só `iniciar_solicitacao` preenchia, e uma falha
    -- no meio do caminho deixava o pedido sem dono.
    v_fac,
    now()
  );

  insert into solicitacao_itens (id, solicitacao_id, codigo, descricao, unidade,
                                 quantidade, fora_catalogo)
  select gen_random_uuid(), v_id,
         nullif(trim(i->>'codigo'), ''), nullif(trim(i->>'descricao'), ''),
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
      'mensagem', 'gravou e desfez: o caminho de escrita esta de pe');
  end if;

  v_ini := etapa_inicial(v_fac, nullif(trim(p_cabecalho->>'tipo_compra'), ''));

  return jsonb_build_object('ok', true, 'id', v_id, 'numero', v_numero,
    'itens', v_itens,
    'empresa_id', v_emp, 'empresa_nome', v_empnome,
    'coluna_inicial', v_ini->>'coluna',
    'papel', v_ini->>'papel',
    'pulou_lideranca', (v_ini->>'pulou')::boolean,
    'motivo_do_pulo', v_ini->>'motivo');
exception
  when others then
    return jsonb_build_object('ok', false, 'erro', 'falha_ao_gravar',
      'mensagem', sqlerrm);
end
$function$;
