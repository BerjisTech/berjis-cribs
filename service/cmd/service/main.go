package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"

	"github.com/berjistech/berjis-ecosystem/cribs/service/internal/config"
	"github.com/berjistech/berjis-ecosystem/cribs/service/internal/db"
	"github.com/berjistech/berjis-ecosystem/cribs/service/internal/migrate"
	"github.com/berjistech/berjis-ecosystem/cribs/service/internal/server"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()

	conn, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	dir := os.Getenv("MIGRATIONS_DIR")
	if dir == "" {
		dir = "./migrations"
	}
	runner := migrate.Runner{Dir: dir}
	if err := runner.Up(conn); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	httpClient := &http.Client{Timeout: 10 * time.Second}
	app := server.New(server.Options{
		Config:     cfg,
		DB:         conn,
		HTTPClient: httpClient,
	})

	addr := ":" + cfg.Port
	log.Printf("starting %s on %s (env=%s)", cfg.AppName, addr, cfg.Env)
	if err := app.Listen(addr); err != nil {
		log.Println("cribs service shutdown:", err)
		os.Exit(1)
	}
}
