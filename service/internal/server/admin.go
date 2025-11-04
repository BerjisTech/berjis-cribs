package server

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/berjistech/berjis-ecosystem/cribs/service/internal/auth"
	"github.com/gofiber/fiber/v2"
)

type enrollmentReviewInput struct {
	DisplayName  string `json:"displayName"`
	SupportEmail string `json:"supportEmail"`
	SupportPhone string `json:"supportPhone"`
	Notes        string `json:"notes"`
}

type rejectInput struct {
	Reason string `json:"reason"`
}

func registerAdminRoutes(app *fiber.App, deps protectedDeps) {
	group := app.Group("/v1/admin/cribs")

	group.Get("/enrollments", func(c *fiber.Ctx) error {
		if err := auth.RequireRoles(c, "admin", "superadmin", "platform.admin", "platform.superadmin", "cribs-admin", "cribs.admin"); err != nil {
			return err
		}
		status := strings.TrimSpace(c.Query("status", EnrollmentStatusSubmitted))
		if status == "" {
			status = EnrollmentStatusSubmitted
		}
		rows, err := deps.db().Queryx(`SELECT e.*, l.id AS landlord_id, l.display_name AS landlord_name
            FROM landlord_enrollments e
            LEFT JOIN landlords l ON l.enrollment_id = e.id
            WHERE ($1 = 'all' OR e.status = $1)
            ORDER BY e.updated_at DESC
            LIMIT 100`, status)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		defer rows.Close()
		type item struct {
			LandlordID   sql.NullString `db:"landlord_id" json:"landlordId,omitempty"`
			LandlordName sql.NullString `db:"landlord_name" json:"landlordName,omitempty"`
			LandlordEnrollment
		}
		out := []item{}
		for rows.Next() {
			var i item
			if err := rows.StructScan(&i); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "scan error"})
			}
			out = append(out, i)
		}
		return c.JSON(fiber.Map{"success": true, "data": out})
	})

	group.Post("/enrollments/:id/approve", func(c *fiber.Ctx) error {
		if err := auth.RequireRoles(c, "admin", "superadmin", "platform.admin", "platform.superadmin", "cribs-admin", "cribs.admin"); err != nil {
			return err
		}
		admin := auth.UserFromCtx(c)
		id := c.Params("id")
		if !isUUID(id) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid enrollment id"})
		}
		var body enrollmentReviewInput
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid payload"})
		}

		tx, err := deps.db().Beginx()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "transaction error"})
		}
		defer tx.Rollback()

		var enrollment LandlordEnrollment
		if err := tx.Get(&enrollment, `SELECT * FROM landlord_enrollments WHERE id=$1 FOR UPDATE`, id); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "enrollment not found"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		if enrollment.Status != EnrollmentStatusSubmitted && enrollment.Status != EnrollmentStatusDraft {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "enrollment not pending"})
		}

		if _, err := tx.Exec(`UPDATE landlord_enrollments
            SET status=$1, reviewed_at=$2, reviewer_uuid=$3, review_notes=$4, updated_at=$2
            WHERE id=$5`, EnrollmentStatusApproved, time.Now().UTC(), admin.ID, nullableString(body.Notes), id); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "update failed"})
		}

		displayName := strings.TrimSpace(body.DisplayName)
		if displayName == "" {
			displayName = enrollment.ContactName.String
		}
		if displayName == "" {
			displayName = "Landlord"
		}

		var landlord LandlordProfile
		err = tx.Get(&landlord, `SELECT * FROM landlords WHERE enrollment_id=$1`, id)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				row := tx.QueryRowx(`INSERT INTO landlords
                    (user_uuid, enrollment_id, display_name, status, support_email, support_phone, profile_json, created_at, updated_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
                    RETURNING *`,
					enrollment.UserUUID, id, displayName, "active", nullableString(body.SupportEmail),
					nullableString(body.SupportPhone), enrollment.Payload, time.Now().UTC())
				if err := row.StructScan(&landlord); err != nil {
					return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "landlord create failed"})
				}
			} else {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "landlord lookup failed"})
			}
		} else {
			if _, err := tx.Exec(`UPDATE landlords SET display_name=$1, support_email=$2, support_phone=$3, updated_at=$4 WHERE id=$5`,
				displayName, nullableString(body.SupportEmail), nullableString(body.SupportPhone), time.Now().UTC(), landlord.ID); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "landlord update failed"})
			}
		}

		if err := queueNotification(tx, "landlord.enrollment.approved", enrollment.UserUUID, fiber.Map{
			"enrollmentId": id,
			"displayName":  displayName,
		}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "notify failed"})
		}

		if err := tx.Commit(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "commit failed"})
		}
		return c.JSON(fiber.Map{"success": true})
	})

	group.Post("/enrollments/:id/reject", func(c *fiber.Ctx) error {
		if err := auth.RequireRoles(c, "admin", "superadmin", "platform.admin", "platform.superadmin", "cribs-admin", "cribs.admin"); err != nil {
			return err
		}
		admin := auth.UserFromCtx(c)
		id := c.Params("id")
		if !isUUID(id) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid enrollment id"})
		}
		var body rejectInput
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid payload"})
		}
		reason := strings.TrimSpace(body.Reason)
		if reason == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "reason required"})
		}

		tx, err := deps.db().Beginx()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "transaction error"})
		}
		defer tx.Rollback()

		var enrollment LandlordEnrollment
		if err := tx.Get(&enrollment, `SELECT * FROM landlord_enrollments WHERE id=$1 FOR UPDATE`, id); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "enrollment not found"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		if _, err := tx.Exec(`UPDATE landlord_enrollments
            SET status=$1, reviewed_at=$2, reviewer_uuid=$3, review_notes=$4, updated_at=$2
            WHERE id=$5`, EnrollmentStatusRejected, time.Now().UTC(), admin.ID, reason, id); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "update failed"})
		}
		if err := queueNotification(tx, "landlord.enrollment.rejected", enrollment.UserUUID, fiber.Map{
			"enrollmentId": id,
			"reason":       reason,
		}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "notify failed"})
		}
		if err := tx.Commit(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "commit failed"})
		}
		return c.JSON(fiber.Map{"success": true})
	})

	group.Get("/properties", func(c *fiber.Ctx) error {
		if err := auth.RequireRoles(c, "admin", "superadmin", "platform.admin", "platform.superadmin", "cribs-admin", "cribs.admin"); err != nil {
			return err
		}
		status := strings.TrimSpace(c.Query("status", PropertyStatusPending))
		if status == "" {
			status = PropertyStatusPending
		}
		rows, err := deps.db().Queryx(`SELECT p.*, l.display_name AS landlord_name
            FROM properties p
            JOIN landlords l ON p.landlord_id = l.id
            WHERE ($1 = 'all' OR p.status = $1)
            ORDER BY p.updated_at DESC
            LIMIT 100`, status)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		defer rows.Close()
		type item struct {
			LandlordName string `db:"landlord_name" json:"landlordName"`
			Property
		}
		out := []item{}
		for rows.Next() {
			var i item
			if err := rows.StructScan(&i); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "scan error"})
			}
			out = append(out, i)
		}
		return c.JSON(fiber.Map{"success": true, "data": out})
	})

	group.Post("/properties/:id/approve", func(c *fiber.Ctx) error {
		if err := auth.RequireRoles(c, "admin", "superadmin", "platform.admin", "platform.superadmin", "cribs-admin", "cribs.admin"); err != nil {
			return err
		}
		admin := auth.UserFromCtx(c)
		id := c.Params("id")
		if !isUUID(id) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid property id"})
		}
		var body struct {
			Notes string `json:"notes"`
		}
		_ = c.BodyParser(&body)

		tx, err := deps.db().Beginx()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "transaction error"})
		}
		defer tx.Rollback()

		var prop Property
		if err := tx.Get(&prop, `SELECT * FROM properties WHERE id=$1 FOR UPDATE`, id); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "property not found"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		if prop.Status != PropertyStatusPending && prop.Status != PropertyStatusDraft {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "property not pending"})
		}
		if _, err := tx.Exec(`UPDATE properties SET status=$1, reviewed_at=$2, reviewer_uuid=$3, review_notes=$4, updated_at=$2 WHERE id=$5`,
			PropertyStatusApproved, time.Now().UTC(), admin.ID, nullableString(body.Notes), id); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "update failed"})
		}
		var landlord LandlordProfile
		if err := tx.Get(&landlord, `SELECT * FROM landlords WHERE id=$1`, prop.LandlordID); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "landlord lookup failed"})
		}
		if err := queueNotification(tx, "property.approved", landlord.UserUUID, fiber.Map{
			"propertyId": prop.ID,
			"name":       prop.Name,
		}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "notify failed"})
		}
		if err := appendAudit(tx, prop.LandlordID, prop.ID, "", admin.ID, "property.approved", fiber.Map{"notes": body.Notes}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "audit failed"})
		}
		if err := tx.Commit(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "commit failed"})
		}
		return c.JSON(fiber.Map{"success": true})
	})

	group.Post("/properties/:id/reject", func(c *fiber.Ctx) error {
		if err := auth.RequireRoles(c, "admin", "superadmin", "platform.admin", "platform.superadmin", "cribs-admin", "cribs.admin"); err != nil {
			return err
		}
		admin := auth.UserFromCtx(c)
		id := c.Params("id")
		if !isUUID(id) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid property id"})
		}
		var body rejectInput
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid payload"})
		}
		if strings.TrimSpace(body.Reason) == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "reason required"})
		}

		tx, err := deps.db().Beginx()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "transaction error"})
		}
		defer tx.Rollback()

		var prop Property
		if err := tx.Get(&prop, `SELECT * FROM properties WHERE id=$1 FOR UPDATE`, id); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "property not found"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		if _, err := tx.Exec(`UPDATE properties SET status=$1, reviewed_at=$2, reviewer_uuid=$3, review_notes=$4, updated_at=$2 WHERE id=$5`,
			PropertyStatusRejected, time.Now().UTC(), admin.ID, body.Reason, id); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "update failed"})
		}
		var landlord LandlordProfile
		if err := tx.Get(&landlord, `SELECT * FROM landlords WHERE id=$1`, prop.LandlordID); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "landlord lookup failed"})
		}
		if err := queueNotification(tx, "property.rejected", landlord.UserUUID, fiber.Map{
			"propertyId": prop.ID,
			"name":       prop.Name,
			"reason":     body.Reason,
		}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "notify failed"})
		}
		if err := appendAudit(tx, prop.LandlordID, prop.ID, "", admin.ID, "property.rejected", fiber.Map{"reason": body.Reason}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "audit failed"})
		}
		if err := tx.Commit(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "commit failed"})
		}
		return c.JSON(fiber.Map{"success": true})
	})
}
