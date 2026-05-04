const { readFileSync, writeFileSync } = require('node:fs');

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

const manifest = `fx_version 'cerulean'
game 'gta5'

server_only 'yes'
lua54 'yes'
use_experimental_fxv2_oal 'yes'
node_version '22'

name '${packageJson.name}'
author '${packageJson.author}'
version '${packageJson.version}'
license '${packageJson.license}'
description '${packageJson.description}'

dependencies {
    '/server:12913',
}

server_scripts {
    '@kura-lib/init.lua',
    'dist/server.js',
    'lib/schema.generated.lua',
    'lib/KuraDB.lua',
    'lib/QueryBuilder.lua',
    'lib/init.lua',
    'lib/version.lua',
}

convar_category 'kuradb' {
    'Configuration',
    {
        { 'Connection String', 'kuradb_connection_string', 'CV_STRING', 'postgres://root:password69@localhost:5432/fivem' },
        { 'Debug', 'kuradb_debug', 'CV_BOOL', 'false' },
        { 'Slow Query Warning (ms)', 'kuradb_slow_query_warning', 'CV_INT', '200' }
    }
}
`;

writeFileSync('./fxmanifest.lua', manifest);
