-- ============================================================================
-- BATERIA DO CAMINHO DAS TELAS — roda inteira numa transação e DESFAZ TUDO no
-- fim (o RAISE final derruba a transação). Nada fica gravado, nenhum número de
-- solicitação é consumido, nenhum aviso sai (não há workflow lendo os avisos).
--
-- Rodar:  select _teste_caminho_telas();   (sempre termina em erro de propósito)
-- Saída: RESULTADO {"total": N, "passou": N, "falhas": [...]}
-- ============================================================================
create or replace function public._teste_caminho_telas()
returns void language plpgsql set search_path = public as $$
declare
  res jsonb := '[]'::jsonb;
  r jsonb; r2 jsonb; x jsonb;
  tf text; tf2 text; tfin text; tfab text; tfbr text;
  ta_br text; ta_w text; ta_j text; ta_ed text;
  tc text; tc2 text; tp text;
  cc text := '1814';
  i_a1 text; i_a2 text; i_b1 text;
  f1 text; f2 text; f3 text; f4 text; f5 text;
  cab jsonb; itens jsonb; itens_mapa jsonb;
  vP uuid; vQ uuid; vR uuid; vS uuid; vT uuid; vU uuid; vV uuid; vW uuid;
  vM uuid; vN uuid; vNM uuid; vL uuid; vRep uuid; vRepF uuid; vX uuid;
  ver int; mver int;
  n0 bigint; n1 bigint;
  id_a1 uuid; id_a2 uuid; id_b1 uuid;
  mapa jsonb;
  real_id uuid;
  cnt int;
  total int; falhas jsonb;
begin
  -- -------------------------------------------------------------- credenciais
  select token into tf   from facilitadores where id = 'eduarda';
  select token into tf2  from facilitadores where id = 'leticia';
  select token into tfin from facilitadores where id = 'wienfried';
  select token into tfab from facilitadores where id = 'fabio';
  select token into tfbr from facilitadores where id = 'a-brandao';
  select token into ta_br from aprovadores where id = 'a-brandao';
  select token into ta_w  from aprovadores where id = 'wienfried';
  select token into ta_j  from aprovadores where id = 'jamil';
  select token into ta_ed from aprovadores where id = 'edilson';
  select token into tc  from compradores where id = 'herisson';
  select token into tc2 from compradores where id = 'adelson';
  select token into tp  from painel_acesso where ativo limit 1;

  -- -------------------------------------------------------------- dados
  select codigo into i_a1 from catalogo_itens where ativo and familia = 'MM' order by codigo limit 1;
  select codigo into i_a2 from catalogo_itens where ativo and familia = 'MM' order by codigo offset 1 limit 1;
  select codigo into i_b1 from catalogo_itens where ativo and familia = 'MG' order by codigo limit 1;
  select id into f1 from fornecedores where ativo order by id limit 1;
  select id into f2 from fornecedores where ativo order by id offset 1 limit 1;
  select id into f3 from fornecedores where ativo order by id offset 2 limit 1;
  select id into f4 from fornecedores where ativo order by id offset 3 limit 1;
  select id into f5 from fornecedores where ativo order by id offset 4 limit 1;

  cab := jsonb_build_object('tipo_compra', 'normal', 'definicao_fornecedor', 'cotacao',
           'centro_custo', cc, 'motivo', 'Teste automático', 'data_necessidade', '2026-10-10',
           'solicitante_nome', 'Teste', 'facilitador', 'Hacker', 'facilitador_email', 'hacker@x.com');
  itens := jsonb_build_array(
    jsonb_build_object('codigo', i_a1, 'descricao', 'Item A1', 'unidade', 'UN', 'quantidade', 2),
    jsonb_build_object('codigo', i_a2, 'descricao', 'Item A2', 'unidade', 'UN', 'quantidade', 1),
    jsonb_build_object('codigo', i_b1, 'descricao', 'Item B1', 'unidade', 'UN', 'quantidade', 10));

  select count(*) into n0 from solicitacoes;

  -- ======================================================== A. ABERTURA
  r := abrir_pedido_telas('fc-inventado', cab, itens);
  res := res || jsonb_build_array(jsonb_build_object('c','A1 token inválido','ok', r->>'erro'='token_invalido','r',r));
  r := abrir_pedido_telas(tf, cab, '[]'::jsonb);
  res := res || jsonb_build_array(jsonb_build_object('c','A2 sem itens','ok', r->>'erro'='sem_itens','r',r));
  r := abrir_pedido_telas(tf, cab, jsonb_build_array(jsonb_build_object('descricao','X','quantidade',0)));
  res := res || jsonb_build_array(jsonb_build_object('c','A3a quantidade zero','ok', r->>'erro'='quantidade_invalida','r',r));
  r := abrir_pedido_telas(tf, cab, jsonb_build_array(jsonb_build_object('descricao','X','quantidade','abc')));
  res := res || jsonb_build_array(jsonb_build_object('c','A3b quantidade texto','ok', r->>'erro'='quantidade_invalida','r',r));
  r := abrir_pedido_telas(tf, cab, jsonb_build_array(jsonb_build_object('descricao','','quantidade',1)));
  res := res || jsonb_build_array(jsonb_build_object('c','A3c item sem descrição','ok', r->>'erro'='item_sem_descricao','r',r));
  r := abrir_pedido_telas(tf, cab || '{"centro_custo":"nao-existe"}', itens);
  res := res || jsonb_build_array(jsonb_build_object('c','A4 centro de custo inválido','ok', r->>'erro'='centro_custo_invalido','r',r));
  r := abrir_pedido_telas(tf, cab || '{"definicao_fornecedor":"unico"}', itens);
  res := res || jsonb_build_array(jsonb_build_object('c','A5 único sem justificativa','ok', r->>'erro'='sem_justificativa','r',r));
  r := abrir_pedido_telas(tf, cab || '{"tipo_compra":"extra"}', itens);
  res := res || jsonb_build_array(jsonb_build_object('c','A6 tipo inválido','ok', r->>'erro'='tipo_invalido','r',r));
  r := abrir_pedido_telas(tf, cab || '{"data_necessidade":"2026-13-40"}', itens);
  res := res || jsonb_build_array(jsonb_build_object('c','A7 data inválida','ok', r->>'erro'='data_invalida','r',r));
  r := abrir_pedido_telas(tf, cab || '{"motivo":"  "}', itens);
  res := res || jsonb_build_array(jsonb_build_object('c','A7b sem motivo','ok', r->>'erro'='sem_motivo','r',r));
  r := abrir_pedido_telas(tf, cab || '{"empresa_id":"nao-existe"}', itens);
  res := res || jsonb_build_array(jsonb_build_object('c','A7c empresa inválida','ok', r->>'erro'='empresa_invalida','r',r));
  select count(*) into n1 from solicitacoes;
  res := res || jsonb_build_array(jsonb_build_object('c','A8 recusas não deixam pedido gravado','ok', n1 = n0,'r',jsonb_build_object('antes',n0,'depois',n1)));

  r := abrir_pedido_telas(tf, cab, itens); vP := (r->>'id')::uuid;
  res := res || jsonb_build_array(jsonb_build_object('c','A9 abre normal (comum) na liderança','ok',
     r->>'ok'='true' and r->>'etapa'='lider' and r->>'com_quem' = (select nome from aprovadores where id='a-brandao'),'r',r));
  res := res || jsonb_build_array(jsonb_build_object('c','A10 grava canal telas, versão 1, sem card, quem pede do cadastro','ok',
     (select canal='telas' and versao=1 and card_id is null and facilitador_id='eduarda' and aprovador_atual='a-brandao'
             and facilitador = (select nome from facilitadores where id='eduarda')
             and facilitador_email is not distinct from (select lower(email) from facilitadores where id='eduarda')
             and entrou_na_etapa_em is not null
        from solicitacoes where id=vP),'r',(select to_jsonb(s) - 'motivo' from solicitacoes s where id=vP)));
  res := res || jsonb_build_array(jsonb_build_object('c','A11 movimento criado com aviso para aprovador e facilitador','ok',
     (select count(*)=1 from movimentos_compra where solicitacao_id=vP and acao='criado' and avisar
        and detalhe->'para' @> '[{"papel":"aprovador","id":"a-brandao"},{"papel":"facilitador","id":"eduarda"}]'),'r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','A12 itens gravados','ok',
     (select count(*)=3 from solicitacao_itens where solicitacao_id=vP),'r',null));

  r := abrir_pedido_telas(tfin, cab, itens); vN := (r->>'id')::uuid;
  res := res || jsonb_build_array(jsonb_build_object('c','A13 financeiro pede normal: vai direto à cotação','ok', r->>'etapa'='cotacao','r',r));
  r := abrir_pedido_telas(tfin, cab || '{"tipo_compra":"mensal"}', itens); vNM := (r->>'id')::uuid;
  res := res || jsonb_build_array(jsonb_build_object('c','A14 financeiro pede mensal: vai direto à cotação','ok', r->>'etapa'='cotacao','r',r));
  r := abrir_pedido_telas(tfab, cab, itens);
  res := res || jsonb_build_array(jsonb_build_object('c','A15 líder pede normal: pula a liderança, vai à cotação','ok', r->>'etapa'='cotacao','r',r));
  r := abrir_pedido_telas(tfab, cab || '{"tipo_compra":"mensal"}', itens); vL := (r->>'id')::uuid;
  res := res || jsonb_build_array(jsonb_build_object('c','A16 líder pede mensal: vai à gerência (Edilson)','ok',
     r->>'etapa'='gerencial' and (select aprovador_atual from solicitacoes where id=vL)='edilson','r',r));
  r := abrir_pedido_telas(tfbr, cab || '{"tipo_compra":"mensal"}', itens);
  res := res || jsonb_build_array(jsonb_build_object('c','A17 gerente pede mensal: vai à cotação','ok', r->>'etapa'='cotacao','r',r));

  -- ======================================================== B. ISOLAMENTO DO CLICKUP
  r := decisao_permitida(ta_br, vP, null, 'lider', null);
  res := res || jsonb_build_array(jsonb_build_object('c','B1 porta do ClickUp recusa pedido das telas','ok', r->>'ok'='false' and r->>'erro'='card_nao_confere','r',r));
  select id into real_id from solicitacoes where canal='clickup' and etapa_atual='cotacao' and facilitador_id is not null limit 1;
  r := decidir_pedido(ta_br, real_id, 1, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','B2 decidir pelas telas recusa pedido do ClickUp','ok', r->>'erro'='canal_clickup','r',r));
  r := salvar_mapa(tc, real_id, 0, '{}'::jsonb);
  res := res || jsonb_build_array(jsonb_build_object('c','B3 mapa recusa pedido do ClickUp','ok', r->>'erro'='canal_clickup','r',r));
  r := enviar_mapa(tc, real_id, 0, null);
  res := res || jsonb_build_array(jsonb_build_object('c','B4 enviar recusa pedido do ClickUp','ok', r->>'erro'='canal_clickup','r',r));
  r := cancelar_pedido((select token from facilitadores where id=(select facilitador_id from solicitacoes where id=real_id)), real_id, 1, null);
  res := res || jsonb_build_array(jsonb_build_object('c','B5 cancelar recusa pedido do ClickUp','ok', r->>'erro' in ('canal_clickup','nao_encontrado'),'r',r));
  res := res || jsonb_build_array(jsonb_build_object('c','B6 pedido do ClickUp intocado','ok',
     (select versao=1 and canal='clickup' and etapa_atual='cotacao' from solicitacoes where id=real_id),'r',null));

  -- ======================================================== C. EDIÇÃO (uma vez, 30 min)
  select versao into ver from solicitacoes where id=vP;
  r := iniciar_edicao(tf2, vP, ver);
  res := res || jsonb_build_array(jsonb_build_object('c','C1 outro facilitador não edita','ok', r->>'erro'='nao_encontrado','r',r));
  r := iniciar_edicao(tf, vP, ver + 5);
  res := res || jsonb_build_array(jsonb_build_object('c','C2 versão vencida não edita','ok', r->>'erro'='versao_mudou','r',r));
  r := iniciar_edicao(tf, vP, ver);
  res := res || jsonb_build_array(jsonb_build_object('c','C3 inicia edição com aviso dos 30 min','ok',
     r->>'ok'='true' and (r->>'prazo_minutos')::numeric = 30 and r->>'mensagem' like '%30 minutos%','r',r));
  res := res || jsonb_build_array(jsonb_build_object('c','C4 em edição sai da fila nova da liderança','ok',
     not exists (select 1 from jsonb_array_elements(fila_do_aprovador(ta_br)->'pedidos') e where (e->>'id')::uuid = vP)
     and exists (select 1 from jsonb_array_elements(fila_do_aprovador(ta_br)->'em_edicao') e where (e->>'id')::uuid = vP),'r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','C5 em edição sai também da fila antiga','ok',
     not exists (select 1 from fila_de_aprovacao(ta_br) q where q.id = vP),'r',null));
  select versao into ver from solicitacoes where id=vP;
  r := decidir_pedido(ta_br, vP, ver, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','C6 liderança não aprova durante a edição','ok', r->>'erro'='em_edicao','r',r));
  r := iniciar_edicao(tf, vP, ver);
  res := res || jsonb_build_array(jsonb_build_object('c','C7 não abre edição duas vezes','ok', r->>'erro'='ja_em_edicao','r',r));
  r := salvar_edicao(tf, vP, cab, jsonb_build_array(jsonb_build_object('descricao','X','quantidade',-1)));
  res := res || jsonb_build_array(jsonb_build_object('c','C8 salvar inválido recusa e continua em edição','ok',
     r->>'erro'='quantidade_invalida' and (select etapa_atual from solicitacoes where id=vP)='edicao'
     and (select count(*)=3 from solicitacao_itens where solicitacao_id=vP),'r',r));
  r := salvar_edicao(tf, vP, cab || '{"motivo":"Teste automático editado"}',
         jsonb_set(itens, '{0,quantidade}', '4000'));
  res := res || jsonb_build_array(jsonb_build_object('c','C9 salva edição: volta à liderança e registra o que mudou','ok',
     r->>'ok'='true' and r->'mudou' ? 'motivo' and r->'mudou' ? 'itens'
     and (select etapa_atual='lider' and edicao_usada and em_edicao_desde is null from solicitacoes where id=vP),'r',r));
  res := res || jsonb_build_array(jsonb_build_object('c','C10 aviso de edição salva vai para a liderança','ok',
     (select count(*)=1 from movimentos_compra where solicitacao_id=vP and acao='edicao_salva' and avisar
        and detalhe->'para' @> '[{"papel":"aprovador","id":"a-brandao"}]'),'r',null));
  select versao into ver from solicitacoes where id=vP;
  r := iniciar_edicao(tf, vP, ver);
  res := res || jsonb_build_array(jsonb_build_object('c','C11 segunda edição recusada (uma vez só)','ok', r->>'erro'='edicao_ja_usada','r',r));
  r := decidir_pedido(ta_br, vP, ver - 1, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','C12 decisão com a versão de antes da edição é recusada','ok', r->>'erro'='versao_mudou','r',r));

  -- desistir não gasta a edição
  r := abrir_pedido_telas(tf, cab, itens); vR := (r->>'id')::uuid;
  r := iniciar_edicao(tf, vR, 1);
  r := desistir_edicao(tf, vR);
  res := res || jsonb_build_array(jsonb_build_object('c','C13 desistir devolve à liderança sem gastar a edição','ok',
     r->>'ok'='true' and (select etapa_atual='lider' and not edicao_usada from solicitacoes where id=vR),'r',r));
  select versao into ver from solicitacoes where id=vR;
  r := iniciar_edicao(tf, vR, ver);
  res := res || jsonb_build_array(jsonb_build_object('c','C14 depois de desistir ainda pode editar','ok', r->>'ok'='true','r',r));
  r := desistir_edicao(tf, vR);
  r := desistir_edicao(tf, vR);
  res := res || jsonb_build_array(jsonb_build_object('c','C15 desistir fora da edição é recusado','ok', r->>'erro'='nao_esta_em_edicao','r',r));

  -- 30 minutos
  r := abrir_pedido_telas(tf, cab, itens); vS := (r->>'id')::uuid;
  r := iniciar_edicao(tf, vS, 1);
  update solicitacoes set em_edicao_desde = now() - interval '31 minutes' where id = vS;
  r := salvar_edicao(tf, vS, cab || '{"motivo":"não deve gravar"}', itens);
  res := res || jsonb_build_array(jsonb_build_object('c','C16 salvar depois de 30 min: descarta e volta como estava','ok',
     r->>'erro'='edicao_expirou'
     and (select etapa_atual='lider' and not edicao_usada and motivo='Teste automático' from solicitacoes where id=vS),'r',r));
  res := res || jsonb_build_array(jsonb_build_object('c','C17 facilitador é avisado da liberação','ok',
     (select count(*)=1 from movimentos_compra where solicitacao_id=vS and acao='edicao_expirada' and avisar
        and detalhe->'para' @> '[{"papel":"facilitador","id":"eduarda"}]'),'r',null));

  r := abrir_pedido_telas(tf, cab, itens); vT := (r->>'id')::uuid;
  r := iniciar_edicao(tf, vT, 1);
  update solicitacoes set em_edicao_desde = now() - interval '31 minutes' where id = vT;
  r := liberar_edicoes_vencidas();
  res := res || jsonb_build_array(jsonb_build_object('c','C18 agendamento libera edição vencida','ok',
     (r->>'liberadas')::int >= 1 and (select etapa_atual from solicitacoes where id=vT)='lider','r',r));
  r := liberar_edicoes_vencidas();
  res := res || jsonb_build_array(jsonb_build_object('c','C19 agendamento repetido não libera de novo','ok',
     (select count(*)=1 from movimentos_compra where solicitacao_id=vT and acao='edicao_expirada'),'r',r));

  r := abrir_pedido_telas(tf, cab, itens); vU := (r->>'id')::uuid;
  r := iniciar_edicao(tf, vU, 1);
  update solicitacoes set em_edicao_desde = now() - interval '29 minutes' where id = vU;
  r := salvar_edicao(tf, vU, cab, itens);
  res := res || jsonb_build_array(jsonb_build_object('c','C20 salvar com 29 min ainda vale','ok', r->>'ok'='true','r',r));

  r := abrir_pedido_telas(tf, cab, itens); vV := (r->>'id')::uuid;
  r := iniciar_edicao(tf, vV, 1);
  select versao into ver from solicitacoes where id=vV;
  r := cancelar_pedido(tf, vV, ver, 'Não precisa mais');
  res := res || jsonb_build_array(jsonb_build_object('c','C21 cancelar durante a própria edição','ok',
     r->>'ok'='true' and (select status='cancelado' and etapa_atual is null and cancelado_em is not null from solicitacoes where id=vV),'r',r));
  r := decidir_pedido(ta_br, vV, ver + 1, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','C22 cancelado não pode ser decidido','ok', r->>'erro'='ja_decidido','r',r));

  r := abrir_pedido_telas(tf, cab, itens); vW := (r->>'id')::uuid;
  r := cancelar_pedido(tf, vW, 99, null);
  res := res || jsonb_build_array(jsonb_build_object('c','C23 cancelar com versão vencida recusa','ok', r->>'erro'='versao_mudou','r',r));
  r := cancelar_pedido(tf2, vW, 1, null);
  res := res || jsonb_build_array(jsonb_build_object('c','C24 outro facilitador não cancela','ok', r->>'erro'='nao_encontrado','r',r));

  -- corrida: liderança aprova primeiro, depois o facilitador tenta editar/cancelar
  r := decidir_pedido(ta_br, vW, 1, 'aprovado', null);
  r2 := iniciar_edicao(tf, vW, 1);
  res := res || jsonb_build_array(jsonb_build_object('c','C25 editar depois da aprovação é recusado com mensagem clara','ok',
     r->>'ok'='true' and r2->>'erro'='fora_da_janela','r',r2));
  select versao into ver from solicitacoes where id=vW;
  r2 := cancelar_pedido(tf, vW, ver, null);
  res := res || jsonb_build_array(jsonb_build_object('c','C26 cancelar depois da aprovação é recusado','ok', r2->>'erro'='fora_da_janela','r',r2));
  select versao into ver from solicitacoes where id=vN;
  r := iniciar_edicao(tfin, vN, ver);
  res := res || jsonb_build_array(jsonb_build_object('c','C27 pedido que nasceu na cotação não é editável','ok', r->>'erro'='fora_da_janela','r',r));

  -- corrida: edição vence com a tela da liderança aberta
  r := abrir_pedido_telas(tf, cab, itens); vX := (r->>'id')::uuid;
  r := iniciar_edicao(tf, vX, 1);
  update solicitacoes set em_edicao_desde = now() - interval '31 minutes' where id = vX;
  r := decidir_pedido(ta_br, vX, 2, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','C28 liderança com tela velha depois da liberação: pede para conferir','ok',
     r->>'erro'='versao_mudou' and (select etapa_atual from solicitacoes where id=vX)='lider','r',r));

  -- ======================================================== D. DECISÕES — NORMAL
  select versao into ver from solicitacoes where id=vP;
  r := decidir_pedido(ta_j, vP, ver, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','D1 aprovador de fora não decide','ok', r->>'erro'='nao_e_a_vez','r',r));
  r := decidir_pedido('ap-inventado', vP, ver, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','D2 token inventado','ok', r->>'erro'='token_invalido','r',r));
  r := decidir_pedido(ta_br, vP, ver, 'reprovado', '  ');
  res := res || jsonb_build_array(jsonb_build_object('c','D3 reprovar sem motivo','ok', r->>'erro'='sem_motivo','r',r));
  r := decidir_pedido(ta_br, vP, ver, 'devolvido', 'x');
  res := res || jsonb_build_array(jsonb_build_object('c','D4 liderança não devolve ao comprador','ok', r->>'erro'='devolucao_nao_permitida','r',r));
  r := decidir_pedido(ta_br, vP, ver, 'talvez', null);
  res := res || jsonb_build_array(jsonb_build_object('c','D5 decisão inválida','ok', r->>'erro'='decisao_invalida','r',r));
  r := decidir_pedido(ta_br, vP, ver, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','D6 liderança aprova: vai à cotação','ok',
     r->>'ok'='true' and r->>'etapa'='cotacao'
     and (select etapa_atual='cotacao' and aprovador_atual is null and status='em cotacao' from solicitacoes where id=vP),'r',r));
  res := res || jsonb_build_array(jsonb_build_object('c','D7 decisões e aviso ao comprador','ok',
     (select count(*)=1 from decisoes where solicitacao_id=vP and etapa='lider' and resposta='aprovado')
     and (select count(*)=1 from movimentos_compra where solicitacao_id=vP and acao='aprovado'
            and detalhe->'para' @> '[{"papel":"comprador","id":"herisson"}]'),'r',null));
  r := decidir_pedido(ta_br, vP, ver, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','D8 clique duplo não decide duas vezes','ok', r->>'ok'='false','r',r));

  -- ======================================================== E. MAPA — NORMAL
  select id into id_a1 from solicitacao_itens where solicitacao_id=vP and descricao='Item A1';
  select id into id_a2 from solicitacao_itens where solicitacao_id=vP and descricao='Item A2';
  select id into id_b1 from solicitacao_itens where solicitacao_id=vP and descricao='Item B1';
  -- vP teve A1 editado para 4000; para os números ficarem simples, usa-se um pedido novo
  r := abrir_pedido_telas(tf, cab, itens); vQ := (r->>'id')::uuid;
  r := decidir_pedido(ta_br, vQ, 1, 'aprovado', null);
  select id into id_a1 from solicitacao_itens where solicitacao_id=vQ and descricao='Item A1';
  select id into id_a2 from solicitacao_itens where solicitacao_id=vQ and descricao='Item A2';
  select id into id_b1 from solicitacao_itens where solicitacao_id=vQ and descricao='Item B1';

  res := res || jsonb_build_array(jsonb_build_object('c','E1 pedido aparece em Para cotar','ok',
     exists (select 1 from jsonb_array_elements(fila_do_comprador(tc)->'pedidos') e where (e->>'id')::uuid=vQ and e->>'aba'='para_cotar'),'r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','E2 outro comprador também vê (comprador vê todos)','ok',
     exists (select 1 from jsonb_array_elements(fila_do_comprador(tc2)->'pedidos') e where (e->>'id')::uuid=vQ and e->>'e_meu'='false'),'r',null));
  r := fila_do_comprador('cp-inventado');
  res := res || jsonb_build_array(jsonb_build_object('c','E3 fila com token inventado','ok', r->>'erro'='token_invalido','r',r));
  r := enviar_mapa(tc, vQ, 0, null);
  res := res || jsonb_build_array(jsonb_build_object('c','E4 enviar sem mapa','ok', r->>'erro'='mapa_vazio','r',r));
  r := salvar_mapa(tc, vQ, 0, jsonb_build_object('fornecedores', jsonb_build_array(jsonb_build_object('familia','ZZ','coluna',1))));
  res := res || jsonb_build_array(jsonb_build_object('c','E5 família que não existe','ok', r->>'erro'='familia_invalida','r',r));
  r := salvar_mapa(tc, vQ, 0, jsonb_build_object('precos', jsonb_build_array(jsonb_build_object('item_id',id_a1,'coluna',1,'preco',-5))));
  res := res || jsonb_build_array(jsonb_build_object('c','E6 preço negativo','ok', r->>'erro'='valor_invalido','r',r));
  r := salvar_mapa(tc, vQ, 0, jsonb_build_object('fornecedores', jsonb_build_array(jsonb_build_object('familia','MM','coluna',1,'desconto_pct',150))));
  res := res || jsonb_build_array(jsonb_build_object('c','E7 desconto acima de 100','ok', r->>'erro'='valor_invalido','r',r));
  r := salvar_mapa(tc, vQ, 0, jsonb_build_object('fornecedores', jsonb_build_array(jsonb_build_object('familia','MM','coluna',1,'prazo_dias',2.5))));
  res := res || jsonb_build_array(jsonb_build_object('c','E8 prazo fracionado','ok', r->>'erro'='prazo_invalido','r',r));
  r := salvar_mapa(tc, vQ, 0, jsonb_build_object('fornecedores', jsonb_build_array(jsonb_build_object('familia','MM','coluna',1,'fornecedor_id','nao-existe'))));
  res := res || jsonb_build_array(jsonb_build_object('c','E9 fornecedor fora do cadastro','ok', r->>'erro'='fornecedor_invalido','r',r));
  r := salvar_mapa(tc, vQ, 0, jsonb_build_object('precos', jsonb_build_array(jsonb_build_object('item_id',(select id from solicitacao_itens where solicitacao_id=vP limit 1),'coluna',1,'preco',5))));
  res := res || jsonb_build_array(jsonb_build_object('c','E10 item de outro pedido','ok', r->>'erro'='item_invalido','r',r));
  r := salvar_mapa(tc, vQ, 0, jsonb_build_object('precos', jsonb_build_array(jsonb_build_object('item_id',id_a1,'coluna',4,'preco',5))));
  res := res || jsonb_build_array(jsonb_build_object('c','E11 coluna 4 não existe','ok', r->>'erro'='valor_invalido','r',r));
  r := salvar_mapa('cp-inventado', vQ, 0, '{}'::jsonb);
  res := res || jsonb_build_array(jsonb_build_object('c','E12 salvar com token inventado','ok', r->>'erro'='token_invalido','r',r));
  res := res || jsonb_build_array(jsonb_build_object('c','E13 recusas não deixaram mapa','ok',
     not exists (select 1 from mapa_cotacao where solicitacao_id=vQ),'r',null));

  -- rascunho parcial
  r := salvar_mapa(tc, vQ, 0, jsonb_build_object('precos', jsonb_build_array(
         jsonb_build_object('item_id',id_a1,'coluna',1,'preco',100))));
  mver := (r->>'versao_mapa')::int;
  res := res || jsonb_build_array(jsonb_build_object('c','E14 rascunho parcial salva e mostra bloqueios','ok',
     r->>'ok'='true' and mver=1 and jsonb_array_length(r->'resumo'->'bloqueios') > 0,'r',r->'resumo'->'bloqueios'));
  r := salvar_mapa(tc, vQ, 0, '{}'::jsonb);
  res := res || jsonb_build_array(jsonb_build_object('c','E15 duas abas: versão velha do mapa recusada','ok', r->>'erro'='versao_mudou','r',r));
  r := enviar_mapa(tc, vQ, mver, 'obs');
  res := res || jsonb_build_array(jsonb_build_object('c','E16 enviar com bloqueio','ok', r->>'erro'='cotacao_incompleta','r',r->'bloqueios'));

  -- mapa completo
  mapa := jsonb_build_object(
    'fornecedores', jsonb_build_array(
      jsonb_build_object('familia','MM','coluna',1,'fornecedor_id',f1,'desconto_pct',10,'frete',20,'prazo_dias',3,'condicao','28 dias'),
      jsonb_build_object('familia','MM','coluna',2,'fornecedor_id',f2,'desconto_pct',0,'frete',0,'prazo_dias',5,'condicao','À vista'),
      jsonb_build_object('familia','MM','coluna',3,'fornecedor_id',f3,'frete',5,'prazo_dias',7,'condicao','30/60'),
      jsonb_build_object('familia','MG','coluna',1,'fornecedor_id',f4,'desconto_pct',0,'frete',0,'prazo_dias',2,'condicao','Boleto 30 dias')),
    'precos', jsonb_build_array(
      jsonb_build_object('item_id',id_a1,'coluna',1,'preco',100), jsonb_build_object('item_id',id_a1,'coluna',2,'preco',95),
      jsonb_build_object('item_id',id_a1,'coluna',3,'preco',99),
      jsonb_build_object('item_id',id_a2,'coluna',1,'preco',50), jsonb_build_object('item_id',id_a2,'coluna',2,'preco',60),
      jsonb_build_object('item_id',id_a2,'coluna',3,'preco',55),
      jsonb_build_object('item_id',id_b1,'coluna',1,'preco',10)),
    'escolhas', jsonb_build_array(
      jsonb_build_object('item_id',id_a1,'coluna',2), jsonb_build_object('item_id',id_a2,'coluna',1),
      jsonb_build_object('item_id',id_b1,'coluna',1)));
  r := salvar_mapa(tc, vQ, mver, mapa); mver := (r->>'versao_mapa')::int;
  res := res || jsonb_build_array(jsonb_build_object('c','E17 total = escolhidos − desconto + frete (355,00)','ok',
     (r->'resumo'->>'total')::numeric = 355,'r',r->'resumo'));
  res := res || jsonb_build_array(jsonb_build_object('c','E18 frete só de quem ganhou item (coluna 3 do MM = 0)','ok',
     exists (select 1 from jsonb_array_elements(r->'resumo'->'familias') fa, jsonb_array_elements(fa->'fornecedores') fo
              where fa->>'familia'='MM' and (fo->>'coluna')::int=3 and (fo->>'total')::numeric=0),'r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','E19 sem bloqueio; avisos: não-menor-preço e menos de 3 preços','ok',
     jsonb_array_length(r->'resumo'->'bloqueios')=0 and jsonb_array_length(r->'resumo'->'avisos')=2,'r',r->'resumo'->'avisos'));
  r := enviar_mapa(tc, vQ, mver, null);
  res := res || jsonb_build_array(jsonb_build_object('c','E20 com aviso, observação é obrigatória','ok', r->>'erro'='observacao_obrigatoria','r',r));

  -- nome repetido na família e fornecedor sem cadastro bloqueiam
  r := salvar_mapa(tc, vQ, mver, jsonb_set(mapa, '{fornecedores,1,fornecedor_id}', to_jsonb(f1))); mver := (r->>'versao_mapa')::int;
  res := res || jsonb_build_array(jsonb_build_object('c','E21 mesmo fornecedor duas vezes na família bloqueia','ok',
     exists (select 1 from jsonb_array_elements(r->'resumo'->'bloqueios') b where b->>'msg' like '%duas vezes%'),'r',r->'resumo'->'bloqueios'));
  r := salvar_mapa(tc, vQ, mver, jsonb_set(mapa, '{fornecedores,1}',
         '{"familia":"MM","coluna":2,"fornecedor_nome":"Fornecedor Livre","frete":0,"prazo_dias":5,"condicao":"À vista"}'));
  mver := (r->>'versao_mapa')::int;
  res := res || jsonb_build_array(jsonb_build_object('c','E22 vencedor fora do cadastro bloqueia','ok',
     exists (select 1 from jsonb_array_elements(r->'resumo'->'bloqueios') b where b->>'msg' like '%cadastro%'),'r',r->'resumo'->'bloqueios'));
  r := salvar_mapa(tc, vQ, mver, jsonb_set(mapa, '{fornecedores,3,condicao}', '""'));
  mver := (r->>'versao_mapa')::int;
  res := res || jsonb_build_array(jsonb_build_object('c','E23 vencedor sem condição de pagamento bloqueia','ok',
     exists (select 1 from jsonb_array_elements(r->'resumo'->'bloqueios') b where b->>'msg' like '%condição%'),'r',r->'resumo'->'bloqueios'));
  r := salvar_mapa(tc, vQ, mver, mapa - 'escolhas' || jsonb_build_object('escolhas', jsonb_build_array(
         jsonb_build_object('item_id',id_a1,'coluna',2), jsonb_build_object('item_id',id_b1,'coluna',1))));
  mver := (r->>'versao_mapa')::int;
  res := res || jsonb_build_array(jsonb_build_object('c','E24 item sem escolha bloqueia','ok',
     exists (select 1 from jsonb_array_elements(r->'resumo'->'bloqueios') b where b->>'msg' like '%Escolha o fornecedor%'),'r',r->'resumo'->'bloqueios'));
  r := salvar_mapa(tc, vQ, mver, mapa || jsonb_build_object('observacao', 'A1 no fornecedor 2 pelo prazo'));
  mver := (r->>'versao_mapa')::int;
  r := enviar_mapa(tc, vQ, mver, null);
  res := res || jsonb_build_array(jsonb_build_object('c','E25 envia usando a observação do rascunho: vai à gerencial','ok',
     r->>'ok'='true' and r->>'etapa'='gerencial'
     and (select aprovador_atual='a-brandao' and valor_cotado=355 and fornecedor_cotado is not null from solicitacoes where id=vQ),'r',r));
  res := res || jsonb_build_array(jsonb_build_object('c','E26 aviso ao gerente e ao facilitador','ok',
     (select count(*)=1 from movimentos_compra where solicitacao_id=vQ and acao='cotacao_enviada'
        and detalhe->'para' @> '[{"papel":"aprovador","id":"a-brandao"},{"papel":"facilitador","id":"eduarda"}]'),'r',null));
  r := salvar_mapa(tc, vQ, mver + 1, mapa);
  res := res || jsonb_build_array(jsonb_build_object('c','E27 mapa enviado fica só leitura','ok', r->>'erro'='fora_da_cotacao','r',r));
  res := res || jsonb_build_array(jsonb_build_object('c','E28 pedido vai para Enviadas','ok',
     exists (select 1 from jsonb_array_elements(fila_do_comprador(tc)->'pedidos') e where (e->>'id')::uuid=vQ and e->>'aba'='enviadas'),'r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','E29 fila do gerente mostra valor e pode devolver','ok',
     exists (select 1 from jsonb_array_elements(fila_do_aprovador(ta_br)->'pedidos') e
              where (e->>'id')::uuid=vQ and (e->>'valor_cotado')::numeric=355 and e->>'pode_devolver'='true'),'r',null));

  -- devolução pela gerência
  select versao into ver from solicitacoes where id=vQ;
  r := decidir_pedido(ta_br, vQ, ver, 'devolvido', null);
  res := res || jsonb_build_array(jsonb_build_object('c','E30 devolver sem motivo','ok', r->>'erro'='sem_motivo','r',r));
  r := decidir_pedido(ta_br, vQ, ver, 'devolvido', 'Frete alto, negociar');
  res := res || jsonb_build_array(jsonb_build_object('c','E31 gerente devolve: volta à cotação, aba Devolvidas com quem e por quê','ok',
     r->>'ok'='true'
     and exists (select 1 from jsonb_array_elements(fila_do_comprador(tc)->'pedidos') e
                  where (e->>'id')::uuid=vQ and e->>'aba'='devolvidas'
                    and e->'devolucao'->>'motivo'='Frete alto, negociar'
                    and e->'devolucao'->>'por'=(select nome from aprovadores where id='a-brandao')),'r',r));
  res := res || jsonb_build_array(jsonb_build_object('c','E32 devolução avisa o comprador e não grava em decisoes','ok',
     (select count(*)=1 from movimentos_compra where solicitacao_id=vQ and acao='devolvido'
        and detalhe->'para' @> '[{"papel":"comprador","id":"herisson"}]')
     and not exists (select 1 from decisoes where solicitacao_id=vQ and etapa='gerencial'),'r',null));
  select versao into mver from mapa_cotacao where solicitacao_id=vQ;
  r := enviar_mapa(tc, vQ, mver, null);
  res := res || jsonb_build_array(jsonb_build_object('c','E33 reenvio exige observação nova','ok', r->>'erro'='observacao_obrigatoria','r',r));
  r := enviar_mapa(tc, vQ, mver, 'Negociado: frete zerado');
  res := res || jsonb_build_array(jsonb_build_object('c','E34 reenvio volta à gerencial','ok',
     r->>'etapa'='gerencial' and (select envios=2 from mapa_cotacao where solicitacao_id=vQ),'r',r));

  select versao into ver from solicitacoes where id=vQ;
  r := decidir_pedido(ta_br, vQ, ver, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','E35 gerente aprova: vai ao financeiro','ok',
     r->>'etapa'='financeiro' and (select aprovador_atual from solicitacoes where id=vQ)='wienfried'
     and (select valor_total=355 from decisoes where solicitacao_id=vQ and etapa='gerencial'),'r',r));
  select versao into ver from solicitacoes where id=vQ;
  r := decidir_pedido(ta_w, vQ, ver, 'devolvido', 'Rever condição');
  select versao into mver from mapa_cotacao where solicitacao_id=vQ;
  r2 := enviar_mapa(tc, vQ, mver, 'Condição revista');
  res := res || jsonb_build_array(jsonb_build_object('c','E36 financeiro devolve; reenvio passa de novo pela gerencial','ok',
     r->>'ok'='true' and r2->>'etapa'='gerencial','r',r2));
  select versao into ver from solicitacoes where id=vQ;
  r := decidir_pedido(ta_br, vQ, ver, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','E37 segunda aprovação gerencial não quebra decisoes','ok',
     r->>'ok'='true' and (select count(*)=1 from decisoes where solicitacao_id=vQ and etapa='gerencial'),'r',r));
  select versao into ver from solicitacoes where id=vQ;
  r := decidir_pedido(ta_w, vQ, ver, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','E38 financeiro aprova: fim, ordem de compra','ok',
     r->>'etapa'='fim' and (select status='aprovado' and etapa_atual is null and decidido_em is not null from solicitacoes where id=vQ),'r',r));
  res := res || jsonb_build_array(jsonb_build_object('c','E39 aviso final a quem pediu e ao comprador','ok',
     (select count(*)=1 from movimentos_compra where solicitacao_id=vQ and acao='aprovado' and etapa='financeiro'
        and detalhe->'para' @> '[{"papel":"facilitador","id":"eduarda"},{"papel":"comprador","id":"herisson"}]'),'r',null));
  r := decidir_pedido(ta_w, vQ, ver + 1, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','E40 encerrado não decide mais','ok', r->>'erro'='ja_decidido','r',r));
  res := res || jsonb_build_array(jsonb_build_object('c','E41 encerrado sai da fila do comprador','ok',
     not exists (select 1 from jsonb_array_elements(fila_do_comprador(tc)->'pedidos') e where (e->>'id')::uuid=vQ),'r',null));

  -- ======================================================== F. MENSAL
  r := abrir_pedido_telas(tf, cab || '{"tipo_compra":"mensal"}', itens); vM := (r->>'id')::uuid;
  r := decidir_pedido(ta_br, vM, 1, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','F1 mensal: liderança aprova, vai à gerencial','ok', r->>'etapa'='gerencial','r',r));
  select versao into ver from solicitacoes where id=vM;
  r := decidir_pedido(ta_br, vM, ver, 'devolvido', 'x');
  res := res || jsonb_build_array(jsonb_build_object('c','F2 mensal: gerencial não devolve ao comprador','ok', r->>'erro'='devolucao_nao_permitida','r',r));
  r := decidir_pedido(ta_br, vM, ver, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','F3 mensal: gerencial aprova, vai à cotação','ok', r->>'etapa'='cotacao','r',r));
  select id into id_a1 from solicitacao_itens where solicitacao_id=vM and descricao='Item A1';
  select id into id_a2 from solicitacao_itens where solicitacao_id=vM and descricao='Item A2';
  select id into id_b1 from solicitacao_itens where solicitacao_id=vM and descricao='Item B1';
  itens_mapa := jsonb_build_object(
    'fornecedores', jsonb_build_array(
      jsonb_build_object('familia','MM','coluna',1,'fornecedor_id',f1,'frete',0,'prazo_dias',3,'condicao','28 dias'),
      jsonb_build_object('familia','MG','coluna',1,'fornecedor_id',f4,'frete',0,'prazo_dias',2,'condicao','28 dias')),
    'precos', jsonb_build_array(
      jsonb_build_object('item_id',id_a1,'coluna',1,'preco',10), jsonb_build_object('item_id',id_a2,'coluna',1,'preco',10),
      jsonb_build_object('item_id',id_b1,'coluna',1,'preco',10)),
    'escolhas', jsonb_build_array(
      jsonb_build_object('item_id',id_a1,'coluna',1), jsonb_build_object('item_id',id_a2,'coluna',1),
      jsonb_build_object('item_id',id_b1,'coluna',1)),
    'observacao', 'Só um fornecedor por família nesta mensal');
  r := salvar_mapa(tc, vM, 0, itens_mapa);
  r := enviar_mapa(tc, vM, (r->>'versao_mapa')::int, null);
  res := res || jsonb_build_array(jsonb_build_object('c','F4 mensal: cotação vai ao financeiro, não à gerencial','ok',
     r->>'etapa'='financeiro' and (select aprovador_atual from solicitacoes where id=vM)='wienfried','r',r));
  select versao into ver from solicitacoes where id=vM;
  r := decidir_pedido(ta_w, vM, ver, 'devolvido', 'Rever preço');
  select versao into mver from mapa_cotacao where solicitacao_id=vM;
  r2 := enviar_mapa(tc, vM, mver, 'Preço revisto');
  res := res || jsonb_build_array(jsonb_build_object('c','F5 mensal: financeiro devolve e o reenvio volta ao financeiro','ok',
     r->>'ok'='true' and r2->>'etapa'='financeiro','r',r2));
  select versao into ver from solicitacoes where id=vM;
  r := decidir_pedido(ta_w, vM, ver, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','F6 mensal: financeiro aprova, fim','ok', r->>'etapa'='fim','r',r));

  -- ======================================================== G. QUEM PEDE É O FINANCEIRO
  select id into id_a1 from solicitacao_itens where solicitacao_id=vN and descricao='Item A1';
  select id into id_a2 from solicitacao_itens where solicitacao_id=vN and descricao='Item A2';
  select id into id_b1 from solicitacao_itens where solicitacao_id=vN and descricao='Item B1';
  r := salvar_mapa(tc, vN, 0, jsonb_build_object(
    'fornecedores', itens_mapa->'fornecedores',
    'precos', jsonb_build_array(jsonb_build_object('item_id',id_a1,'coluna',1,'preco',10), jsonb_build_object('item_id',id_a2,'coluna',1,'preco',10), jsonb_build_object('item_id',id_b1,'coluna',1,'preco',10)),
    'escolhas', jsonb_build_array(jsonb_build_object('item_id',id_a1,'coluna',1), jsonb_build_object('item_id',id_a2,'coluna',1), jsonb_build_object('item_id',id_b1,'coluna',1)),
    'observacao', 'teste'));
  r := enviar_mapa(tc, vN, (r->>'versao_mapa')::int, null);
  res := res || jsonb_build_array(jsonb_build_object('c','G1 normal do financeiro: pula a gerencial e volta a ele','ok',
     r->>'etapa'='financeiro' and (select aprovador_atual from solicitacoes where id=vN)='wienfried','r',r));
  select versao into ver from solicitacoes where id=vN;
  r := decidir_pedido(ta_w, vN, ver, 'aprovado', null);
  res := res || jsonb_build_array(jsonb_build_object('c','G2 financeiro aprova o próprio orçamento','ok', r->>'etapa'='fim','r',r));
  select id into id_a1 from solicitacao_itens where solicitacao_id=vNM and descricao='Item A1';
  select id into id_a2 from solicitacao_itens where solicitacao_id=vNM and descricao='Item A2';
  select id into id_b1 from solicitacao_itens where solicitacao_id=vNM and descricao='Item B1';
  r := salvar_mapa(tc, vNM, 0, jsonb_build_object(
    'fornecedores', itens_mapa->'fornecedores',
    'precos', jsonb_build_array(jsonb_build_object('item_id',id_a1,'coluna',1,'preco',10), jsonb_build_object('item_id',id_a2,'coluna',1,'preco',10), jsonb_build_object('item_id',id_b1,'coluna',1,'preco',10)),
    'escolhas', jsonb_build_array(jsonb_build_object('item_id',id_a1,'coluna',1), jsonb_build_object('item_id',id_a2,'coluna',1), jsonb_build_object('item_id',id_b1,'coluna',1)),
    'observacao', 'teste'));
  r := enviar_mapa(tc, vNM, (r->>'versao_mapa')::int, null);
  res := res || jsonb_build_array(jsonb_build_object('c','G3 mensal do financeiro: volta a ele (não fecha sozinho)','ok',
     r->>'etapa'='financeiro' and (select status from solicitacoes where id=vNM)='aguardando aprovacao','r',r));

  -- ======================================================== H. REPROVAÇÃO
  r := abrir_pedido_telas(tf, cab, itens); vRep := (r->>'id')::uuid;
  r := decidir_pedido(ta_br, vRep, 1, 'reprovado', 'Sem orçamento');
  res := res || jsonb_build_array(jsonb_build_object('c','H1 liderança reprova: encerra e avisa quem pediu','ok',
     r->>'status'='reprovado' and (select status='reprovado' and etapa_atual is null from solicitacoes where id=vRep)
     and (select motivo='Sem orçamento' from decisoes where solicitacao_id=vRep and etapa='lider')
     and (select count(*)=1 from movimentos_compra where solicitacao_id=vRep and acao='reprovado'
            and detalhe->'para' @> '[{"papel":"facilitador","id":"eduarda"}]'),'r',r));
  -- financeiro reprova: avisa também o gerente
  r := abrir_pedido_telas(tf2, cab, itens); vRepF := (r->>'id')::uuid;
  r := decidir_pedido(ta_ed, vRepF, 1, 'aprovado', null);
  select id into id_a1 from solicitacao_itens where solicitacao_id=vRepF and descricao='Item A1';
  select id into id_a2 from solicitacao_itens where solicitacao_id=vRepF and descricao='Item A2';
  select id into id_b1 from solicitacao_itens where solicitacao_id=vRepF and descricao='Item B1';
  r := salvar_mapa(tc, vRepF, 0, jsonb_build_object(
    'fornecedores', itens_mapa->'fornecedores',
    'precos', jsonb_build_array(jsonb_build_object('item_id',id_a1,'coluna',1,'preco',10), jsonb_build_object('item_id',id_a2,'coluna',1,'preco',10), jsonb_build_object('item_id',id_b1,'coluna',1,'preco',10)),
    'escolhas', jsonb_build_array(jsonb_build_object('item_id',id_a1,'coluna',1), jsonb_build_object('item_id',id_a2,'coluna',1), jsonb_build_object('item_id',id_b1,'coluna',1)),
    'observacao', 'teste'));
  r := enviar_mapa(tc, vRepF, (r->>'versao_mapa')::int, null);
  select versao into ver from solicitacoes where id=vRepF;
  r := decidir_pedido(ta_ed, vRepF, ver, 'aprovado', null);
  select versao into ver from solicitacoes where id=vRepF;
  r := decidir_pedido(ta_w, vRepF, ver, 'reprovado', 'Fora do orçamento do mês');
  res := res || jsonb_build_array(jsonb_build_object('c','H2 financeiro reprova: avisa quem pediu e o gerente','ok',
     r->>'status'='reprovado'
     and (select count(*)=1 from movimentos_compra where solicitacao_id=vRepF and acao='reprovado'
            and detalhe->'para' @> '[{"papel":"facilitador","id":"leticia"},{"papel":"aprovador","id":"edilson"}]'),'r',r));

  -- ======================================================== J. QUEM VÊ O QUÊ
  r := pedido_telas(tf, vQ);
  res := res || jsonb_build_array(jsonb_build_object('c','J1 facilitador vê o próprio pedido, sem preços','ok',
     r->>'ok'='true' and r->'mapa' = 'null'::jsonb and r->'pedido'->'valor_cotado' = 'null'::jsonb,'r',r->'pedido'));
  res := res || jsonb_build_array(jsonb_build_object('c','J2 facilitador não vê motivo de devolução nem observação de preço','ok',
     not exists (select 1 from jsonb_array_elements(r->'linha_do_tempo') l
                  where l->>'acao' in ('devolvido','cotacao_enviada') and l->>'motivo' is not null)
     and exists (select 1 from jsonb_array_elements(r->'linha_do_tempo') l where l->>'acao'='devolvido'),'r',r->'linha_do_tempo'));
  r := pedido_telas(tf2, vQ);
  res := res || jsonb_build_array(jsonb_build_object('c','J3 outro facilitador não vê','ok', r->>'erro'='sem_acesso','r',r));
  r := pedido_telas(ta_j, vQ);
  res := res || jsonb_build_array(jsonb_build_object('c','J4 aprovador fora da cadeia não vê','ok', r->>'erro'='sem_acesso','r',r));
  r := pedido_telas(ta_br, vQ);
  res := res || jsonb_build_array(jsonb_build_object('c','J5 aprovador da cadeia vê com o mapa','ok',
     r->>'ok'='true' and (r->'mapa'->'resumo'->>'total')::numeric = 355,'r',null));
  r := pedido_telas(tc2, vQ);
  res := res || jsonb_build_array(jsonb_build_object('c','J6 comprador vê com o mapa','ok', r->>'ok'='true' and r->'mapa' is not null,'r',null));
  r := pedido_telas(tp, vQ);
  res := res || jsonb_build_array(jsonb_build_object('c','J7 diretoria vê','ok', r->>'ok'='true','r',null));
  r := pedido_telas('x', vQ);
  res := res || jsonb_build_array(jsonb_build_object('c','J8 token inventado','ok', r->>'erro'='token_invalido','r',r));
  r := pedido_telas(tf, vRep);
  res := res || jsonb_build_array(jsonb_build_object('c','J9 facilitador vê o motivo da reprovação','ok',
     exists (select 1 from jsonb_array_elements(r->'linha_do_tempo') l where l->>'acao'='reprovado' and l->>'motivo'='Sem orçamento'),'r',null));
  r := pedido_telas(tf, vP);
  res := res || jsonb_build_array(jsonb_build_object('c','J10 linha do tempo mostra a edição com antes/depois','ok',
     exists (select 1 from jsonb_array_elements(r->'linha_do_tempo') l where l->>'acao'='edicao_salva' and l->'mudou' ? 'itens'),'r',null));
  r := pedido_telas(tp, real_id);
  res := res || jsonb_build_array(jsonb_build_object('c','J11 pedido do ClickUp abre com a linha do tempo das decisões','ok',
     r->>'ok'='true' and r->'pedido'->>'canal'='clickup' and r->'pode'->>'decidir'='false','r',null));
  r := pedido_telas(tf, vR);
  res := res || jsonb_build_array(jsonb_build_object('c','J12 botões certos para o facilitador (editar e cancelar)','ok',
     r->'pode'->>'editar'='true' and r->'pode'->>'cancelar'='true' and r->'pode'->>'decidir'='false','r',r->'pode'));
  r := pedido_telas(tf, vP);
  res := res || jsonb_build_array(jsonb_build_object('c','J13 depois de editado e aprovado: sem Editar, sem Cancelar','ok',
     r->'pode'->>'editar'='false' and r->'pode'->>'cancelar'='false','r',r->'pode'));

  -- ======================================================== K. FUNIL E MEUS PEDIDOS
  r := iniciar_edicao(tf, vR, (select versao from solicitacoes where id=vR));
  r := funil_da_diretoria(tp, 30);
  res := res || jsonb_build_array(jsonb_build_object('c','K1 funil tem os dois canais','ok',
     exists (select 1 from jsonb_array_elements(r->'pedidos') e where e->>'canal'='telas')
     and exists (select 1 from jsonb_array_elements(r->'pedidos') e where e->>'canal'='clickup'),'r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','K2 funil mostra quem segura e dias parado','ok',
     exists (select 1 from jsonb_array_elements(r->'pedidos') e
              where (e->>'id')::uuid=vR and e->>'em_edicao'='true'
                and e->>'com_quem'=(select nome from facilitadores where id='eduarda') and (e->>'dias_parado')::int = 0)
     and exists (select 1 from jsonb_array_elements(r->'pedidos') e
              where (e->>'id')::uuid=real_id and (e->>'dias_parado')::int >= 0 and e->>'com_quem' is not null),'r',null));
  r := funil_da_diretoria('x', 30);
  res := res || jsonb_build_array(jsonb_build_object('c','K3 funil sem acesso','ok', r->>'erro'='sem_acesso','r',r));
  r := meus_pedidos(tf, 100);
  res := res || jsonb_build_array(jsonb_build_object('c','K4 meus pedidos: estados e botões','ok',
     exists (select 1 from jsonb_array_elements(r->'pedidos') e where (e->>'id')::uuid=vR and e->>'em_edicao'='true' and e->>'edicao_expira_em' is not null)
     and exists (select 1 from jsonb_array_elements(r->'pedidos') e where (e->>'id')::uuid=vV and e->>'situacao'='Cancelado' and e->>'pode_cancelar'='false')
     and exists (select 1 from jsonb_array_elements(r->'pedidos') e where (e->>'id')::uuid=vQ and e->>'pode_editar'='false'),'r',null));
  r := meus_pedidos('fc-x', 10);
  res := res || jsonb_build_array(jsonb_build_object('c','K5 meus pedidos com token inventado','ok', r->>'erro'='token_invalido','r',r));

  -- ======================================================== L. AVISOS
  r := avisos_pendentes(200);
  res := res || jsonb_build_array(jsonb_build_object('c','L1 avisos pendentes resolvem nome e Slack do destinatário','ok',
     exists (select 1 from jsonb_array_elements(r) a, jsonb_array_elements(a->'para') p
              where (a->>'solicitacao_id')::uuid = vQ and p->>'papel'='aprovador' and p->>'nome' is not null and p->>'token' is not null),'r',null));
  select (a->>'id')::bigint into n1 from jsonb_array_elements(r) a limit 1;
  r := marcar_aviso(n1, false, 'slack fora');
  r2 := marcar_aviso(n1, true, null);
  res := res || jsonb_build_array(jsonb_build_object('c','L2 marcar aviso: falha conta tentativa; sucesso tira da fila','ok',
     (select aviso_tentativas=1 and avisado_em is not null from movimentos_compra where id=n1)
     and not exists (select 1 from jsonb_array_elements(avisos_pendentes(200)) a where (a->>'id')::bigint=n1),'r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','L3 edição iniciada/desistida não gera aviso','ok',
     not exists (select 1 from movimentos_compra where acao in ('edicao_iniciada','edicao_desistida') and avisar),'r',null));

  -- ======================================================== N. CAMINHO ANTIGO INTACTO
  res := res || jsonb_build_array(jsonb_build_object('c','N1 abrir_pedido antigo abre pedido do ClickUp','ok',
     abrir_pedido(real_id, null)->>'ok'='true','r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','N2 painel antigo responde','ok',
     painel_diretoria(tp)->>'ok'='true','r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','N3 roteamento antigo igual (normal e mensal)','ok',
     passo_da_compra('normal','lider','aprovado')->>'etapa'='cotacao'
     and passo_da_compra('mensal','lider','aprovado')->>'etapa'='gerencial'
     and passo_da_compra('normal','gerencial','aprovado')->>'etapa'='financeiro','r',null));
  res := res || jsonb_build_array(jsonb_build_object('c','N4 nenhum pedido antigo mudou de canal ou versão','ok',
     not exists (select 1 from solicitacoes where aberto_em < now() - interval '1 second' and (canal<>'clickup' or versao<>1)),'r',null));

  -- ======================================================== resultado
  select count(*) into total from jsonb_array_elements(res);
  select coalesce(jsonb_agg(e), '[]'::jsonb) into falhas from jsonb_array_elements(res) e where (e->>'ok')::boolean is not true;
  raise exception 'RESULTADO %', jsonb_build_object('total', total, 'passou', total - jsonb_array_length(falhas), 'falhas', falhas);
end $$;

revoke execute on function public._teste_caminho_telas() from public, anon, authenticated;

-- 24/09 · bateria ajustada para a edição contada ao clicar (C3, C13, C14, C16,
-- J12, K2, K4). Aplicar depois da função acima.
do $$
declare d text;
  pares text[][] := array[
    array[$a$r->>'ok'='true' and (r->>'prazo_minutos')::numeric = 30 and r->>'mensagem' like '%30 minutos%'$a$,
          $b$r->>'ok'='true' and (r->>'prazo_minutos')::numeric = 30 and r->>'mensagem' like '%30 minutos%' and r->>'mensagem' like '%única edição%' and (select edicao_usada from solicitacoes where id=vP)$b$],
    array[$a$'C13 desistir devolve à liderança sem gastar a edição'$a$, $b$'C13 desistir devolve à liderança (a edição já foi gasta ao clicar)'$b$],
    array[$a$(select etapa_atual='lider' and not edicao_usada from solicitacoes where id=vR)$a$, $b$(select etapa_atual='lider' and edicao_usada from solicitacoes where id=vR)$b$],
    array[$a$'C14 depois de desistir ainda pode editar','ok', r->>'ok'='true'$a$, $b$'C14 depois de desistir não edita de novo','ok', r->>'erro'='edicao_ja_usada'$b$],
    array[$a$(select etapa_atual='lider' and not edicao_usada and motivo='Teste automático' from solicitacoes where id=vS)$a$, $b$(select etapa_atual='lider' and edicao_usada and motivo='Teste automático' from solicitacoes where id=vS)$b$],
    array[$a$  r := pedido_telas(tf, vR);$a$, $b$  r := abrir_pedido_telas(tf, cab, itens); vT := (r->>'id')::uuid;
  r := pedido_telas(tf, vT);$b$],
    array[$a$r := iniciar_edicao(tf, vR, (select versao from solicitacoes where id=vR));$a$, $b$r := iniciar_edicao(tf, vT, (select versao from solicitacoes where id=vT));$b$],
    array[$a$where (e->>'id')::uuid=vR and e->>'em_edicao'='true'$a$, $b$where (e->>'id')::uuid=vT and e->>'em_edicao'='true'$b$]
  ];
  i int; antes text;
begin
  d := pg_get_functiondef('public._teste_caminho_telas()'::regprocedure);
  for i in 1 .. array_length(pares, 1) loop
    antes := d;
    d := replace(d, pares[i][1], pares[i][2]);
    if d = antes then raise exception 'troca % não achou o trecho', i; end if;
  end loop;
  execute d;
end $$;
