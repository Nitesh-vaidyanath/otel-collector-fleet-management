package main

import "strings"

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
	err := db.QueryRow(`SELECT id FROM organizations WHERE name=? LIMIT 1`, name).Scan(&id)
	if err != nil {
		return 0, false
	}
	return id, true
}
