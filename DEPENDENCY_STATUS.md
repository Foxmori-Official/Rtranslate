# Dependency status at initial public alpha

Date: 2026-11-05. This is an alpha source release, not a security certification.

`npm audit` reported known advisories in these dependency chains. No forced major-version migration was applied during publication. Re-run `npm audit` against the lockfiles before production deployment.

## development tools

- `vitest`: critical dependency-chain status.
- [Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)
- [Vitest: Code injection via unauthenticated manual mock registration](https://github.com/advisories/GHSA-qxg6-89mg-rqv8)
- [Tinypool: Prototype Pollution gadget in worker options leads to Remote Code Execution](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3)
- [Tinypool: Prototype Pollution Gadget to RCE in run() options](https://github.com/advisories/GHSA-85c8-ppgw-ccpr)

The current findings are in test tooling; the production extension ZIP does not include Vitest or its worker dependencies. Avoid exposing development/test servers to untrusted networks.
