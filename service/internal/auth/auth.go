package auth

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

type Options struct {
	HS256Secret string
	Env         string
}

type User struct {
	ID        string
	Email     string
	Roles     []string
	IsService bool
}

func (u User) HasRole(role string) bool {
	role = strings.ToLower(role)
	for _, r := range u.Roles {
		if strings.ToLower(r) == role {
			return true
		}
	}
	return false
}

func (u User) HasAnyRole(roles ...string) bool {
	for _, role := range roles {
		if u.HasRole(role) {
			return true
		}
	}
	return false
}

type contextKey string

const userKey contextKey = "cribs.user"

var errUnauthorized = errors.New("unauthorized")

func Middleware(opts Options) fiber.Handler {
	return func(c *fiber.Ctx) error {
		raw := c.Get("Authorization")
		if raw == "" {
			if cookie := c.Cookies("access"); cookie != "" {
				raw = cookie
			}
		}
		user, err := parseUser(raw, opts)
		if err != nil {
			if opts.Env == "development" {
				if id := c.Get("X-User-ID"); id != "" {
					user = &User{ID: id, Email: c.Get("X-User-Email")}
					err = nil
				}
			}
		}
		if err != nil || user == nil || user.ID == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "login required"})
		}
		c.Locals(userKey, *user)
		return c.Next()
	}
}

func parseUser(raw string, opts Options) (*User, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, errUnauthorized
	}
	tokenStr := raw
	if strings.HasPrefix(strings.ToLower(raw), "bearer ") {
		tokenStr = strings.TrimSpace(raw[7:])
	}
	if tokenStr == "" {
		return nil, errUnauthorized
	}
	if opts.HS256Secret == "" {
		return nil, errors.New("auth secret not configured")
	}
	claims := jwt.MapClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(opts.HS256Secret), nil
	})
	if err != nil || !token.Valid {
		return nil, errUnauthorized
	}
	uid, _ := claims["sub"].(string)
	email, _ := claims["email"].(string)
	var roles []string
	if r, ok := claims["roles"].([]interface{}); ok {
		for _, v := range r {
			if s, ok := v.(string); ok {
				roles = append(roles, s)
			}
		}
	} else if s, ok := claims["roles"].(string); ok && s != "" {
		roles = strings.Split(s, " ")
	}
	isService := false
	if aud, ok := claims["aud"].([]interface{}); ok {
		for _, v := range aud {
			if s, ok := v.(string); ok && strings.HasSuffix(s, ":service") {
				isService = true
			}
		}
	}
	if uid == "" {
		return nil, errUnauthorized
	}
	return &User{ID: uid, Email: email, Roles: roles, IsService: isService}, nil
}

func UserFromCtx(c *fiber.Ctx) User {
	if v := c.Locals(userKey); v != nil {
		if u, ok := v.(User); ok {
			return u
		}
	}
	return User{}
}

func RequireRoles(c *fiber.Ctx, roles ...string) error {
	user := UserFromCtx(c)
	if len(roles) == 0 {
		return nil
	}
	roleSet := map[string]struct{}{}
	for _, r := range user.Roles {
		roleSet[strings.ToLower(r)] = struct{}{}
	}
	for _, need := range roles {
		if _, ok := roleSet[strings.ToLower(need)]; ok {
			return nil
		}
	}
	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "forbidden"})
}
