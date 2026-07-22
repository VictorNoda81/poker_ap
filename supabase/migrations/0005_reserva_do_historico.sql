-- =============================================================================
-- Reserva conhecida do histórico
-- =============================================================================
-- Nas planilhas antigas, a linha "10% DO POTE POR RODADA" é um FATO registrado
-- pela liga, não algo a recalcular: aquele valor já saiu com a taxa de
-- administração e os outros custos deduzidos.
--
-- Recalcular a reserva dessas etapas pela cascata atual mudava números que a
-- liga considera fechados. Por isso o valor passa a ser guardado, e a fórmula
-- só vale para as etapas em que ele não existe (as novas).
-- =============================================================================
-- Idempotente: pode rodar mais de uma vez.
-- =============================================================================

alter table stages
  add column if not exists reserve_override numeric(12, 2)
  check (reserve_override >= 0);

comment on column stages.reserve_override is
  'Reserva da Etapa Final registrada na origem. Quando preenchida, vale sobre a '
  'fórmula — é o caso das etapas importadas das planilhas, cujo pote já vinha '
  'líquido de taxa de administração e outros custos.';
