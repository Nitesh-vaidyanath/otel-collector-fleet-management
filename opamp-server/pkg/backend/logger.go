package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"
)

type logLevel int

const (
	logLevelDebug logLevel = iota
	logLevelInfo
	logLevelWarn
	logLevelError
)

var (
	logCfgMu           sync.RWMutex
	currentLogLevel    = logLevelInfo
	jsonLoggingEnabled bool
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

func configureLoggingFromEnv() {
	logCfgMu.Lock()
	defer logCfgMu.Unlock()

	if strings.EqualFold(os.Getenv("LOG_FORMAT"), "json") || strings.EqualFold(os.Getenv("JSON_LOGGING"), "true") {
		jsonLoggingEnabled = true
	}

	if lvl := strings.TrimSpace(os.Getenv("LOG_LEVEL")); lvl != "" {
		_ = setLogLevelLocked(lvl)
	} else if strings.EqualFold(os.Getenv("LOG_DEBUG"), "true") || strings.EqualFold(os.Getenv("DEBUG"), "true") {
		currentLogLevel = logLevelDebug
	}
}

func init() {
	configureLoggingFromEnv()
}

func (l *Logger) log(level logLevel, levelLabel, msg string, fields map[string]interface{}) {
	if !shouldLog(level) {
		return
	}

	entry := LogEntry{
		Time:      time.Now().Format(time.RFC3339),
		Level:     levelLabel,
		Component: l.component,
		Message:   msg,
		Fields:    fields,
	}

	logCfgMu.RLock()
	jsonMode := jsonLoggingEnabled
	logCfgMu.RUnlock()

	if jsonMode {
		jsonBytes, _ := json.Marshal(entry)
		fmt.Println(string(jsonBytes))
	} else {
		if len(fields) > 0 {
			log.Printf("[%s] [%s] %s | fields=%+v", levelLabel, l.component, msg, fields)
		} else {
			log.Printf("[%s] [%s] %s", levelLabel, l.component, msg)
		}
	}
}

func shouldLog(level logLevel) bool {
	logCfgMu.RLock()
	defer logCfgMu.RUnlock()
	return level >= currentLogLevel
}

func (l *Logger) Info(msg string, fields ...map[string]interface{}) {
	f := make(map[string]interface{})
	if len(fields) > 0 {
		f = fields[0]
	}
	l.log(logLevelInfo, "INFO", msg, f)
}

func (l *Logger) Error(msg string, err error, fields ...map[string]interface{}) {
	f := make(map[string]interface{})
	if len(fields) > 0 {
		f = fields[0]
	}
	if err != nil {
		f["error"] = err.Error()
	}
	l.log(logLevelError, "ERROR", msg, f)
}

func (l *Logger) Debug(msg string, fields ...map[string]interface{}) {
	f := make(map[string]interface{})
	if len(fields) > 0 {
		f = fields[0]
	}
	l.log(logLevelDebug, "DEBUG", msg, f)
}

func (l *Logger) Warn(msg string, fields ...map[string]interface{}) {
	f := make(map[string]interface{})
	if len(fields) > 0 {
		f = fields[0]
	}
	l.log(logLevelWarn, "WARN", msg, f)
}

// SetJSONLogging enables or disables JSON logging output.
func SetJSONLogging(enabled bool) {
	logCfgMu.Lock()
	jsonLoggingEnabled = enabled
	logCfgMu.Unlock()
}

// IsJSONLoggingEnabled reports whether JSON logging is active.
func IsJSONLoggingEnabled() bool {
	logCfgMu.RLock()
	defer logCfgMu.RUnlock()
	return jsonLoggingEnabled
}

// SetLogLevel updates the logging level at runtime.
func SetLogLevel(level string) error {
	logCfgMu.Lock()
	defer logCfgMu.Unlock()
	return setLogLevelLocked(level)
}

func setLogLevelLocked(level string) error {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "", "info":
		currentLogLevel = logLevelInfo
	case "debug":
		currentLogLevel = logLevelDebug
	case "warn", "warning":
		currentLogLevel = logLevelWarn
	case "error":
		currentLogLevel = logLevelError
	default:
		return fmt.Errorf("invalid log level: %s", level)
	}
	return nil
}

// GetLogLevel returns the current log level string.
func GetLogLevel() string {
	logCfgMu.RLock()
	defer logCfgMu.RUnlock()
	switch currentLogLevel {
	case logLevelDebug:
		return "debug"
	case logLevelWarn:
		return "warn"
	case logLevelError:
		return "error"
	default:
		return "info"
	}
}

// IsDebugLoggingEnabled reports whether debug level logging is active.
func IsDebugLoggingEnabled() bool {
	logCfgMu.RLock()
	defer logCfgMu.RUnlock()
	return currentLogLevel == logLevelDebug
}
