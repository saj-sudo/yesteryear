import { render } from 'preact';

// Placeholder landing shell — real content lands with the docs step.
function Landing() {
  return (
    <main class="landing">
      <h1>Yesteryear</h1>
      <p>Resurfacing for Capacities. Site under construction.</p>
    </main>
  );
}

render(<Landing />, document.getElementById('root')!);
