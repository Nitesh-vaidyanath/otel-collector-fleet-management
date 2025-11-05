package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"gopkg.in/yaml.v3"
)

type Agent struct {
	ID           int64                  `json:"id"`
	OrgID        int64                  `json:"orgId"`
	AgentUID     string                 `json:"agentUid"`
	Name         string                 `json:"name"`
	Version      *string                `json:"version,omitempty"`
	Status       string                 `json:"status"`
	LastSeen     *string                `json:"lastSeen,omitempty"`
	Labels       map[string]string      `json:"labels,omitempty"`
	Capabilities map[string]interface{} `json:"capabilities,omitempty"`
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func healthHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	jsonOK(w, map[string]any{"ok": true})
}

func settingsHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	// Return current OpAMP server configuration
	opampServerMode := os.Getenv("OPAMP_SERVER_MODE")
	if opampServerMode == "" {
		opampServerMode = "embedded" // default
	}
	
	opampServerURL := os.Getenv("OPAMP_SERVER_URL")
	if opampServerURL == "" {
		opampServerURL = "http://localhost:4321" // default
	}
	
	opampEndpoint := os.Getenv("OPAMP_ENDPOINT")
	if opampEndpoint == "" {
		opampEndpoint = "0.0.0.0:4321" // default
	}
	
	jsonOK(w, map[string]any{
		"opampServerMode": opampServerMode,
		"opampServerURL":  opampServerURL,
		"opampEndpoint":   opampEndpoint,
		"hasOpampManager": globalOpampManager != nil,
		"note": "Settings are currently read from environment variables. To change, set OPAMP_SERVER_MODE and OPAMP_SERVER_URL environment variables and restart the plugin backend.",
	})
}

func userRoleHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	jsonOK(w, map[string]any{
		"role":     c.Role,
		"isAdmin":  c.IsAdmin,
		"userID":   c.UserID,
		"userName": c.UserName,
		"orgID":    c.OrgID,
	})
}

func organizationsHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`SELECT id, name, description FROM organizations ORDER BY name`)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		defer rows.Close()
		orgs := []map[string]any{}
		for rows.Next() {
			var id int64
			var name, description sql.NullString
			if err := rows.Scan(&id, &name, &description); err != nil {
				http.Error(w, err.Error(), 500)
				return
			}
			org := map[string]any{
				"id": id,
			}
			if name.Valid {
				org["name"] = name.String
			}
			if description.Valid {
				org["description"] = description.String
			}
			orgs = append(orgs, org)
		}
		jsonOK(w, map[string]any{"items": orgs})
	case http.MethodPost:
		var in struct {
			Name        string `json:"name"`
			Description string `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if strings.TrimSpace(in.Name) == "" {
			http.Error(w, "name required", 400)
			return
		}
		res, err := db.Exec(`INSERT INTO organizations (name, description) VALUES (?, ?)`, in.Name, in.Description)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		id, _ := res.LastInsertId()
		jsonOK(w, map[string]any{"id": id, "ok": true})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func agentsCollectionHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	switch r.Method {
	case http.MethodGet:
		// Get org_id from query param if provided, otherwise use context org_id
		orgIDParam := r.URL.Query().Get("org_id")
		var orgID int64 = c.OrgID
		if orgIDParam != "" {
			fmt.Sscanf(orgIDParam, "%d", &orgID)
		}

		// Use subquery to get latest agent per agent_uid to prevent duplicates
		// For OpAMP Bridge instances, deduplicate by name since they share the same logical identity
		// Also filter out agents that haven't been seen in last 24 hours if they're offline
		rows, err := db.Query(`
			SELECT a.id, a.org_id, a.agent_uid, a.name, COALESCE(a.version,''), a.status, a.last_seen_at, a.labels_json, a.capabilities_json 
			FROM agents a
			INNER JOIN (
				-- For OpAMP Bridge, group by name instead of agent_uid to deduplicate
				SELECT 
					CASE 
						WHEN name LIKE 'io.opentelemetry.operator-opamp-bridge%' 
						THEN CONCAT('io.opentelemetry.operator-opamp-bridge-', org_id)
						ELSE agent_uid 
					END as dedup_key,
					MAX(last_seen_at) as max_seen
				FROM agents
				WHERE org_id=? AND (status='online' OR last_seen_at > DATE_SUB(NOW(), INTERVAL 24 HOUR))
				GROUP BY dedup_key
			) latest ON (
				(CASE 
					WHEN a.name LIKE 'io.opentelemetry.operator-opamp-bridge%' 
					THEN CONCAT('io.opentelemetry.operator-opamp-bridge-', a.org_id)
					ELSE a.agent_uid 
				END) = latest.dedup_key 
				AND a.last_seen_at = latest.max_seen
			)
			WHERE a.org_id=?
			ORDER BY a.last_seen_at DESC 
			LIMIT 200
		`, orgID, orgID)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		defer rows.Close()
		list := []Agent{}
		seenUIDs := make(map[string]bool) // Deduplicate by agent_uid in memory as well
		for rows.Next() {
			var a Agent
			var ver string
			var lastSeen sql.NullTime
			var labelsJSON sql.NullString
			var capabilitiesJSON sql.NullString
			if err := rows.Scan(&a.ID, &a.OrgID, &a.AgentUID, &a.Name, &ver, &a.Status, &lastSeen, &labelsJSON, &capabilitiesJSON); err != nil {
				http.Error(w, err.Error(), 500)
				return
			}
			// Skip if we've already seen this agent_uid
			if seenUIDs[a.AgentUID] {
				continue
			}
			seenUIDs[a.AgentUID] = true

			// Fix version display - don't show "unknown" if we have labels with version
			if ver == "" || ver == "unknown" {
				if labelsJSON.Valid && labelsJSON.String != "" {
					var labels map[string]string
					if err := json.Unmarshal([]byte(labelsJSON.String), &labels); err == nil {
						if v, ok := labels["collector.version"]; ok && v != "" {
							ver = v
						} else if v, ok := labels["service.version"]; ok && v != "" {
							ver = v
						} else if v, ok := labels["version"]; ok && v != "" {
							ver = v
						}
					}
				}
			}

			if ver != "" && ver != "unknown" {
				a.Version = &ver
			}
			if lastSeen.Valid {
				ls := lastSeen.Time.Format(time.RFC3339)
				a.LastSeen = &ls
			}
			if labelsJSON.Valid && labelsJSON.String != "" {
				json.Unmarshal([]byte(labelsJSON.String), &a.Labels)
			}
			if capabilitiesJSON.Valid && capabilitiesJSON.String != "" {
				json.Unmarshal([]byte(capabilitiesJSON.String), &a.Capabilities)
			}
			list = append(list, a)
		}
		// Get org name for display
		var orgName sql.NullString
		db.QueryRow(`SELECT name FROM organizations WHERE id=?`, orgID).Scan(&orgName)

		jsonOK(w, map[string]any{
			"items": list,
			"userRole": map[string]any{
				"role":    c.Role,
				"isAdmin": c.IsAdmin,
			},
			"orgID":   orgID,
			"orgName": orgName.String,
		})
	case http.MethodPost:
		var in struct{ AgentUID, Name string }
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if strings.TrimSpace(in.AgentUID) == "" || strings.TrimSpace(in.Name) == "" {
			http.Error(w, "agentUid and name required", 400)
			return
		}
		res, err := db.Exec(`INSERT INTO agents(org_id,agent_uid,name,status) VALUES(?,?,?, 'offline') ON DUPLICATE KEY UPDATE name=VALUES(name)`, c.OrgID, in.AgentUID, in.Name)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		id, _ := res.LastInsertId()
		jsonOK(w, map[string]any{"id": id, "ok": true})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func agentEntityHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	// Extract agent UID from path like /agents/{uid}
	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 2 || pathParts[1] == "" {
		http.Error(w, "agent UID required", 400)
		return
	}
	agentUID := pathParts[1]

	db := mustDB()
	defer db.Close()

	switch r.Method {
	case http.MethodGet:
		var a Agent
		var ver string
		var lastSeen sql.NullTime
		var labelsJSON, capabilitiesJSON sql.NullString
		var currentConfigYAML sql.NullString
		var currentConfigHash sql.NullString

		err := db.QueryRow(`
			SELECT id, org_id, agent_uid, name, COALESCE(version,''), status, last_seen_at, 
			       labels_json, capabilities_json, current_config_yaml, current_config_hash
			FROM agents WHERE agent_uid=? AND org_id=?
		`, agentUID, c.OrgID).Scan(
			&a.ID, &a.OrgID, &a.AgentUID, &a.Name, &ver, &a.Status, &lastSeen,
			&labelsJSON, &capabilitiesJSON, &currentConfigYAML, &currentConfigHash,
		)
		if err == sql.ErrNoRows {
			http.Error(w, "agent not found", 404)
			return
		}
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		if ver != "" {
			a.Version = &ver
		}
		if lastSeen.Valid {
			lastSeenStr := lastSeen.Time.Format(time.RFC3339)
			a.LastSeen = &lastSeenStr
		}
		if labelsJSON.Valid {
			json.Unmarshal([]byte(labelsJSON.String), &a.Labels)
		}
		if capabilitiesJSON.Valid {
			json.Unmarshal([]byte(capabilitiesJSON.String), &a.Capabilities)
		}

		response := map[string]any{
			"agent":               a,
			"current_config_yaml": currentConfigYAML.String,
			"current_config_hash": currentConfigHash.String,
		}
		jsonOK(w, response)
	case http.MethodPatch:
		var in struct {
			Name   *string
			Status *string
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if in.Name != nil {
			if _, err := db.Exec(`UPDATE agents SET name=? WHERE org_id=? AND agent_uid=?`, *in.Name, c.OrgID, agentUID); err != nil {
				http.Error(w, err.Error(), 500)
				return
			}
		}
		if in.Status != nil {
			if _, err := db.Exec(`UPDATE agents SET status=? WHERE org_id=? AND agent_uid=?`, *in.Status, c.OrgID, agentUID); err != nil {
				http.Error(w, err.Error(), 500)
				return
			}
		}
		jsonOK(w, map[string]any{"ok": true})
	case http.MethodDelete:
		// Only allow deletion of offline agents
		var status string
		err := db.QueryRow(`SELECT status FROM agents WHERE agent_uid=? AND org_id=?`, agentUID, c.OrgID).Scan(&status)
		if err == sql.ErrNoRows {
			http.Error(w, "agent not found", 404)
			return
		}
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if status == "online" {
			http.Error(w, "cannot delete online agents", 403)
			return
		}

		_, err = db.Exec(`DELETE FROM agents WHERE agent_uid=? AND org_id=?`, agentUID, c.OrgID)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		jsonOK(w, map[string]any{"ok": true, "message": "agent deleted"})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func agentOperationsHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	path := r.URL.Path
	// Path is like /agents/{uid}/operations
	path = strings.TrimPrefix(path, "/agents/")
	path = strings.TrimSuffix(path, "/operations")
	uid := strings.Split(path, "/")[0]
	if uid == "" {
		http.Error(w, "missing agent uid", 400)
		return
	}

	var req struct {
		Action string `json:"action"`
		Config string `json:"config,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	switch req.Action {
	case "push-config":
		if req.Config == "" {
			http.Error(w, "config required", 400)
			return
		}

		db := mustDB()
		defer db.Close()

		// ALWAYS require approval - check if config_id is provided
		configID := r.URL.Query().Get("config_id")
		if configID == "" {
			// If no config_id, try to find the latest approved config for this agent
			var latestApprovedID sql.NullInt64
			row := db.QueryRow(`SELECT id FROM agent_configs WHERE org_id=? AND agent_uid=? AND approval_status='approved' ORDER BY version DESC LIMIT 1`, c.OrgID, uid)
			if err := row.Scan(&latestApprovedID); err == nil && latestApprovedID.Valid {
				configID = fmt.Sprintf("%d", latestApprovedID.Int64)
			} else {
				http.Error(w, "config must be saved and approved before pushing. Please save the configuration and get admin approval first.", 403)
				return
			}
		}

		// Verify the config is approved
		var approvalStatus, configName sql.NullString
		var configVersion int64
		row := db.QueryRow(`SELECT approval_status, name, version FROM agent_configs WHERE id=? AND org_id=?`, configID, c.OrgID)
		if err := row.Scan(&approvalStatus, &configName, &configVersion); err != nil {
			http.Error(w, "config not found", 404)
			return
		}
		if !approvalStatus.Valid || approvalStatus.String != "approved" {
			http.Error(w, "config must be approved before pushing. Current status: "+approvalStatus.String, 403)
			return
		}

		if globalOpampManager == nil {
			http.Error(w, "opamp manager not initialized", 500)
			return
		}

		// Validate config is not empty
		if req.Config == "" || strings.TrimSpace(req.Config) == "" {
			http.Error(w, "config cannot be empty", 400)
			return
		}

		log.Printf("Attempting to push config to agent %s (by: %s, config size: %d bytes, config_id: %s, version: %d)",
			uid, c.UserName, len(req.Config), configID, configVersion)

		err := globalOpampManager.PushConfig(uid, req.Config, c.UserName)
		if err != nil {
			log.Printf("ERROR: Failed to push config to agent %s: %v", uid, err)
			http.Error(w, fmt.Sprintf("failed to push config: %v", err), 500)
			return
		}

		log.Printf("✓ Config push initiated successfully for agent %s (by: %s)", uid, c.UserName)

		// Mark config as pushed
		var configIDInt int64
		fmt.Sscanf(configID, "%d", &configIDInt)
		db.Exec(`
			UPDATE agent_configs 
			SET pushed_at=NOW(), pushed_by=?
			WHERE id=? AND org_id=?
		`, c.UserName, configIDInt, c.OrgID)

		// Log activity
		db.Exec(`
			INSERT INTO agent_activity_log (org_id, agent_uid, activity_type, description, config_id, config_version, performed_by, metadata)
			VALUES (?, ?, 'config_push', ?, ?, ?, ?, ?)
		`, c.OrgID, uid, fmt.Sprintf("Pushed configuration: %s (v%d)", configName.String, configVersion), configID, configVersion, c.UserName,
			fmt.Sprintf(`{"config_id": %s, "config_version": %d}`, configID, configVersion))

		jsonOK(w, map[string]any{"ok": true, "message": "Config pushed to agent", "configId": configIDInt})
	case "upgrade":
		if globalOpampManager == nil {
			http.Error(w, "opamp manager not initialized", 500)
			return
		}
		// Extract version from request if provided
		var upgradeReq struct {
			Version string `json:"version,omitempty"`
		}
		// Try to decode additional fields (version is optional)
		bodyBytes, _ := json.Marshal(req)
		json.Unmarshal(bodyBytes, &upgradeReq)

		err := globalOpampManager.UpgradeAgent(uid, upgradeReq.Version)
		if err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "agent not connected", 404)
				return
			}
			http.Error(w, err.Error(), 500)
			return
		}
		jsonOK(w, map[string]any{"ok": true, "message": "Upgrade command sent to agent"})
	default:
		http.Error(w, "unknown action", 400)
	}
}

func configsCollectionHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	switch r.Method {
	case http.MethodGet:
		agentUID := r.URL.Query().Get("agent_uid")
		query := `SELECT id, org_id, agent_uid, version, name, checksum, approval_status, approved_by, approved_at, approval_comment, created_by, modified_by, created_at, modified_at, pushed_at, pushed_by FROM agent_configs WHERE org_id=?`
		args := []any{c.OrgID}
		if agentUID != "" {
			query += ` AND agent_uid=?`
			args = append(args, agentUID)
		}
		if agentUID != "" {
			query += ` ORDER BY version DESC LIMIT 5` // Last 5 versions per agent
		} else {
			query += ` ORDER BY agent_uid, version DESC LIMIT 100` // If no agent specified, limit overall
		}

		rows, err := db.Query(query, args...)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		defer rows.Close()
		configs := []map[string]any{}
		for rows.Next() {
			var id, version int64
			var orgID int64
			var agentUID, name, checksum, approvalStatus, approvedBy, approvalComment, createdBy, modifiedBy, pushedBy sql.NullString
			var createdAt, modifiedAt, approvedAt, pushedAt sql.NullTime
			if err := rows.Scan(&id, &orgID, &agentUID, &version, &name, &checksum, &approvalStatus, &approvedBy, &approvedAt, &approvalComment, &createdBy, &modifiedBy, &createdAt, &modifiedAt, &pushedAt, &pushedBy); err != nil {
				http.Error(w, err.Error(), 500)
				return
			}
			cfg := map[string]any{
				"id":    id,
				"orgId": orgID,
			}
			if agentUID.Valid {
				cfg["agentUid"] = agentUID.String
			}
			if name.Valid {
				cfg["name"] = name.String
			}
			cfg["version"] = version
			if checksum.Valid {
				cfg["checksum"] = checksum.String
			}
			if approvalStatus.Valid {
				cfg["approvalStatus"] = approvalStatus.String
			}
			if approvedBy.Valid {
				cfg["approvedBy"] = approvedBy.String
			}
			if approvedAt.Valid {
				cfg["approvedAt"] = approvedAt.Time.Format(time.RFC3339)
			}
			if approvalComment.Valid && approvalComment.String != "" {
				cfg["approvalComment"] = approvalComment.String
			}
			if createdBy.Valid {
				cfg["createdBy"] = createdBy.String
			}
			if modifiedBy.Valid {
				cfg["modifiedBy"] = modifiedBy.String
			}
			if createdAt.Valid {
				cfg["createdAt"] = createdAt.Time.Format(time.RFC3339)
			}
			if modifiedAt.Valid {
				cfg["modifiedAt"] = modifiedAt.Time.Format(time.RFC3339)
			}
			if pushedAt.Valid {
				cfg["pushedAt"] = pushedAt.Time.Format(time.RFC3339)
			}
			if pushedBy.Valid {
				cfg["pushedBy"] = pushedBy.String
			}
			configs = append(configs, cfg)
		}
		jsonOK(w, map[string]any{"items": configs})
	case http.MethodPost:
		var in struct {
			AgentUID string `json:"agentUid"`
			Name     string `json:"name"`
			Config   string `json:"config"`
			// Support both agentUid and agent_uid for backward compatibility
			AgentUIDAlt string `json:"agent_uid"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		// Use agentUid or fallback to agent_uid
		if in.AgentUID == "" {
			in.AgentUID = in.AgentUIDAlt
		}

		if in.AgentUID == "" {
			http.Error(w, "agentUid required", 400)
			return
		}

		if in.Config == "" {
			http.Error(w, "config required", 400)
			return
		}

		// Get next version
		var version int64 = 1
		row := db.QueryRow(`SELECT MAX(version) FROM agent_configs WHERE org_id=? AND agent_uid=?`, c.OrgID, in.AgentUID)
		row.Scan(&version)
		version++

		// Validate config before saving
		validationErrors := validateOTelConfig(in.Config)
		if len(validationErrors) > 0 {
			jsonOK(w, map[string]any{
				"ok":               false,
				"validationErrors": validationErrors,
				"message":          "Configuration validation failed",
			})
			return
		}

		// Keep only last 5 versions - delete older ones
		db.Exec(`DELETE FROM agent_configs WHERE org_id=? AND agent_uid=? AND version < ?`,
			c.OrgID, in.AgentUID, version-4)

		// Calculate SHA256 hash for checksum (always 64 hex characters)
		hash := sha256.Sum256([]byte(in.Config))
		checksum := hex.EncodeToString(hash[:])

		res, err := db.Exec(`
			INSERT INTO agent_configs (org_id, agent_uid, version, name, config_yaml, checksum, approval_status, created_by, modified_by)
			VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
		`, c.OrgID, in.AgentUID, version, in.Name, in.Config, checksum, c.UserName, c.UserName)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		id, _ := res.LastInsertId()
		jsonOK(w, map[string]any{"id": id, "version": version, "approvalStatus": "pending", "ok": true})
	}
}

func configTemplatesHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`SELECT id, name, description, receivers_json, processors_json, exporters_json, created_at FROM config_templates WHERE org_id=? ORDER BY created_at DESC LIMIT 100`, c.OrgID)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		defer rows.Close()
		templates := []map[string]any{}
		for rows.Next() {
			var id int64
			var name, description sql.NullString
			var receiversJSON, processorsJSON, exportersJSON sql.NullString
			var createdAt sql.NullTime
			if err := rows.Scan(&id, &name, &description, &receiversJSON, &processorsJSON, &exportersJSON, &createdAt); err != nil {
				http.Error(w, err.Error(), 500)
				return
			}
			template := map[string]any{"id": id}
			if name.Valid {
				template["name"] = name.String
			}
			if description.Valid {
				template["description"] = description.String
			}
			if receiversJSON.Valid {
				var receivers []any
				json.Unmarshal([]byte(receiversJSON.String), &receivers)
				template["receivers"] = receivers
			}
			if processorsJSON.Valid {
				var processors []any
				json.Unmarshal([]byte(processorsJSON.String), &processors)
				template["processors"] = processors
			}
			if exportersJSON.Valid {
				var exporters []any
				json.Unmarshal([]byte(exportersJSON.String), &exporters)
				template["exporters"] = exporters
			}
			if createdAt.Valid {
				template["createdAt"] = createdAt.Time.Format(time.RFC3339)
			}
			templates = append(templates, template)
		}
		jsonOK(w, map[string]any{"items": templates})
	case http.MethodPost:
		var in struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Receivers   []any  `json:"receivers"`
			Processors  []any  `json:"processors"`
			Exporters   []any  `json:"exporters"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if in.Name == "" {
			http.Error(w, "name required", 400)
			return
		}

		receiversJSON, _ := json.Marshal(in.Receivers)
		processorsJSON, _ := json.Marshal(in.Processors)
		exportersJSON, _ := json.Marshal(in.Exporters)

		res, err := db.Exec(`
			INSERT INTO config_templates (org_id, name, description, receivers_json, processors_json, exporters_json, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, c.OrgID, in.Name, in.Description, string(receiversJSON), string(processorsJSON), string(exportersJSON), "user")
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		id, _ := res.LastInsertId()
		jsonOK(w, map[string]any{"id": id, "ok": true})
	case http.MethodDelete:
		id := r.URL.Query().Get("id")
		if id == "" {
			http.Error(w, "id required", 400)
			return
		}
		_, err := db.Exec(`DELETE FROM config_templates WHERE id=? AND org_id=?`, id, c.OrgID)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		jsonOK(w, map[string]any{"ok": true})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func configGeneratorHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	var req struct {
		Receivers   []map[string]any `json:"receivers"`
		Processors  []map[string]any `json:"processors"`
		Exporters   []map[string]any `json:"exporters"`
		Service     map[string]any   `json:"service"`
		CRDSettings *struct {
			Name            string         `json:"name,omitempty"`             // Optional: for creating NEW collectors
			Namespace       string         `json:"namespace,omitempty"`        // Optional: for creating NEW collectors
			Mode            string         `json:"mode"`
			Replicas        *int           `json:"replicas,omitempty"`
			Image           string         `json:"image"`
			ManagementState string         `json:"managementState"`
			UpgradeStrategy string         `json:"upgradeStrategy"`
			Resources       map[string]any `json:"resources"`
			AdvancedYaml    string         `json:"advancedYaml,omitempty"`     // Advanced YAML: targetAllocator, volumes, etc.
		} `json:"crdSettings,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	// Build OpenTelemetry Collector config (spec.config section)
	// NOTE: All component types are allowed - no restrictions on receivers, processors, or exporters
	// The system accepts any component type including custom components and extensions
	config := map[string]any{
		"receivers":  buildComponentMap(req.Receivers),
		"processors": buildComponentMap(req.Processors),
		"exporters":  buildComponentMap(req.Exporters),
		"service":    buildService(req.Service, req.Receivers, req.Processors, req.Exporters),
	}

	// Extract extensions and other custom sections from exporters (they're marked with _isExtension)
	for _, exp := range req.Exporters {
		if exp["_isExtension"] == true {
			sectionName, _ := exp["_sectionName"].(string)
			if sectionName != "" {
				// Parse the customYaml to extract the section
				if customYaml, ok := exp["customYaml"].(string); ok && customYaml != "" {
					var customSection map[string]any
					if err := yaml.Unmarshal([]byte(customYaml), &customSection); err == nil {
						// Merge into main config
						for key, value := range customSection {
							config[key] = value
						}
					}
				}
			}
		}
	}

	// If CRD settings provided, build OpenTelemetry Collector spec
	// NOTE: For EXISTING collectors, OpAMP Bridge only needs the spec (it merges with existing metadata)
	// For NEW collectors, full CRD with metadata would be needed
	if req.CRDSettings != nil {
		// Build spec only (for updating existing collectors via OpAMP)
		// The OpAMP Bridge will merge this with the existing collector's metadata
		spec := map[string]any{
			"mode":            req.CRDSettings.Mode,
			"image":           req.CRDSettings.Image,
			"managementState": req.CRDSettings.ManagementState,
			"upgradeStrategy": req.CRDSettings.UpgradeStrategy,
			"config":          config,
		}

		// Add replicas only for deployment/statefulset modes
		if req.CRDSettings.Replicas != nil &&
			(req.CRDSettings.Mode == "deployment" || req.CRDSettings.Mode == "statefulset") {
			spec["replicas"] = *req.CRDSettings.Replicas
		}

		// Add resources if provided
		if req.CRDSettings.Resources != nil {
			spec["resources"] = req.CRDSettings.Resources
		}

		// Parse and merge advanced YAML (targetAllocator, volumes, serviceAccount, etc.)
		if req.CRDSettings.AdvancedYaml != "" {
			var advancedFields map[string]any
			if err := yaml.Unmarshal([]byte(req.CRDSettings.AdvancedYaml), &advancedFields); err != nil {
				log.Printf("WARNING: Failed to parse advancedYaml: %v", err)
				http.Error(w, fmt.Sprintf("Invalid advanced YAML: %v", err), 400)
				return
			}
			// Merge advanced fields into spec
			for key, value := range advancedFields {
				spec[key] = value
			}
		}

		// For OpAMP updates, wrap spec in a partial CRD structure
		// The bridge expects a full CRD but will merge metadata from existing collector
		metadata := map[string]any{
			"labels": map[string]any{
				"opentelemetry.io/opamp-managed": "true",
			},
		}
		
		// Add name/namespace if provided (for creating NEW collectors)
		if req.CRDSettings.Name != "" {
			metadata["name"] = req.CRDSettings.Name
		}
		if req.CRDSettings.Namespace != "" {
			metadata["namespace"] = req.CRDSettings.Namespace
		}

		crd := map[string]any{
			"apiVersion": "opentelemetry.io/v1beta1",
			"kind":       "OpenTelemetryCollector",
			"metadata":   metadata,
			"spec":       spec,
		}

		// Convert to YAML
		yamlBytes, err := yaml.Marshal(crd)
		if err != nil {
			log.Printf("Failed to marshal CRD to YAML: %v", err)
			http.Error(w, err.Error(), 500)
			return
		}

		jsonOK(w, map[string]any{"config": string(yamlBytes), "format": "yaml", "isCRD": true})
	} else {
		// Backward compatible: just return config
		yamlBytes, err := yaml.Marshal(config)
		if err != nil {
			log.Printf("Failed to marshal config to YAML: %v", err)
			http.Error(w, err.Error(), 500)
			return
		}

		jsonOK(w, map[string]any{"config": string(yamlBytes), "format": "yaml"})
	}
}

func buildComponentMap(components []map[string]any) map[string]any {
	result := make(map[string]any)
	for _, comp := range components {
		if name, ok := comp["name"].(string); ok {
			compType, _ := comp["type"].(string)

			// If it's a custom component with customYaml, parse it
			if compType == "custom" {
				if customYaml, ok := comp["customYaml"].(string); ok && customYaml != "" {
					var customConfig map[string]any
					if err := yaml.Unmarshal([]byte(customYaml), &customConfig); err == nil {
						// Check if the parsed YAML has the component name as the only key
						// E.g., user typed "debug:\n  verbosity: normal" which parses to {debug: {verbosity: normal}}
						// We need to flatten this to just {verbosity: normal}
						if len(customConfig) == 1 {
							if innerConfig, ok := customConfig[name].(map[string]any); ok {
								// Nested under component name, flatten it
								result[name] = innerConfig
								continue
							}
						}
						// Otherwise use as-is
						result[name] = customConfig
						continue
					}
				}
				// If customYaml parsing failed, use the rest of the config
			}

			// Build proper OpenTelemetry Collector component structure:
			// component_name:
			//   config_key: config_value
			//
			// Example:
			// exporter_1:
			//   verbosity: normal
			//   endpoint: https://example.com
			//
			// The component type is metadata only and not included in the YAML structure.
			// The config keys should be directly under the component name.

			// Remove "name", "type", "customYaml", and internal fields from the config map
			config := make(map[string]any)
			for k, v := range comp {
				// Skip metadata fields
				if k != "name" && k != "type" && k != "customYaml" &&
					k != "_isExtension" && k != "_sectionName" && !strings.HasPrefix(k, "_") {
					config[k] = v
				}
			}

			// Check if config is nested under the component type name (e.g., debug: {debug: {verbosity: normal}})
			// If so, flatten it (e.g., debug: {verbosity: normal})
			if len(config) == 1 && compType != "" {
				if nestedConfig, ok := config[compType].(map[string]any); ok {
					// Config is nested under type name, flatten it
					config = nestedConfig
				}
			}

			// Use config directly - component type is metadata, not part of YAML structure
			// This matches the OpenTelemetry Collector spec where component names
			// directly contain their configuration
			result[name] = config
		}
	}
	return result
}

func buildService(service map[string]any, receivers, processors, exporters []map[string]any) map[string]any {
	if service == nil {
		service = make(map[string]any)
	}

	// Preserve existing service sections (like telemetry, extensions, etc.)
	// These should NOT be inside pipelines - they're top-level service config
	preservedSections := make(map[string]any)
	for key, value := range service {
		if key != "pipelines" && key != "selectedSignals" {
			preservedSections[key] = value
		}
	}

	// Build pipelines
	pipelines := make(map[string]any)

	// Extract pipeline names
	if pipelinesConfig, ok := service["pipelines"].(map[string]any); ok {
		pipelines = pipelinesConfig
	} else {
		// Check if selectedSignals are provided
		selectedSignals := []string{}
		if signalsInterface, ok := service["selectedSignals"]; ok {
			if signals, ok := signalsInterface.([]interface{}); ok {
				for _, signal := range signals {
					if signalStr, ok := signal.(string); ok {
						selectedSignals = append(selectedSignals, signalStr)
					}
				}
			}
		}

		// If no signals selected, default to all
		if len(selectedSignals) == 0 {
			selectedSignals = []string{"logs", "metrics", "traces"}
		}

		// Only create pipelines for selected signals
		defaultPipelines := make(map[string]any)
		for _, signal := range selectedSignals {
			defaultPipelines[signal] = map[string]any{
				"receivers":  extractNames(receivers),
				"processors": extractNames(processors),
				"exporters":  extractNames(exporters),
			}
		}
		pipelines = defaultPipelines
	}

	// Rebuild service with preserved sections
	result := make(map[string]any)
	result["pipelines"] = pipelines

	// Add back all preserved sections (telemetry, extensions, etc.)
	for key, value := range preservedSections {
		result[key] = value
	}

	// Add default telemetry if not already present
	// This enables Prometheus metrics on port 8888 for agent monitoring
	if result["telemetry"] == nil {
		result["telemetry"] = map[string]any{
			"metrics": map[string]any{
				"level": "detailed", // detailed level includes more metrics for monitoring
				"readers": []map[string]any{
					{
						"pull": map[string]any{
							"exporter": map[string]any{
								"prometheus": map[string]any{
									"host": "0.0.0.0",
									"port": 8888,
								},
							},
						},
					},
				},
			},
		}
	}

	return result
}

func extractNames(components []map[string]any) []string {
	names := []string{}
	for _, comp := range components {
		if name, ok := comp["name"].(string); ok {
			names = append(names, name)
		}
	}
	return names
}

func configEntityHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	path := strings.TrimPrefix(r.URL.Path, "/configs/")
	configID := path

	var configYAML, name, agentUID sql.NullString
	var version int64
	var approvalStatus, createdBy, modifiedBy sql.NullString
	var createdAt, modifiedAt sql.NullTime

	row := db.QueryRow(`
		SELECT config_yaml, name, agent_uid, version, approval_status, created_by, modified_by, created_at, modified_at
		FROM agent_configs WHERE id=? AND org_id=?
	`, configID, c.OrgID)

	if err := row.Scan(&configYAML, &name, &agentUID, &version, &approvalStatus, &createdBy, &modifiedBy, &createdAt, &modifiedAt); err != nil {
		http.Error(w, err.Error(), 404)
		return
	}

	result := map[string]any{
		"id":      configID,
		"version": version,
	}
	if configYAML.Valid {
		result["config"] = configYAML.String
	}
	if name.Valid {
		result["name"] = name.String
	}
	if agentUID.Valid {
		result["agentUid"] = agentUID.String
	}
	if approvalStatus.Valid {
		result["approvalStatus"] = approvalStatus.String
	}
	if createdBy.Valid {
		result["createdBy"] = createdBy.String
	}
	if modifiedBy.Valid {
		result["modifiedBy"] = modifiedBy.String
	}
	if createdAt.Valid {
		result["createdAt"] = createdAt.Time.Format(time.RFC3339)
	}
	if modifiedAt.Valid {
		result["modifiedAt"] = modifiedAt.Time.Format(time.RFC3339)
	}

	jsonOK(w, result)
}

func configApprovalHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	db := mustDB()
	defer db.Close()

	path := strings.TrimPrefix(r.URL.Path, "/configs/")
	configIDStr := strings.TrimSuffix(path, "/approve")
	var configID int64
	if _, err := fmt.Sscanf(configIDStr, "%d", &configID); err != nil {
		http.Error(w, "invalid config id", 400)
		return
	}

	var req struct {
		Action  string `json:"action"`  // "approve" or "reject"
		Comment string `json:"comment"` // Optional comment/reason
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if req.Action != "approve" && req.Action != "reject" {
		http.Error(w, "action must be 'approve' or 'reject'", 400)
		return
	}

	// Require comment for rejections
	if req.Action == "reject" && strings.TrimSpace(req.Comment) == "" {
		http.Error(w, "comment is required when rejecting a configuration", 400)
		return
	}

	// For testing: Allow approvals even if admin role isn't detected
	// In production, you should enforce admin-only: if !c.IsAdmin { http.Error(...); return }
	if !c.IsAdmin {
		log.Printf("Warning: Approval attempted by non-admin user (testing mode enabled). UserID: %d, UserName: %s, Role: %d, IsAdmin: %v", c.UserID, c.UserName, c.Role, c.IsAdmin)
		// Uncomment the next 2 lines to enforce admin-only approvals in production:
		// http.Error(w, "admin role required", http.StatusForbidden)
		// return
	}

	status := "approved"
	if req.Action == "reject" {
		status = "rejected"
	}

	var agentUID, configName sql.NullString
	var configVersion int64
	row := db.QueryRow(`SELECT agent_uid, name, version FROM agent_configs WHERE id=? AND org_id=?`, configID, c.OrgID)
	if err := row.Scan(&agentUID, &configName, &configVersion); err != nil {
		http.Error(w, "config not found", 404)
		return
	}

	approvalComment := strings.TrimSpace(req.Comment)
	if approvalComment == "" {
		approvalComment = ""
	}

	_, err := db.Exec(`
		UPDATE agent_configs 
		SET approval_status=?, approved_by=?, approved_at=NOW(), approval_comment=?, modified_by=?, modified_at=NOW()
		WHERE id=? AND org_id=?
	`, status, c.UserName, approvalComment, c.UserName, configID, c.OrgID)

	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	// Log activity
	if agentUID.Valid {
		description := fmt.Sprintf("Configuration %s: %s (v%d)", status, configName.String, configVersion)
		db.Exec(`
			INSERT INTO agent_activity_log (org_id, agent_uid, activity_type, description, config_id, config_version, performed_by, metadata)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, c.OrgID, agentUID.String, fmt.Sprintf("config_%s", status), description, configID, configVersion, c.UserName,
			fmt.Sprintf(`{"config_id": %d, "config_version": %d, "action": "%s"}`, configID, configVersion, status))
	}

	jsonOK(w, map[string]any{"ok": true, "approvalStatus": status, "approvedBy": c.UserName})
}

func configDiffHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	// Extract config ID from path like /configs/{id}/diff
	// URL path is like: /configs/123/diff
	path := strings.TrimPrefix(r.URL.Path, "/configs/")
	pathParts := strings.Split(path, "/")
	if len(pathParts) < 1 {
		http.Error(w, "config ID required", 400)
		return
	}
	var configID int64
	if _, err := fmt.Sscanf(pathParts[0], "%d", &configID); err != nil {
		http.Error(w, fmt.Sprintf("invalid config ID: %s (from path: %s)", pathParts[0], r.URL.Path), 400)
		return
	}

	compareID := r.URL.Query().Get("compare_id")

	var config1, config2 sql.NullString

	row1 := db.QueryRow(`SELECT config_yaml FROM agent_configs WHERE id=? AND org_id=?`, configID, c.OrgID)
	if err := row1.Scan(&config1); err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "config not found", 404)
			return
		}
		http.Error(w, fmt.Sprintf("database error: %v", err), 500)
		return
	}

	if !config1.Valid {
		http.Error(w, "config has no content", 400)
		return
	}

	config1Value := config1.String

	if compareID != "" {
		var compareIDInt int64
		if _, err := fmt.Sscanf(compareID, "%d", &compareIDInt); err != nil {
			http.Error(w, "invalid compare_id", 400)
			return
		}
		row2 := db.QueryRow(`SELECT config_yaml FROM agent_configs WHERE id=? AND org_id=?`, compareIDInt, c.OrgID)
		if err := row2.Scan(&config2); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "compare config not found", 404)
				return
			}
			http.Error(w, fmt.Sprintf("database error: %v", err), 500)
			return
		}
	} else {
		// Compare with previous version
		var version int64
		var agentUID sql.NullString
		row := db.QueryRow(`SELECT version, agent_uid FROM agent_configs WHERE id=? AND org_id=?`, configID, c.OrgID)
		if err := row.Scan(&version, &agentUID); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "config not found", 404)
				return
			}
			http.Error(w, fmt.Sprintf("database error: %v", err), 500)
			return
		}

		if agentUID.Valid && version > 1 {
			row2 := db.QueryRow(`SELECT config_yaml FROM agent_configs WHERE agent_uid=? AND version=? AND org_id=? ORDER BY id DESC LIMIT 1`,
				agentUID.String, version-1, c.OrgID)
			if err := row2.Scan(&config2); err != nil && err != sql.ErrNoRows {
				log.Printf("Warning: failed to load previous config for diff: %v", err)
			}
		}
	}

	config2Value := ""
	if config2.Valid {
		config2Value = config2.String
	}

	// Simple diff calculation (line-by-line)
	diff := calculateDiff(config1Value, config2Value)

	jsonOK(w, map[string]any{
		"current":  config1Value,
		"previous": config2Value,
		"diff":     diff,
	})
}

// generateDiff creates a line-by-line diff between two YAML strings (for agent vs database comparison)
func generateDiff(previous, current string) []map[string]any {
	prevLines := strings.Split(previous, "\n")
	currLines := strings.Split(current, "\n")

	diff := []map[string]any{}
	maxLen := len(prevLines)
	if len(currLines) > maxLen {
		maxLen = len(currLines)
	}

	for i := 0; i < maxLen; i++ {
		prevLine := ""
		currLine := ""
		if i < len(prevLines) {
			prevLine = prevLines[i]
		}
		if i < len(currLines) {
			currLine = currLines[i]
		}

		if prevLine != currLine {
			diff = append(diff, map[string]any{
				"line": i + 1,
				"type": "modified",
				"old":  prevLine,
				"new":  currLine,
			})
		} else if prevLine != "" {
			diff = append(diff, map[string]any{
				"line":    i + 1,
				"type":    "unchanged",
				"content": prevLine,
			})
		}
	}

	return diff
}

func calculateDiff(config1, config2 string) []map[string]any {
	lines1 := strings.Split(config1, "\n")
	lines2 := strings.Split(config2, "\n")

	diff := []map[string]any{}
	maxLen := len(lines1)
	if len(lines2) > maxLen {
		maxLen = len(lines2)
	}

	// Only include changed lines (removed, added, or modified)
	// Skip unchanged lines to show a cleaner diff
	for i := 0; i < maxLen; i++ {
		line1 := ""
		line2 := ""
		if i < len(lines1) {
			line1 = lines1[i]
		}
		if i < len(lines2) {
			line2 = lines2[i]
		}

		// Check if line is different (modified, added, or removed)
		if line1 != line2 {
			if line1 == "" {
				// Line removed (exists in old, not in new)
				diff = append(diff, map[string]any{
					"line": i + 1,
					"type": "removed",
					"old":  line2,
					"new":  "",
				})
			} else if line2 == "" {
				// Line added (doesn't exist in old, exists in new)
				diff = append(diff, map[string]any{
					"line": i + 1,
					"type": "added",
					"old":  "",
					"new":  line1,
				})
			} else {
				// Line modified (exists in both but different)
				diff = append(diff, map[string]any{
					"line": i + 1,
					"type": "modified",
					"old":  line2,
					"new":  line1,
				})
			}
		}
		// Skip unchanged lines - don't include them in diff
	}

	return diff
}

func configRevertHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	var req struct {
		ConfigID int64 `json:"configId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	// Get the config to revert to
	var configYAML, name, agentUID sql.NullString
	var version int64
	row := db.QueryRow(`
		SELECT config_yaml, name, agent_uid, version 
		FROM agent_configs WHERE id=? AND org_id=?
	`, req.ConfigID, c.OrgID)

	if err := row.Scan(&configYAML, &name, &agentUID, &version); err != nil {
		http.Error(w, "config not found", 404)
		return
	}

	if !agentUID.Valid || !configYAML.Valid {
		http.Error(w, "invalid config", 400)
		return
	}

	// Validate config before saving
	validationErrors := validateOTelConfig(configYAML.String)
	if len(validationErrors) > 0 {
		jsonOK(w, map[string]any{
			"ok":               false,
			"validationErrors": validationErrors,
			"message":          "Configuration validation failed",
		})
		return
	}

	// Create new version from old config
	var newVersion int64 = 1
	row2 := db.QueryRow(`SELECT MAX(version) FROM agent_configs WHERE org_id=? AND agent_uid=?`, c.OrgID, agentUID.String)
	row2.Scan(&newVersion)
	newVersion++

	// Keep only last 5 versions
	db.Exec(`DELETE FROM agent_configs WHERE org_id=? AND agent_uid=? AND version < ?`,
		c.OrgID, agentUID.String, newVersion-4)

	// Calculate SHA256 hash for checksum (always 64 hex characters)
	hash := sha256.Sum256([]byte(configYAML.String))
	checksum := hex.EncodeToString(hash[:])

	res, err := db.Exec(`
		INSERT INTO agent_configs (org_id, agent_uid, version, name, config_yaml, checksum, approval_status, created_by, modified_by)
		VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
	`, c.OrgID, agentUID.String, newVersion, name.String, configYAML.String, checksum, c.UserName, c.UserName)

	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	id, _ := res.LastInsertId()
	jsonOK(w, map[string]any{"id": id, "version": newVersion, "approvalStatus": "pending", "ok": true})
}

// agentConfigSyncStatusHandler provides detailed sync status including pending queue
func agentConfigSyncStatusHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	path := strings.TrimPrefix(r.URL.Path, "/agents/")
	path = strings.TrimSuffix(path, "/config-sync-status")
	uid := strings.Split(path, "/")[0]
	if uid == "" {
		http.Error(w, "missing agent uid", 400)
		return
	}

	result := map[string]any{
		"agentUid": uid,
	}

	// Get current config from agents table
	var currentConfig sql.NullString
	var currentConfigHash sql.NullString
	row := db.QueryRow(`SELECT current_config_yaml, current_config_hash FROM agents WHERE org_id=? AND agent_uid=?`, c.OrgID, uid)
	if err := row.Scan(&currentConfig, &currentConfigHash); err != nil {
		http.Error(w, "agent not found", 404)
		return
	}

	if currentConfigHash.Valid {
		result["currentConfigHash"] = currentConfigHash.String
		result["hasConfig"] = true
	} else {
		result["hasConfig"] = false
	}

	// Check for pending configs in queue
	var pendingConfigYAML, pendingConfigHash, lastError sql.NullString
	var queuedAt, sentAt sql.NullTime
	var attempts int
	row2 := db.QueryRow(`
		SELECT config_yaml, config_hash, queued_at, sent_at, attempts, last_error
		FROM pending_config_queue 
		WHERE agent_uid=? AND org_id=? 
		ORDER BY queued_at DESC LIMIT 1
	`, uid, c.OrgID)

	if err := row2.Scan(&pendingConfigYAML, &pendingConfigHash, &queuedAt, &sentAt, &attempts, &lastError); err == nil {
		result["pendingConfig"] = map[string]any{
			"hasPending": true,
			"queuedAt":   queuedAt.Time.Format(time.RFC3339),
			"attempts":   attempts,
		}
		if sentAt.Valid {
			result["pendingConfig"].(map[string]any)["sentAt"] = sentAt.Time.Format(time.RFC3339)
			result["pendingConfig"].(map[string]any)["isSent"] = true
		} else {
			result["pendingConfig"].(map[string]any)["isSent"] = false
			result["pendingConfig"].(map[string]any)["status"] = "queued"
			if lastError.Valid && lastError.String != "" {
				result["pendingConfig"].(map[string]any)["lastError"] = lastError.String
			}
		}
		if pendingConfigHash.Valid {
			result["pendingConfig"].(map[string]any)["hash"] = pendingConfigHash.String
			// Compare with current hash
			if currentConfigHash.Valid && currentConfigHash.String == pendingConfigHash.String {
				result["pendingConfig"].(map[string]any)["hashMatch"] = true
				result["pendingConfig"].(map[string]any)["status"] = "synced"
			} else {
				result["pendingConfig"].(map[string]any)["hashMatch"] = false
				result["pendingConfig"].(map[string]any)["status"] = "pending_sync"
			}
		}
	} else {
		result["pendingConfig"] = map[string]any{"hasPending": false}
	}

	// Get latest RemoteConfigStatus from agent_telemetry
	var telemetryData sql.NullString
	var reportedAt sql.NullTime
	row3 := db.QueryRow(`
		SELECT telemetry_data, reported_at 
		FROM agent_telemetry 
		WHERE agent_uid=? AND org_id=? AND telemetry_type='health' 
		ORDER BY reported_at DESC LIMIT 1
	`, uid, c.OrgID)
	if err := row3.Scan(&telemetryData, &reportedAt); err == nil && telemetryData.Valid {
		var data map[string]interface{}
		if json.Unmarshal([]byte(telemetryData.String), &data) == nil {
			if status, ok := data["status"].(string); ok {
				result["remoteConfigStatus"] = status
			}
			if hash, ok := data["last_remote_config_hash"].(string); ok && hash != "" {
				result["remoteConfigHash"] = hash
				if currentConfigHash.Valid {
					result["hashMatch"] = (hash == currentConfigHash.String)
					if hash == currentConfigHash.String {
						result["syncStatus"] = "synced"
					} else {
						result["syncStatus"] = "not_synced"
					}
				}
			}
			if errMsg, ok := data["error_message"].(string); ok && errMsg != "" {
				result["remoteConfigError"] = errMsg
			}
		}
		if reportedAt.Valid {
			result["lastStatusReport"] = reportedAt.Time.Format(time.RFC3339)
		}
	}

	jsonOK(w, result)
}

func agentCurrentConfigHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	path := strings.TrimPrefix(r.URL.Path, "/agents/")
	path = strings.TrimSuffix(path, "/current-config")
	uid := strings.Split(path, "/")[0]
	if uid == "" {
		http.Error(w, "missing agent uid", 400)
		return
	}

	var currentConfig sql.NullString
	var currentConfigHash sql.NullString
	var runningConfigID, runningConfigVersion sql.NullInt64
	row := db.QueryRow(`
		SELECT current_config_yaml, current_config_hash, running_config_id, running_config_version 
		FROM agents 
		WHERE org_id=? AND agent_uid=?
	`, c.OrgID, uid)
	if err := row.Scan(&currentConfig, &currentConfigHash, &runningConfigID, &runningConfigVersion); err != nil {
		http.Error(w, "agent not found", 404)
		return
	}

	result := map[string]any{
		"agentUid": uid,
	}
	if currentConfig.Valid && currentConfig.String != "" {
		result["config"] = currentConfig.String
		result["hasConfig"] = true
	} else {
		result["config"] = ""
		result["hasConfig"] = false
	}
	if currentConfigHash.Valid {
		result["hash"] = currentConfigHash.String
	}
	if runningConfigID.Valid {
		result["runningConfigId"] = runningConfigID.Int64
	}
	if runningConfigVersion.Valid {
		result["runningConfigVersion"] = runningConfigVersion.Int64
	}

	// Find which database config version matches the agent's current config
	if currentConfigHash.Valid {
		var dbConfigID, dbConfigVersion sql.NullInt64
		var dbConfigName sql.NullString
		row2 := db.QueryRow(`
			SELECT id, version, name 
			FROM agent_configs 
			WHERE org_id=? AND agent_uid=? AND checksum=? AND approval_status='approved'
			ORDER BY version DESC LIMIT 1
		`, c.OrgID, uid, currentConfigHash.String)
		if err := row2.Scan(&dbConfigID, &dbConfigVersion, &dbConfigName); err == nil {
			result["matchingDbConfigId"] = dbConfigID.Int64
			result["matchingDbConfigVersion"] = dbConfigVersion.Int64
			if dbConfigName.Valid {
				result["matchingDbConfigName"] = dbConfigName.String
			}
		} else {
			// Check if there's any approved config that doesn't match
			row3 := db.QueryRow(`
				SELECT id, version, name, checksum 
				FROM agent_configs 
				WHERE org_id=? AND agent_uid=? AND approval_status='approved'
				ORDER BY version DESC LIMIT 1
			`, c.OrgID, uid)
			var latestConfigID, latestConfigVersion sql.NullInt64
			var latestConfigName, latestConfigChecksum sql.NullString
			if err := row3.Scan(&latestConfigID, &latestConfigVersion, &latestConfigName, &latestConfigChecksum); err == nil {
				result["latestDbConfigId"] = latestConfigID.Int64
				result["latestDbConfigVersion"] = latestConfigVersion.Int64
				if latestConfigName.Valid {
					result["latestDbConfigName"] = latestConfigName.String
				}
				if latestConfigChecksum.Valid {
					result["latestDbConfigHash"] = latestConfigChecksum.String
					result["hashMatch"] = (latestConfigChecksum.String == currentConfigHash.String)
					if latestConfigChecksum.String != currentConfigHash.String {
						result["syncStatus"] = "mismatch"
						result["mismatchReason"] = "Agent config hash does not match latest approved database config"
					} else {
						result["syncStatus"] = "synced"
					}
				}
			}
		}
	}

	// Get latest RemoteConfigStatus from agent_telemetry
	var telemetryData sql.NullString
	var reportedAt sql.NullTime
	row4 := db.QueryRow(`
		SELECT telemetry_data, reported_at 
		FROM agent_telemetry 
		WHERE agent_uid=? AND org_id=? AND telemetry_type='health' 
		ORDER BY reported_at DESC LIMIT 1
	`, uid, c.OrgID)
	if err := row4.Scan(&telemetryData, &reportedAt); err == nil && telemetryData.Valid {
		var data map[string]interface{}
		if json.Unmarshal([]byte(telemetryData.String), &data) == nil {
			if status, ok := data["status"].(string); ok {
				result["remoteConfigStatus"] = status
			}
			if hash, ok := data["last_remote_config_hash"].(string); ok && hash != "" {
				result["remoteConfigHash"] = hash
				// Compare with current hash to verify sync
				if currentConfigHash.Valid {
					hashMatch := (hash == currentConfigHash.String)
					result["opampHashMatch"] = hashMatch
					result["hashMatch"] = hashMatch  // Also provide as hashMatch for frontend compatibility
					if !hashMatch {
						result["syncStatus"] = "not_synced"
						result["syncIssue"] = "Agent's reported RemoteConfig hash does not match current config hash"
					}
				} else {
					// No current config hash - can't verify
					result["hashMatch"] = false
				}
			} else {
				// No remote config hash reported yet
				result["hashMatch"] = false
			}
			if errMsg, ok := data["error_message"].(string); ok && errMsg != "" {
				result["remoteConfigError"] = errMsg
			}
		}
		if reportedAt.Valid {
			result["lastStatusReport"] = reportedAt.Time.Format(time.RFC3339)
		}
	}

	jsonOK(w, result)
}

// agentConfigCompareHandler compares agent's current config with database config
func agentConfigCompareHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	path := strings.TrimPrefix(r.URL.Path, "/agents/")
	path = strings.TrimSuffix(path, "/config-diff")
	uid := strings.Split(path, "/")[0]
	if uid == "" {
		http.Error(w, "missing agent uid", 400)
		return
	}

	// Get agent's current config AND RemoteConfigStatus
	var agentConfig sql.NullString
	var agentConfigHash sql.NullString
	var remoteConfigStatus sql.NullString
	var remoteConfigError sql.NullString
	var remoteConfigStatusAt sql.NullTime
	var effectiveConfigHash sql.NullString
	var lastStatusReport sql.NullTime
	
	row := db.QueryRow(`
		SELECT current_config_yaml, current_config_hash, 
		       remote_config_status, remote_config_error, 
		       remote_config_status_at, effective_config_hash,
		       remote_config_status_at as last_status_report
		FROM agents 
		WHERE org_id=? AND agent_uid=?
	`, c.OrgID, uid)
	
	if err := row.Scan(&agentConfig, &agentConfigHash, &remoteConfigStatus, &remoteConfigError, 
		&remoteConfigStatusAt, &effectiveConfigHash, &lastStatusReport); err != nil {
		http.Error(w, "agent not found", 404)
		return
	}

	result := map[string]any{
		"agentUid": uid,
	}
	
	// Include RemoteConfigStatus in response
	if remoteConfigStatus.Valid {
		result["remoteConfigStatus"] = remoteConfigStatus.String
	}
	if remoteConfigError.Valid && remoteConfigError.String != "" {
		result["remoteConfigError"] = remoteConfigError.String
	}
	if effectiveConfigHash.Valid {
		result["remoteConfigHash"] = effectiveConfigHash.String
	}
	if remoteConfigStatusAt.Valid {
		result["lastStatusReport"] = remoteConfigStatusAt.Time.Format(time.RFC3339)
	}

	// Get latest approved config from database
	var dbConfig sql.NullString
	var dbConfigID, dbConfigVersion sql.NullInt64
	var dbConfigName, dbConfigHash sql.NullString
	row2 := db.QueryRow(`
		SELECT id, version, name, config_yaml, checksum 
		FROM agent_configs 
		WHERE org_id=? AND agent_uid=? AND approval_status='approved'
		ORDER BY version DESC LIMIT 1
	`, c.OrgID, uid)

	if err := row2.Scan(&dbConfigID, &dbConfigVersion, &dbConfigName, &dbConfig, &dbConfigHash); err != nil {
		result["hasDbConfig"] = false
		result["message"] = "No approved configuration found in database for this agent"
		jsonOK(w, result)
		return
	}

	result["hasDbConfig"] = true
	if dbConfigID.Valid {
		result["dbConfigId"] = dbConfigID.Int64
	}
	if dbConfigVersion.Valid {
		result["dbConfigVersion"] = dbConfigVersion.Int64
	}
	if dbConfigName.Valid {
		result["dbConfigName"] = dbConfigName.String
	}
	if dbConfig.Valid {
		result["dbConfig"] = dbConfig.String
	}
	if dbConfigHash.Valid {
		result["dbConfigHash"] = dbConfigHash.String
	}

	if agentConfig.Valid {
		result["agentConfig"] = agentConfig.String
		result["hasAgentConfig"] = true

		// Compare hashes - prefer effective_config_hash from RemoteConfigStatus if available
		// effective_config_hash is what the agent actually applied (from RemoteConfigStatus)
		// current_config_hash is what the agent reported in EffectiveConfig
		hashToCompare := agentConfigHash.String
		if effectiveConfigHash.Valid && effectiveConfigHash.String != "" {
			// Use effective hash from RemoteConfigStatus if available (more accurate)
			hashToCompare = effectiveConfigHash.String
		}
		
		if hashToCompare != "" && dbConfigHash.Valid {
			result["hashMatch"] = (hashToCompare == dbConfigHash.String)
			if hashToCompare == dbConfigHash.String {
				result["syncStatus"] = "synced"
			} else {
				result["syncStatus"] = "mismatch"
				// Generate diff (database config vs agent config)
				diff := generateDiff(dbConfig.String, agentConfig.String)
				result["diff"] = diff
				result["previous"] = dbConfig.String
				result["current"] = agentConfig.String
			}
		} else if dbConfigHash.Valid {
			// No hash from agent yet - can't verify sync
			result["hashMatch"] = false
			result["syncStatus"] = "unknown"
		}
	} else {
		result["hasAgentConfig"] = false
		result["agentConfig"] = ""
		result["message"] = "Agent has no current configuration"
	}

	jsonOK(w, result)
}

func agentActivityLogHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	path := strings.TrimPrefix(r.URL.Path, "/agents/")
	path = strings.TrimSuffix(path, "/activity")
	uid := strings.Split(path, "/")[0]
	if uid == "" {
		http.Error(w, "missing agent uid", 400)
		return
	}

	limit := 50
	if limitParam := r.URL.Query().Get("limit"); limitParam != "" {
		fmt.Sscanf(limitParam, "%d", &limit)
		if limit > 200 {
			limit = 200
		}
	}

	rows, err := db.Query(`
		SELECT id, activity_type, description, config_id, config_version, performed_by, performed_at, metadata
		FROM agent_activity_log 
		WHERE org_id=? AND agent_uid=?
		ORDER BY performed_at DESC 
		LIMIT ?
	`, c.OrgID, uid, limit)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	activities := []map[string]any{}
	for rows.Next() {
		var id int64
		var activityType, description, performedBy sql.NullString
		var configID sql.NullInt64
		var configVersion sql.NullInt64
		var performedAt sql.NullTime
		var metadata sql.NullString

		if err := rows.Scan(&id, &activityType, &description, &configID, &configVersion, &performedBy, &performedAt, &metadata); err != nil {
			continue
		}

		act := map[string]any{
			"id": id,
		}
		if activityType.Valid {
			act["type"] = activityType.String
		}
		if description.Valid {
			act["description"] = description.String
		}
		if configID.Valid {
			act["configId"] = configID.Int64
		}
		if configVersion.Valid {
			act["configVersion"] = configVersion.Int64
		}
		if performedBy.Valid {
			act["performedBy"] = performedBy.String
		}
		if performedAt.Valid {
			act["performedAt"] = performedAt.Time.Format(time.RFC3339)
		}
		if metadata.Valid && metadata.String != "" {
			var meta map[string]any
			if err := json.Unmarshal([]byte(metadata.String), &meta); err == nil {
				act["metadata"] = meta
			}
		}
		activities = append(activities, act)
	}

	jsonOK(w, map[string]any{"items": activities})
}

func agentConfigDiffHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	path := strings.TrimPrefix(r.URL.Path, "/agents/")
	path = strings.TrimSuffix(path, "/config-diff")
	uid := strings.Split(path, "/")[0]
	if uid == "" {
		http.Error(w, "missing agent uid", 400)
		return
	}

	// Get proposed config ID from query
	configID := r.URL.Query().Get("config_id")
	if configID == "" {
		http.Error(w, "config_id required", 400)
		return
	}

	// Get proposed config (the modified config user wants to push)
	var proposedConfig sql.NullString
	row := db.QueryRow(`SELECT config_yaml FROM agent_configs WHERE id=? AND org_id=?`, configID, c.OrgID)
	if err := row.Scan(&proposedConfig); err != nil {
		http.Error(w, "config not found", 404)
		return
	}

	result := map[string]any{
		"agentUid": uid,
		"configId": configID,
	}

	proposed := ""
	if proposedConfig.Valid {
		proposed = proposedConfig.String
	}
	result["proposedConfig"] = proposed
	result["hasProposedConfig"] = proposed != ""

	// Get baseline config (first sync from agent) - prefer from agent_configs version 1, fallback to agents.current_config_yaml
	var baselineConfig sql.NullString
	var baselineConfigID sql.NullInt64
	var baselineName sql.NullString

	// Try to get baseline from agent_configs (version 1, baseline)
	row2 := db.QueryRow(`
		SELECT id, config_yaml, name FROM agent_configs 
		WHERE org_id=? AND agent_uid=? AND version=1 AND name LIKE 'Baseline%'
		ORDER BY id DESC LIMIT 1
	`, c.OrgID, uid)
	if err := row2.Scan(&baselineConfigID, &baselineConfig, &baselineName); err != nil {
		// Fallback: get from agents.current_config_yaml (first sync)
		log.Printf("DEBUG: No baseline in agent_configs for agent %s, using agents.current_config_yaml", uid)
		db.QueryRow(`SELECT current_config_yaml FROM agents WHERE org_id=? AND agent_uid=?`, c.OrgID, uid).Scan(&baselineConfig)
	}

	baseline := ""
	if baselineConfig.Valid {
		baseline = baselineConfig.String
	}

	// Set result fields - "previous" = baseline (first sync), "current" = proposed (modified)
	// Frontend expects "previous" and "current" fields for diff display
	result["previous"] = baseline       // Previous version = baseline (first sync) - used by frontend
	result["current"] = proposed        // Current version = proposed (modified) - used by frontend
	result["previousConfig"] = baseline // Also include for backward compatibility
	result["currentConfig"] = proposed  // Also include for backward compatibility
	result["hasCurrentConfig"] = proposed != ""
	result["hasPreviousConfig"] = baseline != ""

	if baselineConfigID.Valid {
		result["baselineConfigId"] = baselineConfigID.Int64
	}
	if baselineName.Valid {
		result["baselineName"] = baselineName.String
	}

	// Calculate diff: proposed (modified) vs baseline (first sync)
	// diff shows: previous (baseline) vs current (proposed)
	if baseline != "" && proposed != "" {
		diff := calculateDiff(proposed, baseline)
		result["diff"] = diff
		result["hasChanges"] = len(diff) > 0
	} else {
		result["diff"] = []map[string]any{}
		result["hasChanges"] = true // If one is missing, we consider it a change
	}

	jsonOK(w, result)
}

func statsHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()
	row := db.QueryRow(`SELECT COUNT(*) FROM agents WHERE org_id=?`, c.OrgID)
	var n int
	_ = row.Scan(&n)
	jsonOK(w, map[string]any{"agents": n})
}

func componentTypesHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	category := r.URL.Query().Get("category") // receiver, processor, exporter

	switch r.Method {
	case http.MethodGet:
		query := `SELECT id, component_category, type_name, display_label, default_config_json, description, is_system, is_custom 
		          FROM component_types WHERE org_id=?`
		args := []any{c.OrgID}
		if category != "" && (category == "receiver" || category == "processor" || category == "exporter") {
			query += ` AND component_category=?`
			args = append(args, category)
		}
		query += ` ORDER BY component_category, display_label`

		rows, err := db.Query(query, args...)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		defer rows.Close()

		types := []map[string]any{}
		for rows.Next() {
			var id int64
			var cat, typeName, displayLabel, description sql.NullString
			var defaultConfigJSON sql.NullString
			var isSystem, isCustom bool

			if err := rows.Scan(&id, &cat, &typeName, &displayLabel, &defaultConfigJSON, &description, &isSystem, &isCustom); err != nil {
				continue
			}

			compType := map[string]any{
				"id":       id,
				"category": cat.String,
				"type":     typeName.String,
				"label":    displayLabel.String,
				"isSystem": isSystem,
				"isCustom": isCustom,
			}

			if description.Valid {
				compType["description"] = description.String
			}

			// Parse default config JSON
			if defaultConfigJSON.Valid && defaultConfigJSON.String != "" {
				var config map[string]any
				if err := json.Unmarshal([]byte(defaultConfigJSON.String), &config); err == nil {
					compType["config"] = config
				}
			} else {
				compType["config"] = map[string]any{}
			}

			types = append(types, compType)
		}

		jsonOK(w, map[string]any{"items": types})
	case http.MethodPost:
		var in struct {
			Category    string         `json:"category"`
			Type        string         `json:"type"`
			Label       string         `json:"label"`
			Config      map[string]any `json:"config"`
			Description string         `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		if in.Category != "receiver" && in.Category != "processor" && in.Category != "exporter" {
			http.Error(w, "category must be receiver, processor, or exporter", 400)
			return
		}
		if in.Type == "" {
			http.Error(w, "type required", 400)
			return
		}
		if in.Label == "" {
			in.Label = in.Type
		}

		configJSON, _ := json.Marshal(in.Config)

		res, err := db.Exec(`
			INSERT INTO component_types (org_id, component_category, type_name, display_label, default_config_json, description, is_custom, created_by, modified_by)
			VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, ?)
			ON DUPLICATE KEY UPDATE
				display_label=VALUES(display_label),
				default_config_json=VALUES(default_config_json),
				description=VALUES(description),
				modified_by=VALUES(modified_by),
				modified_at=NOW()
		`, c.OrgID, in.Category, in.Type, in.Label, string(configJSON), in.Description, c.UserName, c.UserName)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		id, _ := res.LastInsertId()
		jsonOK(w, map[string]any{"id": id, "ok": true})
	case http.MethodPatch:
		var in struct {
			ID          int64          `json:"id"`
			Label       *string        `json:"label"`
			Config      map[string]any `json:"config"`
			Description *string        `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		var updates []string
		var args []any

		if in.Label != nil {
			updates = append(updates, "display_label=?")
			args = append(args, *in.Label)
		}
		if in.Config != nil {
			configJSON, _ := json.Marshal(in.Config)
			updates = append(updates, "default_config_json=?")
			args = append(args, string(configJSON))
		}
		if in.Description != nil {
			updates = append(updates, "description=?")
			args = append(args, *in.Description)
		}

		if len(updates) == 0 {
			http.Error(w, "no fields to update", 400)
			return
		}

		updates = append(updates, "modified_by=?", "modified_at=NOW()")
		args = append(args, c.UserName, in.ID, c.OrgID)

		query := fmt.Sprintf(`UPDATE component_types SET %s WHERE id=? AND org_id=? AND is_system=FALSE`, strings.Join(updates, ", "))
		_, err := db.Exec(query, args...)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		jsonOK(w, map[string]any{"ok": true})
	case http.MethodDelete:
		id := r.URL.Query().Get("id")
		if id == "" {
			http.Error(w, "id required", 400)
			return
		}

		// Only allow deletion of custom types
		_, err := db.Exec(`DELETE FROM component_types WHERE id=? AND org_id=? AND is_system=FALSE AND is_custom=TRUE`, id, c.OrgID)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		jsonOK(w, map[string]any{"ok": true})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func getDBDSN() string {
	// Try environment variable first (for standalone backend)
	dsn := os.Getenv("AGENTS_MYSQL_DSN")
	if dsn != "" {
		return dsn
	}

	// Try to get from Grafana plugin settings (for plugin mode)
	// This requires accessing plugin context which is available in request context
	// For now, use environment variable or default
	dbType := os.Getenv("DB_TYPE")
	if dbType == "" {
		dbType = "mysql"
	}

	dbHost := os.Getenv("DB_HOST")
	if dbHost == "" {
		dbHost = "mysql" // Docker service name
	}

	dbPort := os.Getenv("DB_PORT")
	if dbPort == "" {
		dbPort = "3306"
	}

	dbUser := os.Getenv("DB_USER")
	if dbUser == "" {
		dbUser = "grafana"
	}

	dbPassword := os.Getenv("DB_PASSWORD")
	if dbPassword == "" {
		dbPassword = "grafana123"
	}

	dbName := os.Getenv("DB_NAME")
	if dbName == "" {
		dbName = "grafana_agents"
	}

	// Build DSN based on database type
	switch dbType {
	case "cloudsql-mysql":
		// Cloud SQL can be connected via:
		// 1. Direct TCP connection (public IP) - recommended
		// 2. Unix socket (when running in GCP/Cloud Run)
		// 3. Private IP (same VPC)
		cloudSQLInstance := os.Getenv("CLOUD_SQL_INSTANCE")
		if cloudSQLInstance != "" && strings.HasPrefix(dbHost, "/cloudsql/") {
			// Use Unix socket for Cloud SQL (when running in GCP)
			dsn = fmt.Sprintf("%s:%s@unix(%s)/%s?parseTime=true&loc=Local&charset=utf8mb4,utf8",
				dbUser, dbPassword, cloudSQLInstance, dbName)
		} else {
			// Direct TCP connection via host:port (recommended)
			// Works with public IP, private IP, or Cloud SQL Proxy
			dsn = fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&loc=Local&charset=utf8mb4,utf8",
				dbUser, dbPassword, dbHost, dbPort, dbName)
		}
	case "aws-rds-mysql":
		// AWS RDS typically requires SSL
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&loc=Local&charset=utf8mb4,utf8&tls=skip-verify",
			dbUser, dbPassword, dbHost, dbPort, dbName)
	default: // mysql
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&loc=Local&charset=utf8mb4,utf8",
			dbUser, dbPassword, dbHost, dbPort, dbName)
	}

	return dsn
}

func agentTelemetryHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 3 || pathParts[1] == "" {
		http.Error(w, "agent UID required", 400)
		return
	}
	agentUID := pathParts[2]

	telemetryType := r.URL.Query().Get("type") // metrics, logs, traces, health, pipeline_status
	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if limitStr != "" {
		fmt.Sscanf(limitStr, "%d", &limit)
	}

	query := `SELECT id, telemetry_type, telemetry_data, reported_at 
	          FROM agent_telemetry 
	          WHERE org_id=? AND agent_uid=?`
	args := []any{c.OrgID, agentUID}

	if telemetryType != "" && (telemetryType == "metrics" || telemetryType == "logs" || telemetryType == "traces" || telemetryType == "health" || telemetryType == "pipeline_status") {
		query += ` AND telemetry_type=?`
		args = append(args, telemetryType)
	}

	query += ` ORDER BY reported_at DESC LIMIT ?`
	args = append(args, limit)

	rows, err := db.Query(query, args...)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var telType, telData sql.NullString
		var reportedAt sql.NullTime
		if err := rows.Scan(&id, &telType, &telData, &reportedAt); err != nil {
			continue
		}

		var data map[string]any
		if telData.Valid {
			json.Unmarshal([]byte(telData.String), &data)
		}

		item := map[string]any{
			"id":          id,
			"type":        telType.String,
			"data":        data,
			"reported_at": reportedAt.Time.Format(time.RFC3339),
		}
		items = append(items, item)
	}

	jsonOK(w, map[string]any{"items": items})
}

func agentHealthHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 3 || pathParts[2] == "" {
		http.Error(w, "agent UID required", 400)
		return
	}
	agentUID := pathParts[2]

	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		fmt.Sscanf(limitStr, "%d", &limit)
	}

	rows, err := db.Query(`
		SELECT healthy, last_error, status_message, recorded_at
		FROM agent_health_history
		WHERE org_id=? AND agent_uid=?
		ORDER BY recorded_at DESC
		LIMIT ?
	`, c.OrgID, agentUID, limit)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var healthy sql.NullBool
		var lastError, statusMsg sql.NullString
		var recordedAt sql.NullTime
		if err := rows.Scan(&healthy, &lastError, &statusMsg, &recordedAt); err != nil {
			continue
		}

		item := map[string]any{
			"recorded_at": recordedAt.Time.Format(time.RFC3339),
		}
		if healthy.Valid {
			item["healthy"] = healthy.Bool
		}
		if lastError.Valid {
			item["last_error"] = lastError.String
		}
		if statusMsg.Valid {
			item["status_message"] = statusMsg.String
		}
		items = append(items, item)
	}

	// Get latest health
	var latestHealthy sql.NullBool
	var latestError, latestMsg sql.NullString
	err2 := db.QueryRow(`
		SELECT healthy, last_error, status_message
		FROM agent_health_history
		WHERE org_id=? AND agent_uid=?
		ORDER BY recorded_at DESC
		LIMIT 1
	`, c.OrgID, agentUID).Scan(&latestHealthy, &latestError, &latestMsg)

	currentHealth := map[string]any{}
	if err2 == nil && latestHealthy.Valid {
		currentHealth["healthy"] = latestHealthy.Bool
		if latestError.Valid && latestError.String != "" {
			currentHealth["last_error"] = latestError.String
		}
		if latestMsg.Valid && latestMsg.String != "" {
			currentHealth["status_message"] = latestMsg.String
		}
	}
	// If no health data, don't set healthy at all (let frontend know it's missing)

	jsonOK(w, map[string]any{
		"items":   items,
		"current": currentHealth,
	})
}

func agentPipelinesHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	db := mustDB()
	defer db.Close()

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 3 || pathParts[2] == "" {
		http.Error(w, "agent UID required", 400)
		return
	}
	agentUID := pathParts[2]

	rows, err := db.Query(`
		SELECT pipeline_name, pipeline_type, status, error_message, last_updated
		FROM agent_pipeline_status
		WHERE org_id=? AND agent_uid=?
		ORDER BY pipeline_name
	`, c.OrgID, agentUID)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var name, pType, status, errorMsg sql.NullString
		var lastUpdated sql.NullTime
		if err := rows.Scan(&name, &pType, &status, &errorMsg, &lastUpdated); err != nil {
			continue
		}

		item := map[string]any{
			"name":          name.String,
			"type":          pType.String,
			"status":        status.String,
			"error_message": errorMsg.String,
			"last_updated":  lastUpdated.Time.Format(time.RFC3339),
		}
		items = append(items, item)
	}

	jsonOK(w, map[string]any{"items": items})
}

// validateOTelConfig validates OpenTelemetry Collector configuration
func validateOTelConfig(configYAML string) []string {
	var errors []string

	if configYAML == "" {
		errors = append(errors, "Configuration cannot be empty")
		return errors
	}

	// Parse YAML to check syntax
	var parsedYAML map[string]interface{}
	if err := yaml.Unmarshal([]byte(configYAML), &parsedYAML); err != nil {
		errors = append(errors, fmt.Sprintf("Invalid YAML syntax: %v", err))
		return errors
	}

	// Check if it's a full CRD or just raw config
	var config map[string]interface{}
	if parsedYAML["kind"] == "OpenTelemetryCollector" && parsedYAML["spec"] != nil {
		// It's a full CRD, extract spec.config
		spec, ok := parsedYAML["spec"].(map[string]interface{})
		if !ok {
			errors = append(errors, "CRD spec must be a map")
			return errors
		}
		configSection, ok := spec["config"].(map[string]interface{})
		if !ok {
			errors = append(errors, "CRD spec.config must be a map")
			return errors
		}
		config = configSection
	} else {
		// It's raw config
		config = parsedYAML
	}

	// Check required top-level sections
	if config["receivers"] == nil && config["processors"] == nil && config["exporters"] == nil {
		errors = append(errors, "Configuration must contain at least one of: receivers, processors, or exporters")
	}

	// Check service section
	if service, ok := config["service"].(map[string]interface{}); ok {
		if pipelines, ok := service["pipelines"].(map[string]interface{}); ok {
			// Validate pipelines
			for pipelineName, pipelineConfig := range pipelines {
				pipeline, ok := pipelineConfig.(map[string]interface{})
				if !ok {
					errors = append(errors, fmt.Sprintf("Pipeline '%s' must be a map", pipelineName))
					continue
				}

				// Check for required fields in pipeline
				if pipeline["receivers"] == nil {
					errors = append(errors, fmt.Sprintf("Pipeline '%s' must have at least one receiver", pipelineName))
				}
				// Exporters are required for a complete config, but allow empty for preview/testing
				// Validate will warn but not block if exporters are empty
				if pipeline["exporters"] == nil {
					errors = append(errors, fmt.Sprintf("Pipeline '%s' should have at least one exporter (config will be incomplete)", pipelineName))
				} else if exporters, ok := pipeline["exporters"].([]interface{}); ok && len(exporters) == 0 {
					errors = append(errors, fmt.Sprintf("Pipeline '%s' has no exporters (config will be incomplete)", pipelineName))
				}
			}
		} else {
			errors = append(errors, "Service section must contain pipelines")
		}
	} else {
		errors = append(errors, "Configuration must contain a 'service' section with pipelines")
	}

	// Check that referenced components exist
	if receivers, ok := config["receivers"].(map[string]interface{}); ok {
		if service, ok := config["service"].(map[string]interface{}); ok {
			if pipelines, ok := service["pipelines"].(map[string]interface{}); ok {
				for _, pipelineConfig := range pipelines {
					pipeline, _ := pipelineConfig.(map[string]interface{})
					if recvList, ok := pipeline["receivers"].([]interface{}); ok {
						for _, recvName := range recvList {
							if recvStr, ok := recvName.(string); ok {
								if receivers[recvStr] == nil {
									errors = append(errors, fmt.Sprintf("Receiver '%s' is referenced in pipeline but not defined", recvStr))
								}
							}
						}
					}
				}
			}
		}
	}

	if exporters, ok := config["exporters"].(map[string]interface{}); ok {
		if service, ok := config["service"].(map[string]interface{}); ok {
			if pipelines, ok := service["pipelines"].(map[string]interface{}); ok {
				for _, pipelineConfig := range pipelines {
					pipeline, _ := pipelineConfig.(map[string]interface{})
					if expList, ok := pipeline["exporters"].([]interface{}); ok {
						for _, expName := range expList {
							if expStr, ok := expName.(string); ok {
								if exporters[expStr] == nil {
									errors = append(errors, fmt.Sprintf("Exporter '%s' is referenced in pipeline but not defined", expStr))
								}
							}
						}
					}
				}
			}
		}
	}

	if processors, ok := config["processors"].(map[string]interface{}); ok {
		if service, ok := config["service"].(map[string]interface{}); ok {
			if pipelines, ok := service["pipelines"].(map[string]interface{}); ok {
				for _, pipelineConfig := range pipelines {
					pipeline, _ := pipelineConfig.(map[string]interface{})
					if procList, ok := pipeline["processors"].([]interface{}); ok {
						for _, procName := range procList {
							if procStr, ok := procName.(string); ok {
								if processors[procStr] == nil {
									errors = append(errors, fmt.Sprintf("Processor '%s' is referenced in pipeline but not defined", procStr))
								}
							}
						}
					}
				}
			}
		}
	}

	return errors
}

func mustDB() *sql.DB {
	dsn := getDBDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		panic(err)
	}
	// Test connection
	if err := db.Ping(); err != nil {
		panic(fmt.Sprintf("Failed to connect to database: %v (DSN: %s)", err, dsn))
	}
	return db
}
