package coreapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

func New(baseURL, token string, httpClient *http.Client) *Client {
	c := httpClient
	if c == nil {
		c = &http.Client{Timeout: 10 * time.Second}
	}
	return &Client{BaseURL: strings.TrimRight(baseURL, "/"), Token: token, HTTP: c}
}

// EnrollApp enrolls the given user into an app (idempotent on the Core API side).
func (c *Client) EnrollApp(app, userUUID string) error {
	if c.BaseURL == "" || c.Token == "" {
		return nil // silently skip when not configured
	}
	url := fmt.Sprintf("%s/v1/apps/%s", c.BaseURL, app)
	req, _ := http.NewRequest(http.MethodPost, url, http.NoBody)
	req.Header.Set("Authorization", "Bearer "+c.Token)
	if userUUID != "" {
		req.Header.Set("X-User-UUID", userUUID)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		// read at most a small body for context
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("coreapi enroll app failed: %s: %s", resp.Status, string(b))
	}
	return nil
}

// GrantAppRole adds a role within an app for the given user.
// Requires service token on Core API. Targets the user via X-User-UUID header.
func (c *Client) GrantAppRole(app, userUUID, role string) error {
	if c.BaseURL == "" || c.Token == "" || role == "" {
		return nil // silently skip when not configured
	}
	url := fmt.Sprintf("%s/v1/apps/%s/roles", c.BaseURL, app)
	body, _ := json.Marshal(map[string]string{"role": role})
	req, _ := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.Token)
	if userUUID != "" {
		req.Header.Set("X-User-UUID", userUUID)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("coreapi grant role failed: %s: %s", resp.Status, string(b))
	}
	return nil
}
