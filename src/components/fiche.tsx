/** Briques communes aux fiches acheteur et entreprise. */

export function Chiffre({ titre, valeur, detail }: { titre: string; valeur: string; detail?: string }) {
  return (
    <div className="rounded border p-3">
      <p className="text-xs text-gray-600">{titre}</p>
      <p className="mt-1 text-xl font-semibold">{valeur}</p>
      {detail && <p className="text-xs text-gray-500">{detail}</p>}
    </div>
  );
}

export function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-lg font-semibold">{titre}</h2>
      {children}
    </section>
  );
}
