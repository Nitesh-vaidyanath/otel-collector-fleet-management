package main

import "database/sql"

type sqlExecer interface {
	Exec(query string, args ...any) (sql.Result, error)
}

const labelSnapshotExpression = `CASE WHEN ? THEN VALUES(labels_json) ELSE labels_json END`

const bridgeUpsertSQL = `INSERT INTO bridges (org_id, bridge_uid, name, version, status, last_seen_at, labels_json, capabilities_json)
VALUES (?, ?, ?, ?, 'online', NOW(), ?, ?)
ON DUPLICATE KEY UPDATE
 name = IF(VALUES(name) != '' AND VALUES(name) != VALUES(bridge_uid), VALUES(name), name),
 version = IF(VALUES(version) != '' AND VALUES(version) != 'unknown', VALUES(version), version),
 status = IF(status = 'degraded', 'degraded', 'online'),
 last_seen_at = NOW(),
 labels_json = ` + labelSnapshotExpression + `,
 capabilities_json = VALUES(capabilities_json)`

const agentConfigUpsertSQL = `INSERT INTO agents (org_id, org_name, agent_uid, name, version, status, last_seen_at, labels_json, capabilities_json, current_config_yaml, current_config_hash)
VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
 name = IF(VALUES(name) != '' AND VALUES(name) != VALUES(agent_uid), VALUES(name), name),
 version = IF(VALUES(version) != '' AND VALUES(version) != 'unknown', VALUES(version), version),
 status = IF(VALUES(status) = 'unclassified', 'unclassified', IF(status = 'degraded', 'degraded', 'online')),
 last_seen_at = NOW(),
 labels_json = ` + labelSnapshotExpression + `,
 capabilities_json = IF(CHAR_LENGTH(VALUES(capabilities_json)) > 2 AND VALUES(capabilities_json) != '{}', VALUES(capabilities_json), capabilities_json),
 org_name = VALUES(org_name),
 org_id = VALUES(org_id),
 current_config_yaml = CASE WHEN current_config_hash IS NULL THEN VALUES(current_config_yaml) WHEN current_config_hash != VALUES(current_config_hash) THEN VALUES(current_config_yaml) ELSE current_config_yaml END,
 current_config_hash = COALESCE(VALUES(current_config_hash), current_config_hash)`

const agentHeartbeatUpsertSQL = `INSERT INTO agents (org_id, org_name, agent_uid, name, version, status, last_seen_at, labels_json, capabilities_json)
VALUES (?, ?, ?, ?, ?, 'online', NOW(), ?, ?)
ON DUPLICATE KEY UPDATE
 name = IF(VALUES(name) != '' AND VALUES(name) != VALUES(agent_uid), VALUES(name), name),
 version = IF(VALUES(version) != '' AND VALUES(version) != 'unknown', VALUES(version), version),
 status = IF(status = 'degraded', 'degraded', 'online'),
 last_seen_at = NOW(),
 labels_json = ` + labelSnapshotExpression + `,
 capabilities_json = IF(CHAR_LENGTH(VALUES(capabilities_json)) > 2 AND VALUES(capabilities_json) != '{}', VALUES(capabilities_json), capabilities_json),
 org_name = VALUES(org_name),
 org_id = VALUES(org_id)`

func uidPrefix(uid string) string {
	if len(uid) > 8 {
		return uid[:8]
	}
	return uid
}

// execLabelSnapshot makes heartbeat-only updates preserve labels while a real
// AgentDescription replaces the complete persisted snapshot. INSERT values are
// unaffected, so a first heartbeat can still initialize its labels.
func execLabelSnapshot(db sqlExecer, query string, args []any, descriptionProvided bool) (sql.Result, error) {
	args = append(args, descriptionProvided)
	return db.Exec(query, args...)
}
