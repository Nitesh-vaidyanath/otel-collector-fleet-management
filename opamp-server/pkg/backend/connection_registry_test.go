package main

import (
	"context"
	"fmt"
	"net"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/open-telemetry/opamp-go/protobufs"
)

type registryTestConnection struct{}

func (registryTestConnection) Connection() net.Conn                                 { return nil }
func (registryTestConnection) Send(context.Context, *protobufs.ServerToAgent) error { return nil }
func (registryTestConnection) Disconnect() error                                    { return nil }

type concurrentSendConnection struct{ active atomic.Int32 }

func (*concurrentSendConnection) Connection() net.Conn { return nil }
func (c *concurrentSendConnection) Send(context.Context, *protobufs.ServerToAgent) error {
	if c.active.Add(1) != 1 {
		return fmt.Errorf("concurrent Send call")
	}
	runtime.Gosched()
	time.Sleep(time.Microsecond)
	c.active.Add(-1)
	return nil
}
func (*concurrentSendConnection) Disconnect() error { return nil }

func TestConnectionRegistryDeletesEveryOwnedAlias(t *testing.T) {
	registry := newConnectionRegistry()
	bridge := registryTestConnection{}
	registry.put("bridge-1", &agentConnection{conn: bridge, instanceUID: "bridge-1", originalUID: []byte("wire-bridge")})
	registry.put("collector-a", &agentConnection{conn: bridge, instanceUID: "collector-a", bridgeUID: "bridge-1", originalUID: []byte("wire-bridge")})
	if got, ok := registry.get("collector-a"); !ok || got.bridgeUID != "bridge-1" || string(got.originalUID) != "wire-bridge" {
		t.Fatalf("collector alias lost bridge route or wire UID: %#v, found=%v", got, ok)
	}
	removed := registry.deleteConnection(bridge)
	if len(removed) != 2 || registry.count() != 0 {
		t.Fatalf("close removed %v; expected both bridge and collector aliases", removed)
	}
}

func TestConnectionRegistryRefusesCrossOrganizationUIDCollision(t *testing.T) {
	registry := newConnectionRegistry()
	orgOne := registryTestConnection{}
	orgTwo := &struct{ registryTestConnection }{}
	registry.put("same-uid", &agentConnection{conn: orgOne, instanceUID: "same-uid", originalUID: []byte("wire-one"), orgID: 1})
	registry.put("same-uid", &agentConnection{conn: orgTwo, instanceUID: "same-uid", originalUID: []byte("wire-two"), orgID: 2})
	if route, ok := registry.get("same-uid"); ok {
		t.Fatalf("cross-organization collision remained routable: %#v", route)
	}
	if registry.count() != 0 {
		t.Fatalf("ambiguous UID should not retain a routable connection: %d", registry.count())
	}
	registry.put("same-uid", &agentConnection{conn: orgOne, instanceUID: "same-uid", originalUID: []byte("wire-one"), orgID: 1})
	if _, ok := registry.get("same-uid"); ok {
		t.Fatal("ambiguous UID unexpectedly became routable without a registry rebuild")
	}
}

func TestConnectionRegistryDeduplicatesPendingOffersUntilAckOrRetry(t *testing.T) {
	registry := newConnectionRegistry()
	conn := registryTestConnection{}
	now := time.Now()
	if !registry.claimPendingOffer(conn, "agent", "hash", now, time.Minute) {
		t.Fatal("first pending config offer should be accepted")
	}
	if registry.claimPendingOffer(conn, "agent", "hash", now.Add(time.Second), time.Minute) {
		t.Fatal("duplicate pending offer should be suppressed during retry window")
	}
	if !registry.claimPendingOffer(conn, "agent", "hash", now.Add(time.Minute), time.Minute) {
		t.Fatal("pending offer should be retried after retry window")
	}
	registry.clearPendingOffer(conn, "agent", "hash")
	if !registry.claimPendingOffer(conn, "agent", "hash", now.Add(time.Minute+time.Second), time.Minute) {
		t.Fatal("acknowledgement should clear the pending offer")
	}
	registry.deleteConnection(conn)
	if !registry.claimPendingOffer(conn, "agent", "hash", now.Add(time.Minute+2*time.Second), time.Minute) {
		t.Fatal("disconnect should clear the prior offer state")
	}
}

func TestConnectionRegistryReplacementRebindsOwnedAliasesAndEvictsUnownedAliases(t *testing.T) {
	registry := newConnectionRegistry()
	oldConn := registryTestConnection{}
	newConn := &struct{ registryTestConnection }{}
	registry.put("bridge-1", &agentConnection{conn: oldConn, instanceUID: "bridge-1", originalUID: []byte("old-wire")})
	registry.put("collector-a", &agentConnection{conn: oldConn, instanceUID: "collector-a", bridgeUID: "bridge-1", originalUID: []byte("old-wire")})
	registry.put("unowned-alias", &agentConnection{conn: oldConn, instanceUID: "unowned-alias", originalUID: []byte("old-wire")})
	registry.put("bridge-1", &agentConnection{conn: newConn, instanceUID: "bridge-1", originalUID: []byte("new-wire")})
	collector, ok := registry.get("collector-a")
	if !ok || collector.conn != newConn || string(collector.originalUID) != "new-wire" {
		t.Fatalf("owned collector route was not rebound to bridge reconnect: %#v", collector)
	}
	if _, ok := registry.get("unowned-alias"); ok {
		t.Fatal("alias without a bridge owner survived connection replacement")
	}
	bridge, ok := registry.get("bridge-1")
	if !ok || bridge.conn != newConn || string(bridge.originalUID) != "new-wire" {
		t.Fatalf("replacement bridge route is incorrect: %#v", bridge)
	}
}

func TestConnectionRegistryConcurrentAccess(t *testing.T) {
	registry := newConnectionRegistry()
	var wg sync.WaitGroup
	for n := 0; n < 8; n++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			conn := registryTestConnection{}
			for i := 0; i < 100; i++ {
				uid := "agent"
				registry.put(uid, &agentConnection{conn: conn, instanceUID: uid, originalUID: []byte("wire")})
				registry.get(uid)
				registry.snapshot()
				if i%3 == 0 {
					registry.deleteConnection(conn)
				}
			}
		}(n)
	}
	wg.Wait()
}

func TestServerAdvertisesOnlyImplementedOpAMPCapabilities(t *testing.T) {
	const expected uint64 = 1 | 2 | 4 // AcceptsStatus, OffersRemoteConfig, AcceptsEffectiveConfig.
	if opampServerCapabilities != expected {
		t.Fatalf("server capabilities=0x%x, expected 0x%x", opampServerCapabilities, expected)
	}
}

func TestConnectionRegistrySerializesSendsPerConnection(t *testing.T) {
	registry := newConnectionRegistry()
	conn := &concurrentSendConnection{}
	var wg sync.WaitGroup
	var failures atomic.Int32
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := registry.send(context.Background(), conn, &protobufs.ServerToAgent{}); err != nil {
				failures.Add(1)
			}
		}()
	}
	wg.Wait()
	if failures.Load() != 0 {
		t.Fatalf("%d concurrent sends detected", failures.Load())
	}
}
