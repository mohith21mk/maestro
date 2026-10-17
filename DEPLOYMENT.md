# POWER HOUSE — Production Deployment Guide

This guide details the step-by-step procedure for deploying **POWER HOUSE** to production using **Netlify** (Frontend) and **Render** (Backend API + Managed PostgreSQL).

---

## 1. Architecture Overview

```mermaid
flowchart LR
    subgraph ClientBrowser [Client Browser]
        UI["React 19 SPA (Vite)"]
    end

    subgraph NetlifyEdge [Netlify CDN & Edge]
        StaticCDN["Global CDN (Static Assets)"]
        SPAFallback["_redirects / index.html"]
    end

    subgraph RenderPlatform [Render Cloud Platform]
        subgraph WebService [FastAPI Web Service]
            Uvicorn["Uvicorn ($PORT / 0.0.0.0)"]
            FastAPI["POWER HOUSE API (/api/v1)"]
            PortGuard["Port Guard (Bypassed in Prod)"]
            HealthProbes["/health & /ready"]
        end
        subgraph StorageLayer [Persistence Layer]
            Postgres["Render Managed PostgreSQL\n(postgresql+psycopg2://)"]
            DiskStorage["Document Vault & Vector Store\n(/var/data or local storage)"]
        end
    end

    UI -->|HTTPS / Static Assets| StaticCDN
    UI -->|API Requests with Bearer JWT| FastAPI
    FastAPI -->|Connection Pool (10/20)| Postgres
    FastAPI -->|OCR & Embeddings| DiskStorage
```

| Component | Target Service | Runtime / Engine | Configuration File |
|---|---|---|---|
| **Frontend** | Netlify | Node 20 / Vite / React 19 | [`netlify.toml`](file:///C:/Powerhouse%20V2.0%20BOXED/powerhouse-dashboard/netlify.toml) |
| **Backend API** | Render Web Service | Python 3.11+ / FastAPI / Uvicorn | [`render.yaml`](file:///C:/Powerhouse%20V2.0%20BOXED/powerhouse-dashboard/render.yaml) |
| **Database** | Render Managed PostgreSQL | PostgreSQL 16+ | Provisioned via `render.yaml` or Render Dashboard |

---

## 2. Step 1: Managed PostgreSQL Provisioning

### Automatic Provisioning via Render Blueprint
If using the provided [`render.yaml`](file:///C:/Powerhouse%20V2.0%20BOXED/powerhouse-dashboard/render.yaml), Render automatically creates and links a Managed PostgreSQL instance (`powerhouse-db`) directly to the backend web service.

### Manual Provisioning via Render Dashboard
1. Go to the [Render Dashboard](https://dashboard.render.com/) and click **New + > PostgreSQL**.
2. **Name**: `powerhouse-db`
3. **Database**: `powerhouse`
4. **User**: `powerhouse_user`
5. **Region**: `Oregon (US West)` (choose the same region for both database and web service to minimize latency).
6. **Plan**: `Starter` (or `Free` for testing).
7. Copy the **Internal Database URL** (e.g. `postgres://powerhouse_user:xxxx@dpg-xxx-a/powerhouse`).

> [!NOTE]
> The backend's configuration parser in [`backend/app/core/config.py`](file:///C:/Powerhouse%20V2.0%20BOXED/powerhouse-dashboard/backend/app/core/config.py) automatically converts legacy `postgres://` or standard `postgresql://` connection strings to `postgresql+psycopg2://` with zero manual string editing required.

---

## 3. Step 2: Backend Deployment on Render

### Method A: One-Click Blueprint Deployment (Recommended)
1. Push your repository to your Git provider (GitHub / GitLab).
2. Go to [Render Blueprints](https://dashboard.render.com/blueprints).
3. Connect your repository. Render detects [`render.yaml`](file:///C:/Powerhouse%20V2.0%20BOXED/powerhouse-dashboard/render.yaml) and provisions:
   - `powerhouse-backend` (Web Service)
   - `powerhouse-db` (PostgreSQL Database)
4. When prompted, fill in `BACKEND_CORS_ORIGINS` with your Netlify frontend URL (or leave blank until Netlify URL is generated).

### Method B: Manual Web Service Setup
1. In Render Dashboard, click **New + > Web Service**.
2. Select your repository.
3. Configure the service settings:
   - **Name**: `powerhouse-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Python`
   - **Region**: Same as PostgreSQL (e.g. `Oregon`)
   - **Branch**: `main` (or your deployment branch)
   - **Build Command**:
     ```bash
     pip install --upgrade pip && pip install -r requirements.txt && alembic upgrade head
     ```
   - **Start Command**:
     ```bash
     uvicorn app.main:app --host 0.0.0.0 --port $PORT
     ```
   - **Health Check Path**: `/health`

### Backend Environment Variables Reference

| Variable | Required in Prod? | Description / Example |
|---|---|---|
| `ENVIRONMENT` | **Yes** | Must be `production`. Triggers strict secret and security validations. |
| `DEBUG` | **Yes** | Set to `false`. |
| `SECRET_KEY` | **Yes** | 32+ character cryptographically random string. Generate with `openssl rand -hex 32`. Rejects development placeholders. |
| `DATABASE_URL` | **Yes** | Internal connection string from Managed PostgreSQL. |
| `BACKEND_CORS_ORIGINS` | **Yes** | Comma-separated list of allowed frontend origins, e.g. `https://powerhouse-control.netlify.app`. (Wildcard `*` is strictly blocked in production). |
| `PORT` | Auto (Render) | Injected dynamically by Render. The app binds to `0.0.0.0:$PORT`. |
| `SAP_PROVIDER_MODE` | Optional | `demo` (default) or `sap_gateway`. |
| `DOCUMENT_STORAGE_DIR`| Optional | Absolute path for uploaded document storage (e.g. `/var/data/documents` if using a Render persistent disk). |
| `CHROMA_PERSIST_DIR` | Optional | Absolute path for ChromaDB vector embeddings (e.g. `/var/data/chroma`). |

---

## 4. Step 3: Database Migrations

The database migration command is built into the Render build process:
```bash
alembic upgrade head
```

This applies all 31 core application tables:
1. `users`
2. `business_profiles`
3. `business_analyses`
4. `compliance_tasks`
5. `documents`
6. `regulatory_knowledge_documents`
7. `regulatory_chunks`
8. `action_proposals`
9. `approvals`
10. `applications`
11. `alerts`
12. `audit_logs`
13. `suppliers`
14. `supplier_documents`
15. `supply_items`
16. `supply_chain_risks`
17. `disruption_events`
18. `supply_chain_decisions`
19. `shipments`
20. `shipment_checkpoints`
21. `shipment_exceptions`
22. `employee_profiles`
23. `role_profiles`
24. `skill_gaps`
25. `learning_paths`
26. `green_operational_metrics`
27. `emission_factors`
28. `green_opportunities`
29. `green_impact_measurements`
30. `agent_runs`
31. `government_schemes`

### Verifying Migrations Manually (Optional)
If connecting via Render SSH or direct database CLI:
```bash
alembic current
# Expected: f6a3c9e8d1b2 (head)
```

---

## 5. Step 4: Frontend Deployment on Netlify

### Automated Git Deployment via Netlify Dashboard
1. Go to [Netlify Dashboard](https://app.netlify.com/) and click **Add new site > Import an existing project**.
2. Connect your Git repository.
3. Configure the build parameters:
   - **Base directory**: `.` (root directory)
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
4. Set **Environment variables**:
   - `VITE_API_URL`: `https://powerhouse-backend.onrender.com/api/v1` (replace with your real Render Web Service URL).

> [!IMPORTANT]
> In production builds, [`src/services/apiClient.js`](file:///C:/Powerhouse%20V2.0%20BOXED/powerhouse-dashboard/src/services/apiClient.js) refuses to silently fallback to `localhost:8000`. If `VITE_API_URL` is omitted, the frontend displays an explicit configuration guidance message preventing hidden API routing errors.

### Netlify Deployment Verification
When Netlify builds the app:
1. `prebuild` runs `npm run verify:isolation` (validates 100% clean repository isolation guardrails).
2. Vite transforms modules and compiles assets to `dist/`.
3. [`netlify.toml`](file:///C:/Powerhouse%20V2.0%20BOXED/powerhouse-dashboard/netlify.toml) applies security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`) and SPA fallback routing (`/* -> /index.html 200`).

---

## 6. Step 5: Post-Deployment Smoke Testing & Health Checks

### 1. Backend Liveness Check
```bash
curl -f https://<your-render-service>.onrender.com/health
```
**Expected Response (HTTP 200):**
```json
{
  "status": "healthy",
  "environment": "production",
  "service": "power-house-api"
}
```

### 2. Backend Deep Readiness Probe (Verifies PostgreSQL Connectivity)
```bash
curl -f https://<your-render-service>.onrender.com/ready
```
**Expected Response (HTTP 200):**
```json
{
  "status": "ready",
  "database": "connected",
  "database_type": "postgresql"
}
```

### 3. Frontend End-to-End Verification
1. Open the Netlify URL in a browser.
2. Verify initial login screen renders without CORS warnings in browser console.
3. Log in with the administrator credentials:
   - **Username**: `admin@powerhouse.internal`
   - **Password**: configured admin password
4. Navigate through core control tower modules:
   - **Business Control Tower**: Confirm dashboard metrics load.
   - **Compliance Tasks & Approvals**: Create or inspect compliance task.
   - **Document Vault**: Upload a document and verify processing.
   - **Green Operations**: Verify GHG Scope 1/2/3 calculations and opportunities.
   - **Workforce Intelligence**: Verify role profiles and skill gaps.
   - **Resilient & Operational Supply Chain**:
     - Check Shipments list (`/api/v1/supply-chain/shipments`).
     - Trigger shipment status update and verify checkpoint creation.
     - Review Disruption Scenario simulations.
     - Approve an Action Proposal and confirm Audit Log entry.

---

## 7. Troubleshooting & FAQ

### CORS Origin Errors (`CORS header 'Access-Control-Allow-Origin' missing`)
- **Cause**: The frontend URL does not match `BACKEND_CORS_ORIGINS` in Render.
- **Fix**: In Render Web Service settings, add your exact Netlify domain (e.g. `https://my-powerhouse-app.netlify.app`) to `BACKEND_CORS_ORIGINS`. Do not use a trailing slash.

### 503 Service Unavailable on `/ready`
- **Cause**: Backend cannot establish connection with PostgreSQL.
- **Fix**: Check that `DATABASE_URL` is populated and that the PostgreSQL service in Render is in `Available` state. Render auto-resumes sleeping free databases after 30-60 seconds.

### Cold Start Delays (Render Free Tier)
- **Notice**: Free tier Render web services spin down after 15 minutes of inactivity. The first request may take ~30-50 seconds to initialize. For production zero-latency guarantees, upgrade to the Render Starter plan ($7/mo).

### Repository Isolation Guard Failure on Build
- **Cause**: A cross-project dependency or prohibited keyword was introduced.
- **Fix**: Run `npm run verify:isolation` locally to pinpoint the offending file or reference. POWER HOUSE enforces permanent zero-coupling isolation.
