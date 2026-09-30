from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class SupplierDocumentBase(BaseModel):
    document_name: str
    document_type: str
    verification_status: str = "Pending"
    expiry_date: Optional[str] = None
    document_id: Optional[str] = None


class SupplierDocumentResponse(SupplierDocumentBase):
    id: str
    supplier_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SupplierBase(BaseModel):
    name: str
    supplier_type: str = "Raw Material"
    location: str
    country: str = "India"
    products_or_materials: List[str] = Field(default_factory=list)
    dependency_percentage: float = 0.0
    lead_time_days: int = 7
    status: str = "Active"
    contact_information: Optional[Dict[str, Any]] = None
    risk_status: str = "Low"


class SupplierCreate(SupplierBase):
    pass


class SupplierResponse(SupplierBase):
    id: str
    business_id: str
    is_demo: bool
    created_at: datetime
    updated_at: datetime
    documents: List[SupplierDocumentResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True


class SupplyItemBase(BaseModel):
    name: str
    category: str = "Raw Material"
    criticality: str = "High"
    primary_supplier_id: Optional[str] = None
    alternate_supplier_count: int = 0
    dependency_percentage: float = 100.0
    monthly_consumption: Optional[str] = None
    buffer_stock_days: int = 15


class SupplyItemCreate(SupplyItemBase):
    pass


class SupplyItemResponse(SupplyItemBase):
    id: str
    business_id: str
    is_demo: bool
    created_at: datetime
    updated_at: datetime
    primary_supplier_name: Optional[str] = None

    class Config:
        from_attributes = True


class SupplyChainRiskResponse(BaseModel):
    id: str
    business_id: str
    supplier_id: Optional[str] = None
    supply_item_id: Optional[str] = None
    supplier_name: Optional[str] = None
    supply_item_name: Optional[str] = None
    title: str
    category: str
    priority: str
    severity: str
    evidence: Dict[str, Any]
    issue: str
    cause: str
    recommended_action: str
    estimated_cost: float
    estimated_risk_reduction: float
    effort: str
    confidence: float
    status: str
    policy_check_status: str
    is_demo: bool
    detected_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SupplyChainSummaryResponse(BaseModel):
    business_id: str
    total_suppliers: int
    critical_suppliers: int
    total_items: int
    critical_items: int
    single_source_count: int
    missing_docs_count: int
    overall_resilience_score: int  # 0 to 100
    resilience_rating: str  # Excellent, Resilient, Moderate, Vulnerable, High Risk
    active_risks_count: int
    top_risks: List[SupplyChainRiskResponse] = Field(default_factory=list)
    lead_time_average_days: float


class SAPProviderStatusResponse(BaseModel):
    provider_name: str
    display_label: str
    is_demo: bool
    sap_ready: bool
    sap_connected: bool
    connection_status: str
    sap_specification: Optional[str] = None
    external_logistics_api_connected: bool = False
    disclaimer: str


class DisruptionSimulateRequest(BaseModel):
    title: Optional[str] = "Supplier A Shipment Delayed 5 Days (Transit Bottleneck)"
    delay_days: int = 5
    required_quantity: int = 500
    current_inventory: int = 200
    material_name: Optional[str] = "[DEMO DATA] Steel Sheet (Grade 304, Cold Rolled)"
    supplier_name: Optional[str] = "[DEMO DATA] Bharat Heavy Steel Forge Ltd (Supplier A)"
    shipment_id: Optional[str] = "SHP-SAP-9021"


class DisruptionEventResponse(BaseModel):
    id: str
    business_id: str
    title: str
    disruption_type: str
    severity: str
    delay_days: int
    affected_quantity: int
    current_inventory: int
    potential_shortage: int
    production_exposure_hours: float
    status: str
    evidence: Dict[str, Any] = Field(default_factory=dict)
    is_demo: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CostBreakdown(BaseModel):
    unit_material_price: float
    material_cost_delta: float
    freight_premium: float
    total_cost_delta: float


class ScenarioItemResponse(BaseModel):
    scenario_id: str
    title: str
    strategy: str
    supplier_allocated: str
    supplier_code: str
    quantity_allocated: int
    quantity_from_buffer: int
    cost_breakdown: CostBreakdown
    total_cost_delta: float
    lead_time_days: int
    production_delay_days: int
    inventory_coverage_effect: str
    operational_risk: str
    downtime_risk: str
    transport_route: str
    compliance_status: str
    compliance_details: str
    requires_human_approval: bool = True
    is_recommended: bool = False
    summary_tag: str


class ComplianceCheckItem(BaseModel):
    check: str
    document_name: Optional[str] = None
    expiry: Optional[str] = None
    status: str


class ComplianceAuditResponse(BaseModel):
    agent: str
    supplier_name: str
    supplier_id: Optional[str] = None
    overall_status: str
    passed_checks: List[ComplianceCheckItem] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    missing_documents: List[str] = Field(default_factory=list)
    expired_documents: List[str] = Field(default_factory=list)
    recommendation_note: str
    human_verification_required: bool
    audited_at: str


class ScenarioPlanningRecommendationResponse(BaseModel):
    summary: str
    risk_level: str
    disruption_severity: str
    affected_entities: List[Dict[str, Any]]
    scenarios: List[ScenarioItemResponse]
    recommended_scenario_id: str
    recommended_scenario_title: str
    recommendation: str
    reasoning: List[str]
    trade_offs: Dict[str, Any]
    compliance_audit: ComplianceAuditResponse
    warnings: List[str]
    missing_information: List[str]
    human_approval_required: bool = True
    disclaimer: str = "AI-generated recommendation — Human approval required."
    sap_readiness_mode: str
    operational_exception: Optional[Dict[str, Any]] = None
    action_state: Optional[str] = "NORMAL"
    timestamp: str


class DecisionSubmitRequest(BaseModel):
    scenario_id: str
    scenario_title: str
    decision: str  # APPROVED, REJECTED, MODIFIED
    decision_notes: Optional[str] = None
    modification_details: Optional[Dict[str, Any]] = None
    disruption_id: Optional[str] = None


class DecisionResponse(BaseModel):
    id: str
    business_id: str
    disruption_id: Optional[str] = None
    scenario_id: str
    scenario_title: str
    decision: str
    decision_notes: Optional[str] = None
    modification_details: Optional[Dict[str, Any]] = None
    confirmed_by: str
    cost_impact: float
    delay_impact_days: int
    compliance_status: str
    audit_log_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ShipmentCheckpointResponse(BaseModel):
    id: str
    shipment_id: str
    sequence_order: int
    checkpoint_type: str
    location_name: str
    location_coords: Optional[Dict[str, Any]] = None
    scheduled_time: datetime
    actual_time: Optional[datetime] = None
    status: str
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ShipmentExceptionResponse(BaseModel):
    id: str
    business_id: str
    shipment_id: str
    exception_type: str
    severity: str
    status: str
    observed_fact: str
    evidence: Dict[str, Any] = Field(default_factory=dict)
    assumption: str
    risk: str
    recommendation: str
    action_state: str = "NORMAL"
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ShipmentResponse(BaseModel):
    id: str
    business_id: str
    shipment_number: str
    supplier_id: Optional[str] = None
    supply_item_id: Optional[str] = None
    carrier_name: str
    carrier_code: str
    transport_mode: str
    origin_location: str
    destination_location: str
    current_location: str
    status: str
    action_state: str = "NORMAL"
    planned_pickup: datetime
    actual_pickup: Optional[datetime] = None
    planned_eta: datetime
    revised_eta: Optional[datetime] = None
    eta_variance_days: int
    material_name: str
    quantity: int
    quantity_unit: str
    required_quantity: int
    current_inventory: int
    potential_shortage: int
    last_telemetry_at: Optional[datetime] = None
    data_source: str
    data_source_mode: str
    is_demo: bool
    created_at: datetime
    updated_at: datetime
    checkpoints: List[ShipmentCheckpointResponse] = Field(default_factory=list)
    exceptions: List[ShipmentExceptionResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True


class ShipmentActionExecutionRequest(BaseModel):
    action_type: str = "EXECUTE_REROUTE"  # EXECUTE_REROUTE, EXECUTE_SWITCH
    carrier_instructions: Optional[str] = "Initiate multi-modal road transfer for 300 MT via Western Carrier Express."
    dispatch_reference: Optional[str] = "DISPATCH-EXP-7721"


class ShipmentActionExecutionResponse(BaseModel):
    shipment_id: str
    shipment_number: str
    previous_action_state: str
    new_action_state: str
    carrier_name: str
    execution_timestamp: datetime
    audit_log_id: str
    status_message: str
