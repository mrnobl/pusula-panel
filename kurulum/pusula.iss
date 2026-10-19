; ---------------------------------------------------------------------------
;  Pusula — Windows kurulum programı (68.3, PLAN-TASIMA F4). Inno Setup 6 (ücretsiz).
;
;  YÖNETİCİ İZNİ İSTEMEZ (PrivilegesRequired=lowest): program %LOCALAPPDATA%\Programs\Pusula'ya kurulur, veri ayrı
;  bir klasörde (varsayılan C:\Pusula-Veri — scripts/kur.js program köküne PUSULA-KURULUM.json işaretini yazar, lib/yollar.js
;  veriyi oraya koyar). İçerik: program dosyaları (scripts/dagitim.js kuralıyla — araştırma, önbellek, kişisel veri YOK),
;  taşınabilir Node.js, MinGit (güncelleme Git ile), hazır node_modules. Kurulumun sonunda scripts/kur.js çalışır
;  (görevler, kısayollar, veri klasörü, telefon jetonu, uyku ayarı, git uzak deposu); son ekranda "Pusula'yı aç" → tarayıcıda
;  kurulum sihirbazı ("Yeni kurulum" / "Başka bilgisayardan taşı").
;  KALDIRMA: Pusula durdurulur, görevler ve kısayollar silinir, program klasörü silinir. VERİ SİLİNMEZ (kullanıcıya söylenir).
;
;  Derleme (GitHub Actions, .github/workflows/kurulum.yml — elle ya da kurulum-v* etiketiyle):
;    ISCC /DSurum=68.3 /DKaynak=<hazır ağaç> /O<çıktı> kurulum\pusula.iss
;  <hazır ağaç> = dağıtım ağacı + node\ + git\ + node_modules\ + kurulum\surum.json.
;  Rol: Pusula-Kurulum-<sürüm>.exe /ROL=sunucu  (varsayılan kullanici; sunucu = USB yedek görevi de kurulur).
; ---------------------------------------------------------------------------

#ifndef Surum
  #define Surum "0.0"
#endif
#ifndef Kaynak
  #define Kaynak "..\yapi\Pusula"
#endif

[Setup]
AppId={{6F1C3A52-8E4B-4C1D-9B7A-2D5E8F0A4C31}
AppName=Pusula
AppVersion={#Surum}
AppVerName=Pusula {#Surum}
AppPublisher=Pusula
DefaultDirName={localappdata}\Programs\Pusula
DefaultGroupName=Pusula
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputBaseFilename=Pusula-Kurulum-{#Surum}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupIconFile={#Kaynak}\public\img\pusula.ico
UninstallDisplayIcon={app}\public\img\pusula.ico
UninstallDisplayName=Pusula
CloseApplications=no
RestartApplications=no
; Program klasörü kurulumdan sonra git deposu olur (güncelleme); Inno'nun kendi dosya listesi kaldırmada yine silinir.
SetupLogging=yes

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[CustomMessages]
turkish.KurAdimi=Pusula kuruluyor: görevler, kısayollar, veri klasörü, telefon jetonu, güncelleme deposu…
turkish.AcPusula=Pusula'yı başlat ve kurulum sihirbazını aç
turkish.KurHata=Kurulumun bazı adımları tamamlanamadı (ayrıntı: %1).%n%nPusula açılınca Sistem › Kurulum denetimi sayfasında kırmızı satırlar ve "Onar" düğmesi var.
turkish.VeriKaldi=Pusula kaldırıldı.%n%nVERİLERİNİZ SİLİNMEDİ: %1%n%nPortföy kayıtları, bot durumları, ayarlar ve şifreli anahtarlar bu klasörde duruyor. Yeniden kurarsanız Pusula aynı klasörü kullanır. Gerçekten silmek isterseniz klasörü kendiniz silin.

[Files]
Source: "{#Kaynak}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Run]
Filename: "{app}\node\node.exe"; Parameters: """{app}\scripts\kur.js"" --adim ac"; WorkingDir: "{app}"; Description: "{cm:AcPusula}"; Flags: postinstall nowait runhidden skipifsilent

[UninstallRun]
; Önce Pusula durur (yalnız kendi PID kaydı), sonra bu klasörü gösteren görevler ve kısayollar silinir.
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\scripts\pusula-sunucu.ps1"" -Islem Durdur -Evet"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; RunOnceId: "PusulaDurdur"
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\kurulum\kaldir.ps1"""; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; RunOnceId: "PusulaGorevler"

[UninstallDelete]
; Kurulumdan sonra oluşan PROGRAM dosyaları (veri DEĞİL — veri ayrı klasörde ve silinmez).
Type: filesandordirs; Name: "{app}\.git"
Type: filesandordirs; Name: "{app}\node_modules"
Type: files; Name: "{app}\PUSULA-KURULUM.json"
Type: files; Name: "{app}\veri-yeri.json"

[Code]
var
  VeriYeri: String;

function JsonAlan(const Metin, Alan: String): String;
var
  P, Q: Integer;
  S: String;
begin
  Result := '';
  P := Pos('"' + Alan + '"', Metin);
  if P = 0 then Exit;
  S := Copy(Metin, P + Length(Alan) + 2, Length(Metin));
  P := Pos('"', S);
  if P = 0 then Exit;
  S := Copy(S, P + 1, Length(S));
  Q := Pos('"', S);
  if Q = 0 then Exit;
  Result := Copy(S, 1, Q - 1);
  StringChangeEx(Result, '\\', '\', True);
end;

function VeriYeriOku(): String;
var
  Metin: AnsiString;
begin
  Result := 'C:\Pusula-Veri';
  if LoadStringFromFile(ExpandConstant('{app}\PUSULA-KURULUM.json'), Metin) then
    if JsonAlan(String(Metin), 'veriYeri') <> '' then Result := JsonAlan(String(Metin), 'veriYeri');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Kod: Integer;
  Rol: String;
begin
  if CurStep = ssPostInstall then
  begin
    Rol := ExpandConstant('{param:ROL|kullanici}');
    if (Rol <> 'sunucu') then Rol := 'kullanici';
    WizardForm.StatusLabel.Caption := CustomMessage('KurAdimi');
    if not Exec(ExpandConstant('{app}\node\node.exe'), '"' + ExpandConstant('{app}\scripts\kur.js') + '" --rol ' + Rol, ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, Kod) or (Kod <> 0) then
    begin
      if not WizardSilent() then
        MsgBox(FmtMessage(CustomMessage('KurHata'), [VeriYeriOku() + '\makine\kur.log']), mbInformation, MB_OK);
      Log('kur.js çıkış kodu: ' + IntToStr(Kod));
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
    VeriYeri := VeriYeriOku();
  if (CurUninstallStep = usPostUninstall) and (not UninstallSilent()) then
    MsgBox(FmtMessage(CustomMessage('VeriKaldi'), [VeriYeri]), mbInformation, MB_OK);
end;
