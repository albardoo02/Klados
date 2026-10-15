FROM alpine:edge

RUN apk add --no-cache minio curl ca-certificates

EXPOSE 9000 9001
VOLUME ["/data"]

ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
