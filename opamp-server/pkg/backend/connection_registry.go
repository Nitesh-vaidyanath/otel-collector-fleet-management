package main

import (
	"context"
	"sync"
	"time"

	"github.com/open-telemetry/opamp-go/protobufs"
	"github.com/open-telemetry/opamp-go/server/types"
)

// connectionRegistry owns active OpAMP routes. Every lookup returns a snapshot so
// callback goroutines never share mutable connection metadata.
type connectionRegistry struct {
	mu         sync.RWMutex
	byUID      map[string]*agentConnection
	ambiguous  map[string]struct{}
	typeByConn map[types.Connection]string
	sendLocks  map[types.Connection]*connectionSendLock
	pendingOffers map[types.Connection]map[string]time.Time
}

type connectionSendLock struct {
	mu      sync.Mutex
	refs    int
	retired bool
}

func newConnectionRegistry() *connectionRegistry {
	return &connectionRegistry{byUID: make(map[string]*agentConnection), ambiguous: make(map[string]struct{}), typeByConn: make(map[types.Connection]string), sendLocks: make(map[types.Connection]*connectionSendLock), pendingOffers: make(map[types.Connection]map[string]time.Time)}
}

func cloneAgentConnection(ac *agentConnection) *agentConnection {
	if ac == nil {
		return nil
	}
	copyOf := *ac
	copyOf.originalUID = append([]byte(nil), ac.originalUID...)
	return &copyOf
}

func (r *connectionRegistry) get(uid string) (*agentConnection, bool) {
	r.mu.RLock()
	if _, ambiguous := r.ambiguous[uid]; ambiguous {
		r.mu.RUnlock()
		return nil, false
	}
	ac, ok := r.byUID[uid]
	copyOf := cloneAgentConnection(ac)
	r.mu.RUnlock()
	return copyOf, ok
}

func (r *connectionRegistry) put(uid string, ac *agentConnection) {
	if ac == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ambiguous := r.ambiguous[uid]; ambiguous {
		return
	}
	if old := r.byUID[uid]; old != nil && old.orgID != ac.orgID {
		// UID-only APIs cannot safely choose between tenants. Keep this key
		// unroutable for this process lifetime rather than replacing ownership.
		delete(r.byUID, uid)
		r.ambiguous[uid] = struct{}{}
		return
	}
	if old := r.byUID[uid]; old != nil && old.conn != ac.conn {
		for alias, candidate := range r.byUID {
			if alias == uid {
				continue
			}
			if candidate.bridgeUID == uid {
				rebound := cloneAgentConnection(candidate)
				rebound.conn = ac.conn
				rebound.originalUID = append([]byte(nil), ac.originalUID...)
				r.byUID[alias] = rebound
			} else if candidate.conn == old.conn {
				delete(r.byUID, alias)
			}
		}
		delete(r.typeByConn, old.conn)
		if lock := r.sendLocks[old.conn]; lock != nil {
			lock.retired = true
			if lock.refs == 0 {
				delete(r.sendLocks, old.conn)
			}
		}
	}
	r.byUID[uid] = cloneAgentConnection(ac)
}

func (r *connectionRegistry) update(uid string, update func(*agentConnection)) (*agentConnection, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ambiguous := r.ambiguous[uid]; ambiguous {
		return nil, false
	}
	ac, ok := r.byUID[uid]
	if !ok {
		return nil, false
	}
	before := ac.conn
	update(ac)
	if before != ac.conn {
		for alias, candidate := range r.byUID {
			if alias != uid && candidate.conn == before {
				delete(r.byUID, alias)
			}
		}
		delete(r.typeByConn, before)
	}
	return cloneAgentConnection(ac), true
}

func (r *connectionRegistry) snapshot() map[string]*agentConnection {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make(map[string]*agentConnection, len(r.byUID))
	for uid, ac := range r.byUID {
		out[uid] = cloneAgentConnection(ac)
	}
	return out
}

func (r *connectionRegistry) count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.byUID)
}

func (r *connectionRegistry) setAgentType(conn types.Connection, value string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.typeByConn[conn] = value
}

func (r *connectionRegistry) send(ctx context.Context, conn types.Connection, message *protobufs.ServerToAgent) error {
	r.mu.Lock()
	lock := r.sendLocks[conn]
	if lock == nil {
		lock = &connectionSendLock{}
		r.sendLocks[conn] = lock
	}
	lock.refs++
	r.mu.Unlock()
	lock.mu.Lock()
	err := conn.Send(ctx, message)
	lock.mu.Unlock()
	r.mu.Lock()
	lock.refs--
	if lock.retired && lock.refs == 0 && r.sendLocks[conn] == lock {
		delete(r.sendLocks, conn)
	}
	r.mu.Unlock()
	return err
}

func (r *connectionRegistry) agentType(conn types.Connection) string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.typeByConn[conn]
}

// claimPendingOffer prevents repeated heartbeats from enqueuing the same
// pending remote config response. If the agent does not acknowledge it, a
// retry is allowed after retryAfter or on a new connection.
func (r *connectionRegistry) claimPendingOffer(conn types.Connection, uid, configHash string, now time.Time, retryAfter time.Duration) bool {
	if conn == nil || uid == "" || configHash == "" {
		return false
	}
	key := uid + ":" + configHash
	r.mu.Lock()
	defer r.mu.Unlock()
	byKey := r.pendingOffers[conn]
	if byKey == nil {
		byKey = make(map[string]time.Time)
		r.pendingOffers[conn] = byKey
	}
	if lastOffer, ok := byKey[key]; ok && now.Sub(lastOffer) < retryAfter {
		return false
	}
	byKey[key] = now
	return true
}

func (r *connectionRegistry) clearPendingOffer(conn types.Connection, uid, configHash string) {
	if conn == nil || uid == "" || configHash == "" {
		return
	}
	key := uid + ":" + configHash
	r.mu.Lock()
	defer r.mu.Unlock()
	if byKey := r.pendingOffers[conn]; byKey != nil {
		delete(byKey, key)
		if len(byKey) == 0 {
			delete(r.pendingOffers, conn)
		}
	}
}

func (r *connectionRegistry) consumePendingOffer(conn types.Connection, uid, configHash string) bool {
	if conn == nil || uid == "" || configHash == "" { return false }
	key := uid + ":" + configHash
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, stillOwned := r.byUID[uid]; !stillOwned || r.byUID[uid].conn != conn { return false }
	byKey := r.pendingOffers[conn]
	if _, offered := byKey[key]; !offered { return false }
	delete(byKey, key)
	if len(byKey) == 0 { delete(r.pendingOffers, conn) }
	return true
}

func (r *connectionRegistry) deleteConnection(conn types.Connection) []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	var removed []string
	for uid, ac := range r.byUID {
		if ac.conn == conn {
			delete(r.byUID, uid)
			removed = append(removed, uid)
		}
	}
	delete(r.typeByConn, conn)
	delete(r.pendingOffers, conn)
	if lock := r.sendLocks[conn]; lock != nil {
		lock.retired = true
		if lock.refs == 0 {
			delete(r.sendLocks, conn)
		}
	}
	return removed
}
