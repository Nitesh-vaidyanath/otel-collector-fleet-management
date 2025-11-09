package main

import (
	"database/sql"
	"strings"
)

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
