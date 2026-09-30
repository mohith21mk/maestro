# PROJECT ISOLATION ARCHITECTURE: POWER HOUSE

## Core Principle

**This application is a standalone product. It must not depend on, import from, call, authenticate against, share databases with, or share runtime state with MINEGUARD AI.**

POWER HOUSE and MINEGUARD AI are two completely independent, decoupled platforms developed for distinct domains and customer segments. This isolation is a permanent architectural rule.

---

## 1. Domain Separation

| Dimension | POWER HOUSE | MINEGUARD AI |
| :--- | :--- | :--- |
| **Domain Scope** | MSME & Industrial Enterprise Compliance Operating System | Coal Mine Smart Governance, Safety & DGMS Compliance |
| **Target Customers** | Manufacturing factories, textile mills, food processing, industrial units | Coal mining operations, mine managers, safety officers |
| **Statutory Regulators** | Factory Act 1948, FSSAI, State Pollution Control Boards (CTE/CTO), Central & State MSME Schemes | DGMS (Directorate General of Mines Safety), Coal Mines Regulations (CMR), Ministry of Coal |
| **Primary Entities** | Business Profiles, Factory Licences, Compliance Tasks, Documents, Government Schemes | Mine Sites, Pit Inspections, Gas Telemetry, Strata Control, DGMS Violations |

---

## 2. Hard Isolation Guardrails

### A. Source Code Isolation
- Never import code from MineGuard (`../mineguard`, `mineguard-ai`, or symlinked packages).
- Never share source folders or common component libraries unless explicitly published as an independent, third-party npm/PyPI package.
- All application code for POWER HOUSE must reside entirely within this repository.

### B. Frontend Isolation
- React router configuration, pages, contexts, hooks, and components must never navigate, redirect, or bridge to MineGuard.
- No shared state (React Context, Zustand, Redux, or global window variables).

### C. Backend & API Isolation
- POWER HOUSE backend exposes its own independent REST API at `http://127.0.0.1:8000/api/v1`.
- Backend endpoints must never issue HTTP requests, RPC calls, or microservice queries to MineGuard.
- A failure in MineGuard must have zero effect on POWER HOUSE.

### D. Database & Persistence Isolation
- POWER HOUSE uses its own dedicated database (`powerhouse.db` locally or PostgreSQL `powerhouse`).
- SQLAlchemy ORM schemas, tables, and Alembic migrations belong strictly to POWER HOUSE.
- Never share database URLs, credentials, connection pools, or query MineGuard tables.

### E. Authentication & Session Isolation
- Users, passwords, and roles belong exclusively to POWER HOUSE.
- JWT tokens are signed using POWER HOUSE's distinct secret key and validated strictly against the POWER HOUSE user registry.
- MineGuard credentials or roles must never be accepted, mapped, or inherited.

### F. Browser State Namespaces
All client-side persistence must use explicit POWER HOUSE namespaces:
- `ph_token`: Authentication JWT
- `powerhouse_sidebar_collapsed`: Sidebar preference
- `phflow_onboarding_v1`: Onboarding wizard cache

Never write to or read from `mineguard_*` storage keys.

---

## 3. Validator Scanning Scope & Classification

The automated isolation validator (`scripts/verify-isolation.mjs`) categorizes all repository contents into three distinct scopes:

### Scope A: RUNTIME / SOURCE / CONFIGURATION (Zero-Tolerance)
- **Included**: All application code (`src/**/*`, `backend/app/**/*`, `backend/alembic/**/*`, `backend/scripts/**/*`), configuration (`package.json`, `vite.config.js`, `backend/requirements.txt`), environment templates, and markdown content.
- **Rule**: Absolutely **ZERO** references to `mineguard`, `mine_guard`, `mine-guard`, `mineguard-ai`, `mineguard.db`, or coal-mining domain entities are permitted. Any match immediately aborts with exit code `1`.

### Scope B: ISOLATION POLICY / VALIDATOR (Legitimate References)
- **Included Files**:
  1. `PROJECT-ISOLATION.md` — This architecture document, which explicitly names MINEGUARD AI to define the isolation boundaries and policies.
  2. `scripts/verify-isolation.mjs` — The isolation enforcement engine itself, which contains keyword match patterns to detect violations.
  3. `backend/tests/test_isolation.py` — The automated pytest suite, which asserts the absence of cross-project terms in runtime settings.
  4. `.githooks/pre-commit` — The git hook script that invokes the isolation check before commit.
- **Rule**: Explicit references to the isolated application are legitimate and required to define, test, and enforce the isolation boundary.

### Scope C: BUILD ARTIFACTS / VIRTUAL ENVIRONMENTS (Standard Exclusions)
- **Included**: `.git`, `node_modules`, `dist`, `build`, `.pytest_cache`, `__pycache__`, `.venv`, `venv`, `package-lock.json`, `powerhouse.db`, `test_powerhouse.db`.
- **Rule**: Standard build directories, binary database files, and third-party packages are excluded from keyword parsing to prevent false positives in third-party vendor code.

---

## 4. Production Secret Handling

The backend configuration ([`backend/app/core/config.py`](backend/app/core/config.py)) implements strict secret enforcement via Pydantic model validation (`validate_production_secrets`):

- **Development Mode (`ENVIRONMENT=development`)**:
  Allows a safe, explicit non-production default key (`powerhouse-dev-only-secret-key-do-not-use-in-production`) to ensure a smooth, reproducible developer and test experience.
- **Production Mode (`ENVIRONMENT=production` or `DEBUG=False`)**:
  - The `SECRET_KEY` environment variable is **mandatory**.
  - If `SECRET_KEY` is missing, blank, or matches known development default placeholders, the backend fails at startup with a `ValueError` configuration exception.
  - Secret values are never printed in logs, console outputs, or error traces.
  - Production deployments must inject a cryptographically random secret string via environment variables or secret vaults.

---

## 5. Automated Guardrail Enforcement

This repository includes 4 layers of automated enforcement:

1. **Git Pre-Commit Hook**:
   - Location: [`.githooks/pre-commit`](.githooks/pre-commit)
   - Configuration: Configured via `git config core.hooksPath .githooks`.
   - Setup: Reproducible for any developer via `npm run prepare` (automatically executed on `npm install`).
   - Behavior: Automatically runs `scripts/verify-isolation.mjs` before every `git commit`. A prohibited cross-project reference immediately rejects the commit.

2. **Development Validation Command**:
   ```bash
   npm run verify:isolation
   ```
   Runs the standalone isolation validator and reports scan statistics and violation details.

3. **Pre-Build Gate**:
   - `package.json` configures `"prebuild": "npm run verify:isolation"`.
   - Executing `npm run build` guarantees that `verify:isolation` runs and passes before Vite compiles the production bundle.

4. **Backend Test Suite**:
   ```bash
   pytest backend/tests/test_isolation.py -v
   ```
   Validates backend application settings, database URLs, git remotes, and production secret enforcement.

5. **Continuous Integration (CI)**:
   - Workflow: [`.github/workflows/isolation.yml`](.github/workflows/isolation.yml)
   - Executes isolation validation on every push and pull request targeting `main`.
