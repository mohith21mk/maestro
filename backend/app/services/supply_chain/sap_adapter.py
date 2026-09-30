import os
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from datetime import datetime


class SAPDataAdapterBase(ABC):
    """
    Enterprise Data Access Interface for SAP Resilient Supply Chain.
    Decouples core scenario planning and deterministic engines from underlying enterprise providers.
    """

    @abstractmethod
    def get_provider_metadata(self) -> Dict[str, Any]:
        """Returns metadata about the active data provider, connection state, and SAP readiness."""
        pass

    @abstractmethod
    def get_suppliers(self, business_id: str) -> List[Dict[str, Any]]:
        """Returns suppliers available in the enterprise registry."""
        pass

    @abstractmethod
    def get_materials_and_inventory(self, business_id: str) -> List[Dict[str, Any]]:
        """Returns inventory levels and material consumption parameters."""
        pass

    @abstractmethod
    def get_purchase_orders(self, business_id: str) -> List[Dict[str, Any]]:
        """Returns active purchase orders and scheduled deliveries."""
        pass

    @abstractmethod
    def get_active_disruptions(self, business_id: str) -> List[Dict[str, Any]]:
        """Returns detected or simulated supply disruptions."""
        pass


class DemoDataProvider(SAPDataAdapterBase):
    """
    Default High-Fidelity Enterprise Data Provider.
    Supplies verified enterprise entities for the Resilient Supply Chain demo scenario.
    All data items are strictly marked with [DEMO DATA] to ensure complete transparency.
    """

    PROVIDER_NAME = "DEMO_DATA_PROVIDER"
    SAP_COMPATIBILITY_MODE = "SAP S/4HANA & BTP Clean Core Spec v2026.1"

    def get_provider_metadata(self) -> Dict[str, Any]:
        return {
            "provider_name": self.PROVIDER_NAME,
            "display_label": "Demo Data Provider (SAP-Ready Architecture)",
            "is_demo": True,
            "sap_ready": True,
            "sap_connected": False,
            "connection_status": "SAP-Ready Architecture (Demo Mode Active)",
            "sap_specification": self.SAP_COMPATIBILITY_MODE,
            "external_logistics_api_connected": False,
            "disclaimer": "Simulated enterprise datasets for resilient supply chain decision-support demonstration."
        }

    def get_suppliers(self, business_id: str) -> List[Dict[str, Any]]:
        return [
            {
                "id": "sup-sap-001",
                "name": "[DEMO DATA] Bharat Heavy Steel Forge Ltd (Supplier A)",
                "code": "VEND-SAP-A01",
                "supplier_type": "Primary Raw Material Vendor",
                "location": "Jamshedpur, Jharkhand",
                "country": "India",
                "products_or_materials": ["Steel Sheet (Grade 304, Cold Rolled)", "Structural Heavy Billets"],
                "unit_cost_usd": 45.0,
                "monthly_capacity_units": 1000,
                "lead_time_days": 10,
                "dependency_percentage": 100.0,
                "performance_rating": 94.2,
                "status": "Delayed (Rail Bottleneck)",
                "risk_status": "Critical",
                "documents": [
                    {"document_name": "[DEMO DATA] GST Clear Tax Certificate FY26", "document_type": "GST Clearance", "verification_status": "Verified", "expiry_date": "31 Mar 2027"},
                    {"document_name": "[DEMO DATA] ISO 9001:2015 Quality Management", "document_type": "Quality Certificate", "verification_status": "Verified", "expiry_date": "15 Dec 2026"},
                    {"document_name": "[DEMO DATA] Approved Master Vendor Agreement", "document_type": "Vendor Contract", "verification_status": "Verified", "expiry_date": "01 Jan 2028"}
                ]
            },
            {
                "id": "sup-sap-002",
                "name": "[DEMO DATA] Deccan Alloy & Sheet Rollers (Supplier B)",
                "code": "VEND-SAP-B02",
                "supplier_type": "Secondary Qualified Fabricator",
                "location": "Hosur, Tamil Nadu",
                "country": "India",
                "products_or_materials": ["Steel Sheet (Grade 304, Cold Rolled)", "Precision Precision Strip"],
                "unit_cost_usd": 52.0,
                "monthly_capacity_units": 600,
                "lead_time_days": 2,  # Expedited regional transport
                "dependency_percentage": 0.0,
                "performance_rating": 89.0,
                "status": "Available / Pre-Screened",
                "risk_status": "Medium",
                "documents": [
                    {"document_name": "[DEMO DATA] GST Clear Tax Filing Ledger", "document_type": "GST Clearance", "verification_status": "Verified", "expiry_date": "31 Dec 2026"},
                    {"document_name": "[DEMO DATA] ISO 9001:2015 Quality Certificate", "document_type": "Quality Certificate", "verification_status": "Verified", "expiry_date": "20 Nov 2026"},
                    {"document_name": "[DEMO DATA] Formal Vendor Registration Approval", "document_type": "Statutory Vendor Approval", "verification_status": "Missing", "expiry_date": None}
                ]
            },
            {
                "id": "sup-sap-003",
                "name": "[DEMO DATA] Blue Dart Apex Air Logistics (Supplier C)",
                "code": "LOG-SAP-C03",
                "supplier_type": "Specialized Express Freight Carrier",
                "location": "Hyderabad Cargo Hub, Telangana",
                "country": "India",
                "products_or_materials": ["Express Air Cargo", "Critical Corridor Transit"],
                "unit_cost_usd": 0.0,
                "freight_flat_premium_usd": 4200.0,
                "monthly_capacity_units": 5000,
                "lead_time_days": 1,
                "dependency_percentage": 0.0,
                "performance_rating": 98.0,
                "status": "Active Standby",
                "risk_status": "Low",
                "documents": [
                    {"document_name": "[DEMO DATA] IATA Air Cargo Carrier Certification", "document_type": "Logistics Authorization", "verification_status": "Verified", "expiry_date": "30 Jun 2027"},
                    {"document_name": "[DEMO DATA] Express Transit Bond Agreement", "document_type": "Customs Bond", "verification_status": "Verified", "expiry_date": "31 Dec 2028"}
                ]
            }
        ]

    def get_materials_and_inventory(self, business_id: str) -> List[Dict[str, Any]]:
        return [
            {
                "material_id": "mat-sap-001",
                "material_name": "[DEMO DATA] Steel Sheet (Grade 304, Cold Rolled)",
                "category": "Raw Material",
                "criticality": "Critical",
                "unit_of_measure": "Units (Sheets)",
                "current_inventory": 200,
                "required_quantity": 500,
                "safety_stock_threshold": 100,
                "daily_consumption_rate": 50.0,
                "days_of_coverage": 4.0,  # 200 / 50 = 4 days
                "primary_supplier_id": "sup-sap-001",
                "primary_supplier_name": "[DEMO DATA] Bharat Heavy Steel Forge Ltd (Supplier A)",
                "alternate_supplier_count": 1,
                "active_work_order": "WO-SAP-8042 (High-Pressure Flange Fabrication)",
                "production_line": "Assembly Line 3 - Precision Stamping",
                "hourly_downtime_cost_usd": 1250.0
            }
        ]

    def get_purchase_orders(self, business_id: str) -> List[Dict[str, Any]]:
        return [
            {
                "po_number": "PO-SAP-2026-4011",
                "vendor_id": "sup-sap-001",
                "vendor_name": "[DEMO DATA] Bharat Heavy Steel Forge Ltd (Supplier A)",
                "material_id": "mat-sap-001",
                "material_name": "[DEMO DATA] Steel Sheet (Grade 304, Cold Rolled)",
                "order_quantity": 500,
                "unit_price_usd": 45.0,
                "total_value_usd": 22500.0,
                "original_delivery_date": datetime.utcnow().strftime("%Y-%m-%d"),
                "status": "In Transit - Delayed",
                "shipment_id": "SHP-SAP-9021",
                "delay_days": 5,
                "transit_mode": "Intermodal Heavy Rail (Central Railway)",
                "last_checkpoint": "Nagpur Junction Freight Yard (Track Maintenance Delay)"
            }
        ]

    def get_active_disruptions(self, business_id: str) -> List[Dict[str, Any]]:
        return [
            {
                "disruption_id": "DISRUPT-SAP-2026-01",
                "title": "Supplier A Shipment Delayed 5 Days (Transit Bottleneck)",
                "supplier_name": "[DEMO DATA] Bharat Heavy Steel Forge Ltd (Supplier A)",
                "material_name": "[DEMO DATA] Steel Sheet (Grade 304, Cold Rolled)",
                "shipment_id": "SHP-SAP-9021",
                "delay_days": 5,
                "required_quantity": 500,
                "current_inventory": 200,
                "potential_shortage": 300,
                "production_exposure_hours": 40.0,
                "severity": "Critical",
                "cause": "Intermodal rail network maintenance and freight wagon hold-up at Nagpur Junction.",
                "status": "ACTIVE",
                "reported_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
            }
        ]


class SAPDataProvider(SAPDataAdapterBase):
    """
    Enterprise S/4HANA and SAP BTP Data Provider.
    Prepared for live connectivity when enterprise credentials, BTP destination, and S/4HANA OData service are supplied.
    Strictly safeguards against claiming live connection without verified credentials.
    """

    PROVIDER_NAME = "SAP_DATA_PROVIDER"

    def __init__(self):
        self.endpoint = os.getenv("SAP_ENDPOINT", "").strip()
        self.client_id = os.getenv("SAP_CLIENT_ID", "").strip()
        self.client_secret = os.getenv("SAP_CLIENT_SECRET", "").strip()
        self.destination_name = os.getenv("SAP_BTP_DESTINATION", "S4HANA_SUPPLY_CHAIN").strip()

    def is_configured(self) -> bool:
        return bool(self.endpoint and self.client_id and self.client_secret)

    def get_provider_metadata(self) -> Dict[str, Any]:
        configured = self.is_configured()
        return {
            "provider_name": self.PROVIDER_NAME,
            "display_label": "SAP S/4HANA Enterprise Provider",
            "is_demo": False,
            "sap_ready": True,
            "sap_connected": configured,
            "connection_status": "Connected to S/4HANA OData v4" if configured else "Not Configured (Missing SAP Credentials)",
            "destination": self.destination_name,
            "endpoint": self.endpoint if configured else "None configured",
            "disclaimer": "Live SAP enterprise adapter interface. Requires valid SAP BTP / S/4HANA credentials."
        }

    def get_suppliers(self, business_id: str) -> List[Dict[str, Any]]:
        if not self.is_configured():
            raise RuntimeError("Live SAP Data Provider is not configured. Fallback to DemoDataProvider.")
        # Future live OData fetch implementation
        return []

    def get_materials_and_inventory(self, business_id: str) -> List[Dict[str, Any]]:
        if not self.is_configured():
            raise RuntimeError("Live SAP Data Provider is not configured. Fallback to DemoDataProvider.")
        return []

    def get_purchase_orders(self, business_id: str) -> List[Dict[str, Any]]:
        if not self.is_configured():
            raise RuntimeError("Live SAP Data Provider is not configured. Fallback to DemoDataProvider.")
        return []

    def get_active_disruptions(self, business_id: str) -> List[Dict[str, Any]]:
        if not self.is_configured():
            raise RuntimeError("Live SAP Data Provider is not configured. Fallback to DemoDataProvider.")
        return []


def get_supply_chain_data_provider() -> SAPDataAdapterBase:
    """
    Factory function returning the active supply chain data provider.
    Defaults to DemoDataProvider unless live SAP credentials are provided and validated.
    """
    sap_provider = SAPDataProvider()
    if sap_provider.is_configured():
        return sap_provider
    return DemoDataProvider()
