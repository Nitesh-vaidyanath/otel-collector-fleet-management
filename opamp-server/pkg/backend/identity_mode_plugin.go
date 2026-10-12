//go:build !standalone

package main

// Raw HTTP identity headers are not an authentication boundary for the Grafana
// plugin backend. Only the standalone development server explicitly enables
// that legacy pathway.
func allowHeaderIdentityFallback() bool { return false }
