import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.models.supplier import (
    Shipment,
    ShipmentCheckpoint,
    ShipmentException,
    Supplier,
    SupplyItem,
)


class ExceptionEngine:
    """
    Operational Supply Chain Exception Engine.
    Detects operational variances (missed checkpoints, stale telemetry, pickup delays,
    ETA variances, rail siding holds) and generates structured 5-part analytical decompositions:
    1. Observed Fact
    2. Evidence
    3. Assumption
    4. Risk
    5. Recommendation
    """

    @staticmethod
    def build_five_part_decomposition(
        shipment_number: str,
        carrier_name: str,
        current_location: str,
        variance_days: int,
        inventory_on_hand: int,
        required_qty: int,
        daily_burn_rate: float = 50.0,
        destination_location: str = "Pune Assembly Plant, MH",
        material_name: str = "Automotive Grade Steel Sheet"
    ) -> Dict[str, Any]:
        """
        Builds the mandatory 5-part structured analytical decomposition.
        Prevents collapsing operational telemetry into a generic AI paragraph.
        """
        shortage = max(0, required_qty - inventory_on_hand)
        coverage_days = round(inventory_on_hand / daily_burn_rate, 1) if daily_burn_rate > 0 else 0.0
        exposure_hours = round(max(0.0, (variance_days - coverage_days) * 8.0), 1) if variance_days > coverage_days else 0.0
        downtime_cost = round(exposure_hours * 1250.0, 2)

        observed_fact = (
            f"Shipment {shipment_number} operated by {carrier_name} is stationary at {current_location}. "
            f"Carrier telemetry confirms zero forward progression over the last 36 hours. "
            f"Scheduled arrival at {destination_location} has slipped by +{variance_days} business days."
        )

        evidence = {
            "shipment_number": shipment_number,
            "carrier": carrier_name,
            "current_location": current_location,
            "destination": destination_location,
            "material": material_name,
            "stalled_checkpoint": current_location,
            "stale_telemetry_gap_hours": 36,
            "eta_variance_days": variance_days,
            "current_inventory": inventory_on_hand,
            "required_quantity": required_qty,
            "projected_shortage": shortage,
            "days_of_coverage": coverage_days,
            "daily_consumption_rate": daily_burn_rate,
            "production_exposure_hours": exposure_hours,
            "estimated_downtime_cost_usd": downtime_cost,
            "data_source": "Carrier Telemetry API via SAP OData"
        }

        assumption = (
            f"Assuming rail wagon congestion or locomotive reallocation at {current_location} "
            f"will not clear spontaneously within 48 hours without multimodal road transshipment "
            f"or invoking expedited secondary dispatch."
        )

        risk = (
            f"On-hand inventory ({inventory_on_hand} units) will exhaust in {coverage_days} operational days. "
            f"Unmitigated delay will halt Chassis Welding Line 2 at {destination_location} "
            f"for {exposure_hours} hours, incurring an estimated ${downtime_cost:,.0f} in direct downtime penalties "
            f"and customer delivery SLA breaches."
        )

        recommendation = (
            f"Activate Scenario 3 (Hybrid Allocation): Consume current {inventory_on_hand} units buffer "
            f"to sustain plant operations through Day 4, and immediately authorize expedited procurement of "
            f"{shortage} units from regional Supplier B via road carrier. "
            f"Set operational action state to PREPARE_REROUTE pending human authorization."
        )

        return {
            "observed_fact": observed_fact,
            "evidence": evidence,
            "assumption": assumption,
            "risk": risk,
            "recommendation": recommendation,
        }

    @classmethod
    def evaluate_shipment(cls, db: Session, shipment: Shipment) -> List[ShipmentException]:
        """
        Evaluates a shipment's checkpoints and metrics against business rules to detect operational exceptions.
        """
        now = datetime.utcnow()
        new_exceptions: List[ShipmentException] = []

        # 1. Stale Telemetry Check (>24 hours without telemetry while IN_TRANSIT)
        if shipment.status == "IN_TRANSIT" and shipment.last_telemetry_at:
            telemetry_age_hours = (now - shipment.last_telemetry_at).total_seconds() / 3600.0
            if telemetry_age_hours > 24.0:
                existing_stale = db.query(ShipmentException).filter(
                    ShipmentException.shipment_id == shipment.id,
                    ShipmentException.exception_type == "STALE_TELEMETRY",
                    ShipmentException.status == "ACTIVE"
                ).first()
                if not existing_stale:
                    decomp = cls.build_five_part_decomposition(
                        shipment_number=shipment.shipment_number,
                        carrier_name=shipment.carrier_name,
                        current_location=shipment.current_location,
                        variance_days=shipment.eta_variance_days,
                        inventory_on_hand=shipment.current_inventory,
                        required_qty=shipment.required_quantity,
                        destination_location=shipment.destination_location,
                        material_name=shipment.material_name
                    )
                    stale_exc = ShipmentException(
                        id=str(uuid.uuid4()),
                        business_id=shipment.business_id,
                        shipment_id=shipment.id,
                        exception_type="STALE_TELEMETRY",
                        severity="HIGH",
                        status="ACTIVE",
                        observed_fact=f"Carrier telemetry ping gap of {int(telemetry_age_hours)} hours exceeding 24h SLA. Last ping: {shipment.last_telemetry_at.strftime('%Y-%m-%d %H:%M')}.",
                        evidence={**decomp["evidence"], "telemetry_age_hours": round(telemetry_age_hours, 1)},
                        assumption=decomp["assumption"],
                        risk=decomp["risk"],
                        recommendation=decomp["recommendation"],
                        action_state=shipment.action_state,
                    )
                    db.add(stale_exc)
                    new_exceptions.append(stale_exc)

        # 2. ETA Variance & Checkpoint Hold Check (Delay >= 3 days)
        if shipment.eta_variance_days >= 3:
            existing_eta = db.query(ShipmentException).filter(
                ShipmentException.shipment_id == shipment.id,
                ShipmentException.exception_type.in_(["ETA_VARIANCE", "CARRIER_HOLD"]),
                ShipmentException.status == "ACTIVE"
            ).first()
            if not existing_eta:
                decomp = cls.build_five_part_decomposition(
                    shipment_number=shipment.shipment_number,
                    carrier_name=shipment.carrier_name,
                    current_location=shipment.current_location,
                    variance_days=shipment.eta_variance_days,
                    inventory_on_hand=shipment.current_inventory,
                    required_qty=shipment.required_quantity,
                    destination_location=shipment.destination_location,
                    material_name=shipment.material_name
                )
                eta_exc = ShipmentException(
                    id=str(uuid.uuid4()),
                    business_id=shipment.business_id,
                    shipment_id=shipment.id,
                    exception_type="ETA_VARIANCE",
                    severity="CRITICAL" if shipment.eta_variance_days >= 5 else "HIGH",
                    status="ACTIVE",
                    observed_fact=decomp["observed_fact"],
                    evidence=decomp["evidence"],
                    assumption=decomp["assumption"],
                    risk=decomp["risk"],
                    recommendation=decomp["recommendation"],
                    action_state=shipment.action_state,
                )
                db.add(eta_exc)
                new_exceptions.append(eta_exc)

        # 3. Pickup Delay Check (actual_pickup > planned_pickup by > 24 hours)
        if shipment.actual_pickup and shipment.planned_pickup:
            delay_hours = (shipment.actual_pickup - shipment.planned_pickup).total_seconds() / 3600.0
            if delay_hours > 24.0:
                existing_pickup = db.query(ShipmentException).filter(
                    ShipmentException.shipment_id == shipment.id,
                    ShipmentException.exception_type == "PICKUP_DELAY",
                    ShipmentException.status == "ACTIVE"
                ).first()
                if not existing_pickup:
                    pickup_exc = ShipmentException(
                        id=str(uuid.uuid4()),
                        business_id=shipment.business_id,
                        shipment_id=shipment.id,
                        exception_type="PICKUP_DELAY",
                        severity="MEDIUM",
                        status="ACTIVE",
                        observed_fact=f"Carrier pickup occurred {int(delay_hours)} hours later than scheduled origin loading window.",
                        evidence={"planned_pickup": shipment.planned_pickup.isoformat(), "actual_pickup": shipment.actual_pickup.isoformat(), "delay_hours": round(delay_hours, 1)},
                        assumption="Assuming origin loading dock turnaround is not systemic across remaining PO lines.",
                        risk="Tightens in-transit arrival buffer window by over 1 operational shift.",
                        recommendation="Monitor transit checkpoints hourly to verify carrier makes up transit schedule.",
                        action_state=shipment.action_state,
                    )
                    db.add(pickup_exc)
                    new_exceptions.append(pickup_exc)

        if new_exceptions:
            db.commit()

        # Return all active exceptions for this shipment
        return db.query(ShipmentException).filter(
            ShipmentException.shipment_id == shipment.id,
            ShipmentException.status == "ACTIVE"
        ).order_by(ShipmentException.created_at.desc()).all()

    @classmethod
    def seed_demo_shipment_with_exception(
        cls,
        db: Session,
        business_id: str,
        supplier_id: Optional[str] = None,
        supply_item_id: Optional[str] = None
    ) -> Shipment:
        """
        Seeds the canonical demo scenario:
        - Shipment SHP-SAP-9021
        - Material: Automotive Grade Steel Sheet (Grade 304)
        - Required: 500 units, Current Inventory: 200 units, Shortage: 300 units
        - Delayed 5 days at Nagpur Junction siding
        - Checkpoint event log with 7 steps
        - Structured 5-part analytical decomposition exception
        """
        existing = db.query(Shipment).filter(
            Shipment.business_id == business_id,
            Shipment.shipment_number == "SHP-SAP-9021"
        ).first()

        now = datetime.utcnow()
        planned_pickup = now - timedelta(days=4)
        actual_pickup = planned_pickup + timedelta(hours=3)
        planned_eta = now + timedelta(days=1)
        revised_eta = planned_eta + timedelta(days=5)

        if existing:
            # Check if checkpoints exist, if not create them
            if not existing.checkpoints:
                cls._create_checkpoints_for_shipment(db, existing.id, planned_pickup, actual_pickup, planned_eta, revised_eta)
            cls.evaluate_shipment(db, existing)
            return existing

        # Locate demo supplier A and item if not provided
        if not supplier_id:
            sup = db.query(Supplier).filter(Supplier.business_id == business_id).first()
            if sup:
                supplier_id = sup.id

        if not supply_item_id:
            item = db.query(SupplyItem).filter(SupplyItem.business_id == business_id).first()
            if item:
                supply_item_id = item.id

        shipment = Shipment(
            id=str(uuid.uuid4()),
            business_id=business_id,
            shipment_number="SHP-SAP-9021",
            supplier_id=supplier_id,
            supply_item_id=supply_item_id,
            carrier_name="Trans-India Freight Logistics",
            carrier_code="TIFL-882",
            transport_mode="Rail Freight",
            origin_location="Jamshedpur Rail Yard, JH",
            destination_location="Pune Assembly Plant, MH",
            current_location="Nagpur Junction Siding, MH",
            status="IN_TRANSIT",
            action_state="NORMAL",
            planned_pickup=planned_pickup,
            actual_pickup=actual_pickup,
            planned_eta=planned_eta,
            revised_eta=revised_eta,
            eta_variance_days=5,
            material_name="Steel Sheet (Grade 304, Cold Rolled)",
            quantity=500,
            quantity_unit="MT",
            required_quantity=500,
            current_inventory=200,
            potential_shortage=300,
            last_telemetry_at=now - timedelta(hours=36),  # 36 hours stale
            data_source="SAP S/4HANA OData / Carrier Telemetry API",
            data_source_mode="SIMULATION",
            is_demo=True,
            created_at=now - timedelta(days=4),
            updated_at=now
        )
        db.add(shipment)
        db.flush()

        cls._create_checkpoints_for_shipment(db, shipment.id, planned_pickup, actual_pickup, planned_eta, revised_eta)
        cls.evaluate_shipment(db, shipment)
        db.commit()
        db.refresh(shipment)
        return shipment

    @classmethod
    def _create_checkpoints_for_shipment(
        cls,
        db: Session,
        shipment_id: str,
        planned_pickup: datetime,
        actual_pickup: datetime,
        planned_eta: datetime,
        revised_eta: datetime
    ):
        """Creates the 7 operational checkpoints representing the Jamshedpur -> Nagpur -> Pune corridor."""
        checkpoints_data = [
            {
                "sequence_order": 1,
                "checkpoint_type": "ASSIGNED",
                "location_name": "Jamshedpur Logistics Office",
                "location_coords": {"lat": 22.8046, "lng": 86.2029},
                "scheduled_time": planned_pickup - timedelta(hours=12),
                "actual_time": planned_pickup - timedelta(hours=12),
                "status": "COMPLETED",
                "notes": "Rake assignment confirmed: Wagons BOXNHL-4491 to 4505."
            },
            {
                "sequence_order": 2,
                "checkpoint_type": "PICKUP_COMPLETED",
                "location_name": "Jamshedpur Rail Yard, JH",
                "location_coords": {"lat": 22.7925, "lng": 86.1843},
                "scheduled_time": planned_pickup,
                "actual_time": actual_pickup,
                "status": "COMPLETED",
                "notes": "500 MT cold-rolled steel coils loaded. Bill of Lading BL-JH-9021 issued."
            },
            {
                "sequence_order": 3,
                "checkpoint_type": "DEPARTED",
                "location_name": "Tatanagar Junction Rail Corridor",
                "location_coords": {"lat": 22.7667, "lng": 86.1956},
                "scheduled_time": planned_pickup + timedelta(hours=4),
                "actual_time": actual_pickup + timedelta(hours=3),
                "status": "COMPLETED",
                "notes": "Departed eastbound rail line on schedule."
            },
            {
                "sequence_order": 4,
                "checkpoint_type": "IN_TRANSIT",
                "location_name": "Bilaspur Junction Interchange, CG",
                "location_coords": {"lat": 22.0797, "lng": 82.1409},
                "scheduled_time": planned_pickup + timedelta(days=1, hours=8),
                "actual_time": planned_pickup + timedelta(days=1, hours=10),
                "status": "COMPLETED",
                "notes": "Interchange clearance passed with 2-hour delay."
            },
            {
                "sequence_order": 5,
                "checkpoint_type": "SIDING_HOLD",
                "location_name": "Nagpur Junction Siding, MH",
                "location_coords": {"lat": 21.1458, "lng": 79.0882},
                "scheduled_time": planned_pickup + timedelta(days=2),
                "actual_time": planned_pickup + timedelta(days=2, hours=4),
                "status": "DELAYED",
                "notes": "RAIL CONGESTION ALERT: Track maintenance block and locomotive reallocation. Stalled for 36 hours. +5 days ETA variance."
            },
            {
                "sequence_order": 6,
                "checkpoint_type": "DELIVERY_ARRIVED",
                "location_name": "Pune Plant Inbound Gate 4, MH",
                "location_coords": {"lat": 18.5204, "lng": 73.8567},
                "scheduled_time": planned_eta,
                "actual_time": None,
                "status": "PENDING",
                "notes": "Expected arrival rescheduled from planned ETA to revised ETA (+5 days)."
            },
            {
                "sequence_order": 7,
                "checkpoint_type": "DELIVERED",
                "location_name": "Pune Assembly Plant - Chassis Staging Bay",
                "location_coords": {"lat": 18.5284, "lng": 73.8642},
                "scheduled_time": planned_eta + timedelta(hours=6),
                "actual_time": None,
                "status": "PENDING",
                "notes": "Unloading bay reservation pending updated arrival confirmation."
            }
        ]

        for cp in checkpoints_data:
            chk = ShipmentCheckpoint(
                id=str(uuid.uuid4()),
                shipment_id=shipment_id,
                sequence_order=cp["sequence_order"],
                checkpoint_type=cp["checkpoint_type"],
                location_name=cp["location_name"],
                location_coords=cp["location_coords"],
                scheduled_time=cp["scheduled_time"],
                actual_time=cp["actual_time"],
                status=cp["status"],
                notes=cp["notes"],
                created_at=datetime.utcnow()
            )
            db.add(chk)
        db.flush()
