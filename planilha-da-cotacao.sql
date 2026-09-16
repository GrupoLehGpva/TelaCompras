-- ============================================================================
-- A PLANILHA COMPARATIVA DE CADA SOLICITAÇÃO
--
-- Quando o card entra em `compras · cotação`, o n8n copia o modelo do OneDrive,
-- escreve o cabeçalho e os itens, e comenta o link no card. Decisão do
-- Guilherme em 16/09: nasce na ENTRADA EM COTAÇÃO, não na criação do pedido —
-- pedido que a liderança reprova nunca chega aqui e não gera arquivo à toa.
--
-- Este arquivo guarda as duas pontas do lado do banco:
--
--   planilha_da_solicitacao(card_id)  → tudo que vai para dentro do arquivo
--   planilha_registrada(card_id, ...) → grava o link e fecha a porta
--
-- POR QUE ISSO MORA NO BANCO E NÃO EM UM NÓ DE CÓDIGO DO n8n
--
-- Porque aqui dá para provar. As travas abaixo (já existe, sem itens, passou
-- de 200) são testáveis em SQL dentro de uma transação que termina em
-- RAISE EXCEPTION — nada some, nada vaza, nada dispara. A mesma regra escrita
-- em JavaScript dentro de um nó só é exercitada movendo card de verdade.
-- ============================================================================

alter table public.solicitacoes
  add column if not exists planilha_url text,
  add column if not exists planilha_item_id text,
  add column if not exists planilha_em timestamptz;

comment on column public.solicitacoes.planilha_url is
  'Link da comparativa no OneDrive. Preenchido é a trava de idempotência: '
  'devolver o card para cotação não gera uma segunda planilha por cima do '
  'trabalho que o Herisson já fez na primeira.';

comment on column public.solicitacoes.planilha_item_id is
  'driveItem id do arquivo no OneDrive — é por ele que se escreve nas células, '
  'não pelo caminho, que muda se alguém renomear.';

-- ---------------------------------------------------------------------------
-- O QUE VAI PARA DENTRO DO ARQUIVO
--
-- Devolve sempre uma linha, sempre com `ok`. Nunca estoura: o n8n precisa da
-- diferença entre "não faça" (já existe) e "não consegui" (passou de 200), e
-- exceção do Postgres chega no n8n como as duas coisas ao mesmo tempo.
-- ---------------------------------------------------------------------------
create or replace function public.planilha_da_solicitacao(p_card_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  qtd int;
  v_itens json;
  v_cabecalho json;
  TETO constant int := 200;   -- linhas 11 a 210 do modelo
begin
  select sol.*,
         emp.nome as empresa_nome,
         cc.nome  as centro_nome
    into s
    from public.solicitacoes sol
    left join public.empresas      emp on emp.id     = sol.empresa_id
    left join public.centros_custo cc  on cc.codigo  = sol.centro_custo
   where sol.card_id = p_card_id
   limit 1;

  if not found then
    return json_build_object(
      'ok', false, 'codigo', 'sem_solicitacao',
      'motivo', 'não achei solicitação com o card ' || coalesce(p_card_id, '(vazio)') ||
                ' — o card existe no ClickUp mas não no banco');
  end if;

  -- Trava 1: já tem planilha. Não é erro; é o caminho normal de um card que
  -- voltou da aprovação gerencial para cotação. Sair calado, mas dizendo qual
  -- é o arquivo, para o n8n poder recomentar o link se quiser.
  if s.planilha_url is not null then
    return json_build_object(
      'ok', false, 'codigo', 'ja_existe',
      'motivo', 'a comparativa desta solicitação já foi gerada',
      'numero', s.numero, 'planilha_url', s.planilha_url,
      'planilha_item_id', s.planilha_item_id);
  end if;

  select count(*) into qtd
    from public.solicitacao_itens where solicitacao_id = s.id;

  if qtd = 0 then
    return json_build_object(
      'ok', false, 'codigo', 'sem_itens',
      'motivo', 'a solicitação ' || s.numero || ' não tem nenhum item — ' ||
                'planilha de cotação vazia não serve para nada',
      'numero', s.numero);
  end if;

  -- Trava 2: o teto de 200 tem que GRITAR. O modelo antigo calculava até a
  -- linha 70 e o 61º item era escrito, sumia das contas, e a planilha seguia
  -- dizendo "Cotou todos os itens". Limite calado é o bug que foi removido;
  -- não vale reintroduzi-lo aqui do lado de fora.
  if qtd > TETO then
    return json_build_object(
      'ok', false, 'codigo', 'passou_do_teto',
      'motivo', 'a solicitação ' || s.numero || ' tem ' || qtd || ' itens e o ' ||
                'modelo da comparativa calcula até ' || TETO || '. NÃO gerei a ' ||
                'planilha: gerar truncado seria pior, porque as contas do resumo ' ||
                'ignorariam os itens de fora sem avisar ninguém.',
      'numero', s.numero, 'total_itens', qtd, 'teto', TETO);
  end if;

  v_cabecalho := json_build_object(
    'numero',        s.numero,
    'centro_custo',  case when s.centro_nome is not null
                          then s.centro_custo || ' · ' || s.centro_nome
                          else coalesce(s.centro_custo, '—') end,
    'solicitante',   coalesce(nullif(trim(s.solicitante_nome), ''), s.solicitante, '—'),
    'tipo_compra',   initcap(coalesce(s.tipo_compra, 'normal')),
    'local_entrega', coalesce(nullif(trim(s.local_entrega), ''),
                              nullif(trim(s.unidade_destino), ''), '—'),
    'entrega_ate',   coalesce(to_char(s.data_necessidade, 'DD/MM/YYYY'), '—'),
    'motivo',        coalesce(nullif(trim(s.motivo), ''), '—'),
    'empresa',       coalesce(s.empresa_nome, '—')
  );

  -- A ordem é por descrição, igual à da tela do comprador
  -- (`compras.html`: order=descricao). Não é gosto: o Herisson confere a
  -- planilha contra aquela tela, e duas ordens diferentes para a mesma lista
  -- é como se perde item na conferência.
  --
  -- O que NÃO serve aqui: `ctid`, que parece ordem de digitação e deixa de ser
  -- assim que alguém edita uma linha, e `id`, que é uuid e não ordena nada.
  select coalesce(json_agg(linha order by ord), '[]'::json) into v_itens
    from (
      select row_number() over (order by i.descricao, i.codigo) as ord,
             json_build_array(
               coalesce(i.codigo, ''),
               coalesce(i.descricao, ''),
               i.quantidade,
               coalesce(i.unidade, ''),
               i.conteudo,
               coalesce(i.unidade_base, '')
             ) as linha
        from public.solicitacao_itens i
       where i.solicitacao_id = s.id
    ) t;

  return json_build_object(
    'ok', true,
    'numero', s.numero,
    'solicitacao_id', s.id,
    'nome_arquivo', s.numero || '-Comparativo.xlsx',
    'total_itens', qtd,
    'ultima_linha', 10 + qtd,
    'cabecalho', v_cabecalho,
    'itens', v_itens
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- FECHAR A PORTA
--
-- Só grava se ainda estiver vazio. Se dois webhooks do ClickUp chegarem juntos
-- (e chegam), o segundo recebe ok=false e sabe que perdeu a corrida — em vez de
-- sobrescrever o link do arquivo que o primeiro acabou de criar.
-- ---------------------------------------------------------------------------
create or replace function public.planilha_registrada(
  p_card_id text, p_url text, p_item_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if coalesce(trim(p_url), '') = '' then
    return json_build_object('ok', false,
      'motivo', 'não dá para registrar planilha sem link');
  end if;

  update public.solicitacoes
     set planilha_url = p_url,
         planilha_item_id = p_item_id,
         planilha_em = now()
   where card_id = p_card_id
     and planilha_url is null;

  get diagnostics n = row_count;

  if n = 0 then
    return json_build_object('ok', false, 'codigo', 'nao_gravou',
      'motivo', 'ou o card ' || coalesce(p_card_id, '(vazio)') ||
                ' não está no banco, ou outra execução registrou a planilha antes');
  end if;

  return json_build_object('ok', true, 'planilha_url', p_url);
end;
$$;

revoke all on function public.planilha_da_solicitacao(text) from anon, authenticated;
revoke all on function public.planilha_registrada(text, text, text) from anon, authenticated;
grant execute on function public.planilha_da_solicitacao(text)          to service_role;
grant execute on function public.planilha_registrada(text, text, text)  to service_role;
