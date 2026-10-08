FROM alpine:3.20

RUN apk add --no-cache curl ca-certificates && \
    curl -sSLo /usr/local/bin/minio https://dl.min.io/server/minio/release/linux-amd64/minio && \
    chmod +x /usr/local/bin/minio

EXPOSE 9000 9001
VOLUME ["/data"]

ENTRYPOINT ["minio"]
