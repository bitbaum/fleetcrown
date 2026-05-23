#!/bin/bash
# Creates one database per studio project. Extend this list as you migrate apps.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'EOSQL'
CREATE DATABASE cockpit;
CREATE DATABASE kivvi;
CREATE DATABASE revampit;
CREATE DATABASE revamp_info;
CREATE DATABASE aoz_housing;
CREATE DATABASE petvity;
CREATE DATABASE vitareba;
CREATE DATABASE surf_your_life;
EOSQL
