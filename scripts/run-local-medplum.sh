#!/usr/bin/env bash
# Run fhir-verify against a local Medplum (http://localhost:8103) using the default
# super-admin account. Test/dev instances only — never production.
set -euo pipefail

SERVER="${MEDPLUM_URL:-http://localhost:8103}"
EMAIL="${MEDPLUM_EMAIL:-admin@example.com}"
PASSWORD="${MEDPLUM_PASSWORD:-medplum_admin}"
PACKS="${1:-all}"

V="fhirverify$(date +%s)pkceverifier1234567890abcdefgh"
CODE=$(curl -s -X POST "$SERVER/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"scope\":\"openid\",\"codeChallenge\":\"$V\",\"codeChallengeMethod\":\"plain\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['code'])")
TOKEN=$(curl -s -X POST "$SERVER/oauth2/token" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=$CODE&code_verifier=$V" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")

exec node "$(dirname "$0")/../dist/cli.js" --server "$SERVER" --token "$TOKEN" --packs "$PACKS"
