# ローカル Edge Function を curl 相当で叩く
# 事前: npx supabase functions serve grade-scan --no-verify-jwt --env-file .env
$ErrorActionPreference = "Stop"

$body = @{
  dryRun      = $true
  mimeType    = "image/jpeg"
  imageBase64 = (Get-Content -Raw "supabase/functions/grade-scan/fixtures/sample-jpeg.b64").Trim()
  carteJsonb  = Get-Content -Raw "supabase/functions/grade-scan/fixtures/sample-carte.json" | ConvertFrom-Json
} | ConvertTo-Json -Depth 8

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:54321/functions/v1/grade-scan" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 8
