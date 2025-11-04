package server

import (
	"time"

	"github.com/berjistech/berjis-ecosystem/cribs/service/internal/auth"
	"github.com/gofiber/fiber/v2"
)

type tenantData struct {
	Units []TenantUnitDetail
}

var tenantFixtures = map[string]tenantData{
	"default": defaultTenantFixture(),
}

func registerTenantRoutes(app *fiber.App, deps protectedDeps) {
	group := app.Group("/v1/tenant")

	group.Get("/units", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		data := cloneTenantData(loadTenantData(user.ID))
		summaries := make([]TenantUnitSummary, 0, len(data.Units))
		for _, unit := range data.Units {
			summaries = append(summaries, unit.TenantUnitSummary)
		}
		return c.JSON(fiber.Map{"success": true, "data": summaries})
	})

	group.Get("/units/:id", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		unitID := c.Params("id")
		data := cloneTenantData(loadTenantData(user.ID))
		for _, unit := range data.Units {
			if unit.ID == unitID {
				return c.JSON(fiber.Map{"success": true, "data": unit})
			}
		}
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "unit not found"})
	})
}

func loadTenantData(userID string) tenantData {
	if data, ok := tenantFixtures[userID]; ok {
		return data
	}
	return tenantFixtures["default"]
}

func cloneTenantData(data tenantData) tenantData {
	cloned := tenantData{Units: make([]TenantUnitDetail, len(data.Units))}
	for i, unit := range data.Units {
		cloned.Units[i] = unit
	}
	return cloned
}

func defaultTenantFixture() tenantData {
	now := time.Now().UTC()
	unitOne := TenantUnitDetail{
		TenantUnitSummary: TenantUnitSummary{
			ID:                "unit-demo-001",
			PropertyID:        "property-demo-001",
			PropertyName:      "Ngong View Residences",
			UnitLabel:         "Block A · 3rd Floor · A3-12",
			Address:           &Address{City: "Nairobi", Estate: "Upper Hill", Block: "A3", Floor: "3"},
			OccupancyStatus:   "occupied",
			LeaseStatus:       "active",
			LeaseType:         "monthly",
			LeaseID:           "lease-demo-001",
			LeaseStartedAt:    ptrTime(now.AddDate(0, -6, 0)),
			LeaseEndsAt:       ptrTime(now.AddDate(0, 6, 0)),
			NextPaymentDue:    ptrTime(now.AddDate(0, 0, 5)),
			NextPaymentAmount: 95000,
			Balance:           15000,
			UpdatedAt:         ptrTime(now.Add(-4 * time.Hour)),
		},
		LandlordName: "Berjis Homes Ltd",
		SupportEmail: "support@berjishomes.ke",
		SupportPhone: "+254 712 555555",
		Description:  "Executive furnished apartment with dual-access smart locks, full backup power, and serviced amenities.",
		Amenities: []string{
			"High-speed fibre WiFi",
			"24/7 security and CCTV",
			"Backup generator & solar water",
			"Secure parking (2 slots)",
			"Smart lock with audit trail",
		},
		Lease: &LeaseSummary{
			ID:        "lease-demo-001",
			Type:      "monthly",
			Status:    "active",
			StartDate: ptrTime(now.AddDate(0, -6, 0)),
			EndDate:   ptrTime(now.AddDate(0, 6, 0)),
			Rate:      95000,
			Frequency: "monthly",
			Deposit:   95000,
		},
		Payments: []PaymentSummary{
			{
				ID:        "pay-demo-004",
				Amount:    95000,
				Status:    "paid",
				Method:    "M-Pesa",
				Reference: "QK12AB34",
				PaidOn:    ptrTime(now.AddDate(0, 0, -25)),
			},
			{
				ID:        "pay-demo-005",
				Amount:    95000,
				Status:    "paid",
				Method:    "Bank Transfer",
				Reference: "EFT18923",
				PaidOn:    ptrTime(now.AddDate(0, -2, -3)),
			},
		},
		Maintenance: []MaintenanceTicketSummary{
			{
				ID:        "maint-demo-001",
				Category:  "Plumbing",
				Status:    "in_progress",
				Priority:  "high",
				OpenedAt:  ptrTime(now.AddDate(0, 0, -2)),
				UpdatedAt: ptrTime(now.AddDate(0, 0, -1)),
			},
			{
				ID:        "maint-demo-002",
				Category:  "Appliances",
				Status:    "completed",
				Priority:  "medium",
				OpenedAt:  ptrTime(now.AddDate(0, 0, -10)),
				UpdatedAt: ptrTime(now.AddDate(0, 0, -7)),
			},
		},
		Media: []TenantMedia{
			{
				URL:     "https://images.unsplash.com/photo-1600607687920-4e2a87f2c798?auto=format&fit=crop&w=1200&q=80",
				Caption: "Living room with full-height windows and smart climate control.",
				Kind:    "interior",
			},
			{
				URL:     "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1200&q=80",
				Caption: "Master bedroom featuring panoramic Ngong Hills view.",
				Kind:    "interior",
			},
		},
	}

	unitTwo := TenantUnitDetail{
		TenantUnitSummary: TenantUnitSummary{
			ID:                "unit-demo-002",
			PropertyID:        "property-demo-002",
			PropertyName:      "Kilimani Loft Suites",
			UnitLabel:         "Loft 5B · Phase 2",
			Address:           &Address{City: "Nairobi", Estate: "Kilimani", Phase: "2"},
			OccupancyStatus:   "reserved",
			LeaseStatus:       "pending",
			LeaseType:         "weekly",
			LeaseID:           "lease-demo-002",
			NextPaymentAmount: 45000,
			UpdatedAt:         ptrTime(now.Add(-48 * time.Hour)),
		},
		LandlordName: "Prime Stay Africa",
		SupportEmail: "hello@primestay.africa",
		SupportPhone: "+254 799 444444",
		Description:  "Duplex loft tailored for short-term executive stays with automated check-in and concierge services.",
		Amenities: []string{
			"Digital concierge",
			"Daily housekeeping",
			"Rooftop pool access",
		},
		Lease: &LeaseSummary{
			ID:        "lease-demo-002",
			Type:      "weekly",
			Status:    "pending",
			StartDate: ptrTime(now.AddDate(0, 0, 7)),
			Rate:      45000,
			Frequency: "weekly",
			Deposit:   20000,
		},
	}

	return tenantData{
		Units: []TenantUnitDetail{unitOne, unitTwo},
	}
}

func ptrTime(t time.Time) *time.Time {
	return &t
}
