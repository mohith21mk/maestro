import React, { useState, useEffect, useCallback } from 'react';
import {
  Truck,
  ShieldAlert,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  PackageCheck,
  Loader2,
  Server,
  AlertOctagon,
  Check,
  X,
  Sliders,
  ClipboardList,
  ShieldCheck,
  Zap,
  Info,
  MapPin,
  Navigation,
  Clock,
  Activity,
  Send,
  Radio,
} from 'lucide-react';
import Button from '../components/ui/Button';
import { useBusinessAnalysis } from '../context/BusinessAnalysisContext';
import { useAuth } from '../context/AuthContext';
import apiClient from '../services/apiClient';
import WhySupplyRiskModal from '../components/modals/WhySupplyRiskModal';

export default function SupplyChainPage({ showToast, _onNavigate, _setModalState }) {
  const { activeBusiness } = useAuth();
  const { backendProfileId } = useBusinessAnalysis();
  const profileId = activeBusiness?.id || backendProfileId;

  // Navigation tab states
  // 'overview' | 'exceptions' | 'shipments' | 'tracking' | 'disruption' | 'planner' | 'compliance' | 'suppliers' | 'items' | 'audit'
  const [activeTab, setActiveTab] = useState('overview');

  // Loading and action states
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [planningScenarios, setPlanningScenarios] = useState(false);
  const [auditingCompliance, setAuditingCompliance] = useState(false);
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Core telemetry state
  const [summary, setSummary] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [risks, setRisks] = useState([]);
  const [selectedRisk, setSelectedRisk] = useState(null);
  const [whyRiskModalOpen, setWhyRiskModalOpen] = useState(false);

  // SAP Readiness & Disruption states
  const [sapStatus, setSapStatus] = useState(null);
  const [disruptions, setDisruptions] = useState([]);
  const [activeDisruption, setActiveDisruption] = useState(null);
  const [scenarioPlan, setScenarioPlan] = useState(null);
  const [complianceAudit, setComplianceAudit] = useState(null);
  const [decisions, setDecisions] = useState([]);

  // Operational Supply Chain state (Shipments, Checkpoints, Exceptions, Prepare vs Execute)
  const [shipments, setShipments] = useState([]);
  const [activeShipment, setActiveShipment] = useState(null);
  const [operationalExceptions, setOperationalExceptions] = useState([]);
  const [confirmActionModalOpen, setConfirmActionModalOpen] = useState(false);
  const [actionExecutionLoading, setActionExecutionLoading] = useState(false);
  const [carrierInstructions, setCarrierInstructions] = useState(
    'Initiate multi-modal road transfer for 300 MT cold-rolled steel coils via Western Carrier Express to Pune Chassis Bay.'
  );
  const [dispatchReference, setDispatchReference] = useState('DISPATCH-EXP-7721');
  const [actionTypeToExecute, setActionTypeToExecute] = useState('EXECUTE_REROUTE');

  // Human-in-the-Loop Decision Modal state
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [selectedScenarioForAction, setSelectedScenarioForAction] = useState(null);
  const [decisionActionType, setDecisionActionType] = useState('APPROVED'); // APPROVED | REJECTED | MODIFIED
  const [decisionNotes, setDecisionNotes] = useState('');
  const [modifiedQuantity, setModifiedQuantity] = useState(300);
  const [requireImmediatePhysicalAudit, setRequireImmediatePhysicalAudit] = useState(true);

  // Load telemetry data from backend
  const loadData = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      const [sumRes, supRes, itemRes, riskRes, sapRes, disruptRes, decRes, shpRes, excRes] = await Promise.allSettled([
        apiClient.getSupplyChainSummary(profileId),
        apiClient.getSuppliers(profileId),
        apiClient.getSupplyItems(profileId),
        apiClient.getSupplyRisks(profileId),
        apiClient.getSAPAdapterStatus(profileId),
        apiClient.getDisruptions(profileId),
        apiClient.getHumanDecisions(profileId),
        apiClient.getShipments(profileId),
        apiClient.getOperationalExceptions(profileId),
      ]);

      if (sumRes.status === 'fulfilled') setSummary(sumRes.value);
      if (supRes.status === 'fulfilled') setSuppliers(supRes.value || []);
      if (itemRes.status === 'fulfilled') setItems(itemRes.value || []);
      if (riskRes.status === 'fulfilled') setRisks(riskRes.value || []);
      if (sapRes.status === 'fulfilled') setSapStatus(sapRes.value);
      if (disruptRes.status === 'fulfilled') {
        const disps = disruptRes.value || [];
        setDisruptions(disps);
        if (disps.length > 0) {
          setActiveDisruption(disps[0]);
        }
      }
      if (decRes.status === 'fulfilled') setDecisions(decRes.value || []);
      if (shpRes.status === 'fulfilled') {
        const shps = shpRes.value || [];
        setShipments(shps);
        if (shps.length > 0) {
          setActiveShipment(shps[0]);
        }
      }
      if (excRes.status === 'fulfilled') {
        setOperationalExceptions(excRes.value || []);
      }
    } catch {
      if (showToast) showToast('Could not load complete supply chain telemetry.');
    } finally {
      setLoading(false);
    }
  }, [profileId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Execute staged operational action (PREPARE_REROUTE -> REROUTE_EXECUTED)
  const handleConfirmActionExecution = async () => {
    if (!profileId || !activeShipment) return;
    setActionExecutionLoading(true);
    try {
      const res = await apiClient.confirmShipmentAction(activeShipment.id, profileId, {
        action_type: actionTypeToExecute,
        carrier_instructions: carrierInstructions,
        dispatch_reference: dispatchReference,
      });
      setConfirmActionModalOpen(false);
      if (showToast) {
        showToast(
          `Operational Action ${actionTypeToExecute} confirmed. Carrier manifest #${res.audit_log_id ? res.audit_log_id.slice(0, 8) : 'AUDIT'} logged.`
        );
      }
      await loadData();
    } catch {
      if (showToast) showToast('Failed to execute carrier action.');
    } finally {
      setActionExecutionLoading(false);
    }
  };

  // Run initial or refreshed scenario planning
  const handleGenerateScenarios = async (disruptId = null) => {
    if (!profileId) return;
    setPlanningScenarios(true);
    try {
      const targetDisruptId = disruptId || activeDisruption?.id || null;
      const planRes = await apiClient.generateScenarios(profileId, targetDisruptId);
      setScenarioPlan(planRes);
      if (planRes?.compliance_audit) {
        setComplianceAudit(planRes.compliance_audit);
      }
      setActiveTab('planner');
      if (showToast) showToast('Generated 4 deterministic response scenarios via 3-Agent Orchestration.');
    } catch {
      if (showToast) showToast('Failed to generate scenario plans.');
    } finally {
      setPlanningScenarios(false);
    }
  };

  // Simulate Core Demo Disruption: Supplier A 5-day delay for Steel Sheet
  const handleSimulateDisruption = async () => {
    if (!profileId) return;
    setSimulating(true);
    try {
      const simPayload = {
        title: 'Supplier A Shipment Delayed 5 Days (Transit Bottleneck)',
        delay_days: 5,
        required_quantity: 500,
        current_inventory: 200,
        material_name: '[DEMO DATA] Steel Sheet (Grade 304, Cold Rolled)',
        supplier_name: '[DEMO DATA] Bharat Heavy Steel Forge Ltd (Supplier A)',
        shipment_id: 'SHP-SAP-9021',
      };
      const newDisrupt = await apiClient.simulateDisruption(profileId, simPayload);
      setActiveDisruption(newDisrupt);
      setDisruptions((prev) => [newDisrupt, ...prev.filter((d) => d.id !== newDisrupt.id)]);
      if (showToast) showToast('Disruption sensed: Supplier A delayed 5 days. Net shortage = 300 units.');
      // Auto generate scenario plans for this disruption
      await handleGenerateScenarios(newDisrupt.id);
    } catch {
      if (showToast) showToast('Failed to simulate disruption.');
    } finally {
      setSimulating(false);
    }
  };

  // Run Compliance & Audit Agent on Supplier B
  const handleAuditSupplierB = async () => {
    if (!profileId) return;
    setAuditingCompliance(true);
    try {
      const auditRes = await apiClient.auditCandidateSupplier(profileId, 'VEND-SAP-B02');
      setComplianceAudit(auditRes);
      setActiveTab('compliance');
      if (showToast) showToast('Compliance Agent flagged missing Vendor Registration Approval for Supplier B.');
    } catch {
      if (showToast) showToast('Failed to complete compliance audit.');
    } finally {
      setAuditingCompliance(false);
    }
  };

  // Open Decision Gate Modal
  const handleOpenDecisionModal = (scenario, defaultAction = 'APPROVED') => {
    setSelectedScenarioForAction(scenario);
    setDecisionActionType(defaultAction);
    setDecisionNotes(
      defaultAction === 'APPROVED'
        ? 'Approved 300 units procurement from Supplier B. QA lead instructed to verify physical vendor registration certificate.'
        : defaultAction === 'REJECTED'
        ? 'Rejected due to strict corporate vendor onboarding policy requiring pre-cleared registration.'
        : 'Modified parameters: requested split shipment with accelerated 48h physical documentation review.'
    );
    setDecisionModalOpen(true);
  };

  // Submit Human Decision
  const handleSubmitHumanDecision = async () => {
    if (!profileId || !selectedScenarioForAction) return;
    setSubmittingDecision(true);
    try {
      const decisionPayload = {
        scenario_id: selectedScenarioForAction.scenario_id,
        scenario_title: selectedScenarioForAction.title,
        decision: decisionActionType,
        decision_notes: decisionNotes,
        disruption_id: activeDisruption?.id || null,
        modification_details:
          decisionActionType === 'MODIFIED'
            ? {
                adjusted_quantity: parseInt(modifiedQuantity, 10) || 300,
                physical_audit_required: requireImmediatePhysicalAudit,
              }
            : null,
      };

      const savedDecision = await apiClient.submitHumanDecision(profileId, decisionPayload);
      setDecisions((prev) => [savedDecision, ...prev]);

      if (decisionActionType === 'APPROVED' || decisionActionType === 'MODIFIED') {
        if (activeDisruption) {
          setActiveDisruption((prev) => (prev ? { ...prev, status: 'MITIGATED' } : null));
        }
      }

      setDecisionModalOpen(false);
      setActiveTab('audit');
      if (showToast) {
        showToast(
          `Decision [${decisionActionType}] recorded into immutable AuditLog #${savedDecision.audit_log_id ? savedDecision.audit_log_id.slice(0, 8) : 'AUDIT'}.`
        );
      }
      await loadData();
    } catch {
      if (showToast) showToast('Failed to submit decision.');
    } finally {
      setSubmittingDecision(false);
    }
  };

  // Legacy actions
  const handleRunAnalysis = async () => {
    if (!profileId) return;
    setAnalyzing(true);
    try {
      await apiClient.runSupplyChainAnalysis(profileId);
      if (showToast) showToast('Evaluated active vendor network.');
      await loadData();
    } catch {
      if (showToast) showToast('Analysis encountered an issue.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSeedDemo = async () => {
    if (!profileId) return;
    try {
      await apiClient.seedDemoSupplyChain(profileId);
      if (showToast) showToast('Loaded verified [DEMO DATA] supplier network.');
      await loadData();
    } catch {
      if (showToast) showToast('Failed to seed demo supply chain data.');
    }
  };

  const handleCleanupDemo = async () => {
    if (!profileId) return;
    try {
      await apiClient.cleanupDemoSupplyChain(profileId);
      if (showToast) showToast('Cleaned up synthetic demo supplier records.');
      await loadData();
    } catch {
      if (showToast) showToast('Failed to clean demo data.');
    }
  };

  const resilienceScore = summary?.overall_resilience_score ?? 68;
  const ratingBand = summary?.resilience_rating ?? 'Moderate';
  const hasDemo = suppliers.some((s) => s.is_demo) || items.some((i) => i.is_demo) || disruptions.some((d) => d.is_demo);

  return (
    <div className="space-y-6 font-sans antialiased text-slate-100">
      {/* ===================================================================== */}
      {/* 1. TOP EXECUTIVE BANNER (SAP-Ready & Demo Data Indicators)             */}
      {/* ===================================================================== */}
      <div className="bg-[#111827] rounded-xl border border-[#1E293B] p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-900/30 text-amber-400 border border-amber-800/50 flex items-center justify-center shrink-0 shadow-lg">
            <Truck className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-100 tracking-tight">Supply Chain Resilience</h2>
              <span className="text-xs uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-blue-950/70 text-blue-300 border border-blue-800/60 flex items-center gap-1">
                <Server className="w-3 h-3 text-blue-400" />
                <span>SAP-Ready Architecture</span>
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700 font-mono">
                [DEMO DATA PROVIDER]
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Deterministic disruption sensing, multi-scenario trade-off evaluation, and statutory compliance auditing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSimulateDisruption}
            disabled={simulating}
            className="text-xs border-amber-600/50 text-amber-300 hover:bg-amber-950/40 hover:text-amber-200 flex items-center gap-1.5"
          >
            {simulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-400" />}
            <span>Simulate Disruption Demo</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={hasDemo ? handleCleanupDemo : handleSeedDemo}
            className="text-xs border-[#1E293B] text-slate-300 hover:text-white"
          >
            {hasDemo ? 'Reset Demo Network' : 'Seed [DEMO DATA]'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleRunAnalysis}
            disabled={analyzing}
            className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold"
          >
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
            <span>Analyze Resilience</span>
          </Button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* DATA FRESHNESS & ACTION PREPARATION HERO BANNER                       */}
      {/* ===================================================================== */}
      <div className="bg-[#0f172a] rounded-xl border border-blue-900/50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-blue-400 font-semibold">
            <Activity className="w-4 h-4 text-blue-400" />
            <span>Data Freshness:</span>
          </span>
          <span className="text-slate-300">
            Last updated: <strong>4 min ago</strong> (Telemetry Ping Sync)
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-300">
            Source: <strong className="text-blue-300">SAP S/4HANA OData / Carrier Telemetry Engine</strong>
          </span>
          <span className="text-slate-600">|</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300 border border-amber-800 text-xs font-mono font-bold">
            Status: Simulated Telemetry [DEMO DATA]
          </span>
        </div>

        {activeShipment?.action_state && activeShipment.action_state !== 'NORMAL' && (
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${
              activeShipment.action_state.includes('EXECUTED')
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                : 'bg-amber-950 text-amber-300 border border-amber-700 animate-pulse'
            }`}>
              <Truck className="w-3 h-3" />
              <span>Action State: {activeShipment.action_state}</span>
            </span>
            {activeShipment.action_state === 'PREPARE_REROUTE' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setActionTypeToExecute('EXECUTE_REROUTE');
                  setConfirmActionModalOpen(true);
                }}
                className="text-xs min-h-[32px] h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1"
              >
                <Send className="w-3 h-3" />
                <span>Execute Carrier Reroute</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 2. NAVIGATION TABS (All Functional & Operational Areas)                */}
      {/* ===================================================================== */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto scrollbar-none">
        {[
          { id: 'overview', label: 'Resilience Overview' },
          {
            id: 'exceptions',
            label: `Operational Exceptions (${operationalExceptions.length})`,
            badge: operationalExceptions.some((e) => e.status === 'ACTIVE') ? '5-PART ANALYSIS' : null,
          },
          { id: 'shipments', label: `Shipments & Lifecycle (${shipments.length})` },
          { id: 'tracking', label: 'Corridor Tracking' },
          { id: 'disruption', label: `Disruption Center (${disruptions.length})`, badge: disruptions.length > 0 ? 'CRITICAL' : null },
          { id: 'planner', label: 'Scenario Planner (Primary Agent)', highlight: true },
          { id: 'compliance', label: 'Compliance & Audit Check' },
          { id: 'suppliers', label: `Supplier Registry (${suppliers.length})` },
          { id: 'items', label: `Materials & Inventory (${items.length})` },
          { id: 'audit', label: `Audit Trail (${decisions.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'bg-amber-950/70 text-amber-300 border border-amber-800/80 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#141C2B]'
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge && (
              <span className="text-xs px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800 font-bold">
                {tab.badge}
              </span>
            )}
            {tab.highlight && activeTab !== tab.id && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-16 flex flex-col items-center justify-center space-y-3 bg-[#111827] rounded-xl border border-[#1E293B]">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
          <span className="text-xs text-slate-400 font-medium">Loading SAP Resilient Supply Chain telemetry...</span>
        </div>
      ) : (
        <>
          {/* ================================================================= */}
          {/* TAB 1: SUPPLY CHAIN OVERVIEW                                      */}
          {/* ================================================================= */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Active Disruption Alert Hero if disruption exists */}
              {activeDisruption && (
                <div className="p-5 rounded-xl bg-rose-950/40 border border-rose-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-900/60 text-rose-300 border border-rose-700 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertOctagon className="w-5 h-5 text-rose-400" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs uppercase font-extrabold tracking-wider px-2 py-0.5 rounded bg-rose-900/80 text-rose-200 border border-rose-700">
                          ACTIVE DISRUPTION DETECTED
                        </span>
                        <span className="text-xs text-rose-300 font-bold">
                          {activeDisruption.title}
                        </span>
                        <span className="text-xs text-amber-400 font-mono">[DEMO DATA]</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        Shipment <strong>{activeDisruption.shipment_id}</strong> delayed by {activeDisruption.delay_days} days.
                        Required: <strong>{activeDisruption.affected_quantity} units</strong> | Current Stock: <strong>{activeDisruption.current_inventory} units</strong> | Potential Shortage: <strong className="text-rose-400 font-mono font-bold">{activeDisruption.potential_shortage} units</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleGenerateScenarios(activeDisruption.id)}
                      disabled={planningScenarios}
                      className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      {planningScenarios ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sliders className="w-3.5 h-3.5" />}
                      <span>Launch Scenario Planner</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-5 rounded-xl bg-[#111827] border border-[#1E293B] space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Resilience Index
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-white">{resilienceScore}</span>
                    <span className="text-xs font-bold text-amber-400">/ 100</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    Status: <strong className="text-amber-300">{ratingBand}</strong>
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-[#111827] border border-[#1E293B] space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Active Disruptions
                  </span>
                  <div className="text-3xl font-black text-rose-400">
                    {disruptions.filter((d) => d.status === 'ACTIVE').length}
                  </div>
                  <div className="text-xs text-slate-400">
                    Immediate production exposure
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-[#111827] border border-[#1E293B] space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Single-Source Vulnerabilities
                  </span>
                  <div className="text-3xl font-black text-amber-400">
                    {summary?.single_source_count ?? 0}
                  </div>
                  <div className="text-xs text-slate-400">
                    Critical items with 0 backup sources
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-[#111827] border border-[#1E293B] space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Decisions Recorded
                  </span>
                  <div className="text-3xl font-black text-emerald-400">
                    {decisions.length}
                  </div>
                  <div className="text-xs text-slate-400">
                    Human-in-the-loop audit trace
                  </div>
                </div>
              </div>

              {/* SAP Architecture Spec Callout */}
              <div className="p-5 rounded-xl bg-[#141C2B] border border-[#1E293B] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Server className="w-5 h-5 text-blue-400 shrink-0" />
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-200">
                      SAP Clean Core Architecture Specification
                    </span>
                    <p className="text-xs text-slate-400">
                      Decoupled adapter pattern separating business scenario calculation from SAP BTP / S/4HANA OData service layer.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono">
                    Provider: {sapStatus?.provider_name || 'DEMO_DATA_PROVIDER'}
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                    Connection: {sapStatus?.connection_status || 'Demo Mode'}
                  </span>
                </div>
              </div>

              {/* Priority Vulnerabilities Table */}
              <div className="p-5 rounded-xl bg-[#111827] border border-[#1E293B] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                      Priority Supply Continuity Vulnerabilities
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400">
                    {risks.length} vulnerabilities flagged
                  </span>
                </div>

                {risks.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No active supply chain vulnerabilities detected. Click "Simulate Disruption Demo" to test real scenarios.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {risks.slice(0, 3).map((r) => (
                      <div
                        key={r.id}
                        className="p-4 rounded-xl bg-[#141C2B] border border-[#1E293B] flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 max-w-xl">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-100 text-xs">{r.title}</span>
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                              r.priority === 'Critical'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}>
                              {r.priority}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">{r.category}</span>
                            {r.is_demo && <span className="text-xs text-amber-400 font-mono">[DEMO DATA]</span>}
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">{r.issue}</p>
                          <p className="text-xs text-slate-400">
                            Action: <strong className="text-amber-300">{r.recommended_action}</strong>
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSelectedRisk(r);
                              setWhyRiskModalOpen(true);
                            }}
                            className="text-xs"
                          >
                            Why Risk?
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB: OPERATIONAL EXCEPTIONS (5-Part Analytical Decomposition)     */}
          {/* ================================================================= */}
          {activeTab === 'exceptions' && (
            <div className="p-6 rounded-xl bg-[#111827] border border-[#1E293B] space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                      <span>Operational Exceptions &amp; Checkpoint Telemetry</span>
                    </h3>
                    <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-bold">
                      MANDATORY 5-PART ANALYSIS
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Strictly separates <strong>Observed Fact</strong> &rarr; <strong>Evidence</strong> &rarr; <strong>Assumption</strong> &rarr; <strong>Risk</strong> &rarr; <strong>Recommendation</strong> to guarantee operational explainability.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSimulateDisruption}
                    disabled={simulating}
                    className="text-xs border-amber-700/60 text-amber-300 hover:bg-amber-950/40 flex items-center gap-1.5"
                  >
                    {simulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                    <span>Re-evaluate Checkpoints</span>
                  </Button>
                </div>
              </div>

              {operationalExceptions.length === 0 ? (
                <div className="p-12 text-center space-y-2 bg-[#141C2B] rounded-xl border border-slate-800">
                  <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-xs text-slate-300 font-semibold">All shipment checkpoints operational within SLA.</p>
                  <p className="text-xs text-slate-500">
                    Click "Simulate Disruption Demo" to induce a 5-day siding hold and generate operational exception telemetry.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {operationalExceptions.map((exc) => (
                    <div
                      key={exc.id}
                      className="p-5 rounded-xl bg-[#141C2B] border border-amber-900/60 shadow-lg space-y-5"
                    >
                      {/* Exception Header */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                            {exc.exception_type}
                          </span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                            SEVERITY: {exc.severity}
                          </span>
                          <span className="text-xs font-mono font-bold text-white">
                            Shipment: SHP-SAP-9021
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            Trans-India Freight Logistics (TIFL-882)
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                            exc.action_state?.includes('EXECUTED')
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : exc.action_state === 'PREPARE_REROUTE'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                              : 'bg-slate-800 text-slate-300'
                          }`}>
                            Action State: {exc.action_state || 'NORMAL'}
                          </span>
                          {exc.action_state === 'PREPARE_REROUTE' && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                setActionTypeToExecute('EXECUTE_REROUTE');
                                setConfirmActionModalOpen(true);
                              }}
                              className="text-xs min-h-[32px] h-8 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1"
                            >
                              <Send className="w-3 h-3" />
                              <span>Execute Reroute</span>
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* THE 5-PART ANALYTICAL DECOMPOSITION */}
                      <div className="grid grid-cols-1 gap-4">
                        {/* 1. OBSERVED FACT */}
                        <div className="p-4 rounded-xl bg-[#111827] border border-blue-900/40 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                            <span className="w-5 h-5 rounded-full bg-blue-950 text-blue-300 flex items-center justify-center text-xs font-black border border-blue-800">
                              1
                            </span>
                            <span>Observed Fact (Telemetry Ground Truth)</span>
                          </div>
                          <p className="text-xs text-slate-200 leading-relaxed pl-7">
                            {exc.observed_fact}
                          </p>
                        </div>

                        {/* 2. EVIDENCE */}
                        <div className="p-4 rounded-xl bg-[#111827] border border-indigo-900/40 space-y-2">
                          <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                            <span className="w-5 h-5 rounded-full bg-indigo-950 text-indigo-300 flex items-center justify-center text-xs font-black border border-indigo-800">
                              2
                            </span>
                            <span>Evidence &amp; Operational Metrics</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pl-7 pt-1">
                            <div className="p-2.5 rounded-lg bg-[#141C2B] border border-slate-800">
                              <span className="text-xs text-slate-400 block">Stalled Location</span>
                              <strong className="text-xs text-white">Nagpur Junction Siding</strong>
                            </div>
                            <div className="p-2.5 rounded-lg bg-[#141C2B] border border-slate-800">
                              <span className="text-xs text-slate-400 block">Telemetry Ping Gap</span>
                              <strong className="text-xs text-rose-400 font-mono">36 Hours (&gt;24h SLA)</strong>
                            </div>
                            <div className="p-2.5 rounded-lg bg-[#141C2B] border border-slate-800">
                              <span className="text-xs text-slate-400 block">Inventory / Shortage</span>
                              <strong className="text-xs text-amber-400 font-mono">200 on-hand / 300 deficit</strong>
                            </div>
                            <div className="p-2.5 rounded-lg bg-[#141C2B] border border-slate-800">
                              <span className="text-xs text-slate-400 block">Downtime Exposure</span>
                              <strong className="text-xs text-rose-400 font-mono">40 hrs ($50,000 risk)</strong>
                            </div>
                          </div>
                        </div>

                        {/* 3. ASSUMPTION */}
                        <div className="p-4 rounded-xl bg-[#111827] border border-amber-900/40 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                            <span className="w-5 h-5 rounded-full bg-amber-950 text-amber-300 flex items-center justify-center text-xs font-black border border-amber-800">
                              3
                            </span>
                            <span>Operational Assumption</span>
                          </div>
                          <p className="text-xs text-slate-200 leading-relaxed pl-7">
                            {exc.assumption}
                          </p>
                        </div>

                        {/* 4. RISK */}
                        <div className="p-4 rounded-xl bg-[#111827] border border-rose-900/40 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wider">
                            <span className="w-5 h-5 rounded-full bg-rose-950 text-rose-300 flex items-center justify-center text-xs font-black border border-rose-800">
                              4
                            </span>
                            <span>Enterprise Production Risk</span>
                          </div>
                          <p className="text-xs text-slate-200 leading-relaxed pl-7">
                            {exc.risk}
                          </p>
                        </div>

                        {/* 5. RECOMMENDATION */}
                        <div className="p-4 rounded-xl bg-[#111827] border border-emerald-900/40 space-y-3">
                          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                            <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-300 flex items-center justify-center text-xs font-black border border-emerald-800">
                              5
                            </span>
                            <span>Agent Recommendation &amp; Staged Action</span>
                          </div>
                          <p className="text-xs text-slate-200 leading-relaxed pl-7">
                            {exc.recommendation}
                          </p>
                          <div className="pl-7 flex items-center gap-3 pt-1">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleGenerateScenarios()}
                              className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center gap-1.5"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                              <span>Launch Multi-Scenario Planner</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setActiveTab('tracking')}
                              className="text-xs border-slate-700 text-slate-300 hover:text-white flex items-center gap-1.5"
                            >
                              <Navigation className="w-3.5 h-3.5" />
                              <span>View Corridor &amp; Fallbacks</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB: SHIPMENTS & LIFECYCLE STATE MACHINE                          */}
          {/* ================================================================= */}
          {activeTab === 'shipments' && (
            <div className="p-6 rounded-xl bg-[#111827] border border-[#1E293B] space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <Truck className="w-5 h-5 text-amber-400" />
                    <span>Shipment Operational Source of Truth</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Deterministic shipment lifecycle state machines, telemetry feeds, and carrier status
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSimulateDisruption}
                    disabled={simulating}
                    className="text-xs border-amber-700/60 text-amber-300 hover:bg-amber-950/40"
                  >
                    {simulating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Zap className="w-3.5 h-3.5 mr-1" />}
                    <span>Simulate 5-Day Rail Delay</span>
                  </Button>
                </div>
              </div>

              {shipments.length === 0 ? (
                <div className="p-12 text-center space-y-2 bg-[#141C2B] rounded-xl border border-slate-800">
                  <PackageCheck className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-300 font-semibold">No active shipments in transit.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {shipments.map((shp) => (
                    <div
                      key={shp.id}
                      className="p-5 rounded-xl bg-[#141C2B] border border-[#1E293B] space-y-5"
                    >
                      {/* Header info */}
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white font-mono">{shp.shipment_number}</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                              {shp.transport_mode}
                            </span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-amber-400 font-mono">
                              {shp.carrier_name} ({shp.carrier_code})
                            </span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase font-mono ${
                              shp.action_state?.includes('EXECUTED')
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : shp.action_state === 'PREPARE_REROUTE'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              Action State: {shp.action_state || 'NORMAL'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            <span>{shp.origin_location}</span>
                            <ArrowRight className="w-3 h-3 text-slate-600" />
                            <span className="text-slate-200 font-semibold">{shp.destination_location}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveTab('tracking')}
                            className="text-xs border-slate-700 text-slate-300 hover:text-white flex items-center gap-1.5"
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            <span>Corridor Tracking</span>
                          </Button>
                          {shp.action_state === 'PREPARE_REROUTE' && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                setActionTypeToExecute('EXECUTE_REROUTE');
                                setConfirmActionModalOpen(true);
                              }}
                              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Execute Carrier Reroute</span>
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* LIFECYCLE STATE MACHINE STEPPER */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Shipment Lifecycle State Machine:
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                          {[
                            { step: 'CREATED', label: '1. Created', done: true },
                            { step: 'ASSIGNED', label: '2. Assigned', done: true },
                            { step: 'PICKUP_PENDING', label: '3. Pickup Pend', done: true },
                            { step: 'PICKUP_CONFIRMED', label: '4. Pickup Conf', done: true },
                            {
                              step: 'IN_TRANSIT',
                              label: '5. In Transit',
                              current: true,
                              alert: shp.eta_variance_days > 0,
                              note: 'Stalled at Nagpur',
                            },
                            { step: 'DELIVERY_ARRIVED', label: '6. Delivery Arrived', pending: true },
                            { step: 'DELIVERED', label: '7. Delivered', pending: true },
                          ].map((st) => (
                            <div
                              key={st.step}
                              className={`p-2.5 rounded-xl border text-center transition-all ${
                                st.current
                                  ? st.alert
                                    ? 'bg-rose-950/60 border-rose-700 text-rose-200 ring-1 ring-rose-500/50'
                                    : 'bg-amber-950/60 border-amber-700 text-amber-200'
                                  : st.done
                                  ? 'bg-[#111827] border-slate-700 text-slate-300'
                                  : 'bg-[#111827]/40 border-slate-800 text-slate-600'
                              }`}
                            >
                              <div className="flex items-center justify-center gap-1 mb-1">
                                {st.done && <Check className="w-3 h-3 text-emerald-400" />}
                                {st.current && <AlertTriangle className="w-3 h-3 text-rose-400 animate-bounce" />}
                                {st.pending && <Clock className="w-3 h-3 text-slate-600" />}
                                <span className="text-xs font-bold tracking-tight">{st.label}</span>
                              </div>
                              {st.note && (
                                <span className="text-xs font-mono text-rose-300 block font-semibold">
                                  {st.note}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Metrics Breakdown */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                        <div className="p-3 rounded-xl bg-[#111827] border border-slate-800">
                          <span className="text-xs font-bold text-slate-400 uppercase">Material Cargo</span>
                          <div className="text-xs font-bold text-white mt-0.5">{shp.material_name}</div>
                          <span className="text-xs text-slate-400 font-mono">{shp.quantity} {shp.quantity_unit} Required</span>
                        </div>
                        <div className="p-3 rounded-xl bg-[#111827] border border-slate-800">
                          <span className="text-xs font-bold text-slate-400 uppercase">Current Inventory</span>
                          <div className="text-xs font-bold text-amber-400 mt-0.5 font-mono">{shp.current_inventory} {shp.quantity_unit}</div>
                          <span className="text-xs text-slate-400">4 days buffer coverage</span>
                        </div>
                        <div className="p-3 rounded-xl bg-[#111827] border border-slate-800">
                          <span className="text-xs font-bold text-slate-400 uppercase">Potential Shortage</span>
                          <div className="text-xs font-bold text-rose-400 mt-0.5 font-mono">{shp.potential_shortage} {shp.quantity_unit}</div>
                          <span className="text-xs text-rose-300 font-semibold">Line stoppage risk</span>
                        </div>
                        <div className="p-3 rounded-xl bg-[#111827] border border-slate-800">
                          <span className="text-xs font-bold text-slate-400 uppercase">ETA Variance</span>
                          <div className="text-xs font-bold text-rose-400 mt-0.5 font-mono">+{shp.eta_variance_days} Days Delay</div>
                          <span className="text-xs text-slate-400 font-mono">Siding Hold at Nagpur</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB: ROUTE TRACKING & MULTI-MODAL CORRIDOR VISUALIZER             */}
          {/* ================================================================= */}
          {activeTab === 'tracking' && (
            <div className="p-6 rounded-xl bg-[#111827] border border-[#1E293B] space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-amber-400" />
                    <span>Freight Corridor Tracking &amp; Multi-Modal Fallbacks</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Real-time corridor checkpoint telemetry, bottleneck visualization, and bypass route modeling
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">
                    Corridor: Jamshedpur &rarr; Nagpur &rarr; Pune (1,420 km)
                  </span>
                </div>
              </div>

              {/* CORRIDOR VISUALIZER */}
              <div className="p-5 rounded-xl bg-[#141C2B] border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Radio className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span>Active Rail Corridor Status</span>
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-bold">
                    BOTTLENECK AT NAGPUR SIDING
                  </span>
                </div>

                {/* Visual node progression */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Node 1: Origin */}
                  <div className="p-4 rounded-xl bg-[#111827] border border-emerald-800/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                        ORIGIN: COMPLETED
                      </span>
                      <span className="text-xs text-slate-400 font-mono">Day 0</span>
                    </div>
                    <div className="text-xs font-bold text-white">Jamshedpur Rail Yard, JH</div>
                    <p className="text-xs text-slate-400">
                      500 MT steel sheet loaded. Wagons BOXNHL-4491 to 4505 departed eastbound line.
                    </p>
                  </div>

                  {/* Node 2: Delayed Siding */}
                  <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase px-2 py-0.5 rounded bg-rose-900 text-rose-200 border border-rose-600 animate-pulse">
                        DELAYED: SIDING HOLD
                      </span>
                      <span className="text-xs text-rose-300 font-mono font-bold">+5 Days Variance</span>
                    </div>
                    <div className="text-xs font-bold text-white">Nagpur Junction Siding, MH</div>
                    <p className="text-xs text-slate-300">
                      Track maintenance and locomotive reallocation hold. Zero telemetry forward movement for 36 hours.
                    </p>
                  </div>

                  {/* Node 3: Destination */}
                  <div className="p-4 rounded-xl bg-[#111827] border border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                        DESTINATION: PENDING
                      </span>
                      <span className="text-xs text-amber-400 font-mono font-bold">ETA Slipped</span>
                    </div>
                    <div className="text-xs font-bold text-white">Pune Assembly Plant, MH</div>
                    <p className="text-xs text-slate-400">
                      Inbound Gate 4 reservation rescheduled. Buffer exhaustion in 4 days if unmitigated.
                    </p>
                  </div>
                </div>

                {/* MULTI-MODAL BYPASS ROUTE BANNER */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/60 to-blue-950/60 border border-emerald-700/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-200">
                        Recommended Multi-Modal Fallback Corridor:
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-900 text-emerald-100 font-bold">
                        SCENARIO 3 ACTIVE
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Road Bypass Corridor via NH-53 / NH-753F from Deccan Alloy (Supplier B) &rarr; Pune Plant.
                      Delivery in <strong>2 Days</strong> (0 days production delay). Cost premium restricted to <strong>+$2,500 USD</strong>.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setActionTypeToExecute('EXECUTE_REROUTE');
                        setConfirmActionModalOpen(true);
                      }}
                      className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Execute Fallback Dispatch</span>
                    </Button>
                  </div>
                </div>
              </div>

              {/* CHECKPOINTS EVENT LOG TABLE */}
              <div className="p-5 rounded-xl bg-[#141C2B] border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>Corridor Checkpoint Event Log (7 Milestones)</span>
                  </span>
                  <span className="text-xs text-slate-400 font-mono">SHP-SAP-9021 Telemetry Trail</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs font-bold text-slate-400 uppercase">
                        <th className="py-2.5 px-3">Seq</th>
                        <th className="py-2.5 px-3">Checkpoint Type</th>
                        <th className="py-2.5 px-3">Location</th>
                        <th className="py-2.5 px-3">Scheduled Time</th>
                        <th className="py-2.5 px-3">Actual Time</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Notes &amp; Telemetry</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {((activeShipment?.checkpoints && activeShipment.checkpoints.length > 0)
                        ? activeShipment.checkpoints
                        : [
                            { id: '1', sequence_order: 1, checkpoint_type: 'ASSIGNED', location_name: 'Jamshedpur Logistics Office', scheduled_time: new Date().toISOString(), actual_time: new Date().toISOString(), status: 'COMPLETED', notes: 'Rake BOXNHL-4491 assigned' },
                            { id: '2', sequence_order: 2, checkpoint_type: 'PICKUP_COMPLETED', location_name: 'Jamshedpur Rail Yard, JH', scheduled_time: new Date().toISOString(), actual_time: new Date().toISOString(), status: 'COMPLETED', notes: '500 MT Steel coils loaded' },
                            { id: '3', sequence_order: 3, checkpoint_type: 'DEPARTED', location_name: 'Tatanagar Rail Corridor', scheduled_time: new Date().toISOString(), actual_time: new Date().toISOString(), status: 'COMPLETED', notes: 'Eastbound departure on schedule' },
                            { id: '4', sequence_order: 4, checkpoint_type: 'IN_TRANSIT', location_name: 'Bilaspur Junction Interchange', scheduled_time: new Date().toISOString(), actual_time: new Date().toISOString(), status: 'COMPLETED', notes: 'Interchange clearance passed' },
                            { id: '5', sequence_order: 5, checkpoint_type: 'SIDING_HOLD', location_name: 'Nagpur Junction Siding, MH', scheduled_time: new Date().toISOString(), actual_time: new Date().toISOString(), status: 'DELAYED', notes: 'Track maintenance and congestion hold (+5 days)' },
                            { id: '6', sequence_order: 6, checkpoint_type: 'DELIVERY_ARRIVED', location_name: 'Pune Plant Gate 4, MH', scheduled_time: new Date().toISOString(), actual_time: null, status: 'PENDING', notes: 'Arrival rescheduled to revised ETA' },
                            { id: '7', sequence_order: 7, checkpoint_type: 'DELIVERED', location_name: 'Pune Chassis Staging Bay', scheduled_time: new Date().toISOString(), actual_time: null, status: 'PENDING', notes: 'Receiving slot reserved' },
                          ]
                      ).map((cp) => (
                        <tr key={cp.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-400">#{cp.sequence_order}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-200">{cp.checkpoint_type}</td>
                          <td className="py-2.5 px-3 text-slate-300">{cp.location_name}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-400">
                            {new Date(cp.scheduled_time).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-400">
                            {cp.actual_time ? new Date(cp.actual_time).toLocaleString() : '—'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                              cp.status === 'COMPLETED'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : cp.status === 'DELAYED'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800 font-mono font-bold animate-pulse'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}>
                              {cp.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-400 max-w-xs">{cp.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: DISRUPTION CENTER                                          */}
          {/* ================================================================= */}
          {activeTab === 'disruption' && (
            <div className="p-6 rounded-xl bg-[#111827] border border-[#1E293B] space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <AlertOctagon className="w-5 h-5 text-rose-400" />
                    <span>Disruption Operations Center</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Live detection feed for transit delays, vendor factory halts, and material bottlenecks
                  </p>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSimulateDisruption}
                  disabled={simulating}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  {simulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  <span>Trigger Steel Sheet Disruption</span>
                </Button>
              </div>

              {disruptions.length === 0 ? (
                <div className="p-12 text-center space-y-3 bg-[#141C2B] rounded-xl border border-dashed border-slate-800">
                  <PackageCheck className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-xs text-slate-300 font-semibold">No active enterprise disruptions detected.</p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Click "Trigger Steel Sheet Disruption" to run the core demo story (Supplier A 5-day delay for 500 units of Steel Sheet).
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {disruptions.map((d) => (
                    <div
                      key={d.id}
                      className="p-5 rounded-xl bg-[#141C2B] border border-[#1E293B] space-y-4"
                    >
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white">{d.title}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                              d.status === 'MITIGATED'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-rose-950 text-rose-300 border border-rose-800'
                            }`}>
                              {d.status}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">Shipment: {d.shipment_id}</span>
                            {d.is_demo && <span className="text-xs text-amber-400 font-mono">[DEMO DATA]</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleGenerateScenarios(d.id)}
                            disabled={planningScenarios}
                            className="text-xs bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5"
                          >
                            <span>Simulate Solutions</span>
                            <ArrowRight className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Deterministic Impact Metrics Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#111827] p-4 rounded-xl border border-slate-800">
                        <div>
                          <span className="text-xs text-slate-400 uppercase font-bold">Required Qty</span>
                          <p className="text-sm font-black text-slate-100 font-mono mt-0.5">{d.affected_quantity} units</p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 uppercase font-bold">On-Hand Stock</span>
                          <p className="text-sm font-black text-blue-400 font-mono mt-0.5">{d.current_inventory} units</p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 uppercase font-bold">Calculated Shortage</span>
                          <p className="text-sm font-black text-rose-400 font-mono mt-0.5">{d.potential_shortage} units</p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 uppercase font-bold">Transit Delay</span>
                          <p className="text-sm font-black text-amber-400 font-mono mt-0.5">+{d.delay_days} days</p>
                        </div>
                      </div>

                      <div className="text-xs text-slate-400 flex flex-col sm:flex-row justify-between gap-2 pt-1">
                        <span>Production Line Exposure: <strong className="text-rose-300">{d.production_exposure_hours} hours</strong> of assembly stoppage</span>
                        <span>Estimated Downtime Risk: <strong className="text-rose-300 font-mono">${(d.production_exposure_hours * 1250).toLocaleString()} USD</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: SCENARIO PLANNER (PRIMARY AGENT - CORE DEMO SCREEN)        */}
          {/* ================================================================= */}
          {activeTab === 'planner' && (
            <div className="space-y-6">
              {/* Header Box */}
              <div className="p-5 rounded-xl bg-[#111827] border border-[#1E293B] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-amber-400" />
                    <h3 className="text-base font-bold text-slate-100">Scenario Planning Agent (Primary Decision Engine)</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Compares 4 response options with deterministic cost/delay formulas. Powered by 3-Agent orchestration.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGenerateScenarios()}
                    disabled={planningScenarios}
                    className="text-xs border-[#1E293B] text-slate-300 hover:text-white flex items-center gap-1.5"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${planningScenarios ? 'animate-spin' : ''}`} />
                    <span>Re-Calculate Scenarios</span>
                  </Button>
                </div>
              </div>

              {/* 4 SCENARIOS SIDE-BY-SIDE GRID */}
              {scenarioPlan?.scenarios ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {scenarioPlan.scenarios.map((sc) => {
                    const isRec = sc.is_recommended;
                    return (
                      <div
                        key={sc.scenario_id}
                        className={`rounded-xl p-5 border flex flex-col justify-between transition-all ${
                          isRec
                            ? 'bg-amber-950/30 border-amber-500 shadow-xl ring-1 ring-amber-500/50'
                            : 'bg-[#111827] border-[#1E293B] hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-3">
                          {/* Card Badge */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs uppercase font-bold tracking-wider text-slate-400 font-mono">
                              {sc.scenario_id.replace('SCENARIO_', 'OPT ')}
                            </span>
                            {isRec && (
                              <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 uppercase tracking-wider flex items-center gap-1">
                                <Zap className="w-3 h-3 fill-slate-950" />
                                <span>AI Recommended</span>
                              </span>
                            )}
                          </div>

                          <h4 className="text-sm font-bold text-slate-100 leading-snug">{sc.title}</h4>
                          <p className="text-xs text-slate-400 line-clamp-2">{sc.strategy}</p>

                          {/* Numerical Metrics */}
                          <div className="space-y-2 pt-2 border-t border-slate-800">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400">Cost Delta:</span>
                              <span className={`font-mono font-bold ${
                                sc.total_cost_delta === 0 ? 'text-slate-200' : 'text-amber-400'
                              }`}>
                                +${sc.total_cost_delta.toLocaleString()} USD
                              </span>
                            </div>

                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400">Production Delay:</span>
                              <span className={`font-mono font-bold ${
                                sc.production_delay_days === 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}>
                                {sc.production_delay_days} days
                              </span>
                            </div>

                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400">Line Downtime:</span>
                              <span className={`font-semibold ${
                                sc.production_delay_days === 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}>
                                {sc.production_delay_days === 0 ? '0 Hours (Protected)' : '40 Hours ($50k risk)'}
                              </span>
                            </div>

                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400">Compliance:</span>
                              <span className={`text-xs font-bold px-1.5 py-0.2 rounded ${
                                sc.compliance_status === 'PASS'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}>
                                {sc.compliance_status}
                              </span>
                            </div>
                          </div>

                          {/* Inventory Effect Note */}
                          <div className="p-2.5 rounded-xl bg-[#141C2B] text-xs text-slate-300 leading-relaxed border border-slate-800/80">
                            <strong>Inventory:</strong> {sc.inventory_coverage_effect}
                          </div>
                        </div>

                        {/* Card Action Button */}
                        <div className="pt-4 mt-4 border-t border-slate-800/80">
                          <Button
                            variant={isRec ? 'primary' : 'outline'}
                            size="sm"
                            onClick={() => handleOpenDecisionModal(sc, isRec ? 'APPROVED' : 'APPROVED')}
                            className={`w-full text-xs font-semibold flex items-center justify-center gap-1.5 ${
                              isRec ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg' : 'border-slate-700 hover:bg-slate-800'
                            }`}
                          >
                            <span>Human Decision Gate</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center space-y-3 bg-[#111827] rounded-xl border border-[#1E293B]">
                  <Sliders className="w-8 h-8 text-amber-400 mx-auto" />
                  <p className="text-xs text-slate-300 font-semibold">No scenario comparison generated yet.</p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleGenerateScenarios()}
                    className="bg-amber-600 hover:bg-amber-500 text-white text-xs"
                  >
                    Run Multi-Scenario Comparison Now
                  </Button>
                </div>
              )}

              {/* STRUCTURED AI RECOMMENDATION BOX */}
              {scenarioPlan && (
                <div className="p-6 rounded-xl bg-[#141C2B] border border-amber-800/60 space-y-4 shadow-xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-amber-400" />
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                        Scenario Planning Agent Recommendation
                      </h4>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                      {scenarioPlan.disclaimer}
                    </span>
                  </div>

                  <p className="text-xs text-slate-200 leading-relaxed font-medium">
                    {scenarioPlan.recommendation}
                  </p>

                  {/* Reasoning Bullets */}
                  <div className="space-y-2 pt-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Strategic Rationale &amp; Trade-off Synthesis:
                    </span>
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {scenarioPlan.reasoning?.map((r, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Compliance Notice from Agent 3 */}
                  <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/80 text-xs text-amber-200 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong>Compliance &amp; Audit Agent Flag:</strong> {scenarioPlan.compliance_audit?.recommendation_note}
                    </div>
                  </div>

                  {/* Action Bar */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
                    <span className="text-xs text-slate-400 italic">
                      Deterministic engine verified: Cost (+$2,500) and line starvation (0 hrs) are mathematically proven.
                    </span>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleAuditSupplierB}
                        className="text-xs border-slate-700"
                      >
                        Inspect Compliance Checklist
                      </Button>

                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          const rec = scenarioPlan.scenarios.find((s) => s.is_recommended);
                          if (rec) handleOpenDecisionModal(rec, 'APPROVED');
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        <span>Authorize Recommended Scenario</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 4: COMPLIANCE CHECK (AGENT 3 - VENDOR VERIFICATION)           */}
          {/* ================================================================= */}
          {activeTab === 'compliance' && (
            <div className="p-6 rounded-xl bg-[#111827] border border-[#1E293B] space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-400" />
                    <span>Compliance &amp; Statutory Audit Agent</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Pre-screens alternate suppliers against mandatory GST, ISO, and formal enterprise vendor approval rules
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAuditSupplierB}
                  disabled={auditingCompliance}
                  className="text-xs border-[#1E293B] text-slate-300 hover:text-white flex items-center gap-1.5"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${auditingCompliance ? 'animate-spin' : ''}`} />
                  <span>Re-Audit Supplier B</span>
                </Button>
              </div>

              {complianceAudit ? (
                <div className="space-y-6">
                  {/* Target Supplier Banner */}
                  <div className="p-4 rounded-xl bg-[#141C2B] border border-[#1E293B] flex flex-col sm:flex-row justify-between gap-3">
                    <div>
                      <span className="text-xs text-slate-400 uppercase font-bold">Candidate Alternate Vendor</span>
                      <h4 className="text-sm font-bold text-white mt-0.5">{complianceAudit.supplier_name}</h4>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">SAP Code: VEND-SAP-B02 | Lead Time: 2 days</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                        complianceAudit.overall_status === 'PASS'
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                          : 'bg-amber-950 text-amber-300 border-amber-800'
                      }`}>
                        {complianceAudit.overall_status === 'PASS' ? 'AUDIT PASSED' : 'HUMAN REVIEW REQUIRED'}
                      </span>
                    </div>
                  </div>

                  {/* Document Verification Table */}
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Statutory Document Checklist &amp; Expiry Registry
                    </span>

                    <div className="space-y-2">
                      {/* 1. GST Clear Tax */}
                      <div className="p-3.5 rounded-xl bg-[#141C2B] border border-slate-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div>
                            <span className="font-semibold text-slate-200">GST Clear Tax Certificate</span>
                            <p className="text-xs text-slate-400">Statutory Tax Filing Verification FY26</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                          VERIFIED (Expires 31 Dec 2026)
                        </span>
                      </div>

                      {/* 2. ISO 9001 */}
                      <div className="p-3.5 rounded-xl bg-[#141C2B] border border-slate-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div>
                            <span className="font-semibold text-slate-200">ISO 9001:2015 Quality Management</span>
                            <p className="text-xs text-slate-400">Quality Management System Standard</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                          VERIFIED (Expires 20 Nov 2026)
                        </span>
                      </div>

                      {/* 3. Formal Vendor Registration Approval - MISSING */}
                      <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/60 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <div>
                            <span className="font-semibold text-amber-200">Formal Vendor Registration Approval</span>
                            <p className="text-xs text-slate-400">SAP ERP Master Vendor Sign-off (Form VR-04)</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-amber-300 bg-amber-950/80 border border-amber-700 px-2 py-0.5 rounded">
                          MISSING (Requires Human Verification)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Agent Recommendation Statement */}
                  <div className="p-4 rounded-xl bg-[#141C2B] border border-amber-800/60 text-xs space-y-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Compliance Agent Directive:
                    </span>
                    <p className="text-slate-200 leading-relaxed">
                      "{complianceAudit.recommendation_note}"
                    </p>
                    <p className="text-xs text-slate-400">
                      <strong>Recommended Verification Step:</strong> Procurement Manager or QA Inspector must confirm the physical factory loading dock inspection report prior to signing PO-SAP-2026-B02.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-400">
                  Click "Re-Audit Supplier B" to inspect the document checklist.
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 5: SUPPLIER REGISTRY                                          */}
          {/* ================================================================= */}
          {activeTab === 'suppliers' && (
            <div className="p-5 rounded-xl bg-[#111827] border border-[#1E293B] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  Enterprise Supplier Network
                </h3>
                <span className="text-xs text-slate-400">{suppliers.length} vendors registered</span>
              </div>

              {suppliers.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No suppliers registered yet. Seed demo network or add a supplier.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase">
                        <th className="py-2.5 px-3">Supplier Name</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Location</th>
                        <th className="py-2.5 px-3">Lead Time</th>
                        <th className="py-2.5 px-3">Dependency</th>
                        <th className="py-2.5 px-3">Risk Status</th>
                        <th className="py-2.5 px-3">Verified Documents</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {suppliers.map((s) => (
                        <tr key={s.id} className="hover:bg-[#141C2B] transition-colors">
                          <td className="py-3 px-3 font-semibold text-slate-100">
                            {s.name}
                            {s.is_demo && (
                              <span className="ml-1.5 text-xs text-amber-400 font-mono">[DEMO]</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-300">{s.supplier_type}</td>
                          <td className="py-3 px-3 text-slate-400">{s.location}</td>
                          <td className="py-3 px-3 font-mono text-slate-300">{s.lead_time_days} days</td>
                          <td className="py-3 px-3">
                            <span className={`font-mono font-bold ${
                              s.dependency_percentage >= 70 ? 'text-rose-400' : 'text-slate-300'
                            }`}>
                              {s.dependency_percentage}%
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              s.risk_status === 'High' || s.risk_status === 'Critical'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            }`}>
                              {s.risk_status}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="space-y-0.5">
                              {s.documents && s.documents.length > 0 ? (
                                s.documents.map((d) => (
                                  <div key={d.id} className="text-xs flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      d.verification_status === 'Verified' ? 'bg-emerald-400' : 'bg-amber-400'
                                    }`} />
                                    <span className="text-slate-300 truncate max-w-[150px]">{d.document_name}</span>
                                    <span className="text-xs text-slate-500 font-mono">({d.verification_status})</span>
                                  </div>
                                ))
                              ) : (
                                <span className="text-amber-400 text-xs">No documents attached</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 6: MATERIALS & INVENTORY                                      */}
          {/* ================================================================= */}
          {activeTab === 'items' && (
            <div className="p-5 rounded-xl bg-[#111827] border border-[#1E293B] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  Critical Materials &amp; Inventory Dependencies
                </h3>
                <span className="text-xs text-slate-400">{items.length} items tracked</span>
              </div>

              {items.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No materials recorded yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase">
                        <th className="py-2.5 px-3">Item Name</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Criticality</th>
                        <th className="py-2.5 px-3">Primary Supplier</th>
                        <th className="py-2.5 px-3">Dependency</th>
                        <th className="py-2.5 px-3">Alternate Suppliers</th>
                        <th className="py-2.5 px-3">Buffer Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {items.map((it) => (
                        <tr key={it.id} className="hover:bg-[#141C2B] transition-colors">
                          <td className="py-3 px-3 font-semibold text-slate-100">
                            {it.name}
                            {it.is_demo && (
                              <span className="ml-1.5 text-xs text-amber-400 font-mono">[DEMO]</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-300">{it.category}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              it.criticality === 'Critical'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-blue-950 text-blue-300 border border-blue-800'
                            }`}>
                              {it.criticality}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-300">{it.primary_supplier_name || 'Sole Vendor'}</td>
                          <td className="py-3 px-3 font-mono font-bold text-amber-400">
                            {it.dependency_percentage}%
                          </td>
                          <td className="py-3 px-3">
                            <span className={`font-bold ${
                              it.alternate_supplier_count === 0 ? 'text-rose-400' : 'text-emerald-400'
                            }`}>
                              {it.alternate_supplier_count} backups
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-300">
                            {it.buffer_stock_days} days
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 7: AUDIT TRAIL & DECISION TRACE                               */}
          {/* ================================================================= */}
          {activeTab === 'audit' && (
            <div className="p-6 rounded-xl bg-[#111827] border border-[#1E293B] space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-amber-400" />
                    <span>Executive Audit Trail &amp; Decision Lineage</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Immutable record of all human authorizations, scenario selections, and compliance overrides
                  </p>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {decisions.length} decisions logged
                </span>
              </div>

              {decisions.length === 0 ? (
                <div className="p-12 text-center space-y-2 bg-[#141C2B] rounded-xl border border-slate-800">
                  <Info className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-300 font-semibold">No human decisions recorded yet.</p>
                  <p className="text-xs text-slate-500">
                    Run the Scenario Planner and approve or modify a scenario to generate an immutable audit log entry.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {decisions.map((dec) => (
                    <div
                      key={dec.id}
                      className="p-4 rounded-xl bg-[#141C2B] border border-[#1E293B] space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            dec.decision === 'APPROVED'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : dec.decision === 'MODIFIED'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}>
                            {dec.decision}
                          </span>
                          <span className="text-xs font-bold text-white">{dec.scenario_title}</span>
                          <span className="text-xs text-slate-400 font-mono">
                            AuditLog: #{dec.audit_log_id ? dec.audit_log_id.slice(0, 8) : 'RECORDED'}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 font-mono">
                          {new Date(dec.created_at).toLocaleString()}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 bg-[#111827] p-2.5 rounded-lg border border-slate-800/80">
                        <strong>Reviewer Justification:</strong> {dec.decision_notes || 'No custom notes entered.'}
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                        <span>Authorized By: <strong className="text-slate-200">{dec.confirmed_by}</strong></span>
                        <span>Cost Delta: <strong className="text-amber-400 font-mono">+${dec.cost_impact.toLocaleString()} USD</strong></span>
                        <span>Delay: <strong className="text-emerald-400 font-mono">{dec.delay_impact_days} days</strong></span>
                        <span>Compliance: <strong className="text-slate-300">{dec.compliance_status}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* HUMAN-IN-THE-LOOP DECISION GATE MODAL                                 */}
      {/* ===================================================================== */}
      {decisionModalOpen && selectedScenarioForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111827] rounded-xl border border-amber-700/80 shadow-2xl max-w-xl w-full p-6 space-y-5 animate-scale-up">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div className="space-y-0.5">
                <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
                  Human Decision Gate
                </span>
                <h3 className="text-base font-bold text-white">
                  Authorize Supply Chain Action
                </h3>
              </div>
              <button
                onClick={() => setDecisionModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scenario Summary */}
            <div className="p-3.5 rounded-xl bg-[#141C2B] border border-slate-800 space-y-1.5 text-xs">
              <div className="font-bold text-slate-100">{selectedScenarioForAction.title}</div>
              <div className="text-slate-400">{selectedScenarioForAction.strategy}</div>
              <div className="flex gap-4 pt-1 font-mono text-xs">
                <span className="text-amber-400">Cost: +${selectedScenarioForAction.total_cost_delta} USD</span>
                <span className="text-emerald-400">Delay: {selectedScenarioForAction.production_delay_days} days</span>
                <span className="text-slate-300">Compliance: {selectedScenarioForAction.compliance_status}</span>
              </div>
            </div>

            {/* Action Selection Tabs */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Select Human Action:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'APPROVED', label: 'Approve', color: 'border-emerald-600 text-emerald-300 bg-emerald-950/40' },
                  { id: 'MODIFIED', label: 'Modify', color: 'border-blue-600 text-blue-300 bg-blue-950/40' },
                  { id: 'REJECTED', label: 'Reject', color: 'border-rose-600 text-rose-300 bg-rose-950/40' },
                ].map((act) => (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => setDecisionActionType(act.id)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      decisionActionType === act.id
                        ? `${act.color} ring-1 ring-white/20`
                        : 'border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {act.label}
                  </button>
                ))}
              </div>
            </div>

            {/* If MODIFIED: extra fields */}
            {decisionActionType === 'MODIFIED' && (
              <div className="p-3.5 rounded-xl bg-[#141C2B] border border-blue-900/60 space-y-3 text-xs">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Adjusted Order Allocation (Units):
                  </label>
                  <input
                    type="number"
                    value={modifiedQuantity}
                    onChange={(e) => setModifiedQuantity(e.target.value)}
                    className="w-full bg-[#111827] border border-slate-700 rounded-lg p-2 text-xs text-white font-mono"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireImmediatePhysicalAudit}
                    onChange={(e) => setRequireImmediatePhysicalAudit(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-amber-500"
                  />
                  <span>Mandate QA site inspection prior to warehouse receiving</span>
                </label>
              </div>
            )}

            {/* Decision Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                Decision Rationale / Audit Justification Notes:
              </label>
              <textarea
                rows={3}
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                placeholder="Explain the operational rationale for this decision..."
                className="w-full bg-[#141C2B] border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDecisionModalOpen(false)}
                className="text-xs border-slate-700"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitHumanDecision}
                disabled={submittingDecision}
                className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center gap-1.5"
              >
                {submittingDecision ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Record Immutable Decision</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PREPARE VS EXECUTE OPERATIONAL ACTION MODAL                           */}
      {/* ===================================================================== */}
      {confirmActionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111827] rounded-xl border border-emerald-700/80 shadow-2xl max-w-xl w-full p-6 space-y-5 animate-scale-up">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div className="space-y-0.5">
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
                  Prepare vs Execute Operational Action Gate
                </span>
                <h3 className="text-base font-bold text-white">
                  Confirm &amp; Execute Carrier Dispatch
                </h3>
              </div>
              <button
                onClick={() => setConfirmActionModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[#141C2B] border border-emerald-900/60 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100">Shipment SHP-SAP-9021 Reroute Execution</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                  Current State: {activeShipment?.action_state || 'PREPARE_REROUTE'}
                </span>
              </div>
              <p className="text-slate-300">
                You are executing the transition from <strong>PREPARE_REROUTE</strong> to <strong>REROUTE_EXECUTED</strong>.
                This generates a carrier electronic dispatch manifest and appends an immutable entry to the Audit Log.
              </p>
            </div>

            {/* Action Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                Operational Action Type:
              </label>
              <select
                value={actionTypeToExecute}
                onChange={(e) => setActionTypeToExecute(e.target.value)}
                className="w-full bg-[#141C2B] border border-slate-700 rounded-xl p-2.5 text-xs text-white"
              >
                <option value="EXECUTE_REROUTE">EXECUTE_REROUTE (Multi-modal Road Bypass via Western Express)</option>
                <option value="EXECUTE_SWITCH">EXECUTE_SWITCH (Direct Supplier B Switch for 300 MT)</option>
              </select>
            </div>

            {/* Dispatch Reference */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                Carrier Dispatch Manifest Reference:
              </label>
              <input
                type="text"
                value={dispatchReference}
                onChange={(e) => setDispatchReference(e.target.value)}
                className="w-full bg-[#141C2B] border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
              />
            </div>

            {/* Carrier Dispatch Instructions */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                Carrier Instructions &amp; Vehicle Allocation:
              </label>
              <textarea
                rows={3}
                value={carrierInstructions}
                onChange={(e) => setCarrierInstructions(e.target.value)}
                className="w-full bg-[#141C2B] border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmActionModalOpen(false)}
                className="text-xs border-slate-700"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmActionExecution}
                disabled={actionExecutionLoading}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5"
              >
                {actionExecutionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Confirm &amp; Dispatch Carrier Manifest</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Legacy Why Risk Modal */}
      {whyRiskModalOpen && selectedRisk && (
        <WhySupplyRiskModal
          isOpen={true}
          onClose={() => setWhyRiskModalOpen(false)}
          risk={selectedRisk}
          onActionProposal={() => {}}
        />
      )}
    </div>
  );
}
