package server

import (
    "database/sql"
    "fmt"
    "time"

    "github.com/berjistech/berjis-ecosystem/cribs/service/internal/auth"
    "github.com/gofiber/fiber/v2"
    "github.com/google/uuid"
)

type leaseInput struct {
    UnitID     string  `json:"unitId"`
    TenantUUID string  `json:"tenantUuid"`
    Type       string  `json:"type"`
    Status     string  `json:"status"`
    StartDate  string  `json:"startDate"`
    EndDate    string  `json:"endDate"`
    Rate       float64 `json:"rate"`
    Frequency  string  `json:"frequency"`
    Deposit    float64 `json:"deposit"`
}

type paymentInput struct {
    Amount   float64 `json:"amount"`
    Method   string  `json:"method"`
    Reference string `json:"reference"`
    PaidOn   string  `json:"paidOn"`
}

func registerLeaseRoutes(app *fiber.App, deps protectedDeps) {
    // Landlord leases
    group := app.Group("/v1/landlord")

    group.Get("/leases", func(c *fiber.Ctx) error {
        user := auth.UserFromCtx(c)
        landlord, err := landlordForUser(deps.db(), user.ID)
        if err != nil {
            return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "landlord profile required"})
        }
        rows, err := deps.db().Queryx(`SELECT l.*, u.door_number AS unit_door
            FROM leases l JOIN property_units u ON u.id=l.unit_id WHERE l.landlord_id=$1 ORDER BY l.created_at DESC`, landlord.ID)
        if err != nil { return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false}) }
        defer rows.Close()
        out := []map[string]any{}
        for rows.Next() {
            m := map[string]any{}
            if err := rows.MapScan(m); err != nil { return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false}) }
            out = append(out, m)
        }
        return c.JSON(fiber.Map{"success": true, "data": out})
    })

    group.Post("/leases", func(c *fiber.Ctx) error {
        user := auth.UserFromCtx(c)
        landlord, err := landlordForUser(deps.db(), user.ID)
        if err != nil { return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "landlord required"}) }
        var in leaseInput
        if err := c.BodyParser(&in); err != nil { return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid payload"}) }
        if !isUUID(in.UnitID) || in.TenantUUID == "" || in.Type == "" || in.StartDate == "" || in.Frequency == "" {
            return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "missing fields"})
        }
        // ensure unit belongs to landlord
        var pid, uid string
        if err := deps.db().Get(&pid, `SELECT property_id FROM property_units WHERE id=$1`, in.UnitID); err != nil {
            return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "unit not found"})
        }
        if err := deps.db().Get(&uid, `SELECT id FROM properties WHERE id=$1 AND landlord_id=$2`, pid, landlord.ID); err != nil {
            return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "not your unit"})
        }
        start, _ := time.Parse("2006-01-02", in.StartDate)
        var endPtr *time.Time
        if in.EndDate != "" { e, _ := time.Parse("2006-01-02", in.EndDate); endPtr = &e }

        id := uuid.New().String()
        _, err = deps.db().Exec(`INSERT INTO leases (id, landlord_id, property_id, unit_id, tenant_uuid, type, status, start_date, end_date, rate, frequency, deposit)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            id, landlord.ID, pid, in.UnitID, in.TenantUUID, in.Type, coalesceStr(in.Status, "active"), start, endPtr, in.Rate, in.Frequency, in.Deposit)
        if err != nil { return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "insert failed"}) }
        return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"id": id}})
    })

    group.Put("/leases/:id", func(c *fiber.Ctx) error {
        user := auth.UserFromCtx(c)
        landlord, err := landlordForUser(deps.db(), user.ID)
        if err != nil { return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false}) }
        id := c.Params("id")
        if !isUUID(id) { return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false}) }
        var in struct {
            Status   string `json:"status"`
            EndDate  string `json:"endDate"`
            Note     string `json:"note"`
        }
        if err := c.BodyParser(&in); err != nil { return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false}) }
        // update fields including meta_json note
        _, err = deps.db().Exec(`UPDATE leases SET status=COALESCE(NULLIF($1,''), status), end_date=COALESCE($2, end_date),
            meta_json = jsonb_set(COALESCE(meta_json,'{}'::jsonb), '{endNote}', to_jsonb(COALESCE(NULLIF($3,''), (meta_json->>'endNote'))), true),
            updated_at=NOW()
            WHERE id=$4 AND landlord_id=$5`, in.Status, nullDate(in.EndDate), in.Note, id, landlord.ID)
        if err != nil { return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false}) }
        return c.JSON(fiber.Map{"success": true})
    })

    group.Post("/leases/:id/payments", func(c *fiber.Ctx) error {
        user := auth.UserFromCtx(c)
        landlord, err := landlordForUser(deps.db(), user.ID)
        if err != nil { return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false}) }
        id := c.Params("id")
        if !isUUID(id) { return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false}) }
        // ensure lease belongs to landlord
        var ok bool
        if err := deps.db().Get(&ok, `SELECT EXISTS(SELECT 1 FROM leases WHERE id=$1 AND landlord_id=$2)`, id, landlord.ID); err != nil || !ok {
            return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
        }
        var in paymentInput
        if err := c.BodyParser(&in); err != nil { return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false}) }
        paidOn := nullDate(in.PaidOn)
        payID := uuid.New().String()
        tx, err := deps.db().Beginx(); if err != nil { return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false}) }
        defer tx.Rollback()
        if _, err := tx.Exec(`INSERT INTO payments (id, lease_id, amount, status, method, reference, paid_on) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            payID, id, in.Amount, "paid", in.Method, in.Reference, paidOn); err != nil {
            return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
        }
        receiptID := uuid.New().String()
        rno := fmt.Sprintf("RC-%s", time.Now().UTC().Format("20060102-150405"))
        if _, err := tx.Exec(`INSERT INTO receipts (id, lease_id, payment_id, number) VALUES ($1,$2,$3,$4)`, receiptID, id, payID, rno); err != nil {
            return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
        }
        if err := tx.Commit(); err != nil { return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false}) }
        return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"paymentId": payID, "receiptNo": rno}})
    })

    group.Get("/leases/:id/payments", func(c *fiber.Ctx) error {
        user := auth.UserFromCtx(c)
        landlord, err := landlordForUser(deps.db(), user.ID)
        if err != nil { return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false}) }
        id := c.Params("id")
        if !isUUID(id) { return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false}) }
        var ok bool
        if err := deps.db().Get(&ok, `SELECT EXISTS(SELECT 1 FROM leases WHERE id=$1 AND landlord_id=$2)`, id, landlord.ID); err != nil || !ok {
            return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
        }
        type payment struct {
            ID        string         `db:"id" json:"id"`
            Amount    float64        `db:"amount" json:"amount"`
            Status    string         `db:"status" json:"status"`
            Method    sql.NullString `db:"method" json:"method,omitempty"`
            Reference sql.NullString `db:"reference" json:"reference,omitempty"`
            PaidOn    sql.NullTime   `db:"paid_on" json:"paidOn,omitempty"`
            ReceiptNo sql.NullString `db:"receipt_no" json:"receiptNo,omitempty"`
            IssuedOn  sql.NullTime   `db:"issued_on" json:"issuedOn,omitempty"`
        }
        rows, err := deps.db().Queryx(`SELECT p.*, r.number AS receipt_no, r.issued_on FROM payments p LEFT JOIN receipts r ON r.payment_id=p.id WHERE p.lease_id=$1 ORDER BY p.created_at DESC`, id)
        if err != nil { return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false}) }
        defer rows.Close()
        out := []payment{}
        for rows.Next() { var p payment; if err := rows.StructScan(&p); err == nil { out = append(out, p) } }
        return c.JSON(fiber.Map{"success": true, "data": out})
    })

    // Tenant lease detail
    t := app.Group("/v1/tenant")
    t.Get("/leases/:id", func(c *fiber.Ctx) error {
        user := auth.UserFromCtx(c)
        id := c.Params("id")
        if !isUUID(id) { return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false}) }
        var ok bool
        if err := deps.db().Get(&ok, `SELECT EXISTS(SELECT 1 FROM leases WHERE id=$1 AND tenant_uuid=$2)`, id, user.ID); err != nil || !ok {
            return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
        }
        type payment struct {
            ID        string         `db:"id" json:"id"`
            Amount    float64        `db:"amount" json:"amount"`
            Status    string         `db:"status" json:"status"`
            Method    sql.NullString `db:"method" json:"method,omitempty"`
            Reference sql.NullString `db:"reference" json:"reference,omitempty"`
            PaidOn    sql.NullTime   `db:"paid_on" json:"paidOn,omitempty"`
            ReceiptNo sql.NullString `db:"receipt_no" json:"receiptNo,omitempty"`
            IssuedOn  sql.NullTime   `db:"issued_on" json:"issuedOn,omitempty"`
        }
        lease := map[string]any{}
        row := deps.db().QueryRowx(`SELECT * FROM leases WHERE id=$1`, id)
        if err := row.MapScan(lease); err != nil { return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false}) }
        rows, err := deps.db().Queryx(`SELECT p.*, r.number AS receipt_no, r.issued_on FROM payments p LEFT JOIN receipts r ON r.payment_id=p.id WHERE p.lease_id=$1 ORDER BY p.created_at DESC`, id)
        if err != nil { return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false}) }
        defer rows.Close()
        pays := []payment{}
        for rows.Next() { var p payment; if err := rows.StructScan(&p); err == nil { pays = append(pays, p) } }
        return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"lease": lease, "payments": pays}})
    })
}

func coalesceStr(v string, d string) string { if v == "" { return d }; return v }
func nullDate(s string) *time.Time { if s == "" { return nil }; t, _ := time.Parse("2006-01-02", s); return &t }
