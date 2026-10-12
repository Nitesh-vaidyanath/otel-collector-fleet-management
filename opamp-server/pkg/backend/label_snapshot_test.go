package main

import (
	"database/sql"
	"strings"
	"testing"
)

type execCapture struct {
	query string
	args  []any
}

func (e *execCapture) Exec(query string, args ...any) (sql.Result, error) {
	e.query = query
	e.args = append([]any(nil), args...)
	return nil, nil
}

func TestProductionLabelSnapshotUpserts(t *testing.T) {
	for _, tc := range []struct {
		name          string
		query         string
		args          []any
		labelArgIndex int
	}{
		{"agent with config", agentConfigUpsertSQL, []any{int64(1), "org", "uid", "name", "v", "online", `{ "new": "value" }`, `{}`, "config", "hash"}, 6},
		{"agent heartbeat", agentHeartbeatUpsertSQL, []any{int64(1), "org", "uid", "name", "v", `{ "new": "value" }`, `{}`}, 5},
		{"bridge", bridgeUpsertSQL, []any{int64(1), "uid", "name", "v", `{ "new": "value" }`, `{}`}, 4},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for _, descriptionProvided := range []bool{false, true} {
				capture := &execCapture{}
				if _, err := execLabelSnapshot(capture, tc.query, tc.args, descriptionProvided); err != nil {
					t.Fatal(err)
				}
				if capture.query != tc.query {
					t.Fatal("executor did not receive production UPSERT SQL")
				}
				if strings.Count(capture.query, "?") != len(capture.args) {
					t.Fatalf("placeholder count=%d args=%d", strings.Count(capture.query, "?"), len(capture.args))
				}
				if got := capture.args[len(capture.args)-1]; got != descriptionProvided {
					t.Fatalf("description gate=%v, want %v", got, descriptionProvided)
				}
				if got := capture.args[tc.labelArgIndex]; got != tc.args[tc.labelArgIndex] {
					t.Fatalf("candidate insert snapshot changed: got %v want %v", got, tc.args[tc.labelArgIndex])
				}
				if !strings.Contains(capture.query, "labels_json = "+labelSnapshotExpression) {
					t.Fatal("production statement lacks snapshot presence gate")
				}
			}
		})
	}
}

func TestLabelSnapshotPresenceSemantics(t *testing.T) {
	old := map[string]string{"classification.status": "unclassified", "obsolete": "remove"}
	heartbeat := map[string]string{"classification.status": "unclassified"}
	description := map[string]string{"service.name": "collector"}
	apply := func(existing, offered map[string]string, descriptionProvided bool) map[string]string {
		if descriptionProvided {
			return offered
		}
		return existing
	}
	if got := apply(old, heartbeat, false); len(got) != 2 || got["obsolete"] != "remove" {
		t.Fatalf("heartbeat changed persisted labels: %#v", got)
	}
	if got := apply(old, description, true); len(got) != 1 || got["service.name"] != "collector" {
		t.Fatalf("description did not replace complete snapshot: %#v", got)
	}
	if got := apply(old, map[string]string{}, true); len(got) != 0 {
		t.Fatalf("empty real description did not remove labels: %#v", got)
	}
}
