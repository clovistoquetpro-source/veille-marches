import { euros } from "@/lib/format";

/** Petit histogramme horizontal : une barre par ligne, proportionnelle au montant (ou au nombre). */
export function Barres({ lignes }: { lignes: { libelle: string; marches: number; montant: number | null }[] }) {
  const valeur = (l: { marches: number; montant: number | null }) => l.montant ?? 0;
  const max = Math.max(1, ...lignes.map(valeur));
  return (
    <table className="w-full text-sm">
      <tbody>
        {lignes.map((l) => (
          <tr key={l.libelle} className="align-middle">
            <td className="w-1/3 py-1 pr-3">{l.libelle}</td>
            <td className="py-1 pr-3">
              <div className="h-3 rounded bg-sky-600" style={{ width: `${Math.max(1, (100 * valeur(l)) / max)}%` }} />
            </td>
            <td className="w-28 py-1 pr-3 text-right whitespace-nowrap">{euros(l.montant)}</td>
            <td className="w-24 py-1 text-right whitespace-nowrap text-gray-600">{l.marches} marché{l.marches > 1 ? "s" : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
