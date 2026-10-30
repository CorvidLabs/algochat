#!/usr/bin/env bash
# Docker-free AlgoKit-compatible localnet for Linux x86_64.
#
# Runs a dev-mode algod (port 4001), kmd (4002) and an indexer (8980) fed by
# conduit into a throwaway PostgreSQL, all under one local directory. It uses
# the same network name (dockernet-v1), token (64 x "a") and default KMD
# wallet as `algokit localnet start`, so tests treat both the same way.
#
# Prefer `algokit localnet start` when Docker is available. This is the
# fallback for Linux machines without Docker.
#
# Usage: py/scripts/native-localnet.sh start|stop|status|reset
# Directory: $ALGOCHAT_LOCALNET_DIR (default: ~/.cache/algochat-localnet)
#
# Local network only: every account and every ALGO here is throwaway.
set -euo pipefail

ALGOD_VERSION="5.0.5"
INDEXER_VERSION="3.11.1"
CONDUIT_VERSION="1.11.1"
PG_VERSION="16.4.0"
# SHA-256 of each pinned download, checked before anything is unpacked. The
# node, indexer and conduit values match the checksum files published with
# their GitHub releases (hashes_stable_linux_amd64_5.0.5 and checksums.txt);
# the PostgreSQL jar value matches the .sha256 file Maven Central publishes
# next to it. The .txz inside the verified jar is pinned too. Bumping a
# version means updating its hash from the same published source.
NODE_SHA256="312ce90bc4b1f5ded20b005ea8173209c2740f4ea84cfe14f79c050a874bc8b1"
INDEXER_SHA256="b90a6118645dc74c97978f729bf89d11a1baac7f9f52428c7c14004b1e3e3a00"
CONDUIT_SHA256="17cd7f6138b2937a2487422531bba21707c5bb1daf9f9b330a071e55629ad025"
PG_JAR_SHA256="14a5cf546aee7d327a2f5b46be6c571f2f724a2b485c270d46f3e44a1ac3df18"
PG_TXZ_SHA256="d24cafae863e1ba9502bdc27942661391748ce60345725e7a15429be637fc8b6"
DIR="${ALGOCHAT_LOCALNET_DIR:-$HOME/.cache/algochat-localnet}"
TOKEN="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
PG_PORT=5443
PG_CONN="host=127.0.0.1 port=${PG_PORT} user=algorand password=x dbname=postgres sslmode=disable"
BIN="$DIR/node/bin"

log() { printf '[localnet] %s\n' "$*"; }

# verify FILE SHA256: refuses (and deletes) a file whose SHA-256 is not the pinned value.
verify() {
  local file="$1" want="$2" got
  got=$(sha256sum "$file" | awk '{print $1}')
  if [ "$got" != "$want" ]; then
    rm -f "$file"
    log "checksum mismatch for $(basename "$file"): expected $want, got $got; deleted it"
    return 1
  fi
}

# fetch URL OUT SHA256: downloads (or reuses) OUT and verifies it before any caller unpacks it.
fetch() {
  local url="$1" out="$2" want="$3"
  if [ ! -s "$out" ]; then
    curl -fsSL -o "$out.part" "$url"
    mv "$out.part" "$out"
  fi
  verify "$out" "$want"
}

install_binaries() {
  mkdir -p "$DIR/dl"
  if [ ! -x "$BIN/algod" ]; then
    log "downloading go-algorand ${ALGOD_VERSION}"
    fetch "https://github.com/algorand/go-algorand/releases/download/v${ALGOD_VERSION}-stable/node_stable_linux-amd64_${ALGOD_VERSION}.tar.gz" "$DIR/dl/node.tar.gz" "$NODE_SHA256"
    mkdir -p "$DIR/node" && tar xzf "$DIR/dl/node.tar.gz" -C "$DIR/node"
  fi
  if [ ! -x "$DIR/indexer/algorand-indexer" ]; then
    log "downloading indexer ${INDEXER_VERSION}"
    fetch "https://github.com/algorand/indexer/releases/download/v${INDEXER_VERSION}/indexer_Linux_x86_64_${INDEXER_VERSION}.tar.gz" "$DIR/dl/indexer.tar.gz" "$INDEXER_SHA256"
    mkdir -p "$DIR/indexer" && tar xzf "$DIR/dl/indexer.tar.gz" -C "$DIR/indexer"
  fi
  if [ ! -x "$DIR/conduit/conduit" ]; then
    log "downloading conduit ${CONDUIT_VERSION}"
    fetch "https://github.com/algorand/conduit/releases/download/v${CONDUIT_VERSION}/conduit_Linux_x86_64_${CONDUIT_VERSION}.tar.gz" "$DIR/dl/conduit.tar.gz" "$CONDUIT_SHA256"
    mkdir -p "$DIR/conduit" && tar xzf "$DIR/dl/conduit.tar.gz" -C "$DIR/conduit"
  fi
  if [ ! -x "$DIR/pg/bin/postgres" ]; then
    log "downloading PostgreSQL ${PG_VERSION} (embedded binaries)"
    fetch "https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-linux-amd64/${PG_VERSION}/embedded-postgres-binaries-linux-amd64-${PG_VERSION}.jar" "$DIR/dl/pg.jar" "$PG_JAR_SHA256"
    mkdir -p "$DIR/pg"
    python3 -c "import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extract('postgres-linux-x86_64.txz',sys.argv[2])" "$DIR/dl/pg.jar" "$DIR/dl"
    verify "$DIR/dl/postgres-linux-x86_64.txz" "$PG_TXZ_SHA256"
    tar xJf "$DIR/dl/postgres-linux-x86_64.txz" -C "$DIR/pg"
  fi
}

create_network() {
  [ -d "$DIR/net/data" ] && return
  log "creating dev-mode network (one-time; participation keys take a few minutes)"
  cat > "$DIR/template.json" <<'JSON'
{
  "Genesis": {
    "NetworkName": "dockernet",
    "ConsensusProtocol": "future",
    "DevMode": true,
    "Wallets": [
      {"Name": "Wallet1", "Stake": 40, "Online": true},
      {"Name": "Wallet2", "Stake": 40, "Online": true},
      {"Name": "Wallet3", "Stake": 20, "Online": false}
    ]
  },
  "Nodes": [
    {"Name": "data", "IsRelay": false, "Wallets": [
      {"Name": "Wallet1", "ParticipationOnly": false},
      {"Name": "Wallet2", "ParticipationOnly": false},
      {"Name": "Wallet3", "ParticipationOnly": false}
    ]}
  ]
}
JSON
  "$BIN/goal" network create -r "$DIR/net" -n dockernet -t "$DIR/template.json"
  python3 - "$DIR/net/data/config.json" <<'PY'
import json, sys
p = sys.argv[1]
c = json.load(open(p))
c.update({"EndpointAddress": "127.0.0.1:4001", "Archival": True, "EnableDeveloperAPI": True, "MaxAcctLookback": 256})
json.dump(c, open(p, "w"), indent=2)
PY
  printf '%s' "$TOKEN" > "$DIR/net/data/algod.token"
  printf '%s' "$TOKEN" > "$DIR/net/data/algod.admin.token"
  printf '{"address":"127.0.0.1:4002","allowed_origins":["*"]}\n' > "$DIR/net/data/kmd-v0.5/kmd_config.json"
  printf '%s' "$TOKEN" > "$DIR/net/data/kmd-v0.5/kmd.token"
  chmod 700 "$DIR/net/data/kmd-v0.5"
}

create_pipeline() {
  if [ ! -d "$DIR/pgdata" ]; then
    "$DIR/pg/bin/initdb" -D "$DIR/pgdata" -U algorand --auth=trust >"$DIR/initdb.log" 2>&1
  fi
  mkdir -p "$DIR/conduit-data" "$DIR/indexer-data"
  cat > "$DIR/conduit-data/conduit.yml" <<YML
log-level: info
retry-count: 0
retry-delay: "1s"
hide-banner: true
api:
  addr: ":8981"
metrics:
  mode: OFF
importer:
  name: algod
  config:
    mode: "follower"
    netaddr: "http://127.0.0.1:4001"
    token: "${TOKEN}"
exporter:
  name: postgresql
  config:
    connection-string: "${PG_CONN}"
YML
}

wait_http() {
  local url="$1" header="$2"
  for _ in $(seq 1 60); do
    curl -fs -H "$header" "$url" >/dev/null 2>&1 && return 0
    sleep 1
  done
  log "timed out waiting for $url" && return 1
}

# A dev-mode network only makes a block when a transaction arrives. Conduit
# fails to start until round 1 exists, so send one 0-ALGO self-payment from a
# localnet wallet account on a fresh network before starting it.
kick_first_round() {
  local round
  round=$(curl -fs -H "X-Algo-API-Token: $TOKEN" http://127.0.0.1:4001/v2/status | python3 -c 'import json,sys;print(json.load(sys.stdin)["last-round"])')
  [ "$round" != "0" ] && return
  local addr
  addr=$("$BIN/goal" account list -d "$DIR/net/data" | awk 'NR==1{print $2}')
  "$BIN/goal" clerk send -d "$DIR/net/data" -a 0 -f "$addr" -t "$addr" >/dev/null
}

start() {
  install_binaries
  create_network
  create_pipeline
  "$BIN/goal" network start -r "$DIR/net" || true
  "$BIN/goal" kmd start -d "$DIR/net/data" || true
  wait_http "http://127.0.0.1:4001/v2/status" "X-Algo-API-Token: $TOKEN"
  "$DIR/pg/bin/pg_ctl" -D "$DIR/pgdata" -o "-p ${PG_PORT} -k /tmp -c listen_addresses=127.0.0.1" -l "$DIR/pg.log" status >/dev/null 2>&1 \
    || "$DIR/pg/bin/pg_ctl" -D "$DIR/pgdata" -o "-p ${PG_PORT} -k /tmp -c listen_addresses=127.0.0.1" -l "$DIR/pg.log" -w start
  kick_first_round
  pgrep -f "$DIR/conduit/conduit" >/dev/null || nohup "$DIR/conduit/conduit" -d "$DIR/conduit-data" >"$DIR/conduit.log" 2>&1 &
  for _ in $(seq 1 60); do
    grep -q 'FINISHED Pipeline round' "$DIR/conduit.log" 2>/dev/null && break
    sleep 1
  done
  # --enable-all-parameters as AlgoKit's localnet runs it, so asset and tx-type searches work.
  pgrep -f "$DIR/indexer/algorand-indexer" >/dev/null || nohup "$DIR/indexer/algorand-indexer" daemon --enable-all-parameters \
    --data-dir "$DIR/indexer-data" --server 127.0.0.1:8980 --postgres "$PG_CONN" --token "$TOKEN" >"$DIR/indexer.log" 2>&1 &
  wait_http "http://127.0.0.1:8980/health" "X-Indexer-API-Token: $TOKEN"
  log "running: algod http://127.0.0.1:4001, kmd http://127.0.0.1:4002, indexer http://127.0.0.1:8980 (token: 64 x 'a')"
}

stop() {
  pkill -f "$DIR/indexer/algorand-indexer" 2>/dev/null || true
  pkill -f "$DIR/conduit/conduit" 2>/dev/null || true
  [ -d "$DIR/pgdata" ] && "$DIR/pg/bin/pg_ctl" -D "$DIR/pgdata" -m fast stop 2>/dev/null || true
  [ -d "$DIR/net/data" ] && "$BIN/goal" kmd stop -d "$DIR/net/data" 2>/dev/null || true
  [ -d "$DIR/net" ] && "$BIN/goal" network stop -r "$DIR/net" 2>/dev/null || true
  log "stopped"
}

status() {
  curl -fs -H "X-Algo-API-Token: $TOKEN" http://127.0.0.1:4001/v2/status >/dev/null && log "algod up" || log "algod down"
  curl -fs -H "X-Indexer-API-Token: $TOKEN" http://127.0.0.1:8980/health && echo || log "indexer down"
}

reset() {
  stop
  rm -rf "$DIR/net" "$DIR/pgdata" "$DIR/conduit-data" "$DIR/indexer-data"
  start
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  reset) reset ;;
  *) echo "usage: $0 start|stop|status|reset" >&2; exit 2 ;;
esac
