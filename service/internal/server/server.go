package server

import (
	"net/http"
	"time"

	"github.com/berjistech/berjis-ecosystem/cribs/service/internal/auth"
	"github.com/berjistech/berjis-ecosystem/cribs/service/internal/config"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/jmoiron/sqlx"
)

type Options struct {
	Config     config.Config
	DB         *sqlx.DB
	HTTPClient *http.Client
}

func (o Options) httpClient() *http.Client {
	if o.HTTPClient != nil {
		return o.HTTPClient
	}
	return &http.Client{
		Timeout: 10 * time.Second,
	}
}

func New(opts Options) *fiber.App {
	app := fiber.New()

	app.Use(cors.New(cors.Config{
		AllowOrigins:     opts.Config.AllowedOrigins,
		AllowMethods:     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
		AllowHeaders:     "Authorization,Content-Type,Accept,X-User-ID",
		AllowCredentials: true,
	}))

	// Health
	app.Get("/v1/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"success": true, "message": "ok"})
	})

	app.Use("/v1/public/*", limiter.New(limiter.Config{
		Max:        200,
		Expiration: 1 * time.Minute,
	}))

	publicDeps := publicDeps{
		DB:         opts.DB,
		Config:     opts.Config,
		HTTPClient: opts.httpClient(),
	}
	registerPublicRoutes(app, publicDeps)

	app.Use(auth.Middleware(auth.Options{HS256Secret: opts.Config.AuthHS256Secret, Env: opts.Config.Env}))

	protected := protectedDeps{
		publicDeps: publicDeps,
	}

	registerLandlordRoutes(app, protected)
	registerPropertyRoutes(app, protected)
	registerAdminRoutes(app, protected)
	registerSupportRoutes(app, protected)

	return app
}
