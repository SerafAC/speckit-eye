# Security policy

## Supported versions

Security fixes are released for the latest minor version of the current major
version only. Upgrade to the latest release to receive them.

| Version                    | Supported |
| -------------------------- | --------- |
| Latest `1.x` minor         | Yes       |
| Older `1.x` minor versions | No        |
| Versions before `1.0.0`    | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem. Report it
privately through GitHub's private vulnerability reporting:

<https://github.com/SerafAC/speckit-eye/security/advisories/new>

Include as much of the following as you can:

- the speckit-eye version, Node.js version and operating system;
- the command you ran (serve mode or `--build`, with its options);
- the steps or a minimal project that reproduce the problem;
- what an attacker could do with it, as you understand it.

## What to expect

- A first response within **7 days**, confirming that the report was received
  and whether it is being investigated.
- Updates while a fix is prepared, and a request for your review of it when
  that helps.
- Coordinated disclosure: the fix is released first, then the advisory is
  published with credit to you, unless you prefer to stay anonymous. Please
  keep the details private until then.

## Scope

- speckit-eye only reads the project it is pointed at. It never creates,
  changes or deletes a file in it; a static build writes only to the output
  folder you name.
- Serve mode listens on the loopback interface (`127.0.0.1`) only, so the
  dashboard is reachable from your own machine and not from the network.
- A hosted static build makes every document in `specs/` and `.specify/`
  readable by anyone who can reach the site. That is documented behavior (see
  [Hosting a snapshot](docs/hosting.md)), not a vulnerability; restrict access
  on your host if the documents are private.
