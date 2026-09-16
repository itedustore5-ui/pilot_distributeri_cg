<#
  BEKAP BAZE — jedna komanda po klijentu.

      .\alati\bekap.ps1

  ZAŠTO POSTOJI
  Supabase na besplatnom planu ne garantuje vraćanje podataka. Ako baza
  nestane, nestala je i evidencija klijenta za svaki dan otkad radi —
  a to je po članu 41 Zakona o bezbjednosti hrane njegova zakonska
  obaveza, ne tvoja usluga. Bekap nije tehnička sitnica, to je razlika
  između „izvini" i tužbe.

  ŠTA PRAVI
  Jedan .dump fajl po klijentu, u folderu bekap\, sa datumom u imenu.
  Stariji od 90 dana se brišu sami.

  ŠTA TI TREBA
  pg_dump — dolazi uz PostgreSQL za Windows. Ako ga nemaš:
    1. postgresql.org/download/windows → Download the installer
    2. U instalaciji OTKAČI „PostgreSQL Server" i „pgAdmin",
       ostavi SAMO „Command Line Tools". Ne treba ti server na računaru.
    3. Zatvori i otvori PowerShell ponovo.

  KOJE BAZE
  Iste kao dnevni pregled: alati\klijenti.txt, po jedan red
      Naziv klijenta = postgresql://...
  Ako tog fajla nema, uzima DATABASE_URL iz .env.

  KOLIKO ČESTO
  Jednom sedmično je minimum dok klijenata ima malo. Prije svake izmjene
  baze (05, 06, 07 skripte) — obavezno, bez izuzetka.

  KAKO SE VRAĆA
  Vraćanje je odvojen posao i radi se svjesno, ne u panici:
      pg_restore --clean --if-exists -d "postgresql://..." bekap\ime.dump
  Prvi put to isprobaj na PRAZNOJ bazi, ne na klijentovoj. Bekap koji
  nikad nisi vratila nije bekap, nego nada.
#>

$ErrorActionPreference = 'Stop'
$korijen = Split-Path -Parent $PSScriptRoot
$folder  = Join-Path $korijen 'bekap'

# --- ima li pg_dump ---------------------------------------------------
$pgdump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgdump) {
  $kandidati = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue |
               Sort-Object FullName -Descending
  if ($kandidati) { $pgdump = $kandidati[0].FullName }
}
if (-not $pgdump) {
  Write-Host ''
  Write-Host '  pg_dump nije pronadjen.' -ForegroundColor Red
  Write-Host '  Instaliraj PostgreSQL Command Line Tools — uputstvo je u zaglavlju ove skripte.'
  Write-Host ''
  exit 2
}
$pgdump = if ($pgdump -is [string]) { $pgdump } else { $pgdump.Source }

# --- koje baze --------------------------------------------------------
$spisak = @()
$fajl = Join-Path $PSScriptRoot 'klijenti.txt'
if (Test-Path $fajl) {
  foreach ($red in Get-Content $fajl -Encoding UTF8) {
    $r = $red.Trim()
    if (-not $r -or $r.StartsWith('#')) { continue }
    $i = $r.IndexOf('=')
    if ($i -lt 0) { continue }
    $spisak += [pscustomobject]@{
      Naziv = $r.Substring(0, $i).Trim()
      Url   = $r.Substring($i + 1).Trim()
    }
  }
}
if ($spisak.Count -eq 0) {
  $env = Join-Path $korijen '.env'
  if (Test-Path $env) {
    $red = Select-String -Path $env -Pattern '^\s*DATABASE_URL\s*=\s*(.+)$' |
           Select-Object -First 1
    if ($red) {
      $spisak += [pscustomobject]@{
        Naziv = 'iz-env'
        Url   = $red.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")
      }
    }
  }
}
if ($spisak.Count -eq 0) {
  Write-Host ''
  Write-Host '  Nema ni alati\klijenti.txt ni DATABASE_URL u .env.' -ForegroundColor Red
  Write-Host ''
  exit 2
}

New-Item -ItemType Directory -Force -Path $folder | Out-Null
$danas = Get-Date -Format 'yyyy-MM-dd'
$greske = 0

Write-Host ''
foreach ($k in $spisak) {
  $ime  = ($k.Naziv -replace '[^\p{L}\p{Nd}]+', '-').Trim('-')
  $put  = Join-Path $folder "$ime-$danas.dump"
  Write-Host ("  {0,-24} " -f $k.Naziv) -NoNewline
  try {
    # Adresa baze ide kao ZASEBAN argument, ne zalijepljena za --dbname=.
    # Lozinka u adresi zna da sadrži znak koji PowerShell drugačije čita.
    # --format=custom je jedini format koji pg_restore vraća selektivno.
    $ispis = & $pgdump '-d' $k.Url '--format=custom' '--no-owner' '--no-privileges' '-f' $put 2>&1
    if ($LASTEXITCODE -ne 0) {
      $poruka = ($ispis | Where-Object { "$_".Trim() } | Select-Object -Last 3) -join '; '
      if (-not $poruka) { $poruka = "pg_dump je vratio kod $LASTEXITCODE" }
      throw $poruka
    }
    $mb = [math]::Round((Get-Item $put).Length / 1MB, 2)
    Write-Host "$mb MB  ->  bekap\$ime-$danas.dump" -ForegroundColor Green
  } catch {
    $greske++
    if (Test-Path $put) { Remove-Item $put -Force }
    Write-Host "NIJE USPJELO" -ForegroundColor Red
    Write-Host "      $_"
  }
}

# --- brisanje starijih od 90 dana ------------------------------------
$stari = Get-ChildItem $folder -Filter '*.dump' -ErrorAction SilentlyContinue |
         Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-90) }
if ($stari) {
  $stari | Remove-Item -Force
  Write-Host ("`n  Obrisano {0} bekapa starijih od 90 dana." -f $stari.Count)
}

Write-Host ''
if ($greske) {
  Write-Host "  $greske od $($spisak.Count) nije uspjelo. Ne zatvaraj dok ovo ne riješiš." -ForegroundColor Red
  Write-Host ''
  exit 1
}
Write-Host "  Gotovo — $($spisak.Count) baza u folderu bekap\." -ForegroundColor Green
Write-Host '  Taj folder nije u gitu. Prekopiraj ga na drugi disk ili u oblak.'
Write-Host ''
