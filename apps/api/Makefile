.PHONY: dev build test lint migrate

dev:
	go run ./cmd/server/main.go

build:
	go build -o bin/server ./cmd/server/main.go

test:
	go test ./... -v

lint:
	golangci-lint run

tidy:
	go mod tidy