import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status as http_status, Query
from sqlalchemy.orm import Session

from app.dependencies.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.business import BusinessProfile
from app.models.supplier import (
    Supplier,
    SupplierDocument,
    SupplyItem,
    SupplyChainRisk,
    DisruptionEvent,
    SupplyChainDecision,
    Shipment,
    ShipmentCheckpoint,
    ShipmentException,
)
from app.models.audit_log import AuditLog
from app.schemas.supply_chain import (
    SupplierResponse,
    SupplierCreate,
    SupplyItemResponse,
    SupplyItemCreate,
    SupplyChainRiskResponse,
    SupplyChainSummaryResponse,
    SAPProviderStatusResponse,
    DisruptionSimulateRequest,
    DisruptionEventResponse,
    ScenarioPlanningRecommendationResponse,
    ComplianceAuditResponse,
    DecisionSubmitRequest,
    DecisionResponse,
    ShipmentResponse,
    ShipmentCheckpointResponse,
    ShipmentExceptionResponse,
    ShipmentActionExecutionRequest,
    ShipmentActionExecutionResponse,
)
from app.services.supply_chain.risk_service import SupplyChainRiskService
from app.services.supply_chain.agent import SupplyChainAgent
from app.services.supply_chain.demo_data import seed_demo_supply_chain, cleanup_demo_supply_chain
from app.services.supply_chain.sap_adapter import get_supply_chain_data_provider
from app.services.supply_chain.agents import DisruptionSensingAgent, ScenarioPlanningAgent, ComplianceAuditAgent
from app.services.supply_chain.scenario_engine import ScenarioEngine
from app.services.supply_chain.exception_engine import ExceptionEngine

router = APIRouter(prefix="/supply-chain", tags=["Supply Chain Resilience"])


def verify_business_ownership(db: Session, current_user: User, business_profile_id: str) -> BusinessProfile:
    profile = db.query(BusinessProfile).filter(BusinessProfile.id == business_profile_id).first()
    if not profile:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Business profile not found."
        )
    if profile.user_id and profile.user_id != current_user.id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: you do not have permission to access supply chain data for this profile."
        )
    return profile


@router.get("/summary", response_model=SupplyChainSummaryResponse)
def get_supply_chain_summary(
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = verify_business_ownership(db, current_user, business_profile_id)
    score_data = SupplyChainRiskService.calculate_resilience_score(db, profile.id)

    risks = db.query(SupplyChainRisk).filter(
        SupplyChainRisk.business_id == profile.id,
        SupplyChainRisk.status.notin_(["RESOLVED", "DISMISSED"])
    ).order_by(
        SupplyChainRisk.priority.desc(),
        SupplyChainRisk.detected_at.desc()
    ).limit(5).all()

    top_risk_responses = []
    for r in risks:
        top_risk_responses.append(
            SupplyChainRiskResponse(
                id=r.id,
                business_id=r.business_id,
                supplier_id=r.supplier_id,
                supply_item_id=r.supply_item_id,
                supplier_name=r.supplier.name if r.supplier else None,
                supply_item_name=r.supply_item.name if r.supply_item else None,
                title=r.title,
                category=r.category,
                priority=r.priority,
                severity=r.severity,
                evidence=r.evidence or {},
                issue=r.issue,
                cause=r.cause,
                recommended_action=r.recommended_action,
                estimated_cost=r.estimated_cost,
                estimated_risk_reduction=r.estimated_risk_reduction,
                effort=r.effort,
                confidence=r.confidence,
                status=r.status,
                policy_check_status=r.policy_check_status,
                is_demo=r.is_demo,
                detected_at=r.detected_at,
                updated_at=r.updated_at,
            )
        )

    return SupplyChainSummaryResponse(
        business_id=profile.id,
        total_suppliers=score_data["total_suppliers"],
        critical_suppliers=score_data["critical_suppliers"],
        total_items=score_data["total_items"],
        critical_items=score_data["critical_items"],
        single_source_count=score_data["single_source_count"],
        missing_docs_count=score_data["missing_docs_count"],
        overall_resilience_score=score_data["score"],
        resilience_rating=score_data["rating"],
        active_risks_count=len(risks),
        top_risks=top_risk_responses,
        lead_time_average_days=score_data["lead_time_avg"],
    )


@router.get("/suppliers", response_model=List[SupplierResponse])
def get_suppliers(
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = verify_business_ownership(db, current_user, business_profile_id)
    return db.query(Supplier).filter(Supplier.business_id == profile.id).order_by(Supplier.created_at.desc()).all()


@router.post("/suppliers", response_model=SupplierResponse)
def create_supplier(
    supplier_in: SupplierCreate,
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = verify_business_ownership(db, current_user, business_profile_id)
    supplier = Supplier(
        id=str(uuid.uuid4()),
        business_id=profile.id,
        name=supplier_in.name,
        supplier_type=supplier_in.supplier_type,
        location=supplier_in.location,
        country=supplier_in.country,
        products_or_materials=supplier_in.products_or_materials,
        dependency_percentage=supplier_in.dependency_percentage,
        lead_time_days=supplier_in.lead_time_days,
        status=supplier_in.status,
        contact_information=supplier_in.contact_information,
        risk_status=supplier_in.risk_status,
        is_demo=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.get("/items", response_model=List[SupplyItemResponse])
def get_supply_items(
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = verify_business_ownership(db, current_user, business_profile_id)
    items = db.query(SupplyItem).filter(SupplyItem.business_id == profile.id).order_by(SupplyItem.criticality.desc()).all()
    resp = []
    for item in items:
        r = SupplyItemResponse.from_orm(item)
        r.primary_supplier_name = item.primary_supplier.name if item.primary_supplier else None
        resp.append(r)
    return resp


@router.get("/risks", response_model=List[SupplyChainRiskResponse])
def get_supply_chain_risks(
    business_profile_id: str = Query(...),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = verify_business_ownership(db, current_user, business_profile_id)
    query = db.query(SupplyChainRisk).filter(SupplyChainRisk.business_id == profile.id)
    if status:
        query = query.filter(SupplyChainRisk.status == status)

    risks = query.order_by(SupplyChainRisk.priority.desc(), SupplyChainRisk.detected_at.desc()).all()
    resp = []
    for r in risks:
        resp.append(
            SupplyChainRiskResponse(
                id=r.id,
                business_id=r.business_id,
                supplier_id=r.supplier_id,
                supply_item_id=r.supply_item_id,
                supplier_name=r.supplier.name if r.supplier else None,
                supply_item_name=r.supply_item.name if r.supply_item else None,
                title=r.title,
                category=r.category,
                priority=r.priority,
                severity=r.severity,
                evidence=r.evidence or {},
                issue=r.issue,
                cause=r.cause,
                recommended_action=r.recommended_action,
                estimated_cost=r.estimated_cost,
                estimated_risk_reduction=r.estimated_risk_reduction,
                effort=r.effort,
                confidence=r.confidence,
                status=r.status,
                policy_check_status=r.policy_check_status,
                is_demo=r.is_demo,
                detected_at=r.detected_at,
                updated_at=r.updated_at,
            )
        )
    return resp


@router.get("/risks/{risk_id}", response_model=SupplyChainRiskResponse)
def get_risk_detail(
    risk_id: str,
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = verify_business_ownership(db, current_user, business_profile_id)
    r = db.query(SupplyChainRisk).filter(
        SupplyChainRisk.id == risk_id,
        SupplyChainRisk.business_id == profile.id
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Supply chain risk not found.")

    return SupplyChainRiskResponse(
        id=r.id,
        business_id=r.business_id,
        supplier_id=r.supplier_id,
        supply_item_id=r.supply_item_id,
        supplier_name=r.supplier.name if r.supplier else None,
        supply_item_name=r.supply_item.name if r.supply_item else None,
        title=r.title,
        category=r.category,
        priority=r.priority,
        severity=r.severity,
        evidence=r.evidence or {},
        issue=r.issue,
        cause=r.cause,
        recommended_action=r.recommended_action,
        estimated_cost=r.estimated_cost,
        estimated_risk_reduction=r.estimated_risk_reduction,
        effort=r.effort,
        confidence=r.confidence,
        status=r.status,
        policy_check_status=r.policy_check_status,
        is_demo=r.is_demo,
        detected_at=r.detected_at,
        updated_at=r.updated_at,
    )


@router.get("/evidence/{risk_id}")
def get_risk_evidence(
    risk_id: str,
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = verify_business_ownership(db, current_user, business_profile_id)
    r = db.query(SupplyChainRisk).filter(
        SupplyChainRisk.id == risk_id,
        SupplyChainRisk.business_id == profile.id
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Supply chain risk not found.")

    return {
        "risk_id": r.id,
        "title": r.title,
        "category": r.category,
        "evidence": r.evidence or {},
        "issue": r.issue,
        "cause": r.cause,
        "supplier_details": {
            "name": r.supplier.name if r.supplier else None,
            "location": r.supplier.location if r.supplier else None,
            "lead_time_days": r.supplier.lead_time_days if r.supplier else None,
        } if r.supplier else None,
        "supply_item_details": {
            "name": r.supply_item.name if r.supply_item else None,
            "criticality": r.supply_item.criticality if r.supply_item else None,
            "dependency_percentage": r.supply_item.dependency_percentage if r.supply_item else None,
            "alternate_supplier_count": r.supply_item.alternate_supplier_count if r.supply_item else None,
        } if r.supply_item else None
    }


@router.post("/analyze")
def run_supply_chain_analysis(
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = verify_business_ownership(db, current_user, business_profile_id)
    analysis_result = SupplyChainAgent.analyze_business_supply_chain(db, profile.id)
    return analysis_result


@router.post("/proposal/{risk_id}")
def create_action_proposal(
    risk_id: str,
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = verify_business_ownership(db, current_user, business_profile_id)
    try:
        proposal = SupplyChainAgent.propose_action_for_risk(db, profile.id, risk_id)
        return {
            "status": "SUCCESS",
            "proposal_id": proposal.id,
            "title": proposal.title,
            "risk_level": proposal.risk_level,
            "message": "ActionProposal successfully created. Human confirmation required."
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/demo/seed")
def seed_demo_data(
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = verify_business_ownership(db, current_user, business_profile_id)
    result = seed_demo_supply_chain(db, profile.id)
    return result


@router.delete("/demo/cleanup")
def cleanup_demo_data(
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = verify_business_ownership(db, current_user, business_profile_id)
    removed_count = cleanup_demo_supply_chain(db, profile.id)
    return {"status": "SUCCESS", "removed_count": removed_count}


# =============================================================================
# SAP-READY RESILIENT SUPPLY CHAIN ENDPOINTS
# =============================================================================

@router.get("/status", response_model=SAPProviderStatusResponse)
def get_sap_adapter_status(
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns current SAP adapter state, DEMO_DATA_PROVIDER mode, and architectural compliance metadata.
    """
    verify_business_ownership(db, current_user, business_profile_id)
    adapter = get_supply_chain_data_provider()
    return adapter.get_provider_metadata()


@router.get("/disruptions", response_model=List[DisruptionEventResponse])
def get_disruptions(
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Lists detected and simulated supply disruptions for the active enterprise profile.
    """
    profile = verify_business_ownership(db, current_user, business_profile_id)
    return db.query(DisruptionEvent).filter(
        DisruptionEvent.business_id == profile.id
    ).order_by(DisruptionEvent.created_at.desc()).all()


@router.post("/disruptions/simulate", response_model=DisruptionEventResponse)
def simulate_disruption_event(
    sim_in: DisruptionSimulateRequest,
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Simulates the core demo disruption:
    Supplier A shipment of Steel Sheet delayed by 5 days (500 required, 200 inventory, 300 shortage).
    Evaluated with deterministic impact calculations.
    """
    profile = verify_business_ownership(db, current_user, business_profile_id)

    # Deterministic impact calculation
    impact = ScenarioEngine.calculate_disruption_impact(
        required_quantity=sim_in.required_quantity,
        current_inventory=sim_in.current_inventory,
        daily_consumption_rate=50.0,
        delay_days=sim_in.delay_days,
        hourly_downtime_cost=1250.0
    )

    # Clean up prior demo disruptions for this profile
    db.query(DisruptionEvent).filter(
        DisruptionEvent.business_id == profile.id,
        DisruptionEvent.is_demo == True
    ).delete(synchronize_session=False)

    disruption = DisruptionEvent(
        id=str(uuid.uuid4()),
        business_id=profile.id,
        shipment_id=sim_in.shipment_id or "SHP-SAP-9021",
        title=sim_in.title or "Supplier A Shipment Delayed 5 Days (Transit Bottleneck)",
        disruption_type="Transit Delay",
        severity="Critical" if impact["potential_shortage"] >= 300 else "High",
        delay_days=sim_in.delay_days,
        affected_quantity=sim_in.required_quantity,
        current_inventory=sim_in.current_inventory,
        potential_shortage=impact["potential_shortage"],
        production_exposure_hours=impact["production_exposure_hours"],
        status="ACTIVE",
        evidence={
            "material_name": sim_in.material_name or "[DEMO DATA] Steel Sheet (Grade 304, Cold Rolled)",
            "primary_supplier": sim_in.supplier_name or "[DEMO DATA] Bharat Heavy Steel Forge Ltd (Supplier A)",
            "transit_corridor": "Central Railway Freight Corridor via Nagpur Junction",
            "estimated_downtime_risk_cost": impact["estimated_downtime_risk_cost"],
            "days_of_coverage": impact["days_of_coverage"],
            "calculation_basis": impact["calculation_basis"]
        },
        is_demo=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(disruption)
    db.commit()
    db.refresh(disruption)
    return disruption


@router.post("/scenarios/generate", response_model=ScenarioPlanningRecommendationResponse)
def generate_scenarios(
    business_profile_id: str = Query(...),
    disruption_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Coordinates the 3-Agent architecture:
    1. Disruption Sensing Agent evaluates impact & consumes operational exception telemetry
    2. Scenario Planning Agent generates 4 deterministic trade-off scenarios
    3. Compliance & Audit Agent checks Supplier B documentation gaps
    Returns structured AI recommendation with mandatory human approval requirement.
    """
    profile = verify_business_ownership(db, current_user, business_profile_id)

    # Ensure demo shipment is seeded and evaluated
    active_shipment = db.query(Shipment).filter(Shipment.business_id == profile.id).first()
    if not active_shipment:
        active_shipment = ExceptionEngine.seed_demo_shipment_with_exception(db, profile.id)

    active_exc = db.query(ShipmentException).filter(
        ShipmentException.business_id == profile.id,
        ShipmentException.status == "ACTIVE"
    ).order_by(ShipmentException.created_at.desc()).first()

    operational_exception = None
    if active_exc:
        operational_exception = {
            "observed_fact": active_exc.observed_fact,
            "evidence": active_exc.evidence,
            "assumption": active_exc.assumption,
            "risk": active_exc.risk,
            "recommendation": active_exc.recommendation,
        }
    elif active_shipment:
        operational_exception = ExceptionEngine.build_five_part_decomposition(
            shipment_number=active_shipment.shipment_number,
            carrier_name=active_shipment.carrier_name,
            current_location=active_shipment.current_location,
            variance_days=active_shipment.eta_variance_days,
            inventory_on_hand=active_shipment.current_inventory,
            required_qty=active_shipment.required_quantity,
            material_name=active_shipment.material_name
        )

    disruption_context = None
    if disruption_id:
        d_event = db.query(DisruptionEvent).filter(
            DisruptionEvent.id == disruption_id,
            DisruptionEvent.business_id == profile.id
        ).first()
        if d_event:
            disruption_context = {
                "disruption_id": d_event.id,
                "title": d_event.title,
                "delay_days": d_event.delay_days,
                "required_quantity": d_event.affected_quantity,
                "current_inventory": d_event.current_inventory,
                "shipment_id": d_event.shipment_id,
                "material_name": d_event.evidence.get("material_name") if d_event.evidence else None,
                "supplier_name": d_event.evidence.get("primary_supplier") if d_event.evidence else None,
                "operational_exception": operational_exception,
                "action_state": active_shipment.action_state if active_shipment else "NORMAL",
            }
    elif active_shipment:
        disruption_context = {
            "disruption_id": "DISRUPT-SAP-2026-01",
            "title": f"Supplier A Shipment Delayed 5 Days (Transit Bottleneck)",
            "delay_days": active_shipment.eta_variance_days,
            "required_quantity": active_shipment.required_quantity,
            "current_inventory": active_shipment.current_inventory,
            "shipment_id": active_shipment.shipment_number,
            "material_name": active_shipment.material_name,
            "supplier_name": "[DEMO DATA] Bharat Heavy Steel Forge Ltd (Supplier A)",
            "operational_exception": operational_exception,
            "action_state": active_shipment.action_state,
        }

    recommendation = ScenarioPlanningAgent.plan_and_recommend(
        disruption_context=disruption_context,
        business_id=profile.id
    )
    return recommendation


@router.post("/compliance/audit", response_model=ComplianceAuditResponse)
def audit_candidate_supplier(
    supplier_code: str = Query("VEND-SAP-B02"),
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Executes the Compliance & Audit Agent on a candidate supplier, highlighting missing
    documents (e.g. Supplier B missing Vendor Registration Approval) and requiring human verification.
    """
    profile = verify_business_ownership(db, current_user, business_profile_id)
    adapter = get_supply_chain_data_provider()
    suppliers = adapter.get_suppliers(profile.id)

    target_supplier = next((s for s in suppliers if s.get("code") == supplier_code or supplier_code in s.get("name", "")), None)
    if not target_supplier:
        target_supplier = suppliers[1] if len(suppliers) > 1 else suppliers[0]

    return ComplianceAuditAgent.audit_supplier_compliance(target_supplier)


@router.post("/decisions", response_model=DecisionResponse)
def submit_human_decision(
    decision_in: DecisionSubmitRequest,
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    HUMAN-IN-THE-LOOP DECISION GATE:
    Records an authorized human decision ([APPROVE], [REJECT], [MODIFY]) for a proposed scenario.
    Sets action state to PREPARE_REROUTE or PREPARE_SWITCH.
    Persists decision in database and writes an immutable entry into AuditLog.
    """
    profile = verify_business_ownership(db, current_user, business_profile_id)

    # Cost and delay mapping based on selected scenario
    cost_map = {
        "SCENARIO_1_WAIT": 0.0,
        "SCENARIO_2_SWITCH_SUPPLIER_B": 4300.0,
        "SCENARIO_3_HYBRID_STOCK_SUPPLIER_B": 2500.0,
        "SCENARIO_4_EXPEDITED_AIR_ROUTE": 4200.0,
    }
    delay_map = {
        "SCENARIO_1_WAIT": 5,
        "SCENARIO_2_SWITCH_SUPPLIER_B": 0,
        "SCENARIO_3_HYBRID_STOCK_SUPPLIER_B": 0,
        "SCENARIO_4_EXPEDITED_AIR_ROUTE": 1,
    }

    cost_impact = cost_map.get(decision_in.scenario_id, 2500.0)
    delay_impact = delay_map.get(decision_in.scenario_id, 0)
    user_display = current_user.full_name or "Mohith K (Procurement Director)"

    # Create immutable AuditLog entry
    audit_id = str(uuid.uuid4())
    audit_entry = AuditLog(
        id=audit_id,
        business_profile_id=profile.id,
        user_name=user_display,
        user_id=current_user.id,
        action=f"SUPPLY_CHAIN_{decision_in.decision}",
        target_entity_type="supply_chain_scenario",
        target_entity_name=decision_in.scenario_title,
        previous_state="AI_RECOMMENDED",
        new_state=decision_in.decision,
        source="SAP Resilient Supply Chain Control Tower",
        proposal_id=None,
        timestamp=datetime.utcnow(),
        details={
            "scenario_id": decision_in.scenario_id,
            "decision": decision_in.decision,
            "decision_notes": decision_in.decision_notes,
            "cost_impact_usd": cost_impact,
            "delay_impact_days": delay_impact,
            "modification_details": decision_in.modification_details or {},
            "audit_rationale": "Human-in-the-loop review completed. Authorization verified."
        }
    )
    db.add(audit_entry)

    # Persist SupplyChainDecision record
    decision_record = SupplyChainDecision(
        id=str(uuid.uuid4()),
        business_id=profile.id,
        disruption_id=decision_in.disruption_id,
        scenario_id=decision_in.scenario_id,
        scenario_title=decision_in.scenario_title,
        decision=decision_in.decision,
        decision_notes=decision_in.decision_notes,
        modification_details=decision_in.modification_details,
        confirmed_by=user_display,
        cost_impact=cost_impact,
        delay_impact_days=delay_impact,
        compliance_status="VERIFIED_WITH_HUMAN_OVERRIDE" if decision_in.scenario_id == "SCENARIO_3_HYBRID_STOCK_SUPPLIER_B" else "VERIFIED",
        audit_log_id=audit_id,
        created_at=datetime.utcnow(),
    )
    db.add(decision_record)

    # Update active disruption state if approved or modified
    if decision_in.decision in ["APPROVED", "MODIFIED"] and decision_in.disruption_id:
        disrupt = db.query(DisruptionEvent).filter(
            DisruptionEvent.id == decision_in.disruption_id,
            DisruptionEvent.business_id == profile.id
        ).first()
        if disrupt:
            disrupt.status = "MITIGATED"
            disrupt.updated_at = datetime.utcnow()
            db.add(disrupt)

    # PREPARE ACTION STATE: Transition shipment to PREPARE_REROUTE or PREPARE_SWITCH
    target_action_state = "NORMAL"
    if decision_in.decision in ["APPROVED", "MODIFIED"]:
        if decision_in.scenario_id in ["SCENARIO_3_HYBRID_STOCK_SUPPLIER_B", "SCENARIO_4_EXPEDITED_AIR_ROUTE"]:
            target_action_state = "PREPARE_REROUTE"
        elif decision_in.scenario_id == "SCENARIO_2_SWITCH_SUPPLIER_B":
            target_action_state = "PREPARE_SWITCH"

    shipment = db.query(Shipment).filter(Shipment.business_id == profile.id).first()
    if shipment and target_action_state != "NORMAL":
        shipment.action_state = target_action_state
        shipment.updated_at = datetime.utcnow()
        for exc in shipment.exceptions:
            if exc.status == "ACTIVE":
                exc.action_state = target_action_state
                exc.updated_at = datetime.utcnow()
                db.add(exc)
        db.add(shipment)

    db.commit()
    db.refresh(decision_record)
    return decision_record


@router.get("/decisions", response_model=List[DecisionResponse])
def get_human_decisions(
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns history of human decisions made on supply chain disruptions, linked to AuditLog IDs.
    """
    profile = verify_business_ownership(db, current_user, business_profile_id)
    return db.query(SupplyChainDecision).filter(
        SupplyChainDecision.business_id == profile.id
    ).order_by(SupplyChainDecision.created_at.desc()).all()


# =========================================================================
# OPERATIONAL SUPPLY CHAIN: SHIPMENTS, CHECKPOINTS, EXCEPTIONS, & ACTIONS
# =========================================================================

@router.get("/shipments", response_model=List[ShipmentResponse])
def get_shipments(
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all shipments and lifecycle states for the business profile.
    Automatically initializes the canonical demo shipment (SHP-SAP-9021) if none exist.
    """
    profile = verify_business_ownership(db, current_user, business_profile_id)
    shipments = db.query(Shipment).filter(Shipment.business_id == profile.id).order_by(Shipment.created_at.desc()).all()
    if not shipments:
        demo_shipment = ExceptionEngine.seed_demo_shipment_with_exception(db, profile.id)
        shipments = [demo_shipment]
    return shipments


@router.get("/shipments/{shipment_id}", response_model=ShipmentResponse)
def get_shipment_detail(
    shipment_id: str,
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns full operational details of a specific shipment, including checkpoint timeline and exceptions.
    """
    profile = verify_business_ownership(db, current_user, business_profile_id)
    shipment = db.query(Shipment).filter(
        Shipment.id == shipment_id,
        Shipment.business_id == profile.id
    ).first()
    if not shipment:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Shipment not found.")
    return shipment


@router.get("/exceptions", response_model=List[ShipmentExceptionResponse])
def get_operational_exceptions(
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns active operational exceptions with their mandatory 5-part analytical decomposition
    (Observed Fact, Evidence, Assumption, Risk, Recommendation).
    """
    profile = verify_business_ownership(db, current_user, business_profile_id)
    shipments = db.query(Shipment).filter(Shipment.business_id == profile.id).all()
    if not shipments:
        ExceptionEngine.seed_demo_shipment_with_exception(db, profile.id)

    exceptions = db.query(ShipmentException).filter(
        ShipmentException.business_id == profile.id,
        ShipmentException.status == "ACTIVE"
    ).order_by(ShipmentException.created_at.desc()).all()
    return exceptions


@router.post("/shipments/simulate-delay", response_model=ShipmentResponse)
def simulate_shipment_delay(
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Simulates the canonical Nagpur Junction siding 5-day delay on shipment SHP-SAP-9021,
    re-evaluating checkpoints and triggering 5-part exception decomposition.
    """
    profile = verify_business_ownership(db, current_user, business_profile_id)
    shipment = ExceptionEngine.seed_demo_shipment_with_exception(db, profile.id)
    shipment.action_state = "NORMAL"
    shipment.eta_variance_days = 5
    db.commit()
    db.refresh(shipment)
    return shipment


@router.post("/shipments/{shipment_id}/confirm-action", response_model=ShipmentActionExecutionResponse)
def confirm_shipment_action_execution(
    shipment_id: str,
    action_in: ShipmentActionExecutionRequest,
    business_profile_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    PREPARE VS EXECUTE OPERATIONAL ACTION FLOW:
    Executes a staged operational action (PREPARE_REROUTE -> REROUTE_EXECUTED or PREPARE_SWITCH -> SWITCH_EXECUTED).
    Updates carrier dispatch status, resolves active exception, and appends an immutable entry to AuditLog.
    """
    profile = verify_business_ownership(db, current_user, business_profile_id)
    shipment = db.query(Shipment).filter(
        Shipment.id == shipment_id,
        Shipment.business_id == profile.id
    ).first()
    if not shipment:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Shipment not found.")

    prev_state = shipment.action_state
    if action_in.action_type == "EXECUTE_REROUTE":
        new_state = "REROUTE_EXECUTED"
    elif action_in.action_type == "EXECUTE_SWITCH":
        new_state = "SWITCH_EXECUTED"
    else:
        new_state = f"{action_in.action_type}_EXECUTED"

    shipment.action_state = new_state
    shipment.updated_at = datetime.utcnow()

    # Mitigate active exceptions for this shipment
    for exc in shipment.exceptions:
        if exc.status == "ACTIVE":
            exc.action_state = new_state
            exc.status = "MITIGATED"
            exc.updated_at = datetime.utcnow()
            db.add(exc)

    user_display = current_user.full_name or "Mohith K (Procurement Director)"
    audit_id = str(uuid.uuid4())
    audit_entry = AuditLog(
        id=audit_id,
        business_profile_id=profile.id,
        user_name=user_display,
        user_id=current_user.id,
        action=f"OPERATIONAL_{action_in.action_type}",
        target_entity_type="shipment",
        target_entity_name=f"{shipment.shipment_number} ({shipment.carrier_name})",
        previous_state=prev_state,
        new_state=new_state,
        source="Operational Supply Chain Control Tower",
        proposal_id=None,
        timestamp=datetime.utcnow(),
        details={
            "shipment_id": shipment.id,
            "shipment_number": shipment.shipment_number,
            "action_type": action_in.action_type,
            "carrier_instructions": action_in.carrier_instructions,
            "dispatch_reference": action_in.dispatch_reference,
            "carrier_name": shipment.carrier_name,
            "audit_rationale": "Secondary operational execution confirmed by authorized human user."
        }
    )
    db.add(audit_entry)
    db.commit()

    return ShipmentActionExecutionResponse(
        shipment_id=shipment.id,
        shipment_number=shipment.shipment_number,
        previous_action_state=prev_state,
        new_action_state=new_state,
        carrier_name=shipment.carrier_name,
        execution_timestamp=datetime.utcnow(),
        audit_log_id=audit_id,
        status_message=f"Operational action {action_in.action_type} successfully executed. Carrier manifest generated ({action_in.dispatch_reference})."
    )
