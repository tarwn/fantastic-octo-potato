# BambooInvoice (derekallard/BambooInvoice), pinned to a fixed commit, fetched at build
# time so the third-party source/history stay out of this repo. See
# docs/specs/0005-target-application/0000-use-bambooinvoice-in-docker-for-target-app.md.
FROM php:5.6-apache

# php:5.6-apache is built on EOL Debian 9 (stretch); its apt sources 404 against the live
# mirrors and its signing keys have expired, so point apt at the Debian archive and skip
# signature verification before installing anything.
RUN printf 'deb http://archive.debian.org/debian stretch main\ndeb http://archive.debian.org/debian-security stretch/updates main\n' \
		> /etc/apt/sources.list

RUN apt-get -o Acquire::Check-Valid-Until=false -o Acquire::AllowInsecureRepositories=true update \
	&& apt-get install -y --no-install-recommends --allow-unauthenticated git curl default-mysql-client \
	&& rm -rf /var/lib/apt/lists/* \
	&& docker-php-ext-install mysqli \
	&& echo 'date.timezone = UTC' > /usr/local/etc/php/conf.d/date_timezone.ini

ARG BAMBOOINVOICE_COMMIT=c2927caf048b2258612a438be5dad89343552d32

RUN git clone https://github.com/derekallard/BambooInvoice.git /var/www/html \
	&& cd /var/www/html \
	&& git checkout "${BAMBOOINVOICE_COMMIT}" \
	&& rm -rf .git \
	# BambooInvoice writes generated invoice PDFs here; the repo doesn't include the
	# directory, so the installer's writability check fails without it.
	&& mkdir -p invoices_temp \
	# The shipped base_url points at a path this app doesn't run under. This CodeIgniter
	# version's base_url auto-detection is unreliable with index.php-based URLs, so pin it
	# to the fixed host port docker-compose publishes (spec 0005 Work: "published on a
	# fixed host port") rather than relying on auto-detection.
	&& sed -i "s|\$config\['base_url'\].*=.*'http://localhost/bambooinvoice/';|\$config['base_url'] = 'http://localhost:8089/';|" \
		bamboo_system_files/application/config/config.php

COPY php-config/database.php /var/www/html/bamboo_system_files/application/config/database.php

RUN chown -R www-data:www-data /var/www/html

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

HEALTHCHECK --interval=5s --timeout=5s --start-period=20s --retries=10 \
	CMD curl -fsS http://localhost/ -o /dev/null || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["apache2-foreground"]
