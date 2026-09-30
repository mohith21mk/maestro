import pytest
import uuid
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.business import BusinessProfile
from app.models.supplier import DisruptionEvent, SupplyChainDecision
from app.models.audit_log import AuditLog
from app.services.auth_service import AuthService
from app.services.supply_chain.sap_adapter import DemoDataProvider, SAPDataProvider, get_supply_chain_data_provider
from app.services.supply_chain.scenario_engine import ScenarioEngine
from app.services.supply_chain.agents import DisruptionSensingAgent, ScenarioPlanningAgent, ComplianceAuditAgent


@pytest.fixture
def auth_user_and_profile(db: Session):
    user_id = str(uuid.uuid4())
    user = User(
        id=user_id,
        email=f"sap_tester_{user_id[:8]}@example.com",
        full_name="Mohith K (Procurement Director)",
        hashed_password="mockhashedpassword"
    )
    db.add(user)
    db.flush()

    profile_id = str(uuid.uuid4())
    profile = BusinessProfile(
        id=profile_id,
        user_id=user.id,
        business_name="Precision Manufacturing Co.",
        business_type="Private Limited",
        industry="Manufacturing",
        business_category="manufacturing",
        city="Coimbatore",
        state="Tamil Nadu",
        country="India",
        company_size="Medium",
        employee_count=150,
    )
    db.add(profile)
    db.commit()

    token = AuthService.create_access_token(data={"sub": user.id})
    return {"user": user, "profile": profile, "token": token}


def test_sap_adapter_status_demo_mode(auth_user_and_profile, client: TestClient):
    profile = auth_user_and_profile["profile"]
    token = auth_user_and_profile["token"]

    response = client.get(
        f"/api/v1/supply-chain/status?business_profile_id={profile.id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["provider_name"] == "DEMO_DATA_PROVIDER"
    assert data["is_demo"] is True
    assert data["sap_ready"] is True
    assert data["sap_connected"] is False
    assert "SAP-Ready" in data["connection_status"]


def test_deterministic_disruption_impact_calculation():
    """Verify 100% deterministic mathematical impact calculations without LLM invention."""
    impact = ScenarioEngine.calculate_disruption_impact(
        required_quantity=500,
        current_inventory=200,
        daily_consumption_rate=50.0,
        delay_days=5,
        hourly_downtime_cost=1250.0
    )
    assert impact["potential_shortage"] == 300  # 500 - 200 = 300
    assert impact["days_of_coverage"] == 4.0   # 200 / 50 = 4.0
    assert impact["buffer_deficit_days"] == 1.0  # 5 - 4.0 = 1.0 day deficit
    assert impact["production_exposure_hours"] == 8.0  # 1 day * 8h = 8.0 hours
    assert impact["estimated_downtime_risk_cost"] == 10000.0  # 8 * $1250 = $10,000


def test_disruption_simulation_endpoint(auth_user_and_profile, client: TestClient, db: Session):
    profile = auth_user_and_profile["profile"]
    token = auth_user_and_profile["token"]

    payload = {
        "title": "Supplier A Shipment Delayed 5 Days (Transit Bottleneck)",
        "delay_days": 5,
        "required_quantity": 500,
        "current_inventory": 200,
        "material_name": "[DEMO DATA] Steel Sheet (Grade 304, Cold Rolled)",
        "supplier_name": "[DEMO DATA] Bharat Heavy Steel Forge Ltd (Supplier A)",
        "shipment_id": "SHP-SAP-9021"
    }

    response = client.post(
        f"/api/v1/supply-chain/disruptions/simulate?business_profile_id={profile.id}",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Supplier A Shipment Delayed 5 Days (Transit Bottleneck)"
    assert data["affected_quantity"] == 500
    assert data["current_inventory"] == 200
    assert data["potential_shortage"] == 300
    assert data["status"] == "ACTIVE"
    assert data["is_demo"] is True

    # Check persistence in database
    persisted = db.query(DisruptionEvent).filter(DisruptionEvent.id == data["id"]).first()
    assert persisted is not None
    assert persisted.potential_shortage == 300


def test_3_agent_scenario_generation(auth_user_and_profile, client: TestClient):
    profile = auth_user_and_profile["profile"]
    token = auth_user_and_profile["token"]

    response = client.post(
        f"/api/v1/supply-chain/scenarios/generate?business_profile_id={profile.id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()

    assert data["recommended_scenario_id"] == "SCENARIO_3_HYBRID_STOCK_SUPPLIER_B"
    assert len(data["scenarios"]) == 4
    assert data["human_approval_required"] is True
    assert "Human approval required" in data["disclaimer"]

    # Verify deterministic scenario comparisons
    s1 = next(s for s in data["scenarios"] if s["scenario_id"] == "SCENARIO_1_WAIT")
    assert s1["total_cost_delta"] == 0.0
    assert s1["production_delay_days"] == 5

    s2 = next(s for s in data["scenarios"] if s["scenario_id"] == "SCENARIO_2_SWITCH_SUPPLIER_B")
    assert s2["total_cost_delta"] == 4300.0  # (500 * $7) + $800 = $4300
    assert s2["production_delay_days"] == 0

    s3 = next(s for s in data["scenarios"] if s["scenario_id"] == "SCENARIO_3_HYBRID_STOCK_SUPPLIER_B")
    assert s3["total_cost_delta"] == 2500.0  # (300 * $7) + $400 = $2500
    assert s3["production_delay_days"] == 0
    assert s3["is_recommended"] is True

    s4 = next(s for s in data["scenarios"] if s["scenario_id"] == "SCENARIO_4_EXPEDITED_AIR_ROUTE")
    assert s4["total_cost_delta"] == 4200.0
    assert s4["production_delay_days"] == 1


def test_compliance_audit_agent(auth_user_and_profile, client: TestClient):
    profile = auth_user_and_profile["profile"]
    token = auth_user_and_profile["token"]

    response = client.post(
        f"/api/v1/supply-chain/compliance/audit?supplier_code=VEND-SAP-B02&business_profile_id={profile.id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["overall_status"] == "REVIEW_REQUIRED"
    assert any("Vendor" in m or "Registration" in m or "Approval" in m for m in data["missing_documents"])
    assert data["human_verification_required"] is True
    assert any("GST" in c["check"] for c in data["passed_checks"])
    assert any("Quality" in c["check"] for c in data["passed_checks"])


def test_human_decision_approval_and_audit_logging(auth_user_and_profile, client: TestClient, db: Session):
    profile = auth_user_and_profile["profile"]
    token = auth_user_and_profile["token"]

    # 1. Simulate disruption first
    disrupt_res = client.post(
        f"/api/v1/supply-chain/disruptions/simulate?business_profile_id={profile.id}",
        json={"title": "Steel Sheet Rail Delay", "delay_days": 5, "required_quantity": 500, "current_inventory": 200},
        headers={"Authorization": f"Bearer {token}"}
    )
    disrupt_id = disrupt_res.json()["id"]

    # 2. Submit Human Approval for Scenario 3
    decision_payload = {
        "scenario_id": "SCENARIO_3_HYBRID_STOCK_SUPPLIER_B",
        "scenario_title": "Scenario 3: Utilize Buffer Stock + Procure Shortage from Supplier B",
        "decision": "APPROVED",
        "decision_notes": "Approved 300 units procurement from Supplier B. QA team dispatched to verify factory registration document.",
        "disruption_id": disrupt_id
    }

    dec_res = client.post(
        f"/api/v1/supply-chain/decisions?business_profile_id={profile.id}",
        json=decision_payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert dec_res.status_code == 200
    dec_data = dec_res.json()
    assert dec_data["decision"] == "APPROVED"
    assert dec_data["cost_impact"] == 2500.0
    assert dec_data["audit_log_id"] is not None

    # 3. Verify Disruption transitioned to MITIGATED
    d_after = db.query(DisruptionEvent).filter(DisruptionEvent.id == disrupt_id).first()
    assert d_after.status == "MITIGATED"

    # 4. Verify immutable AuditLog created
    audit = db.query(AuditLog).filter(AuditLog.id == dec_data["audit_log_id"]).first()
    assert audit is not None
    assert audit.action == "SUPPLY_CHAIN_APPROVED"
    assert audit.target_entity_type == "supply_chain_scenario"
    assert audit.user_name == "Mohith K (Procurement Director)"
    assert audit.details["cost_impact_usd"] == 2500.0


def test_human_decision_rejection_and_modification(auth_user_and_profile, client: TestClient, db: Session):
    profile = auth_user_and_profile["profile"]
    token = auth_user_and_profile["token"]

    # Test Modification Decision
    mod_payload = {
        "scenario_id": "SCENARIO_3_HYBRID_STOCK_SUPPLIER_B",
        "scenario_title": "Scenario 3: Modified Parameter Run",
        "decision": "MODIFIED",
        "decision_notes": "Modified allocation: order 250 units instead of 300 due to revised line rate.",
        "modification_details": {"adjusted_quantity": 250, "re_audit_required": True}
    }

    res = client.post(
        f"/api/v1/supply-chain/decisions?business_profile_id={profile.id}",
        json=mod_payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["decision"] == "MODIFIED"
    assert data["modification_details"]["adjusted_quantity"] == 250


def test_sap_data_provider_fallback_without_credentials():
    """Verify that unconfigured SAP data provider refuses fake responses."""
    sap = SAPDataProvider()
    assert sap.is_configured() is False
    with pytest.raises(RuntimeError) as exc:
        sap.get_suppliers("test-business")
    assert "Live SAP Data Provider is not configured" in str(exc.value)
