#!/bin/sh
set -eu

# podman-compose doesn't honor `depends_on: condition: service_healthy`, so wait for the
# database ourselves instead of relying on compose to sequence startup (spec 0005 C004).
DB_HOST="db"
DB_USER="bamboo"
DB_PASSWORD="bamboo_dev_password"

MAX_ATTEMPTS=60

echo "docker-entrypoint: waiting for MySQL at ${DB_HOST}..."
attempt=0
until mysqladmin ping -h "${DB_HOST}" -u "${DB_USER}" -p"${DB_PASSWORD}" --silent; do
	attempt=$((attempt + 1))
	if [ "${attempt}" -ge "${MAX_ATTEMPTS}" ]; then
		echo "docker-entrypoint: gave up waiting for MySQL at ${DB_HOST} after ${MAX_ATTEMPTS} attempts" >&2
		exit 1
	fi
	sleep 2
done
echo "docker-entrypoint: MySQL is ready"

exec "$@"
