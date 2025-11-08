package main

import (
	"encoding/json"
	"net/http"
)

type apiError struct {
	Status  int    `json:"-"`
	Message string `json:"error"`
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	if status <= 0 {
		status = http.StatusInternalServerError
	}
	if message == "" {
		message = http.StatusText(status)
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)

	_ = json.NewEncoder(w).Encode(apiError{
		Status:  status,
		Message: message,
	})
}

func writeJSONResponse(w http.ResponseWriter, status int, payload any) {
	if status <= 0 {
		status = http.StatusOK
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)

	if payload == nil {
		return
	}

	_ = json.NewEncoder(w).Encode(payload)
}

func methodNotAllowed(w http.ResponseWriter) {
	writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
}

func notFound(w http.ResponseWriter) {
	writeJSONError(w, http.StatusNotFound, "not found")
}
