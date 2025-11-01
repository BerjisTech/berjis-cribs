package server

import "github.com/jmoiron/sqlx"

func sqlxIn(query string, args any) (string, []any, error) {
	q, params, err := sqlx.In(query, args)
	if err != nil {
		return "", nil, err
	}
	q = sqlx.Rebind(sqlx.DOLLAR, q)
	return q, params, nil
}

func asString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case []byte:
		return string(t)
	default:
		return ""
	}
}

func asSlice(v any) []any {
	switch t := v.(type) {
	case []any:
		return t
	default:
		return nil
	}
}
