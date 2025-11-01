-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Landlord enrollment workflow
CREATE TABLE IF NOT EXISTS landlord_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_uuid UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft','submitted','approved','rejected')),
    current_step TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    submitted_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    reviewer_uuid UUID,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON landlord_enrollments(user_uuid);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON landlord_enrollments(status);

CREATE TABLE IF NOT EXISTS landlords (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_uuid UUID NOT NULL,
    enrollment_id UUID NOT NULL REFERENCES landlord_enrollments(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    billing_account_id TEXT,
    billing_status TEXT,
    support_email TEXT,
    support_phone TEXT,
    profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_landlords_user ON landlords(user_uuid);

CREATE TABLE IF NOT EXISTS landlord_staff (
    landlord_id UUID NOT NULL REFERENCES landlords(id) ON DELETE CASCADE,
    user_uuid UUID NOT NULL,
    role TEXT NOT NULL,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    invited_by UUID,
    invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    PRIMARY KEY (landlord_id, user_uuid)
);
CREATE INDEX IF NOT EXISTS idx_landlord_staff_role ON landlord_staff(role);

-- Properties
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    landlord_id UUID NOT NULL REFERENCES landlords(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    address_type TEXT NOT NULL,
    address_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    location_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    amenities_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    policies_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    submitted_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    reviewer_uuid UUID,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_properties_slug ON properties(slug);
CREATE INDEX IF NOT EXISTS idx_properties_landlord ON properties(landlord_id);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);

CREATE TABLE IF NOT EXISTS property_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    structure_label TEXT,
    address_type TEXT NOT NULL,
    block TEXT,
    phase TEXT,
    floor INTEGER,
    door_number TEXT,
    display_name TEXT,
    unit_type TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    maintenance_note TEXT,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    pricing_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_units_property ON property_units(property_id);
CREATE INDEX IF NOT EXISTS idx_units_status ON property_units(status);

CREATE TABLE IF NOT EXISTS property_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit_id UUID,
    kind TEXT NOT NULL,
    url TEXT NOT NULL,
    caption TEXT,
    uploaded_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE property_media
    ADD CONSTRAINT fk_property_media_unit
    FOREIGN KEY (unit_id) REFERENCES property_units(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_media_property ON property_media(property_id);
CREATE INDEX IF NOT EXISTS idx_media_kind ON property_media(kind);

-- Audit trail
CREATE TABLE IF NOT EXISTS landlord_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    landlord_id UUID,
    property_id UUID,
    unit_id UUID,
    actor_uuid UUID,
    action TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_landlord ON landlord_audit_logs(landlord_id);

-- Notification outbox for async fan-out (sms/email/push)
CREATE TABLE IF NOT EXISTS notification_outbox (
    id BIGSERIAL PRIMARY KEY,
    kind TEXT NOT NULL,
    target_uuid UUID,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON notification_outbox(status);
