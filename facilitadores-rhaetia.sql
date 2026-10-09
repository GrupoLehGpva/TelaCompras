-- 09/10: 8 facilitadores das granjas Rhaetia entraram no Slack. Liga o usuário do Slack e ativa
-- (sem isso o /compras não os reconhece). Aprovadores (Jamil, Jaciel, Fabio, Edilson, Herisson,
-- Wienfried) já estavam ativos e com Slack.
with v(id, uid) as (values
  ('rhaetia101','U0C829T5682'), ('rhaetia103','U0C80FRUPPG'), ('rhaetia104','U0C865F04TE'),
  ('rhaetia105','U0C7W7YQSSF'), ('rhaetia106','U0C80FRHASJ'), ('rhaetia107','U0C80FPDNRL'),
  ('rhaetia109','U0C84CW1RH7'), ('rhaetia115','U0C7X5XRR2R'))
update facilitadores f set slack_user_id = v.uid, ativo = true, atualizado_em = now()
  from v where f.id = v.id;
