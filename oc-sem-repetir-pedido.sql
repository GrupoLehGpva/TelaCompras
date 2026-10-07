-- 07/10: oc_pendentes_de_montar não mexe em pedido que já tem OC.
-- 1) Bloqueio: só vira "bloqueio" (e aviso no Slack) pedido que ainda não tem nenhuma OC.
--    Sem isso, a trava nova de condição repetida marcava a C2610-00021 (OC 3949 já no GR)
--    e a C2610-00032 (já recusada pelo GR) a cada conferência.
-- 2) OC nova: não sai outra OC para o mesmo pedido + fornecedor que já tem OC (fora as
--    canceladas). A chave leva a condição de pagamento; se a condição mudasse depois da
--    OC criada, sairia uma OC repetida no GR. Para refazer de propósito: oc_refazer.
do $$
declare d text; n text;
  a1 text := 'where oc.chave = _oc_chave(p_ambiente, r.numero || '':bloqueio'')) then';
  b1 text := 'where oc.chave = _oc_chave(p_ambiente, r.numero || '':bloqueio''))
          and not exists (select 1 from ordens_compra oc2
                           where oc2.solicitacao_id = r.id and oc2.ambiente = p_ambiente
                             and oc2.situacao <> ''cancelada'') then';
  a2 text := '       where not exists (select 1 from ordens_compra oc
                          where oc.chave = _oc_chave(p_ambiente, o->>''chave''));';
  b2 text := '       where not exists (select 1 from ordens_compra oc
                          where oc.chave = _oc_chave(p_ambiente, o->>''chave''))
         and not exists (select 1 from ordens_compra oc2
                          where oc2.solicitacao_id = r.id and oc2.ambiente = p_ambiente
                            and oc2.fornecedor_id = o->>''fornecedor_id''
                            and oc2.situacao <> ''cancelada'');';
begin
  d := pg_get_functiondef('public.oc_pendentes_de_montar(text,text)'::regprocedure);
  if position('oc2.solicitacao_id = r.id' in d) > 0 then return; end if;
  if (length(d)-length(replace(d,a1,'')))/length(a1) <> 1 then raise exception 'trecho 1'; end if;
  if (length(d)-length(replace(d,a2,'')))/length(a2) <> 1 then raise exception 'trecho 2'; end if;
  n := replace(replace(d, a1, b1), a2, b2);
  execute n;
end $$;
