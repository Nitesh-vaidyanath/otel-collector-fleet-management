package main

import (
	"errors"
	"net/http"
	"strings"
	"testing"
)

func TestProjectedTokenHeaderReloadAndFailClosed(t *testing.T) {
	value := "synthetic-first"
	var readErr error
	reads := 0
	reader := tokenFileHeaders("/synthetic/projected/token", func(path string) ([]byte, error) {
		if path != "/synthetic/projected/token" {
			t.Fatal("unexpected path")
		}
		reads++
		return []byte(value), readErr
	})
	original := http.Header{"Authorization": {"Bearer stale"}, "Other": {"kept"}}
	first := reader(original)
	if first.Get("Authorization") != "Bearer synthetic-first" || original.Get("Authorization") != "Bearer stale" {
		t.Fatal("first read or immutable input failed")
	}
	value = "synthetic-rotated\n"
	second := reader(first)
	if second.Get("Authorization") != "Bearer synthetic-rotated" {
		t.Fatal("credential did not rotate")
	}
	readErr = errors.New("synthetic unavailable")
	if reader(second).Get("Authorization") != "" {
		t.Fatal("retained credential after read failure")
	}
	readErr = nil
	for _, invalid := range []string{"", "  ", "injected\r\nheader", strings.Repeat("x", 65537)} {
		value = invalid
		if reader(second).Get("Authorization") != "" {
			t.Fatal("accepted an invalid credential")
		}
	}
	if reads != 7 {
		t.Fatalf("expected a new file read on every dial, got %d", reads)
	}
}

func TestManagedEndpointRequiresVerifiedTLS(t *testing.T) {
	if validateEndpoint("wss://opamp.example.net/v1/opamp") != nil {
		t.Fatal("valid WSS rejected")
	}
	for _, endpoint := range []string{"ws://opamp.example.net/v1/opamp", "wss://user:credential@opamp.example.net", "wss://opamp.example.net?token=x", "wss://opamp.example.net#x", "wss:///no-host"} {
		if validateEndpoint(endpoint) == nil {
			t.Fatal("accepted unsafe endpoint")
		}
	}
}
