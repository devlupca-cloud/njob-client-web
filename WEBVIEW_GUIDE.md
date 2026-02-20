# Guia de Uso da Live em WebView

Este guia explica como usar a tela de live streaming em uma WebView do seu app mobile.

## 📱 Parâmetros de URL

A aplicação aceita os seguintes parâmetros de URL:

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `room` | string | ✅ Sim | ID da sala (Room ID) |
| `mode` | string | ✅ Sim | Modo de entrada: `host` ou `viewer` |
| `userName` | string | ✅ Sim* | Nome do usuário |
| `userID` | string | ✅ Sim* | ID único do usuário |

*Obrigatório apenas se quiser pular o dialog de setup e entrar automaticamente.

## 🎯 Exemplos de URLs

### 1. Entrar como HOST (Transmitir)

```
https://seu-dominio.com/live?room=ROOM123&mode=host&userName=João&userID=user_123456
```

### 2. Entrar como VIEWER (Assistir)

```
https://seu-dominio.com/live?room=ROOM123&mode=viewer&userName=Maria&userID=user_789012
```

### 3. Entrar sem parâmetros (mostra dialog de setup)

```
https://seu-dominio.com/live
```

Ou apenas com room e mode:

```
https://seu-dominio.com/live?room=ROOM123&mode=host
```

## 🔑 Como Criar e Entrar em Salas

### Criar Nova Sala

Para criar uma nova sala, você precisa gerar um **Room ID único**. Você pode:

1. **Gerar no seu app mobile:**
   ```javascript
   // Exemplo em JavaScript/TypeScript
   const roomID = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
   // Resultado: room_1702123456789_k3j2h1g
   ```

2. **Usar UUID:**
   ```javascript
   const roomID = crypto.randomUUID();
   // Resultado: 550e8400-e29b-41d4-a716-446655440000
   ```

3. **Usar timestamp + random:**
   ```javascript
   const roomID = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
   // Resultado: 1702123456789-1234
   ```

### Entrar em Sala Existente

Para entrar em uma sala existente, você precisa do **Room ID** que foi usado quando a sala foi criada.

## 📝 Exemplos Práticos

### Exemplo 1: Criar nova sala como Host

```swift
// Swift (iOS)
let roomID = "room_\(Int(Date().timeIntervalSince1970))_\(UUID().uuidString.prefix(8))"
let userName = "João Silva"
let userID = "user_\(UUID().uuidString)"

let urlString = "https://seu-dominio.com/live?room=\(roomID)&mode=host&userName=\(userName.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!)&userID=\(userID)"
```

```kotlin
// Kotlin (Android)
val roomID = "room_${System.currentTimeMillis()}_${UUID.randomUUID().toString().substring(0, 8)}"
val userName = "João Silva"
val userID = "user_${UUID.randomUUID()}"

val urlString = "https://seu-dominio.com/live?room=$roomID&mode=host&userName=${URLEncoder.encode(userName, "UTF-8")}&userID=$userID"
```

### Exemplo 2: Entrar em sala existente como Viewer

```swift
// Swift (iOS)
let roomID = "ROOM123" // ID da sala existente
let userName = "Maria Santos"
let userID = "user_\(UUID().uuidString)"

let urlString = "https://seu-dominio.com/live?room=\(roomID)&mode=viewer&userName=\(userName.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!)&userID=\(userID)"
```

```kotlin
// Kotlin (Android)
val roomID = "ROOM123" // ID da sala existente
val userName = "Maria Santos"
val userID = "user_${UUID.randomUUID()}"

val urlString = "https://seu-dominio.com/live?room=$roomID&mode=viewer&userName=${URLEncoder.encode(userName, "UTF-8")}&userID=$userID"
```

## 🌐 Configuração da WebView

### ⚠️ IMPORTANTE: Permissões de Câmera e Microfone

A WebView precisa de permissões explícitas para acessar câmera e microfone. Sem isso, você verá o erro "Equipment authorization".

### Flutter / FlutterFlow

#### 1. Adicionar dependência no pubspec.yaml

```yaml
dependencies:
  flutter:
    sdk: flutter
  webview_flutter: ^4.4.2
  permission_handler: ^11.0.1
```

#### 2. Configurar permissões no AndroidManifest.xml (Android)

No FlutterFlow, vá em **Settings > Android Settings > AndroidManifest.xml** e adicione:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.INTERNET" />
```

#### 3. Configurar permissões no Info.plist (iOS)

No FlutterFlow, vá em **Settings > iOS Settings > Info.plist** e adicione:

```xml
<key>NSCameraUsageDescription</key>
<string>Precisamos da câmera para transmitir ao vivo</string>

<key>NSMicrophoneUsageDescription</key>
<string>Precisamos do microfone para transmitir ao vivo</string>
```

#### 4. Código Flutter para WebView com Permissões

```dart
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:permission_handler/permission_handler.dart';

class LiveStreamWebView extends StatefulWidget {
  final String roomID;
  final String mode; // 'host' ou 'viewer'
  final String userName;
  final String userID;

  const LiveStreamWebView({
    Key? key,
    required this.roomID,
    required this.mode,
    required this.userName,
    required this.userID,
  }) : super(key: key);

  @override
  State<LiveStreamWebView> createState() => _LiveStreamWebViewState();
}

class _LiveStreamWebViewState extends State<LiveStreamWebView> {
  late final WebViewController _controller;
  bool _permissionsGranted = false;

  @override
  void initState() {
    super.initState();
    _requestPermissions();
    _initializeWebView();
  }

  Future<void> _requestPermissions() async {
    // Solicitar permissões de câmera e microfone
    Map<Permission, PermissionStatus> statuses = await [
      Permission.camera,
      Permission.microphone,
    ].request();

    bool allGranted = statuses.values.every((status) => status.isGranted);
    
    setState(() {
      _permissionsGranted = allGranted;
    });

    if (!allGranted) {
      // Mostrar mensagem ao usuário
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Permissões de câmera e microfone são necessárias'),
        ),
      );
    }
  }

  void _initializeWebView() {
    // Construir URL com parâmetros
    final url = Uri.parse('https://seu-dominio.com/live').replace(
      queryParameters: {
        'room': widget.roomID,
        'mode': widget.mode,
        'userName': widget.userName,
        'userID': widget.userID,
      },
    );

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (String url) {
            // Página carregada
          },
        ),
      )
      ..addJavaScriptChannel(
        'FlutterChannel',
        onMessageReceived: (JavaScriptMessage message) {
          // Comunicação entre WebView e Flutter
          print('Mensagem da WebView: ${message.message}');
        },
      )
      ..loadRequest(url);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: _permissionsGranted
            ? WebViewWidget(controller: _controller)
            : const Center(
                child: CircularProgressIndicator(),
              ),
      ),
    );
  }
}
```

#### 5. Usar no FlutterFlow

**Opção A: Usando Custom Code Widget**

1. No FlutterFlow, adicione um **Custom Code Widget**
2. Cole o código acima
3. Configure as propriedades:
   - `roomID`: String (ex: "room_123")
   - `mode`: String (ex: "host" ou "viewer")
   - `userName`: String (ex: "João")
   - `userID`: String (ex: "user_123")

**Opção B: Usando WebView Widget do FlutterFlow**

1. Adicione um **WebView Widget** na página
2. Configure a URL dinamicamente:

```dart
// Na propriedade URL do WebView Widget
'https://seu-dominio.com/live?room=${roomID}&mode=${mode}&userName=${userName}&userID=${userID}'
```

3. **IMPORTANTE**: Adicione um **Custom Action** antes de abrir a WebView para solicitar permissões:

```dart
// Custom Action: RequestPermissions
import 'package:permission_handler/permission_handler.dart';

Future<void> requestCameraAndMicrophonePermissions() async {
  await [
    Permission.camera,
    Permission.microphone,
  ].request();
}
```

#### 6. Configuração Adicional no FlutterFlow

**No FlutterFlow Settings:**

1. **Android Settings:**
   - Vá em **Settings > Android Settings**
   - Adicione as permissões no AndroidManifest.xml (já mencionado acima)
   - Certifique-se de que **minSdkVersion** seja pelo menos **21**

2. **iOS Settings:**
   - Vá em **Settings > iOS Settings**
   - Adicione as descrições de permissão no Info.plist (já mencionado acima)
   - Certifique-se de que **iOS Deployment Target** seja pelo menos **12.0**

#### 7. Exemplo de Uso Completo

```dart
// Página de exemplo no FlutterFlow
class LivePage extends StatelessWidget {
  final String roomID;
  final String mode;
  final String userName;
  final String userID;

  const LivePage({
    Key? key,
    required this.roomID,
    required this.mode,
    required this.userName,
    required this.userID,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return LiveStreamWebView(
      roomID: roomID,
      mode: mode,
      userName: userName,
      userID: userID,
    );
  }
}

// Navegar para a página
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (context) => LivePage(
      roomID: 'room_123',
      mode: 'host',
      userName: 'João',
      userID: 'user_123',
    ),
  ),
);
```

#### 8. Solução de Problemas no FlutterFlow

**Erro "Equipment authorization":**
1. Verifique se as permissões estão no AndroidManifest.xml e Info.plist
2. Certifique-se de solicitar permissões antes de carregar a WebView
3. Teste em dispositivo real (não em emulador para câmera)

**WebView não carrega:**
1. Verifique a URL (deve ser HTTPS em produção)
2. Certifique-se de que JavaScript está habilitado
3. Verifique os logs do Flutter: `flutter logs`

**Permissões não funcionam:**
1. No Android, teste em dispositivo real (Android 6.0+)
2. No iOS, as permissões são solicitadas automaticamente na primeira vez
3. Verifique se o app tem permissões no Settings do dispositivo

### iOS (WKWebView)

#### 1. Adicionar permissões no Info.plist

Adicione estas chaves no arquivo `Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>Precisamos da câmera para transmitir ao vivo</string>

<key>NSMicrophoneUsageDescription</key>
<string>Precisamos do microfone para transmitir ao vivo</string>
```

#### 2. Configurar WKWebView

```swift
import WebKit

let webView = WKWebView()
let url = URL(string: urlString)!
let request = URLRequest(url: url)

// Configurações ESSENCIAIS para câmera/microfone
let configuration = WKWebViewConfiguration()
configuration.allowsInlineMediaPlayback = true
configuration.mediaTypesRequiringUserActionForPlayback = []
configuration.preferences.javaScriptEnabled = true

// IMPORTANTE: Permitir acesso a mídia
if #available(iOS 14.0, *) {
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
}

webView = WKWebView(frame: .zero, configuration: configuration)
webView.load(request)

// Delegar para lidar com permissões
webView.navigationDelegate = self
```

#### 3. Implementar WKNavigationDelegate

```swift
extension YourViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, 
                 decidePolicyFor navigationAction: WKNavigationAction, 
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(.allow)
    }
    
    func webView(_ webView: WKWebView, 
                 didStartProvisionalNavigation navigation: WKNavigation!) {
        // Solicitar permissões quando necessário
        AVCaptureDevice.requestAccess(for: .video) { granted in
            if granted {
                AVCaptureDevice.requestAccess(for: .audio) { granted in
                    // Permissões concedidas
                }
            }
        }
    }
}
```

#### 4. Importar frameworks necessários

```swift
import AVFoundation
import WebKit
```

### Android (WebView)

#### 1. Adicionar permissões no AndroidManifest.xml

Adicione estas permissões no arquivo `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.INTERNET" />
```

#### 2. Solicitar permissões em runtime (Android 6.0+)

```kotlin
import android.Manifest
import android.content.pm.PackageManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class YourActivity : AppCompatActivity() {
    private val PERMISSION_REQUEST_CODE = 100
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Solicitar permissões
        requestPermissions()
        
        val webView = WebView(this)
        setupWebView(webView)
    }
    
    private fun requestPermissions() {
        val permissions = arrayOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO
        )
        
        val permissionsToRequest = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        
        if (permissionsToRequest.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                permissionsToRequest.toTypedArray(),
                PERMISSION_REQUEST_CODE
            )
        }
    }
    
    private fun setupWebView(webView: WebView) {
        val webSettings = webView.settings
        
        webSettings.javaScriptEnabled = true
        webSettings.mediaPlaybackRequiresUserGesture = false
        webSettings.domStorageEnabled = true
        webSettings.allowFileAccess = true
        webSettings.allowContentAccess = true
        
        // IMPORTANTE: Configurar WebChromeClient para permissões
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                // Conceder permissões automaticamente
                request.grant(request.resources)
            }
        }
        
        webView.loadUrl(urlString)
    }
    
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        
        if (requestCode == PERMISSION_REQUEST_CODE) {
            val allGranted = grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            if (allGranted) {
                // Permissões concedidas, recarregar WebView se necessário
            } else {
                // Mostrar mensagem ao usuário
            }
        }
    }
}
```

#### 3. Importar classes necessárias

```kotlin
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
```

## ⚠️ Importante

1. **Room ID**: Deve ser único para cada sala. Se dois hosts usarem o mesmo Room ID, eles estarão na mesma sala.

2. **User ID**: Deve ser único para cada usuário. Recomenda-se usar UUID ou timestamp + identificador único.

3. **Encoding**: Sempre faça URL encoding dos parâmetros `userName` para evitar problemas com caracteres especiais.

4. **Permissões CRÍTICAS**: 
   - **iOS**: Adicione `NSCameraUsageDescription` e `NSMicrophoneUsageDescription` no Info.plist
   - **Android**: Adicione permissões no AndroidManifest.xml e solicite em runtime
   - **WebView**: Configure `WebChromeClient` (Android) ou `WKNavigationDelegate` (iOS) para lidar com permissões
   - Sem essas permissões, você verá o erro "Equipment authorization"

5. **Teste de Permissões**: 
   - No iOS, as permissões são solicitadas automaticamente na primeira vez
   - No Android, você precisa solicitar explicitamente em runtime (Android 6.0+)
   - Após conceder permissões, pode ser necessário recarregar a página

## 🔄 Fluxo de Uso

### Cenário 1: Host cria sala e compartilha

1. App mobile gera um Room ID único
2. App abre WebView com URL: `?room=ROOM_ID&mode=host&userName=...&userID=...`
3. Host inicia a transmissão
4. App gera link de compartilhamento: `?room=ROOM_ID&mode=viewer`
5. Viewers usam o link para assistir

### Cenário 2: Viewer entra em sala existente

1. Viewer recebe Room ID (via link, QR code, etc.)
2. App abre WebView com URL: `?room=ROOM_ID&mode=viewer&userName=...&userID=...`
3. Viewer assiste a transmissão

## 📞 Comunicação WebView ↔ App

Se precisar comunicar entre a WebView e o app nativo, você pode usar:

### iOS - JavaScript Bridge

```swift
// No app
webView.configuration.userContentController.add(self, name: "nativeApp")

// Na página web
window.webkit.messageHandlers.nativeApp.postMessage({action: "exit"})
```

### Android - JavaScript Interface

```kotlin
// No app
webView.addJavascriptInterface(WebAppInterface(), "Android")

// Na página web
Android.exitLive()
```

## 🎨 Personalização

Você pode ocultar o dialog de setup passando todos os parâmetros na URL. Se algum parâmetro estiver faltando, o dialog será exibido para o usuário preencher.

