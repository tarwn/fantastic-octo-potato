<?php  if (!defined('BASEPATH')) exit('No direct script access allowed');
/*
| Replaces the app's shipped database.php so it points at the docker-compose
| MySQL service instead of a local install. Values are dev-only fixtures
| matching docker-compose.yml, not secrets.
*/

$active_group = 'default';

$db['default']['hostname'] = 'db';
$db['default']['username'] = 'bamboo';
$db['default']['password'] = 'bamboo_dev_password';
$db['default']['database'] = 'bambooinvoice';
$db['default']['dbdriver'] = 'mysqli';
$db['default']['dbprefix'] = 'bamboo_';
$db['default']['active_r'] = TRUE;
$db['default']['pconnect'] = FALSE;
$db['default']['db_debug'] = TRUE;
$db['default']['cache_on'] = FALSE;
$db['default']['cachedir'] = '';
$db['default']['char_set'] = 'utf8';
$db['default']['dbcollat'] = 'utf8_general_ci';

?>
