<#
  zakazi.ps1 — da bekap i dnevna provjera rade SAMI.

      .\alati\zakazi.ps1

  ZAŠTO POSTOJI
  Skripta koju niko ne pokrene ne postoji. `bekap.ps1` i `dnevni-pregled.mjs`
  su napisani, ispravni i potpuno beskorisni dok ih neko ne sjeti da pokrene
  — a sjetiće se dok je posao nov, i prestati kad postane rutina. Tada baš
  i zatreba.

  Ovo ih upisuje u Windows Task Scheduler:

    · Dnevna provjera   svako jutro u 08:00 — stižu li zapisi kod klijenata
    · Sedmični bekap    ponedjeljkom u 07:30 — pg_dump po klijentu

  Oba se pokreću samo kad si prijavljena na računar. To je namjerno:
  poslovi koji rade u pozadini bez tvog znanja se ne primijete kad puknu.

  Skidanje:   .\alati\zakazi.ps1 -Ukloni
  Pregled:    Get-ScheduledTask -TaskPath \HACCP-CG\
#>

param([switch]$Ukloni)

$ErrorActionPreference = 'Stop'
$korijen = Split-Path -Parent $PSScriptRoot
$mapa    = '\HACCP-CG\'

function Zelen($t) { Write-Host "  $t" -ForegroundColor Green }
function Sivo($t)  { Write-Host "  $t" -ForegroundColor DarkGray }
function Red($t)   { Write-Host "  $t" -ForegroundColor Red }

Write-Host ''

# ------------------------------------------------------------- uklanjanje
if ($Ukloni) {
  $ima = Get-ScheduledTask -TaskPath $mapa -ErrorAction SilentlyContinue
  if (-not $ima) { Sivo 'Nema zakazanih poslova.'; Write-Host ''; exit 0 }
  foreach ($z in $ima) {
    Unregister-ScheduledTask -TaskName $z.TaskName -TaskPath $mapa -Confirm:$false
    Zelen "uklonjeno: $($z.TaskName)"
  }
  Write-Host ''; exit 0
}

# ---------------------------------------------------------------- provjere
if (-not (Test-Path (Join-Path $PSScriptRoot 'klijenti.txt'))) {
  Red 'alati\klijenti.txt ne postoji.'
  Sivo 'Bez njega oba posla gledaju samo bazu iz .env. Napravi ga, po jedan red:'
  Sivo '   Mljekara Niksic = postgresql://postgres.xxx:lozinka@...pooler...:5432/postgres'
  Sivo 'Taj fajl ima lozinke i nije u gitu. Nastavljam svejedno.'
  Write-Host ''
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Red 'Node.js nije instaliran.'; Write-Host ''; exit 2 }

# ---------------------------------------------------------------- posao 1
$radnja = New-ScheduledTaskAction -Execute $node `
  -Argument 'alati\dnevni-pregled.mjs' -WorkingDirectory $korijen
$kada = New-ScheduledTaskTrigger -Daily -At 8:00am
$kako = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName 'Dnevna provjera klijenata' -TaskPath $mapa `
  -Action $radnja -Trigger $kada -Settings $kako -Force `
  -Description 'Stižu li zapisi kod klijenata. Izlazni kod 1 ako je neko u zastoju.' | Out-Null
Zelen 'Dnevna provjera  —  svaki dan u 08:00'

# ---------------------------------------------------------------- posao 2
$ps = (Get-Command powershell).Source
$radnja2 = New-ScheduledTaskAction -Execute $ps `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$korijen\alati\bekap.ps1`"" `
  -WorkingDirectory $korijen
$kada2 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 7:30am
$kako2 = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask -TaskName 'Sedmicni bekap baza' -TaskPath $mapa `
  -Action $radnja2 -Trigger $kada2 -Settings $kako2 -Force `
  -Description 'pg_dump po klijentu u bekap\, brise starije od 90 dana.' | Out-Null
Zelen 'Sedmični bekap   —  ponedjeljkom u 07:30'

Write-Host ''
Sivo 'Provjera da li stvarno stoje:'
Sivo '   Get-ScheduledTask -TaskPath \HACCP-CG\'
Sivo 'Pokretanje odmah, da vidiš da radi:'
Sivo '   Start-ScheduledTask -TaskPath \HACCP-CG\ -TaskName "Dnevna provjera klijenata"'
Write-Host ''
Write-Host '  Ovo NIJE bekap van računara.' -ForegroundColor Yellow
Sivo 'Fajlovi ostaju u bekap\ na ovom disku. Ako disk crkne, crkli su i oni.'
Sivo 'Jednom mjesečno prekopiraj tu mapu na drugi disk ili u oblak.'
Write-Host ''
