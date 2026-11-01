# Virtual Lab

Static browser simulations, prepared for GitHub Pages project hosting. The HPLC
simulation is the active app; its existing layout is retained for later UI work.

## Run and check

Node 24 runs the checks and copies public files into a deployable artifact. There
are no npm dependencies to install, and no bundler or backend is required.

```text
npm test
npm run build
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000/`, then choose HPLC Simulator. Serve over HTTP rather
than opening HTML files directly, because the app uses native ES modules.

## Structure

```text
apps/hplc-simulator/
  physics/             SI equations by physical framework
  physics-models.js    Public physics exports
  simulation.js        Deterministic simulation clock, particles, detector samples
  simulation-view.js   Chart.js/PixiJS rendering only
  ui-controller.js     Input validation, browser scheduling, run/pause/flush
  pubchem.js           Optional bounded remote compound lookup
  compounds.js         Local compound estimates; simulation needs no PubChem request
  experimental/        Standalone WebGPU PDE prototype, outside the active engine
apps/_template/        Existing standalone app starting point
shared/                Space for assets shared by multiple apps
scripts/build-site.mjs Public artifact assembly
tests/                Node built-in regression checks
.github/workflows/     Test and GitHub Pages deployment workflow
```

[Simulation interface, physics, and limits](apps/hplc-simulator/README.md).

## GitHub Pages

Set the repository's **Settings → Pages → Source** to **GitHub Actions**. The
workflow tests pull requests; successful pushes to `main` or manual runs build
and deploy `dist`. It uses the `github-pages` environment and scoped Pages/OIDC
permissions, following the [official custom workflow guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
Repository Pages settings must be configured separately before deployment.

All app assets and imports use relative paths, including at a project URL such
as `https://owner.github.io/virtual_lab/`. The build excludes agent files, Git
metadata, tests, scripts, and package configuration. It replaces only a selected
artifact directory marked with `.nojekyll`; other nonempty destinations are
rejected. Tests verify artifact references under a repository prefix and that
rebuilding removes stale modules.

The current presentation still loads Tailwind, pinned Chart.js 4.4.8 and PixiJS
7.3.2 from their existing public CDNs. Those are rendering dependencies; the
simulation modules have no browser or third-party imports. Hosting the display
assets locally can accompany the later UI work. PubChem is optional and has a
local fallback. No WebGPU, WebAssembly, cross-origin isolation, or server compute
is required for the active analytical/particle modes.

## Add an app

Copy `apps/_template/` to `apps/<app-name>/` and link it from the root `index.html`.
Keep app-specific code in its directory; promote assets to `shared/` when a
second app actually needs them.
