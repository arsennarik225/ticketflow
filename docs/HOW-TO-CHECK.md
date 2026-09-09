# How to check this

Two tasks were done: **ALN-8 set up the repo**, **ALN-9 write the API contract**.
Nothing else. No app code yet.

## 1. Look at the API contract (30 seconds)

Open **[editor.swagger.io](https://editor.swagger.io)**, paste in `docs/api/openapi.yaml`.
Left side is the file, right side is readable documentation. Click any endpoint to see
what you send and what comes back.

Nothing to install. This is what to send the team for review.

## 2. Check it is valid

```bash
pip install openapi-spec-validator
python -c "from openapi_spec_validator import validate; from openapi_spec_validator.readers import read_from_filename; validate(read_from_filename('docs/api/openapi.yaml')[0]); print('valid')"
```

Prints `valid`. Already passing: 51 endpoints, 31 schemas, no broken references.

## 3. Check the repo

```
apps/web/  apps/mobile/  apps/api/   empty, ready to fill
docs/                                requirements + contract
README.md                            stack, rules, open questions
```

## What to review

- Does the contract cover the core flow in SRS §13.4? Create event → campaign QR →
  promo code → pick ticket → checkout → ticket → support → verify entry.
- The 8 rules in `README.md` — do you agree they are non-negotiable?
- The 5 open questions in `README.md` — the team needs to answer these before coding.

## What is deliberately missing

Analytics (§4.15), event history (§4.16), admin portal (§4.12) — required, but Week 9.
Assigned seating (§4.3.1) and calendar export (§4.11) — bonus (§8).
Add them when you get there instead of guessing now.
