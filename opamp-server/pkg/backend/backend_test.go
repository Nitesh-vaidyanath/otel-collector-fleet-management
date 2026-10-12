package main

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/open-telemetry/opamp-go/protobufs"
)

func TestConfigGeneratorHandler(t *testing.T) {
	body := `{"receivers":[{"name":"otlp","type":"otlp","protocols":{"grpc":{"endpoint":"0.0.0.0:4317"}}}],"exporters":[{"name":"debug","type":"debug","loglevel":"info"}],"processors":[],"service":{}}`
	req := httptest.NewRequest("POST", "/", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	configGeneratorHandler(resp, req, reqCtx{OrgID: 1, UserID: 1})
	if resp.Code != 200 {
		t.Fatalf("status=%d body=%s", resp.Code, resp.Body.String())
	}
	var result map[string]any
	if err := json.Unmarshal(resp.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	config, ok := result["config"].(string)
	if !ok || (!strings.Contains(config, "receivers:") && !strings.Contains(config, "exporters:")) {
		t.Fatalf("unexpected generated config: %#v", result["config"])
	}
}

func TestBuildComponentMap(t *testing.T) {
	components := []map[string]any{{"name": "otlp", "type": "otlp", "protocols": map[string]any{"grpc": map[string]any{"endpoint": "0.0.0.0:4317"}}}}
	if result := buildComponentMap(components); result["otlp"] == nil {
		t.Fatalf("component map omitted otlp: %#v", result)
	}
}

func TestMetadataLoggerDoesNotEmitSentinels(t *testing.T) {
	oldLogger := appLogger
	appLogger = nil
	defer func() { appLogger = oldLogger }()
	oldLevel := GetLogLevel()
	if err := SetLogLevel("debug"); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = SetLogLevel(oldLevel) }()
	var output bytes.Buffer
	oldOutput := log.Writer()
	log.SetOutput(&output)
	defer log.SetOutput(oldOutput)
	message := &protobufs.AgentToServer{
		AgentDescription:   &protobufs.AgentDescription{IdentifyingAttributes: []*protobufs.KeyValue{{Key: "sentinel-key", Value: &protobufs.AnyValue{Value: &protobufs.AnyValue_StringValue{StringValue: "sentinel-label-value"}}}}},
		RemoteConfigStatus: &protobufs.RemoteConfigStatus{Status: protobufs.RemoteConfigStatuses_RemoteConfigStatuses_FAILED, LastRemoteConfigHash: []byte("sentinel-hash"), ErrorMessage: "sentinel-error"},
	}
	logAgentToServerDebug("sentinel-instance", message)
	for _, sentinel := range []string{"sentinel-key", "sentinel-label-value", "sentinel-hash", "sentinel-error"} {
		if strings.Contains(output.String(), sentinel) {
			t.Fatalf("metadata log leaked %q: %s", sentinel, output.String())
		}
	}
}

func TestPushConfigDoesNotLogConfigBodyPreviews(t *testing.T) {
	source, err := os.ReadFile("opamp.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(source)
	for _, forbidden := range []string{"FULL CONFIG YAML", "string(configFile.Body)", "string(v.Body)", "configFile.Body[:"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("PushConfig source contains config body preview marker %q", forbidden)
		}
	}
}
