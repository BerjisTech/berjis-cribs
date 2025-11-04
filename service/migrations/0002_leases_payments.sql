-- Leases, payments, receipts
CREATE TABLE IF NOT EXISTS leases (
    id UUID PRIMARY KEY,
    landlord_id UUID NOT NULL REFERENCES landlords(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE CASCADE,
    tenant_uuid TEXT NOT NULL,
    type TEXT NOT NULL, -- monthly | weekly | nightly | custom
    status TEXT NOT NULL DEFAULT 'active', -- active | pending | ended | cancelled
    start_date DATE NOT NULL,
    end_date DATE,
    rate NUMERIC(12,2) NOT NULL,
    frequency TEXT NOT NULL, -- monthly | weekly | nightly | custom
    deposit NUMERIC(12,2),
    meta_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leases_landlord ON leases(landlord_id);
CREATE INDEX IF NOT EXISTS idx_leases_property ON leases(property_id);
CREATE INDEX IF NOT EXISTS idx_leases_unit ON leases(unit_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant ON leases(tenant_uuid);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY,
    lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'paid', -- paid | pending | failed
    method TEXT,
    reference TEXT,
    paid_on DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_lease ON payments(lease_id);

CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY,
    lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    number TEXT NOT NULL,
    issued_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta_json JSONB DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_number ON receipts(number);

