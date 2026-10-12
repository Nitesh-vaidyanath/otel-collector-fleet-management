package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	managedOpAMPTokenAudience = "fleet-opamp"
	managedOpAMPTokenPath     = "/var/run/secrets/fleet-opamp/token"
	managedOpAMPTokenMount    = "/var/run/secrets/fleet-opamp"
	managedOpAMPTokenVolume   = "fleet-opamp-token"
	managedAgentUIDPrefix     = "fleet"
)

type ManagedOpAMPView struct {
	AgentUID            string     `json:"agentUid"`
	Association         string     `json:"association"`
	Connected           bool       `json:"connected"`
	PodUID              string     `json:"podUid,omitempty"`
	EffectiveConfigHash string     `json:"effectiveConfigHash,omitempty"`
	RemoteConfigStatus  string     `json:"remoteConfigStatus,omitempty"`
	LastSeen            *time.Time `json:"lastSeen,omitempty"`
	ProfileMatches      bool       `json:"profileMatches,omitempty"`
}

type ManagedEnrollment struct {
	FleetID             string
	DeploymentUID       string
	Namespace           string
	Name                string
	OrgID               int64
	Owner               string
	ServiceAccount      string
	AgentUID            string
	Revoked             bool
	PodUID              string
	LastSeen            time.Time
	Connected           bool
	EffectiveConfigHash string
	RemoteConfigStatus  string
}

type ManagedEnrollmentStore interface {
	Create(context.Context, ManagedEnrollment) error
	GetByFleetID(context.Context, string) (ManagedEnrollment, error)
	GetByAgentUID(context.Context, string) (ManagedEnrollment, error)
	UpdateStatus(context.Context, string, string, string, string, time.Time) error
	Revoke(context.Context, string, string) error
}

type SQLManagedEnrollmentStore struct{}

func openManagedEnrollmentDB() (*sql.DB, error) {
	dsn := getDBDSN()
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, errors.New("managed enrollment database unavailable")
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, errors.New("managed enrollment database unavailable")
	}
	return db, nil
}

func (SQLManagedEnrollmentStore) Create(_ context.Context, value ManagedEnrollment) error {
	db, err := openManagedEnrollmentDB()
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec(`INSERT INTO managed_agent_enrollments (fleet_id,deployment_uid,namespace,deployment_name,org_id,owner_login,service_account,agent_uid,revoked) VALUES (?,?,?,?,?,?,?,?,?)`, value.FleetID, value.DeploymentUID, value.Namespace, value.Name, value.OrgID, value.Owner, value.ServiceAccount, value.AgentUID, value.Revoked)
	return err
}

func (SQLManagedEnrollmentStore) GetByFleetID(_ context.Context, fleetID string) (ManagedEnrollment, error) {
	return readManagedEnrollment(func(db *sql.DB) *sql.Row {
		return db.QueryRow(`SELECT fleet_id,deployment_uid,namespace,deployment_name,org_id,owner_login,service_account,agent_uid,revoked,pod_uid,effective_config_hash,remote_config_status,last_seen FROM managed_agent_enrollments WHERE fleet_id=?`, fleetID)
	})
}

func (SQLManagedEnrollmentStore) GetByAgentUID(_ context.Context, agentUID string) (ManagedEnrollment, error) {
	return readManagedEnrollment(func(db *sql.DB) *sql.Row {
		return db.QueryRow(`SELECT fleet_id,deployment_uid,namespace,deployment_name,org_id,owner_login,service_account,agent_uid,revoked,pod_uid,effective_config_hash,remote_config_status,last_seen FROM managed_agent_enrollments WHERE agent_uid=?`, agentUID)
	})
}

func readManagedEnrollment(query func(*sql.DB) *sql.Row) (ManagedEnrollment, error) {
	db, err := openManagedEnrollmentDB()
	if err != nil {
		return ManagedEnrollment{}, err
	}
	defer db.Close()
	var e ManagedEnrollment
	var podUID, effectiveHash, remoteStatus sql.NullString
	var lastSeen sql.NullTime
	err = query(db).Scan(&e.FleetID, &e.DeploymentUID, &e.Namespace, &e.Name, &e.OrgID, &e.Owner, &e.ServiceAccount, &e.AgentUID, &e.Revoked, &podUID, &effectiveHash, &remoteStatus, &lastSeen)
	if err != nil {
		return ManagedEnrollment{}, err
	}
	e.PodUID, e.EffectiveConfigHash, e.RemoteConfigStatus = podUID.String, effectiveHash.String, remoteStatus.String
	if lastSeen.Valid {
		e.LastSeen = lastSeen.Time
	}
	return e, nil
}

func (SQLManagedEnrollmentStore) UpdateStatus(_ context.Context, fleetID, podUID, configHash, remoteStatus string, lastSeen time.Time) error {
	db, err := openManagedEnrollmentDB()
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.Exec(`UPDATE managed_agent_enrollments SET pod_uid=?,effective_config_hash=?,remote_config_status=?,last_seen=? WHERE fleet_id=? AND revoked=0`, optionalManagedString(podUID), optionalManagedString(configHash), optionalManagedString(remoteStatus), lastSeen.UTC(), fleetID)
	if err != nil { return err }
	rows, err := result.RowsAffected()
	if err != nil { return err }
	if rows != 1 { return sql.ErrNoRows }
	return nil
}

func (SQLManagedEnrollmentStore) Revoke(_ context.Context, fleetID, deploymentUID string) error {
	db, err := openManagedEnrollmentDB()
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.Exec(`UPDATE managed_agent_enrollments SET revoked=1 WHERE fleet_id=? AND deployment_uid=? AND revoked=0`, fleetID, deploymentUID)
	if err != nil { return err }
	rows, err := result.RowsAffected()
	if err != nil { return err }
	if rows != 1 { return sql.ErrNoRows }
	return nil
}

func optionalManagedString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

type MemoryManagedEnrollmentStore struct {
	mu      sync.RWMutex
	byFleet map[string]ManagedEnrollment
	byAgent map[string]string
}

func NewMemoryManagedEnrollmentStore() *MemoryManagedEnrollmentStore {
	return &MemoryManagedEnrollmentStore{byFleet: map[string]ManagedEnrollment{}, byAgent: map[string]string{}}
}
func (s *MemoryManagedEnrollmentStore) Create(_ context.Context, e ManagedEnrollment) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if e.FleetID == "" || e.AgentUID == "" || s.byFleet[e.FleetID].FleetID != "" || s.byAgent[e.AgentUID] != "" {
		return errors.New("enrollment conflict")
	}
	s.byFleet[e.FleetID] = e
	s.byAgent[e.AgentUID] = e.FleetID
	return nil
}
func (s *MemoryManagedEnrollmentStore) GetByFleetID(_ context.Context, fleetID string) (ManagedEnrollment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	e, ok := s.byFleet[fleetID]
	if !ok {
		return ManagedEnrollment{}, sql.ErrNoRows
	}
	return e, nil
}
func (s *MemoryManagedEnrollmentStore) GetByAgentUID(_ context.Context, agentUID string) (ManagedEnrollment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	fleetID := s.byAgent[agentUID]
	e, ok := s.byFleet[fleetID]
	if !ok {
		return ManagedEnrollment{}, sql.ErrNoRows
	}
	return e, nil
}
func (s *MemoryManagedEnrollmentStore) UpdateStatus(_ context.Context, fleetID, podUID, configHash, remoteStatus string, lastSeen time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.byFleet[fleetID]
	if !ok || e.Revoked {
		return sql.ErrNoRows
	}
	e.PodUID, e.EffectiveConfigHash, e.RemoteConfigStatus, e.LastSeen, e.Connected = podUID, configHash, remoteStatus, lastSeen.UTC(), true
	s.byFleet[fleetID] = e
	return nil
}
func (s *MemoryManagedEnrollmentStore) Revoke(_ context.Context, fleetID, deploymentUID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.byFleet[fleetID]
	if !ok {
		return sql.ErrNoRows
	}
	if e.DeploymentUID != deploymentUID {
		return ErrAgentDeploymentConflict
	}
	e.Revoked, e.Connected = true, false
	s.byFleet[fleetID] = e
	return nil
}

type managedKubernetesIdentity struct {
	PodUID              string
	PodName             string
	DeploymentName      string
	Namespace           string
	ServiceAccount      string
	DeploymentUID       string
	FleetID             string
	OrgID               int64
	Owner               string
	OwnerLabel          string
	SecurityProfileHash string
	ExpiresAt           time.Time
}

type managedTokenReviewer interface {
	ReviewToken(context.Context, string, string) (reviewedTokenIdentity, error)
}

type reviewedTokenIdentity struct {
	Authenticated bool
	Username      string
	UID           string
	PodName       string
	PodUID        string
	Audiences     []string
	ExpiresAt     time.Time
}

type managedResourceInspector interface {
	InspectManagedPod(context.Context, string, string, string) (managedKubernetesIdentity, error)
}

func stableManagedAgentUID(fleetID, deploymentUID string) string {
	h := sha256.Sum256([]byte(fleetID + "\x00" + deploymentUID))
	return managedAgentUIDPrefix + hex.EncodeToString(h[:16])
}

// TokenReview authenticates the token, but its API has no expiry field. Read
// the expiry only after a successful review, then recheck it on each message.
func reviewedJWTExpiry(token string) (time.Time, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return time.Time{}, errors.New("token is not a JWT")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return time.Time{}, err
	}
	var claims struct {
		ExpiresAt json.Number `json:"exp"`
	}
	decoder := json.NewDecoder(strings.NewReader(string(payload)))
	decoder.UseNumber()
	if err := decoder.Decode(&claims); err != nil {
		return time.Time{}, err
	}
	seconds, err := claims.ExpiresAt.Int64()
	if err != nil || seconds <= 0 {
		return time.Time{}, errors.New("token expiry missing")
	}
	return time.Unix(seconds, 0), nil
}

func bearerToken(r *http.Request) string {
	value := strings.TrimSpace(r.Header.Get("Authorization"))
	if len(value) < 8 || !strings.EqualFold(value[:7], "Bearer ") {
		return ""
	}
	return strings.TrimSpace(value[7:])
}

func validateManagedToken(ctx context.Context, reviewer managedTokenReviewer, inspector managedResourceInspector, store ManagedEnrollmentStore, token, audience string) (managedKubernetesIdentity, ManagedEnrollment, error) {
	if reviewer == nil || inspector == nil || store == nil || strings.TrimSpace(token) == "" || strings.TrimSpace(audience) == "" {
		return managedKubernetesIdentity{}, ManagedEnrollment{}, errors.New("managed authentication is unavailable")
	}
	review, err := reviewer.ReviewToken(ctx, token, audience)
	if err != nil || !review.Authenticated || review.PodUID == "" || review.PodName == "" || review.Username == "" || !audienceContains(review.Audiences, audience) {
		return managedKubernetesIdentity{}, ManagedEnrollment{}, errors.New("managed token was not authenticated")
	}
	expiry, err := reviewedJWTExpiry(token)
	if err != nil || !expiry.After(time.Now()) {
		return managedKubernetesIdentity{}, ManagedEnrollment{}, errors.New("managed token expiry is invalid")
	}
	namespace, serviceAccount, ok := parseServiceAccountUsername(review.Username)
	if !ok {
		return managedKubernetesIdentity{}, ManagedEnrollment{}, errors.New("managed token identity is invalid")
	}
	identity, err := inspector.InspectManagedPod(ctx, namespace, review.PodName, review.PodUID)
	if err != nil || identity.PodUID != review.PodUID || identity.Namespace != namespace || identity.ServiceAccount != serviceAccount {
		return managedKubernetesIdentity{}, ManagedEnrollment{}, errors.New("managed pod identity is invalid")
	}
	enrollment, err := store.GetByFleetID(ctx, identity.FleetID)
	if err != nil || enrollment.Revoked || enrollment.DeploymentUID != identity.DeploymentUID || enrollment.Namespace != identity.Namespace || enrollment.Name == "" || enrollment.Name != identity.DeploymentName || enrollment.OrgID != identity.OrgID || enrollment.Owner == "" || enrollment.Owner != identity.Owner || ownerLabel(enrollment.Owner) != identity.OwnerLabel || enrollment.ServiceAccount != identity.ServiceAccount || enrollment.AgentUID == "" {
		return managedKubernetesIdentity{}, ManagedEnrollment{}, errors.New("managed deployment enrollment is invalid")
	}
	identity.ExpiresAt = expiry
	return identity, enrollment, nil
}

func parseServiceAccountUsername(username string) (namespace, serviceAccount string, ok bool) {
	parts := strings.Split(username, ":")
	if len(parts) != 4 || parts[0] != "system" || parts[1] != "serviceaccount" || parts[2] == "" || parts[3] == "" {
		return "", "", false
	}
	return parts[2], parts[3], true
}

func audienceContains(audiences []string, wanted string) bool {
	for _, audience := range audiences {
		if audience == wanted {
			return true
		}
	}
	return false
}

func enrollmentMatchesManifest(e ManagedEnrollment, m AgentDeploymentManifest) bool {
	return !e.Revoked && e.FleetID != "" && e.FleetID == m.Labels["fleet.grafana.com/id"] && e.DeploymentUID == m.UID && e.OrgID > 0 && fmt.Sprint(e.OrgID) == m.Labels["fleet.grafana.com/org-id"] && e.Owner != "" && e.ServiceAccount == m.ServiceAccount
}
