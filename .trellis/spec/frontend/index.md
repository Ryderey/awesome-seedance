# Desktop frontend guidelines

The frontend is an Electron application in desktop/. Existing scripts/lib loaders are shared with Markdown/CLI tooling. These guides describe implemented conventions, not a React or hosted-web architecture.

## Before Development
Read directory-structure, component-guidelines, state-management and type-safety before changing the bridge or renderer.

## Quality Check
Run node desktop/check.mjs, npm run desktop:test and npm run desktop:smoke. Run npm run desktop:package and outside-checkout smoke for packaging changes. Run node router/build.mjs --write --out .tmp/router-package then --check when root package.json or README source changes.

| Guide | Purpose |
|---|---|
| [Directory structure](./directory-structure.md) | Ownership and data reuse |
| [Components](./component-guidelines.md) | Safe DOM, details and media |
| [Hooks](./hook-guidelines.md) | Event subscriptions |
| [State](./state-management.md) | Search lifetime and cancellation |
| [Quality](./quality-guidelines.md) | Actual checks and packaging |
| [Type safety](./type-safety.md) | IPC contracts and validation |
