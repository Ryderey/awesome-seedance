# Execution

- Implement shared validation, opt-in row storage, per-process session ID resolution and SDK header injection.
- Add collapsed settings rows and inline validation; basic settings unchanged. Register new module in package staging.
- Verify actual SDK wire headers (probe, intent, ranking and repair), disabled omission, UUID reuse/rotation, and persistence opt-in/revocation.
- Verify UI default collapse, add/delete/toggle/type, inline invalid controls, blocked probe/save and valid repair. Run Node tests, syntax check, Electron UI and HTTP-fixture integration with normal host permissions.
- Update executable contracts, build portable app and run outside-checkout integration. Review scoped changes using Trellis check. Record limitations: no live provider credentials used.
- Leave changes local for user review; preserve v1.0.0 and independent feature branch. Do not archive/auto-commit unrelated task files.
