package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

type agentDeploymentCollectionResponse struct {
	Enabled          bool                    `json:"enabled"`
	DisabledReason   string                  `json:"disabledReason,omitempty"`
	Profiles         []map[string]any        `json:"profiles"`
	SecurityProfiles []map[string]any        `json:"securityProfiles"`
	Nodes            []string                `json:"nodes"`
	Deployments      []AgentDeploymentRecord `json:"deployments"`
}

type agentDeploymentCreateRequest struct {
	Profile         string `json:"profile"`
	Node            string `json:"node"`
	SecurityProfile string `json:"securityProfile,omitempty"`
}

type agentDeploymentSecurityRequest struct {
	SecurityProfile string `json:"securityProfile"`
	UID             string `json:"uid"`
	ResourceVersion string `json:"resourceVersion"`
}

var agentDeploymentServiceProvider = configuredAgentDeploymentService

func agentDeploymentsCollectionHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	service, err := agentDeploymentServiceProvider()
	if err != nil {
		if r.Method == http.MethodGet {
			writeJSONResponse(w, http.StatusOK, agentDeploymentCollectionResponse{Enabled: false, DisabledReason: "Agent deployment configuration is invalid or unavailable.", Profiles: []map[string]any{}, SecurityProfiles: []map[string]any{}, Nodes: []string{}, Deployments: []AgentDeploymentRecord{}})
			return
		}
		writeJSONError(w, http.StatusServiceUnavailable, "agent deployment service is unavailable")
		return
	}
	serveAgentDeploymentsCollection(w, r, c, service)
}

func serveAgentDeploymentsCollection(w http.ResponseWriter, r *http.Request, c reqCtx, service *AgentDeploymentService) {
	if service == nil || !service.Enabled() {
		if r.Method != http.MethodGet {
			writeJSONError(w, http.StatusServiceUnavailable, "agent deployments are disabled")
			return
		}
		writeJSONResponse(w, http.StatusOK, agentDeploymentCollectionResponse{Enabled: false, DisabledReason: "Agent deployments are not enabled by the administrator.", Profiles: []map[string]any{}, SecurityProfiles: []map[string]any{}, Nodes: []string{}, Deployments: []AgentDeploymentRecord{}})
		return
	}
	owner, ok := stableAgentDeploymentOwner(c)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authenticated user login is required")
		return
	}
	switch r.Method {
	case http.MethodGet:
		deployments, err := service.List(r.Context(), c.OrgID, owner)
		if err != nil {
			writeAgentDeploymentError(w, err)
			return
		}
		if globalOpampManager != nil {
			for i := range deployments {
				persisted := deployments[i].OpAMP
				if persisted == nil || persisted.AgentUID == "" { continue }
				live := globalOpampManager.managedView(persisted.AgentUID, deployments[i].FleetID, deployments[i].SecurityProfileHash)
				if live.Association == "verified" {
					persisted.Association, persisted.Connected = "verified", true
					persisted.PodUID, persisted.ProfileMatches, persisted.LastSeen = live.PodUID, live.ProfileMatches, live.LastSeen
				}
			}
		}
		profiles, nodes, securityProfiles := service.Options()
		writeJSONResponse(w, http.StatusOK, agentDeploymentCollectionResponse{Enabled: true, Profiles: profiles, Nodes: nodes, SecurityProfiles: securityProfiles, Deployments: deployments})
	case http.MethodPost:
		var request agentDeploymentCreateRequest
		if err := decodeAgentDeploymentJSON(w, r, &request); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid deployment request")
			return
		}
		record, err := service.Create(r.Context(), AgentDeploymentRequest{Profile: request.Profile, Node: request.Node, SecurityProfile: request.SecurityProfile, OrgID: c.OrgID, Owner: owner})
		if err != nil {
			writeAgentDeploymentError(w, err)
			return
		}
		writeJSONResponse(w, http.StatusAccepted, record)
	default:
		methodNotAllowed(w)
	}
}

func agentDeploymentEntityHandler(w http.ResponseWriter, r *http.Request, c reqCtx) {
	service, err := agentDeploymentServiceProvider()
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, "agent deployment service is unavailable")
		return
	}
	serveAgentDeploymentEntity(w, r, c, service, strings.Trim(strings.TrimPrefix(r.URL.Path, "/agent-deployments/"), "/"))
}

func serveAgentDeploymentEntity(w http.ResponseWriter, r *http.Request, c reqCtx, service *AgentDeploymentService, path string) {
	if service == nil || !service.Enabled() {
		writeJSONError(w, http.StatusServiceUnavailable, "agent deployments are disabled")
		return
	}
	owner, ok := stableAgentDeploymentOwner(c)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authenticated user login is required")
		return
	}
	parts := strings.Split(path, "/")
	if len(parts) < 1 || len(parts) > 2 || !validFleetID(parts[0]) {
		notFound(w)
		return
	}
	fleetID := parts[0]
	if len(parts) == 1 {
		if r.Method != http.MethodDelete {
			methodNotAllowed(w)
			return
		}
		if err := decodeEmptyLifecycleBody(w, r); err != nil {
			writeJSONError(w, http.StatusBadRequest, "deployment request body must be empty or an empty JSON object")
			return
		}
		if err := service.Delete(r.Context(), fleetID, c.OrgID, owner); err != nil {
			writeAgentDeploymentError(w, err)
			return
		}
		writeJSONResponse(w, http.StatusOK, map[string]any{"ok": true, "fleetId": fleetID})
		return
	}
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	if parts[1] == "security-profile" {
		var request agentDeploymentSecurityRequest
		if err := decodeAgentDeploymentJSON(w, r, &request); err != nil || strings.TrimSpace(request.SecurityProfile) == "" || strings.TrimSpace(request.UID) == "" || strings.TrimSpace(request.ResourceVersion) == "" {
			writeJSONError(w, http.StatusBadRequest, "invalid security profile request")
			return
		}
		record, err := service.UpdateSecurityProfile(r.Context(), fleetID, c.OrgID, owner, request.SecurityProfile, request.UID, request.ResourceVersion)
		if err != nil {
			writeAgentDeploymentError(w, err)
			return
		}
		writeJSONResponse(w, http.StatusOK, record)
		return
	}
	if err := decodeEmptyLifecycleBody(w, r); err != nil {
		writeJSONError(w, http.StatusBadRequest, "deployment request body must be empty or an empty JSON object")
		return
	}
	var err error
	switch parts[1] {
	case "start":
		err = service.Start(r.Context(), fleetID, c.OrgID, owner)
	case "stop":
		err = service.Stop(r.Context(), fleetID, c.OrgID, owner)
	case "restart":
		err = service.Restart(r.Context(), fleetID, c.OrgID, owner)
	default:
		notFound(w)
		return
	}
	if err != nil {
		writeAgentDeploymentError(w, err)
		return
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{"ok": true, "fleetId": fleetID, "operation": parts[1]})
}

func decodeEmptyLifecycleBody(w http.ResponseWriter, r *http.Request) error {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 4096))
	if err != nil {
		return err
	}
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		return nil
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	var object map[string]json.RawMessage
	if err := decoder.Decode(&object); err != nil {
		return err
	}
	if object == nil || len(object) != 0 {
		return errors.New("only an empty JSON object is allowed")
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return errors.New("request must contain one JSON object")
	}
	return nil
}

func stableAgentDeploymentOwner(c reqCtx) (string, bool) {
	login := strings.TrimSpace(c.UserLogin)
	return login, login != "" && c.OrgID > 0
}

func decodeAgentDeploymentJSON(w http.ResponseWriter, r *http.Request, out any) error {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 4096))
	if err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(out); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return errors.New("request must contain one JSON object")
	}
	return nil
}

func writeAgentDeploymentError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrAgentDeploymentInvalidRequest):
		writeJSONError(w, http.StatusBadRequest, "invalid deployment request")
	case errors.Is(err, ErrAgentDeploymentsDisabled):
		writeJSONError(w, http.StatusServiceUnavailable, "agent deployments are disabled")
	case errors.Is(err, ErrAgentDeploymentForbidden):
		writeJSONError(w, http.StatusForbidden, "deployment belongs to another organization or user")
	case errors.Is(err, ErrAgentDeploymentNotFound):
		writeJSONError(w, http.StatusNotFound, "deployment not found")
	case errors.Is(err, ErrAgentDeploymentConflict):
		writeJSONError(w, http.StatusConflict, "deployment changed; refresh and retry")
	case errors.Is(err, context.Canceled):
		writeJSONError(w, http.StatusRequestTimeout, "request canceled")
	default:
		writeJSONError(w, http.StatusBadGateway, "Kubernetes deployment operation failed")
	}
}
