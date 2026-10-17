/**
 * POWER HOUSE API Client Layer
 * 
 * Configurable REST client for communicating with the FastAPI backend.
 * Provides resilient fallbacks if the backend server is temporarily unreachable.
 */

const rawApiUrl = import.meta.env.VITE_API_URL;
const isProd = import.meta.env.PROD;

function resolveApiBaseUrl() {
  if (rawApiUrl && typeof rawApiUrl === 'string' && rawApiUrl.trim().length > 0) {
    const trimmed = rawApiUrl.trim().replace(/\/$/, '');
    if (isProd && (trimmed.includes('127.0.0.1') || trimmed.includes('localhost'))) {
      console.warn(
        '[POWER HOUSE Configuration Warning] Production build is targeting a localhost API URL. ' +
        'Please set VITE_API_URL to your deployed Render service (e.g. https://powerhouse-api.onrender.com/api/v1) in Netlify.'
      );
    }
    return trimmed;
  }

  if (isProd) {
    console.error(
      '[POWER HOUSE Production Error] VITE_API_URL is not configured for this production deployment. ' +
      'Requests cannot be routed to a local development server. Configure VITE_API_URL in Netlify environment variables.'
    );
    return '';
  }

  return 'http://127.0.0.1:8000/api/v1';
}

const API_BASE_URL = resolveApiBaseUrl();

class ApiClient {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
    this.token = typeof window !== 'undefined' ? window.localStorage.getItem('ph_token') : null;
  }

  setToken(token) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        window.localStorage.setItem('ph_token', token);
      } else {
        window.localStorage.removeItem('ph_token');
      }
    }
  }

  getToken() {
    if (!this.token && typeof window !== 'undefined') {
      this.token = window.localStorage.getItem('ph_token');
    }
    return this.token;
  }

  clearToken() {
    this.setToken(null);
  }

  async request(endpoint, options = {}) {
    if (!this.baseUrl) {
      const configErr = new Error(
        'Production Configuration Error: Backend API URL (VITE_API_URL) is not configured. ' +
        'Please set VITE_API_URL in your Netlify dashboard to your deployed Render API (e.g. https://your-api.onrender.com/api/v1).'
      );
      configErr.isConfigurationError = true;
      throw configErr;
    }
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const token = this.getToken();
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
    } catch (fetchError) {
      // Genuine network failure: backend server offline, connection refused, DNS failure
      const netErr = new Error('Authentication service is unavailable. Please check your connection.');
      netErr.isNetworkError = true;
      netErr.originalError = fetchError;
      throw netErr;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let message = '';
      if (typeof errorData.detail === 'string') {
        message = errorData.detail;
      } else if (Array.isArray(errorData.detail)) {
        message = errorData.detail
          .map((d) => d.msg || `${d.loc ? d.loc.slice(1).join('.') : 'field'}: invalid value`)
          .join(', ');
      } else if (errorData.message) {
        message = errorData.message;
      } else {
        message = `API error (${response.status}): ${response.statusText}`;
      }

      const httpError = new Error(message);
      httpError.status = response.status;
      httpError.statusText = response.statusText;
      httpError.errorData = errorData;
      httpError.isNetworkError = false;
      throw httpError;
    }

    return await response.json();
  }

  // Health check
  async getHealth() {
    if (!this.baseUrl) {
      throw new Error('Production Configuration Error: Backend API URL (VITE_API_URL) is not configured.');
    }
    const healthUrl = this.baseUrl.replace(/\/api\/v1$/, '') + '/health';
    const res = await fetch(healthUrl);
    if (!res.ok) {
      throw new Error(`Health check failed with status ${res.status}`);
    }
    return await res.json();
  }

  // Authentication Endpoints
  async signup(data) {
    const res = await this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res?.access_token) {
      this.setToken(res.access_token);
    }
    return res;
  }

  async login(data) {
    const res = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res?.access_token) {
      this.setToken(res.access_token);
    }
    return res;
  }

  async getMe() {
    return this.request('/auth/me');
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch (e) {
      // Proceed with local logout regardless of network
    } finally {
      this.clearToken();
    }
  }

  // Business Profile Endpoints
  async getBusinessProfiles() {
    return this.request('/business-profile');
  }

  async getBusinessProfile(id) {
    return this.request(`/business-profile/${id}`);
  }

  async createBusinessProfile(data) {
    return this.request('/business-profile', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBusinessProfile(id, data) {
    return this.request(`/business-profile/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Business Analysis Endpoints
  async runAnalysis(profileId) {
    return this.request(`/business-analysis/${profileId}`, {
      method: 'POST',
    });
  }

  async getLatestAnalysis(profileId) {
    return this.request(`/business-analysis/${profileId}/latest`);
  }

  async getAnalysisById(analysisId) {
    return this.request(`/business-analysis/report/${analysisId}`);
  }

  // Approvals Endpoints
  async getApprovals(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/approvals${query ? `?${query}` : ''}`);
  }

  async updateApproval(id, data) {
    return this.request(`/approvals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Tasks Endpoints
  async getTasks(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/tasks${query ? `?${query}` : ''}`);
  }

  async createTask(data) {
    return this.request('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTask(id, data) {
    return this.request(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async completeTask(id) {
    return this.request(`/tasks/${id}/complete`, {
      method: 'PATCH',
    });
  }

  // Documents Endpoints
  async getDocuments(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/documents${query ? `?${query}` : ''}`);
  }

  async getDocument(id) {
    return this.request(`/documents/${id}`);
  }

  async uploadDocument(formData) {
    return this.request('/documents/upload', {
      method: 'POST',
      body: formData,
    });
  }

  async getDocumentIntelligence(id) {
    return this.request(`/documents/${id}/intelligence`);
  }

  async deleteDocument(id) {
    return this.request(`/documents/${id}`, {
      method: 'DELETE',
    });
  }

  getDocumentFileUrl(id) {
    return `${this.baseUrl}/documents/${id}/file`;
  }

  async downloadDocumentFile(id, filename = 'document.pdf') {
    const token = this.getToken();
    const url = this.getDocumentFileUrl(id);
    const response = await fetch(url, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download document (${response.status})`);
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(downloadUrl);
    document.body.removeChild(a);
  }

  async createDocument(data) {
    return this.request('/documents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Applications Endpoints
  async getApplications(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/applications${query ? `?${query}` : ''}`);
  }

  async createApplication(data) {
    return this.request('/applications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Schemes Endpoints
  async getSchemes(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/schemes${query ? `?${query}` : ''}`);
  }

  // Alerts Endpoints
  async getAlerts(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/alerts${query ? `?${query}` : ''}`);
  }

  async markAlertAsRead(id) {
    return this.request(`/alerts/${id}/read`, {
      method: 'PATCH',
    });
  }

  async markAllAlertsAsRead(businessProfileId = null) {
    const query = businessProfileId ? `?business_profile_id=${businessProfileId}` : '';
    return this.request(`/alerts/read-all${query}`, {
      method: 'PATCH',
    });
  }

  // Hybrid Regulatory Vector RAG Endpoints
  async queryRag(businessProfileId, question, topK = 5) {
    return this.request('/rag/query', {
      method: 'POST',
      body: JSON.stringify({
        business_profile_id: businessProfileId,
        question: question,
        top_k: topK,
      }),
    });
  }

  async getRagSources() {
    return this.request('/rag/sources');
  }

  // Green Industry Flow AI Endpoints
  async getGreenSummary(businessProfileId) {
    return this.request(`/green/summary?business_profile_id=${businessProfileId}`);
  }

  async getGreenOpportunities(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/green/opportunities?${query}`);
  }

  async getGreenOpportunity(id, businessProfileId) {
    return this.request(`/green/opportunities/${id}?business_profile_id=${businessProfileId}`);
  }

  async getGreenOpportunityEvidence(id, businessProfileId) {
    return this.request(`/green/opportunities/${id}/evidence?business_profile_id=${businessProfileId}`);
  }

  async getGreenOpportunityTrace(id, businessProfileId) {
    return this.request(`/green/opportunities/${id}/trace?business_profile_id=${businessProfileId}`);
  }

  async runGreenAgent(businessProfileId) {
    return this.request(`/green/agent/run?business_profile_id=${businessProfileId}`, {
      method: 'POST',
    });
  }

  async createGreenProposal(opportunityId, businessProfileId) {
    return this.request(`/green/opportunities/${opportunityId}/proposal?business_profile_id=${businessProfileId}`, {
      method: 'POST',
    });
  }

  async getGreenScore(businessProfileId) {
    return this.request(`/green/score?business_profile_id=${businessProfileId}`);
  }

  async getGreenImpact(businessProfileId) {
    return this.request(`/green/impact?business_profile_id=${businessProfileId}`);
  }

  async verifyGreenImpact(impactId, businessProfileId, data) {
    return this.request(`/green/impact/${impactId}/verify?business_profile_id=${businessProfileId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getGreenAgentRuns(businessProfileId) {
    return this.request(`/green/agent-runs?business_profile_id=${businessProfileId}`);
  }

  async getEmissionFactors() {
    return this.request('/green/emission-factors');
  }

  async seedGreenDemoData(businessProfileId) {
    return this.request(`/green/demo/seed?business_profile_id=${businessProfileId}`, {
      method: 'POST',
    });
  }

  // ---------------------------------------------------------------------------
  // SUPPLY CHAIN RESILIENCE METHODS
  // ---------------------------------------------------------------------------
  async getSupplyChainSummary(businessProfileId) {
    return this.request(`/supply-chain/summary?business_profile_id=${businessProfileId}`);
  }

  async getSuppliers(businessProfileId) {
    return this.request(`/supply-chain/suppliers?business_profile_id=${businessProfileId}`);
  }

  async createSupplier(businessProfileId, supplierData) {
    return this.request(`/supply-chain/suppliers?business_profile_id=${businessProfileId}`, {
      method: 'POST',
      body: JSON.stringify(supplierData),
    });
  }

  async getSupplyItems(businessProfileId) {
    return this.request(`/supply-chain/items?business_profile_id=${businessProfileId}`);
  }

  async getSupplyRisks(businessProfileId, status = null) {
    const url = status
      ? `/supply-chain/risks?business_profile_id=${businessProfileId}&status=${encodeURIComponent(status)}`
      : `/supply-chain/risks?business_profile_id=${businessProfileId}`;
    return this.request(url);
  }

  async getRiskDetail(businessProfileId, riskId) {
    return this.request(`/supply-chain/risks/${riskId}?business_profile_id=${businessProfileId}`);
  }

  async getRiskEvidence(businessProfileId, riskId) {
    return this.request(`/supply-chain/evidence/${riskId}?business_profile_id=${businessProfileId}`);
  }

  async runSupplyChainAnalysis(businessProfileId) {
    return this.request(`/supply-chain/analyze?business_profile_id=${businessProfileId}`, {
      method: 'POST',
    });
  }

  async createSupplyChainProposal(riskId, businessProfileId) {
    return this.request(`/supply-chain/proposal/${riskId}?business_profile_id=${businessProfileId}`, {
      method: 'POST',
    });
  }

  async seedDemoSupplyChain(businessProfileId) {
    return this.request(`/supply-chain/demo/seed?business_profile_id=${businessProfileId}`, {
      method: 'POST',
    });
  }

  async cleanupDemoSupplyChain(businessProfileId) {
    return this.request(`/supply-chain/demo/cleanup?business_profile_id=${businessProfileId}`, {
      method: 'DELETE',
    });
  }

  // ---------------------------------------------------------------------------
  // SAP RESILIENT SUPPLY CHAIN METHODS
  // ---------------------------------------------------------------------------
  async getSAPAdapterStatus(businessProfileId) {
    return this.request(`/supply-chain/status?business_profile_id=${businessProfileId}`);
  }

  async getDisruptions(businessProfileId) {
    return this.request(`/supply-chain/disruptions?business_profile_id=${businessProfileId}`);
  }

  async simulateDisruption(businessProfileId, data = {}) {
    return this.request(`/supply-chain/disruptions/simulate?business_profile_id=${businessProfileId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async generateScenarios(businessProfileId, disruptionId = null) {
    const query = disruptionId ? `&disruption_id=${encodeURIComponent(disruptionId)}` : '';
    return this.request(`/supply-chain/scenarios/generate?business_profile_id=${businessProfileId}${query}`, {
      method: 'POST',
    });
  }

  async auditCandidateSupplier(businessProfileId, supplierCode = 'VEND-SAP-B02') {
    return this.request(`/supply-chain/compliance/audit?business_profile_id=${businessProfileId}&supplier_code=${encodeURIComponent(supplierCode)}`, {
      method: 'POST',
    });
  }

  async submitHumanDecision(businessProfileId, decisionData) {
    return this.request(`/supply-chain/decisions?business_profile_id=${businessProfileId}`, {
      method: 'POST',
      body: JSON.stringify(decisionData),
    });
  }

  async getHumanDecisions(businessProfileId) {
    return this.request(`/supply-chain/decisions?business_profile_id=${businessProfileId}`);
  }

  // Operational Supply Chain Methods (Shipments, Checkpoints, Exceptions, Prepare vs Execute)
  async getShipments(businessProfileId) {
    return this.request(`/supply-chain/shipments?business_profile_id=${businessProfileId}`);
  }

  async getShipment(shipmentId, businessProfileId) {
    return this.request(`/supply-chain/shipments/${shipmentId}?business_profile_id=${businessProfileId}`);
  }

  async getOperationalExceptions(businessProfileId) {
    return this.request(`/supply-chain/exceptions?business_profile_id=${businessProfileId}`);
  }

  async simulateShipmentDelay(businessProfileId) {
    return this.request(`/supply-chain/shipments/simulate-delay?business_profile_id=${businessProfileId}`, {
      method: 'POST',
    });
  }

  async confirmShipmentAction(shipmentId, businessProfileId, actionData) {
    return this.request(`/supply-chain/shipments/${shipmentId}/confirm-action?business_profile_id=${businessProfileId}`, {
      method: 'POST',
      body: JSON.stringify(actionData),
    });
  }

  // ---------------------------------------------------------------------------
  // WORKFORCE INTELLIGENCE METHODS
  // ---------------------------------------------------------------------------
  async getWorkforceSummary(businessProfileId) {
    return this.request(`/workforce/summary?business_profile_id=${businessProfileId}`);
  }

  async getEmployees(businessProfileId) {
    return this.request(`/workforce/employees?business_profile_id=${businessProfileId}`);
  }

  async createEmployee(businessProfileId, employeeData) {
    return this.request(`/workforce/employees?business_profile_id=${businessProfileId}`, {
      method: 'POST',
      body: JSON.stringify(employeeData),
    });
  }

  async getRoles(businessProfileId) {
    return this.request(`/workforce/roles?business_profile_id=${businessProfileId}`);
  }

  async createRole(businessProfileId, roleData) {
    return this.request(`/workforce/roles?business_profile_id=${businessProfileId}`, {
      method: 'POST',
      body: JSON.stringify(roleData),
    });
  }

  async getSkillGaps(businessProfileId) {
    return this.request(`/workforce/skill-gaps?business_profile_id=${businessProfileId}`);
  }

  async getLearningPaths(businessProfileId) {
    return this.request(`/workforce/learning-paths?business_profile_id=${businessProfileId}`);
  }

  async getSkillGapEvidence(businessProfileId, gapId) {
    return this.request(`/workforce/evidence/${gapId}?business_profile_id=${businessProfileId}`);
  }

  async runWorkforceAnalysis(businessProfileId) {
    return this.request(`/workforce/analyze?business_profile_id=${businessProfileId}`, {
      method: 'POST',
    });
  }

  async createWorkforceProposal(gapId, businessProfileId) {
    return this.request(`/workforce/proposal/${gapId}?business_profile_id=${businessProfileId}`, {
      method: 'POST',
    });
  }

  async seedDemoWorkforce(businessProfileId) {
    return this.request(`/workforce/demo/seed?business_profile_id=${businessProfileId}`, {
      method: 'POST',
    });
  }

  async cleanupDemoWorkforce(businessProfileId) {
    return this.request(`/workforce/demo/cleanup?business_profile_id=${businessProfileId}`, {
      method: 'DELETE',
    });
  }
}

export const apiClient = new ApiClient();
export default apiClient;


