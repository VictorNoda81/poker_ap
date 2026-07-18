"use client";

import { useState } from "react";
import { savePlayer } from "@/app/admin/actions";
import { Field, PrimaryButton, inputClass } from "@/components/admin/ui";
import type { PlayerType } from "@/lib/domain/ranking";

export interface PlayerFormValues {
  id?: string;
  fullName?: string;
  type?: PlayerType;
  memberNumber?: string | null;
  invitedByName?: string | null;
  notes?: string | null;
}

/**
 * Cadastro/edição de jogador.
 *
 * Os campos opcionais aparecem conforme o tipo: número de sócio só para
 * sócios, "quem convidou" só para convidados. O banco tem CHECK constraints
 * garantindo a mesma regra — o formulário só evita que o admin chegue lá.
 */
export function PlayerForm({
  values,
  onCancelHref,
}: {
  values?: PlayerFormValues;
  onCancelHref?: string;
}) {
  const [type, setType] = useState<PlayerType>(values?.type ?? "indefinido");
  const editando = Boolean(values?.id);

  return (
    <form action={savePlayer} className="space-y-4">
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <Field label="Nome completo" htmlFor="nome">
        <input
          id="nome"
          name="nome"
          required
          defaultValue={values?.fullName ?? ""}
          placeholder="Ex.: Rodolfo Negrão"
          className={inputClass}
        />
      </Field>

      <Field label="Tipo" htmlFor="tipo">
        <select
          id="tipo"
          name="tipo"
          value={type}
          onChange={(event) => setType(event.target.value as PlayerType)}
          className={inputClass}
        >
          <option value="socio">Sócio do Clube</option>
          <option value="convidado">Convidado</option>
          <option value="indefinido">A definir</option>
        </select>
      </Field>

      {/* Campo exclusivo de sócios. */}
      {type === "socio" ? (
        <Field
          label="Número de sócio"
          htmlFor="numeroSocio"
          hint="Opcional — deixe em branco se não souber."
        >
          <input
            id="numeroSocio"
            name="numeroSocio"
            defaultValue={values?.memberNumber ?? ""}
            className={inputClass}
          />
        </Field>
      ) : null}

      {/* Campo exclusivo de convidados. */}
      {type === "convidado" ? (
        <Field
          label="Sócio que convidou"
          htmlFor="convidadoPor"
          hint="Opcional — nome do sócio responsável pelo convite."
        >
          <input
            id="convidadoPor"
            name="convidadoPor"
            defaultValue={values?.invitedByName ?? ""}
            className={inputClass}
          />
        </Field>
      ) : null}

      {type === "indefinido" ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          Jogadores “a definir” aparecem destacados na lista até você classificá-los como sócio ou
          convidado.
        </p>
      ) : null}

      <Field label="Observações" htmlFor="observacoes">
        <textarea
          id="observacoes"
          name="observacoes"
          rows={2}
          defaultValue={values?.notes ?? ""}
          className={inputClass}
        />
      </Field>

      <div className="flex items-center gap-2">
        <PrimaryButton>{editando ? "Salvar alterações" : "Cadastrar jogador"}</PrimaryButton>
        {onCancelHref ? (
          <a
            href={onCancelHref}
            className="rounded-lg border border-ink-700 px-3 py-2 text-sm font-semibold text-chalk-dim transition-colors hover:text-chalk"
          >
            Cancelar
          </a>
        ) : null}
      </div>
    </form>
  );
}
