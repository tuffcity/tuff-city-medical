# Project lessons (Clawness memory)
<!-- Clawness retrieves from this file each prompt: `## Always` entries are
     injected every turn (keep to 3), `## Lessons` entries only when they match
     the prompt. Tell Claude "remember this: ..." or append a bullet yourself
     (one line, <=120 chars, newest at the bottom). Only lessons that would cost
     real rework if forgotten belong here — not a session log. See ENF-MEM-001. -->

## Always

## Lessons
- Never commit real patient data: fixtures/docs use fictitious values; import payloads live only in session scratchpad.
- Deploy: page bundled via src/entry.js (Workers Assets upload 401s behind proxy); pass --var MED_VERSION:<sha>.
- Node fetch to Cloudflare API needs NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt.
