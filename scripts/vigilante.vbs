Option Explicit

' =============================================================================
'  vigilante.vbs  -  Vigila la app de inventario y el tunel de Cloudflare.
'  Lo corre el Programador de Tareas cada 2 minutos. NO muestra ventanas.
'
'  QUE HACE:
'   1) Si nadie escucha en 127.0.0.1:3010, ejecuta scripts\iniciar-app.bat.
'   2) Revisa http://127.0.0.1:3011/ready (metricas de cloudflared).
'   3) Solo arranca o reinicia cloudflared cuando de verdad hace falta.
'
'  POR QUE TANTO CUIDADO CON CLOUDFLARED:
'   La URL del tunel rapido CAMBIA cada vez que arranca cloudflared. Si lo
'   reiniciamos sin necesidad, al duenio se le rompe el enlace que ya tiene
'   guardado en el celular. Ademas, si /ready falla porque se fue el internet,
'   reiniciar NO arregla nada y si cambia la URL. Por eso:
'     - Si /ready responde bien, NO se toca nada.
'     - Si /ready falla, se esperan 10 minutos seguidos antes de reiniciar.
'     - Nunca se mata por nombre: se confirma que el PID guardado sea de
'       cloudflared.exe antes de cerrarlo.
'
'  POR QUE WMI PARA ARRANCAR:
'   Lo que el vigilante lanza como hijo queda dentro del "job" del Programador
'   de Tareas y Windows lo puede cerrar cuando termina la tarea. Con
'   Win32_Process.Create el proceso nace DESPRENDIDO y sobrevive, y ademas
'   Win32_ProcessStartup con ShowWindow=0 lo deja sin ventana.
' =============================================================================

' --- Ajustes (deben coincidir con el .env y con src/config.js) ---------------
Const PUERTO_APP       = 3010          ' PUERTO
Const PUERTO_METRICAS  = 3011          ' METRICAS_TUNEL
Const MINUTOS_GRACIA   = 10            ' aguante antes de reiniciar el tunel
Const TOPE_LOG_VIGILANTE = 1048576     ' 1 MB
Const TOPE_LOG_TUNEL     = 5242880     ' 5 MB
Const PARA_LEER = 1
Const PARA_AGREGAR = 8

Dim sh, fso
Dim RAIZ, LOGS, ARCH_LOG, ARCH_LOG_VIEJO, ARCH_PID, ARCH_ESTADO, ARCH_TUNEL, ARCH_TUNEL_VIEJO, ARCH_BAT

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Randomize

' Todo relativo al script: scripts\vigilante.vbs -> la raiz es dos niveles arriba.
RAIZ = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
LOGS = RAIZ & "\logs"
If Not fso.FolderExists(LOGS) Then fso.CreateFolder LOGS

ARCH_LOG         = LOGS & "\vigilante.log"
ARCH_LOG_VIEJO   = LOGS & "\vigilante.1.log"
ARCH_PID         = LOGS & "\cloudflared.pid"
ARCH_ESTADO      = LOGS & "\cloudflared-estado.txt"
ARCH_TUNEL       = LOGS & "\cloudflared.log"
ARCH_TUNEL_VIEJO = LOGS & "\cloudflared.1.log"
ARCH_BAT         = RAIZ & "\scripts\iniciar-app.bat"

' El log se rota al principio, cuando todavia no lo tenemos abierto.
RotarSiPasa ARCH_LOG, TOPE_LOG_VIGILANTE, ARCH_LOG_VIEJO

Principal

Set fso = Nothing
Set sh  = Nothing
WScript.Quit 0


' =============================================================================
'  Flujo principal
' =============================================================================
Sub Principal()
    Dim tunelListo, pidGuardado, pidVivo, pidSuelto, minutos, exe

    ' ---- 1. La app -----------------------------------------------------------
    If PuertoEscuchando(PUERTO_APP) Then
        ' Todo bien, no se toca.
    Else
        Apuntar "La app no escucha en 127.0.0.1:" & PUERTO_APP & ". Se ejecuta iniciar-app.bat."
        If fso.FileExists(ARCH_BAT) Then
            If LanzarDesprendido("cmd /c """ & ARCH_BAT & """", RAIZ) = 0 Then
                ' Si WMI no se pudo usar, al menos se intenta de la forma normal.
                On Error Resume Next
                sh.Run """" & ARCH_BAT & """", 0, False
                On Error GoTo 0
            End If
        Else
            Apuntar "ERROR: no se encontro " & ARCH_BAT
        End If
    End If

    ' ---- 2. Aviso de configuracion que rompe el tunel rapido ------------------
    AvisarConfigCloudflared

    ' ---- 3. El tunel ---------------------------------------------------------
    tunelListo  = TunelListo()
    pidGuardado = LeerPid()
    pidVivo     = False
    If pidGuardado > 0 Then pidVivo = EsCloudflared(pidGuardado)

    If tunelListo Then
        ' Sano: NO se reinicia nunca. Reiniciarlo le cambiaria la URL al duenio.
        BorrarEstadoFallo
        If Not pidVivo Then
            ' Hay tunel sano pero el PID guardado no sirve. Se adopta el que si
            ' esta corriendo en vez de arrancar otro (dos cloudflared pelearian
            ' por el puerto de metricas y cambiarian la URL).
            pidSuelto = PidDeCloudflared()
            If pidSuelto > 0 Then
                GuardarPid pidSuelto
                Apuntar "El tunel responde. Se adopta el cloudflared vivo con PID " & pidSuelto & "."
            Else
                Apuntar "El tunel responde /ready pero no se ve el proceso cloudflared.exe. No se toca nada."
            End If
        End If
        Apuntar "OK: app arriba y tunel respondiendo /ready."
        Exit Sub
    End If

    ' Desde aqui: /ready NO responde.
    If Not pidVivo Then
        pidSuelto = PidDeCloudflared()
        If pidSuelto > 0 Then
            ' Hay un cloudflared corriendo que no era el nuestro. Se adopta y se
            ' le da tiempo: quiza apenas esta levantando la conexion.
            GuardarPid pidSuelto
            MarcarFalloSiHaceFalta
            Apuntar "Sin /ready. Se adopta el cloudflared vivo con PID " & pidSuelto & " y se le da tiempo."
            Exit Sub
        End If

        ' No hay nada corriendo: aqui si hay que arrancar el tunel.
        Apuntar "No hay cloudflared vivo. Se arranca el tunel."
        ArrancarTunel
        Exit Sub
    End If

    ' El proceso vive pero /ready no contesta: casi siempre es falta de internet.
    minutos = MinutosFallando()
    If minutos < MINUTOS_GRACIA Then
        Apuntar "Sin /ready desde hace " & minutos & " min con PID " & pidGuardado & ". Se espera hasta " & MINUTOS_GRACIA & " min antes de tocarlo."
        Exit Sub
    End If

    Apuntar "Sin /ready desde hace " & minutos & " min. Se reinicia el tunel con PID " & pidGuardado & "."
    If CerrarPid(pidGuardado) Then
        BorrarPid
        WScript.Sleep 2000
    End If
    ArrancarTunel
End Sub


' =============================================================================
'  Tunel
' =============================================================================

' Arranca cloudflared DESPRENDIDO y oculto, y guarda el PID que devuelve WMI.
Sub ArrancarTunel()
    Dim exe, comando, pid

    exe = BuscarCloudflared()
    If exe = "" Then
        Apuntar "ERROR: no se encontro cloudflared.exe. Ponlo en bin\cloudflared.exe o define CLOUDFLARED_EXE."
        Exit Sub
    End If

    ' El log de cloudflared solo se rota cuando vamos a arrancar uno nuevo:
    ' mientras hay uno corriendo el archivo esta abierto y no se deja mover.
    RotarSiPasa ARCH_TUNEL, TOPE_LOG_TUNEL, ARCH_TUNEL_VIEJO

    comando = """" & exe & """ tunnel --url http://127.0.0.1:" & PUERTO_APP & _
              " --metrics 127.0.0.1:" & PUERTO_METRICAS & _
              " --logfile """ & ARCH_TUNEL & """ --no-autoupdate"

    pid = LanzarDesprendido(comando, RAIZ)
    If pid > 0 Then
        GuardarPid pid
        BorrarEstadoFallo
        Apuntar "Tunel arrancado con " & exe & " y PID " & pid & ". La URL nueva queda en logs\cloudflared.log."
    Else
        Apuntar "ERROR: no se pudo arrancar cloudflared."
    End If
End Sub

' Orden de busqueda pedido por la tienda.
Function BuscarCloudflared()
    Dim c, salida, lineas, i, l

    BuscarCloudflared = ""

    c = Trim(sh.ExpandEnvironmentStrings("%CLOUDFLARED_EXE%"))
    If c <> "%CLOUDFLARED_EXE%" And c <> "" Then
        If fso.FileExists(c) Then
            BuscarCloudflared = c
            Exit Function
        End If
    End If

    c = RAIZ & "\bin\cloudflared.exe"
    If fso.FileExists(c) Then
        BuscarCloudflared = c
        Exit Function
    End If

    c = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
    If fso.FileExists(c) Then
        BuscarCloudflared = c
        Exit Function
    End If

    c = "C:\Program Files\cloudflared\cloudflared.exe"
    If fso.FileExists(c) Then
        BuscarCloudflared = c
        Exit Function
    End If

    salida = SalidaDe("where cloudflared")
    lineas = Split(Replace(salida, vbCr, ""), vbLf)
    For i = 0 To UBound(lineas)
        l = Trim(lineas(i))
        If Len(l) > 4 Then
            If LCase(Right(l, 4)) = ".exe" Then
                If fso.FileExists(l) Then
                    BuscarCloudflared = l
                    Exit Function
                End If
            End If
        End If
    Next
End Function

' /ready de las metricas: 200 = el tunel tiene conexiones vivas.
Function TunelListo()
    Dim x
    TunelListo = False
    Set x = Nothing

    On Error Resume Next
    Set x = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If Err.Number <> 0 Then
        Err.Clear
        Set x = CreateObject("MSXML2.ServerXMLHTTP")
    End If
    If Err.Number <> 0 Then
        Err.Clear
        On Error GoTo 0
        Exit Function
    End If

    ' Tiempos cortos: este script corre cada 2 minutos, no puede quedarse pegado.
    x.setTimeouts 2000, 2000, 3000, 4000
    x.open "GET", "http://127.0.0.1:" & PUERTO_METRICAS & "/ready", False
    x.setRequestHeader "Connection", "close"
    x.send
    If Err.Number = 0 Then
        If x.status = 200 Then TunelListo = True
    End If
    Err.Clear
    On Error GoTo 0

    Set x = Nothing
End Function

' Avisa si hay un config.yml del usuario: con eso el tunel rapido no funciona.
' NO se borra nada, solo se deja el aviso en el log.
Sub AvisarConfigCloudflared()
    Dim base, a, b
    base = sh.ExpandEnvironmentStrings("%USERPROFILE%") & "\.cloudflared"
    a = base & "\config.yml"
    b = base & "\config.yaml"
    If fso.FileExists(a) Then Apuntar "AVISO: existe " & a & ". Con ese archivo el tunel rapido no levanta. Revisalo a mano."
    If fso.FileExists(b) Then Apuntar "AVISO: existe " & b & ". Con ese archivo el tunel rapido no levanta. Revisalo a mano."
End Sub


' =============================================================================
'  Procesos
' =============================================================================

' Lanza un proceso FUERA del arbol del Programador de Tareas y sin ventana.
' Devuelve el PID nuevo, o 0 si no se pudo.
Function LanzarDesprendido(comando, dirTrabajo)
    Dim wmi, clase, inicio, pid, resultado

    LanzarDesprendido = 0
    pid = 0

    On Error Resume Next
    Set wmi = GetObject("winmgmts:{impersonationLevel=impersonate}!\\.\root\cimv2")
    If Err.Number <> 0 Then
        Apuntar "ERROR: no se pudo hablar con WMI: " & Err.Description
        Err.Clear
        On Error GoTo 0
        Exit Function
    End If

    Set clase  = wmi.Get("Win32_Process")
    Set inicio = wmi.Get("Win32_ProcessStartup").SpawnInstance_
    inicio.ShowWindow = 0        ' SW_HIDE: sin ventana ni parpadeo

    resultado = clase.Create(comando, dirTrabajo, inicio, pid)
    If Err.Number <> 0 Then
        Apuntar "ERROR al crear el proceso: " & Err.Description
        Err.Clear
        On Error GoTo 0
        Exit Function
    End If
    On Error GoTo 0

    If resultado = 0 And pid > 0 Then
        LanzarDesprendido = CLng(pid)
    Else
        Apuntar "ERROR: Win32_Process.Create devolvio codigo " & resultado & "."
    End If
End Function

' Confirma que ese PID sea de verdad cloudflared.exe antes de cerrarlo.
' Los PID se reciclan: un numero viejo puede ser cualquier programa de la caja.
Function EsCloudflared(pid)
    Dim salida
    EsCloudflared = False
    If pid <= 0 Then Exit Function
    salida = SalidaDe("tasklist /fi ""PID eq " & pid & """ /fi ""IMAGENAME eq cloudflared.exe"" /nh")
    EsCloudflared = (InStr(LCase(salida), "cloudflared.exe") > 0)
End Function

' Busca el PID de un cloudflared.exe que este corriendo (el primero que aparezca).
Function PidDeCloudflared()
    Dim salida, lineas, i, partes, j, l
    PidDeCloudflared = 0
    salida = SalidaDe("tasklist /fi ""IMAGENAME eq cloudflared.exe"" /nh")
    lineas = Split(Replace(salida, vbCr, ""), vbLf)
    For i = 0 To UBound(lineas)
        l = Trim(lineas(i))
        If InStr(LCase(l), "cloudflared.exe") > 0 Then
            partes = Split(l, " ")
            For j = 0 To UBound(partes)
                If IsNumeric(partes(j)) And Trim(partes(j)) <> "" Then
                    PidDeCloudflared = CLng(partes(j))
                    Exit Function
                End If
            Next
        End If
    Next
End Function

' Cierra un PID SOLO si sigue siendo cloudflared.exe.
Function CerrarPid(pid)
    CerrarPid = False
    If Not EsCloudflared(pid) Then
        Apuntar "No se cierra el PID " & pid & ": ya no es cloudflared.exe."
        Exit Function
    End If
    SalidaDe "taskkill /f /pid " & pid
    CerrarPid = True
End Function

' Revisa si alguien escucha en 127.0.0.1:puerto.
Function PuertoEscuchando(puerto)
    Dim salida
    salida = SalidaDe("netstat -ano | findstr /C:""127.0.0.1:" & puerto & " "" | findstr /C:""LISTENING""")
    PuertoEscuchando = (Len(Trim(salida)) > 0)
End Function

' Corre un comando SIN ventana y devuelve lo que imprimio.
' No se usa Exec porque Exec siempre abre una consola visible y esta
' computadora es la caja de la tienda: no debe parpadear nada en pantalla.
Function SalidaDe(comando)
    Dim tmp, f, texto
    SalidaDe = ""
    tmp = LOGS & "\.salida-" & Int(Rnd() * 1000000) & ".txt"

    On Error Resume Next
    sh.Run "cmd /c " & comando & " > """ & tmp & """ 2>&1", 0, True
    texto = ""
    If fso.FileExists(tmp) Then
        Set f = fso.OpenTextFile(tmp, PARA_LEER)
        If Not f.AtEndOfStream Then texto = f.ReadAll
        f.Close
        fso.DeleteFile tmp, True
    End If
    Err.Clear
    On Error GoTo 0

    SalidaDe = texto
End Function


' =============================================================================
'  Archivos de estado
' =============================================================================

Function LeerPid()
    Dim f, t
    LeerPid = 0
    If Not fso.FileExists(ARCH_PID) Then Exit Function
    On Error Resume Next
    Set f = fso.OpenTextFile(ARCH_PID, PARA_LEER)
    t = ""
    If Not f.AtEndOfStream Then t = Trim(f.ReadLine)
    f.Close
    Err.Clear
    On Error GoTo 0
    If IsNumeric(t) And t <> "" Then LeerPid = CLng(t)
End Function

Sub GuardarPid(pid)
    EscribirTexto ARCH_PID, CStr(pid)
End Sub

Sub BorrarPid()
    BorrarArchivo ARCH_PID
End Sub

' Guarda el instante del PRIMER fallo seguido de /ready.
Sub MarcarFalloSiHaceFalta()
    If Not fso.FileExists(ARCH_ESTADO) Then EscribirTexto ARCH_ESTADO, Sello()
End Sub

Sub BorrarEstadoFallo()
    BorrarArchivo ARCH_ESTADO
End Sub

' Minutos que lleva fallando /ready seguido. Si es el primer fallo, apunta la
' hora y devuelve 0.
Function MinutosFallando()
    Dim inicio
    MinutosFallando = 0
    If Not fso.FileExists(ARCH_ESTADO) Then
        EscribirTexto ARCH_ESTADO, Sello()
        Exit Function
    End If
    inicio = LeerInstante(ARCH_ESTADO)
    If inicio = 0 Then
        EscribirTexto ARCH_ESTADO, Sello()
        Exit Function
    End If
    On Error Resume Next
    MinutosFallando = DateDiff("n", inicio, Now)
    If Err.Number <> 0 Then
        Err.Clear
        MinutosFallando = 0
    End If
    On Error GoTo 0
    If MinutosFallando < 0 Then MinutosFallando = 0
End Function

' Lee "AAAA-MM-DD HH:MM:SS" sin depender del idioma de Windows.
Function LeerInstante(ruta)
    Dim f, t
    LeerInstante = 0
    If Not fso.FileExists(ruta) Then Exit Function

    On Error Resume Next
    Set f = fso.OpenTextFile(ruta, PARA_LEER)
    t = ""
    If Not f.AtEndOfStream Then t = Trim(f.ReadLine)
    f.Close
    If Err.Number <> 0 Then
        Err.Clear
        On Error GoTo 0
        Exit Function
    End If

    If Len(t) < 19 Then
        On Error GoTo 0
        Exit Function
    End If

    LeerInstante = DateSerial(CInt(Mid(t, 1, 4)), CInt(Mid(t, 6, 2)), CInt(Mid(t, 9, 2))) + _
                   TimeSerial(CInt(Mid(t, 12, 2)), CInt(Mid(t, 15, 2)), CInt(Mid(t, 18, 2)))
    If Err.Number <> 0 Then
        Err.Clear
        LeerInstante = 0
    End If
    On Error GoTo 0
End Function


' =============================================================================
'  Utilerias
' =============================================================================

Sub Apuntar(texto)
    Dim f
    On Error Resume Next
    Set f = fso.OpenTextFile(ARCH_LOG, PARA_AGREGAR, True)
    f.WriteLine Sello() & "  " & texto
    f.Close
    Err.Clear
    On Error GoTo 0
End Sub

Sub EscribirTexto(ruta, texto)
    Dim f
    On Error Resume Next
    Set f = fso.CreateTextFile(ruta, True)
    f.WriteLine texto
    f.Close
    Err.Clear
    On Error GoTo 0
End Sub

Sub BorrarArchivo(ruta)
    On Error Resume Next
    If fso.FileExists(ruta) Then fso.DeleteFile ruta, True
    Err.Clear
    On Error GoTo 0
End Sub

Sub RotarSiPasa(ruta, tope, destino)
    On Error Resume Next
    If Not fso.FileExists(ruta) Then
        On Error GoTo 0
        Exit Sub
    End If
    If fso.GetFile(ruta).Size < tope Then
        On Error GoTo 0
        Exit Sub
    End If
    If fso.FileExists(destino) Then fso.DeleteFile destino, True
    fso.MoveFile ruta, destino
    Err.Clear
    On Error GoTo 0
End Sub

Function Dos(n)
    Dos = Right("0" & n, 2)
End Function

' Fecha y hora siempre igual: AAAA-MM-DD HH:MM:SS
Function Sello()
    Sello = Year(Now) & "-" & Dos(Month(Now)) & "-" & Dos(Day(Now)) & " " & _
            Dos(Hour(Now)) & ":" & Dos(Minute(Now)) & ":" & Dos(Second(Now))
End Function
