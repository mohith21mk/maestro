import pytest
import uuid
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.business import BusinessProfile
from app.models.supplier import Shipment, ShipmentCheckpoint, ShipmentException
from app.models.audit_log import AuditLog
from app.services.auth_service import AuthService
from app.services.supply_chain.exception_engine import ExceptionEngine
from app.services.supply_chain.agents import DisruptionSensingAgent


@pytest.fixture
def auth_user_and_profile(db: Session):
    user_id = str(uuid.uuid4())
    user = User(
        id=user_id,
        email=f"op_tester_{user_id[:8]}@example.com",
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


def test_exception_engine_five_part_decomposition():
    decomp = ExceptionEngine.build_five_part_decomposition(
        shipment_number="SHP-SAP-9021",
        carrier_name="Trans-India Freight Logistics (TIFL-882)",
        current_location="Nagpur Junction Siding, MH",
        variance_days=5,
        inventory_on_hand=200,
        required_qty=500,
        daily_burn_rate=50.0,
        destination_location="Pune Assembly Plant, MH",
        material_name="Automotive Grade Steel Sheet"
    )

    assert "observed_fact" in decomp
    assert "evidence" in decomp
    assert "assumption" in decomp
    assert "risk" in decomp
    assert "recommendation" in decomp

    # Verify 5-part content
    assert "SHP-SAP-9021" in decomp["observed_fact"]
    assert "Nagpur Junction Siding" in decomp["observed_fact"]
    assert decomp["evidence"]["eta_variance_days"] == 5
    assert decomp["evidence"]["current_inventory"] == 200
    assert decomp["evidence"]["required_quantity"] == 500
    assert decomp["evidence"]["projected_shortage"] == 300
    assert decomp["evidence"]["days_of_coverage"] == 4.0
    assert "congestion" in decomp["assumption"].lower() or "rail" in decomp["assumption"].lower()
    assert "exhaust" in decomp["risk"].lower() or "line" in decomp["risk"].lower()
    assert "PREPARE_REROUTE" in decomp["recommendation"]


def test_shipment_endpoints_and_checkpoints(auth_user_and_profile, client: TestClient):
    profile = auth_user_and_profile["profile"]
    headers = {"Authorization": f"Bearer {auth_user_and_profile['token']}"}

    # GET /shipments should automatically seed demo shipment with 7 checkpoints
    res = client.get(
        f"/api/v1/supply-chain/shipments?business_profile_id={profile.id}",
        headers=headers
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1

    shp = data[0]
    assert shp["shipment_number"] == "SHP-SAP-9021"
    assert shp["carrier_code"] == "TIFL-882"
    assert shp["status"] == "IN_TRANSIT"
    assert shp["action_state"] == "NORMAL"
    assert shp["eta_variance_days"] == 5
    assert len(shp["checkpoints"]) == 7

    # Verify chronological sequence of checkpoints
    chk_types = [c["checkpoint_type"] for c in shp["checkpoints"]]
    assert chk_types[0] == "ASSIGNED"
    assert chk_types[1] == "PICKUP_COMPLETED"
    assert chk_types[2] == "DEPARTED"
    assert chk_types[3] == "IN_TRANSIT"
    assert chk_types[4] == "SIDING_HOLD"
    assert chk_types[5] == "DELIVERY_ARRIVED"
    assert chk_types[6] == "DELIVERED"

    # Verify detail endpoint
    detail_res = client.get(
        f"/api/v1/supply-chain/shipments/{shp['id']}?business_profile_id={profile.id}",
        headers=headers
    )
    assert detail_res.status_code == 200
    assert detail_res.json()["id"] == shp["id"]


def test_operational_exceptions_endpoint(auth_user_and_profile, client: TestClient):
    profile = auth_user_and_profile["profile"]
    headers = {"Authorization": f"Bearer {auth_user_and_profile['token']}"}

    # GET /exceptions returns active exceptions with 5-part decomposition
    res = client.get(
        f"/api/v1/supply-chain/exceptions?business_profile_id={profile.id}",
        headers=headers
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1

    exc = data[0]
    assert exc["status"] == "ACTIVE"
    assert exc["observed_fact"] is not None
    assert exc["evidence"]["projected_shortage"] == 300
    assert exc["assumption"] is not None
    assert exc["risk"] is not None
    assert exc["recommendation"] is not None


def test_disruption_sensing_agent_with_operational_exception():
    agent_output = DisruptionSensingAgent.sense_and_evaluate_disruption(
        disruption_input={
            "disruption_id": "DISRUPT-TEST-01",
            "material_name": "Steel Sheet (Grade 304, Cold Rolled)",
            "supplier_name": "Bharat Heavy Steel Forge Ltd (Supplier A)",
            "shipment_id": "SHP-SAP-9021",
            "delay_days": 5,
            "required_quantity": 500,
            "current_inventory": 200,
        }
    )

    assert agent_output["severity"] == "Critical"
    assert "operational_exception" in agent_output
    assert agent_output["operational_exception"]["evidence"]["projected_shortage"] == 300
    assert agent_output["operational_exception"]["observed_fact"] != ""


def test_prepare_vs_execute_flow(auth_user_and_profile, client: TestClient, db: Session):
    profile = auth_user_and_profile["profile"]
    headers = {"Authorization": f"Bearer {auth_user_and_profile['token']}"}

    # 1. Reset/simulate delay to make sure shipment exists in NORMAL state
    sim_res = client.post(
        f"/api/v1/supply-chain/shipments/simulate-delay?business_profile_id={profile.id}",
        headers=headers
    )
    assert sim_res.status_code == 200
    shp_id = sim_res.json()["id"]
    assert sim_res.json()["action_state"] == "NORMAL"

    # 2. Human approval of Scenario 3 sets action state to PREPARE_REROUTE
    dec_res = client.post(
        f"/api/v1/supply-chain/decisions?business_profile_id={profile.id}",
        json={
            "scenario_id": "SCENARIO_3_HYBRID_STOCK_SUPPLIER_B",
            "scenario_title": "Scenario 3: Hybrid Stock Utilization & Partial Supplier B Order",
            "decision": "APPROVED",
            "decision_notes": "Authorized hybrid reroute via secondary road carrier for 300 MT."
        },
        headers=headers
    )
    assert dec_res.status_code == 200

    # Verify shipment is now in PREPARE_REROUTE state
    shp_after_prep = client.get(
        f"/api/v1/supply-chain/shipments/{shp_id}?business_profile_id={profile.id}",
        headers=headers
    ).json()
    assert shp_after_prep["action_state"] == "PREPARE_REROUTE"

    # 3. Secondary confirmation: Execute operational action
    exec_res = client.post(
        f"/api/v1/supply-chain/shipments/{shp_id}/confirm-action?business_profile_id={profile.id}",
        json={
            "action_type": "EXECUTE_REROUTE",
            "carrier_instructions": "Dispatch 300 MT via Western Carrier Road Logistics truckload.",
            "dispatch_reference": "DISPATCH-EXP-9902"
        },
        headers=headers
    )
    assert exec_res.status_code == 200
    exec_data = exec_res.json()
    assert exec_data["previous_action_state"] == "PREPARE_REROUTE"
    assert exec_data["new_action_state"] == "REROUTE_EXECUTED"
    assert exec_data["audit_log_id"] is not None

    # Verify audit log record exists
    audit = db.query(AuditLog).filter(AuditLog.id == exec_data["audit_log_id"]).first()
    assert audit is not None
    assert audit.action == "OPERATIONAL_EXECUTE_REROUTE"
    assert audit.target_entity_type == "shipment"

    # Verify shipment action_state is now REROUTE_EXECUTED
    shp_final = client.get(
        f"/api/v1/supply-chain/shipments/{shp_id}?business_profile_id={profile.id}",
        headers=headers
    ).json()
    assert shp_final["action_state"] == "REROUTE_EXECUTED"


def test_shipment_tenant_isolation(auth_user_and_profile, client: TestClient, db: Session):
    profile1 = auth_user_and_profile["profile"]
    headers1 = {"Authorization": f"Bearer {auth_user_and_profile['token']}"}

    # Create second user and profile
    user2 = User(
        id=str(uuid.uuid4()),
        email="other_tenant@example.com",
        full_name="Other Tenant",
        hashed_password="mockhashedpassword"
    )
    db.add(user2)
    db.flush()

    profile2 = BusinessProfile(
        id=str(uuid.uuid4()),
        user_id=user2.id,
        business_name="Other Business Ltd.",
        business_type="Private Limited",
        industry="Automotive",
        business_category="manufacturing",
        city="Pune",
        state="Maharashtra",
        country="India",
        company_size="Large",
        employee_count=500,
    )
    db.add(profile2)
    db.commit()

    # User 1 creates/seeds shipment
    shp1 = ExceptionEngine.seed_demo_shipment_with_exception(db, profile1.id)

    # User 1 should NOT be allowed to access with profile 2 ID
    res = client.get(
        f"/api/v1/supply-chain/shipments?business_profile_id={profile2.id}",
        headers=headers1
    )
    assert res.status_code == 403

    # User 1 cannot execute action on shipment using profile 2 ID
    res_exec = client.post(
        f"/api/v1/supply-chain/shipments/{shp1.id}/confirm-action?business_profile_id={profile2.id}",
        json={"action_type": "EXECUTE_REROUTE"},
        headers=headers1
    )
    assert res_exec.status_code == 403
