FROM clamav/clamav:stable@sha256:45fe5149fbee5a46509c9848ef20d0c354b7b2323c9369f285939a37cf33422a
USER root
RUN apk add --no-cache python3 ca-certificates
COPY clamd.conf freshclam.conf /etc/clamav/
COPY scanner.py drop-privileges.py entrypoint.sh /opt/proinspect/
RUN chmod 0555 /opt/proinspect/entrypoint.sh && mkdir -p /run/clamav && chown clamav:clamav /run/clamav /var/lib/clamav
ENV TZ=UTC LC_ALL=C PYTHONUNBUFFERED=1
EXPOSE 8080
ENTRYPOINT ["/opt/proinspect/entrypoint.sh"]
