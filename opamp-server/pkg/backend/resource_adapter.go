package main

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/url"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type resourceAdapter struct {
	handler http.Handler
}

type adapterResponseWriter struct {
	header http.Header
	body   bytes.Buffer
	status int
}

func newResourceAdapter(handler http.Handler) backend.CallResourceHandler {
	return &resourceAdapter{handler: handler}
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
		for _, value := range values {
			httpReq.Header.Add(key, value)
		}
	}

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
