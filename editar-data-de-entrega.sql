-- Edição pelo solicitante (05/10, pedido do Alisson): além dos itens, a data de
-- entrega (data_necessidade) também pode mudar. O resto do cabeçalho continua travado.
-- Data nova não pode estar no passado (dia de Brasília). Vazia = mantém a gravada.
do $$
declare d text; n text;
  a1 text := '''justificativa_fornecedor'', s.justificativa_fornecedor, ''data_necessidade'', s.data_necessidade,';
  b1 text := '''justificativa_fornecedor'', s.justificativa_fornecedor, ''data_necessidade'', coalesce(nullif(trim(p_cabecalho->>''data_necessidade''), '''')::date, s.data_necessidade),';
  a2 text := '    perform _telas_validar_itens(p_itens);';
  b2 text := '    if (p_cabecalho->>''data_necessidade'')::date is distinct from s.data_necessidade
       and (p_cabecalho->>''data_necessidade'')::date < (now() at time zone ''America/Sao_Paulo'')::date then
      perform _telas_erro(''data_no_passado'', ''A data limite para entrega não pode estar no passado.'');
    end if;
    perform _telas_validar_itens(p_itens);';
begin
  d := pg_get_functiondef('public.salvar_edicao(text,uuid,jsonb,jsonb)'::regprocedure);
  if position('data_no_passado' in d) > 0 then return; end if;
  if (length(d)-length(replace(d,a1,'')))/length(a1) <> 1 then raise exception 'trecho 1 não encontrado'; end if;
  if (length(d)-length(replace(d,a2,'')))/length(a2) <> 1 then raise exception 'trecho 2 não encontrado'; end if;
  n := replace(replace(d, a1, b1), a2, b2);
  n := replace(n, '-- Só os itens mudam na edição: o cabeçalho é o que já está gravado.',
                  '-- Na edição mudam os itens e a data de entrega: o resto do cabeçalho é o que já está gravado.');
  execute n;
end $$;

-- Pedido C2610-00027: libera uma nova edição (pedido do usuário, 05/10).
update solicitacoes set edicao_usada = false
 where numero = 'C2610-00027' and etapa_atual = 'lider' and edicao_usada;
