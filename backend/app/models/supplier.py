import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    business_id = Column(String(36), ForeignKey("business_profiles.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(255), nullable=False, index=True)
    supplier_type = Column(String(100), nullable=False, default="Raw Material")  # Raw Material, Component, Packaging, Logistics, Service
    location = Column(String(100), nullable=False)
    country = Column(String(100), nullable=False, default="India")
    products_or_materials = Column(JSON, nullable=False, default=list)  # list of strings or item descriptions
    dependency_percentage = Column(Float, nullable=False, default=0.0)
    lead_time_days = Column(Integer, nullable=False, default=7)
    status = Column(String(50), nullable=False, default="Active")  # Active, Under Review, Inactive
    contact_information = Column(JSON, nullable=True)  # {"contact_person": "...", "phone": "...", "email": "..."}
    risk_status = Column(String(50), nullable=False, default="Low")  # Low, Medium, High, Critical
    is_demo = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    business_profile = relationship("BusinessProfile", back_populates="suppliers")
    documents = relationship("SupplierDocument", back_populates="supplier", cascade="all, delete-orphan")
    supply_items = relationship("SupplyItem", back_populates="primary_supplier")
    risks = relationship("SupplyChainRisk", back_populates="supplier")


class SupplierDocument(Base):
    __tablename__ = "supplier_documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    supplier_id = Column(String(36), ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True, index=True)

    document_name = Column(String(255), nullable=False)
    document_type = Column(String(100), nullable=False)  # Quality Certificate, GST Clearance, ISO 9001, Vendor Contract, Safety Audit
    verification_status = Column(String(50), nullable=False, default="Pending")  # Verified, Pending, Expired, Missing
    expiry_date = Column(String(50), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    supplier = relationship("Supplier", back_populates="documents")
    vault_document = relationship("Document")


class SupplyItem(Base):
    __tablename__ = "supply_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    business_id = Column(String(36), ForeignKey("business_profiles.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(255), nullable=False, index=True)
    category = Column(String(100), nullable=False, default="Raw Material")  # Raw Material, Packaging, Component, Consumable
    criticality = Column(String(50), nullable=False, default="High")  # Critical, High, Medium, Low
    primary_supplier_id = Column(String(36), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True)
    alternate_supplier_count = Column(Integer, nullable=False, default=0)
    dependency_percentage = Column(Float, nullable=False, default=100.0)
    monthly_consumption = Column(String(100), nullable=True)
    buffer_stock_days = Column(Integer, nullable=False, default=15)
    is_demo = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    business_profile = relationship("BusinessProfile", back_populates="supply_items")
    primary_supplier = relationship("Supplier", back_populates="supply_items")
    risks = relationship("SupplyChainRisk", back_populates="supply_item")


class SupplyChainRisk(Base):
    __tablename__ = "supply_chain_risks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    business_id = Column(String(36), ForeignKey("business_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    supplier_id = Column(String(36), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True)
    supply_item_id = Column(String(36), ForeignKey("supply_items.id", ondelete="SET NULL"), nullable=True, index=True)

    title = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False)  # Single Supplier Dependency, Missing Documentation, Extended Lead Time, Geographic Concentration, Critical Buffer Depletion
    priority = Column(String(50), nullable=False, default="High")  # Critical, High, Medium, Low
    severity = Column(String(50), nullable=False, default="Warning")  # Critical, Warning, Info
    evidence = Column(JSON, nullable=False, default=dict)
    issue = Column(Text, nullable=False)
    cause = Column(Text, nullable=False)
    recommended_action = Column(Text, nullable=False)
    estimated_cost = Column(Float, nullable=False, default=0.0)
    estimated_risk_reduction = Column(Float, nullable=False, default=0.0)
    effort = Column(String(50), nullable=False, default="Medium")  # Low, Medium, High
    confidence = Column(Float, nullable=False, default=0.85)
    status = Column(String(50), nullable=False, default="DETECTED")  # DETECTED, ANALYZING, RECOMMENDED, VALIDATED, AWAITING_APPROVAL, APPROVED, ACTION_CREATED, MONITORING, RESOLVED, DISMISSED
    policy_check_status = Column(String(50), nullable=False, default="PASS")  # PASS, REVIEW_REQUIRED, BLOCK
    is_demo = Column(Boolean, nullable=False, default=False)

    detected_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    business_profile = relationship("BusinessProfile", back_populates="supply_chain_risks")
    supplier = relationship("Supplier", back_populates="risks")
    supply_item = relationship("SupplyItem", back_populates="risks")


class DisruptionEvent(Base):
    __tablename__ = "disruption_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    business_id = Column(String(36), ForeignKey("business_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    supplier_id = Column(String(36), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True)
    supply_item_id = Column(String(36), ForeignKey("supply_items.id", ondelete="SET NULL"), nullable=True, index=True)
    shipment_id = Column(String(100), nullable=True, default="SHP-SAP-9021")

    title = Column(String(255), nullable=False)
    disruption_type = Column(String(100), nullable=False, default="Transit Delay")  # Transit Delay, Supplier Shutdown, Quality Hold, Raw Material Bottleneck
    severity = Column(String(50), nullable=False, default="High")  # Critical, High, Medium, Low
    delay_days = Column(Integer, nullable=False, default=5)
    affected_quantity = Column(Integer, nullable=False, default=500)
    current_inventory = Column(Integer, nullable=False, default=200)
    potential_shortage = Column(Integer, nullable=False, default=300)
    production_exposure_hours = Column(Float, nullable=False, default=40.0)
    status = Column(String(50), nullable=False, default="ACTIVE")  # ACTIVE, MITIGATED, RESOLVED
    evidence = Column(JSON, nullable=False, default=dict)
    is_demo = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    business_profile = relationship("BusinessProfile", back_populates="disruptions")
    supplier = relationship("Supplier")
    supply_item = relationship("SupplyItem")


class SupplyChainDecision(Base):
    __tablename__ = "supply_chain_decisions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    business_id = Column(String(36), ForeignKey("business_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    disruption_id = Column(String(36), ForeignKey("disruption_events.id", ondelete="SET NULL"), nullable=True, index=True)
    scenario_id = Column(String(100), nullable=False)
    scenario_title = Column(String(255), nullable=False)
    decision = Column(String(50), nullable=False)  # APPROVED, REJECTED, MODIFIED
    decision_notes = Column(Text, nullable=True)
    modification_details = Column(JSON, nullable=True)
    confirmed_by = Column(String(100), nullable=False, default="Mohith K (Procurement Director)")
    cost_impact = Column(Float, nullable=False, default=0.0)
    delay_impact_days = Column(Integer, nullable=False, default=0)
    compliance_status = Column(String(50), nullable=False, default="VERIFIED")
    audit_log_id = Column(String(36), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    business_profile = relationship("BusinessProfile", back_populates="supply_chain_decisions")
    disruption = relationship("DisruptionEvent")


class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    business_id = Column(String(36), ForeignKey("business_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    shipment_number = Column(String(100), nullable=False, index=True)  # e.g. SHP-SAP-9021
    supplier_id = Column(String(36), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True)
    supply_item_id = Column(String(36), ForeignKey("supply_items.id", ondelete="SET NULL"), nullable=True, index=True)

    carrier_name = Column(String(255), nullable=False, default="Trans-India Freight Logistics")
    carrier_code = Column(String(50), nullable=False, default="TIFL-882")
    transport_mode = Column(String(50), nullable=False, default="Rail Freight")
    origin_location = Column(String(255), nullable=False, default="Jamshedpur Rail Yard, JH")
    destination_location = Column(String(255), nullable=False, default="Pune Assembly Plant, MH")
    current_location = Column(String(255), nullable=False, default="Nagpur Junction Siding, MH")

    # State machine: CREATED -> ASSIGNED -> PICKUP_PENDING -> PICKUP_CONFIRMED -> IN_TRANSIT -> DELIVERY_ARRIVED -> DELIVERED
    status = Column(String(50), nullable=False, default="IN_TRANSIT")
    # Action state: NORMAL -> PREPARE_REROUTE -> REROUTE_EXECUTED / PREPARE_SWITCH -> SWITCH_EXECUTED
    action_state = Column(String(50), nullable=False, default="NORMAL")

    planned_pickup = Column(DateTime, nullable=False, default=datetime.utcnow)
    actual_pickup = Column(DateTime, nullable=True)
    planned_eta = Column(DateTime, nullable=False, default=datetime.utcnow)
    revised_eta = Column(DateTime, nullable=True)
    eta_variance_days = Column(Integer, nullable=False, default=5)

    material_name = Column(String(255), nullable=False, default="Automotive Grade Steel Sheet (Grade 304)")
    quantity = Column(Integer, nullable=False, default=500)
    quantity_unit = Column(String(50), nullable=False, default="MT")
    required_quantity = Column(Integer, nullable=False, default=500)
    current_inventory = Column(Integer, nullable=False, default=200)
    potential_shortage = Column(Integer, nullable=False, default=300)

    last_telemetry_at = Column(DateTime, nullable=True)
    data_source = Column(String(100), nullable=False, default="SAP S/4HANA OData")
    data_source_mode = Column(String(50), nullable=False, default="SIMULATION")
    is_demo = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    business_profile = relationship("BusinessProfile", back_populates="shipments")
    supplier = relationship("Supplier")
    supply_item = relationship("SupplyItem")
    checkpoints = relationship("ShipmentCheckpoint", back_populates="shipment", cascade="all, delete-orphan", order_by="ShipmentCheckpoint.sequence_order")
    exceptions = relationship("ShipmentException", back_populates="shipment", cascade="all, delete-orphan", order_by="desc(ShipmentException.created_at)")


class ShipmentCheckpoint(Base):
    __tablename__ = "shipment_checkpoints"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    shipment_id = Column(String(36), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True)
    sequence_order = Column(Integer, nullable=False)
    checkpoint_type = Column(String(100), nullable=False)  # ASSIGNED, DEPARTED, PICKUP_ARRIVED, PICKUP_COMPLETED, IN_TRANSIT, SIDING_HOLD, DELIVERY_ARRIVED, DELIVERED
    location_name = Column(String(255), nullable=False)
    location_coords = Column(JSON, nullable=True)
    scheduled_time = Column(DateTime, nullable=False)
    actual_time = Column(DateTime, nullable=True)
    status = Column(String(50), nullable=False, default="PENDING")  # PENDING, COMPLETED, DELAYED, SKIPPED
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    shipment = relationship("Shipment", back_populates="checkpoints")


class ShipmentException(Base):
    __tablename__ = "shipment_exceptions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    business_id = Column(String(36), ForeignKey("business_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    shipment_id = Column(String(36), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True)

    exception_type = Column(String(100), nullable=False, default="ETA_VARIANCE")  # MISSED_CHECKPOINT, STALE_TELEMETRY, PICKUP_DELAY, ETA_VARIANCE, ROUTE_DEVIATION, CARRIER_HOLD
    severity = Column(String(50), nullable=False, default="HIGH")  # CRITICAL, HIGH, MEDIUM, LOW
    status = Column(String(50), nullable=False, default="ACTIVE")  # ACTIVE, ACKNOWLEDGED, MITIGATED, RESOLVED

    # Mandatory 5-part analytical decomposition
    observed_fact = Column(Text, nullable=False)
    evidence = Column(JSON, nullable=False, default=dict)
    assumption = Column(Text, nullable=False)
    risk = Column(Text, nullable=False)
    recommendation = Column(Text, nullable=False)

    action_state = Column(String(50), nullable=False, default="NORMAL")  # NORMAL, PREPARE_REROUTE, REROUTE_EXECUTED, PREPARE_SWITCH, SWITCH_EXECUTED

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    business_profile = relationship("BusinessProfile", back_populates="shipment_exceptions")
    shipment = relationship("Shipment", back_populates="exceptions")
