package server

import (
    "bytes"
    "database/sql"
    "fmt"
    "time"

    "github.com/berjistech/berjis-ecosystem/cribs/service/internal/auth"
    "github.com/gofiber/fiber/v2"
    gofpdf "github.com/jung-kurt/gofpdf"
)

type receiptRow struct {
    Number     string       `db:"number"`
    IssuedOn   time.Time    `db:"issued_on"`
    Amount     float64      `db:"amount"`
    Method     sql.NullString `db:"method"`
    Reference  sql.NullString `db:"reference"`
    TenantUUID string       `db:"tenant_uuid"`
    LandlordID string       `db:"landlord_id"`
}

func registerReceiptRoutes(app *fiber.App, deps protectedDeps) {
    landlord := app.Group("/v1/landlord")
    landlord.Get("/receipts/:number.pdf", func(c *fiber.Ctx) error {
        user := auth.UserFromCtx(c)
        var row receiptRow
        n := c.Params("number")
        err := deps.db().Get(&row, `SELECT r.number, r.issued_on, p.amount, p.method, p.reference, l.tenant_uuid, l.landlord_id
            FROM receipts r JOIN payments p ON p.id=r.payment_id JOIN leases l ON l.id=r.lease_id
            WHERE r.number=$1`, n)
        if err != nil { return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false}) }
        // ensure landlord authorization
        land, err := landlordForUser(deps.db(), user.ID)
        if err != nil || land.ID != row.LandlordID { return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false}) }
        pdf := buildReceiptPDF(row)
        var buf bytes.Buffer
        if err := pdf.Output(&buf); err != nil { return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false}) }
        c.Set("Content-Type", "application/pdf")
        c.Set("Content-Disposition", fmt.Sprintf("inline; filename=\"%s.pdf\"", n))
        return c.Send(buf.Bytes())
    })

    tenant := app.Group("/v1/tenant")
    tenant.Get("/receipts/:number.pdf", func(c *fiber.Ctx) error {
        user := auth.UserFromCtx(c)
        var row receiptRow
        n := c.Params("number")
        err := deps.db().Get(&row, `SELECT r.number, r.issued_on, p.amount, p.method, p.reference, l.tenant_uuid, l.landlord_id
            FROM receipts r JOIN payments p ON p.id=r.payment_id JOIN leases l ON l.id=r.lease_id
            WHERE r.number=$1`, n)
        if err != nil { return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false}) }
        if row.TenantUUID != user.ID { return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false}) }
        pdf := buildReceiptPDF(row)
        var buf bytes.Buffer
        if err := pdf.Output(&buf); err != nil { return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false}) }
        c.Set("Content-Type", "application/pdf")
        c.Set("Content-Disposition", fmt.Sprintf("inline; filename=\"%s.pdf\"", n))
        return c.Send(buf.Bytes())
    })
}

func buildReceiptPDF(r receiptRow) *gofpdf.Fpdf {
    pdf := gofpdf.New("P", "mm", "A4", "")
    pdf.AddPage()
    pdf.SetFont("Helvetica", "B", 16)
    pdf.Cell(40, 10, "Payment Receipt")
    pdf.Ln(10)
    pdf.SetFont("Helvetica", "", 12)
    pdf.Cell(40, 8, fmt.Sprintf("Receipt No: %s", r.Number))
    pdf.Ln(6)
    pdf.Cell(40, 8, fmt.Sprintf("Issued On: %s", r.IssuedOn.Format("02 Jan 2006")))
    pdf.Ln(6)
    pdf.Cell(40, 8, fmt.Sprintf("Amount: KES %.2f", r.Amount))
    pdf.Ln(6)
    if r.Method.Valid { pdf.Cell(40, 8, fmt.Sprintf("Method: %s", r.Method.String)); pdf.Ln(6) }
    if r.Reference.Valid { pdf.Cell(40, 8, fmt.Sprintf("Reference: %s", r.Reference.String)); pdf.Ln(6) }
    pdf.Ln(6)
    pdf.Cell(40, 8, "Thank you")
    return pdf
}

