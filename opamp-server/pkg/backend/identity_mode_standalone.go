//go:build standalone

package main

// The standalone server is a local development/test pathway outside Grafana's
// production plugin resource boundary.
func allowHeaderIdentityFallback() bool { return true }
