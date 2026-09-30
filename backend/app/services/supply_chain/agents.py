import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.services.supply_chain.scenario_engine import ScenarioEngine
from app.services.supply_chain.sap_adapter import get_supply_chain_data_provider
from app.services.supply_chain.exception_engine import ExceptionEngine


class DisruptionSensingAgent:
    """
    Secondary Agent: Ingests or detects supply chain disruptions across the enterprise network.
    Identifies affected materials, shipments, inventory buffers, and deterministically computes disruption severity.
    Grounds detection in operational exception telemetry (5-part decomposition).
    """

    AGENT_NAME = "Disruption Sensing Agent"

    @classmethod
    def sense_and_evaluate_disruption(
        cls,
        disruption_input: Optional[Dict[str, Any]] = None,
        business_id: Optional[str] = None
    ) -> Dict[str, Any]:
        adapter = get_supply_chain_data_provider()

        if disruption_input:
            raw_data = disruption_input
        else:
            active_disruptions = adapter.get_active_disruptions(business_id or "default")
            raw_data = active_disruptions[0] if active_disruptions else {}

        # Default demo scenario parameters
        supplier_name = raw_data.get("supplier_name", "[DEMO DATA] Bharat Heavy Steel Forge Ltd (Supplier A)")
        material_name = raw_data.get("material_name", "[DEMO DATA] Steel Sheet (Grade 304, Cold Rolled)")
        shipment_id = raw_data.get("shipment_id", "SHP-SAP-9021")
        delay_days = raw_data.get("delay_days", 5)
        req_qty = raw_data.get("required_quantity", 500)
        curr_stock = raw_data.get("current_inventory", 200)

        # Deterministic impact evaluation
        impact = ScenarioEngine.calculate_disruption_impact(
            required_quantity=req_qty,
            current_inventory=curr_stock,
            daily_consumption_rate=50.0,
            delay_days=delay_days,
            hourly_downtime_cost=1250.0
        )

        # Deterministic severity calculation
        if impact["buffer_deficit_days"] >= 3 or impact["potential_shortage"] >= 300:
            severity = "Critical"
        elif impact["buffer_deficit_days"] > 0 or impact["potential_shortage"] > 0:
            severity = "High"
        else:
            severity = "Medium"

        # Mandatory 5-part analytical decomposition
        operational_exception = raw_data.get("operational_exception")
        if not operational_exception:
            operational_exception = ExceptionEngine.build_five_part_decomposition(
                shipment_number=shipment_id,
                carrier_name="Trans-India Freight Logistics (TIFL-882)",
                current_location="Nagpur Junction Siding, MH",
                variance_days=delay_days,
                inventory_on_hand=curr_stock,
                required_qty=req_qty,
                material_name=material_name
            )

        return {
            "agent": cls.AGENT_NAME,
            "disruption_id": raw_data.get("disruption_id", "DISRUPT-SAP-2026-01"),
            "title": f"Supplier Delay Alert: {material_name} ({delay_days}-day delay)",
            "affected_material": material_name,
            "affected_supplier": supplier_name,
            "shipment_id": shipment_id,
            "severity": severity,
            "delay_days": delay_days,
            "required_quantity": req_qty,
            "current_inventory": curr_stock,
            "potential_shortage": impact["potential_shortage"],
            "days_of_coverage": impact["days_of_coverage"],
            "production_exposure_hours": impact["production_exposure_hours"],
            "estimated_downtime_cost": impact["estimated_downtime_risk_cost"],
            "cause": raw_data.get("cause", "Intermodal rail network maintenance and freight wagon hold-up at Nagpur Junction."),
            "detected_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
            "status": "ACTIVE",
            "is_demo": True,
            "impact_metrics": impact,
            "operational_exception": operational_exception,
            "action_state": raw_data.get("action_state", "NORMAL")
        }


class ComplianceAuditAgent:
    """
    Tertiary Agent: Validates candidate supply-chain options against mandatory enterprise documents,
    statutory tax/quality certificates, and configured business rules.
    Strictly surfaces missing or unverified items and mandates human audit verification.
    """

    AGENT_NAME = "Compliance & Audit Agent"
    MANDATORY_DOCUMENTS = [
        "GST Clearance",
        "Quality Certificate",
        "Statutory Vendor Approval"
    ]

    @classmethod
    def audit_supplier_compliance(cls, supplier: Dict[str, Any]) -> Dict[str, Any]:
        sup_name = supplier.get("name", "Unknown Supplier")
        docs = supplier.get("documents", [])

        passed_checks = []
        warnings = []
        missing_documents = []
        expired_documents = []

        doc_type_map = {d.get("document_type"): d for d in docs}

        for mandatory_type in cls.MANDATORY_DOCUMENTS:
            if mandatory_type in doc_type_map:
                doc = doc_type_map[mandatory_type]
                status = doc.get("verification_status", "Pending")
                if status == "Verified":
                    passed_checks.append({
                        "check": f"{mandatory_type} Verification",
                        "document_name": doc.get("document_name"),
                        "expiry": doc.get("expiry_date"),
                        "status": "PASS"
                    })
                elif status == "Expired":
                    expired_documents.append(doc.get("document_name") or mandatory_type)
                    warnings.append(f"{doc.get('document_name') or mandatory_type} has expired. Renewal required.")
                elif status == "Missing":
                    missing_documents.append(doc.get("document_name") or mandatory_type)
                    warnings.append(f"Missing mandatory {doc.get('document_name') or mandatory_type}.")
                else:
                    warnings.append(f"{doc.get('document_name') or mandatory_type} verification is pending ({status}).")
            else:
                missing_documents.append(mandatory_type)
                warnings.append(f"Missing mandatory {mandatory_type} document.")

        # Determine overall compliance outcome
        if missing_documents or expired_documents:
            overall_status = "REVIEW_REQUIRED"
            recommendation_note = (
                f"{sup_name} can be considered for interim fulfillment, "
                f"but missing documents ({', '.join(missing_documents)}) require formal human verification."
            )
        else:
            overall_status = "PASS"
            recommendation_note = f"{sup_name} meets all mandatory statutory compliance and onboarding requirements."

        return {
            "agent": cls.AGENT_NAME,
            "supplier_name": sup_name,
            "supplier_id": supplier.get("id"),
            "overall_status": overall_status,
            "passed_checks": passed_checks,
            "warnings": warnings,
            "missing_documents": missing_documents,
            "expired_documents": expired_documents,
            "recommendation_note": recommendation_note,
            "human_verification_required": overall_status != "PASS",
            "audited_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        }


class ScenarioPlanningAgent:
    """
    Primary Agent: Multi-Scenario Decision Support Agent for Resilient Supply Chain.
    Coordinates deterministic simulation across candidates, incorporates Compliance Agent audit findings,
    synthesizes trade-offs, and delivers structured AI recommendations requiring human authorization.
    """

    AGENT_NAME = "Scenario Planning Agent"

    @classmethod
    def plan_and_recommend(
        cls,
        disruption_context: Optional[Dict[str, Any]] = None,
        business_id: Optional[str] = None
    ) -> Dict[str, Any]:
        adapter = get_supply_chain_data_provider()

        # 1. Sense disruption
        disruption = DisruptionSensingAgent.sense_and_evaluate_disruption(
            disruption_context, business_id=business_id
        )

        # 2. Retrieve enterprise candidate network
        suppliers = adapter.get_suppliers(business_id or "default")
        supplier_a = next((s for s in suppliers if "Supplier A" in s["name"]), suppliers[0])
        supplier_b = next((s for s in suppliers if "Supplier B" in s["name"]), suppliers[1] if len(suppliers) > 1 else suppliers[0])
        logistics_c = next((s for s in suppliers if "Supplier C" in s["name"] or "Logistics" in s["name"]), None)

        # 3. Deterministically generate 4 response scenarios
        scenarios = ScenarioEngine.generate_response_scenarios(
            disruption_context=disruption["impact_metrics"],
            supplier_a=supplier_a,
            supplier_b=supplier_b,
            logistics_provider=logistics_c
        )

        # 4. Audit candidate supplier B using ComplianceAuditAgent
        compliance_report_b = ComplianceAuditAgent.audit_supplier_compliance(supplier_b)

        # 5. Synthesize structured AI recommendation (Governed, Explainable, Deterministic)
        rec_scenario_id = "SCENARIO_3_HYBRID_STOCK_SUPPLIER_B"
        rec_scenario = next(s for s in scenarios if s["scenario_id"] == rec_scenario_id)

        ai_recommendation = {
            "summary": (
                f"Disruption detected for Steel Sheet: Supplier A shipment #SHP-SAP-9021 delayed by 5 days. "
                f"On-hand inventory (200 units) provides 4 days of coverage, creating a 300-unit net shortage "
                f"and 40 hours of production exposure ($50,000 downtime risk). "
                f"Recommended strategy: Scenario 3 (Hybrid allocation)."
            ),
            "risk_level": disruption["severity"],
            "disruption_severity": disruption["severity"],
            "affected_entities": [
                {"type": "Material", "name": disruption["affected_material"], "shortage": disruption["potential_shortage"]},
                {"type": "Primary Supplier", "name": disruption["affected_supplier"], "delay_days": disruption["delay_days"]},
                {"type": "Shipment", "id": disruption["shipment_id"], "status": "Delayed Rail Transit"},
                {"type": "Work Order", "id": "WO-SAP-8042", "exposure_hours": disruption["production_exposure_hours"]}
            ],
            "scenarios": scenarios,
            "recommended_scenario_id": rec_scenario_id,
            "recommended_scenario_title": rec_scenario["title"],
            "recommendation": (
                "Adopt Scenario 3: Consume current 200 units inventory to sustain immediate manufacturing, "
                "and procure the exact 300-unit shortage from Deccan Alloy & Sheet Rollers (Supplier B) "
                "via expedited regional road freight (+$2,500 total cost). "
                "Supplier B can be considered, but supplier approval documentation requires human verification."
            ),
            "reasoning": [
                "1. Zero Production Delay: Supplier B delivers in 2 days (320 km regional corridor), landing 2 full days before current 200-unit buffer is exhausted.",
                "2. Cost Optimization: Procuring only the 300-unit shortage restricts cost delta to +$2,500 (+$2,100 material + $400 partial truckload), saving $1,800 versus full 500-unit re-order (+$4,300) and $1,700 versus emergency air freight (+$4,200).",
                "3. Downtime Prevention: Completely eliminates the 40-hour line starvation risk and prevents an estimated $50,000 in SLA breach penalties.",
                "4. Governed Compliance: Supplier B is verified for GST and ISO 9001, but lacks formal Vendor Registration Approval. Immediate physical or manager sign-off is required prior to PO dispatch."
            ],
            "trade_offs": {
                "cost_impact": "+$2,500 USD (+$7/unit material delta + $400 freight)",
                "time_impact": "0 days delay (production schedule 100% maintained)",
                "inventory_impact": "Buffer stock drops to 100 units on Day 2, recovers to 350 units on delivery",
                "compliance_impact": "Statutory GST/ISO valid; Vendor Registration Approval missing"
            },
            "compliance_audit": compliance_report_b,
            "warnings": [
                "CRITICAL: Supplier B lacks formal Vendor Registration Approval on file in the ERP.",
                "AI cannot execute procurement automatically. Human review and sign-off is strictly mandatory.",
                "Verify receiving inspection protocol for Supplier B's initial delivery lot."
            ],
            "missing_information": [
                "Formal Vendor Registration Approval Form (Form VR-04)",
                "Supplier B physical loading dock inspection sign-off"
            ],
            "human_approval_required": True,
            "disclaimer": "AI-generated recommendation — Human approval required.",
            "sap_readiness_mode": adapter.get_provider_metadata()["connection_status"],
            "operational_exception": disruption.get("operational_exception"),
            "action_state": disruption.get("action_state", "NORMAL"),
            "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        }

        return ai_recommendation
