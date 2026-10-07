import { type Mode, Panneau } from "./panneau";

export const metadata = { title: "Connexion" };

const MODES: Mode[] = ["connexion", "creer", "oubli"];

export default async function PageConnexion({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  const modeInitial = MODES.find((m) => m === mode) ?? "connexion";
  return (
    <section className="pointer-events-none relative z-10 grid flex-1 place-items-center px-4 py-2">
      <div className="apparition pointer-events-auto w-full max-w-[400px]">
        <Panneau modeInitial={modeInitial} />
      </div>
    </section>
  );
}
