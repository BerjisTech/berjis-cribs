package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/berjistech/berjis-ecosystem/cribs/service/internal/auth"
	"github.com/gofiber/fiber/v2"
	"github.com/jmoiron/sqlx"
)

func registerSupportRoutes(app *fiber.App, deps protectedDeps) {
	group := app.Group("/v1/landlord")

	group.Get("/notifications", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		rows, err := deps.db().Queryx(`SELECT id, kind, target_uuid, payload, status, created_at, processed_at
            FROM notification_outbox
            WHERE target_uuid=$1
            ORDER BY created_at DESC
            LIMIT 25`, user.ID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		defer rows.Close()
		type notif struct {
			ID          int64           `db:"id" json:"id"`
			Kind        string          `db:"kind" json:"kind"`
			Target      string          `db:"target_uuid" json:"targetUuid"`
			Payload     json.RawMessage `db:"payload" json:"payload"`
			Status      string          `db:"status" json:"status"`
			CreatedAt   time.Time       `db:"created_at" json:"createdAt"`
			ProcessedAt *time.Time      `db:"processed_at" json:"processedAt,omitempty"`
		}
		out := []notif{}
		for rows.Next() {
			var n notif
			if err := rows.StructScan(&n); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "scan error"})
			}
			out = append(out, n)
		}
		return c.JSON(fiber.Map{"success": true, "data": out})
	})

	group.Get("/audit-trail", func(c *fiber.Ctx) error {
		user := auth.UserFromCtx(c)
		landlord, err := landlordForUser(deps.db(), user.ID)
		if err != nil {
			if errors.Is(err, errLandlordNotFound) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "landlord profile required"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		propertyID := c.Query("propertyId")
		var rows *sqlx.Rows
		if propertyID != "" && isUUID(propertyID) {
			rows, err = deps.db().Queryx(`SELECT id, landlord_id, property_id, unit_id, actor_uuid, action, payload, created_at
                FROM landlord_audit_logs
                WHERE landlord_id=$1 AND property_id=$2
                ORDER BY created_at DESC
                LIMIT 50`, landlord.ID, propertyID)
		} else {
			rows, err = deps.db().Queryx(`SELECT id, landlord_id, property_id, unit_id, actor_uuid, action, payload, created_at
                FROM landlord_audit_logs
                WHERE landlord_id=$1
                ORDER BY created_at DESC
                LIMIT 50`, landlord.ID)
		}
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		defer rows.Close()
		type audit struct {
			ID         int64           `db:"id" json:"id"`
			LandlordID string          `db:"landlord_id" json:"landlordId"`
			PropertyID string          `db:"property_id" json:"propertyId"`
			UnitID     sql.NullString  `db:"unit_id" json:"unitId,omitempty"`
			Actor      string          `db:"actor_uuid" json:"actorUuid"`
			Action     string          `db:"action" json:"action"`
			Payload    json.RawMessage `db:"payload" json:"payload"`
			CreatedAt  time.Time       `db:"created_at" json:"createdAt"`
		}
		out := []audit{}
		for rows.Next() {
			var a audit
			if err := rows.StructScan(&a); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "scan error"})
			}
			out = append(out, a)
		}
		return c.JSON(fiber.Map{"success": true, "data": out})
	})
}

func queueNotification(tx *sqlx.Tx, kind string, targetUUID string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO notification_outbox(kind, target_uuid, payload) VALUES ($1,$2,$3)`, kind, targetUUID, data)
	return err
}

func appendAudit(tx *sqlx.Tx, landlordID, propertyID, unitID, actorUUID, action string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	var unit any
	if strings.TrimSpace(unitID) != "" {
		unit = unitID
	}
	_, err = tx.Exec(`INSERT INTO landlord_audit_logs(landlord_id, property_id, unit_id, actor_uuid, action, payload)
        VALUES ($1,$2,$3,$4,$5,$6)`, landlordID, propertyID, unit, actorUUID, action, data)
	return err
}
