package main

import (
	"database/sql"
	"strings"
	"testing"

	"github.com/open-telemetry/opamp-go/protobufs"
)

func TestRemoteConfigStatusTransitionsGateConfirmedHash(t *testing.T) {
	const a, b = "hash-a", "hash-b"
	if !shouldUpdateEffectiveConfigHash(protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLIED, a, "") {
		t.Fatal("APPLIED should update confirmed hash")
	}
	for _, tc := range []struct {
		name      string
		status    protobufs.RemoteConfigStatuses
		hash, err string
	}{
		{"applying", protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLYING, b, ""},
		{"failed", protobufs.RemoteConfigStatuses_RemoteConfigStatuses_FAILED, b, "bad config"},
		{"applied with error", protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLIED, b, "bad config"},
		{"empty hash", protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLIED, "", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if shouldUpdateEffectiveConfigHash(tc.status, tc.hash, tc.err) {
				t.Fatal("unconfirmed config hash would overwrite the last applied hash")
			}
		})
	}
	for _, tc := range []struct {
		status, error string
		want          string
		match         bool
	}{
		{"APPLIED", "", "synced", true},
		{"RemoteConfigStatuses_APPLIED", "", "synced", true},
		{"RemoteConfigStatuses_RemoteConfigStatuses_APPLIED", "", "synced", true},
		{"APPLYING", "", "pending_sync", false},
		{"FAILED", "", "not_synced", false},
		{"FAILED", "failed", "not_synced", false},
		{"APPLIED", "failed", "not_synced", false},
		{"UNSET", "", "unknown", false},
		{"", "", "unknown", false},
	} {
		t.Run(tc.status+"/"+tc.error, func(t *testing.T) {
			got := decideConfigSync(tc.status, tc.error, b, b)
			if got.SyncStatus != tc.want || got.HashMatch != tc.match {
				t.Fatalf("got %#v, want status %s hashMatch %v", got, tc.want, tc.match)
			}
		})
	}
	if got := decideConfigSync("APPLIED", "", a, b); got.SyncStatus != "not_synced" || got.HashMatch {
		t.Fatalf("mismatch decision: %#v", got)
	}
}

type fakeTelemetryRow struct {
	data string
	at   sql.NullTime
	err  error
}

func (r fakeTelemetryRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	data := dest[0].(*sql.NullString)
	at := dest[1].(*sql.NullTime)
	*data = sql.NullString{String: r.data, Valid: r.data != "<null>"}
	*at = r.at
	return nil
}

func TestConfirmedHashSurvivesFailedAndApplyingOffers(t *testing.T) {
	confirmed := ""
	apply := func(status protobufs.RemoteConfigStatuses, hash, diagnostic string) {
		if shouldUpdateEffectiveConfigHash(status, hash, diagnostic) {
			confirmed = hash
		}
	}
	apply(protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLIED, "A", "")
	apply(protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLYING, "B", "")
	if confirmed != "A" {
		t.Fatalf("APPLYING replaced confirmed hash: %s", confirmed)
	}
	apply(protobufs.RemoteConfigStatuses_RemoteConfigStatuses_FAILED, "B", "rejected")
	if confirmed != "A" {
		t.Fatalf("FAILED replaced confirmed hash: %s", confirmed)
	}
	if d := decideConfigSync("FAILED", "rejected", "A", "A"); d.SyncStatus == "synced" {
		t.Fatalf("equal hash failure considered synced: %#v", d)
	}
	apply(protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLIED, "B", "")
	if confirmed != "B" {
		t.Fatalf("APPLIED did not replace confirmed hash: %s", confirmed)
	}
}

func TestCanonicalRemoteConfigStatusUsesEnumValue(t *testing.T) {
	if got := canonicalRemoteConfigStatus(protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLIED); got != "APPLIED" {
		t.Fatalf("got %q", got)
	}
	if got := normalizeRemoteConfigStatus("RemoteConfigStatuses_FAILED"); got != "FAILED" {
		t.Fatalf("legacy status not normalized: %q", got)
	}
}

func TestParseRemoteConfigTelemetry(t *testing.T) {
	r := parseRemoteConfigTelemetry(`{"status":"RemoteConfigStatuses_APPLYING","last_remote_config_hash":"h","error_message":"diagnostic"}`)
	if r.Status != "APPLYING" || r.Hash != "h" || r.Error != "diagnostic" {
		t.Fatalf("unexpected report: %#v", r)
	}
	if got := parseRemoteConfigTelemetry(`{"status":"garbage"}`).Status; got != "UNKNOWN" {
		t.Fatalf("unknown state became %q", got)
	}
}

func TestRemoteConfigTelemetryHealthFallbackRules(t *testing.T) {
	if hasRemoteConfigTelemetryFields(`{"healthy":true,"component_count":2}`) {
		t.Fatal("ordinary component health was mistaken for a remote-config report")
	}
	if !hasRemoteConfigTelemetryFields(`{"status":"RemoteConfigStatuses_FAILED"}`) {
		t.Fatal("legacy canonical status was not recognized")
	}
	malformedDedicated := parseRemoteConfigTelemetry(`{"status":"APPLIED"}`)
	malformedDedicated.Found = true
	malformedDedicated.Source = "remote_config_status"
	malformedDedicated = usePersistedRemoteConfigReport(malformedDedicated, "FAILED", "old failure", "confirmed-A", sql.NullTime{})
	if malformedDedicated.Hash != "" || malformedDedicated.Status != "APPLIED" {
		t.Fatalf("dedicated report borrowed persisted hash: %#v", malformedDedicated)
	}
	if d := decideConfigSync(malformedDedicated.Status, malformedDedicated.Error, malformedDedicated.Hash, "confirmed-A"); d.HashMatch || d.SyncStatus != "unknown" {
		t.Fatalf("missing-hash dedicated report falsely synced: %#v", d)
	}
	persisted := usePersistedRemoteConfigReport(remoteConfigReport{}, "FAILED", "persisted failure", "confirmed-A", sql.NullTime{})
	if !persisted.Found || persisted.Status != "FAILED" || persisted.Hash != "" || persisted.Source != "agents" {
		t.Fatalf("pruned telemetry fallback lost persisted state: %#v", persisted)
	}
}

func TestDedicatedRemoteConfigTelemetryTakesPrecedence(t *testing.T) {
	dedicated := parseRemoteConfigTelemetry(`{"status":"APPLYING","last_remote_config_hash":"offered-B"}`)
	dedicated.Found = true
	dedicated.Source = "remote_config_status"
	report := usePersistedRemoteConfigReport(dedicated, "APPLIED", "", "confirmed-A", sql.NullTime{})
	if report.Status != "APPLYING" || report.Hash != "offered-B" || report.Source != "remote_config_status" {
		t.Fatalf("persisted state overrode dedicated telemetry: %#v", report)
	}
}

func TestPersistedConfirmedMarkerSurvivesPruningFailClosed(t *testing.T) {
	const (
		applied  = protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLIED
		applying = protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLYING
		failed   = protobufs.RemoteConfigStatuses_RemoteConfigStatuses_FAILED
		unset    = protobufs.RemoteConfigStatuses_RemoteConfigStatuses_UNSET
	)
	type transition struct {
		name, hash, err                    string
		status                             protobufs.RemoteConfigStatuses
		wantStored, wantHash, wantDecision string
		accepted                           bool
	}
	for _, tc := range []transition{
		{"applied A", "A", "", applied, "APPLIED_CONFIRMED", "A", "synced", true},
		{"applied missing hash", "", "", applied, "APPLIED", "", "not_synced", false},
		{"failed B", "B", "rejected", failed, "FAILED", "", "not_synced", false},
		{"applying B", "B", "", applying, "APPLYING", "", "pending_sync", false},
		{"unknown enum", "B", "", protobufs.RemoteConfigStatuses(99), "UNKNOWN", "", "unknown", false},
		{"unset", "", "", unset, "UNSET", "", "unknown", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			storedStatus, storedError, accepted := persistedRemoteConfigState(tc.status, tc.hash, tc.err)
			if storedStatus != tc.wantStored || accepted != tc.accepted {
				t.Fatalf("persisted state=(%q,%v), want (%q,%v)", storedStatus, accepted, tc.wantStored, tc.accepted)
			}
			if tc.name == "applied missing hash" && storedError != "APPLIED report missing configuration hash" {
				t.Fatalf("missing-hash diagnostic=%q", storedError)
			}
			report := usePersistedRemoteConfigReport(remoteConfigReport{}, storedStatus, storedError, "A", sql.NullTime{})
			if report.Hash != tc.wantHash {
				t.Fatalf("pruned report exposed hash %q, want %q", report.Hash, tc.wantHash)
			}
			decision := decideConfigSync(report.Status, report.Error, report.Hash, "A")
			if decision.SyncStatus != tc.wantDecision || decision.HashMatch != (tc.wantDecision == "synced") {
				t.Fatalf("pruned report decision=%#v, want %s", decision, tc.wantDecision)
			}
		})
	}
	for _, oldApplied := range []string{"APPLIED", "RemoteConfigStatuses_APPLIED", "RemoteConfigStatuses_RemoteConfigStatuses_APPLIED"} {
		report := usePersistedRemoteConfigReport(remoteConfigReport{}, oldApplied, "", "A", sql.NullTime{})
		if report.Hash != "" || decideConfigSync(report.Status, report.Error, report.Hash, "A").HashMatch {
			t.Fatalf("ambiguous legacy status %q incorrectly confirmed persisted hash: %#v", oldApplied, report)
		}
	}
}

func TestReadRemoteConfigReportQueryBoundaryAndErrors(t *testing.T) {
	testCases := []struct {
		name                   string
		dedicated, health      fakeTelemetryRow
		wantCalls              int
		wantSource, wantStatus string
		wantHash               bool
		wantErr                bool
	}{
		{"dedicated valid", fakeTelemetryRow{data: `{"status":"APPLIED","last_remote_config_hash":"B"}`}, fakeTelemetryRow{err: sql.ErrNoRows}, 1, "remote_config_status", "APPLIED", true, false},
		{"dedicated malformed authoritative", fakeTelemetryRow{data: "<null>"}, fakeTelemetryRow{data: `{"healthy":true}`}, 1, "remote_config_status", "", false, false},
		{"ordinary health skipped", fakeTelemetryRow{err: sql.ErrNoRows}, fakeTelemetryRow{data: `{"healthy":true}`}, 2, "", "", false, false},
		{"health legacy remote config", fakeTelemetryRow{err: sql.ErrNoRows}, fakeTelemetryRow{data: `{"status":"FAILED","last_remote_config_hash":"B"}`}, 2, "health", "FAILED", true, false},
		{"dedicated query error stops fallback", fakeTelemetryRow{err: sql.ErrConnDone}, fakeTelemetryRow{data: `{"status":"APPLIED","last_remote_config_hash":"A"}`}, 1, "", "", false, true},
		{"health query error stops persisted fallback", fakeTelemetryRow{err: sql.ErrNoRows}, fakeTelemetryRow{err: sql.ErrConnDone}, 2, "", "", false, true},
		{"both absent permits persisted fallback", fakeTelemetryRow{err: sql.ErrNoRows}, fakeTelemetryRow{err: sql.ErrNoRows}, 2, "", "", false, false},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			report, err := readRemoteConfigReportWith(func(_ string, args ...any) rowScanner {
				calls++
				if args[2] == "remote_config_status" {
					return tc.dedicated
				}
				return tc.health
			}, 1, "uid")
			if (err != nil) != tc.wantErr || calls != tc.wantCalls {
				t.Fatalf("calls=%d err=%v", calls, err)
			}
			if report.Source != tc.wantSource || report.Status != tc.wantStatus || (report.Hash != "") != tc.wantHash {
				t.Fatalf("report=%#v", report)
			}
		})
	}
}

func TestReadLatestApprovedConfigUsesHighestVersionQuery(t *testing.T) {
	calls := 0
	latest, err := readLatestApprovedConfigWith(func(query string, args ...any) rowScanner {
		calls++
		if args[0] != int64(1) || args[1] != "uid" || !strings.Contains(query, "ORDER BY version DESC LIMIT 1") {
			t.Fatalf("unexpected latest-approved query %q args=%v", query, args)
		}
		return approvedConfigRow{}
	}, 1, "uid")
	if err != nil || calls != 1 || !latest.Hash.Valid || latest.Hash.String != "B" {
		t.Fatalf("latest=%#v calls=%d err=%v", latest, calls, err)
	}
	decision := decideConfigSync("APPLIED", "", "A", latest.Hash.String)
	if decision.HashMatch || decision.SyncStatus != "not_synced" {
		t.Fatalf("older approved config A incorrectly synced over latest B: %#v", decision)
	}
}

func TestLatestValidAppliedHashSurvivesPruning(t *testing.T) {
	status, diagnostic, accepted := persistedRemoteConfigState(protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLIED, "B", "")
	if !accepted || diagnostic != "" {
		t.Fatalf("valid APPLIED report state=%q diag=%q accepted=%v", status, diagnostic, accepted)
	}
	report := usePersistedRemoteConfigReport(remoteConfigReport{}, status, diagnostic, "B", sql.NullTime{})
	if got := decideConfigSync(report.Status, report.Error, report.Hash, "B"); !got.HashMatch || got.SyncStatus != "synced" {
		t.Fatalf("valid confirmed marker did not restore canonical APPLIED: report=%#v decision=%#v", report, got)
	}
}

type approvedConfigRow struct{}

func (approvedConfigRow) Scan(dest ...any) error {
	*dest[0].(*sql.NullInt64) = sql.NullInt64{Int64: 2, Valid: true}
	*dest[1].(*sql.NullInt64) = sql.NullInt64{Int64: 2, Valid: true}
	*dest[2].(*sql.NullString) = sql.NullString{String: "latest", Valid: true}
	*dest[3].(*sql.NullString) = sql.NullString{String: "B", Valid: true}
	return nil
}
