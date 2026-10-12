package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/open-telemetry/opamp-go/protobufs"
)

func canonicalRemoteConfigStatus(status protobufs.RemoteConfigStatuses) string {
	switch status {
	case protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLIED:
		return "APPLIED"
	case protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLYING:
		return "APPLYING"
	case protobufs.RemoteConfigStatuses_RemoteConfigStatuses_FAILED:
		return "FAILED"
	case protobufs.RemoteConfigStatuses_RemoteConfigStatuses_UNSET:
		return "UNSET"
	default:
		return "UNKNOWN"
	}
}

func normalizeRemoteConfigStatus(status string) string {
	status = strings.ToUpper(strings.TrimSpace(status))
	for strings.HasPrefix(status, "REMOTECONFIGSTATUSES_") {
		status = strings.TrimPrefix(status, "REMOTECONFIGSTATUSES_")
	}
	switch status {
	case "APPLIED", "APPLYING", "FAILED", "UNSET":
		return status
	case "APPLIED_CONFIRMED":
		return "APPLIED"
	default:
		return "UNKNOWN"
	}
}

type configSyncDecision struct {
	HashMatch  bool
	SyncStatus string
}

func decideConfigSync(status, statusError, reportedHash, expectedHash string) configSyncDecision {
	status = normalizeRemoteConfigStatus(status)
	match := reportedHash != "" && expectedHash != "" && reportedHash == expectedHash
	switch {
	case status == "APPLYING":
		return configSyncDecision{HashMatch: false, SyncStatus: "pending_sync"}
	case status == "FAILED":
		return configSyncDecision{HashMatch: false, SyncStatus: "not_synced"}
	case status == "APPLIED" && statusError != "":
		return configSyncDecision{HashMatch: false, SyncStatus: "not_synced"}
	case status == "APPLIED" && match:
		return configSyncDecision{HashMatch: true, SyncStatus: "synced"}
	case status == "APPLIED" && reportedHash != "" && expectedHash != "":
		return configSyncDecision{HashMatch: false, SyncStatus: "not_synced"}
	case status == "APPLIED" && (reportedHash == "" || expectedHash == ""):
		return configSyncDecision{HashMatch: false, SyncStatus: "unknown"}
	default:
		return configSyncDecision{HashMatch: false, SyncStatus: "unknown"}
	}
}

func shouldUpdateEffectiveConfigHash(status protobufs.RemoteConfigStatuses, hash, statusError string) bool {
	return status == protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLIED && hash != "" && statusError == ""
}

func persistedRemoteConfigState(status protobufs.RemoteConfigStatuses, offeredHash, statusError string) (string, string, bool) {
	accepted := shouldUpdateEffectiveConfigHash(status, offeredHash, statusError)
	storedStatus := canonicalRemoteConfigStatus(status)
	if accepted {
		storedStatus = "APPLIED_CONFIRMED"
	} else if status == protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLIED && offeredHash == "" && statusError == "" {
		statusError = "APPLIED report missing configuration hash"
	}
	return storedStatus, statusError, accepted
}

type remoteConfigReport struct {
	Status, Hash, Error, Source string
	At                          sql.NullTime
	Found                       bool
}

func parseRemoteConfigTelemetry(data string) remoteConfigReport {
	var raw map[string]any
	if json.Unmarshal([]byte(data), &raw) != nil {
		return remoteConfigReport{}
	}
	report := remoteConfigReport{}
	if v, ok := raw["status"].(string); ok {
		report.Status = normalizeRemoteConfigStatus(v)
	}
	if v, ok := raw["last_remote_config_hash"].(string); ok {
		report.Hash = v
	}
	if v, ok := raw["error_message"].(string); ok {
		report.Error = v
	}
	return report
}

func hasRemoteConfigTelemetryFields(data string) bool {
	var raw map[string]any
	if json.Unmarshal([]byte(data), &raw) != nil {
		return false
	}
	if _, ok := raw["last_remote_config_hash"]; ok {
		return true
	}
	if _, ok := raw["error_message"]; ok {
		return true
	}
	status, ok := raw["status"].(string)
	if !ok {
		return false
	}
	return normalizeRemoteConfigStatus(status) != "UNKNOWN"
}

type rowScanner interface {
	Scan(dest ...any) error
}

func readRemoteConfigReportWith(query func(string, ...any) rowScanner, orgID int64, uid string) (remoteConfigReport, error) {
	for _, source := range []string{"remote_config_status", "health"} {
		var data sql.NullString
		var at sql.NullTime
		err := query(`SELECT telemetry_data,reported_at FROM agent_telemetry WHERE agent_uid=? AND org_id=? AND telemetry_type=? ORDER BY reported_at DESC LIMIT 1`, uid, orgID, source).Scan(&data, &at)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return remoteConfigReport{}, err
		}
		r := parseRemoteConfigTelemetry(data.String)
		// The dedicated telemetry type is authoritative even when malformed: a
		// missing hash must not borrow a previously confirmed hash. Legacy health
		// is considered only when it actually carries remote-config information.
		if source == "health" && !hasRemoteConfigTelemetryFields(data.String) {
			continue
		}
		r.Source = source
		r.At = at
		r.Found = true
		return r, nil
	}
	return remoteConfigReport{}, nil
}

func readRemoteConfigReport(db *sql.DB, orgID int64, uid string) (remoteConfigReport, error) {
	return readRemoteConfigReportWith(func(query string, args ...any) rowScanner {
		return db.QueryRow(query, args...)
	}, orgID, uid)
}

type approvedConfigSummary struct {
	ID, Version sql.NullInt64
	Name, Hash  sql.NullString
}

func readLatestApprovedConfigWith(query func(string, ...any) rowScanner, orgID int64, uid string) (approvedConfigSummary, error) {
	var latest approvedConfigSummary
	err := query(`SELECT id,version,name,checksum FROM agent_configs WHERE org_id=? AND agent_uid=? AND approval_status='approved' ORDER BY version DESC LIMIT 1`, orgID, uid).
		Scan(&latest.ID, &latest.Version, &latest.Name, &latest.Hash)
	if errors.Is(err, sql.ErrNoRows) {
		return approvedConfigSummary{}, nil
	}
	return latest, err
}

func readLatestApprovedConfig(db *sql.DB, orgID int64, uid string) (approvedConfigSummary, error) {
	return readLatestApprovedConfigWith(func(query string, args ...any) rowScanner {
		return db.QueryRow(query, args...)
	}, orgID, uid)
}

func usePersistedRemoteConfigReport(report remoteConfigReport, status, errorMessage, confirmedHash string, at sql.NullTime) remoteConfigReport {
	if report.Found {
		return report
	}
	storedStatus := strings.ToUpper(strings.TrimSpace(status))
	if storedStatus == "" && errorMessage == "" {
		return report
	}
	report.Status = normalizeRemoteConfigStatus(storedStatus)
	report.Error = errorMessage
	if storedStatus == "APPLIED_CONFIRMED" && errorMessage == "" && confirmedHash != "" {
		report.Status = "APPLIED"
		report.Hash = confirmedHash
	}
	report.At = at
	report.Source = "agents"
	report.Found = true
	return report
}

func attachRemoteConfigDecision(result map[string]any, report remoteConfigReport, expectedHash string) configSyncDecision {
	d := decideConfigSync(report.Status, report.Error, report.Hash, expectedHash)
	if report.Status != "" {
		result["remoteConfigStatus"] = report.Status
	}
	if report.Hash != "" {
		result["remoteConfigHash"] = report.Hash
	}
	if report.Error != "" {
		result["remoteConfigError"] = report.Error
	}
	if report.At.Valid {
		result["lastStatusReport"] = report.At.Time.Format(time.RFC3339)
	}
	if report.Source != "" {
		result["remoteConfigStatusSource"] = report.Source
	}
	result["hashMatch"] = d.HashMatch
	result["syncStatus"] = d.SyncStatus
	return d
}

func nullableString(value sql.NullString) string {
	if value.Valid {
		return value.String
	}
	return ""
}
