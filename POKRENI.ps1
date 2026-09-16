<#
  POKRENI.ps1 — jedna komanda umjesto pet koraka.

      .\POKRENI.ps1

  Provjeri sve što je ikad zapelo, pokrene server i otvori pregledač.
  Ako nešto fali, kaže TAČNO šta i šta da uradiš — ne „greška".

  Ako Windows odbije da pokrene skriptu, jednom u PowerShellu:
      Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#>

$ErrorActionPreference = 'Stop'
$korijen = $PSScriptRoot
Set-Location $korijen

function Red($t)   { Write-Host "  $t" -ForegroundColor Red }
function Zelen($t) { Write-Host "  $t" -ForegroundColor Green }
function Sivo($t)  { Write-Host "  $t" -ForegroundColor DarkGray }

Write-Host ''
Write-Host '  HACCP za distributere — provjera prije pokretanja' -ForegroundColor Cyan
Write-Host ''

# --- 1. node ----------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Red 'Node.js nije instaliran.'
  Sivo 'Instaliraj sa nodejs.org (LTS verzija), pa zatvori i otvori PowerShell ponovo.'
  Write-Host ''; exit 2
}
Zelen ("Node $(node -v)")

# --- 2. paketi --------------------------------------------------------
if (-not (Test-Path (Join-Path $korijen 'node_modules'))) {
  Sivo 'Paketi nisu instalirani — instaliram (traje minut-dva)...'
  npm install
  if ($LASTEXITCODE -ne 0) { Red 'npm install nije uspio.'; Write-Host ''; exit 2 }
}
Zelen 'Paketi na mjestu'

# --- 3. .env ----------------------------------------------------------
$envPut = Join-Path $korijen '.env'
if (-not (Test-Path $envPut)) {
  Red '.env ne postoji.'
  Sivo 'Prekopiraj .env.example u .env i upiši DATABASE_URL i ADMIN_TOKEN.'
  Sivo 'DATABASE_URL se uzima sa Supabase → Connect → Session pooler, port 5432.'
  Write-Host ''; exit 2
}
$envTekst = Get-Content $envPut -Raw -Encoding UTF8
foreach ($k in 'DATABASE_URL', 'ADMIN_TOKEN') {
  if ($envTekst -notmatch "(?m)^\s*$k\s*=\s*\S") {
    Red "$k nedostaje u .env"
    Write-Host ''; exit 2
  }
}
if ($envTekst -match '(?m)^\s*DATABASE_URL\s*=.*:6543') {
  Red 'DATABASE_URL koristi port 6543 (Transaction pooler).'
  Sivo 'Treba Session pooler, port 5432 — inače neki upiti pucaju.'
  Write-Host ''; exit 2
}
Zelen '.env popunjen'

# --- 4. baza ----------------------------------------------------------
Sivo 'Provjeravam bazu...'
$provjera = Join-Path $env:TEMP 'haccp-provjera.mjs'
@'
import 'dotenv/config';
import pg from 'pg';
const k = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: /supabase|render|amazonaws/.test(process.env.DATABASE_URL || '')
    ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 20000,
});
try {
  await k.connect();
  const t = await k.query(
    "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'");
  const v = await k.query(
    "SELECT to_regclass('public.v_dnevni_pregled') IS NOT NULL AS ima07");
  const l = await k.query(
    "SELECT to_regclass('public.lice') IS NOT NULL AS ima08");
  const f = await k.query('SELECT count(*)::int n FROM firma');
  const u = await k.query("SELECT count(*)::int n FROM korisnik WHERE aktivan");
  console.log(JSON.stringify({
    ok: true, tabela: t.rows[0].n, ima07: v.rows[0].ima07, ima08: l.rows[0].ima08,
    firmi: f.rows[0].n, korisnika: u.rows[0].n }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, greska: e.message }));
} finally { await k.end().catch(() => {}); }
'@ | Set-Content -Path $provjera -Encoding UTF8

$ispis = node $provjera 2>&1 | Select-Object -Last 1
Remove-Item $provjera -Force -ErrorAction SilentlyContinue
try { $r = $ispis | ConvertFrom-Json } catch { $r = $null }

if (-not $r -or -not $r.ok) {
  Red 'Ne mogu da se povežem na bazu.'
  # Bez „if" u zagradi — Windows PowerShell 5.1 to ne prihvata kao izraz.
  $razlog = "$ispis"
  if ($r) { $razlog = $r.greska }
  Sivo $razlog
  Sivo 'Najčešće: pogrešna lozinka u DATABASE_URL, ili Supabase projekat pauziran.'
  Write-Host ''; exit 2
}
Zelen "Baza radi — $($r.tabela) tabela, $($r.firmi) firma, $($r.korisnika) aktivnih naloga"

if (-not $r.ima07 -or -not $r.ima08) {
  # Nema kopiranja u Supabase i nema `Get-Content` — primjenjuje se odavde.
  # Pokreću se samo dopune koje ne diraju podatke (07 i 08).
  Sivo 'Nedostaje neka SQL dopuna — primjenjujem je sada.'
  node (Join-Path $PSScriptRoot 'alati\dopune.mjs')
  if ($LASTEXITCODE -ne 0) {
    Red 'Dopuna nije prošla. Aplikacija se ne pokreće dok se to ne riješi.'
    Sivo 'Ako ne ide ni iz drugog pokušaja, isti fajl možeš nalijepiti ručno:'
    Sivo '   Supabase -> SQL Editor -> New query -> sadržaj db\08_lica_cg.sql -> Run'
    Write-Host ''; exit 2
  }
  Zelen 'SQL dopune primijenjene'
} else {
  Zelen 'Sve SQL dopune primijenjene'
}

if ($r.korisnika -eq 0) {
  Red 'Nema nijednog naloga — nećeš moći da se prijaviš.'
  Sivo '   node alati\prvi-korisnik.mjs tvoj@mejl.com "Ime Prezime"'
  Write-Host ''; exit 2
}

# --- 5. pokretanje ----------------------------------------------------
$port = 3000
if ($envTekst -match '(?m)^\s*PORT\s*=\s*(\d+)') { $port = $Matches[1] }

Write-Host ''
Zelen "Sve je u redu. Pokrećem server na http://localhost:$port"
Sivo  'Pregledač se otvara sam. Za gašenje: Ctrl+C u ovom prozoru.'
Write-Host ''

Start-Job -ScriptBlock {
  param($p)
  Start-Sleep -Seconds 4
  Start-Process "http://localhost:$p/prijava.html"
} -ArgumentList $port | Out-Null

npm start
