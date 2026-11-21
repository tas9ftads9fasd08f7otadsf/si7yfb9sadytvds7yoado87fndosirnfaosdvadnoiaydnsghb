<?php

// The deploy writes config.php from ICLOUD_API_TOKEN, ICLOUD_CONTAINER and REGIONS_CATALOG (README);
// a site run by hand copies this to config.php.
return [
    'container' => 'iCloud.com.rikimaps.rikimaps.maps',
    'apiToken' => '',
    'environment' => 'production',
    // The https address of the region catalog (maps.json); empty turns region downloads off.
    'regionsCatalog' => '',
];
