// managed-client demonstrates the projected-token authentication contract.
// It reports synthetic health only: it does not inspect processes, execute
// commands, apply application config or grant operating-system privileges.
package main

import (
	"context"
	"crypto/rand"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/open-telemetry/opamp-go/client"
	clienttypes "github.com/open-telemetry/opamp-go/client/types"
	"github.com/open-telemetry/opamp-go/protobufs"
)

func tokenFileHeaders(tokenPath string, readFile func(string) ([]byte, error)) func(http.Header) http.Header {
	return func(headers http.Header) http.Header {
		if headers == nil {
			headers = make(http.Header)
		} else {
			headers = headers.Clone()
		}
		// Clear a previously cached credential first, including on rotation failure.
		headers.Del("Authorization")
		body, err := readFile(tokenPath)
		if err != nil || len(body) == 0 || len(body) > 65536 {
			return headers // The server rejects an unauthenticated attempt.
		}
		token := strings.TrimSpace(string(body))
		if token == "" || strings.ContainsAny(token, "\r\n \t") {
			return headers
		}
		headers.Set("Authorization", "Bearer "+token)
		return headers
	}
}

func validateEndpoint(endpoint string) error {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "wss" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return errors.New("OPAMP_ENDPOINT must be a WSS URL without credentials, query or fragment")
	}
	return nil
}

func main() {
	endpoint := os.Getenv("OPAMP_ENDPOINT")
	tokenPath := os.Getenv("OPAMP_AUTH_TOKEN_FILE")
	if validateEndpoint(endpoint) != nil || tokenPath == "" {
		log.Fatal("Set OPAMP_ENDPOINT to a WSS URL and OPAMP_AUTH_TOKEN_FILE to the projected token file")
	}
	var wireUID clienttypes.InstanceUid
	if _, err := rand.Read(wireUID[:]); err != nil {
		log.Fatal("Could not generate an instance identity")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	opampClient := client.NewWebSocket(nil)
	if err := opampClient.SetAgentDescription(&protobufs.AgentDescription{
		IdentifyingAttributes: []*protobufs.KeyValue{{Key: "service.name", Value: &protobufs.AnyValue{Value: &protobufs.AnyValue_StringValue{StringValue: "fleet-managed-reference-client"}}}},
	}); err != nil {
		log.Fatal("Could not set reference client description")
	}
	caps := protobufs.AgentCapabilities_AgentCapabilities_ReportsHealth
	if err := opampClient.SetCapabilities(&caps); err != nil {
		log.Fatal("Could not set reference client capabilities")
	}
	if err := opampClient.SetHealth(&protobufs.ComponentHealth{Healthy: true, Status: "SYNTHETIC_REFERENCE_CLIENT"}); err != nil {
		log.Fatal("Could not set reference client health")
	}
	interval := 5 * time.Second
	if err := opampClient.Start(ctx, clienttypes.StartSettings{
		OpAMPServerURL:    endpoint,
		InstanceUid:       wireUID,
		HeaderFunc:        tokenFileHeaders(tokenPath, os.ReadFile),
		HeartbeatInterval: &interval,
		Callbacks: clienttypes.Callbacks{
			OnConnect:       func(context.Context) { log.Print("Reference client connected; no workload operations are enabled") },
			OnConnectFailed: func(context.Context, error) { log.Print("Reference client connection rejected or unavailable") },
			OnError: func(context.Context, *protobufs.ServerErrorResponse) {
				log.Print("Reference client received a protocol error")
			},
			CheckRedirect: func(*http.Request, []*http.Request, []*http.Response) error {
				return errors.New("redirects are disabled for managed credentials")
			},
		},
	}); err != nil {
		log.Fatal("Could not start reference client")
	}
	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = opampClient.Stop(shutdown)
}
