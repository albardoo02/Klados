FROM alpine:3.20

RUN apk add --no-cache minio curl ca-certificates

EXPOSE 9000 9001
VOLUME ["/data"]

CMD ["minio", "server", "/data", "--console-address", ":9001"]
