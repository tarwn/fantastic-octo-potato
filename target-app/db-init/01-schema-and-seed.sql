-- Schema + sample data for the local BambooInvoice target app.
--
-- BambooInvoice normally builds its schema through a web installer (see
-- bamboo_system_files/application/controllers/install.php in the pinned commit), which
-- requires a running app to POST to. Rather than depend on the app container to bootstrap
-- itself over HTTP, this reproduces the resulting schema (install.php's table definitions,
-- with every subsequent install/update_bamboo migration folded in) directly as SQL, so
-- MySQL's docker-entrypoint-initdb.d mechanism can seed everything on first boot with no
-- manual step (spec 0005 R004) and no dependency on app-container readiness.
--
-- Login for the seeded admin account: admin@targetapp.local / targetapp-seed-pw
-- (the `password` value below is that plaintext run through BambooInvoice's own
-- reversible CI_Encrypt XOR cipher, using the app's default `encryption_key`, so the
-- app's login flow can decode and match it unmodified).

CREATE TABLE bamboo_clientcontacts (
	id INT(11) NOT NULL AUTO_INCREMENT,
	client_id INT(11) DEFAULT NULL,
	first_name VARCHAR(25) DEFAULT NULL,
	last_name VARCHAR(25) DEFAULT NULL,
	title VARCHAR(75) DEFAULT NULL,
	email VARCHAR(127) DEFAULT NULL,
	phone VARCHAR(20) DEFAULT NULL,
	password VARCHAR(100) DEFAULT NULL,
	access_level TINYINT(1) DEFAULT 0,
	supervisor INT(11) DEFAULT NULL,
	last_login INT(11) DEFAULT NULL,
	password_reset VARCHAR(12) DEFAULT NULL,
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bamboo_clients (
	id INT(11) NOT NULL AUTO_INCREMENT,
	name VARCHAR(75) DEFAULT NULL,
	address1 VARCHAR(100) DEFAULT NULL,
	address2 VARCHAR(100) DEFAULT NULL,
	city VARCHAR(50) DEFAULT NULL,
	province VARCHAR(25) DEFAULT NULL,
	country VARCHAR(25) DEFAULT NULL,
	postal_code VARCHAR(10) DEFAULT NULL,
	website VARCHAR(150) DEFAULT NULL,
	tax_status INT(1) DEFAULT 1,
	client_notes MEDIUMTEXT,
	tax_code VARCHAR(75) DEFAULT '',
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bamboo_invoice_histories (
	id INT(11) NOT NULL AUTO_INCREMENT,
	invoice_id INT(11) DEFAULT NULL,
	clientcontacts_id VARCHAR(255) DEFAULT NULL,
	date_sent DATE DEFAULT NULL,
	contact_type INT(1) DEFAULT NULL,
	email_body TEXT,
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bamboo_invoice_payments (
	id INT(11) NOT NULL AUTO_INCREMENT,
	invoice_id INT(11) DEFAULT NULL,
	date_paid DATE DEFAULT NULL,
	amount_paid FLOAT(7,2) DEFAULT NULL,
	payment_note VARCHAR(255) DEFAULT NULL,
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bamboo_invoices (
	id INT(11) NOT NULL AUTO_INCREMENT,
	client_id INT(11) DEFAULT NULL,
	invoice_number VARCHAR(255) DEFAULT NULL,
	dateIssued DATE DEFAULT NULL,
	payment_term VARCHAR(50) DEFAULT NULL,
	tax1_desc VARCHAR(50) DEFAULT NULL,
	tax1_rate DECIMAL(6,3) DEFAULT NULL,
	tax2_desc VARCHAR(50) DEFAULT NULL,
	tax2_rate DECIMAL(6,3) DEFAULT NULL,
	invoice_note TEXT,
	days_payment_due INT(3) UNSIGNED DEFAULT 30,
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bamboo_invoice_items (
	id INT(11) NOT NULL AUTO_INCREMENT,
	invoice_id INT(11) DEFAULT 0,
	amount DECIMAL(11,2) DEFAULT 0,
	quantity DECIMAL(7,2) DEFAULT 1,
	work_description MEDIUMTEXT,
	taxable INT(1) DEFAULT 1,
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bamboo_settings (
	id INT(11) NOT NULL AUTO_INCREMENT,
	company_name VARCHAR(75) DEFAULT NULL,
	address1 VARCHAR(100) DEFAULT NULL,
	address2 VARCHAR(100) DEFAULT NULL,
	city VARCHAR(50) DEFAULT NULL,
	province VARCHAR(25) DEFAULT NULL,
	country VARCHAR(25) DEFAULT NULL,
	postal_code VARCHAR(10) DEFAULT NULL,
	website VARCHAR(150) DEFAULT NULL,
	primary_contact VARCHAR(75) DEFAULT NULL,
	primary_contact_email VARCHAR(50) DEFAULT NULL,
	logo VARCHAR(50) DEFAULT NULL,
	logo_pdf VARCHAR(50) DEFAULT NULL,
	invoice_note_default VARCHAR(255) DEFAULT NULL,
	currency_type VARCHAR(20) DEFAULT NULL,
	currency_symbol VARCHAR(9) DEFAULT '$',
	tax_code VARCHAR(50) DEFAULT NULL,
	tax1_desc VARCHAR(50) DEFAULT NULL,
	tax1_rate FLOAT(6,3) DEFAULT 0,
	tax2_desc VARCHAR(50) DEFAULT NULL,
	tax2_rate FLOAT(6,3) DEFAULT 0,
	save_invoices CHAR(1) DEFAULT 'n',
	days_payment_due INT(3) UNSIGNED DEFAULT 30,
	demo_flag CHAR(1) DEFAULT 'n',
	display_branding CHAR(1) DEFAULT 'y',
	bambooinvoice_version VARCHAR(9) DEFAULT NULL,
	new_version_autocheck CHAR(1) DEFAULT 'n',
	logo_realpath CHAR(1) DEFAULT 'n',
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO bamboo_clientcontacts
	(id, client_id, first_name, last_name, title, email, phone, password, access_level, supervisor, last_login, password_reset)
VALUES
	(1, 0, 'Admin', 'User', 'Administrator', 'admin@targetapp.local', NULL,
		'UyYGMVd0VDRTMQB1UWVSf1YkWXFYIFY3XDJTNVgpCCAPew==', 1, NULL, NULL, '');

INSERT INTO bamboo_settings
	(id, company_name, address1, address2, city, province, country, postal_code, website,
	 primary_contact, primary_contact_email, invoice_note_default, currency_type, currency_symbol,
	 save_invoices, days_payment_due, demo_flag, display_branding, bambooinvoice_version,
	 new_version_autocheck, logo_realpath)
VALUES
	(1, 'Target App Test Fixtures', '1 Fixture Way', NULL, 'Springfield', 'IL', 'USA', '62701',
	 'https://example.test', 'Admin User', 'admin@targetapp.local', 'Thanks for your business',
	 'USD', '$', 'y', 30, 'n', 'y', '0.8.9', 'n', 'n');

INSERT INTO bamboo_clients
	(id, name, address1, address2, city, province, country, postal_code, website, tax_status)
VALUES
	(1, 'Contoso Consulting', '123 Market St', NULL, 'Springfield', 'IL', 'USA', '62701', 'https://contoso.example', 1),
	(2, 'Fabrikam Design', '456 Oak Ave', NULL, 'Shelbyville', 'IL', 'USA', '62702', 'https://fabrikam.example', 1);

INSERT INTO bamboo_invoices
	(id, client_id, invoice_number, dateIssued, payment_term, tax1_desc, tax1_rate, invoice_note, days_payment_due)
VALUES
	(1, 1, 'INV-1001', '2026-01-15', 'Net 30', 'Sales Tax', 6.250, 'Seed data for the local target app', 30);

INSERT INTO bamboo_invoice_items
	(id, invoice_id, amount, quantity, work_description, taxable)
VALUES
	(1, 1, 1200.00, 1, 'Website redesign - seed data', 1);
