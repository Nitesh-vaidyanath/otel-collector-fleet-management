package main

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type resourceAdapter struct {
	handler  http.Handler
	mapOrgID func(int64) (int64, bool)
}

type pluginPrincipalKey struct{}

type pluginPrincipal struct {
	orgID        int64
	grafanaOrgID int64
	orgMapped    bool
	role         Role
	user         string
	userLogin    string
	isAdmin      bool
}

type adapterResponseWriter struct {
	header http.Header
	body   bytes.Buffer
	status int
}

func newResourceAdapter(handler http.Handler) backend.CallResourceHandler {
	return newResourceAdapterWithOrgLookup(handler, lookupInternalOrgIDByGrafanaID)
}

func newResourceAdapterWithOrgLookup(handler http.Handler, mapOrgID func(int64) (int64, bool)) backend.CallResourceHandler {
	return &resourceAdapter{handler: handler, mapOrgID: mapOrgID}
}

func newAdapterResponseWriter() *adapterResponseWriter {
	return &adapterResponseWriter{
		header: make(http.Header),
		status: 0,
	}
}

func (w *adapterResponseWriter) Header() http.Header {
	return w.header
}

func (w *adapterResponseWriter) Write(b []byte) (int, error) {
	return w.body.Write(b)
}

func (w *adapterResponseWriter) WriteHeader(statusCode int) {
	w.status = statusCode
}

func (a *resourceAdapter) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	if appLogger != nil {
		fields := map[string]interface{}{
			"method": req.Method,
			"path":   req.Path,
			"url":    req.URL,
			"orgID":  req.PluginContext.OrgID,
		}
		if req.PluginContext.User != nil {
			fields["userLogin"] = req.PluginContext.User.Login
			fields["userRole"] = req.PluginContext.User.Role
		}
		appLogger.Info("CallResource request received", fields)
	}

	var bodyReader io.Reader
	if len(req.Body) > 0 {
		bodyReader = bytes.NewReader(req.Body)
	}

	reqURL, err := url.Parse(req.URL)
	if err != nil {
		reqURL = &url.URL{}
	}

	resourcePath := req.Path
	if resourcePath == "" && reqURL.Path != "" {
		resourcePath = reqURL.Path
	}
	if resourcePath == "" {
		resourcePath = "/"
	}
	if resourcePath[0] != '/' {
		resourcePath = "/" + resourcePath
	}

	resourceURL := resourcePath
	if reqURL.RawQuery != "" {
		resourceURL += "?" + reqURL.RawQuery
	}

	httpReq, err := http.NewRequestWithContext(ctx, req.Method, resourceURL, bodyReader)
	if err != nil {
		return err
	}

	for key, values := range req.Headers {
		lowerKey := strings.ToLower(key)
		if strings.HasPrefix(lowerKey, "x-grafana-") || strings.HasPrefix(lowerKey, "x-scoper-") ||
			strings.EqualFold(key, "X-Role") || strings.EqualFold(key, "X-User") || strings.EqualFold(key, "X-User-Name") {
			continue
		}
		for _, value := range values {
			httpReq.Header.Add(key, value)
		}
	}
	principal := pluginPrincipal{role: RoleViewer, user: "unknown", grafanaOrgID: req.PluginContext.OrgID}
	if a.mapOrgID != nil && req.PluginContext.OrgID > 0 {
		if internalOrgID, ok := a.mapOrgID(req.PluginContext.OrgID); ok && internalOrgID > 0 {
			principal.orgID = internalOrgID
			principal.orgMapped = true
		}
	}
	if user := req.PluginContext.User; user != nil {
		principal.userLogin = strings.TrimSpace(user.Login)
		principal.user = user.Name
		if principal.user == "" {
			principal.user = user.Login
		}
		switch strings.ToLower(user.Role) {
		case "editor":
			principal.role = RoleEditor
		case "admin":
			principal.role = RoleAdmin
			principal.isAdmin = true
		}
	}
	httpReq = httpReq.WithContext(context.WithValue(httpReq.Context(), pluginPrincipalKey{}, principal))

	httpReq.RemoteAddr = "plugin-backend"

	writer := newAdapterResponseWriter()
	a.handler.ServeHTTP(writer, httpReq)

	status := writer.status
	if status == 0 {
		status = http.StatusOK
	}

	headers := make(map[string][]string, len(writer.header))
	for key, values := range writer.header {
		copied := make([]string, len(values))
		copy(copied, values)
		headers[key] = copied
	}

	return sender.Send(&backend.CallResourceResponse{
		Status:  status,
		Body:    writer.body.Bytes(),
		Headers: headers,
	})
}
