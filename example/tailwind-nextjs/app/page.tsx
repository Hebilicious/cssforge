export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--palette-brand-surface)] p-[var(--spacing-size-4)] text-white">
      <section
        data-testid="token-card"
        className="mx-auto max-w-xl rounded-[var(--spacing-size-2)] bg-[var(--palette-brand-primary)] p-[var(--spacing-size-4)] text-[var(--typography_fluid-base-text-m)] shadow-lg"
      >
        <h1 className="mb-[var(--spacing-size-2)] text-[var(--typography_fluid-base-text-l)] font-semibold">
          CSS Forge + Next.js + Tailwind
        </h1>
        <p>
          Tokens are generated from <code>cssforge.config.ts</code> and consumed as CSS
          variables.
        </p>
      </section>
    </main>
  );
}
