package server

import (
	"database/sql"
	"errors"

	"github.com/jmoiron/sqlx"
)

var errLandlordNotFound = errors.New("landlord profile not found")

func landlordForUser(db *sqlx.DB, userID string) (LandlordProfile, error) {
	var landlord LandlordProfile
	err := db.Get(&landlord, `SELECT * FROM landlords WHERE user_uuid=$1 AND status='active'`, userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return LandlordProfile{}, errLandlordNotFound
		}
		return LandlordProfile{}, err
	}
	return landlord, nil
}

func landlordOwnsProperty(db *sqlx.DB, propertyID, landlordID string) (bool, error) {
	var ok bool
	err := db.Get(&ok, `SELECT EXISTS(SELECT 1 FROM properties WHERE id=$1 AND landlord_id=$2)`, propertyID, landlordID)
	return ok, err
}
