package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/aarondl/null/v8"
	"github.com/berjistech/berjis-ecosystem/cribs/service/internal/auth"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type propertyInput struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	AddressType string         `json:"addressType"`
	Address     map[string]any `json:"address"`
	Location    map[string]any `json:"location"`
	Details     map[string]any `json:"details"`
	Amenities   any            `json:"amenities"`
	Policies    map[string]any `json:"policies"`
}

type mediaInput struct {
	Kind    string `json:"kind"`
	URL     string `json:"url"`
	Caption string `json:"caption"`
	UnitID  string `json:"unitId"`
}

type unitInput struct {
	ID          string         `json:"id"`
	Structure   string         `json:"structureLabel"`
	AddressType string         `json:"addressType"`
	Block       string         `json:"block"`
	Phase       string         `json:"phase"`
	Floor       *int           `json:"floor"`
	DoorNumber  string         `json:"doorNumber"`
	DisplayName string         `json:"displayName"`
	UnitType    string         `json:"unitType"`
	Status      string         `json:"status"`
	Maintenance string         `json:"maintenanceNote"`
	Metadata    map[string]any `json:"metadata"`
	Pricing     map[string]any `json:"pricing"`
}

type unitsPayload struct {
	Units []unitInput `json:"units"`
}

func registerPropertyRoutes(app *fiber.App, deps protectedDeps) {
	group := app.Group("/v1/landlord")

	group.Get("/properties", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		landlord, err := landlordForUser(deps.db(), user.ID)
		if err != nil {
			if errors.Is(err, errLandlordNotFound) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "landlord profile required"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}

		rows, err := deps.db().Queryx(`SELECT * FROM properties WHERE landlord_id=$1 ORDER BY updated_at DESC`, landlord.ID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		defer rows.Close()
		props := []Property{}
		for rows.Next() {
			var p Property
			if err := rows.StructScan(&p); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "scan error"})
			}
			props = append(props, p)
		}
		return c.JSON(fiber.Map{"success": true, "data": props})
	})

	group.Get("/properties/:id", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		propertyID := c.Params("id")
		if !isUUID(propertyID) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid property id"})
		}
		landlord, err := landlordForUser(deps.db(), user.ID)
		if err != nil {
			if errors.Is(err, errLandlordNotFound) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "landlord profile required"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		var prop Property
		if err := deps.db().Get(&prop, `SELECT * FROM properties WHERE id=$1 AND landlord_id=$2`, propertyID, landlord.ID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "not found"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		media := []PropertyMedia{}
		if err := deps.db().Select(&media, `SELECT id, property_id, unit_id, kind, url, caption, uploaded_by, created_at FROM property_media WHERE property_id=$1 ORDER BY created_at ASC`, propertyID); err == nil {
			prop.Media = media
		}
		units := []PropertyUnit{}
		if err := deps.db().Select(&units, `SELECT * FROM property_units WHERE property_id=$1 ORDER BY created_at ASC`, propertyID); err == nil {
			prop.Units = units
		}
		return c.JSON(fiber.Map{"success": true, "data": prop})
	})

	group.Post("/properties", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		landlord, err := landlordForUser(deps.db(), user.ID)
		if err != nil {
			if errors.Is(err, errLandlordNotFound) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "landlord profile required"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}

		var body propertyInput
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid payload"})
		}
		if err := validatePropertyInput(body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": err.Error()})
		}

		payloads, err := serializePropertyPayloads(body)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": err.Error()})
		}

		tx, err := deps.db().Beginx()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "transaction error"})
		}
		defer tx.Rollback()

		slug, err := ensurePropertySlug(tx, body.Name)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "slug generation failed"})
		}

		var prop Property
		row := tx.QueryRowx(`INSERT INTO properties
            (landlord_id, name, slug, description, status,
             address_type, address_json, location_json, details_json, amenities_json, policies_json,
             created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
            RETURNING *`,
			landlord.ID, body.Name, slug, body.Description, PropertyStatusDraft,
			body.AddressType, payloads.Address, payloads.Location, payloads.Details, payloads.Amenities, payloads.Policies,
			time.Now().UTC())
		if err := row.StructScan(&prop); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "insert failed"})
		}

		if err := appendAudit(tx, landlord.ID, prop.ID, "", user.ID, "property.created", fiber.Map{
			"name": prop.Name,
		}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "audit failed"})
		}

		if err := tx.Commit(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "commit failed"})
		}

		return c.JSON(fiber.Map{"success": true, "data": prop})
	})

	group.Put("/properties/:id", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		propertyID := c.Params("id")
		if !isUUID(propertyID) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid property id"})
		}
		landlord, err := landlordForUser(deps.db(), user.ID)
		if err != nil {
			if errors.Is(err, errLandlordNotFound) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "landlord profile required"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		ok, err := landlordOwnsProperty(deps.db(), propertyID, landlord.ID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "ownership check failed"})
		}
		if !ok {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "forbidden"})
		}

		var body propertyInput
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid payload"})
		}
		if body.Name != "" && len(strings.TrimSpace(body.Name)) < 3 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "name too short"})
		}

		payloads, err := serializePropertyPayloads(body)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": err.Error()})
		}

		tx, err := deps.db().Beginx()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "transaction error"})
		}
		defer tx.Rollback()

		set := []string{}
		args := []any{}
		idx := 1
		if body.Name != "" {
			set = append(set, fmt.Sprintf("name=$%d", idx))
			args = append(args, body.Name)
			idx++
		}
		if body.Description != "" {
			set = append(set, fmt.Sprintf("description=$%d", idx))
			args = append(args, body.Description)
			idx++
		}
		if body.AddressType != "" {
			set = append(set, fmt.Sprintf("address_type=$%d", idx))
			args = append(args, body.AddressType)
			idx++
		}
		if payloads.Address != nil {
			set = append(set, fmt.Sprintf("address_json=$%d", idx))
			args = append(args, payloads.Address)
			idx++
		}
		if payloads.Location != nil {
			set = append(set, fmt.Sprintf("location_json=$%d", idx))
			args = append(args, payloads.Location)
			idx++
		}
		if payloads.Details != nil {
			set = append(set, fmt.Sprintf("details_json=$%d", idx))
			args = append(args, payloads.Details)
			idx++
		}
		if payloads.Amenities != nil {
			set = append(set, fmt.Sprintf("amenities_json=$%d", idx))
			args = append(args, payloads.Amenities)
			idx++
		}
		if payloads.Policies != nil {
			set = append(set, fmt.Sprintf("policies_json=$%d", idx))
			args = append(args, payloads.Policies)
			idx++
		}
		set = append(set, fmt.Sprintf("updated_at=$%d", idx))
		args = append(args, time.Now().UTC())
		idx++

		args = append(args, propertyID)

		query := fmt.Sprintf("UPDATE properties SET %s WHERE id=$%d RETURNING *", strings.Join(set, ","), idx)
		row := tx.QueryRowx(query, args...)
		var prop Property
		if err := row.StructScan(&prop); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "update failed"})
		}
		if err := appendAudit(tx, landlord.ID, prop.ID, "", user.ID, "property.updated", fiber.Map{
			"name": prop.Name,
		}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "audit failed"})
		}
		if err := tx.Commit(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "commit failed"})
		}
		return c.JSON(fiber.Map{"success": true, "data": prop})
	})

	group.Post("/properties/:id/media", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		propertyID := c.Params("id")
		if !isUUID(propertyID) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid property id"})
		}
		landlord, err := landlordForUser(deps.db(), user.ID)
		if err != nil {
			if errors.Is(err, errLandlordNotFound) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "landlord profile required"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		ok, err := landlordOwnsProperty(deps.db(), propertyID, landlord.ID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "ownership check failed"})
		}
		if !ok {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "forbidden"})
		}

		var body mediaInput
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid payload"})
		}
		if err := validateMediaInput(body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": err.Error()})
		}

		tx, err := deps.db().Beginx()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "transaction error"})
		}
		defer tx.Rollback()

		var unitID any
		if body.UnitID != "" {
			if !isUUID(body.UnitID) {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid unit id"})
			}
			unitID = body.UnitID
		}
		row := tx.QueryRowx(`INSERT INTO property_media (property_id, unit_id, kind, url, caption, uploaded_by)
            VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, property_id, kind, url, caption, uploaded_by, created_at`,
			propertyID, unitID, body.Kind, body.URL, nullableString(body.Caption), user.ID)
		var media struct {
			ID         string      `db:"id" json:"id"`
			PropertyID string      `db:"property_id" json:"propertyId"`
			Kind       string      `db:"kind" json:"kind"`
			URL        string      `db:"url" json:"url"`
			Caption    null.String `db:"caption" json:"caption,omitempty"`
			UploadedBy string      `db:"uploaded_by" json:"uploadedBy"`
			CreatedAt  time.Time   `db:"created_at" json:"createdAt"`
		}
		if err := row.StructScan(&media); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "insert failed"})
		}
		if err := appendAudit(tx, landlord.ID, propertyID, media.ID, user.ID, "property.media.added", fiber.Map{
			"kind": body.Kind,
		}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "audit failed"})
		}
		if err := tx.Commit(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "commit failed"})
		}
		return c.JSON(fiber.Map{"success": true, "data": media})
	})

	group.Delete("/properties/:id/media/:mediaId", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		propertyID := c.Params("id")
		mediaID := c.Params("mediaId")
		if !isUUID(propertyID) || !isUUID(mediaID) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid id"})
		}
		landlord, err := landlordForUser(deps.db(), user.ID)
		if err != nil {
			if errors.Is(err, errLandlordNotFound) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "landlord profile required"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		ok, err := landlordOwnsProperty(deps.db(), propertyID, landlord.ID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "ownership check failed"})
		}
		if !ok {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "forbidden"})
		}

		res, err := deps.db().Exec(`DELETE FROM property_media WHERE id=$1 AND property_id=$2`, mediaID, propertyID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "delete failed"})
		}
		affected, _ := res.RowsAffected()
		if affected == 0 {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "media not found"})
		}
		return c.JSON(fiber.Map{"success": true})
	})

	group.Put("/properties/:id/units", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		propertyID := c.Params("id")
		if !isUUID(propertyID) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid property id"})
		}
		landlord, err := landlordForUser(deps.db(), user.ID)
		if err != nil {
			if errors.Is(err, errLandlordNotFound) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "landlord profile required"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		ok, err := landlordOwnsProperty(deps.db(), propertyID, landlord.ID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "ownership check failed"})
		}
		if !ok {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "forbidden"})
		}

		var body unitsPayload
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid payload"})
		}
		if len(body.Units) == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "units required"})
		}

		tx, err := deps.db().Beginx()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "transaction error"})
		}
		defer tx.Rollback()

		resultUnits := []PropertyUnit{}
		for _, u := range body.Units {
			if err := validateUnitInput(u); err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": err.Error()})
			}
			metadata, pricing, err := serializeUnitPayloads(u)
			if err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": err.Error()})
			}
			if u.ID == "" {
				newID := uuid.New().String()
				row := tx.QueryRowx(`INSERT INTO property_units
                    (id, property_id, structure_label, address_type, block, phase, floor, door_number, display_name,
                     unit_type, status, maintenance_note, metadata_json, pricing_json, created_at, updated_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)
                    RETURNING *`,
					newID, propertyID, nullableString(u.Structure), u.AddressType, nullableString(u.Block),
					nullableString(u.Phase), nullableInt(u.Floor), nullableString(u.DoorNumber),
					nullableString(u.DisplayName), nullableString(u.UnitType), defaultUnitStatus(u.Status),
					nullableString(u.Maintenance), metadata, pricing, time.Now().UTC())
				var unit PropertyUnit
				if err := row.StructScan(&unit); err != nil {
					return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "insert unit failed"})
				}
				resultUnits = append(resultUnits, unit)
			} else {
				if !isUUID(u.ID) {
					return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid unit id"})
				}
				row := tx.QueryRowx(`UPDATE property_units SET
                    structure_label=$1,
                    address_type=$2,
                    block=$3,
                    phase=$4,
                    floor=$5,
                    door_number=$6,
                    display_name=$7,
                    unit_type=$8,
                    status=$9,
                    maintenance_note=$10,
                    metadata_json=$11,
                    pricing_json=$12,
                    updated_at=$13
                    WHERE id=$14 AND property_id=$15
                    RETURNING *`,
					nullableString(u.Structure), u.AddressType, nullableString(u.Block), nullableString(u.Phase),
					nullableInt(u.Floor), nullableString(u.DoorNumber), nullableString(u.DisplayName),
					nullableString(u.UnitType), defaultUnitStatus(u.Status), nullableString(u.Maintenance),
					metadata, pricing, time.Now().UTC(), u.ID, propertyID)
				var unit PropertyUnit
				if err := row.StructScan(&unit); err != nil {
					return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "update unit failed"})
				}
				resultUnits = append(resultUnits, unit)
			}
		}
		if err := appendAudit(tx, landlord.ID, propertyID, "", user.ID, "property.units.upserted", fiber.Map{"count": len(resultUnits)}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "audit failed"})
		}
		if err := tx.Commit(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "commit failed"})
		}
		return c.JSON(fiber.Map{"success": true, "data": resultUnits})
	})

	group.Post("/properties/:id/submit", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		propertyID := c.Params("id")
		if !isUUID(propertyID) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid property id"})
		}
		landlord, err := landlordForUser(deps.db(), user.ID)
		if err != nil {
			if errors.Is(err, errLandlordNotFound) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "landlord profile required"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		tx, err := deps.db().Beginx()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "transaction error"})
		}
		defer tx.Rollback()

		var prop Property
		if err := tx.Get(&prop, `SELECT * FROM properties WHERE id=$1 FOR UPDATE`, propertyID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "property not found"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		if prop.LandlordID != landlord.ID {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "forbidden"})
		}
		if prop.Status == PropertyStatusPending {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "already pending review"})
		}
		if prop.Status == PropertyStatusApproved {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "already approved"})
		}

		if err := ensurePropertySubmissionReadiness(tx, prop.ID); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": err.Error()})
		}

		if _, err := tx.Exec(`UPDATE properties SET status=$1, submitted_at=$2, updated_at=$2 WHERE id=$3`,
			PropertyStatusPending, time.Now().UTC(), prop.ID); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "update failed"})
		}
		if err := queueNotification(tx, "property.submitted", landlord.UserUUID, fiber.Map{
			"propertyId":   prop.ID,
			"propertyName": prop.Name,
		}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "notify failed"})
		}
		if err := appendAudit(tx, landlord.ID, prop.ID, "", user.ID, "property.submitted_for_review", fiber.Map{}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "audit failed"})
		}

		if err := tx.Commit(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "commit failed"})
		}
		return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"status": PropertyStatusPending}})
	})
}

type serializedPropertyPayloads struct {
	Address   json.RawMessage
	Location  json.RawMessage
	Details   json.RawMessage
	Amenities json.RawMessage
	Policies  json.RawMessage
}

func serializePropertyPayloads(input propertyInput) (serializedPropertyPayloads, error) {
	var result serializedPropertyPayloads
	if input.Address != nil {
		b, err := json.Marshal(input.Address)
		if err != nil {
			return result, errors.New("address invalid json structure")
		}
		result.Address = b
	}
	if input.Location != nil {
		b, err := json.Marshal(input.Location)
		if err != nil {
			return result, errors.New("location invalid json structure")
		}
		result.Location = b
	}
	if input.Details != nil {
		b, err := json.Marshal(input.Details)
		if err != nil {
			return result, errors.New("details invalid json structure")
		}
		result.Details = b
	}
	if input.Amenities != nil {
		b, err := json.Marshal(input.Amenities)
		if err != nil {
			return result, errors.New("amenities invalid json structure")
		}
		result.Amenities = b
	}
	if input.Policies != nil {
		b, err := json.Marshal(input.Policies)
		if err != nil {
			return result, errors.New("policies invalid json structure")
		}
		result.Policies = b
	}
	return result, nil
}

func validatePropertyInput(input propertyInput) error {
	if strings.TrimSpace(input.Name) == "" {
		return errors.New("name required")
	}
	if strings.TrimSpace(input.AddressType) == "" {
		return errors.New("address type required")
	}
	if input.Location == nil || strings.TrimSpace(asString(input.Location["formattedAddress"])) == "" {
		return errors.New("location requires a formatted address")
	}
	if _, ok := input.Location["lat"]; !ok {
		return errors.New("location latitude missing")
	}
	if _, ok := input.Location["lng"]; !ok {
		return errors.New("location longitude missing")
	}
	return nil
}

func ensurePropertySlug(tx *sqlx.Tx, name string) (string, error) {
	base := slugify(name)
	if base == "" {
		base = randomSlug()
	}
	slug := base
	for i := 0; i < 5; i++ {
		var exists bool
		if err := tx.Get(&exists, `SELECT EXISTS(SELECT 1 FROM properties WHERE slug=$1)`, slug); err != nil {
			return "", err
		}
		if !exists {
			return slug, nil
		}
		slug = fmt.Sprintf("%s-%d", base, rand.Intn(9999))
	}
	return fmt.Sprintf("%s-%d", base, time.Now().Unix()), nil
}

func slugify(input string) string {
	lower := strings.ToLower(strings.TrimSpace(input))
	builder := strings.Builder{}
	prevHyphen := false
	for _, r := range lower {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			builder.WriteRune(r)
			prevHyphen = false
			continue
		}
		if r == ' ' || r == '-' {
			if !prevHyphen && builder.Len() > 0 {
				builder.WriteRune('-')
				prevHyphen = true
			}
		}
	}
	slug := builder.String()
	return strings.Trim(slug, "-")
}

func randomSlug() string {
	return fmt.Sprintf("property-%d", rand.Intn(999999))
}

func validateMediaInput(in mediaInput) error {
	if strings.TrimSpace(in.URL) == "" {
		return errors.New("media url required")
	}
	switch in.Kind {
	case MediaKindInterior, MediaKindExterior, MediaKindFloorplan, MediaKindDocument:
	default:
		return errors.New("invalid media kind")
	}
	return nil
}

func validateUnitInput(in unitInput) error {
	if strings.TrimSpace(in.AddressType) == "" {
		return errors.New("unit address type required")
	}
	if strings.TrimSpace(in.Status) == "" {
		in.Status = "draft"
	}
	return nil
}

func serializeUnitPayloads(in unitInput) ([]byte, []byte, error) {
	metadata, err := json.Marshal(in.Metadata)
	if err != nil {
		return nil, nil, errors.New("unit metadata invalid")
	}
	pricing, err := json.Marshal(in.Pricing)
	if err != nil {
		return nil, nil, errors.New("unit pricing invalid")
	}
	return metadata, pricing, nil
}

func defaultUnitStatus(status string) string {
	if status == "" {
		return "draft"
	}
	return status
}

func nullableInt(v *int) any {
	if v == nil {
		return nil
	}
	return *v
}

func ensurePropertySubmissionReadiness(tx *sqlx.Tx, propertyID string) error {
	var counts struct {
		Interior int `db:"interior"`
		Exterior int `db:"exterior"`
		Units    int `db:"units"`
	}
	if err := tx.Get(&counts, `SELECT
        (SELECT COUNT(*) FROM property_media WHERE property_id=$1 AND kind='interior') AS interior,
        (SELECT COUNT(*) FROM property_media WHERE property_id=$1 AND kind='exterior') AS exterior,
        (SELECT COUNT(*) FROM property_units WHERE property_id=$1) AS units`, propertyID); err != nil {
		return err
	}
	if counts.Interior == 0 || counts.Exterior == 0 {
		return errors.New("add at least one interior and one exterior photo")
	}
	if counts.Units == 0 {
		return errors.New("add at least one unit")
	}
	var loc struct {
		Lat sql.NullFloat64 `db:"lat"`
		Lng sql.NullFloat64 `db:"lng"`
	}
	if err := tx.Get(&loc, `SELECT
        (location_json->>'lat')::double precision AS lat,
        (location_json->>'lng')::double precision AS lng
        FROM properties WHERE id=$1`, propertyID); err != nil {
		return err
	}
	if !loc.Lat.Valid || !loc.Lng.Valid {
		return errors.New("property location incomplete")
	}
	return nil
}
