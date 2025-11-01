package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/berjistech/berjis-ecosystem/cribs/service/internal/auth"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type enrollmentPayload struct {
	CurrentStep string                 `json:"currentStep"`
	Payload     map[string]any         `json:"payload"`
	Contact     enrollmentContactInput `json:"contact"`
}

type enrollmentContactInput struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Phone string `json:"phone"`
}

func registerLandlordRoutes(app *fiber.App, deps protectedDeps) {
	group := app.Group("/v1/landlord")

	group.Get("/enrollments/me", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		enrollment, err := findLatestEnrollment(deps.db(), user.ID)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		if errors.Is(err, sql.ErrNoRows) {
			return c.JSON(fiber.Map{"success": true, "data": nil})
		}
		return c.JSON(fiber.Map{"success": true, "data": enrollment})
	})

	group.Patch("/enrollments/me", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		var body enrollmentPayload
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid payload"})
		}

		payloadBytes, err := json.Marshal(body.Payload)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "payload must be json serializable"})
		}

		tx, err := deps.db().Beginx()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "transaction error"})
		}
		defer tx.Rollback()

		enrollment, err := upsertEnrollment(tx, user.ID, body, payloadBytes)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": err.Error()})
		}
		if err := tx.Commit(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "commit failed"})
		}
		return c.JSON(fiber.Map{"success": true, "data": enrollment})
	})

	group.Post("/enrollments/:id/submit", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		id := strings.TrimSpace(c.Params("id"))
		if id == "" || !isUUID(id) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid id"})
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
		if enrollment.UserUUID != user.ID {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "forbidden"})
		}
		if enrollment.Status == EnrollmentStatusSubmitted {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "already submitted"})
		}
		if enrollment.Status == EnrollmentStatusApproved {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "already approved"})
		}

		payload := map[string]any{}
		if len(enrollment.Payload) > 0 {
			if err := json.Unmarshal(enrollment.Payload, &payload); err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "stored payload invalid"})
			}
		}
		if err := validateEnrollmentPayload(payload, enrollmentContactInput{
			Name:  enrollment.ContactName.String,
			Email: enrollment.ContactEmail.String,
			Phone: enrollment.ContactPhone.String,
		}); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": err.Error()})
		}

		if _, err := tx.Exec(`UPDATE landlord_enrollments
            SET status=$1, submitted_at=$2, updated_at=$2
            WHERE id=$3`, EnrollmentStatusSubmitted, time.Now().UTC(), id); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "update failed"})
		}
		if err := queueNotification(tx, "landlord.enrollment.submitted", user.ID, fiber.Map{
			"enrollmentId": id,
			"name":         enrollment.ContactName.String,
		}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "notify failed"})
		}
		if err := tx.Commit(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "commit failed"})
		}
		return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"status": EnrollmentStatusSubmitted}})
	})

	group.Get("/profile", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		var profile LandlordProfile
		if err := deps.db().Get(&profile, `SELECT * FROM landlords WHERE user_uuid=$1`, user.ID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return c.JSON(fiber.Map{"success": true, "data": nil})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		return c.JSON(fiber.Map{"success": true, "data": profile})
	})
}

func findLatestEnrollment(db *sqlx.DB, userID string) (LandlordEnrollment, error) {
	var enrollment LandlordEnrollment
	err := db.Get(&enrollment, `SELECT * FROM landlord_enrollments
        WHERE user_uuid=$1
        ORDER BY created_at DESC
        LIMIT 1`, userID)
	return enrollment, err
}

func upsertEnrollment(tx *sqlx.Tx, userID string, body enrollmentPayload, payload []byte) (LandlordEnrollment, error) {
	contact := sanitizeContact(body.Contact)

	var existing LandlordEnrollment
	err := tx.Get(&existing, `SELECT * FROM landlord_enrollments
        WHERE user_uuid=$1
        ORDER BY created_at DESC
        LIMIT 1 FOR UPDATE`, userID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return LandlordEnrollment{}, err
	}

	now := time.Now().UTC()
	var updated LandlordEnrollment
	if errors.Is(err, sql.ErrNoRows) {
		row := tx.QueryRowx(`INSERT INTO landlord_enrollments
            (user_uuid, status, current_step, payload, contact_name, contact_email, contact_phone, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
            RETURNING *`,
			userID, EnrollmentStatusDraft, body.CurrentStep, payload,
			nullableString(contact.Name), nullableString(contact.Email), nullableString(contact.Phone), now)
		if err := row.StructScan(&updated); err != nil {
			return LandlordEnrollment{}, err
		}
		return updated, nil
	}

	// when rejected allow editing and resubmission
	status := existing.Status
	if status == EnrollmentStatusSubmitted {
		status = EnrollmentStatusSubmitted // editing while submitted resets to submitted but updates payload
	}
	if status == EnrollmentStatusRejected {
		status = EnrollmentStatusDraft
	}
	row := tx.QueryRowx(`UPDATE landlord_enrollments SET
        status=$1,
        current_step=COALESCE(NULLIF($2,''), current_step),
        payload=$3,
        contact_name=$4,
        contact_email=$5,
        contact_phone=$6,
        updated_at=$7
        WHERE id=$8
        RETURNING *`,
		status, body.CurrentStep, payload,
		nullableString(contact.Name), nullableString(contact.Email), nullableString(contact.Phone),
		now, existing.ID)
	if err := row.StructScan(&updated); err != nil {
		return LandlordEnrollment{}, err
	}
	return updated, nil
}

func validateEnrollmentPayload(payload map[string]any, contact enrollmentContactInput) error {
	if strings.TrimSpace(contact.Name) == "" {
		return errors.New("contact name is required before submission")
	}
	if strings.TrimSpace(contact.Email) == "" {
		return errors.New("contact email is required before submission")
	}
	if len(payload) == 0 {
		return errors.New("enrollment form is incomplete")
	}
	if org, ok := payload["organization"].(map[string]any); ok {
		if strings.TrimSpace(asString(org["legalName"])) == "" {
			return errors.New("organization legal name is required")
		}
		if strings.TrimSpace(asString(org["type"])) == "" {
			return errors.New("organization type is required")
		}
	} else {
		return errors.New("organization details missing")
	}
	if docs, ok := payload["compliance"].(map[string]any); ok {
		if len(asSlice(docs["documents"])) == 0 {
			return errors.New("compliance documents not uploaded")
		}
	} else {
		return errors.New("compliance section missing")
	}
	return nil
}

func sanitizeContact(in enrollmentContactInput) enrollmentContactInput {
	return enrollmentContactInput{
		Name:  strings.TrimSpace(in.Name),
		Email: strings.TrimSpace(strings.ToLower(in.Email)),
		Phone: strings.TrimSpace(in.Phone),
	}
}

func nullableString(v string) any {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	return strings.TrimSpace(v)
}

func isUUID(v string) bool {
	_, err := uuid.Parse(v)
	return err == nil
}
