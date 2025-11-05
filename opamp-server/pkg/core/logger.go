package core

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"
)

// Logger provides structured logging capabilities
type Logger struct {
	component string
}

// NewLogger creates a new logger instance
func NewLogger(component string) *Logger {
	return &Logger{component: component}
}

// LogEntry represents a structured log entry
type LogEntry struct {
	Time      string                 `json:"time"`
	Level     string                 `json:"level"`
	Component string                 `json:"component"`
	Message   string                 `json:"message"`
	Fields    map[string]interface{} `json:"fields,omitempty"`
}

func (l *Logger) log(level, msg string, fields map[string]interface{}) {
	entry := LogEntry{
		Time:      time.Now().Format(time.RFC3339),
		Level:     level,
		Component: l.component,
		Message:   msg,
		Fields:    fields,
	}

	if os.Getenv("JSON_LOGGING") == "true" {
		jsonBytes, _ := json.Marshal(entry)
		fmt.Println(string(jsonBytes))
	} else {
		if len(fields) > 0 {
			log.Printf("[%s] [%s] %s | fields=%+v", level, l.component, msg, fields)
		} else {
			log.Printf("[%s] [%s] %s", level, l.component, msg)
		}
	}
}

func (l *Logger) Info(msg string, fields ...map[string]interface{}) {
	f := make(map[string]interface{})
	if len(fields) > 0 {
		f = fields[0]
	}
	l.log("INFO", msg, f)
}

func (l *Logger) Error(msg string, err error, fields ...map[string]interface{}) {
	f := make(map[string]interface{})
	if len(fields) > 0 {
		f = fields[0]
	}
	if err != nil {
		f["error"] = err.Error()
	}
	l.log("ERROR", msg, f)
}

func (l *Logger) Debug(msg string, fields ...map[string]interface{}) {
	if os.Getenv("DEBUG") == "true" {
		f := make(map[string]interface{})
		if len(fields) > 0 {
			f = fields[0]
		}
		l.log("DEBUG", msg, f)
	}
}

func (l *Logger) Warn(msg string, fields ...map[string]interface{}) {
	f := make(map[string]interface{})
	if len(fields) > 0 {
		f = fields[0]
	}
	l.log("WARN", msg, f)
}

