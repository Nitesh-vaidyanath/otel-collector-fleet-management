package main

import (
	"context"
	"encoding/binary"
	"flag"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/open-telemetry/opamp-go/client"
	clienttypes "github.com/open-telemetry/opamp-go/client/types"
	"github.com/open-telemetry/opamp-go/protobufs"
	"google.golang.org/protobuf/proto"
)

func attr(key, value string) *protobufs.KeyValue {
	return &protobufs.KeyValue{Key: key, Value: &protobufs.AnyValue{Value: &protobufs.AnyValue_StringValue{StringValue: value}}}
}

func main() {
	endpoint := flag.String("endpoint", "ws://grafana:4321/v1/opamp", "OpAMP WebSocket URL on the isolated manual-test network")
	typeName := flag.String("type", "agent", "synthetic classification: agent or bridge")
	duration := flag.Duration("duration", 20*time.Second, "time to keep the client connected")
	flag.Parse()
	if *typeName != "agent" && *typeName != "bridge" {
		log.Fatalf("unsupported type %q: use agent or bridge", *typeName)
	}

	wireUID := "e2e-agent-000001"
	if *typeName == "bridge" {
		wireUID = "e2e-bridge-00001"
	}
	var uid clienttypes.InstanceUid
	copy(uid[:], []byte(wireUID))
	log.Printf("fixture=%s wire_instance_uid_hex=%x wire_instance_uid_text=%q endpoint=%s", *typeName, uid[:], string(uid[:]), *endpoint)
	probeUID := []byte("e2e-probe-000001")
	if err := observeServerCapabilities(*endpoint, probeUID); err != nil {
		log.Fatalf("ServerToAgent capability probe failed: %v", err)
	}

	connected := make(chan struct{}, 1)
	remoteConfigSeen := make(chan struct{}, 1)
	protocolErrors := make(chan error, 4)
	var configApplied atomic.Bool
	var effectiveConfigMu sync.RWMutex
	effectiveConfig := syntheticEffectiveConfig()
	opampClient := client.NewWebSocket(nil)
	if err := opampClient.SetAgentDescription(&protobufs.AgentDescription{
		IdentifyingAttributes: []*protobufs.KeyValue{attr("service.name", "io.opentelemetry.collector")},
		NonIdentifyingAttributes: []*protobufs.KeyValue{
			attr("service.version", "0.0.0-e2e"),
			attr("deployment.type", "synthetic"),
			attr("e2e.fixture", "opamp-protocol"),
		},
	}); err != nil {
		log.Fatal(err)
	}
	if err := opampClient.SetHealth(&protobufs.ComponentHealth{
		Healthy: true, Status: "HEALTHY", StartTimeUnixNano: uint64(time.Now().UnixNano()),
		StatusTimeUnixNano: uint64(time.Now().UnixNano()),
	}); err != nil {
		log.Fatal(err)
	}
	capabilities := protobufs.AgentCapabilities_AgentCapabilities_ReportsHealth |
		protobufs.AgentCapabilities_AgentCapabilities_ReportsEffectiveConfig |
		protobufs.AgentCapabilities_AgentCapabilities_AcceptsRemoteConfig |
		protobufs.AgentCapabilities_AgentCapabilities_ReportsRemoteConfig
	if err := opampClient.SetCapabilities(&capabilities); err != nil {
		log.Fatal(err)
	}
	log.Printf("agent_to_server.capabilities_bits=%d", uint64(capabilities|protobufs.AgentCapabilities_AgentCapabilities_ReportsStatus))

	ctx, cancel := context.WithTimeout(context.Background(), *duration+15*time.Second)
	defer cancel()
	err := opampClient.Start(ctx, clienttypes.StartSettings{
		OpAMPServerURL:    *endpoint,
		InstanceUid:       uid,
		Header:            http.Header{"X-OpAMP-Agent-Type": []string{*typeName}},
		HeartbeatInterval: durationPtr(5 * time.Second),
		Callbacks: clienttypes.Callbacks{
			OnConnect: func(context.Context) {
				log.Printf("websocket_handshake=connected classification=%s", *typeName)
				select {
				case connected <- struct{}{}:
				default:
				}
			},
			OnConnectFailed: func(_ context.Context, err error) {
				log.Printf("websocket_handshake=failed error=%v", err)
				select {
				case protocolErrors <- err:
				default:
				}
			},
			OnError: func(_ context.Context, err *protobufs.ServerErrorResponse) {
				log.Printf("server_error=%s", err.ErrorMessage)
				select {
				case protocolErrors <- fmt.Errorf("server error: %s", err.ErrorMessage):
				default:
				}
			},
			OnMessage: func(ctx context.Context, msg *clienttypes.MessageData) {
				if msg.RemoteConfig == nil {
					return
				}
				log.Printf("server_to_agent.remote_config=received config_hash=%x files=%d", msg.RemoteConfig.ConfigHash, len(msg.RemoteConfig.GetConfig().GetConfigMap()))
				if !isSyntheticRemoteConfig(msg.RemoteConfig) {
					err := fmt.Errorf("refusing remote config without the synthetic e2e.fixture marker")
					log.Printf("remote_config_rejected reason=non_synthetic_payload")
					select {
					case protocolErrors <- err:
					default:
					}
					return
				}
				effectiveConfigMu.Lock()
				effectiveConfig = &protobufs.EffectiveConfig{ConfigMap: proto.Clone(msg.RemoteConfig.Config).(*protobufs.AgentConfigMap)}
				effectiveConfigMu.Unlock()
				if err := opampClient.SetRemoteConfigStatus(&protobufs.RemoteConfigStatus{
					Status:               protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLIED,
					LastRemoteConfigHash: append([]byte(nil), msg.RemoteConfig.ConfigHash...),
				}); err != nil {
					log.Printf("remote_config_ack_error=%v", err)
					select {
					case protocolErrors <- err:
					default:
					}
					return
				}
				if err := opampClient.UpdateEffectiveConfig(ctx); err != nil {
					log.Printf("effective_config_update_error=%v", err)
					select {
					case protocolErrors <- err:
					default:
					}
					return
				}
				configApplied.Store(true)
				log.Printf("agent_to_server.remote_config_status=APPLIED hash=%x", msg.RemoteConfig.ConfigHash)
				select {
				case remoteConfigSeen <- struct{}{}:
				default:
				}
			},
			GetEffectiveConfig: func(context.Context) (*protobufs.EffectiveConfig, error) {
				effectiveConfigMu.RLock()
				defer effectiveConfigMu.RUnlock()
				return proto.Clone(effectiveConfig).(*protobufs.EffectiveConfig), nil
			},
		},
	})
	if err != nil {
		log.Fatal(err)
	}

	select {
	case <-connected:
	case err := <-protocolErrors:
		log.Fatalf("OpAMP connection failed: %v", err)
	case <-time.After(15 * time.Second):
		log.Fatal("timed out waiting for OpAMP WebSocket handshake; inspect Grafana backend logs and endpoint")
	}
	if err := opampClient.UpdateEffectiveConfig(ctx); err != nil {
		log.Fatalf("send effective config: %v", err)
	}
	if err := opampClient.SetHealth(&protobufs.ComponentHealth{
		Healthy: true, Status: "HEALTHY", StartTimeUnixNano: uint64(time.Now().UnixNano()),
		StatusTimeUnixNano: uint64(time.Now().UnixNano()),
	}); err != nil {
		log.Fatalf("send health: %v", err)
	}
	log.Printf("agent_to_server.health=HEALTHY effective_config=synthetic.yaml")

	deadline := time.NewTimer(*duration)
	defer deadline.Stop()
	for {
		select {
		case <-remoteConfigSeen:
			goto finished
		case err := <-protocolErrors:
			log.Fatalf("OpAMP protocol error: %v", err)
		case <-deadline.C:
			log.Printf("server_to_agent.remote_config=not_offered during fixture window")
			goto finished
		}
	}

finished:
	if err := opampClient.Stop(context.Background()); err != nil {
		log.Fatalf("client_stop_error=%v", err)
	}
	if configApplied.Load() {
		log.Printf("result=PASS remote_config_received_and_acknowledged")
	} else {
		log.Printf("result=PASS handshake_status_and_effective_config_exercised; remote_config_offer_not_exercised")
	}
}

func durationPtr(d time.Duration) *time.Duration { return &d }

func syntheticEffectiveConfig() *protobufs.EffectiveConfig {
	return &protobufs.EffectiveConfig{ConfigMap: &protobufs.AgentConfigMap{ConfigMap: map[string]*protobufs.AgentConfigFile{
		"synthetic.yaml": {Body: []byte("receivers: {}\nprocessors: {}\nexporters: {}\nservice: {}\n# e2e.fixture: opamp-e2e\n"), ContentType: "text/yaml"},
	}}}
}

func isSyntheticRemoteConfig(config *protobufs.AgentRemoteConfig) bool {
	if config == nil || config.Config == nil || len(config.Config.ConfigMap) == 0 {
		return false
	}
	for _, file := range config.Config.ConfigMap {
		if file == nil || !strings.Contains(string(file.Body), "e2e.fixture: opamp-e2e") {
			return false
		}
	}
	return true
}

// observeServerCapabilities performs one OpAMP WebSocket exchange and decodes
// ServerToAgent directly. The public opamp-go client callback intentionally
// omits this protocol-level capability field.
func observeServerCapabilities(endpoint string, uid []byte) error {
	conn, _, err := websocket.DefaultDialer.Dial(endpoint, http.Header{"X-OpAMP-Agent-Type": []string{"agent"}})
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()
	request := &protobufs.AgentToServer{
		InstanceUid:  uid,
		Capabilities: uint64(protobufs.AgentCapabilities_AgentCapabilities_ReportsStatus),
		AgentDescription: &protobufs.AgentDescription{
			IdentifyingAttributes:    []*protobufs.KeyValue{attr("service.name", "io.opentelemetry.collector")},
			NonIdentifyingAttributes: []*protobufs.KeyValue{attr("service.version", "0.0.0-e2e"), attr("deployment.type", "synthetic"), attr("e2e.fixture", "opamp-protocol-probe")},
		},
	}
	encoded, err := proto.Marshal(request)
	if err != nil {
		return fmt.Errorf("marshal AgentToServer: %w", err)
	}
	header := make([]byte, binary.MaxVarintLen64)
	n := binary.PutUvarint(header, 0) // OpAMP WebSocket message header from opamp-go v0.22.0.
	frame := append(header[:n], encoded...)
	if err := conn.WriteMessage(websocket.BinaryMessage, frame); err != nil {
		return fmt.Errorf("write AgentToServer: %w", err)
	}
	_, payload, err := conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("read ServerToAgent: %w", err)
	}
	if len(payload) == 0 || payload[0] != 0 {
		return fmt.Errorf("unexpected OpAMP WebSocket header: %x", payload)
	}
	_, n = binary.Uvarint(payload)
	if n <= 0 {
		return fmt.Errorf("invalid OpAMP WebSocket header")
	}
	var response protobufs.ServerToAgent
	if err := proto.Unmarshal(payload[n:], &response); err != nil {
		return fmt.Errorf("unmarshal ServerToAgent: %w", err)
	}
	if string(response.InstanceUid) != string(uid) {
		return fmt.Errorf("ServerToAgent UID mismatch: got %x want %x", response.InstanceUid, uid)
	}
	if response.RemoteConfig != nil {
		return fmt.Errorf("probe UID has an unexpected pending config; refusing to inspect or apply it")
	}
	const expected uint64 = uint64(protobufs.ServerCapabilities_ServerCapabilities_AcceptsStatus |
		protobufs.ServerCapabilities_ServerCapabilities_OffersRemoteConfig |
		protobufs.ServerCapabilities_ServerCapabilities_AcceptsEffectiveConfig)
	if response.Capabilities != expected {
		return fmt.Errorf("ServerToAgent capabilities mismatch: got 0x%x want 0x%x", response.Capabilities, expected)
	}
	log.Printf("server_to_agent.probe_uid_hex=%x capabilities_bits=0x%x uid_echo_matches=true", uid, response.Capabilities)
	return nil
}
