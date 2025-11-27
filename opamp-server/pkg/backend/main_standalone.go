//go:build standalone
// +build standalone

package main

// This is the standalone OpAMP server main - used when running as separate service
// All other files (handlers.go, opamp.go, etc.) are shared with plugin backend
// Global variables (globalOpampManager, appLogger) are declared in globals.go

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	// Parse command-line flags
	endpoint := flag.String("endpoint", "0.0.0.0:4321", "OpAMP server endpoint (address:port)")
	enableTLS := flag.Bool("tls", false, "Enable TLS/HTTPS")
	certFile := flag.String("cert", "", "Path to TLS certificate file (required if TLS enabled)")
	keyFile := flag.String("key", "", "Path to TLS private key file (required if TLS enabled)")
	dbType := flag.String("db-type", "", "Database type (mysql, cloudsql-mysql, aws-rds-mysql, spanner)")
	dbHost := flag.String("db-host", "", "Database host")
	dbPort := flag.String("db-port", "", "Database port")
	dbName := flag.String("db-name", "", "Database name")
	dbUser := flag.String("db-user", "", "Database user")
	dbPassword := flag.String("db-password", "", "Database password")
	dbDSN := flag.String("db-dsn", "", "Complete database DSN (overrides individual db-* flags)")
	cloudSQLInstance := flag.String("cloudsql-instance", "", "Cloud SQL instance connection name (for cloudsql-mysql)")
	spannerDatabase := flag.String("spanner-database", "", "Spanner database path (for spanner)")
	flag.Parse()

	// Set up logger
	appLogger = NewLogger("opamp-server-standalone")

	// Set environment variables for database connection (if provided via flags)
	if *dbDSN != "" {
		os.Setenv("AGENTS_MYSQL_DSN", *dbDSN)
	} else if *dbType != "" {
		os.Setenv("DB_TYPE", *dbType)
		if *dbHost != "" {
			os.Setenv("DB_HOST", *dbHost)
		}
		if *dbPort != "" {
			os.Setenv("DB_PORT", *dbPort)
		}
		if *dbName != "" {
			os.Setenv("DB_NAME", *dbName)
		}
		if *dbUser != "" {
			os.Setenv("DB_USER", *dbUser)
		}
		if *dbPassword != "" {
			os.Setenv("DB_PASSWORD", *dbPassword)
		}
		if *cloudSQLInstance != "" {
			os.Setenv("CLOUD_SQL_INSTANCE", *cloudSQLInstance)
		}
		if *spannerDatabase != "" {
			os.Setenv("SPANNER_DATABASE", *spannerDatabase)
		}
	}

	// Validate TLS configuration
	if *enableTLS {
		if *certFile == "" || *keyFile == "" {
			log.Fatal("TLS enabled but certificate or key file not provided. Use -cert and -key flags.")
		}
		if _, err := os.Stat(*certFile); os.IsNotExist(err) {
			log.Fatalf("Certificate file not found: %s", *certFile)
		}
		if _, err := os.Stat(*keyFile); os.IsNotExist(err) {
			log.Fatalf("Private key file not found: %s", *keyFile)
		}
		log.Printf("✓ TLS enabled - OpAMP server will use WSS (WebSocket Secure)")
	} else {
		log.Printf("⚠️  TLS not enabled - OpAMP server will use WS (insecure WebSocket)")
	}

	// Initialize OpAMP manager
	var err error
	globalOpampManager, err = NewOpampManager()
	if err != nil {
		appLogger.Error("Failed to create OPAMP manager", err)
		log.Fatalf("Failed to create OPAMP manager: %v", err)
	}

	// Start OpAMP server using the manager's Start method
	appLogger.Info("Starting OpAMP server", map[string]interface{}{
		"endpoint": *endpoint,
		"tls":      *enableTLS,
	})

	// Start OpAMP server (this starts the internal HTTP server)
	// Pass TLS certificate and key if provided
	certFilePath := *certFile
	keyFilePath := *keyFile

	go func() {
		if err := globalOpampManager.Start(*endpoint, certFilePath, keyFilePath); err != nil {
			appLogger.Error("Failed to start OpAMP server", err)
			log.Fatalf("Failed to start OpAMP server: %v", err)
		}
	}()

	// Wait for OpAMP server to initialize
	time.Sleep(1 * time.Second)

	// Health check endpoint (separate HTTP server)
	healthMux := http.NewServeMux()
	healthMux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{"status":"ok","service":"opamp-server","endpoint":"%s","tls":%t}`, *endpoint, *enableTLS)
	})

	healthServer := &http.Server{
		Addr:    ":8080", // Health check on separate port
		Handler: healthMux,
	}

	go func() {
		if err := healthServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("Health check server error: %v", err)
		}
	}()

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	appLogger.Info("OpAMP server started successfully", map[string]interface{}{
		"endpoint":        *endpoint,
		"tls":             *enableTLS,
		"health_endpoint": "http://localhost:8080/health",
	})

	// Wait for shutdown signal
	<-sigChan
	appLogger.Info("Shutting down OpAMP server...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := healthServer.Shutdown(ctx); err != nil {
		appLogger.Error("Error during health server shutdown", err)
	}

	if globalOpampManager != nil {
		globalOpampManager.Stop()
	}

	appLogger.Info("OpAMP server stopped")
}
