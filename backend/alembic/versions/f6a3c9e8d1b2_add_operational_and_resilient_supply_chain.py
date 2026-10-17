"""add_operational_and_resilient_supply_chain

Revision ID: f6a3c9e8d1b2
Revises: e592b8c9f3a4
Create Date: 2026-10-16 23:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6a3c9e8d1b2'
down_revision: Union[str, None] = 'e592b8c9f3a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. disruption_events
    op.create_table(
        'disruption_events',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('business_id', sa.String(length=36), sa.ForeignKey('business_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('supplier_id', sa.String(length=36), sa.ForeignKey('suppliers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('supply_item_id', sa.String(length=36), sa.ForeignKey('supply_items.id', ondelete='SET NULL'), nullable=True),
        sa.Column('shipment_id', sa.String(length=100), nullable=True, server_default='SHP-SAP-9021'),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('disruption_type', sa.String(length=100), nullable=False, server_default='Transit Delay'),
        sa.Column('severity', sa.String(length=50), nullable=False, server_default='High'),
        sa.Column('delay_days', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('affected_quantity', sa.Integer(), nullable=False, server_default='500'),
        sa.Column('current_inventory', sa.Integer(), nullable=False, server_default='200'),
        sa.Column('potential_shortage', sa.Integer(), nullable=False, server_default='300'),
        sa.Column('production_exposure_hours', sa.Float(), nullable=False, server_default='40.0'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='ACTIVE'),
        sa.Column('evidence', sa.JSON(), nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index(op.f('ix_disruption_events_id'), 'disruption_events', ['id'], unique=False)
    op.create_index(op.f('ix_disruption_events_business_id'), 'disruption_events', ['business_id'], unique=False)
    op.create_index(op.f('ix_disruption_events_supplier_id'), 'disruption_events', ['supplier_id'], unique=False)
    op.create_index(op.f('ix_disruption_events_supply_item_id'), 'disruption_events', ['supply_item_id'], unique=False)

    # 2. supply_chain_decisions
    op.create_table(
        'supply_chain_decisions',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('business_id', sa.String(length=36), sa.ForeignKey('business_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('disruption_id', sa.String(length=36), sa.ForeignKey('disruption_events.id', ondelete='SET NULL'), nullable=True),
        sa.Column('scenario_id', sa.String(length=100), nullable=False),
        sa.Column('scenario_title', sa.String(length=255), nullable=False),
        sa.Column('decision', sa.String(length=50), nullable=False),
        sa.Column('decision_notes', sa.Text(), nullable=True),
        sa.Column('modification_details', sa.JSON(), nullable=True),
        sa.Column('confirmed_by', sa.String(length=100), nullable=False, server_default='Mohith K (Procurement Director)'),
        sa.Column('cost_impact', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('delay_impact_days', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('compliance_status', sa.String(length=50), nullable=False, server_default='VERIFIED'),
        sa.Column('audit_log_id', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index(op.f('ix_supply_chain_decisions_id'), 'supply_chain_decisions', ['id'], unique=False)
    op.create_index(op.f('ix_supply_chain_decisions_business_id'), 'supply_chain_decisions', ['business_id'], unique=False)
    op.create_index(op.f('ix_supply_chain_decisions_disruption_id'), 'supply_chain_decisions', ['disruption_id'], unique=False)

    # 3. shipments
    op.create_table(
        'shipments',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('business_id', sa.String(length=36), sa.ForeignKey('business_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('shipment_number', sa.String(length=100), nullable=False),
        sa.Column('supplier_id', sa.String(length=36), sa.ForeignKey('suppliers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('supply_item_id', sa.String(length=36), sa.ForeignKey('supply_items.id', ondelete='SET NULL'), nullable=True),
        sa.Column('carrier_name', sa.String(length=255), nullable=False, server_default='Trans-India Freight Logistics'),
        sa.Column('carrier_code', sa.String(length=50), nullable=False, server_default='TIFL-882'),
        sa.Column('transport_mode', sa.String(length=50), nullable=False, server_default='Rail Freight'),
        sa.Column('origin_location', sa.String(length=255), nullable=False, server_default='Jamshedpur Rail Yard, JH'),
        sa.Column('destination_location', sa.String(length=255), nullable=False, server_default='Pune Assembly Plant, MH'),
        sa.Column('current_location', sa.String(length=255), nullable=False, server_default='Nagpur Junction Siding, MH'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='IN_TRANSIT'),
        sa.Column('action_state', sa.String(length=50), nullable=False, server_default='NORMAL'),
        sa.Column('planned_pickup', sa.DateTime(), nullable=False),
        sa.Column('actual_pickup', sa.DateTime(), nullable=True),
        sa.Column('planned_eta', sa.DateTime(), nullable=False),
        sa.Column('revised_eta', sa.DateTime(), nullable=True),
        sa.Column('eta_variance_days', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('material_name', sa.String(length=255), nullable=False, server_default='Automotive Grade Steel Sheet (Grade 304)'),
        sa.Column('quantity', sa.Integer(), nullable=False, server_default='500'),
        sa.Column('quantity_unit', sa.String(length=50), nullable=False, server_default='MT'),
        sa.Column('required_quantity', sa.Integer(), nullable=False, server_default='500'),
        sa.Column('current_inventory', sa.Integer(), nullable=False, server_default='200'),
        sa.Column('potential_shortage', sa.Integer(), nullable=False, server_default='300'),
        sa.Column('last_telemetry_at', sa.DateTime(), nullable=True),
        sa.Column('data_source', sa.String(length=100), nullable=False, server_default='SAP S/4HANA OData'),
        sa.Column('data_source_mode', sa.String(length=50), nullable=False, server_default='SIMULATION'),
        sa.Column('is_demo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index(op.f('ix_shipments_id'), 'shipments', ['id'], unique=False)
    op.create_index(op.f('ix_shipments_business_id'), 'shipments', ['business_id'], unique=False)
    op.create_index(op.f('ix_shipments_shipment_number'), 'shipments', ['shipment_number'], unique=False)
    op.create_index(op.f('ix_shipments_supplier_id'), 'shipments', ['supplier_id'], unique=False)
    op.create_index(op.f('ix_shipments_supply_item_id'), 'shipments', ['supply_item_id'], unique=False)

    # 4. shipment_checkpoints
    op.create_table(
        'shipment_checkpoints',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('shipment_id', sa.String(length=36), sa.ForeignKey('shipments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sequence_order', sa.Integer(), nullable=False),
        sa.Column('checkpoint_type', sa.String(length=100), nullable=False),
        sa.Column('location_name', sa.String(length=255), nullable=False),
        sa.Column('location_coords', sa.JSON(), nullable=True),
        sa.Column('scheduled_time', sa.DateTime(), nullable=False),
        sa.Column('actual_time', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='PENDING'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index(op.f('ix_shipment_checkpoints_id'), 'shipment_checkpoints', ['id'], unique=False)
    op.create_index(op.f('ix_shipment_checkpoints_shipment_id'), 'shipment_checkpoints', ['shipment_id'], unique=False)

    # 5. shipment_exceptions
    op.create_table(
        'shipment_exceptions',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('business_id', sa.String(length=36), sa.ForeignKey('business_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('shipment_id', sa.String(length=36), sa.ForeignKey('shipments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('exception_type', sa.String(length=100), nullable=False, server_default='ETA_VARIANCE'),
        sa.Column('severity', sa.String(length=50), nullable=False, server_default='HIGH'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='ACTIVE'),
        sa.Column('observed_fact', sa.Text(), nullable=False),
        sa.Column('evidence', sa.JSON(), nullable=False),
        sa.Column('assumption', sa.Text(), nullable=False),
        sa.Column('risk', sa.Text(), nullable=False),
        sa.Column('recommendation', sa.Text(), nullable=False),
        sa.Column('action_state', sa.String(length=50), nullable=False, server_default='NORMAL'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index(op.f('ix_shipment_exceptions_id'), 'shipment_exceptions', ['id'], unique=False)
    op.create_index(op.f('ix_shipment_exceptions_business_id'), 'shipment_exceptions', ['business_id'], unique=False)
    op.create_index(op.f('ix_shipment_exceptions_shipment_id'), 'shipment_exceptions', ['shipment_id'], unique=False)


def downgrade() -> None:
    op.drop_table('shipment_exceptions')
    op.drop_table('shipment_checkpoints')
    op.drop_table('shipments')
    op.drop_table('supply_chain_decisions')
    op.drop_table('disruption_events')
