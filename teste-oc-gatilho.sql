-- Teste do gatilho e da vez (03/10). Roda e desfaz tudo (termina em RESULTADO).
do $do$
declare r text := ''; n0 bigint; n1 bigint; sid uuid;
begin
  r := r || ' T1:' || oc_trava_envio('A', 60) || ' T2:' || oc_trava_envio('B', 60) || ' T3:' || oc_trava_envio('A', 60)
         || ' T4:' || oc_solta_envio('B') || ' T5:' || oc_solta_envio('A') || ' T6:' || oc_trava_envio('B', 60);
  update oc_config set envio_ate = now() - interval '1 second' where id;
  r := r || ' T7(expirou):' || oc_trava_envio('C', 60);
  select count(*) into n0 from net.http_request_queue;
  update oc_config set ligado = false, webhook_emitir = 'http://127.0.0.1:9/teste' where id;
  select id into sid from solicitacoes where status = 'em cotacao' limit 1;
  update solicitacoes set status = 'aprovado', etapa_atual = null where id = sid;
  select count(*) into n1 from net.http_request_queue;
  r := r || ' desligado_nao_chama:' || (n1 = n0);
  update solicitacoes set status = 'em cotacao', etapa_atual = 'cotacao' where id = sid;
  update oc_config set ligado = true where id;
  update solicitacoes set status = 'aprovado', etapa_atual = null where id = sid;
  select count(*) into n1 from net.http_request_queue;
  r := r || ' ligado_chama:' || (n1 = n0 + 1);
  update solicitacoes set observacao = coalesce(observacao, '') || ' ' where id = sid;
  select count(*) into n1 from net.http_request_queue;
  r := r || ' outra_mudanca_nao_chama:' || (n1 = n0 + 1);
  raise exception 'RESULTADO%', r;   -- esperado: true,false,true,false,true,true,true e os três true
end $do$;
