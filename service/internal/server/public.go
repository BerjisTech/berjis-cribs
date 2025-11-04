package server

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

func registerPublicRoutes(app *fiber.App, deps publicDeps) {
	app.Get("/v1/public/properties", func(c *fiber.Ctx) error {
		limit := clampInt(c.QueryInt("limit", 50), 1, 200)
		offset := maxInt(c.QueryInt("offset", 0), 0)
		search := strings.TrimSpace(c.Query("q"))
		landlordID := strings.TrimSpace(c.Query("landlordId"))
		bbox := strings.TrimSpace(c.Query("bbox"))

		where := []string{"p.status = $1"}
		args := []any{PropertyStatusApproved}
		placeholder := 2

		if search != "" {
			where = append(where, fmt.Sprintf("(p.name ILIKE $%d OR p.slug ILIKE $%d OR (p.details_json->>'city') ILIKE $%d)", placeholder, placeholder, placeholder))
			args = append(args, "%"+search+"%")
			placeholder++
		}
		if landlordID != "" {
			where = append(where, fmt.Sprintf("p.landlord_id = $%d", placeholder))
			args = append(args, landlordID)
			placeholder++
		}
		if bbox != "" {
			coords := strings.Split(bbox, ",")
			if len(coords) == 4 {
				minLng, err1 := strconv.ParseFloat(strings.TrimSpace(coords[0]), 64)
				minLat, err2 := strconv.ParseFloat(strings.TrimSpace(coords[1]), 64)
				maxLng, err3 := strconv.ParseFloat(strings.TrimSpace(coords[2]), 64)
				maxLat, err4 := strconv.ParseFloat(strings.TrimSpace(coords[3]), 64)
				if err1 == nil && err2 == nil && err3 == nil && err4 == nil {
					where = append(where, fmt.Sprintf("((p.location_json->>'lng')::double precision BETWEEN $%d AND $%d) AND ((p.location_json->>'lat')::double precision BETWEEN $%d AND $%d)", placeholder, placeholder+1, placeholder+2, placeholder+3))
					args = append(args, minLng, maxLng, minLat, maxLat)
					placeholder += 4
				}
			}
		}

		whereClause := strings.Join(where, " AND ")
		args = append(args, limit, offset)

		query := fmt.Sprintf(`SELECT
            p.id,
            p.name,
            p.slug,
            left(coalesce(p.description, ''), 280) AS summary,
            p.landlord_id,
            l.display_name AS landlord_name,
            p.address_json,
            p.location_json,
            p.details_json,
            p.amenities_json,
            p.updated_at
        FROM properties p
        JOIN landlords l ON p.landlord_id = l.id
        WHERE %s
        ORDER BY p.updated_at DESC
        LIMIT $%d OFFSET $%d`, whereClause, placeholder, placeholder+1)

		rows, err := deps.DB.Queryx(query, args...)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
		}
		defer rows.Close()

		props := []PublicProperty{}
		propIDs := []string{}
		for rows.Next() {
			var p PublicProperty
			if err := rows.StructScan(&p); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "scan error"})
			}
			props = append(props, p)
			propIDs = append(propIDs, p.ID)
		}
		if len(props) == 0 {
			return c.JSON(fiber.Map{"success": true, "data": props})
		}

		mediaByProperty, err := fetchPreviewMedia(deps, propIDs)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "media error"})
		}
		for i, p := range props {
			props[i].Media = mediaByProperty[p.ID]
		}

		return c.JSON(fiber.Map{"success": true, "data": props})
	})
}

// Public unit status for a property: minimal fields for occupancy map
func registerPublicUnitStatusRoutes(app *fiber.App, deps publicDeps) {
    app.Get("/v1/public/properties/:id/units/status", func(c *fiber.Ctx) error {
        propertyID := c.Params("id")
        if !isUUID(propertyID) {
            return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid property id"})
        }
        rows, err := deps.DB.Queryx(`SELECT id, door_number, status, address_type, block, phase, floor
            FROM property_units WHERE property_id=$1 ORDER BY COALESCE(floor,0), door_number`, propertyID)
        if err != nil {
            return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
        }
        defer rows.Close()
        type item struct {
            ID          string `db:"id" json:"id"`
            DoorNumber  string `db:"door_number" json:"doorNumber"`
            Status      string `db:"status" json:"status"`
            AddressType string `db:"address_type" json:"addressType"`
            Block       string `db:"block" json:"block,omitempty"`
            Phase       string `db:"phase" json:"phase,omitempty"`
            Floor       *int   `db:"floor" json:"floor,omitempty"`
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
}

func fetchPreviewMedia(deps publicDeps, propertyIDs []string) (map[string][]PublicMedia, error) {
	if len(propertyIDs) == 0 {
		return map[string][]PublicMedia{}, nil
	}
	query, args, err := sqlxIn(`SELECT id, property_id, kind, url
        FROM property_media
        WHERE property_id IN (?) AND kind IN ('interior','exterior')
        ORDER BY created_at ASC`, propertyIDs)
	if err != nil {
		return nil, err
	}
	rows, err := deps.DB.Queryx(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string][]PublicMedia)
	for rows.Next() {
		var item struct {
			ID         string `db:"id"`
			PropertyID string `db:"property_id"`
			Kind       string `db:"kind"`
			URL        string `db:"url"`
		}
		if err := rows.StructScan(&item); err != nil {
			return nil, err
		}
		list := out[item.PropertyID]
		if len(list) >= 6 {
			continue
		}
		list = append(list, PublicMedia{ID: item.ID, Kind: item.Kind, URL: item.URL})
		out[item.PropertyID] = list
	}
	return out, nil
}

func clampInt(v, min, max int) int {
	return int(math.Max(float64(min), math.Min(float64(max), float64(v))))
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
