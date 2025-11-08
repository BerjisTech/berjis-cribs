package server

import (
	"encoding/json"
	"os"
	"time"

	"github.com/aarondl/null/v8"
)

const (
	EnrollmentStatusDraft     = "draft"
	EnrollmentStatusSubmitted = "submitted"
	EnrollmentStatusApproved  = "approved"
	EnrollmentStatusRejected  = "rejected"

	PropertyStatusDraft    = "draft"
	PropertyStatusPending  = "pending_review"
	PropertyStatusApproved = "approved"
	PropertyStatusRejected = "rejected"
	PropertyStatusArchived = "archived"

	MediaKindInterior  = "interior"
	MediaKindExterior  = "exterior"
	MediaKindFloorplan = "floorplan"
	MediaKindDocument  = "document"
)

type LandlordEnrollment struct {
	ID           string          `db:"id" json:"id"`
	UserUUID     string          `db:"user_uuid" json:"userUuid"`
	Status       string          `db:"status" json:"status"`
	CurrentStep  string          `db:"current_step" json:"currentStep,omitempty"`
	Payload      json.RawMessage `db:"payload" json:"payload,omitempty"`
	ContactName  null.String     `db:"contact_name" json:"contactName,omitempty"`
	ContactEmail null.String     `db:"contact_email" json:"contactEmail,omitempty"`
	ContactPhone null.String     `db:"contact_phone" json:"contactPhone,omitempty"`
	SubmittedAt  null.Time       `db:"submitted_at" json:"submittedAt,omitempty"`
	ReviewedAt   null.Time       `db:"reviewed_at" json:"reviewedAt,omitempty"`
	ReviewerUUID null.String     `db:"reviewer_uuid" json:"reviewerUuid,omitempty"`
	ReviewNotes  null.String     `db:"review_notes" json:"reviewNotes,omitempty"`
	CreatedAt    time.Time       `db:"created_at" json:"createdAt"`
	UpdatedAt    time.Time       `db:"updated_at" json:"updatedAt"`
}

type LandlordProfile struct {
	ID             string          `db:"id" json:"id"`
	UserUUID       string          `db:"user_uuid" json:"userUuid"`
	EnrollmentID   string          `db:"enrollment_id" json:"enrollmentId"`
	DisplayName    string          `db:"display_name" json:"displayName"`
	Status         string          `db:"status" json:"status"`
	BillingAccount null.String     `db:"billing_account_id" json:"billingAccountId,omitempty"`
	BillingStatus  null.String     `db:"billing_status" json:"billingStatus,omitempty"`
	SupportEmail   null.String     `db:"support_email" json:"supportEmail,omitempty"`
	SupportPhone   null.String     `db:"support_phone" json:"supportPhone,omitempty"`
	ProfileJSON    json.RawMessage `db:"profile_json" json:"profile,omitempty"`
	CreatedAt      time.Time       `db:"created_at" json:"createdAt"`
	UpdatedAt      time.Time       `db:"updated_at" json:"updatedAt"`
}

type Property struct {
	ID            string          `db:"id" json:"id"`
	LandlordID    string          `db:"landlord_id" json:"landlordId"`
	Name          string          `db:"name" json:"name"`
	Slug          string          `db:"slug" json:"slug"`
	Description   string          `db:"description" json:"description"`
	Status        string          `db:"status" json:"status"`
	AddressType   string          `db:"address_type" json:"addressType"`
	AddressJSON   json.RawMessage `db:"address_json" json:"address,omitempty"`
	LocationJSON  json.RawMessage `db:"location_json" json:"location,omitempty"`
	DetailsJSON   json.RawMessage `db:"details_json" json:"details,omitempty"`
	AmenitiesJSON json.RawMessage `db:"amenities_json" json:"amenities,omitempty"`
	PoliciesJSON  json.RawMessage `db:"policies_json" json:"policies,omitempty"`
	SubmittedAt   null.Time       `db:"submitted_at" json:"submittedAt,omitempty"`
	ReviewedAt    null.Time       `db:"reviewed_at" json:"reviewedAt,omitempty"`
	ReviewerUUID  null.String     `db:"reviewer_uuid" json:"reviewerUuid,omitempty"`
	ReviewNotes   null.String     `db:"review_notes" json:"reviewNotes,omitempty"`
	CreatedAt     time.Time       `db:"created_at" json:"createdAt"`
	UpdatedAt     time.Time       `db:"updated_at" json:"updatedAt"`
	Media         []PropertyMedia `json:"media,omitempty"`
	Units         []PropertyUnit  `json:"units,omitempty"`
}

type PropertyMedia struct {
	ID         string      `db:"id" json:"id"`
	PropertyID string      `db:"property_id" json:"propertyId"`
	UnitID     null.String `db:"unit_id" json:"unitId,omitempty"`
	Kind       string      `db:"kind" json:"kind"`
	URL        string      `db:"url" json:"url"`
	Caption    null.String `db:"caption" json:"caption,omitempty"`
	UploadedBy string      `db:"uploaded_by" json:"uploadedBy"`
	CreatedAt  time.Time   `db:"created_at" json:"createdAt"`
}

type PropertyUnit struct {
	ID              string          `db:"id" json:"id"`
	PropertyID      string          `db:"property_id" json:"propertyId"`
	StructureLabel  null.String     `db:"structure_label" json:"structureLabel,omitempty"`
	AddressType     string          `db:"address_type" json:"addressType"`
	Block           null.String     `db:"block" json:"block,omitempty"`
	Phase           null.String     `db:"phase" json:"phase,omitempty"`
	Floor           null.Int        `db:"floor" json:"floor,omitempty"`
	DoorNumber      null.String     `db:"door_number" json:"doorNumber,omitempty"`
	DisplayName     null.String     `db:"display_name" json:"displayName,omitempty"`
	UnitType        null.String     `db:"unit_type" json:"unitType,omitempty"`
	Status          string          `db:"status" json:"status"`
	MaintenanceNote null.String     `db:"maintenance_note" json:"maintenanceNote,omitempty"`
	MetadataJSON    json.RawMessage `db:"metadata_json" json:"metadata,omitempty"`
	PricingJSON     json.RawMessage `db:"pricing_json" json:"pricing,omitempty"`
	CreatedAt       time.Time       `db:"created_at" json:"createdAt"`
	UpdatedAt       time.Time       `db:"updated_at" json:"updatedAt"`
}

type PublicProperty struct {
	ID           string          `db:"id" json:"id"`
	Name         string          `db:"name" json:"name"`
	Slug         string          `db:"slug" json:"slug"`
	Summary      string          `db:"summary" json:"summary"`
	LandlordID   string          `db:"landlord_id" json:"landlordId"`
	LandlordName string          `db:"landlord_name" json:"landlordName"`
	Location     json.RawMessage `db:"location_json" json:"location"`
	Address      json.RawMessage `db:"address_json" json:"address"`
	Details      json.RawMessage `db:"details_json" json:"details"`
	Amenities    json.RawMessage `db:"amenities_json" json:"amenities"`
	Media        []PublicMedia   `json:"media"`
	UpdatedAt    time.Time       `db:"updated_at" json:"updatedAt"`
}

// mkdirAll wraps os.MkdirAll for internal helpers
func mkdirAll(path string) error { return os.MkdirAll(path, 0o755) }

type PublicMedia struct {
	ID   string `db:"id" json:"id"`
	Kind string `db:"kind" json:"kind"`
	URL  string `db:"url" json:"url"`
}

type Address struct {
	City      string `json:"city,omitempty"`
	Estate    string `json:"estate,omitempty"`
	Block     string `json:"block,omitempty"`
	Phase     string `json:"phase,omitempty"`
	Floor     string `json:"floor,omitempty"`
	Building  string `json:"building,omitempty"`
	Community string `json:"community,omitempty"`
	Street    string `json:"street,omitempty"`
	Reference string `json:"reference,omitempty"`
}

type TenantUnitSummary struct {
	ID                string     `json:"id"`
	PropertyID        string     `json:"propertyId"`
	PropertyName      string     `json:"propertyName"`
	UnitLabel         string     `json:"unitLabel"`
	Address           *Address   `json:"address,omitempty"`
	OccupancyStatus   string     `json:"occupancyStatus,omitempty"`
	LeaseStatus       string     `json:"leaseStatus,omitempty"`
	LeaseType         string     `json:"leaseType,omitempty"`
	LeaseID           string     `json:"leaseId,omitempty"`
	LeaseStartedAt    *time.Time `json:"leaseStartedAt,omitempty"`
	LeaseEndsAt       *time.Time `json:"leaseEndsAt,omitempty"`
	NextPaymentDue    *time.Time `json:"nextPaymentDue,omitempty"`
	NextPaymentAmount float64    `json:"nextPaymentAmount,omitempty"`
	Balance           float64    `json:"balance,omitempty"`
	UpdatedAt         *time.Time `json:"updatedAt,omitempty"`
}

type TenantUnitDetail struct {
	TenantUnitSummary
	LandlordName string                     `json:"landlordName,omitempty"`
	SupportEmail string                     `json:"supportEmail,omitempty"`
	SupportPhone string                     `json:"supportPhone,omitempty"`
	Description  string                     `json:"description,omitempty"`
	Amenities    []string                   `json:"amenities,omitempty"`
	Lease        *LeaseSummary              `json:"lease,omitempty"`
	Payments     []PaymentSummary           `json:"payments,omitempty"`
	Maintenance  []MaintenanceTicketSummary `json:"maintenance,omitempty"`
	Media        []TenantMedia              `json:"media,omitempty"`
}

type LeaseSummary struct {
	ID        string     `json:"id"`
	Type      string     `json:"type"`
	Status    string     `json:"status"`
	StartDate *time.Time `json:"startDate,omitempty"`
	EndDate   *time.Time `json:"endDate,omitempty"`
	Rate      float64    `json:"rate"`
	Frequency string     `json:"frequency"`
	Deposit   float64    `json:"deposit,omitempty"`
}

type PaymentSummary struct {
	ID        string     `json:"id"`
	Amount    float64    `json:"amount"`
	Status    string     `json:"status"`
	Method    string     `json:"method,omitempty"`
	Reference string     `json:"reference,omitempty"`
	PaidOn    *time.Time `json:"paidOn,omitempty"`
}

type MaintenanceTicketSummary struct {
	ID        string     `json:"id"`
	Category  string     `json:"category"`
	Status    string     `json:"status"`
	Priority  string     `json:"priority,omitempty"`
	OpenedAt  *time.Time `json:"openedAt,omitempty"`
	UpdatedAt *time.Time `json:"updatedAt,omitempty"`
}

type TenantMedia struct {
	URL     string `json:"url"`
	Caption string `json:"caption,omitempty"`
	Kind    string `json:"kind,omitempty"`
}
