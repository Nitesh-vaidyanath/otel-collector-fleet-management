package main

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/open-telemetry/opamp-go/protobufs"
	"github.com/open-telemetry/opamp-go/server"
	"github.com/open-telemetry/opamp-go/server/types"
	"gopkg.in/yaml.v3"
)

type agentConnection struct {
	conn        types.Connection
	instanceUID string // Normalized UID for internal storage/lookup
	originalUID []byte // Original InstanceUid bytes from agent (required by OpAMP spec for ServerToAgent messages)
}

type OpampManager struct {
	server server.OpAMPServer
	conns  map[string]*agentConnection // agent_uid -> connection
}

func NewOpampManager() (*OpampManager, error) {
	s := server.New(nil)
	return &OpampManager{
		server: s,
		conns:  make(map[string]*agentConnection),
	}, nil
}

// normalizeAgentUID normalizes agent UID to a consistent format (removes hyphens for UUIDs)
func normalizeAgentUID(uid string) string {
	// Remove hyphens from UUID format (e.g., "550e8400-e29b-41d4-a716-446655440001" -> "550e8400e29b41d4a716446655440001")
	return strings.ReplaceAll(uid, "-", "")
}

func resolveOrgIDFromLabels(labels map[string]string) (int64, string) {
	orgID := int64(1)
	matchedKey := ""

	if labels == nil {
		return orgID, matchedKey
	}

	numericKeys := []string{"org_id", "organization.id", "tenant.id"}
	numericMatched := false
	for _, key := range numericKeys {
		if val, ok := labels[key]; ok {
			var parsed int64
			if _, err := fmt.Sscanf(val, "%d", &parsed); err == nil && parsed > 0 {
				orgID = parsed
				matchedKey = key
				numericMatched = true
				break
			}
		}
	}

	attemptedNames := []string{}
	nameKeys := []string{"tenant.name", "organization.name", "tenant"}
	for _, key := range nameKeys {
		if val, ok := labels[key]; ok {
			trimmed := strings.TrimSpace(val)
			if trimmed == "" {
				continue
			}
			if strings.EqualFold(trimmed, "main org.") || strings.EqualFold(trimmed, "main org") || strings.EqualFold(trimmed, "default organization") {
				return 1, key
			}
			if id, found := ensureOrgIDByName(trimmed); found {
				return id, key
			}
			attemptedNames = append(attemptedNames, fmt.Sprintf("%s=%q", key, trimmed))
		}
	}

	if len(attemptedNames) > 0 {
		if numericMatched && matchedKey != "" {
			log.Printf("WARNING: Could not resolve organization by name for labels (%s); keeping org_id=%d from %s", strings.Join(attemptedNames, ", "), orgID, matchedKey)
		} else {
			log.Printf("WARNING: Could not resolve organization by name for labels (%s); defaulting to org_id=%d", strings.Join(attemptedNames, ", "), orgID)
		}
	}

	return orgID, matchedKey
}

// extractCollectorConfigFromCRD extracts the collector configuration from a full OpenTelemetryCollector CRD YAML
// The bridge sends the full CRD (with metadata, spec, etc.) but we only need spec.config (the actual collector config)
// For pushing config to existing collectors, we MUST send ONLY spec.config, not the full CRD
func extractCollectorConfigFromCRD(crdBody []byte, agentUID string) string {
	if len(crdBody) == 0 {
		return ""
	}

	// Try to parse as CRD YAML
	var crdYAML map[string]interface{}
	if err := yaml.Unmarshal(crdBody, &crdYAML); err != nil {
		// Not a CRD - probably direct collector config, return as-is
		log.Printf("DEBUG: Config for agent %s is not a CRD format, using as-is (direct collector config)", agentUID)
		return string(crdBody)
	}

	// Check if this is a CRD structure (has apiVersion, kind, spec)
	isCRD := false
	if apiVersion, ok := crdYAML["apiVersion"].(string); ok {
		if strings.Contains(apiVersion, "opentelemetry.io") {
			isCRD = true
		}
	}
	if kind, ok := crdYAML["kind"].(string); ok {
		if kind == "OpenTelemetryCollector" {
			isCRD = true
		}
	}

	if !isCRD {
		// Not a CRD structure - return as-is
		log.Printf("DEBUG: Config for agent %s doesn't appear to be a CRD (no apiVersion/kind), using as-is", agentUID)
		return string(crdBody)
	}

	// Extract spec.config
	if spec, ok := crdYAML["spec"].(map[string]interface{}); ok {
		if config, ok := spec["config"].(map[string]interface{}); ok {
			// Marshal just the config part back to YAML
			if configYAML, err := yaml.Marshal(config); err == nil {
				log.Printf("DEBUG: Extracted spec.config from CRD for agent %s (removed metadata, deployment settings, etc.)", agentUID)
				return string(configYAML)
			} else {
				log.Printf("WARNING: Failed to marshal extracted config for agent %s: %v", agentUID, err)
			}
		} else {
			log.Printf("WARNING: CRD for agent %s has no spec.config section, returning full body", agentUID)
		}
	} else {
		log.Printf("WARNING: CRD for agent %s has no spec section, returning full body", agentUID)
	}

	// Fallback: return full body if extraction failed
	log.Printf("WARNING: Failed to extract spec.config from CRD for agent %s, returning full CRD (bridge may reject)", agentUID)
	return string(crdBody)
}

func determineConfigMapKey(isKubernetes bool, namespace, collectorName string) (key string, missing bool) {
	if isKubernetes {
		ns := strings.TrimSpace(namespace)
		name := strings.TrimSpace(collectorName)
		if ns == "" || name == "" {
			log.Printf("WARNING: determineConfigMapKey fallback - missing namespace (%q) or collector name (%q); using 'collector.yaml'", namespace, collectorName)
			return "collector.yaml", true
		}
		return fmt.Sprintf("%s/%s", ns, name), false
	}
	return "collector.yaml", false
}

// registerBridge registers an OpAMP Bridge in the bridges table (NOT agents table)
// Bridges are NOT collectors - they manage collectors
func (m *OpampManager) registerBridge(instanceUID, name, version string, labels map[string]string, capabilities map[string]interface{}) error {
	// Normalize UID for consistent storage
	instanceUID = normalizeAgentUID(instanceUID)
	db := mustDB()
	defer db.Close()

	labelsJSON, _ := json.Marshal(labels)
	capabilitiesJSON, _ := json.Marshal(capabilities)

	// Ensure capabilities JSON is not empty - always store at least empty object
	if len(capabilitiesJSON) == 0 || string(capabilitiesJSON) == "null" {
		capabilitiesJSON = []byte("{}")
	}

	// Try to determine org_id/tenant from bridge labels or default to 1
	orgID, _ := resolveOrgIDFromLabels(labels)

	// Mark old bridge instances as offline (same org_id, different bridge_uid)
	_, err := db.Exec(`
		UPDATE bridges 
			SET status = 'offline', last_seen_at = NOW()
		WHERE org_id = ? 
		  AND bridge_uid != ?
		  AND status = 'online'
	`, orgID, instanceUID)
	if err == nil {
		log.Printf("OpAMP Bridge reconnected: Marked old bridge instances as offline (org_id=%d, new_uid=%s)", orgID, instanceUID[:8])
	}

	// Derive nicer defaults for name/version from labels if not provided
	if name == "" || name == instanceUID || (len(name) == len(instanceUID) && normalizeAgentUID(name) == instanceUID) {
		if v, ok := labels["service.name"]; ok && strings.TrimSpace(v) != "" {
			name = v
		} else if v, ok := labels["resource.attributes.service.name"]; ok && strings.TrimSpace(v) != "" {
			name = v
		}
	}
	if version == "" || version == "unknown" {
		if v, ok := labels["service.version"]; ok && strings.TrimSpace(v) != "" {
			version = v
		} else if v, ok := labels["collector.version"]; ok && strings.TrimSpace(v) != "" {
			version = v
		} else if v, ok := labels["version"]; ok && strings.TrimSpace(v) != "" {
			version = v
		}
	}

	// UPSERT bridge into bridges table
	_, err = db.Exec(`
		INSERT INTO bridges (org_id, bridge_uid, name, version, status, last_seen_at, labels_json, capabilities_json)
		VALUES (?, ?, ?, ?, 'online', NOW(), ?, ?)
		ON DUPLICATE KEY UPDATE 
			name = IF(VALUES(name) != '' AND VALUES(name) != VALUES(bridge_uid), VALUES(name), name),
			version = IF(VALUES(version) != '' AND VALUES(version) != 'unknown', VALUES(version), version),
			status = IF(status = 'degraded', 'degraded', 'online'),
			last_seen_at = NOW(),
			labels_json = IF(CHAR_LENGTH(VALUES(labels_json)) > 2 AND VALUES(labels_json) != '{}', VALUES(labels_json), labels_json),
			capabilities_json = VALUES(capabilities_json)
	`, orgID, instanceUID, name, version, string(labelsJSON), string(capabilitiesJSON))
	if err != nil {
		log.Printf("Failed to register bridge %s: %v", instanceUID, err)
		return err
	}

	log.Printf("✓ Registered/Updated OpAMP Bridge: %s (version: %s, org_id: %d)", instanceUID[:8], version, orgID)
	return nil
}

func (m *OpampManager) registerAgent(instanceUID, name, version string, labels map[string]string, capabilities map[string]interface{}, currentConfig, currentConfigHash string) error {
	// Normalize UID for consistent storage
	instanceUID = normalizeAgentUID(instanceUID)
	db := mustDB()
	defer db.Close()

	// CRITICAL: Bridges should NEVER be registered as agents
	// This function is ONLY for collectors/agents, NOT bridges
	if reportsEffectiveConfig, ok := capabilities["reports_effective_config"]; ok {
		if val, ok := reportsEffectiveConfig.(bool); ok && val {
			log.Printf("ERROR: Attempted to register OpAMP Bridge %s as an agent - this should not happen!", instanceUID[:8])
			return fmt.Errorf("bridges must be registered via registerBridge, not registerAgent")
		}
	}

	labelsJSON, _ := json.Marshal(labels)
	capabilitiesJSON, _ := json.Marshal(capabilities)

	orgID, _ := resolveOrgIDFromLabels(labels)

	// Get org name
	var orgName string
	db.QueryRow(`SELECT name FROM organizations WHERE id=?`, orgID).Scan(&orgName)
	if orgName == "" {
		orgName = fmt.Sprintf("Organization %d", orgID)
	}

	// Always update labels, version, and capabilities on every message to ensure persistence
	// This ensures we always have the latest information from the agent
	labelsJSONStr := string(labelsJSON)
	capabilitiesJSONStr := string(capabilitiesJSON)

	// Extract version and name from labels if available (they're more reliable than IdentifyingAttributes for OpenTelemetry Collector)
	if version == "" || version == "unknown" {
		if v, ok := labels["service.version"]; ok && v != "" {
			version = v
		} else if v, ok := labels["version"]; ok && v != "" {
			version = v
		}
	}

	// Extract name from labels if available and not already a UUID-like string
	if name == "" || name == instanceUID || (len(name) == len(instanceUID) && name == normalizeAgentUID(instanceUID)) {
		if n, ok := labels["service.name"]; ok && n != "" {
			name = n
		}
	}

	// Update current config only if it's different (to avoid unnecessary updates)
	if currentConfig != "" {
		// Check if this is the first read (no existing config in database)
		var existingConfigHash sql.NullString
		var existingConfigYAML sql.NullString
		checkDB := mustDB()
		checkDB.QueryRow(`SELECT current_config_hash, current_config_yaml FROM agents WHERE agent_uid=? LIMIT 1`, instanceUID).Scan(&existingConfigHash, &existingConfigYAML)
		checkDB.Close()

		isFirstRead := !existingConfigHash.Valid || existingConfigHash.String == ""

		// Case 1: First read - save baseline config to both agents table AND agent_configs table
		if isFirstRead {
			log.Printf("FIRST READ: Agent %s (%s) - storing initial config from agent (hash: %s, %d bytes)", instanceUID, name, currentConfigHash, len(currentConfig))
			log.Printf("  This is the baseline config. Saving to agents table and agent_configs table as version 1.")

			// Save baseline config to agent_configs table as version 1 (approved, since it's from the agent)
			baselineDB := mustDB()
			// Check if baseline already exists (in case agent reconnects)
			var existingBaselineID sql.NullInt64
			baselineDB.QueryRow(`
				SELECT id FROM agent_configs 
				WHERE org_id=? AND agent_uid=? AND version=1 AND name LIKE 'Baseline%'
				ORDER BY id DESC LIMIT 1
			`, orgID, instanceUID).Scan(&existingBaselineID)

			if !existingBaselineID.Valid {
				// Create baseline entry in agent_configs
				baselineName := fmt.Sprintf("Baseline (from agent - %s)", name)
				_, err := baselineDB.Exec(`
					INSERT INTO agent_configs (org_id, agent_uid, version, name, config_yaml, checksum, approval_status, created_by)
					VALUES (?, ?, 1, ?, ?, ?, 'approved', 'system')
				`, orgID, instanceUID, baselineName, currentConfig, currentConfigHash)
				if err != nil {
					log.Printf("WARNING: Failed to save baseline config to agent_configs for agent %s: %v", instanceUID, err)
				} else {
					log.Printf("✓ Saved baseline config to agent_configs (version 1) for agent %s", instanceUID)
				}
			} else {
				log.Printf("Baseline config already exists in agent_configs for agent %s (id: %d)", instanceUID, existingBaselineID.Int64)
			}
			baselineDB.Close()
		} else {
			// Case 2 & 3: Subsequent reads - compare with existing config
			if existingConfigHash.Valid && existingConfigHash.String != "" {
				if currentConfigHash != existingConfigHash.String {
					// Case 2: Config changed - log warning about drift
					log.Printf("WARNING: Agent %s (%s) config has changed since last read!", instanceUID, name)
					log.Printf("  Previous hash: %s", existingConfigHash.String)
					log.Printf("  New hash:      %s", currentConfigHash)
					log.Printf("  This may indicate config drift or manual changes on the agent")
					if existingConfigYAML.Valid && existingConfigYAML.String != "" {
						log.Printf("  Previous config length: %d bytes", len(existingConfigYAML.String))
						log.Printf("  New config length:      %d bytes", len(currentConfig))
						log.Printf("  Config will be updated in database with new version from agent")
					}
				} else {
					// Case 3: Config unchanged
					log.Printf("Agent %s (%s) config unchanged (hash: %s)", instanceUID, name, currentConfigHash)
				}
			}
		}

		_, err := db.Exec(`
			INSERT INTO agents (org_id, org_name, agent_uid, name, version, status, last_seen_at, labels_json, capabilities_json, current_config_yaml, current_config_hash)
			VALUES (?, ?, ?, ?, ?, 'online', NOW(), ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE 
				name = IF(VALUES(name) != '' AND VALUES(name) != VALUES(agent_uid), VALUES(name), name),
				version = IF(VALUES(version) != '' AND VALUES(version) != 'unknown', VALUES(version), version),
			status = IF(status = 'degraded', 'degraded', 'online'),
				last_seen_at = NOW(),
				labels_json = IF(CHAR_LENGTH(VALUES(labels_json)) > 2 AND VALUES(labels_json) != '{}', VALUES(labels_json), labels_json),
				capabilities_json = IF(CHAR_LENGTH(VALUES(capabilities_json)) > 2 AND VALUES(capabilities_json) != '{}', VALUES(capabilities_json), capabilities_json),
				org_name = VALUES(org_name),
				org_id = VALUES(org_id),
				-- Only update config if hash changed (indicates config drift or update)
				current_config_yaml = CASE 
					WHEN current_config_hash IS NULL THEN VALUES(current_config_yaml)
					WHEN current_config_hash != VALUES(current_config_hash) THEN VALUES(current_config_yaml)
					ELSE current_config_yaml
				END,
				current_config_hash = COALESCE(VALUES(current_config_hash), current_config_hash)
		`, orgID, orgName, instanceUID, name, version, labelsJSONStr, capabilitiesJSONStr, currentConfig, currentConfigHash)
		if err != nil {
			log.Printf("Failed to register agent %s: %v", instanceUID, err)
			return err
		}
	} else {
		_, err := db.Exec(`
			INSERT INTO agents (org_id, org_name, agent_uid, name, version, status, last_seen_at, labels_json, capabilities_json)
			VALUES (?, ?, ?, ?, ?, 'online', NOW(), ?, ?)
			ON DUPLICATE KEY UPDATE 
				name = IF(VALUES(name) != '' AND VALUES(name) != VALUES(agent_uid), VALUES(name), name),
				version = IF(VALUES(version) != '' AND VALUES(version) != 'unknown', VALUES(version), version),
			status = IF(status = 'degraded', 'degraded', 'online'),
				last_seen_at = NOW(),
				labels_json = IF(CHAR_LENGTH(VALUES(labels_json)) > 2 AND VALUES(labels_json) != '{}', VALUES(labels_json), labels_json),
				capabilities_json = IF(CHAR_LENGTH(VALUES(capabilities_json)) > 2 AND VALUES(capabilities_json) != '{}', VALUES(capabilities_json), capabilities_json),
				org_name = VALUES(org_name),
				org_id = VALUES(org_id)
		`, orgID, orgName, instanceUID, name, version, labelsJSONStr, capabilitiesJSONStr)
		if err != nil {
			log.Printf("Failed to register agent %s: %v", instanceUID, err)
			return err
		}
	}

	log.Printf("Registered/Updated agent: %s (version: %s, labels: %s, org_id: %d)", instanceUID, version, labelsJSONStr, orgID)
	return nil
}

func (m *OpampManager) updateAgentStatus(instanceUID, status string) {
	db := mustDB()
	defer db.Close()
	db.Exec(`UPDATE agents SET status=?, last_seen_at=NOW() WHERE agent_uid=?`, status, instanceUID)
}

// updateDiscoveredCollectorsHealth updates health status for all collectors discovered by this bridge
// It processes EffectiveConfig and ComponentHealthMap from the bridge's AgentToServer message
// CRITICAL FIX: Now UPSERTs collectors from EffectiveConfig to handle:
// 1. Collectors moved to different namespaces (new stable UID = new entity)
// 2. Two collectors with same name in different namespaces (separate entities)
// 3. New collectors that appear only via EffectiveConfig (never had a direct connection)
func (m *OpampManager) updateDiscoveredCollectorsHealth(bridgeInstanceUID string, message *protobufs.AgentToServer, conn types.Connection) {
	db := mustDB()
	defer db.Close()

	// Fix 1: Check bridge's own health status
	// If bridge sends Health message, update bridge status based on it
	if message.Health != nil {
		healthy := message.Health.Healthy
		var currentStatus string
		row := db.QueryRow(`SELECT status FROM agents WHERE agent_uid=? LIMIT 1`, bridgeInstanceUID)
		if err := row.Scan(&currentStatus); err == nil {
			if !healthy {
				// Bridge is unhealthy - mark as degraded
				if currentStatus == "online" {
					log.Printf("WARNING: Bridge %s reported unhealthy status - marking as degraded", bridgeInstanceUID[:8])
					if message.Health.LastError != "" {
						log.Printf("  Bridge health error: %s", message.Health.LastError)
					}
					db.Exec(`UPDATE agents SET status='degraded', last_seen_at=NOW() WHERE agent_uid=?`, bridgeInstanceUID)
				} else if currentStatus == "degraded" {
					// Already degraded, just update heartbeat
					db.Exec(`UPDATE agents SET last_seen_at=NOW() WHERE agent_uid=?`, bridgeInstanceUID)
				}
			} else {
				// Bridge is healthy - ensure it's marked as online
				if currentStatus == "degraded" || currentStatus == "offline" {
					log.Printf("✓ Bridge %s recovered to healthy status", bridgeInstanceUID[:8])
					db.Exec(`UPDATE agents SET status='online', last_seen_at=NOW() WHERE agent_uid=?`, bridgeInstanceUID)
				} else if currentStatus == "online" {
					// Already online, just update heartbeat
					db.Exec(`UPDATE agents SET last_seen_at=NOW() WHERE agent_uid=?`, bridgeInstanceUID)
				}
			}
		}
	} else {
		// No Health message from bridge - update heartbeat but don't change status
		// Health status will be determined by connection status (online/offline)
		db.Exec(`UPDATE agents SET last_seen_at=NOW() WHERE agent_uid=? AND status IN ('online', 'degraded')`, bridgeInstanceUID)
	}

	// Build set of collectors currently in EffectiveConfig (what bridge is reporting)
	// CRITICAL: Keys are in format "namespace/name" per OpAMP bridge spec
	// Reference: https://github.com/open-telemetry/opentelemetry-operator/blob/main/cmd/operator-opamp-bridge/internal/agent/agent.go
	// The bridge sends EffectiveConfig with keys like "default/test-collector" or "opentelemetry-operator-system/otel-collector-daemonset"
	collectorsInEffectiveConfig := make(map[string]bool)
	hasEffectiveConfig := false
	if message.EffectiveConfig != nil && message.EffectiveConfig.ConfigMap != nil {
		if cfgMap := message.EffectiveConfig.ConfigMap.ConfigMap; len(cfgMap) > 0 {
			hasEffectiveConfig = true
			for configKey := range cfgMap {
				// Only consider keys that are namespace/name format (e.g., "default/test-collector")
				// Skip empty string, "collector.yaml", or other non-namespace/name keys
				if configKey != "" && configKey != "collector.yaml" && strings.Contains(configKey, "/") {
					collectorsInEffectiveConfig[configKey] = true
				}
			}
			keys := make([]string, 0, len(collectorsInEffectiveConfig))
			for k := range collectorsInEffectiveConfig {
				keys = append(keys, k)
			}
			log.Printf("DEBUG: Bridge %s EffectiveConfig contains %d collectors (keys: %v)", bridgeInstanceUID[:8], len(collectorsInEffectiveConfig), keys)
		}
	}

	// FALLBACK: If EffectiveConfig is missing, use ComponentHealthMap to discover collectors
	// ComponentHealthMap keys are also in "namespace/name" format
	if !hasEffectiveConfig && message.Health != nil && message.Health.ComponentHealthMap != nil {
		log.Printf("DEBUG: Bridge %s EffectiveConfig is nil, using ComponentHealthMap as fallback to discover collectors", bridgeInstanceUID[:8])
		for healthKey := range message.Health.ComponentHealthMap {
			// Only consider keys that are namespace/name format (e.g., "default/test-collector")
			if healthKey != "" && strings.Contains(healthKey, "/") {
				collectorsInEffectiveConfig[healthKey] = true
			}
		}
		if len(collectorsInEffectiveConfig) > 0 {
			keys := make([]string, 0, len(collectorsInEffectiveConfig))
			for k := range collectorsInEffectiveConfig {
				keys = append(keys, k)
			}
			log.Printf("DEBUG: Bridge %s ComponentHealthMap contains %d collectors (keys: %v)", bridgeInstanceUID[:8], len(collectorsInEffectiveConfig), keys)
			hasEffectiveConfig = true // Treat ComponentHealthMap as source of truth for discovery
		}
	}

	// If bridge didn't send EffectiveConfig OR ComponentHealthMap, skip status updates (don't mark anything offline)
	// This can happen during config push or bridge restart
	// BUT: Still update last_seen_at for all collectors managed by this bridge to prevent cleanup worker from marking them offline
	bridgeNormalizedUID := normalizeAgentUID(bridgeInstanceUID)
	if !hasEffectiveConfig {
		log.Printf("DEBUG: Bridge %s did not send EffectiveConfig or ComponentHealthMap (or both are empty) - updating last_seen_at for all collectors but skipping status updates", bridgeInstanceUID[:8])
		// Still update last_seen_at for all collectors to prevent them being marked offline
		// This ensures collectors stay "online" if bridge is connected (even if EffectiveConfig is temporarily empty)
		db.Exec(`UPDATE agents SET last_seen_at=NOW() WHERE agent_uid IN (
			SELECT agent_uid FROM agents WHERE JSON_EXTRACT(labels_json, '$."bridge.instance_uid"') = ?
		)`, bridgeNormalizedUID)
		return
	}

	// CRITICAL FIX (A): UPSERT discovered collectors from EffectiveConfig
	// This ensures every "namespace/name" becomes its own persistent agent entity
	// This handles: collectors moved to new namespace, same name in different namespaces, new collectors
	clusterID := os.Getenv("CLUSTER_ID")
	if clusterID == "" {
		clusterID = "default"
	}
	bridgeOriginalUID := message.InstanceUid // Store original bridge InstanceUID bytes for OpAMP protocol

	for configKey := range collectorsInEffectiveConfig {
		// Parse namespace/name from key (format: "namespace/name")
		ns, name, ok := strings.Cut(configKey, "/")
		if !ok || ns == "" || name == "" {
			continue
		}

		// Generate stable UID = sha256("namespace/name")
		uidBytes := sha256.Sum256([]byte(configKey))
		stableUID := normalizeAgentUID(hex.EncodeToString(uidBytes[:]))

		// Build minimal labels we know for sure
		labels := map[string]string{
			"otel.kind":           "OpenTelemetryCollector",
			"deployment.type":     "k8s",
			"k8s.namespace":       ns,
			"k8s.crd_name":        name,
			"bridge.instance_uid": bridgeNormalizedUID,
		}
		labelsJSON, _ := json.Marshal(labels)

		// Extract version and config from CRD if available
		collectorVersion := "unknown"
		var collectorConfigYAML string
		var collectorConfigHash string
		if message.EffectiveConfig != nil && message.EffectiveConfig.ConfigMap != nil {
			if cfgMap := message.EffectiveConfig.ConfigMap.ConfigMap; cfgMap != nil {
				if cfgFile, ok := cfgMap[configKey]; ok && cfgFile != nil && len(cfgFile.Body) > 0 {
					var crdYAML map[string]interface{}
					if err := yaml.Unmarshal(cfgFile.Body, &crdYAML); err == nil {
						// Extract version from status.version first (most reliable)
						if status, ok := crdYAML["status"].(map[string]interface{}); ok {
							if version, ok := status["version"].(string); ok && version != "" {
								collectorVersion = version
							} else if versionNum, ok := status["version"].(float64); ok {
								// Handle numeric version (convert to string)
								collectorVersion = fmt.Sprintf("%.1f", versionNum)
								// Remove trailing .0 if present
								if strings.HasSuffix(collectorVersion, ".0") {
									collectorVersion = strings.TrimSuffix(collectorVersion, ".0")
								}
							}
						}

						if spec, ok := crdYAML["spec"].(map[string]interface{}); ok {
							// Fallback: Extract version from image tag if status.version not available
							if collectorVersion == "unknown" {
								if image, ok := spec["image"].(string); ok && image != "" {
									if parts := strings.Split(image, ":"); len(parts) == 2 {
										tag := parts[1]
										if strings.Contains(tag, ".") && strings.ContainsAny(tag, "0123456789") {
											collectorVersion = tag
										}
									}
								}
							}
							// Extract collector config from spec.config
							if config, ok := spec["config"].(map[string]interface{}); ok {
								// Convert config map to YAML
								if configYAML, err := yaml.Marshal(config); err == nil {
									collectorConfigYAML = string(configYAML)
									// Calculate hash
									hashBytes := sha256.Sum256([]byte(collectorConfigYAML))
									collectorConfigHash = hex.EncodeToString(hashBytes[:])
								}
							} else {
								// If spec.config doesn't exist, try to extract from full CRD
								collectorConfigYAML = extractCollectorConfigFromCRD(cfgFile.Body, stableUID)
								if collectorConfigYAML != "" {
									hashBytes := sha256.Sum256([]byte(collectorConfigYAML))
									collectorConfigHash = hex.EncodeToString(hashBytes[:])
								}
							}
						}
					}
				}
			}
		}

		// UPSERT: create a row if it doesn't exist; otherwise refresh heartbeat and update labels/config
		// CRITICAL: Use ON DUPLICATE KEY UPDATE to handle both new and existing collectors
		_, err := db.Exec(`
			INSERT INTO agents (org_id, org_name, agent_uid, name, version, status, last_seen_at,
			                    labels_json, capabilities_json, k8s_namespace, k8s_crd_name, cluster_id,
			                    current_config_yaml, current_config_hash)
			VALUES (1, 'default', ?, ?, ?, 'online', NOW(), ?, JSON_OBJECT(), ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE
				last_seen_at = NOW(),
				status = IF(status='offline', 'online', status),
				labels_json = IF(CHAR_LENGTH(VALUES(labels_json)) > 2 AND VALUES(labels_json) != '{}', VALUES(labels_json), labels_json),
				k8s_namespace = VALUES(k8s_namespace),
				k8s_crd_name = VALUES(k8s_crd_name),
				cluster_id = VALUES(cluster_id),
				version = IF(VALUES(version) != 'unknown' AND VALUES(version) != '', VALUES(version), version),
				current_config_yaml = IF(VALUES(current_config_yaml) IS NOT NULL AND VALUES(current_config_yaml) != '', VALUES(current_config_yaml), current_config_yaml),
				current_config_hash = IF(VALUES(current_config_hash) IS NOT NULL AND VALUES(current_config_hash) != '', VALUES(current_config_hash), current_config_hash)
		`, stableUID, name, collectorVersion, string(labelsJSON), ns, name, clusterID, collectorConfigYAML, collectorConfigHash)

		if err != nil {
			log.Printf("ERROR: Failed to UPSERT collector %s/%s (uid: %s): %v", ns, name, stableUID[:8], err)
			continue
		}

		// CRITICAL FIX (B): Map stable UID to bridge connection so config pushes work
		// This allows us to send ServerToAgent messages to specific collectors via the bridge
		m.conns[stableUID] = &agentConnection{
			conn:        conn,              // Bridge's WebSocket connection
			instanceUID: stableUID,         // Stable UID for this collector
			originalUID: bridgeOriginalUID, // Bridge's original InstanceUID bytes (per OpAMP spec)
		}

		log.Printf("DEBUG: UPSERTed collector %s/%s (uid: %s, version: %s) from bridge EffectiveConfig", ns, name, stableUID[:8], collectorVersion)
	}

	// Get all discovered collectors for this bridge (now includes newly UPSERTed ones)
	// Use bracket notation for JSON keys with dots: $."key.with.dots"
	rows, err := db.Query(`
		SELECT agent_uid, name, labels_json 
		FROM agents 
		WHERE JSON_EXTRACT(labels_json, '$."bridge.instance_uid"') = ?
		  AND agent_uid != ?
	`, bridgeNormalizedUID, bridgeInstanceUID)

	if err != nil {
		log.Printf("ERROR: Failed to query discovered collectors for bridge %s: %v", bridgeInstanceUID, err)
		return
	}
	defer rows.Close()

	onlineCount := 0

	for rows.Next() {
		var agentUID, name string
		var labelsJSON sql.NullString
		if err := rows.Scan(&agentUID, &name, &labelsJSON); err != nil {
			continue
		}

		// Parse labels to get namespace and CRD name
		var labels map[string]string
		if labelsJSON.Valid {
			json.Unmarshal([]byte(labelsJSON.String), &labels)
		}

		namespace := labels["k8s.namespace"]
		crdName := labels["k8s.crd_name"]
		if crdName == "" {
			crdName = name // Fallback to agent name
		}

		// Build config key (format: namespace/name)
		configKey := fmt.Sprintf("%s/%s", namespace, crdName)

		// REAL-TIME STATUS: If collector is in EffectiveConfig → check for errors before marking online
		// If NOT in EffectiveConfig → check if CRD exists (deleted vs degraded)
		// NOTE: Health status from Health message takes priority - storeAgentTelemetry will update status
		if collectorsInEffectiveConfig[configKey] {
			// Collector is in EffectiveConfig - ALWAYS update last_seen_at first (bridge heartbeat)
			// CRITICAL: Check bridge's ComponentHealthMap for per-collector health status
			// The bridge reports health for each collector pool in ComponentHealthMap with key format: namespace/name
			var currentStatus string
			collectorRow := db.QueryRow(`SELECT status FROM agents WHERE agent_uid=? LIMIT 1`, agentUID)
			collectorRow.Scan(&currentStatus)

			// CRITICAL: Update last_seen_at immediately - this is the bridge heartbeat for this collector
			db.Exec(`UPDATE agents SET last_seen_at=NOW() WHERE agent_uid=?`, agentUID)

			// Check bridge's ComponentHealthMap for this collector's health
			// Key format is: namespace/name (e.g., "opentelemetry-operator-system/test-collector")
			collectorHealthFromBridge := false
			collectorHealthy := false
			if message.Health != nil && message.Health.ComponentHealthMap != nil {
				if health, ok := message.Health.ComponentHealthMap[configKey]; ok && health != nil {
					collectorHealthFromBridge = true
					collectorHealthy = health.Healthy
					log.Printf("DEBUG: Collector %s/%s health from bridge ComponentHealthMap: healthy=%v, error=%s",
						namespace, crdName, health.Healthy, health.LastError)
				}
			}

			// Determine collector status based on bridge's health report
			if collectorHealthFromBridge {
				// Bridge explicitly reports health for this collector
				if collectorHealthy {
					// Collector is healthy according to bridge - mark as online
					if currentStatus != "online" {
						log.Printf("INFO: Collector %s/%s (%s) is healthy according to bridge ComponentHealthMap - marking as online",
							namespace, crdName, agentUID[:8])
						db.Exec(`UPDATE agents SET status='online' WHERE agent_uid=?`, agentUID)
						onlineCount++
					}
				} else {
					// Collector is unhealthy according to bridge - mark as degraded
					if currentStatus != "degraded" {
						log.Printf("WARNING: Collector %s/%s (%s) is unhealthy according to bridge ComponentHealthMap - marking as degraded",
							namespace, crdName, agentUID[:8])
						db.Exec(`UPDATE agents SET status='degraded' WHERE agent_uid=?`, agentUID)
					}
				}
			} else {
				// No ComponentHealthMap entry for this collector - if in EffectiveConfig, assume healthy
				// CRITICAL: If collector is in EffectiveConfig, bridge is managing it successfully - mark as online
				if currentStatus != "online" {
					log.Printf("INFO: Collector %s/%s (%s) is in EffectiveConfig (no ComponentHealthMap entry) - marking as online",
						namespace, crdName, agentUID[:8])
					db.Exec(`UPDATE agents SET status='online' WHERE agent_uid=?`, agentUID)
					onlineCount++
				}
			}
		} else {
			// Collector NOT in EffectiveConfig - this means:
			// 1. Collector pod crashed/errored and bridge removed it from EffectiveConfig
			// 2. Collector was deleted (CRD no longer exists)
			// 3. Collector is temporarily unavailable
			// CRITICAL: Only mark as degraded if it was previously online
			// If it's already degraded or offline, don't change status (might be deleted)
			var currentStatus string
			row := db.QueryRow(`SELECT status FROM agents WHERE agent_uid=? LIMIT 1`, agentUID)
			if err := row.Scan(&currentStatus); err == nil {
				if currentStatus == "online" {
					// Collector was online but now missing from EffectiveConfig - mark as degraded
					log.Printf("WARNING: Collector %s/%s (%s) missing from bridge EffectiveConfig - marking as degraded (may be deleted or crashed)",
						namespace, crdName, agentUID[:8])
					db.Exec(`UPDATE agents SET status='degraded', last_seen_at=NOW() WHERE agent_uid=?`, agentUID)
				} else if currentStatus == "degraded" {
					// Already degraded, just update timestamp
					db.Exec(`UPDATE agents SET last_seen_at=NOW() WHERE agent_uid=?`, agentUID)
				} else if currentStatus == "offline" {
					// Already offline - don't change, might be deleted
					// Just update timestamp to prevent cleanup
					db.Exec(`UPDATE agents SET last_seen_at=NOW() WHERE agent_uid=?`, agentUID)
				}
			}
		}
	}

	if onlineCount > 0 {
		log.Printf("✓ Updated heartbeat for %d collector(s) via bridge %s (all marked online)", onlineCount, bridgeInstanceUID[:8])
	}
}

// getCollectorModeFromCRD extracts the mode (deployment, daemonset, statefulset) from CRD YAML
// Returns the mode string, or empty string if not found or error
func getCollectorModeFromCRD(crdYAML string) string {
	if crdYAML == "" {
		return ""
	}

	var crd map[string]interface{}
	if err := yaml.Unmarshal([]byte(crdYAML), &crd); err != nil {
		return ""
	}

	if spec, ok := crd["spec"].(map[string]interface{}); ok {
		if mode, ok := spec["mode"].(string); ok && mode != "" {
			return strings.ToLower(mode)
		}
	}

	// Mode not specified - default is deployment
	return "deployment"
}

// getCollectorMode retrieves the mode (deployment, daemonset, statefulset) of an OpenTelemetryCollector CRD
// Returns the mode string, or empty string if not found or error
// DEPRECATED: Use getCollectorModeFromCRD instead - this function is kept for backward compatibility
func getCollectorMode(namespace, crdName string) string {
	// Without kubectl, we can't query Kubernetes directly
	// Try to get mode from stored CRD YAML in database
	db := mustDB()
	defer db.Close()

	var currentCRDYAML sql.NullString
	// Try to find collector by namespace/name pattern in labels
	rows, err := db.Query(`
		SELECT current_config_yaml FROM agents 
		WHERE JSON_EXTRACT(labels_json, '$."k8s.namespace"') = ? 
		  AND JSON_EXTRACT(labels_json, '$."k8s.crd_name"') = ?
		LIMIT 1
	`, namespace, crdName)
	if err != nil {
		return ""
	}
	defer rows.Close()

	if rows.Next() {
		if rows.Scan(&currentCRDYAML) == nil && currentCRDYAML.Valid {
			return getCollectorModeFromCRD(currentCRDYAML.String)
		}
	}

	// Mode not found - default to deployment (supports remote config)
	return "deployment"
}

// storeAgentMetrics processes OwnMetrics from OpAMP message
// OwnMetrics contains agent's internal metrics (CPU, memory, restarts, etc.)
// These are different from the telemetry data the agent collects and forwards

// storeAgentTelemetry extracts and stores all telemetry data from AgentToServer message
// Per OpAMP spec: https://opentelemetry.io/docs/specs/opamp/
// Note: Agents send telemetry (metrics/logs/traces) via their configured exporters, not directly via OpAMP.
// OpAMP is for agent management and reports: Health, RemoteConfigStatus, PipelineStatuses (via Health), etc.
func (m *OpampManager) storeAgentTelemetry(instanceUID string, message *protobufs.AgentToServer) {
	instanceUID = normalizeAgentUID(instanceUID)
	db := mustDB()
	defer db.Close()

	// Update last_seen_at immediately on every message to prevent false offline status
	// This ensures agents stay online as long as they're sending messages
	db.Exec(`UPDATE agents SET last_seen_at=NOW() WHERE agent_uid=?`, instanceUID)

	// Determine org_id from agent (default to 1)
	var orgID int64 = 1
	row := db.QueryRow(`SELECT org_id FROM agents WHERE agent_uid=? LIMIT 1`, instanceUID)
	_ = row.Scan(&orgID)

	// Extract Health status (ComponentHealth contains overall agent health and sub-component health)
	if message.Health != nil {
		healthy := message.Health.Healthy
		var lastError string
		if message.Health.LastError != "" {
			lastError = message.Health.LastError
		}

		// ComponentHealth may contain sub-components via ComponentHealthMap (e.g., pipelines)
		var subComponents []map[string]interface{}
		if len(message.Health.ComponentHealthMap) > 0 {
			for name, subcomp := range message.Health.ComponentHealthMap {
				if subcomp == nil {
					continue
				}
				subcompData := map[string]interface{}{
					"name":    name,
					"healthy": subcomp.Healthy,
				}
				if subcomp.LastError != "" {
					subcompData["last_error"] = subcomp.LastError
				}
				if subcomp.Status != "" {
					subcompData["status"] = subcomp.Status
				}
				subComponents = append(subComponents, subcompData)

				// Store pipeline statuses from sub-components
				// Pipeline names often indicate type (traces, metrics, logs)
				pipelineName := name
				if pipelineName == "" {
					pipelineName = "unknown"
				}

				pipelineType := "traces"
				if strings.Contains(strings.ToLower(pipelineName), "metric") {
					pipelineType = "metrics"
				} else if strings.Contains(strings.ToLower(pipelineName), "log") {
					pipelineType = "logs"
				}

				statusStr := "unknown"
				if subcomp.Healthy {
					statusStr = "healthy"
				} else {
					statusStr = "degraded"
				}

				errorMsg := subcomp.LastError
				_, _ = db.Exec(`
					INSERT INTO agent_pipeline_status (org_id, agent_uid, pipeline_name, pipeline_type, status, error_message, last_updated)
					VALUES (?, ?, ?, ?, ?, ?, NOW())
					ON DUPLICATE KEY UPDATE
						status = VALUES(status),
						error_message = VALUES(error_message),
						last_updated = NOW()
				`, orgID, instanceUID, pipelineName, pipelineType, statusStr, errorMsg)
			}
		}

		_, _ = db.Exec(`
			INSERT INTO agent_health_history (org_id, agent_uid, healthy, last_error, status_message, recorded_at)
			VALUES (?, ?, ?, ?, ?, NOW())
		`, orgID, instanceUID, healthy, lastError, fmt.Sprintf("Agent health: %v", healthy))

		// Update agent status based on health
		// Only mark as degraded if Health.Healthy is explicitly false
		// If Health.Healthy is true, mark as online
		// Default behavior: if agent is sending messages, it's online (connection-based)
		if !healthy {
			// Agent is connected but unhealthy - mark as degraded
			// Only do this if health is explicitly false (not just missing)
			var currentStatus string
			row := db.QueryRow(`SELECT status FROM agents WHERE agent_uid=? LIMIT 1`, instanceUID)
			if err := row.Scan(&currentStatus); err == nil {
				// Only mark as degraded if currently online (don't override offline)
				// This prevents marking agents offline that are already offline
				if currentStatus == "online" {
					status := "degraded"
					if lastError != "" {
						log.Printf("WARNING: Agent %s is unhealthy: %s", instanceUID[:8], lastError)
					} else {
						log.Printf("WARNING: Agent %s is unhealthy (no error message)", instanceUID[:8])
					}
					m.updateAgentStatus(instanceUID, status)
				}
			}
		} else {
			// Agent is healthy - ensure it's marked as online
			// Check current status first to avoid unnecessary updates
			var currentStatus string
			row := db.QueryRow(`SELECT status FROM agents WHERE agent_uid=? LIMIT 1`, instanceUID)
			if err := row.Scan(&currentStatus); err == nil {
				if currentStatus == "degraded" || currentStatus == "offline" {
					// Recover from degraded/offline to online
					log.Printf("✓ Agent %s recovered to healthy status", instanceUID[:8])
					m.updateAgentStatus(instanceUID, "online")
				}
			}
		}

		// Store as telemetry
		healthData, _ := json.Marshal(map[string]interface{}{
			"healthy":       healthy,
			"last_error":    lastError,
			"subcomponents": subComponents,
		})
		_, _ = db.Exec(`
			INSERT INTO agent_telemetry (org_id, agent_uid, telemetry_type, telemetry_data, reported_at)
			VALUES (?, ?, 'health', ?, NOW())
		`, orgID, instanceUID, string(healthData))
	}

	// Extract RemoteConfigStatus (status of remote config application)
	// REFERENCE ARCHITECTURE: Track desired vs effective config for drift detection
	if message.RemoteConfigStatus != nil {
		statusStr := message.RemoteConfigStatus.Status.String()
		hasRemoteConfig := len(message.RemoteConfigStatus.LastRemoteConfigHash) > 0
		effectiveHashStr := hex.EncodeToString(message.RemoteConfigStatus.LastRemoteConfigHash)
		errorMsg := message.RemoteConfigStatus.ErrorMessage

		// Log RemoteConfigStatus for debugging
		log.Printf("DEBUG: Agent %s RemoteConfigStatus: status=%s, has_config=%v, effective_hash=%s, error=%s",
			instanceUID, statusStr, hasRemoteConfig, effectiveHashStr, errorMsg)

		// Enhanced error detection for label issues
		if errorMsg != "" && strings.Contains(errorMsg, "opentelemetry.io/opamp-managed") {
			log.Printf("❌ LABEL ERROR DETECTED for agent %s: %s", instanceUID, errorMsg)
			log.Printf("   This error means the OpenTelemetryCollector CRD is missing or has the wrong label value.")
			log.Printf("   QUICK FIX: Run these commands to fix all collectors:")
			log.Printf("   kubectl label opentelemetrycollector <name> -n default opentelemetry.io/opamp-managed=opamp-bridge --overwrite")
			log.Printf("   Then restart the bridge: kubectl -n opentelemetry-operator-system rollout restart deployment/opamp-bridge-opamp-bridge")
		}

		// Enhanced error detection for DaemonSet webhook errors
		isDaemonSetError := errorMsg != "" && strings.Contains(strings.ToLower(errorMsg), "daemonset") && strings.Contains(errorMsg, "does not support modification")
		if isDaemonSetError {
			log.Printf("❌ DAEMONSET WEBHOOK ERROR DETECTED for agent %s: %s", instanceUID, errorMsg)
			log.Printf("   This error occurs when trying to update a DaemonSet collector via OpAMP Bridge.")
			log.Printf("   Known Issue: https://github.com/open-telemetry/opentelemetry-operator/issues/4481")
			log.Printf("   WORKAROUND: Use kubectl patch to update DaemonSet collectors:")
			log.Printf("   kubectl patch opentelemetrycollector <name> -n <namespace> --type=merge -p='{\"spec\":{\"config\":<config>}}'")
			log.Printf("   NOTE: This is a limitation of the OpAMP Bridge, not this server.")

			// CRITICAL: Check if this error is for a DIFFERENT collector than the one we pushed to
			// The bridge reports RemoteConfigStatus at bridge level, so if we pushed to collector A (non-DaemonSet)
			// but the bridge also manages collector B (DaemonSet), the bridge might report FAILED even though
			// collector A succeeded. We need to check if we pushed to a non-DaemonSet collector.
			// Check all collectors that have this desired_config_hash (the ones we recently pushed to)
			if effectiveHashStr != "" {
				checkDB := mustDB()
				// Find collectors that have this desired_config_hash (ones we pushed to)
				rows, err := checkDB.Query(`
					SELECT agent_uid, labels_json FROM agents 
					WHERE desired_config_hash = ? AND agent_uid != ?
					ORDER BY remote_config_status_at DESC
				`, effectiveHashStr, instanceUID)
				checkDB.Close()

				if err == nil {
					defer rows.Close()
					for rows.Next() {
						var collectorUID string
						var labelsJSON sql.NullString
						if rows.Scan(&collectorUID, &labelsJSON) == nil && labelsJSON.Valid {
							var labels map[string]string
							if json.Unmarshal([]byte(labelsJSON.String), &labels) == nil {
								collectorNamespace := labels["k8s.namespace"]
								collectorName := labels["k8s.crd_name"]
								// Check if this collector is DaemonSet
								if collectorNamespace != "" && collectorName != "" {
									mode := getCollectorMode(collectorNamespace, collectorName)
									isDaemonSet := (mode == "daemonset")

									// If we pushed to a non-DaemonSet collector but got a DaemonSet error,
									// this means the bridge tried to sync to all collectors (including DaemonSet)
									// The error is expected and shouldn't fail the push for the non-DaemonSet collector
									if !isDaemonSet {
										log.Printf("INFO: DaemonSet error detected, but config was pushed to non-DaemonSet collector %s/%s (%s)",
											collectorNamespace, collectorName, collectorUID[:8])
										log.Printf("  The bridge manages multiple collectors. The DaemonSet error is expected and doesn't affect the non-DaemonSet collector.")
										log.Printf("  Config push to %s/%s should be considered successful despite the DaemonSet error.",
											collectorNamespace, collectorName)
										// Don't mark this collector as degraded - the push succeeded
										// The DaemonSet error is a separate issue with a different collector
										// Reset the flag so we don't skip status update for this collector
										isDaemonSetError = false
										break // Found a non-DaemonSet collector we pushed to
									}
								}
							}
						}
					}
				}
			}
			// Continue processing but skip marking as degraded below if it's a DaemonSet error
		}

		// Update agents table with RemoteConfigStatus for drift detection
		// CRITICAL: If status is APPLIED and errorMsg is empty, clear the error field
		// This ensures successful configs don't leave stale error messages
		if effectiveHashStr != "" {
			_, _ = db.Exec(`
				UPDATE agents 
				SET effective_config_hash=?, 
				    remote_config_status=?,
				    remote_config_error=?,
				    remote_config_status_at=NOW()
				WHERE agent_uid=?
			`, effectiveHashStr, statusStr, errorMsg, instanceUID)
		} else {
			_, _ = db.Exec(`
				UPDATE agents 
				SET remote_config_status=?,
				    remote_config_error=?,
				    remote_config_status_at=NOW()
				WHERE agent_uid=?
			`, statusStr, errorMsg, instanceUID)
		}

		// Update agent status based on RemoteConfigStatus
		// If status is APPLIED with no error → mark as online (config successfully applied)
		// If status is not APPLIED or has errors → mark as degraded
		var currentStatusRC string
		statusRCRow := db.QueryRow(`SELECT status FROM agents WHERE agent_uid=? LIMIT 1`, instanceUID)
		if err := statusRCRow.Scan(&currentStatusRC); err == nil {
			if statusStr == "APPLIED" && errorMsg == "" {
				// Config successfully applied - mark as online if currently degraded or offline
				if currentStatusRC == "degraded" || currentStatusRC == "offline" {
					log.Printf("✓ Agent %s config successfully applied (status=APPLIED) - marking as online", instanceUID[:8])
					m.updateAgentStatus(instanceUID, "online")
				}
			} else if errorMsg != "" || statusStr != "APPLIED" {
				// Config has errors or is not APPLIED - mark as degraded
				// EXCEPTION: Don't mark as degraded for DaemonSet webhook errors (expected behavior)
				isDaemonSetError := strings.Contains(strings.ToLower(errorMsg), "daemonset") && strings.Contains(errorMsg, "does not support modification")
				if !isDaemonSetError {
					if currentStatusRC == "online" {
						log.Printf("WARNING: Agent %s RemoteConfigStatus error: status=%s, error=%s - marking as degraded", instanceUID[:8], statusStr, errorMsg)
						m.updateAgentStatus(instanceUID, "degraded")
					}
				} else {
					log.Printf("INFO: Agent %s RemoteConfigStatus error is DaemonSet-related (expected): status=%s, error=%s - NOT marking as degraded", instanceUID[:8], statusStr, errorMsg)
					log.Printf("  This is a known limitation. See: https://github.com/open-telemetry/opentelemetry-operator/issues/4481")
				}
			}
		}

		// Store in telemetry for historical tracking
		configStatusData, _ := json.Marshal(map[string]interface{}{
			"status":                  statusStr,
			"has_remote_config":       hasRemoteConfig,
			"last_remote_config_hash": effectiveHashStr,
			"error_message":           errorMsg,
		})
		_, _ = db.Exec(`
			INSERT INTO agent_telemetry (org_id, agent_uid, telemetry_type, telemetry_data, reported_at)
			VALUES (?, ?, 'health', ?, NOW())
		`, orgID, instanceUID, string(configStatusData))

		// Detect config drift (desired != effective)
		var desiredHash, currentEffectiveHash sql.NullString
		row := db.QueryRow(`SELECT desired_config_hash, effective_config_hash FROM agents WHERE agent_uid=?`, instanceUID)
		if err := row.Scan(&desiredHash, &currentEffectiveHash); err == nil {
			if desiredHash.Valid && currentEffectiveHash.Valid {
				if desiredHash.String != currentEffectiveHash.String {
					log.Printf("⚠️  CONFIG DRIFT DETECTED for agent %s: desired=%s, effective=%s",
						instanceUID, desiredHash.String, currentEffectiveHash.String)
				} else {
					log.Printf("✓ Config in sync for agent %s (desired=%s == effective=%s)",
						instanceUID, desiredHash.String, currentEffectiveHash.String)
				}
			}
		}
	} else {
		log.Printf("DEBUG: Agent %s has no RemoteConfigStatus (nil)", instanceUID)
	}

	// NOTE: OwnMetrics/OwnTraces/OwnLogs are not yet implemented in opamp-go v0.22.0
	// The protobuf message doesn't have these fields yet.
	// When agents report "ReportsOwnMetrics" capability, it means they CAN send metrics,
	// but in practice, agents expose metrics via Prometheus exporter (port 8888 by default)
	// rather than through OpAMP protocol.
	//
	// To view agent metrics:
	// 1. Ensure agent config has Prometheus exporter enabled (default in our config generator)
	// 2. Scrape metrics from agent's Prometheus endpoint (typically :8888/metrics)
	// 3. Configure Grafana to scrape these metrics or use a Prometheus data source
	//
	// The "ReportsOwnMetrics" capability is informational - it tells us the agent
	// supports reporting its own metrics, but the actual metrics come via exporters.
}

// cleanupStaleAgents marks agents as offline if they haven't sent heartbeat in 2 minutes
// Also deletes stale offline collectors older than 10 minutes (garbage collection)
func (m *OpampManager) cleanupStaleAgents() {
	db := mustDB()
	defer db.Close()

	// Mark agents as offline if they haven't sent heartbeat in 2 minutes
	result, err := db.Exec(`
		UPDATE agents 
		SET status = 'offline'
		WHERE status = 'online'
		  AND last_seen_at < DATE_SUB(NOW(), INTERVAL 2 MINUTE)
	`)
	if err != nil {
		log.Printf("ERROR: Failed to cleanup stale agents: %v", err)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected > 0 {
		log.Printf("✓ Marked %d stale agent(s) as offline (no heartbeat > 2 minutes)", rowsAffected)
	}

	// CRITICAL FIX #3: Garbage collection - delete stale offline collectors older than 24 hours
	// This removes ghost collectors that no longer exist (moved namespaces, deleted CRDs, etc.)
	deleteResult, err := db.Exec(`
		DELETE FROM agents
		WHERE status = 'offline'
		  AND last_seen_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
		  AND (
			-- Only delete collectors (those with k8s namespace/name), not standalone agents
			k8s_namespace IS NOT NULL 
			AND k8s_crd_name IS NOT NULL
		  )
	`)
	if err != nil {
		log.Printf("ERROR: Failed to cleanup stale offline collectors: %v", err)
		return
	}

	deleteRowsAffected, _ := deleteResult.RowsAffected()
	if deleteRowsAffected > 0 {
		log.Printf("✓ Deleted %d stale offline collector(s) (no heartbeat > 24 hours)", deleteRowsAffected)
	}

	// Cleanup stale offline bridges older than 24 hours
	bridgeDeleteResult, err := db.Exec(`
		DELETE FROM bridges
		WHERE status = 'offline'
		  AND last_seen_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
	`)
	if err != nil {
		log.Printf("ERROR: Failed to cleanup stale offline bridges: %v", err)
		return
	}

	bridgeDeleteRowsAffected, _ := bridgeDeleteResult.RowsAffected()
	if bridgeDeleteRowsAffected > 0 {
		log.Printf("✓ Deleted %d stale offline bridge(s) (no heartbeat > 24 hours)", bridgeDeleteRowsAffected)
	}
}

func (m *OpampManager) cleanupStaleBridges() {
	db := mustDB()
	defer db.Close()

	_, err := db.Exec(`
		UPDATE bridges
		SET status = 'offline'
		WHERE status = 'online'
		  AND last_seen_at < DATE_SUB(NOW(), INTERVAL 2 MINUTE)
	`)
	if err != nil {
		log.Printf("ERROR: Failed to cleanup stale bridges: %v", err)
	}
}

func updateBridgeHeartbeat(bridgeUID string) {
	db := mustDB()
	defer db.Close()

	normalized := normalizeAgentUID(bridgeUID)
	db.Exec(`UPDATE bridges SET last_seen_at=NOW(), status='online' WHERE bridge_uid=? OR bridge_uid=?`, bridgeUID, normalized)
}

// startCleanupWorker runs periodic cleanup of stale agents
func (m *OpampManager) startCleanupWorker() {
	ticker := time.NewTicker(30 * time.Second) // Run every 30 seconds
	go func() {
		for range ticker.C {
			m.cleanupStaleAgents()
			m.cleanupStaleBridges()
		}
	}()
	log.Printf("✓ Started agent cleanup worker (runs every 30 seconds, marks agents offline after 2 minutes of no heartbeat)")
}

func (m *OpampManager) Start(endpoint string, certFile, keyFile string) error {
	// Start cleanup worker
	m.startCleanupWorker()

	// Load TLS configuration if certificate and key files are provided
	var tlsConfig *tls.Config
	if certFile != "" && keyFile != "" {
		cert, err := tls.LoadX509KeyPair(certFile, keyFile)
		if err != nil {
			return fmt.Errorf("failed to load TLS certificate: %w", err)
		}

		// Verify files exist
		if _, err := os.Stat(certFile); os.IsNotExist(err) {
			return fmt.Errorf("certificate file not found: %s", certFile)
		}
		if _, err := os.Stat(keyFile); os.IsNotExist(err) {
			return fmt.Errorf("key file not found: %s", keyFile)
		}

		tlsConfig = &tls.Config{
			Certificates: []tls.Certificate{cert},
			MinVersion:   tls.VersionTLS12, // Require TLS 1.2 or higher
		}
		log.Printf("✓ TLS enabled - certificate: %s, key: %s", certFile, keyFile)
	} else {
		log.Printf("⚠️  TLS not enabled - WebSocket connections will use ws:// (insecure)")
	}

	settings := server.StartSettings{
		Settings: server.Settings{
			Callbacks: types.Callbacks{
				OnConnecting: func(request *http.Request) types.ConnectionResponse {
					log.Printf("OPAMP connection request from: %s", request.RemoteAddr)
					return types.ConnectionResponse{
						Accept: true,
						ConnectionCallbacks: types.ConnectionCallbacks{
							OnConnected: func(ctx context.Context, conn types.Connection) {
								log.Printf("OPAMP agent connected")
							},
							OnMessage: func(ctx context.Context, conn types.Connection, message *protobufs.AgentToServer) *protobufs.ServerToAgent {
								// DEBUG: Log all AgentToServer message fields (except metrics)
								log.Printf("========== AgentToServer Message DEBUG ==========")
								log.Printf("InstanceUid: length=%d, hex=%s", len(message.InstanceUid), hex.EncodeToString(message.InstanceUid))
								log.Printf("Capabilities: 0x%x (decimal: %d)", message.Capabilities, message.Capabilities)

								// AgentDescription
								if message.AgentDescription != nil {
									log.Printf("AgentDescription:")
									if message.AgentDescription.IdentifyingAttributes != nil {
										log.Printf("  IdentifyingAttributes (%d):", len(message.AgentDescription.IdentifyingAttributes))
										for i, attr := range message.AgentDescription.IdentifyingAttributes {
											val := ""
											if attr.Value != nil {
												val = attr.Value.GetStringValue()
											}
											log.Printf("    [%d] %s = %q", i, attr.Key, val)
										}
									} else {
										log.Printf("  IdentifyingAttributes: nil")
									}
									if message.AgentDescription.NonIdentifyingAttributes != nil {
										log.Printf("  NonIdentifyingAttributes (%d):", len(message.AgentDescription.NonIdentifyingAttributes))
										for i, attr := range message.AgentDescription.NonIdentifyingAttributes {
											if i < 50 { // Limit to first 50 to avoid log spam
												val := ""
												if attr.Value != nil {
													val = attr.Value.GetStringValue()
												}
												log.Printf("    [%d] %s = %q", i, attr.Key, val)
											}
										}
										if len(message.AgentDescription.NonIdentifyingAttributes) > 50 {
											log.Printf("    ... (%d more attributes)", len(message.AgentDescription.NonIdentifyingAttributes)-50)
										}
									} else {
										log.Printf("  NonIdentifyingAttributes: nil")
									}
								} else {
									log.Printf("AgentDescription: nil")
								}

								// Health
								if message.Health != nil {
									log.Printf("Health:")
									log.Printf("  Healthy: %v", message.Health.Healthy)
									log.Printf("  StartTimeUnixNano: %d", message.Health.StartTimeUnixNano)
									log.Printf("  StatusTimeUnixNano: %d", message.Health.StatusTimeUnixNano)
									log.Printf("  LastError: %q", message.Health.LastError)
									log.Printf("  Status: %q", message.Health.Status)
									if message.Health.ComponentHealthMap != nil {
										log.Printf("  ComponentHealthMap (%d entries):", len(message.Health.ComponentHealthMap))
										for key, health := range message.Health.ComponentHealthMap {
											log.Printf("    [%s] healthy=%v, startTime=%d, statusTime=%d, lastError=%q, status=%q",
												key, health.Healthy, health.StartTimeUnixNano, health.StatusTimeUnixNano, health.LastError, health.Status)
											if len(health.ComponentHealthMap) > 0 {
												log.Printf("      Sub-components (%d):", len(health.ComponentHealthMap))
												for subKey, subHealth := range health.ComponentHealthMap {
													log.Printf("        [%s] healthy=%v, lastError=%q", subKey, subHealth.Healthy, subHealth.LastError)
												}
											}
										}
									} else {
										log.Printf("  ComponentHealthMap: nil")
									}
								} else {
									log.Printf("Health: nil")
								}

								// RemoteConfigStatus
								if message.RemoteConfigStatus != nil {
									log.Printf("RemoteConfigStatus:")
									log.Printf("  Status: %s", message.RemoteConfigStatus.Status.String())
									log.Printf("  LastRemoteConfigHash: length=%d, hex=%s",
										len(message.RemoteConfigStatus.LastRemoteConfigHash),
										hex.EncodeToString(message.RemoteConfigStatus.LastRemoteConfigHash))
									log.Printf("  ErrorMessage: %q", message.RemoteConfigStatus.ErrorMessage)
								} else {
									log.Printf("RemoteConfigStatus: nil")
								}

								// EffectiveConfig
								if message.EffectiveConfig != nil {
									log.Printf("EffectiveConfig:")
									if message.EffectiveConfig.ConfigMap != nil && message.EffectiveConfig.ConfigMap.ConfigMap != nil {
										log.Printf("  ConfigMap (%d entries):", len(message.EffectiveConfig.ConfigMap.ConfigMap))
										for key, cfgFile := range message.EffectiveConfig.ConfigMap.ConfigMap {
											if cfgFile != nil {
												log.Printf("    [%s] contentType=%q, body_length=%d",
													key, cfgFile.ContentType, len(cfgFile.Body))
												// Log first 200 chars of body for debugging
												if len(cfgFile.Body) > 0 {
													previewLen := 200
													if len(cfgFile.Body) < previewLen {
														previewLen = len(cfgFile.Body)
													}
													log.Printf("      body_preview: %q", string(cfgFile.Body[:previewLen]))
												}
											} else {
												log.Printf("    [%s] nil", key)
											}
										}
									} else {
										log.Printf("  ConfigMap: nil")
									}
								} else {
									log.Printf("EffectiveConfig: nil")
								}

								// AgentIdentification (if server wants to change agent's InstanceUid)
								// Note: This field may not exist in all versions of the protobuf
								// if message.AgentIdentification != nil {
								// 	log.Printf("AgentIdentification: present")
								// } else {
								// 	log.Printf("AgentIdentification: nil")
								// }

								// ConnectionSettingsRequest
								if message.ConnectionSettingsRequest != nil {
									log.Printf("ConnectionSettingsRequest: present (not logging details)")
								} else {
									log.Printf("ConnectionSettingsRequest: nil")
								}

								// Note: PackagesAvailable, PackageStatuses, ServerErrorResponse may not be in AgentToServer
								// These are typically in ServerToAgent messages

								// Note: OwnMetrics, OwnTraces, OwnLogs are intentionally skipped (as requested)
								log.Printf("================================================")

								// Debug: Log incoming InstanceUid bytes
								log.Printf("DEBUG: Received AgentToServer - InstanceUid bytes length: %d, hex: %s, raw: %q",
									len(message.InstanceUid), hex.EncodeToString(message.InstanceUid), string(message.InstanceUid))

								// Convert instance UID bytes to string for reliable MySQL storage
								// This ensures we can store it even if it contains binary data
								bridgeInstanceUID := hex.EncodeToString(message.InstanceUid)
								// If it looks like a UUID (36 bytes = 36 chars with hyphens), try to extract it
								if len(message.InstanceUid) == 36 {
									if decoded := string(message.InstanceUid); isPrintable(decoded) {
										bridgeInstanceUID = decoded
										log.Printf("DEBUG: InstanceUid is UUID string format: %s", decoded)
									}
								}
								// Normalize bridge UID to consistent format (remove hyphens) for internal storage
								bridgeNormalizedUID := normalizeAgentUID(bridgeInstanceUID)
								// Store bridge connection - we'll use stable UIDs for collector CRDs later
								// Per OpAMP spec: ServerToAgent.InstanceUid must match agent's original InstanceUid EXACTLY
								m.conns[bridgeNormalizedUID] = &agentConnection{
									conn:        conn,
									instanceUID: bridgeNormalizedUID,
									originalUID: message.InstanceUid, // Store original bytes EXACTLY as received (critical for OpAMP spec)
								}
								log.Printf("DEBUG: Stored bridge connection - normalizedUID: %s, originalUID bytes length: %d", bridgeNormalizedUID, len(message.InstanceUid))
								updateBridgeHeartbeat(bridgeInstanceUID)
								// Start with bridge UID - will be replaced with stable UID if bridge pattern detected
								instanceUID := bridgeNormalizedUID

								// Extract labels from NonIdentifyingAttributes FIRST
								// This is where agents typically send service.name, service.version, etc.
								labels := make(map[string]string)
								var name, version string
								var collectorVersion string         // OpenTelemetry Collector version (e.g., "0.138.0")
								var k8sNamespace, k8sCRDName string // For bridge pattern: collector CRD identification
								var bridgeVersionFromCRD string     // Extract bridge version from its own CRD if available

								if message.AgentDescription != nil && message.AgentDescription.NonIdentifyingAttributes != nil {
									for _, attr := range message.AgentDescription.NonIdentifyingAttributes {
										if attr.Value != nil {
											val := attr.Value.GetStringValue()
											if val != "" {
												labels[attr.Key] = val
												// Extract name and version from labels (preferred source)
												if attr.Key == "service.name" {
													name = val
												}
												// service.version is application version, not collector version
												if attr.Key == "service.version" || attr.Key == "version" {
													version = val
												}
												// Extract OpenTelemetry Collector version
												// Collector typically sends version as "otelcol.version" or "otel.version"
												if attr.Key == "otelcol.version" || attr.Key == "otel.version" ||
													attr.Key == "collector.version" || attr.Key == "opentelemetry.collector.version" {
													collectorVersion = val
												}
												// Bridge pattern: Extract Kubernetes CRD identification
												if attr.Key == "k8s.namespace" {
													k8sNamespace = val
												}
												if attr.Key == "k8s.crd_name" || attr.Key == "k8s.crd.name" {
													k8sCRDName = val
												}
											}
										}
									}
								}

								// Check IdentifyingAttributes for collector version
								// OpenTelemetry Collector sends: service.name="otelcol-contrib" and service.version="0.138.0" in IdentifyingAttributes
								var collectorServiceName string
								if message.AgentDescription != nil && message.AgentDescription.IdentifyingAttributes != nil {
									for _, attr := range message.AgentDescription.IdentifyingAttributes {
										if attr.Value != nil {
											val := attr.Value.GetStringValue()
											if attr.Key == "service.name" {
												// Collector sends "otelcol-contrib", "otelcol", etc. here
												collectorServiceName = val
											}
											// When service.name is "otelcol-contrib" or similar, service.version is the collector version
											if (collectorServiceName == "otelcol-contrib" || collectorServiceName == "otelcol" ||
												collectorServiceName == "opentelemetry-collector" || collectorServiceName == "opentelemetry-collector-contrib") &&
												attr.Key == "service.version" && collectorVersion == "" {
												collectorVersion = val
											}
											// For OpAMP Bridge, extract version from service.version in IdentifyingAttributes
											if collectorServiceName == "io.opentelemetry.operator-opamp-bridge" {
												if attr.Key == "service.version" {
													version = val
													collectorVersion = val // Use same version for bridge
													log.Printf("DEBUG: OpAMP Bridge version extracted: %s", val)
												}
											}
											if version == "" && (attr.Key == "service.version" || attr.Key == "version") {
												version = val
											}
											if name == "" && (attr.Key == "service.name" || attr.Key == "service.instance.id") {
												name = val
											}
											// Also check for explicit collector version keys
											if collectorVersion == "" &&
												(attr.Key == "otelcol.version" || attr.Key == "otel.version" ||
													attr.Key == "collector.version" || attr.Key == "opentelemetry.collector.version") {
												collectorVersion = val
											}
										}
									}
								}

								// Store collector version in labels if found
								if collectorVersion != "" {
									labels["collector.version"] = collectorVersion
									// For OpenTelemetry Collector agents, prioritize collector version for display
									// but keep service.version in labels for reference
									// Use collector version as the main version displayed in UI
									if version == "" || version == "unknown" || version == "1.0.0" {
										version = collectorVersion
									}
								}

								// BRIDGE PATTERN: Generate stable InstanceUID for collector CRDs
								// If k8s.namespace and k8s.crd_name are present, generate stable UID from them
								// This ensures each collector CRD has a persistent identity even if the bridge pod restarts
								// Note: The bridge connection remains mapped to bridgeNormalizedUID, but we use stable UID for agent registration
								if k8sNamespace != "" && k8sCRDName != "" {
									// Generate stable InstanceUID: sha256("namespace/name")
									stableUIDInput := fmt.Sprintf("%s/%s", k8sNamespace, k8sCRDName)
									stableUIDHash := sha256.Sum256([]byte(stableUIDInput))
									stableUIDHex := hex.EncodeToString(stableUIDHash[:])

									// Use stable UID as the agent identifier for database storage
									instanceUID = normalizeAgentUID(stableUIDHex)
									log.Printf("BRIDGE PATTERN: Detected collector CRD - namespace=%s, crd_name=%s, stable_uid=%s, bridge_uid=%s",
										k8sNamespace, k8sCRDName, instanceUID, bridgeNormalizedUID)

									// Map stable UID to bridge connection for config pushes
									// When pushing config to a collector CRD (stable UID), we find the bridge connection
									// and use the bridge's original InstanceUID bytes for the OpAMP response
									if existingConn, exists := m.conns[instanceUID]; exists {
										// Update existing connection mapping
										existingConn.conn = conn
										existingConn.originalUID = message.InstanceUid // Update with latest bridge InstanceUID
										log.Printf("BRIDGE PATTERN: Updated connection mapping - stable_uid=%s -> bridge_uid=%s", instanceUID, bridgeNormalizedUID)
									} else {
										// Create new connection entry for this collector CRD
										// This allows us to push configs to specific collectors
										m.conns[instanceUID] = &agentConnection{
											conn:        conn,                // Same WebSocket connection as bridge
											instanceUID: instanceUID,         // Stable UID for this collector
											originalUID: message.InstanceUid, // Bridge's InstanceUID for OpAMP protocol
										}
										log.Printf("BRIDGE PATTERN: Created connection mapping - stable_uid=%s -> bridge_uid=%s", instanceUID, bridgeNormalizedUID)
									}

									// Set collector name from CRD name
									if name == "" || name == bridgeNormalizedUID {
										name = k8sCRDName
									}

									// Ensure required bridge pattern labels are set
									labels["deployment.type"] = "k8s"
									labels["otel.kind"] = "OpenTelemetryCollector"
									labels["k8s.namespace"] = k8sNamespace
									labels["k8s.crd_name"] = k8sCRDName
									labels["bridge.instance_uid"] = bridgeNormalizedUID // Track which bridge connection to use

									// Extract pool.size (replicas) if available
									if poolSize, ok := labels["pool.size"]; !ok || poolSize == "" {
										// Try to get from other label variations
										if replicas, ok := labels["replicas"]; ok && replicas != "" {
											labels["pool.size"] = replicas
										} else if replicas, ok := labels["k8s.replicas"]; ok && replicas != "" {
											labels["pool.size"] = replicas
										}
									}
								}

								// Final fallbacks
								if name == "" {
									name = instanceUID
								}
								// For OpAMP Bridge, ensure we have a version - check CRD status first, then labels
								if version == "" || version == "unknown" {
									if bridgeVersionFromCRD != "" {
										version = bridgeVersionFromCRD
									} else if collectorVersion != "" {
										version = collectorVersion
									} else if bridgeVersion, ok := labels["service.version"]; ok && bridgeVersion != "" {
										version = bridgeVersion
									} else {
										version = "unknown"
									}
								}
								if version == "" {
									version = "unknown"
								}

								// Extract OpAMP capabilities according to spec
								// Reference: https://opentelemetry.io/docs/specs/opamp/
								capabilities := make(map[string]interface{})

								// OpAMP spec defines Capabilities as a uint64 bitmask in AgentToServer message
								// In opamp-go, Capabilities is a direct uint64 field
								capFlags := []string{}
								flags := message.Capabilities

								// Always set ReportsStatus - it's REQUIRED by spec (Bit 0x00000001)
								// All agents MUST report status
								capFlags = append(capFlags, "ReportsStatus")
								capabilities["reports_status"] = true

								if flags != 0 {
									// Decode capability flags according to OpAMP spec (Section 5.2):
									// Bit 0 (0x00000001): ReportsStatus - REQUIRED, always set above

									// Bit 1 (0x00000002): AcceptsRemoteConfig
									if flags&0x2 != 0 {
										capFlags = append(capFlags, "AcceptsRemoteConfig")
										capabilities["accepts_remote_config"] = true
									}
									// Bit 2 (0x00000004): ReportsEffectiveConfig
									if flags&0x4 != 0 {
										capFlags = append(capFlags, "ReportsEffectiveConfig")
										capabilities["reports_effective_config"] = true
									}
									// Bit 3 (0x00000008): AcceptsPackages
									if flags&0x8 != 0 {
										capFlags = append(capFlags, "AcceptsPackages")
										capabilities["accepts_packages"] = true
									}
									// Bit 4 (0x00000010): ReportsPackageStatuses
									if flags&0x10 != 0 {
										capFlags = append(capFlags, "ReportsPackageStatuses")
										capabilities["reports_package_statuses"] = true
									}
									// Bit 5 (0x00000020): ReportsOwnTraces
									if flags&0x20 != 0 {
										capFlags = append(capFlags, "ReportsOwnTraces")
										capabilities["reports_own_traces"] = true
									}
									// Bit 6 (0x00000040): ReportsOwnMetrics
									if flags&0x40 != 0 {
										capFlags = append(capFlags, "ReportsOwnMetrics")
										capabilities["reports_own_metrics"] = true
									}
									// Bit 7 (0x00000080): ReportsOwnLogs
									if flags&0x80 != 0 {
										capFlags = append(capFlags, "ReportsOwnLogs")
										capabilities["reports_own_logs"] = true
									}
									// Bit 8 (0x00000100): AcceptsOpampConnectionSettings
									if flags&0x100 != 0 {
										capFlags = append(capFlags, "AcceptsOpampConnectionSettings")
										capabilities["accepts_opamp_connection_settings"] = true
									}
									// Bit 9 (0x00000200): AcceptsOtherConnectionSettings
									if flags&0x200 != 0 {
										capFlags = append(capFlags, "AcceptsOtherConnectionSettings")
										capabilities["accepts_other_connection_settings"] = true
									}
									// Bit 10 (0x00000400): AcceptsRestartCommand
									if flags&0x400 != 0 {
										capFlags = append(capFlags, "AcceptsRestartCommand")
										capabilities["accepts_restart_command"] = true
									}
									// Bit 11 (0x00000800): ReportsHealth
									if flags&0x800 != 0 {
										capFlags = append(capFlags, "ReportsHealth")
										capabilities["reports_health"] = true
									}
									// Bit 12 (0x00001000): ReportsRemoteConfigStatus
									if flags&0x1000 != 0 {
										capFlags = append(capFlags, "ReportsRemoteConfigStatus")
										capabilities["reports_remote_config"] = true
									}
									// Bit 13 (0x00002000): ReportsHeartbeat
									if flags&0x2000 != 0 {
										capFlags = append(capFlags, "ReportsHeartbeat")
										capabilities["reports_heartbeat"] = true
									}
									// Bit 14 (0x00004000): ReportsAvailableComponents
									if flags&0x4000 != 0 {
										capFlags = append(capFlags, "ReportsAvailableComponents")
										capabilities["reports_available_components"] = true
									}
									// Bit 15 (0x00008000): ReportsConnectionSettingsStatus
									if flags&0x8000 != 0 {
										capFlags = append(capFlags, "ReportsConnectionSettingsStatus")
										capabilities["reports_connection_settings_status"] = true
									}

									if len(capFlags) > 0 {
										capabilities["capabilities_flags"] = strings.Join(capFlags, ", ")
									}
									capabilities["capabilities_bits"] = flags
								}

								// Infer capabilities from message presence (even if capability bits aren't set)
								// If agent sends a message, it's effectively sending heartbeats
								if _, exists := capabilities["reports_heartbeat"]; !exists {
									capabilities["reports_heartbeat"] = true
									capFlags = append(capFlags, "ReportsHeartbeat")
								}

								// Also check if Health message is present - if so, agent has ReportsHealth capability
								if message.Health != nil {
									if _, exists := capabilities["reports_health"]; !exists {
										capabilities["reports_health"] = true
										capFlags = append(capFlags, "ReportsHealth")
									}
								}

								// Check if RemoteConfigStatus is present - if so, agent has ReportsRemoteConfigStatus capability
								if message.RemoteConfigStatus != nil {
									if _, exists := capabilities["reports_remote_config"]; !exists {
										capabilities["reports_remote_config"] = true
										capFlags = append(capFlags, "ReportsRemoteConfigStatus")
									}
								}

								// Check if AgentDescription with available components is present
								if message.AgentDescription != nil && message.AgentDescription.NonIdentifyingAttributes != nil {
									// Check if any component-related attributes are present
									for _, attr := range message.AgentDescription.NonIdentifyingAttributes {
										if strings.Contains(strings.ToLower(attr.Key), "component") ||
											strings.Contains(strings.ToLower(attr.Key), "receiver") ||
											strings.Contains(strings.ToLower(attr.Key), "processor") ||
											strings.Contains(strings.ToLower(attr.Key), "exporter") {
											if _, exists := capabilities["reports_available_components"]; !exists {
												capabilities["reports_available_components"] = true
												capFlags = append(capFlags, "ReportsAvailableComponents")
											}
											break
										}
									}
								}

								// For OpAMP Bridge: If it accepts remote config, it likely accepts other connection settings too
								// This is a reasonable inference for bridge implementations
								// CRITICAL: Identify bridges by ReportsEffectiveConfig capability, NOT by name
								isBridge := false
								if reportsEffectiveConfig, ok := capabilities["reports_effective_config"]; ok {
									if val, ok := reportsEffectiveConfig.(bool); ok && val {
										isBridge = true
									}
								}
								if isBridge {
									log.Printf("DEBUG: Detected OpAMP Bridge %s - inferring additional capabilities", instanceUID[:8])
									// Bridge implementations typically support these if they support remote config
									if capabilities["accepts_remote_config"] == true {
										// OpAMP Bridge typically supports connection settings management
										if _, exists := capabilities["accepts_opamp_connection_settings"]; !exists {
											capabilities["accepts_opamp_connection_settings"] = true
											capFlags = append(capFlags, "AcceptsOpampConnectionSettings")
											log.Printf("DEBUG: Inferred AcceptsOpampConnectionSettings for bridge")
										}
										if _, exists := capabilities["accepts_other_connection_settings"]; !exists {
											capabilities["accepts_other_connection_settings"] = true
											capFlags = append(capFlags, "AcceptsOtherConnectionSettings")
											log.Printf("DEBUG: Inferred AcceptsOtherConnectionSettings for bridge")
										}
										if _, exists := capabilities["reports_connection_settings_status"]; !exists {
											capabilities["reports_connection_settings_status"] = true
											capFlags = append(capFlags, "ReportsConnectionSettingsStatus")
											log.Printf("DEBUG: Inferred ReportsConnectionSettingsStatus for bridge")
										}
										// Bridges typically support restart commands for managed collectors
										if _, exists := capabilities["accepts_restart_command"]; !exists {
											capabilities["accepts_restart_command"] = true
											capFlags = append(capFlags, "AcceptsRestartCommand")
											log.Printf("DEBUG: Inferred AcceptsRestartCommand for bridge")
										}
									}

									// Explicitly mark unsupported capabilities as false for OpAMP Bridge
									// These are disabled in the CRD or not implemented in opamp-go v0.22.0
									if _, exists := capabilities["accepts_packages"]; !exists {
										capabilities["accepts_packages"] = false // Not supported - requires PackagesStateProvider
									}
									if _, exists := capabilities["reports_package_statuses"]; !exists {
										capabilities["reports_package_statuses"] = false // Not supported - requires PackagesStateProvider
									}
									if _, exists := capabilities["reports_own_traces"]; !exists {
										capabilities["reports_own_traces"] = false // Not implemented in opamp-go v0.22.0
									}
									if _, exists := capabilities["reports_own_metrics"]; !exists {
										capabilities["reports_own_metrics"] = false // Not implemented in opamp-go v0.22.0
									}
									if _, exists := capabilities["reports_own_logs"]; !exists {
										capabilities["reports_own_logs"] = false // Not implemented in opamp-go v0.22.0
									}

									// ReportsAvailableComponents - check if we already inferred it
									if _, exists := capabilities["reports_available_components"]; !exists {
										// If AgentDescription exists but no component attributes found, mark as false
										// Otherwise, it might be supported but not reported yet
										if message.AgentDescription != nil {
											// We already checked above, so if we get here, it's not supported
											capabilities["reports_available_components"] = false
										}
									}
								}

								// Update capabilities_flags if we added inferred capabilities
								if len(capFlags) > 0 {
									capabilities["capabilities_flags"] = strings.Join(capFlags, ", ")
								}

								// Also extract component availability from NonIdentifyingAttributes
								// (Some agents report available components here)
								if message.AgentDescription != nil && message.AgentDescription.NonIdentifyingAttributes != nil {
									availableComponents := []string{}
									for _, attr := range message.AgentDescription.NonIdentifyingAttributes {
										key := strings.ToLower(attr.Key)
										if (strings.Contains(key, "component") || strings.Contains(key, "receiver") ||
											strings.Contains(key, "processor") || strings.Contains(key, "exporter")) &&
											attr.Value != nil {
											val := attr.Value.GetStringValue()
											if val != "" {
												availableComponents = append(availableComponents, attr.Key+":"+val)
											}
										}
									}
									if len(availableComponents) > 0 {
										capabilities["available_components"] = strings.Join(availableComponents, ", ")
									}

									// Extract opamp.version if present
									for _, attr := range message.AgentDescription.NonIdentifyingAttributes {
										if attr.Key == "opamp.version" && attr.Value != nil {
											capabilities["opamp_version"] = attr.Value.GetStringValue()
											break
										}
									}

									// Debug: Log all attributes to understand what Collector sends
									log.Printf("DEBUG: Agent %s NonIdentifyingAttributes: %d items", instanceUID, len(message.AgentDescription.NonIdentifyingAttributes))
									for i, attr := range message.AgentDescription.NonIdentifyingAttributes {
										if i < 15 { // Log first 15 attributes
											attrVal := ""
											if attr.Value != nil {
												attrVal = attr.Value.GetStringValue()
											}
											log.Printf("DEBUG:   [%d] %s = %q", i, attr.Key, attrVal)
										}
									}
								}

								// Debug: Log IdentifyingAttributes too
								if message.AgentDescription != nil && message.AgentDescription.IdentifyingAttributes != nil {
									log.Printf("DEBUG: Agent %s IdentifyingAttributes: %d items", instanceUID, len(message.AgentDescription.IdentifyingAttributes))
									for i, attr := range message.AgentDescription.IdentifyingAttributes {
										attrVal := ""
										if attr.Value != nil {
											attrVal = attr.Value.GetStringValue()
										}
										log.Printf("DEBUG:   [%d] %s = %q", i, attr.Key, attrVal)
									}
								}

								// Store basic agent info
								capabilities["agent_type"] = "otel-collector"
								if _, ok := capabilities["opamp_version"]; !ok {
									capabilities["opamp_version"] = "1.0"
								}

								// Extract current configuration from agent if available
								var currentConfig string
								var currentConfigHash string
								if message.EffectiveConfig != nil && message.EffectiveConfig.ConfigMap != nil {
									// OpAMP sends effective config as a map of config files
									// Access ConfigMap correctly - it's a map[string]*AgentConfigFile
									if cfgMap := message.EffectiveConfig.ConfigMap.ConfigMap; cfgMap != nil {
										// DEBUG: Log all keys in EffectiveConfig to understand what bridge sends
										allKeys := make([]string, 0, len(cfgMap))
										for k := range cfgMap {
											allKeys = append(allKeys, k)
										}
										log.Printf("DEBUG: Agent %s EffectiveConfig contains %d entries with keys: %v", instanceUID, len(cfgMap), allKeys)

										// For OpAMP Bridge: it sends collector CRD YAMLs with keys like "namespace/name"
										// Extract bridge version from collector CRDs it manages (bridges typically use same version as collectors)
										// Try first collector CRD to get version
										for configKey, cfgFile := range cfgMap {
											if cfgFile != nil && cfgFile.Body != nil && len(cfgFile.Body) > 0 {
												// Only check collector CRDs (namespace/name format)
												if strings.Contains(configKey, "/") && !strings.Contains(configKey, ".") {
													var crdYAML map[string]interface{}
													if err := yaml.Unmarshal(cfgFile.Body, &crdYAML); err == nil {
														// Extract version from collector CRD status (same as we do for collectors)
														if status, ok := crdYAML["status"].(map[string]interface{}); ok {
															if v, ok := status["version"].(string); ok && v != "" {
																bridgeVersionFromCRD = v
																log.Printf("DEBUG: Extracted bridge version from collector CRD status: %s (from %s)", bridgeVersionFromCRD, configKey)
																break
															} else if vNum, ok := status["version"].(float64); ok {
																bridgeVersionFromCRD = fmt.Sprintf("%.1f", vNum)
																// Remove trailing .0 if present
																if strings.HasSuffix(bridgeVersionFromCRD, ".0") {
																	bridgeVersionFromCRD = strings.TrimSuffix(bridgeVersionFromCRD, ".0")
																}
																log.Printf("DEBUG: Extracted bridge version from collector CRD status: %s (from %s)", bridgeVersionFromCRD, configKey)
																break
															}
														}
														// Fallback: try spec.image from collector CRD
														if bridgeVersionFromCRD == "" {
															if spec, ok := crdYAML["spec"].(map[string]interface{}); ok {
																if image, ok := spec["image"].(string); ok && image != "" {
																	if parts := strings.Split(image, ":"); len(parts) == 2 {
																		tag := parts[1]
																		if strings.Contains(tag, ".") && strings.ContainsAny(tag, "0123456789") {
																			bridgeVersionFromCRD = tag
																			log.Printf("DEBUG: Extracted bridge version from collector CRD image: %s (from %s)", bridgeVersionFromCRD, configKey)
																			break
																		}
																	}
																}
															}
														}
													}
												}
											}
										}

										// For OpAMP Bridge: it sends CRD YAMLs with keys like "namespace/name"
										// For direct collectors: config is under empty string key or "collector.yaml"
										// We need to extract spec.config from CRD YAMLs
										extractedConfig := ""
										if cfgFile, ok := cfgMap[""]; ok && cfgFile != nil && cfgFile.Body != nil {
											extractedConfig = extractCollectorConfigFromCRD(cfgFile.Body, instanceUID)
										} else if cfgFile, ok := cfgMap["collector.yaml"]; ok && cfgFile != nil && cfgFile.Body != nil {
											extractedConfig = extractCollectorConfigFromCRD(cfgFile.Body, instanceUID)
										} else {
											// Try any key (for bridge, this might be a CRD)
											for key, cfgFile := range cfgMap {
												if cfgFile != nil && cfgFile.Body != nil {
													// If key looks like namespace/name, it's a CRD - extract spec.config
													if strings.Contains(key, "/") && !strings.Contains(key, ".") {
														extractedConfig = extractCollectorConfigFromCRD(cfgFile.Body, instanceUID)
													} else {
														// Direct collector config
														extractedConfig = string(cfgFile.Body)
													}
													if extractedConfig != "" {
														break
													}
												}
											}
										}
										if extractedConfig != "" {
											currentConfig = extractedConfig
											// Calculate SHA256 hash for comparison (64 hex characters)
											hash := sha256.Sum256([]byte(currentConfig))
											currentConfigHash = hex.EncodeToString(hash[:])
											log.Printf("Agent %s reported effective config (%d bytes, hash: %s)", instanceUID, len(currentConfig), currentConfigHash)
										}

										// DISCOVER COLLECTORS FROM EFFECTIVECONFIG (Bridge Pattern)
										// REMOVED: Old discovery code that called registerAgent with bridge capabilities
										// This caused collectors to be rejected as bridges.
										// Collector discovery is now handled by updateDiscoveredCollectorsHealth()
										// which runs AFTER bridge detection and does direct UPSERTs without calling registerAgent.
										// This old code is kept commented for reference but should never execute.
										// The new flow:
										// 1. Bridge connects → detected by reports_effective_config capability
										// 2. Bridge registered via registerBridge() → stored in bridges table
										// 3. updateDiscoveredCollectorsHealth() called → UPSERTs collectors directly to agents table
										// 4. No registerAgent() call for discovered collectors → avoids capability check rejection
										log.Printf("DEBUG: Skipping old discovery code - collectors will be discovered via updateDiscoveredCollectorsHealth() after bridge detection")
									} else {
										log.Printf("DEBUG: Agent %s EffectiveConfig is nil or empty - cannot discover collectors", instanceUID)
									}
								} else {
									// Check if this is a bridge that claims ReportsEffectiveConfig capability
									// CRITICAL: Identify bridges by capability, NOT by name pattern
									isBridge := false
									if reportsEffectiveConfig, ok := capabilities["reports_effective_config"]; ok {
										if val, ok := reportsEffectiveConfig.(bool); ok && val {
											isBridge = true
										}
									}
									if isBridge {
										// Check capabilities from database
										capDB := mustDB()
										var capabilitiesJSON sql.NullString
										capRow := capDB.QueryRow(`SELECT capabilities_json FROM agents WHERE agent_uid=? LIMIT 1`, instanceUID)
										if capRow.Scan(&capabilitiesJSON) == nil && capabilitiesJSON.Valid {
											var caps map[string]interface{}
											if json.Unmarshal([]byte(capabilitiesJSON.String), &caps) == nil {
												if reportsEffectiveConfig, ok := caps["reports_effective_config"].(bool); ok && reportsEffectiveConfig {
													log.Printf("WARNING: Bridge %s (%s) claims ReportsEffectiveConfig capability but is NOT sending EffectiveConfig messages. Collectors cannot be discovered until bridge sends EffectiveConfig.", instanceUID[:8], name)
													log.Printf("  To fix: Configure the OpAMP bridge to actually send EffectiveConfig in its AgentToServer messages.")
												}
											}
										}
										capDB.Close()
									} else {
										log.Printf("DEBUG: Agent %s did not send EffectiveConfig - cannot discover collectors yet", instanceUID)
									}
								}

								// Extract and store agent telemetry according to OpAMP spec
								// Reference: https://opentelemetry.io/docs/specs/opamp/
								m.storeAgentTelemetry(instanceUID, message)

								// CRITICAL FIX #1: Detect OpAMP Bridge EARLY and register in bridges table, NOT agents table
								// Bridges are NOT collectors - they manage collectors
								isOpAMPBridge := false
								if reportsEffectiveConfig, ok := capabilities["reports_effective_config"]; ok {
									if val, ok := reportsEffectiveConfig.(bool); ok && val {
										isOpAMPBridge = true
									}
								}

								if isOpAMPBridge {
									// This is a bridge - register in bridges table, NOT agents table
									if err := m.registerBridge(instanceUID, name, version, labels, capabilities); err != nil {
										log.Printf("Failed to register bridge: %v", err)
									} else {
										log.Printf("✓ Registered OpAMP Bridge: %s (name: %s, version: %s)", instanceUID[:8], name, version)
									}

									// Get bridge connection for mapping discovered collectors
									bridgeConn, bridgeConnExists := m.conns[instanceUID]
									if !bridgeConnExists {
										bridgeConn = &agentConnection{
											conn:        conn,
											instanceUID: instanceUID,
											originalUID: message.InstanceUid,
										}
										m.conns[instanceUID] = bridgeConn
									}
									// Update discovered collectors health (this will UPSERT collectors from EffectiveConfig)
									m.updateDiscoveredCollectorsHealth(instanceUID, message, bridgeConn.conn)
								} else {
									// This is a collector/agent - register in agents table
									// Auto-register agent in database with current config
									// This also updates last_seen_at, ensuring agent stays online
									if err := m.registerAgent(instanceUID, name, version, labels, capabilities, currentConfig, currentConfigHash); err != nil {
										log.Printf("Failed to register agent: %v", err)
									} else {
										// Ensure agent is marked online and last_seen_at is updated
										m.updateAgentStatus(instanceUID, "online")
									}
								}

								// Check for pending configs and send them automatically when agent connects/reconnects
								m.sendPendingConfigs(instanceUID, conn)

								log.Printf("Received OPAMP message from agent: %s (name: %s, version: %s)", instanceUID, name, version)
								if len(capabilities) > 0 {
									capJSON, _ := json.Marshal(capabilities)
									log.Printf("Agent %s capabilities (after inference): %s", instanceUID, string(capJSON))
								}
								// Debug: Log raw capability bits and message presence
								log.Printf("DEBUG: Agent %s raw capabilities bits: 0x%x (decimal: %d)", instanceUID, flags, flags)
								log.Printf("DEBUG: Agent %s message fields - Health: %v, RemoteConfigStatus: %v, EffectiveConfig: %v",
									instanceUID, message.Health != nil, message.RemoteConfigStatus != nil, message.EffectiveConfig != nil)

								// Return ServerToAgent with server capabilities enabled
								// According to OpAMP spec (https://opentelemetry.io/docs/specs/opamp/):
								// Server must advertise its capabilities in the ServerToAgent message
								// Capabilities bits (from spec Section 5.3):
								// Bit 0 (0x1): AcceptsRemoteConfig
								// Bit 1 (0x2): OffersRemoteConfig
								// Bit 2 (0x4): AcceptsRestartCommand
								// Bit 3 (0x8): OffersRestartCommand
								// Bit 4 (0x10): AcceptsOpampConnectionSettings
								// Bit 5 (0x20): OffersOpampConnectionSettings
								// Bit 6 (0x40): AcceptsOtherConnectionSettings
								// Bit 7 (0x80): OffersOtherConnectionSettings
								// Bit 8 (0x100): AcceptsPackages
								// Bit 9 (0x200): OffersPackages
								// Bit 10 (0x400): AcceptsOwnMetrics
								// Bit 11 (0x800): OffersOwnMetrics
								// Bit 12 (0x1000): AcceptsOwnTraces
								// Bit 13 (0x2000): OffersOwnTraces
								// Bit 14 (0x4000): AcceptsOwnLogs
								// Bit 15 (0x8000): OffersOwnLogs
								//
								// We support: Remote config (offer & accept), Restart (offer & accept),
								// OpAMP connection settings (offer & accept), and OwnMetrics/OwnTraces/OwnLogs
								serverCapabilities := uint64(0x0)
								serverCapabilities |= 0x1    // AcceptsRemoteConfig
								serverCapabilities |= 0x2    // OffersRemoteConfig
								serverCapabilities |= 0x4    // AcceptsRestartCommand
								serverCapabilities |= 0x8    // OffersRestartCommand
								serverCapabilities |= 0x10   // AcceptsOpampConnectionSettings
								serverCapabilities |= 0x20   // OffersOpampConnectionSettings
								serverCapabilities |= 0x400  // AcceptsOwnMetrics (tell agent we want to receive its metrics)
								serverCapabilities |= 0x800  // OffersOwnMetrics (we can send metrics to agent)
								serverCapabilities |= 0x1000 // AcceptsOwnTraces
								serverCapabilities |= 0x2000 // OffersOwnTraces
								serverCapabilities |= 0x4000 // AcceptsOwnLogs
								serverCapabilities |= 0x8000 // OffersOwnLogs

								// Check for pending config to send immediately (like Python server does)
								// This ensures configs are delivered as soon as agent connects
								var remoteConfig *protobufs.AgentRemoteConfig
								// Check if there's a pending config for this agent (connection already stored above)
								db := mustDB()
								var pendingConfig sql.NullString
								var pendingHash sql.NullString
								err := db.QueryRow(`
									SELECT config_yaml, config_hash 
									FROM pending_config_queue 
									WHERE agent_uid=? AND sent_at IS NULL
									LIMIT 1
								`, instanceUID).Scan(&pendingConfig, &pendingHash)
								db.Close()

								if err == nil && pendingConfig.Valid && pendingConfig.String != "" {
									configYAML := pendingConfig.String
									hashBytes := sha256.Sum256([]byte(configYAML))

									// Detect if this is a Kubernetes agent from message labels and IdentifyingAttributes
									isKubernetes := false
									// Check IdentifyingAttributes for OpAMP Bridge service name
									if message.AgentDescription != nil && message.AgentDescription.IdentifyingAttributes != nil {
										for _, attr := range message.AgentDescription.IdentifyingAttributes {
											if attr.Value != nil {
												val := attr.Value.GetStringValue()
												if attr.Key == "service.name" &&
													(strings.Contains(strings.ToLower(val), "io.opentelemetry.operator-opamp-bridge") ||
														strings.Contains(strings.ToLower(val), "operator-opamp-bridge") ||
														strings.Contains(strings.ToLower(val), "opamp-bridge")) {
													isKubernetes = true
													log.Printf("DEBUG: Detected OpAMP Bridge from IdentifyingAttributes service.name: %s", val)
													break
												}
											}
										}
									}
									// Check NonIdentifyingAttributes for Kubernetes indicators
									if !isKubernetes && message.AgentDescription != nil && message.AgentDescription.NonIdentifyingAttributes != nil {
										for _, attr := range message.AgentDescription.NonIdentifyingAttributes {
											if attr.Value != nil {
												val := attr.Value.GetStringValue()
												if attr.Key == "deployment.type" && (val == "kubernetes" || val == "k8s") {
													isKubernetes = true
													log.Printf("DEBUG: Detected Kubernetes from deployment.type: %s", val)
													break
												}
												if attr.Key == "kubernetes.namespace" || attr.Key == "k8s.namespace" {
													isKubernetes = true
													log.Printf("DEBUG: Detected Kubernetes from namespace label: %s", attr.Key)
													break
												}
											}
										}
									}

									// Build ConfigMap with correct key based on agent type
									keyNamespace := k8sNamespace
									if keyNamespace == "" {
										if val, ok := labels["k8s.namespace"]; ok && val != "" {
											keyNamespace = val
										} else if val, ok := labels["kubernetes.namespace"]; ok && val != "" {
											keyNamespace = val
										}
									}
									keyName := k8sCRDName
									if keyName == "" {
										keyName = name
									}
									configKey, metadataMissing := determineConfigMapKey(isKubernetes, keyNamespace, keyName)
									if metadataMissing {
										log.Printf("ERROR: Unable to determine precise config key for pending config (agent %s): missing metadata; falling back to 'collector.yaml'", instanceUID)
									}
									configMap := map[string]*protobufs.AgentConfigFile{
										configKey: &protobufs.AgentConfigFile{
											Body:        []byte(configYAML),
											ContentType: "text/yaml",
										},
									}
									if isKubernetes {
										log.Printf("DEBUG: Pending config for Kubernetes agent - using key '%s'", configKey)
									} else {
										log.Printf("DEBUG: Pending config for Docker/VM agent - using key '%s'", configKey)
									}

									remoteConfig = &protobufs.AgentRemoteConfig{
										Config: &protobufs.AgentConfigMap{
											ConfigMap: configMap,
										},
										ConfigHash: hashBytes[:],
									}
									log.Printf("DEBUG: Sending pending config to newly connected agent %s (hash: %s)", instanceUID, pendingHash.String)
								}

								response := &protobufs.ServerToAgent{
									InstanceUid:  message.InstanceUid, // Use the agent's InstanceUid from the message (per spec)
									Capabilities: serverCapabilities,
								}

								// Add remote config if we have one pending
								if remoteConfig != nil {
									response.RemoteConfig = remoteConfig
								}

								return response
							},
							OnConnectionClose: func(conn types.Connection) {
								// Find connection by iterating
								for uid, ac := range m.conns {
									if ac.conn == conn {
										log.Printf("OPAMP agent disconnected: %s", uid)
										delete(m.conns, uid)
										m.updateAgentStatus(uid, "offline")
										break
									}
								}
							},
						},
					}
				},
			},
		},
		ListenEndpoint: endpoint,
		ListenPath:     "/v1/opamp", // Use /v1/opamp like Python server for compatibility
		TLSConfig:      tlsConfig,   // Enable WSS if TLS config is provided
	}

	protocol := "ws://"
	if tlsConfig != nil {
		protocol = "wss://"
	}
	log.Printf("Starting OPAMP server on %s%s/v1/opamp", protocol, endpoint)
	err := m.server.Start(settings)
	if err != nil {
		log.Printf("ERROR: OPAMP server Start() failed: %v", err)
		return err
	}
	log.Printf("OPAMP server Start() completed successfully - listening on %s/v1/opamp (WebSocket on separate port)", endpoint)
	return nil
}

func (m *OpampManager) PushConfig(agentUID string, configYAML string, performedBy string) error {
	// Validate config
	if configYAML == "" || strings.TrimSpace(configYAML) == "" {
		return fmt.Errorf("config YAML cannot be empty")
	}

	// Normalize agent UID for consistent lookup
	agentUID = normalizeAgentUID(agentUID)

	// Get collector info from database
	var collectorNamespace, collectorName string
	var currentCRDYAML sql.NullString
	db := mustDB()
	var labelsJSON sql.NullString
	db.QueryRow(`SELECT labels_json, current_config_yaml FROM agents WHERE agent_uid=? LIMIT 1`, agentUID).Scan(&labelsJSON, &currentCRDYAML)
	db.Close()

	if labelsJSON.Valid && labelsJSON.String != "" {
		var labels map[string]string
		if json.Unmarshal([]byte(labelsJSON.String), &labels) == nil {
			collectorNamespace = labels["k8s.namespace"]
			collectorName = labels["k8s.crd_name"]
		}
	}

	// Check if collector is DaemonSet mode
	isDaemonSet := false
	if collectorNamespace != "" && collectorName != "" {
		// Extract mode from stored CRD YAML if available
		if currentCRDYAML.Valid && currentCRDYAML.String != "" {
			mode := getCollectorModeFromCRD(currentCRDYAML.String)
			if mode == "daemonset" {
				isDaemonSet = true
			}
		} else {
			// Fallback: try to get from database by labels
			mode := getCollectorMode(collectorNamespace, collectorName)
			if mode == "daemonset" {
				isDaemonSet = true
			}
		}
	}

	// CRITICAL: Block config pushes to DaemonSet collectors via OpAMP Bridge
	// DaemonSet collectors cannot be updated via OpAMP Bridge due to operator webhook restrictions
	// See: https://github.com/open-telemetry/opentelemetry-operator/issues/4481
	if isDaemonSet {
		log.Printf("ERROR: Cannot push config to DaemonSet collector %s/%s via OpAMP Bridge", collectorNamespace, collectorName)
		log.Printf("  Reason: Operator webhook blocks DaemonSet updates (issue #4481)")
		log.Printf("  Workaround: Use 'kubectl patch opentelemetrycollector %s -n %s --type=merge -p='{\"spec\":{\"config\":<config>}}'", collectorName, collectorNamespace)
		return fmt.Errorf("cannot push config to DaemonSet collector %s/%s via OpAMP Bridge: operator webhook blocks DaemonSet updates. Use kubectl patch instead. See https://github.com/open-telemetry/opentelemetry-operator/issues/4481", collectorNamespace, collectorName)
	}

	// For non-DaemonSet collectors: Get existing CRD from bridge, preserve all fields, update only spec.config
	if collectorNamespace != "" && collectorName != "" {
		// CRITICAL: Ensure metadata.name, metadata.namespace, and opamp-managed label are correctly set
		if currentCRDYAML.Valid && currentCRDYAML.String != "" {
			var existingCRD map[string]interface{}
			if err := yaml.Unmarshal([]byte(currentCRDYAML.String), &existingCRD); err == nil {
				// Extract new pipeline config
				extractedConfig := extractCollectorConfigFromCRD([]byte(configYAML), agentUID)
				if extractedConfig == "" || extractedConfig == configYAML {
					extractedConfig = configYAML
				}

				var newConfigMap map[string]interface{}
				if err := yaml.Unmarshal([]byte(extractedConfig), &newConfigMap); err != nil {
					return fmt.Errorf("failed to parse config YAML for collector %s/%s: %v", collectorNamespace, collectorName, err)
				}

				if len(newConfigMap) == 0 {
					return fmt.Errorf("parsed config is empty for collector %s/%s", collectorNamespace, collectorName)
				}

				// Ensure metadata exists
				if metadata, ok := existingCRD["metadata"].(map[string]interface{}); ok {
					metadata["name"] = collectorName
					metadata["namespace"] = collectorNamespace
					if labelsMap, ok := metadata["labels"].(map[string]interface{}); ok {
						if val, ok := labelsMap["opentelemetry.io/opamp-managed"].(string); !ok || val == "" {
							bridgeName := "true"
							if labelsJSON.Valid && labelsJSON.String != "" {
								var labelsMap2 map[string]string
								if json.Unmarshal([]byte(labelsJSON.String), &labelsMap2) == nil {
									if bridgeUID, ok := labelsMap2["bridge.instance_uid"]; ok && bridgeUID != "" {
										bridgeDB := mustDB()
										var bridgeNameFromDB sql.NullString
										bridgeDB.QueryRow(`SELECT name FROM agents WHERE agent_uid=? LIMIT 1`, normalizeAgentUID(bridgeUID)).Scan(&bridgeNameFromDB)
										bridgeDB.Close()
										if bridgeNameFromDB.Valid && bridgeNameFromDB.String != "" {
											bridgeName = bridgeNameFromDB.String
										}
									}
								}
							}
							labelsMap["opentelemetry.io/opamp-managed"] = bridgeName
						}
					} else {
						metadata["labels"] = map[string]interface{}{"opentelemetry.io/opamp-managed": "true"}
					}
				} else {
					existingCRD["metadata"] = map[string]interface{}{
						"name":      collectorName,
						"namespace": collectorNamespace,
						"labels":    map[string]interface{}{"opentelemetry.io/opamp-managed": "true"},
					}
				}

				// Update spec.config
				if spec, ok := existingCRD["spec"].(map[string]interface{}); ok {
					spec["config"] = newConfigMap
				} else {
					existingCRD["spec"] = map[string]interface{}{"config": newConfigMap}
				}

				// Marshal back to YAML
				if crdYAML, err := yaml.Marshal(existingCRD); err != nil {
					return fmt.Errorf("failed to marshal CRD YAML for collector %s/%s: %v", collectorNamespace, collectorName, err)
				} else {
					configYAML = string(crdYAML)
				}
			} else {
				// Existing CRD parse failed - create new CRD from config
				var newConfigMap map[string]interface{}
				if err := yaml.Unmarshal([]byte(configYAML), &newConfigMap); err != nil {
					return fmt.Errorf("failed to parse config YAML for collector %s/%s: %v", collectorNamespace, collectorName, err)
				}

				// Create full CRD structure
				bridgeName := "true"
				if labelsJSON.Valid && labelsJSON.String != "" {
					var labelsMap map[string]string
					if json.Unmarshal([]byte(labelsJSON.String), &labelsMap) == nil {
						if bridgeUID, ok := labelsMap["bridge.instance_uid"]; ok && bridgeUID != "" {
							bridgeDB := mustDB()
							var bridgeNameFromDB sql.NullString
							bridgeDB.QueryRow(`SELECT name FROM agents WHERE agent_uid=? LIMIT 1`, normalizeAgentUID(bridgeUID)).Scan(&bridgeNameFromDB)
							bridgeDB.Close()
							if bridgeNameFromDB.Valid && bridgeNameFromDB.String != "" {
								bridgeName = bridgeNameFromDB.String
							}
						}
					}
				}

				newCRD := map[string]interface{}{
					"apiVersion": "opentelemetry.io/v1alpha1",
					"kind":       "OpenTelemetryCollector",
					"metadata": map[string]interface{}{
						"name":      collectorName,
						"namespace": collectorNamespace,
						"labels":    map[string]interface{}{"opentelemetry.io/opamp-managed": bridgeName},
					},
					"spec": map[string]interface{}{
						"config": newConfigMap,
					},
				}

				if crdYAML, err := yaml.Marshal(newCRD); err != nil {
					return fmt.Errorf("failed to marshal new CRD YAML for collector %s/%s: %v", collectorNamespace, collectorName, err)
				} else {
					configYAML = string(crdYAML)
				}
			}
		} else {
			// No existing CRD - create new CRD from config
			var newConfigMap map[string]interface{}
			if err := yaml.Unmarshal([]byte(configYAML), &newConfigMap); err != nil {
				return fmt.Errorf("failed to parse config YAML for collector %s/%s: %v", collectorNamespace, collectorName, err)
			}

			bridgeName := "true"
			if labelsJSON.Valid && labelsJSON.String != "" {
				var labelsMap map[string]string
				if json.Unmarshal([]byte(labelsJSON.String), &labelsMap) == nil {
					if bridgeUID, ok := labelsMap["bridge.instance_uid"]; ok && bridgeUID != "" {
						bridgeDB := mustDB()
						var bridgeNameFromDB sql.NullString
						bridgeDB.QueryRow(`SELECT name FROM agents WHERE agent_uid=? LIMIT 1`, normalizeAgentUID(bridgeUID)).Scan(&bridgeNameFromDB)
						bridgeDB.Close()
						if bridgeNameFromDB.Valid && bridgeNameFromDB.String != "" {
							bridgeName = bridgeNameFromDB.String
						}
					}
				}
			}

			newCRD := map[string]interface{}{
				"apiVersion": "opentelemetry.io/v1alpha1",
				"kind":       "OpenTelemetryCollector",
				"metadata": map[string]interface{}{
					"name":      collectorName,
					"namespace": collectorNamespace,
					"labels":    map[string]interface{}{"opentelemetry.io/opamp-managed": bridgeName},
				},
				"spec": map[string]interface{}{
					"config": newConfigMap,
				},
			}

			if crdYAML, err := yaml.Marshal(newCRD); err != nil {
				return fmt.Errorf("failed to marshal new CRD YAML for collector %s/%s: %v", collectorNamespace, collectorName, err)
			} else {
				configYAML = string(crdYAML)
			}
		}
	}

	// Validate config is not empty
	if configYAML == "" || strings.TrimSpace(configYAML) == "" {
		log.Printf("ERROR: Config is empty for agent %s", agentUID)
		return fmt.Errorf("config YAML is empty")
	}

	// Calculate config hash
	hash := sha256.Sum256([]byte(configYAML))
	configHash := hex.EncodeToString(hash[:])

	// Check if agent is connected (use normalized UID)
	log.Printf("DEBUG: ===== CONNECTION LOOKUP =====")
	log.Printf("DEBUG: Looking up connection for agent UID: %s", agentUID)
	log.Printf("DEBUG: Total active connections: %d", len(m.conns))
	ac, exists := m.conns[agentUID]
	if exists {
		log.Printf("DEBUG: ✓ Direct connection found for agent %s", agentUID)
	} else {
		log.Printf("DEBUG: ✗ Direct connection NOT found for agent %s - trying bridge lookup", agentUID)
		// Try to find the connection by looking up agent labels (for discovered collectors)
		// Discovered collectors have bridge.instance_uid label pointing to the bridge connection
		db := mustDB()
		var labelsJSON sql.NullString
		var agentName sql.NullString
		err := db.QueryRow(`SELECT labels_json, name FROM agents WHERE agent_uid = ? LIMIT 1`, agentUID).Scan(&labelsJSON, &agentName)
		db.Close()

		if err != nil {
			log.Printf("DEBUG: ERROR: Failed to query agent %s from database: %v", agentUID, err)
		} else if !labelsJSON.Valid {
			log.Printf("DEBUG: WARNING: Agent %s found in database but labels_json is NULL", agentUID)
		} else {
			log.Printf("DEBUG: Agent %s labels_json length: %d bytes", agentUID, len(labelsJSON.String))
			var labels map[string]string
			if err := json.Unmarshal([]byte(labelsJSON.String), &labels); err != nil {
				log.Printf("DEBUG: ERROR: Failed to parse labels_json for agent %s: %v", agentUID, err)
			} else {
				log.Printf("DEBUG: Parsed labels: %d entries", len(labels))
				// Check if this is a discovered collector (has bridge.instance_uid)
				if bridgeUID, ok := labels["bridge.instance_uid"]; ok && bridgeUID != "" {
					log.Printf("DEBUG: Found bridge.instance_uid=%s for collector %s", bridgeUID, agentUID)
					// Try to find the bridge connection
					bridgeConnUID := normalizeAgentUID(bridgeUID)
					log.Printf("DEBUG: Normalized bridge UID: %s", bridgeConnUID)
					if bridgeConn, bridgeExists := m.conns[bridgeConnUID]; bridgeExists {
						ac = bridgeConn
						// Don't update agentUID - we want to keep using the collector's stable UID
						exists = true
						log.Printf("DEBUG: ✓ Found bridge connection for discovered collector %s via bridge.instance_uid=%s (bridge UID: %s)", agentUID, bridgeUID, bridgeConnUID)
					} else {
						log.Printf("DEBUG: ✗ Bridge UID %s NOT found in active connections - trying name pattern search", bridgeConnUID)
						// List all active connection UIDs for debugging
						log.Printf("DEBUG: Active connection UIDs:")
						for connUID := range m.conns {
							log.Printf("DEBUG:   - %s", connUID)
						}
						// Bridge UID not found - try to find bridge by name pattern
						for connUID, conn := range m.conns {
							var connName sql.NullString
							dbCheck := mustDB()
							err := dbCheck.QueryRow(`SELECT name FROM agents WHERE agent_uid = ? LIMIT 1`, connUID).Scan(&connName)
							dbCheck.Close()
							if err == nil && connName.Valid {
								nameLower := strings.ToLower(connName.String)
								log.Printf("DEBUG: Checking connection %s with name: %s", connUID, connName.String)
								if strings.Contains(nameLower, "opamp-bridge") || strings.Contains(nameLower, "operator-opamp-bridge") {
									ac = conn
									exists = true
									log.Printf("DEBUG: ✓ Found bridge connection for discovered collector %s by bridge name pattern (bridge UID: %s, name: %s)", agentUID, connUID, connName.String)
									break
								}
							}
						}
						if !exists {
							log.Printf("DEBUG: ✗ No bridge connection found by name pattern either")
						}
					}
				} else {
					log.Printf("DEBUG: Agent %s does not have bridge.instance_uid label", agentUID)
					if strings.Contains(strings.ToLower(agentName.String), "opamp-bridge") || strings.Contains(strings.ToLower(agentName.String), "operator-opamp-bridge") {
						// For OpAMP Bridge itself, try to find by name if UID changed (bridge reconnected)
						for uid, conn := range m.conns {
							var connName sql.NullString
							dbCheck := mustDB()
							err := dbCheck.QueryRow(`SELECT name FROM agents WHERE agent_uid = ? LIMIT 1`, uid).Scan(&connName)
							dbCheck.Close()
							if err == nil && connName.Valid && connName.String == agentName.String {
								ac = conn
								exists = true
								log.Printf("OpAMP Bridge reconnected: Found bridge by name %s, using new UID %s (old UID was %s)", agentName.String, uid, agentUID)
								break
							}
						}
					}
				}
			}
		}

		if !exists {
			// Log all available connections for debugging
			availableUIDs := make([]string, 0, len(m.conns))
			for uid := range m.conns {
				availableUIDs = append(availableUIDs, uid)
			}
			log.Printf("Agent %s not found in connection map. Available connections: %v", agentUID, availableUIDs)
			if agentName.Valid {
				log.Printf("  Agent name: %s", agentName.String)
			}
			if labelsJSON.Valid {
				log.Printf("  Agent labels: %s", labelsJSON.String)
			}
			return fmt.Errorf("agent %s is not connected. Available connections: %v", agentUID, availableUIDs)
		}
	}

	// CRITICAL: Verify connection is valid
	if ac == nil || ac.conn == nil {
		log.Printf("ERROR: Agent %s has invalid connection (nil conn)", agentUID)
		return fmt.Errorf("agent %s has invalid connection", agentUID)
	}

	// CRITICAL: Detect agent deployment type to handle config push appropriately:
	// - Docker/VM agents: Need restart command + file write
	// - Kubernetes agents: OpAMP Bridge handles CRD updates (no restart needed)
	// Reference: https://opentelemetry.io/blog/2023/opamp-status/
	// "The OpAMP bridge is responsible for maintaining pools of OpenTelemetry Collector resources
	//  in a Kubernetes cluster... and enables the remote configuration of pools of collectors."

	// Get agent labels and name to determine deployment type
	labelDB := mustDB()
	var agentLabelsJSON sql.NullString
	var agentName sql.NullString
	labelDB.QueryRow(`SELECT labels_json, name FROM agents WHERE agent_uid=? LIMIT 1`, agentUID).Scan(&agentLabelsJSON, &agentName)
	labelDB.Close()

	var isKubernetes bool
	var agentLabels map[string]string

	// Check agent name - OpAMP Bridge typically has "io.opentelemetry.operator-opamp-bridge" or "opamp-bridge" in name
	if agentName.Valid && agentName.String != "" {
		nameLower := strings.ToLower(agentName.String)
		// Check for OpAMP Bridge name patterns (exact match or contains)
		if strings.Contains(nameLower, "io.opentelemetry.operator-opamp-bridge") ||
			strings.Contains(nameLower, "operator-opamp-bridge") ||
			strings.Contains(nameLower, "opamp-bridge") {
			isKubernetes = true
			log.Printf("Detected Kubernetes OpAMP Bridge from agent name: %s", agentName.String)
		}
	}

	if agentLabelsJSON.Valid && agentLabelsJSON.String != "" {
		json.Unmarshal([]byte(agentLabelsJSON.String), &agentLabels)
		// Check for Kubernetes deployment indicators
		if deploymentType, ok := agentLabels["deployment.type"]; ok {
			isKubernetes = isKubernetes || deploymentType == "kubernetes" || deploymentType == "k8s"
		}
		if deploymentLocation, ok := agentLabels["deployment.location"]; ok {
			isKubernetes = isKubernetes || deploymentLocation == "kubernetes" || deploymentLocation == "k8s"
		}
		if env, ok := agentLabels["environment"]; ok {
			isKubernetes = isKubernetes || strings.Contains(strings.ToLower(env), "kubernetes") || strings.Contains(strings.ToLower(env), "k8s")
		}
		// Check if connected via OpAMP Bridge (has k8s-specific labels)
		if _, hasK8sLabel := agentLabels["kubernetes.namespace"]; hasK8sLabel {
			isKubernetes = true
		}
		if _, hasK8sLabel := agentLabels["k8s.namespace"]; hasK8sLabel {
			isKubernetes = true
		}
	}

	// Only send RemoteConfig via OpAMP - Supervisor/Bridge handles config application
	// Docker/VM with Supervisor: Supervisor merges RemoteConfig with local config and restarts Collector
	// Kubernetes with Bridge: Bridge updates CRD, K8s operator handles rolling update
	if !isKubernetes {
		log.Printf("Agent %s is Docker/VM deployment - RemoteConfig will be handled by OpAMP Supervisor", agentUID)
		log.Printf("  Supervisor will merge RemoteConfig with base config and restart Collector")
	} else {
		// Kubernetes agent: OpAMP Bridge will receive RemoteConfig and update CRD
		// No restart command needed - K8s operator handles rolling update
		log.Printf("Agent %s is Kubernetes deployment - OpAMP Bridge will update CRD (no restart needed)", agentUID)
	}

	if !exists {
		// Agent is offline - queue the config for async delivery
		log.Printf("ERROR: Agent %s is offline or connection not found. Queuing config for async delivery when agent reconnects (by: %s)", agentUID, performedBy)
		log.Printf("DEBUG: This means the config will NOT be sent immediately. The agent must be online and connected for config to be pushed.")

		queueDB := mustDB()
		defer queueDB.Close()

		// Get org_id from agents table
		var orgID int64
		row := queueDB.QueryRow(`SELECT org_id FROM agents WHERE agent_uid=? LIMIT 1`, agentUID)
		if err := row.Scan(&orgID); err != nil {
			log.Printf("WARNING: Could not find agent %s in database: %v", agentUID, err)
			orgID = 1 // Default org
		}

		// Get the latest approved config ID for this agent
		var configID sql.NullInt64
		row2 := queueDB.QueryRow(`
			SELECT id FROM agent_configs 
			WHERE agent_uid=? AND org_id=? AND approval_status='approved' 
			ORDER BY version DESC LIMIT 1
		`, agentUID, orgID)
		if err := row2.Scan(&configID); err != nil {
			log.Printf("WARNING: Could not find approved config for agent %s: %v", agentUID, err)
		}

		// Insert or update pending queue (only one pending config per agent)
		var queueID int64
		if configID.Valid {
			_, err := queueDB.Exec(`
				INSERT INTO pending_config_queue (org_id, agent_uid, config_id, config_yaml, config_hash, created_by, attempts)
				VALUES (?, ?, ?, ?, ?, ?, 0)
				ON DUPLICATE KEY UPDATE
					config_id=VALUES(config_id),
					config_yaml=VALUES(config_yaml),
					config_hash=VALUES(config_hash),
					queued_at=NOW(),
					sent_at=NULL,
					attempts=0,
					last_error=NULL,
					created_by=VALUES(created_by)
			`, orgID, agentUID, configID.Int64, configYAML, configHash, performedBy)
			if err != nil {
				log.Printf("ERROR: Failed to queue config for agent %s: %v", agentUID, err)
				return fmt.Errorf("failed to queue config: %v", err)
			}
		} else {
			// Config ID not found, but still queue the config
			_, err := queueDB.Exec(`
				INSERT INTO pending_config_queue (org_id, agent_uid, config_id, config_yaml, config_hash, created_by, attempts)
				VALUES (?, ?, NULL, ?, ?, ?, 0)
				ON DUPLICATE KEY UPDATE
					config_yaml=VALUES(config_yaml),
					config_hash=VALUES(config_hash),
					queued_at=NOW(),
					sent_at=NULL,
					attempts=0,
					last_error=NULL,
					created_by=VALUES(created_by)
			`, orgID, agentUID, configYAML, configHash, performedBy)
			if err != nil {
				log.Printf("ERROR: Failed to queue config for agent %s: %v", agentUID, err)
				return fmt.Errorf("failed to queue config: %v", err)
			}
		}

		log.Printf("✓ Config queued for agent %s. Will be sent automatically when agent reconnects (queue_id=%d)", agentUID, queueID)
		return nil // Return success - config is queued
	}

	// Agent is online - send config immediately via OpAMP + file write
	configSize := len(configYAML)
	log.Printf("Pushing config to agent %s (by: %s, size: %d bytes)", agentUID, performedBy, configSize)

	// Create config message according to OpAMP spec (https://opentelemetry.io/docs/specs/opamp/)
	// AgentRemoteConfig contains:
	// - Config: AgentConfigMap with ConfigMap (map of config file name -> AgentConfigFile)
	// - ConfigHash: optional hash for verification
	//
	// Kubernetes OpAMP Bridge expects config keys to be "<namespace>/<collector-name>" so it can apply
	// the patch to the correct OpenTelemetryCollector CRD. Docker/VM agents continue to use "collector.yaml".
	configHashBytes := hash[:] // SHA256 hash as bytes

	// Build ConfigMap based on agent type
	configMap := make(map[string]*protobufs.AgentConfigFile)

	// Log detection details for debugging
	log.Printf("DEBUG: PushConfig - agentUID=%s, agentName=%s, isKubernetes=%v",
		agentUID, agentName.String, isKubernetes)
	if labelsJSON.Valid && labelsJSON.String != "" {
		log.Printf("DEBUG: PushConfig - labels: %s", labelsJSON.String)
	}

	// Safety check: If agent name contains any OpAMP Bridge indicator, treat as Kubernetes
	// This is a fallback in case other detection methods fail
	if !isKubernetes && agentName.Valid && agentName.String != "" {
		nameLower := strings.ToLower(agentName.String)
		if strings.Contains(nameLower, "io.opentelemetry.operator-opamp-bridge") ||
			strings.Contains(nameLower, "operator-opamp-bridge") ||
			strings.Contains(nameLower, "opamp-bridge") {
			isKubernetes = true
			log.Printf("WARNING: OpAMP Bridge detected from name but not from labels - treating as Kubernetes agent")
		}
	}

	// Extract collector namespace and name from labels if not already set
	if collectorNamespace == "" && len(agentLabels) > 0 {
		if val, ok := agentLabels["k8s.namespace"]; ok && val != "" {
			collectorNamespace = val
		} else if val, ok := agentLabels["kubernetes.namespace"]; ok && val != "" {
			collectorNamespace = val
		} else if val, ok := agentLabels["namespace"]; ok && val != "" {
			collectorNamespace = val
		}
	}
	if collectorName == "" && len(agentLabels) > 0 {
		if val, ok := agentLabels["k8s.crd_name"]; ok && val != "" {
			collectorName = val
		} else if val, ok := agentLabels["k8s.crd.name"]; ok && val != "" {
			collectorName = val
		} else if val, ok := agentLabels["collector.name"]; ok && val != "" {
			collectorName = val
		}
	}
	if collectorName == "" && agentName.Valid && agentName.String != "" {
		collectorName = agentName.String
	}

	// CRITICAL: Cannot push config directly to OpAMP Bridge - it's a proxy, not a collector
	// Configs must be pushed to the discovered collector agents (which have k8s.namespace and k8s.crd_name)
	if agentName.Valid && agentName.String != "" {
		nameLower := strings.ToLower(agentName.String)
		if strings.Contains(nameLower, "io.opentelemetry.operator-opamp-bridge") ||
			strings.Contains(nameLower, "operator-opamp-bridge") ||
			strings.Contains(nameLower, "opamp-bridge") {
			// Check if this is actually a collector (has k8s.namespace/k8s.crd_name) or the bridge itself
			if collectorNamespace == "" || collectorName == "" ||
				(collectorName == agentName.String && strings.Contains(nameLower, "opamp-bridge")) {
				return fmt.Errorf("cannot push config directly to OpAMP Bridge (agent %s). Please push config to the individual collector agents (they should appear as separate agents with k8s.namespace and k8s.crd_name labels). Check backend logs for 'DISCOVERED COLLECTOR' messages", agentUID)
			}
		}
	}

	// For Kubernetes agents, we MUST have both namespace and name
	// If missing, we cannot use "collector.yaml" fallback - the bridge will reject it
	configKey, metadataMissing := determineConfigMapKey(isKubernetes, collectorNamespace, collectorName)
	if metadataMissing && isKubernetes {
		// CRITICAL: Cannot fall back to "collector.yaml" for Kubernetes - bridge rejects it
		log.Printf("ERROR: Cannot push config to Kubernetes agent %s - missing namespace (%q) or collector name (%q). Bridge will reject 'collector.yaml' key.", agentUID, collectorNamespace, collectorName)
		return fmt.Errorf("missing required metadata for Kubernetes agent %s: namespace=%q, name=%q. Cannot determine target collector CRD", agentUID, collectorNamespace, collectorName)
	}

	// Note: DaemonSet collectors are supported - we send a partial CRD with metadata (namespace/name) + spec.config only
	// Deployment/StatefulSet collectors receive full CRD with deployment settings
	// The mode check and CRD construction is handled earlier in the function (lines 1728-1799)

	// NOTE: We cannot reliably check the opamp-managed label from backend because:
	// 1. The label is a CRD metadata label, not included in OpAMP EffectiveConfig labels
	// 2. The OpAMP Bridge itself validates this label and will reject configs if missing
	// 3. The bridge error message is clear: "cannot modify a collector that doesn't have opentelemetry.io/opamp-managed: true | <bridge-name> set"
	//
	// If the label is missing, the bridge will return an error that we'll pass through to the user.
	// We log a warning here to help with debugging, but don't block the push.
	if isKubernetes && collectorNamespace != "" && collectorName != "" {
		// Check if label might be present in labels (though it's unlikely to be there)
		hasOpAMPLabelInLabels := false
		if len(agentLabels) > 0 {
			if val, ok := agentLabels["opentelemetry.io/opamp-managed"]; ok && val != "" {
				hasOpAMPLabelInLabels = true
				log.Printf("DEBUG: Collector %s/%s has opamp-managed label in OpAMP labels: %s", collectorNamespace, collectorName, val)
			} else if val, ok := agentLabels["opamp-managed"]; ok && val != "" {
				hasOpAMPLabelInLabels = true
				log.Printf("DEBUG: Collector %s/%s has opamp-managed label (short form) in OpAMP labels: %s", collectorNamespace, collectorName, val)
			}
		}

		if !hasOpAMPLabelInLabels {
			// Label not found in OpAMP labels (expected - it's a CRD metadata label)
			// Log a warning but don't block - let the bridge validate it
			log.Printf("WARNING: Cannot verify opamp-managed label for collector %s/%s from OpAMP labels (label is CRD metadata, not in OpAMP labels). "+
				"The OpAMP Bridge will validate this and reject if missing. "+
				"If you get a bridge error, ensure the CRD has the correct label value (matching the bridge name): "+
				"kubectl label opentelemetrycollector %s -n %s opentelemetry.io/opamp-managed=opamp-bridge --overwrite "+
				"(Replace 'opamp-bridge' with your bridge's actual name if different)",
				collectorNamespace, collectorName, collectorName, collectorNamespace)
		}
	}

	// Per OpAMP spec: ConfigMap must not be empty and keys must be valid
	// For Kubernetes collectors via bridge: key format MUST be "namespace/name"
	// For Docker/VM agents: key is typically "collector.yaml"
	if configKey == "" {
		log.Printf("ERROR: Invalid ConfigMap key (empty string) for agent %s", agentUID)
		return fmt.Errorf("invalid ConfigMap key: cannot be empty string per OpAMP spec")
	}

	configMap[configKey] = &protobufs.AgentConfigFile{
		Body:        []byte(configYAML),
		ContentType: "text/yaml",
	}

	// DEBUG: Log detailed config information being sent to bridge
	log.Printf("DEBUG: ===== CONFIG PUSH TO BRIDGE =====")
	log.Printf("DEBUG: Agent UID: %s", agentUID)
	log.Printf("DEBUG: Agent Name: %s", agentName.String)
	log.Printf("DEBUG: Is Kubernetes: %v", isKubernetes)
	log.Printf("DEBUG: Collector Namespace: %s", collectorNamespace)
	log.Printf("DEBUG: Collector Name: %s", collectorName)
	log.Printf("DEBUG: Config Key: %s", configKey)
	log.Printf("DEBUG: Config Hash: %s", configHash)
	log.Printf("DEBUG: Config Size: %d bytes", len(configYAML))

	// Show ConfigMap keys
	configKeys := make([]string, 0, len(configMap))
	for k := range configMap {
		configKeys = append(configKeys, k)
	}
	log.Printf("DEBUG: ConfigMap Keys: %v", configKeys)

	if isKubernetes {
		log.Printf("DEBUG: For Kubernetes collector: Config key format is 'namespace/name' = '%s'", configKey)
		log.Printf("DEBUG: Bridge will apply this config to OpenTelemetryCollector CRD: %s/%s", collectorNamespace, collectorName)
		log.Printf("DEBUG: ===== FULL CONFIG YAML (CRD spec.config) =====")
		log.Printf("DEBUG: %s", configYAML)
		log.Printf("DEBUG: ===== END FULL CONFIG YAML =====")
	} else {
		log.Printf("DEBUG: For Docker/VM agent: Config key is '%s' (typically 'collector.yaml')", configKey)
		log.Printf("DEBUG: ===== FULL CONFIG YAML =====")
		log.Printf("DEBUG: %s", configYAML)
		log.Printf("DEBUG: ===== END FULL CONFIG YAML =====")
	}
	log.Printf("DEBUG: ===== END CONFIG PUSH DEBUG =====")

	// Validate ConfigMap structure per OpAMP spec
	if len(configMap) == 0 {
		log.Printf("ERROR: ConfigMap is empty for agent %s", agentUID)
		return fmt.Errorf("ConfigMap cannot be empty per OpAMP spec")
	}

	if isKubernetes {
		// Validate Kubernetes key format: must be "namespace/name"
		if !strings.Contains(configKey, "/") {
			log.Printf("ERROR: Invalid Kubernetes ConfigMap key format '%s' - must be 'namespace/name' per OpAMP Bridge requirements", configKey)
			return fmt.Errorf("invalid ConfigMap key format for Kubernetes collector: expected 'namespace/name', got '%s'", configKey)
		}
		log.Printf("✓ Using key '%s' for Kubernetes OpAMP Bridge agent %s (name: %s)", configKey, agentUID, agentName.String)
		log.Printf("  Bridge will update CRD: namespace=%s, name=%s", collectorNamespace, collectorName)
		log.Printf("  CRD MUST have label: opentelemetry.io/opamp-managed=true OR opentelemetry.io/opamp-managed=opamp-bridge")
	} else {
		log.Printf("✓ Using key '%s' for Docker/VM agent %s (name: %s)", configKey, agentUID, agentName.String)
	}

	log.Printf("DEBUG: ===== BEFORE CREATING OPAMP MESSAGE =====")
	log.Printf("DEBUG: ConfigMap has %d entries", len(configMap))
	for k, v := range configMap {
		log.Printf("DEBUG:   ConfigMap key: %q, Body size: %d bytes, ContentType: %s", k, len(v.Body), v.ContentType)
	}
	log.Printf("DEBUG: ConfigHash (hex): %s", configHash)
	log.Printf("DEBUG: ConfigHash bytes: %s", hex.EncodeToString(configHashBytes))

	// Per OpAMP spec Section 6.3: AgentRemoteConfig structure
	// - Config: AgentConfigMap (required)
	// - ConfigHash: SHA256 hash of config (optional but recommended)
	configMsg := &protobufs.AgentRemoteConfig{
		Config: &protobufs.AgentConfigMap{
			ConfigMap: configMap,
		},
		ConfigHash: configHashBytes,
	}

	// Validate RemoteConfig per OpAMP spec
	if configMsg.Config == nil || configMsg.Config.ConfigMap == nil || len(configMsg.Config.ConfigMap) == 0 {
		log.Printf("ERROR: Invalid RemoteConfig structure - ConfigMap is nil or empty")
		return fmt.Errorf("invalid RemoteConfig: ConfigMap cannot be nil or empty per OpAMP spec")
	}

	// Create ServerToAgent message according to OpAMP spec
	// Per spec Section 6.2: InstanceUid in ServerToAgent must match the agent's InstanceUid
	// For discovered collectors via bridge: Use bridge's InstanceUID (bridge is the OpAMP client)
	// For direct agents: Use agent's own InstanceUID
	agentInstanceUID := ac.originalUID
	if len(agentInstanceUID) == 0 {
		// Fallback to normalized UID if original not available (should not happen)
		agentInstanceUID = []byte(agentUID)
		log.Printf("WARNING: Using normalized UID for agent %s - original InstanceUid not stored", agentUID)
	}

	// CRITICAL: For Kubernetes collectors managed via OpAMP Bridge:
	// The bridge is the OpAMP client, so ServerToAgent.InstanceUid MUST be the bridge's InstanceUID
	// The ConfigMap key tells the bridge which CRD to update
	// Get labels from database if not already set
	if isKubernetes && collectorNamespace != "" && collectorName != "" {
		// Get labels from database to check for bridge.instance_uid
		labelCheckDB := mustDB()
		var labelCheckJSON sql.NullString
		labelCheckDB.QueryRow(`SELECT labels_json FROM agents WHERE agent_uid=? LIMIT 1`, agentUID).Scan(&labelCheckJSON)
		labelCheckDB.Close()

		var bridgeLabels map[string]string
		if labelCheckJSON.Valid && labelCheckJSON.String != "" {
			json.Unmarshal([]byte(labelCheckJSON.String), &bridgeLabels)
		}

		// Check if this is a discovered collector (has bridge.instance_uid label)
		if bridgeUID, ok := bridgeLabels["bridge.instance_uid"]; ok && bridgeUID != "" {
			log.Printf("DEBUG: Found bridge.instance_uid=%s for collector %s/%s", bridgeUID, collectorNamespace, collectorName)
			// Find the bridge connection to get its InstanceUID
			bridgeConnUID := normalizeAgentUID(bridgeUID)
			log.Printf("DEBUG: Looking up bridge connection with normalized UID: %s", bridgeConnUID)
			if bridgeConn, bridgeExists := m.conns[bridgeConnUID]; bridgeExists {
				if bridgeConn != nil && bridgeConn.conn != nil && len(bridgeConn.originalUID) > 0 {
					// CRITICAL: Use bridge's InstanceUID, not collector's
					agentInstanceUID = bridgeConn.originalUID
					// Also update ac to use bridge connection (we want to send to bridge, not collector)
					ac = bridgeConn
					log.Printf("DEBUG: Switched to bridge connection for discovered collector %s/%s (bridge UID: %s, InstanceUID hex: %s)",
						collectorNamespace, collectorName, bridgeUID, hex.EncodeToString(agentInstanceUID))
					log.Printf("DEBUG: CRITICAL: Using bridge's InstanceUID=%s and bridge connection for ServerToAgent message", hex.EncodeToString(agentInstanceUID))
				} else {
					log.Printf("WARNING: Bridge connection found but invalid (conn=%v, originalUID length=%d)",
						bridgeConn != nil && bridgeConn.conn != nil, len(bridgeConn.originalUID))
				}
			} else {
				log.Printf("WARNING: Bridge UID %s (normalized: %s) not found in active connections. Available connections: %d",
					bridgeUID, bridgeConnUID, len(m.conns))
				// List available connections for debugging
				for uid := range m.conns {
					log.Printf("DEBUG:   Available connection UID: %s", uid)
				}
			}
		} else {
			log.Printf("DEBUG: Collector %s/%s does not have bridge.instance_uid label - using collector's own connection", collectorNamespace, collectorName)
		}
	}

	// Debug: Log InstanceUid matching for troubleshooting
	// CRITICAL: InstanceUid must match EXACTLY what agent sent in AgentToServer message EXACTLY (per OpAMP spec Section 6.2)
	log.Printf("DEBUG: Sending config to agent %s - InstanceUid bytes length: %d, hex: %s, raw: %q, ConfigMap key: %s",
		agentUID, len(agentInstanceUID), hex.EncodeToString(agentInstanceUID), string(agentInstanceUID), configKey)
	log.Printf("DEBUG: Config being sent - size: %d bytes, hash: %s, target: %s/%s", len(configYAML), configHash, collectorNamespace, collectorName)

	msg := &protobufs.ServerToAgent{
		InstanceUid:  agentInstanceUID, // MUST match agent's InstanceUid from AgentToServer message EXACTLY (per OpAMP spec Section 6.2)
		RemoteConfig: configMsg,
		Capabilities: 0x3F, // Re-send server capabilities to ensure agent knows we support remote config
	}

	// DEBUG: Log full OpAMP ServerToAgent message structure
	log.Printf("DEBUG: ===== OPAMP SERVERTOAGENT MESSAGE (COMPLETE STRUCTURE) =====")
	log.Printf("DEBUG: Message Type: ServerToAgent (protobuf)")
	log.Printf("DEBUG: InstanceUid: %s (hex), length: %d bytes, raw: %q", hex.EncodeToString(agentInstanceUID), len(agentInstanceUID), string(agentInstanceUID))
	log.Printf("DEBUG: Capabilities: 0x%x (hex), binary: %b, decimal: %d", msg.Capabilities, msg.Capabilities, msg.Capabilities)
	log.Printf("DEBUG: RemoteConfig field present: %v", msg.RemoteConfig != nil)
	if msg.RemoteConfig != nil {
		log.Printf("DEBUG: RemoteConfig.Config field present: %v", msg.RemoteConfig.Config != nil)
		if msg.RemoteConfig.Config != nil {
			log.Printf("DEBUG: RemoteConfig.Config.ConfigMap entries count: %d", len(msg.RemoteConfig.Config.ConfigMap))
			for configKey, configFile := range msg.RemoteConfig.Config.ConfigMap {
				log.Printf("DEBUG:   ConfigMap Entry Key: %q", configKey)
				log.Printf("DEBUG:     AgentConfigFile.ContentType: %q", configFile.ContentType)
				log.Printf("DEBUG:     AgentConfigFile.Body length: %d bytes", len(configFile.Body))
				// Show full body for small configs, or first 1000 chars for large ones
				bodyPreviewLen := 1000
				if len(configFile.Body) < bodyPreviewLen {
					bodyPreviewLen = len(configFile.Body)
					log.Printf("DEBUG:     AgentConfigFile.Body (FULL, %d bytes):", len(configFile.Body))
				} else {
					log.Printf("DEBUG:     AgentConfigFile.Body (first %d of %d bytes):", bodyPreviewLen, len(configFile.Body))
				}
				log.Printf("DEBUG: %s", string(configFile.Body[:bodyPreviewLen]))
				if len(configFile.Body) > bodyPreviewLen {
					log.Printf("DEBUG:     ... (remaining %d bytes truncated)", len(configFile.Body)-bodyPreviewLen)
				}
			}
		} else {
			log.Printf("DEBUG: ERROR: RemoteConfig.Config is nil!")
		}
		log.Printf("DEBUG: RemoteConfig.ConfigHash: %s (hex), length: %d bytes", hex.EncodeToString(msg.RemoteConfig.ConfigHash), len(msg.RemoteConfig.ConfigHash))
	} else {
		log.Printf("DEBUG: ERROR: RemoteConfig is nil!")
	}
	log.Printf("DEBUG: ===== END OPAMP SERVERTOAGENT MESSAGE =====")

	// DEBUG: Log full config YAML being sent (complete, not truncated) - this is the same as what's in ConfigMap
	log.Printf("DEBUG: ===== FULL CONFIG YAML BEING SENT TO BRIDGE (COMPLETE, UNTRUNCATED) =====")
	log.Printf("DEBUG: This is the exact YAML content that will be sent in the OpAMP RemoteConfig message")
	log.Printf("DEBUG: Config size: %d bytes", len(configYAML))
	log.Printf("DEBUG: %s", configYAML)
	log.Printf("DEBUG: ===== END FULL CONFIG YAML =====")

	// Send config to agent via OpAMP connection
	ctx := context.Background()
	err := ac.conn.Send(ctx, msg)
	if err != nil {
		log.Printf("ERROR: Failed to send config to agent %s via OpAMP: %v", agentUID, err)
		return fmt.Errorf("failed to send config via OpAMP connection: %v", err)
	}

	log.Printf("DEBUG: Config sent successfully. InstanceUid sent: %s, ConfigHash: %s", hex.EncodeToString(agentInstanceUID), configHash)

	// REFERENCE ARCHITECTURE: Server is "offer-only" - client handles file writes
	// The OpAMP applier (running on agent side) receives RemoteConfig and writes it to filesystem
	// The wrapper then detects the file change and applies it locally
	// Server does NOT write to agent filesystem (agents may be on different hosts)

	// CRITICAL: Send restart command ONLY for Docker/VM agents
	// Kubernetes agents: OpAMP Bridge updates CRD, K8s operator handles rolling update (no restart command needed)
	// Reference: https://opentelemetry.io/blog/2023/opamp-status/

	// Re-check agent type (we determined this earlier, but need it here too)
	// Get agent labels to determine deployment type
	checkDB := mustDB()
	var checkLabelsJSON sql.NullString
	checkDB.QueryRow(`SELECT labels_json FROM agents WHERE agent_uid=? LIMIT 1`, agentUID).Scan(&checkLabelsJSON)
	checkDB.Close()

	var needsRestart bool = true // Default to true (Docker/VM)
	if checkLabelsJSON.Valid && checkLabelsJSON.String != "" {
		var checkLabels map[string]string
		if json.Unmarshal([]byte(checkLabelsJSON.String), &checkLabels) == nil {

			// Check for Kubernetes deployment indicators
			if deploymentType, ok := checkLabels["deployment.type"]; ok {
				if deploymentType == "kubernetes" || deploymentType == "k8s" {
					needsRestart = false
				}
			}
			if deploymentLocation, ok := checkLabels["deployment.location"]; ok {
				if deploymentLocation == "kubernetes" || deploymentLocation == "k8s" {
					needsRestart = false
				}
			}
			if _, hasK8sLabel := checkLabels["kubernetes.namespace"]; hasK8sLabel {
				needsRestart = false
			}
			if _, hasK8sLabel := checkLabels["k8s.namespace"]; hasK8sLabel {
				needsRestart = false
			}
		}
	}

	if needsRestart {
		// Docker/VM agents: Handle restart based on deployment type
		// 1. Docker: Restart container directly (docker restart)
		// 2. VM with Supervisor: Send OpAMP restart command (Supervisor handles it)
		// 3. VM without Supervisor: Would need SSH/systemd (not implemented, Supervisor recommended)

		// Check if agent is using OpAMP Supervisor (Supervisor reports additional capabilities)
		// Supervisor typically reports: accepts_restart_command capability
		capDB := mustDB()
		var capabilitiesJSON sql.NullString
		capDB.QueryRow(`SELECT capabilities_json FROM agents WHERE agent_uid=? LIMIT 1`, agentUID).Scan(&capabilitiesJSON)
		capDB.Close()

		var hasSupervisor bool = false
		if capabilitiesJSON.Valid && capabilitiesJSON.String != "" {
			var caps map[string]interface{}
			if json.Unmarshal([]byte(capabilitiesJSON.String), &caps) == nil {
				// Check for Supervisor indicators in capabilities
				// Supervisor reports accepts_restart_command or reports_effective_config
				if acceptsRestart, ok := caps["accepts_restart_command"]; ok {
					if val, ok := acceptsRestart.(bool); ok && val {
						hasSupervisor = true
					}
				}
				// Supervisor also typically reports effective config
				if reportsEffective, ok := caps["reports_effective_config"]; ok {
					if val, ok := reportsEffective.(bool); ok && val {
						hasSupervisor = true
					}
				}
			}
		}

		// Also check labels for supervisor indication
		if !hasSupervisor && checkLabelsJSON.Valid && checkLabelsJSON.String != "" {
			var labelCheck map[string]string
			if json.Unmarshal([]byte(checkLabelsJSON.String), &labelCheck) == nil {
				if supervisorMode, ok := labelCheck["supervisor.mode"]; ok && supervisorMode == "true" {
					hasSupervisor = true
				}
				if agentType, ok := labelCheck["agent.type"]; ok && agentType == "supervisor" {
					hasSupervisor = true
				}
			}
		}

		// REFERENCE ARCHITECTURE: Server is "offer-only" - client initiates apply/restart
		// We only send RemoteConfig via OpAMP - the client (wrapper/supervisor) handles:
		// 1. Receiving RemoteConfig
		// 2. Validating (dry-run)
		// 3. Writing to remote.yaml
		// 4. Applying (swapping to active.yaml, SIGHUP/restart)
		//
		// Server tracks RemoteConfigStatus and effective config hash for drift detection
		// NO restart commands from server - all apply/restart happens client-side
		log.Printf("✓ RemoteConfig sent to agent %s via OpAMP (offer-only mode)", agentUID)
		log.Printf("  Client (wrapper/supervisor) will handle validation and application")
		log.Printf("  Server will track RemoteConfigStatus to detect config drift")

		// Store desired config hash for drift detection
		// This is the config we're "offering" to the agent
		// Agent will report back effective_config_hash in RemoteConfigStatus
		desiredDB := mustDB()
		defer desiredDB.Close()

		_, err = desiredDB.Exec(`
			UPDATE agents 
			SET desired_config_hash=?, 
			    current_config_hash=?
			WHERE agent_uid=?
		`, configHash, configHash, agentUID)
		if err != nil {
			log.Printf("WARNING: Failed to update desired config hash: %v", err)
		} else {
			log.Printf("  Desired config hash stored: %s", configHash)
			log.Printf("  Will track RemoteConfigStatus to detect when agent applies it")
			log.Printf("  Config drift = desired_hash != effective_hash (reported by agent)")
		}
	} else {
		// Kubernetes agent: OpAMP Bridge handles it
		log.Printf("Agent %s is Kubernetes - OpAMP Bridge will update CRD, K8s operator handles rolling update (no restart command)", agentUID)
		log.Printf("  The RemoteConfig has been sent - OpAMP Bridge will apply it to the OpenTelemetryCollector CRD")
	}

	// Update agents table to track which config version was pushed
	trackDB := mustDB()
	defer trackDB.Close()

	// Find the config ID that matches this config hash
	var configID, configVersion sql.NullInt64
	row := trackDB.QueryRow(`
		SELECT id, version 
		FROM agent_configs 
		WHERE org_id=(SELECT org_id FROM agents WHERE agent_uid=? LIMIT 1) 
		AND agent_uid=? AND checksum=? AND approval_status='approved'
		ORDER BY version DESC LIMIT 1
	`, agentUID, agentUID, configHash)
	if trackErr := row.Scan(&configID, &configVersion); trackErr == nil {
		// Update running_config_id and running_config_version
		trackDB.Exec(`
			UPDATE agents 
			SET running_config_id=?, running_config_version=?
			WHERE agent_uid=?
		`, configID.Int64, configVersion.Int64, agentUID)
		log.Printf("  Updated agent tracking: running_config_id=%d, running_config_version=%d", configID.Int64, configVersion.Int64)
	}

	log.Printf("✓ Successfully sent config to agent %s via OpAMP (by: %s, size: %d bytes)", agentUID, performedBy, configSize)
	log.Printf("  Note: Agent receives config asynchronously via OpAMP. Check agent logs for config application.")
	log.Printf("  The agent should acknowledge the config in its next heartbeat/status update.")

	return nil
}

func (m *OpampManager) GetConnection(agentUID string) (types.Connection, bool) {
	agentUID = normalizeAgentUID(agentUID)
	ac, exists := m.conns[agentUID]
	if !exists {
		return nil, false
	}
	return ac.conn, true
}

func (m *OpampManager) UpgradeAgent(agentUID, newVersion string) error {
	agentUID = normalizeAgentUID(agentUID)
	ac, exists := m.conns[agentUID]
	if !exists {
		return sql.ErrNoRows // agent not connected
	}

	// Create upgrade/restart command message according to OpAMP spec
	// Per spec Section 8.1: InstanceUid must match the agent's InstanceUid
	agentInstanceUID := ac.originalUID
	if len(agentInstanceUID) == 0 {
		agentInstanceUID = []byte(agentUID)
		log.Printf("WARNING: Using normalized UID for restart command - original InstanceUid not stored")
	}

	upgradeMsg := &protobufs.ServerToAgent{
		InstanceUid: agentInstanceUID, // Must match agent's InstanceUid from AgentToServer message
		Command: &protobufs.ServerToAgentCommand{
			Type: protobufs.CommandType_CommandType_Restart, // Restart command per OpAMP spec Section 8.1
		},
	}

	// Send restart command (this triggers agent restart/upgrade)
	err := ac.conn.Send(context.Background(), upgradeMsg)
	if err != nil {
		log.Printf("Failed to send upgrade command to agent %s: %v", agentUID, err)
		return err
	}

	log.Printf("Sent upgrade/restart command to agent: %s", agentUID)
	return nil
}

func (m *OpampManager) Stop() {
	if m.server != nil {
		ctx := context.Background()
		m.server.Stop(ctx)
	}
}

// sendPendingConfigs checks for pending configs in queue and sends them to the agent
func (m *OpampManager) sendPendingConfigs(agentUID string, conn types.Connection) {
	agentUID = normalizeAgentUID(agentUID)
	db := mustDB()
	defer db.Close()

	// Get pending config for this agent (only unsent ones)
	var configYAML, configHash sql.NullString
	var queueID int64
	var attempts int
	row := db.QueryRow(`
		SELECT id, config_yaml, config_hash, attempts 
		FROM pending_config_queue 
		WHERE agent_uid=? AND sent_at IS NULL 
		ORDER BY queued_at DESC LIMIT 1
	`, agentUID)

	err := row.Scan(&queueID, &configYAML, &configHash, &attempts)
	if err != nil {
		if err == sql.ErrNoRows {
			// No pending configs
			return
		}
		log.Printf("ERROR: Failed to query pending configs for agent %s: %v", agentUID, err)
		return
	}

	if !configYAML.Valid || configYAML.String == "" {
		log.Printf("WARNING: Pending config exists but has no YAML content for agent %s", agentUID)
		return
	}

	// Try to send the config
	log.Printf("Sending pending config to reconnected agent %s (queue_id=%d, attempts=%d)", agentUID, queueID, attempts)

	// Calculate config hash for verification (per OpAMP spec)
	configHashBytes := sha256.Sum256([]byte(configYAML.String))

	// Detect if this is a Kubernetes agent to use correct ConfigMap key
	var isKubernetes bool
	collectorNamespace := ""
	collectorName := ""
	dbCheck := mustDB()
	var labelsJSON sql.NullString
	var agentName sql.NullString
	err2 := dbCheck.QueryRow(`SELECT labels_json, name FROM agents WHERE agent_uid=? LIMIT 1`, agentUID).Scan(&labelsJSON, &agentName)

	// Check agent name - OpAMP Bridge typically has "io.opentelemetry.operator-opamp-bridge" or "opamp-bridge" in name
	if err2 == nil && agentName.Valid && agentName.String != "" {
		nameLower := strings.ToLower(agentName.String)
		if strings.Contains(nameLower, "io.opentelemetry.operator-opamp-bridge") ||
			strings.Contains(nameLower, "operator-opamp-bridge") ||
			strings.Contains(nameLower, "opamp-bridge") {
			isKubernetes = true
			log.Printf("Pending config: Detected Kubernetes OpAMP Bridge from agent name: %s", agentName.String)
		}
	}

	if err2 == nil && labelsJSON.Valid && labelsJSON.String != "" {
		var labels map[string]string
		if json.Unmarshal([]byte(labelsJSON.String), &labels) == nil {
			// Check for Kubernetes deployment indicators
			if deploymentType, ok := labels["deployment.type"]; ok {
				isKubernetes = isKubernetes || deploymentType == "kubernetes" || deploymentType == "k8s"
			}
			if _, hasK8sLabel := labels["kubernetes.namespace"]; hasK8sLabel {
				isKubernetes = true
			}
			if _, hasK8sLabel := labels["k8s.namespace"]; hasK8sLabel {
				isKubernetes = true
			}

			// Extract namespace/name targets for Kubernetes agents
			if val, ok := labels["k8s.namespace"]; ok && val != "" {
				collectorNamespace = val
			} else if val, ok := labels["kubernetes.namespace"]; ok && val != "" {
				collectorNamespace = val
			} else if val, ok := labels["namespace"]; ok && val != "" {
				collectorNamespace = val
			}
			if val, ok := labels["k8s.crd_name"]; ok && val != "" {
				collectorName = val
			} else if val, ok := labels["k8s.crd.name"]; ok && val != "" {
				collectorName = val
			} else if val, ok := labels["collector.name"]; ok && val != "" {
				collectorName = val
			}
		}
	}
	dbCheck.Close()

	configKey, metadataMissing := determineConfigMapKey(isKubernetes, collectorNamespace, collectorName)
	if metadataMissing {
		log.Printf("ERROR: Pending config: missing namespace/name for agent %s. Using 'collector.yaml' fallback; config may fail to apply until metadata is available.", agentUID)
	}

	configMap := map[string]*protobufs.AgentConfigFile{
		configKey: &protobufs.AgentConfigFile{
			Body:        []byte(configYAML.String),
			ContentType: "text/yaml",
		},
	}
	if isKubernetes {
		log.Printf("Pending config: Using key '%s' for Kubernetes OpAMP Bridge agent %s", configKey, agentUID)
	} else {
		log.Printf("Pending config: Using key '%s' for Docker/VM agent %s", configKey, agentUID)
	}

	configMsg := &protobufs.AgentRemoteConfig{
		Config: &protobufs.AgentConfigMap{
			ConfigMap: configMap,
		},
		ConfigHash: configHashBytes[:], // SHA256 hash for agent to verify config integrity
	}

	// Per OpAMP spec: InstanceUid must match the agent's InstanceUid from AgentToServer message
	// Find the connection to get the original InstanceUid bytes
	var agentInstanceUID []byte
	for uid, storedAC := range m.conns {
		if storedAC.conn == conn && uid == agentUID {
			if len(storedAC.originalUID) > 0 {
				agentInstanceUID = storedAC.originalUID
				break
			}
		}
	}
	// Fallback if not found
	if len(agentInstanceUID) == 0 {
		agentInstanceUID = []byte(agentUID)
		log.Printf("WARNING: Using normalized UID for pending config - original InstanceUid not found")
	}

	msg := &protobufs.ServerToAgent{
		InstanceUid:  agentInstanceUID, // Must match agent's InstanceUid per OpAMP spec
		RemoteConfig: configMsg,
	}

	ctx := context.Background()
	err = conn.Send(ctx, msg)
	if err != nil {
		// Update attempt count and error
		attempts++
		db.Exec(`
			UPDATE pending_config_queue 
			SET attempts=?, last_attempt_at=NOW(), last_error=?
			WHERE id=?
		`, attempts, err.Error(), queueID)
		log.Printf("ERROR: Failed to send pending config to agent %s: %v (attempt %d)", agentUID, err, attempts)
		return
	}

	// Mark as sent
	_, err = db.Exec(`
		UPDATE pending_config_queue 
		SET sent_at=NOW(), attempts=?, last_attempt_at=NOW()
		WHERE id=?
	`, attempts+1, queueID)
	if err != nil {
		log.Printf("ERROR: Failed to mark config as sent: %v", err)
	} else {
		log.Printf("✓ Successfully sent pending config to agent %s (was queued)", agentUID)
	}
}

// isPrintable checks if a string contains only printable ASCII characters
func isPrintable(s string) bool {
	for _, r := range s {
		if r < 32 || r > 126 {
			if r != '-' { // Allow hyphens for UUIDs
				return false
			}
		}
	}
	return true
}
