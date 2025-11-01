package server

import (
	"net/http"

	"github.com/berjistech/berjis-ecosystem/cribs/service/internal/config"
	"github.com/jmoiron/sqlx"
)

type publicDeps struct {
	DB         *sqlx.DB
	Config     config.Config
	HTTPClient *http.Client
}

type protectedDeps struct {
	publicDeps
}

func (d protectedDeps) db() *sqlx.DB {
	return d.DB
}
