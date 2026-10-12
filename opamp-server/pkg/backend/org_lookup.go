package main

import (
	"database/sql"
	"strings"
)

// lookupInternalOrgIDByGrafanaOrgID resolves only an explicit operator-managed
// mapping. It deliberately does not assume that Grafana's ID equals the local
// organizations primary key or fall back to a caller-provided organization name.
func lookupInternalOrgIDByGrafanaID(grafanaOrgID int64) (int64, bool) {
	if grafanaOrgID <= 0 {
		return 0, false
	}
	db, err := sql.Open("mysql", getDBDSN())
	if err != nil {
		return 0, false
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		return 0, false
	}
	var internalOrgID int64
	err = db.QueryRow(`SELECT id FROM organizations WHERE grafana_org_id=?`, grafanaOrgID).Scan(&internalOrgID)
	if err != nil || internalOrgID <= 0 {
		return 0, false
	}
	return internalOrgID, true
}

// lookupOrgIDByName resolves an organization name to its ID.
// Returns (id, true) when found, otherwise (0, false).
func lookupOrgIDByName(name string) (int64, bool) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, false
	}

	db := mustDB()
	defer db.Close()

	var id int64
	// Attempt case-insensitive lookup directly in SQL for efficiency
	if err := db.QueryRow(`SELECT id FROM organizations WHERE LOWER(name)=LOWER(?) LIMIT 1`, name).Scan(&id); err == nil {
		return id, true
	}

	// Fall back to iterating through organizations (covers scenarios where LOWER() isn't available or collation differs)
	rows, err := db.Query(`SELECT id, name FROM organizations`)
	if err != nil {
		return 0, false
	}
	defer rows.Close()

	for rows.Next() {
		var orgID int64
		var orgName sql.NullString
		if err := rows.Scan(&orgID, &orgName); err != nil {
			continue
		}
		if orgName.Valid && strings.EqualFold(strings.TrimSpace(orgName.String), name) {
			return orgID, true
		}
	}

	return 0, false
}

func ensureOrgIDByName(name string) (int64, bool) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, false
	}

	if id, ok := lookupOrgIDByName(name); ok {
		return id, true
	}

	db := mustDB()
	defer db.Close()

	res, err := db.Exec(`
		INSERT INTO organizations (name) VALUES (?)
		ON DUPLICATE KEY UPDATE name=VALUES(name)
	`, name)
	if err != nil {
		return 0, false
	}

	if id, err := res.LastInsertId(); err == nil && id > 0 {
		return id, true
	}

	// If LastInsertId is 0 (duplicate key path), re-query
	return lookupOrgIDByName(name)
}
