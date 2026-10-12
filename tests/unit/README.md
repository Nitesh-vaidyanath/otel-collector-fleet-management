# Legacy unit-test fixtures

`approval_test.go` is retained as a legacy MySQL integration fixture. It inserts,
updates, and deletes rows in a local database, so it is excluded from default
test targets and must not be run during routine unit verification. The safe
backend regression tests now live in `opamp-server/pkg/backend` and use
in-memory requests or fake execution boundaries.
