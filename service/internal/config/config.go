package config

import "os"

type Config struct {
	AppName            string
	Env                string
	Port               string
	DatabaseURL        string
	AllowedOrigins     string
	AuthHS256Secret    string
	CoreAPIBase        string
	CoreAPIToken       string
	NotificationTopic  string
	BillingWebhookKey  string
	UploadsDirectory   string
	DefaultCurrency    string
	GeoProviderBaseURL string
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func Load() Config {
	return Config{
		AppName:            getenv("APP_NAME", "berjis-cribs"),
		Env:                getenv("APP_ENV", "development"),
		Port:               getenv("PORT", "8095"),
		DatabaseURL:        getenv("DATABASE_URL", "postgres://postgres:postgres@localhost:5438/berjis_cribs?sslmode=disable"),
		AllowedOrigins:     getenv("ALLOWED_ORIGINS", "http://localhost:5400,http://localhost:8095,https://cribs.berjis.tech,https://cribs-api.berjis.tech,https://berjis.tech"),
		AuthHS256Secret:    getenv("AUTH_JWT_HS256_SECRET", ""),
		CoreAPIBase:        getenv("CORE_API_BASE", "http://localhost:8080"),
		CoreAPIToken:       getenv("CORE_API_SERVICE_TOKEN", ""),
		NotificationTopic:  getenv("NOTIFICATION_TOPIC", "cribs-events"),
		BillingWebhookKey:  getenv("BILLING_WEBHOOK_KEY", ""),
		UploadsDirectory:   getenv("UPLOADS_DIR", "./uploads"),
		DefaultCurrency:    getenv("DEFAULT_CURRENCY", "KES"),
		GeoProviderBaseURL: getenv("GEO_PROVIDER_BASE_URL", "https://api.mapbox.com"),
	}
}
