FROM golang:1.23 AS build
WORKDIR /src
COPY opamp-server/ ./
COPY tests/manual/opamp-e2e/main.go ./tests/manual/opamp-e2e/main.go
RUN CGO_ENABLED=0 go build -mod=mod -o /out/opamp-e2e ./tests/manual/opamp-e2e

FROM scratch
COPY --from=build /out/opamp-e2e /opamp-e2e
ENTRYPOINT ["/opamp-e2e"]
