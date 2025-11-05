package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestConfigGeneratorHandler(t *testing.T) {
	handler := configGeneratorHandler
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handler(w, r, reqCtx{OrgID: 1, UserID: 1})
	}))
	defer server.Close()

	reqBody := map[string]interface{}{
		"receivers": []map[string]interface{}{
			{
				"name": "otlp",
				"type": "otlp",
				"protocols": map[string]interface{}{
					"grpc": map[string]interface{}{
						"endpoint": "0.0.0.0:4317",
					},
				},
			},
		},
		"exporters": []map[string]interface{}{
			{
				"name":     "debug",
				"type":     "debug",
				"loglevel": "info",
			},
		},
		"processors": []map[string]interface{}{},
		"service":    map[string]interface{}{},
	}

	jsonBody, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest("POST", server.URL, bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to make request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	config, ok := result["config"].(string)
	if !ok {
		t.Fatal("Config not found in response")
	}

	if !contains(config, "receivers:") && !contains(config, "exporters:") {
		t.Error("Generated config should contain YAML format")
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 || 
		(len(s) > len(substr) && (s[:len(substr)] == substr || s[len(s)-len(substr):] == substr || 
			bytes.Contains([]byte(s), []byte(substr)))))
}

func TestBuildComponentMap(t *testing.T) {
	components := []map[string]interface{}{
		{
			"name": "otlp",
			"type": "otlp",
			"protocols": map[string]interface{}{
				"grpc": map[string]interface{}{
					"endpoint": "0.0.0.0:4317",
				},
			},
		},
	}

	result := buildComponentMap(components)
	
	if result["otlp"] == nil {
		t.Error("Component map should contain 'otlp' key")
	}
}

