import { CardsIcon, SuitsRow } from "@/components/brand/icons";

/**
 * Página servida pelo service worker quando não há conexão E a página pedida
 * nunca foi aberta antes (não está no cache).
 *
 * Precisa ser estática: se dependesse do banco, não teria como ser mostrada
 * justamente na situação em que ela existe.
 */
export const dynamic = "force-static";

export const metadata = { title: "Sem conexão" };

export default function OfflinePage() {
  return (
    <div className="card mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-14 text-center">
      <CardsIcon className="h-14 w-14 text-chalk-dim/30" />
      <h1 className="text-xl font-extrabold text-chalk">Sem conexão</h1>
      <p className="text-sm leading-relaxed text-chalk-dim">
        Não foi possível carregar esta página porque o aparelho está sem internet. As telas que
        você já visitou continuam disponíveis offline.
      </p>
      <p className="text-xs text-chalk-dim/70">
        Assim que a conexão voltar, o ranking se atualiza sozinho.
      </p>
      <SuitsRow className="text-chalk-dim/30" />
    </div>
  );
}
