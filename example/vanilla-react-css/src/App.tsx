import "./App.css";

function App() {
  return (
    <main>
      <section data-testid="token-card" className="token-card">
        <h1>CSS Forge + React + Vanilla CSS</h1>
        <p>
          Tokens are generated from <code>cssforge.config.ts</code> and consumed as CSS
          variables.
        </p>
      </section>
      <section data-testid="alias-scope" className="alias-scope">
        <p data-testid="alias-probe" className="alias-probe">
          Theme alias probe
        </p>
        <div data-testid="scope-host">
          <p data-testid="another-probe" className="another-probe">
            Descendant-scoped palette probe
          </p>
          <p data-testid="brand-probe" className="brand-probe">
            Root-scoped palette probe
          </p>
        </div>
      </section>
    </main>
  );
}

export default App;
