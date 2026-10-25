/// ChatGPT Authentication Service.
/// Implements "Sign in with ChatGPT" OAuth PKCE flow & Token Sharing for
/// personal / open-source clients (OpenAI SIWC specification).
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

import 'settings_service.dart';

/// Result of a ChatGPT authentication or token refresh operation.
class ChatGPTAuthResult {
  const ChatGPTAuthResult({
    required this.success,
    this.accessToken,
    this.refreshToken,
    this.expiresAt,
    this.userEmail,
    this.userName,
    this.clientId,
    this.planSharingEnabled = false,
    this.errorMessage,
  });

  final bool success;
  final String? accessToken;
  final String? refreshToken;
  final DateTime? expiresAt;
  final String? userEmail;
  final String? userName;
  final String? clientId;
  final bool planSharingEnabled;
  final String? errorMessage;
}

class ChatGPTAuthService {
  ChatGPTAuthService({
    required this._settingsService,
    http.Client? httpClient,
    Future<bool> Function(Uri url)? urlLauncher,
  }) : 
       _httpClient = httpClient ?? http.Client(),
       _urlLauncher = urlLauncher ?? _defaultLaunchUrl;

  final SettingsService _settingsService;
  final http.Client _httpClient;
  final Future<bool> Function(Uri url) _urlLauncher;

  static const String authEndpoint =
      'https://auth.openai.com/api/accounts/authorize';
  static const String tokenEndpoint =
      'https://auth.openai.com/api/accounts/oauth/token';
  static const String resourceUri = 'https://api.openai.com/v1';
  static const String defaultClientId = 'dynamic_agent_client';
  static const String requiredScope =
      'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
  static const String manageUsageUrl = 'https://chatgpt.com/settings/usage';

  static Future<bool> _defaultLaunchUrl(Uri url) async {
    return launchUrl(url, mode: LaunchMode.externalApplication);
  }

  /// Generates or retrieves the persistent host ID (`urn:uuid:...`) identifying
  /// this app installation on the user's device.
  Future<String> getOrCreateHostId() async {
    final existing = await _settingsService.getString(
      SettingsKeys.aiChatGPTHostId,
      '',
    );
    if (existing.isNotEmpty) {
      return existing;
    }
    final hostId = 'urn:uuid:${generateUuidV4()}';
    await _settingsService.setRaw(SettingsKeys.aiChatGPTHostId, hostId);
    return hostId;
  }

  /// Starts the browser-based OAuth flow using a local loopback server.
  Future<ChatGPTAuthResult> signIn({
    Duration timeout = const Duration(minutes: 5),
  }) async {
    HttpServer? server;
    try {
      // 1. Bind ephemeral local loopback server on 127.0.0.1
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final redirectUri = 'http://127.0.0.1:${server.port}/auth/callback';

      // 2. Prepare PKCE, state, nonce and host ID
      final codeVerifier = generateRandomString(64);
      final codeChallenge = computeCodeChallenge(codeVerifier);
      final state = generateRandomString(32);
      final nonce = generateRandomString(32);
      final hostId = await getOrCreateHostId();

      final savedClientId = await _settingsService.getString(
        SettingsKeys.aiChatGPTClientId,
        '',
      );
      final effectiveClientId = savedClientId.isNotEmpty
          ? savedClientId
          : defaultClientId;

      final authUri = Uri.parse(authEndpoint).replace(
        queryParameters: {
          'response_type': 'code',
          'client_id': effectiveClientId,
          'redirect_uri': redirectUri,
          'scope': requiredScope,
          'code_challenge': codeChallenge,
          'code_challenge_method': 'S256',
          'state': state,
          'nonce': nonce,
          'agent_name_hint': 'The Most Dangerous Writing App',
          'ext_agent_host_id': hostId,
        },
      );

      // 3. Open system browser
      final launched = await _urlLauncher(authUri);
      if (!launched) {
        return const ChatGPTAuthResult(
          success: false,
          errorMessage: 'Could not open the browser for ChatGPT authorization.',
        );
      }

      // 4. Await authorization callback on loopback server
      final callbackCompleter =
          Completer<({String code, String? issuedClientId})>();

      final serverSubscription = server.listen((HttpRequest request) async {
        if (request.uri.path == '/auth/callback') {
          final queryParams = request.uri.queryParameters;
          final callbackState = queryParams['state'];
          final code = queryParams['code'];
          final error = queryParams['error'];
          final errorDescription = queryParams['error_description'];
          final issuedClientId = queryParams['client_id'];

          if (error != null) {
            _respondHtml(
              request.response,
              success: false,
              title: 'Authentication Cancelled',
              message: errorDescription ?? error,
            );
            if (!callbackCompleter.isCompleted) {
              callbackCompleter.completeError(
                Exception(
                  errorDescription ?? 'Authentication cancelled: $error',
                ),
              );
            }
            return;
          }

          if (callbackState != state) {
            _respondHtml(
              request.response,
              success: false,
              title: 'Security Verification Failed',
              message: 'State parameter mismatch. Please try signing in again.',
            );
            if (!callbackCompleter.isCompleted) {
              callbackCompleter.completeError(
                Exception('OAuth state mismatch (potential CSRF).'),
              );
            }
            return;
          }

          if (code == null || code.isEmpty) {
            _respondHtml(
              request.response,
              success: false,
              title: 'Sign In Failed',
              message: 'No authorization code returned by ChatGPT.',
            );
            if (!callbackCompleter.isCompleted) {
              callbackCompleter.completeError(
                Exception('No authorization code provided in callback.'),
              );
            }
            return;
          }

          _respondHtml(
            request.response,
            success: true,
            title: 'Connected to ChatGPT',
            message:
                'You have successfully signed in with your ChatGPT account! You can now close this tab and return to The Most Dangerous Writing App.',
          );

          if (!callbackCompleter.isCompleted) {
            callbackCompleter.complete((
              code: code,
              issuedClientId: issuedClientId,
            ));
          }
        } else {
          request.response.statusCode = HttpStatus.notFound;
          await request.response.close();
        }
      });

      final callbackResult = await callbackCompleter.future.timeout(
        timeout,
        onTimeout: () =>
            throw TimeoutException('Sign-in timed out. Please try again.'),
      );

      await serverSubscription.cancel();
      await server.close(force: true);
      server = null;

      // 5. Save the issued client_id if OpenAI returned one
      final clientToUse =
          (callbackResult.issuedClientId != null &&
              callbackResult.issuedClientId!.isNotEmpty)
          ? callbackResult.issuedClientId!
          : (savedClientId.isNotEmpty ? savedClientId : defaultClientId);

      if (callbackResult.issuedClientId != null &&
          callbackResult.issuedClientId!.isNotEmpty) {
        await _settingsService.setRaw(
          SettingsKeys.aiChatGPTClientId,
          callbackResult.issuedClientId!,
        );
      }

      // 6. Exchange authorization code for OAuth tokens
      return await exchangeCodeForTokens(
        code: callbackResult.code,
        codeVerifier: codeVerifier,
        clientId: clientToUse,
        redirectUri: redirectUri,
      );
    } on TimeoutException {
      return const ChatGPTAuthResult(
        success: false,
        errorMessage: 'Sign in timed out waiting for browser authorization.',
      );
    } catch (e) {
      return ChatGPTAuthResult(
        success: false,
        errorMessage:
            'Sign in failed: ${e.toString().replaceAll('Exception: ', '')}',
      );
    } finally {
      if (server != null) {
        await server.close(force: true);
      }
    }
  }

  /// Exchanges the authorization code with the token endpoint.
  Future<ChatGPTAuthResult> exchangeCodeForTokens({
    required String code,
    required String codeVerifier,
    required String clientId,
    required String redirectUri,
  }) async {
    final response = await _httpClient.post(
      Uri.parse(tokenEndpoint),
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: {
        'grant_type': 'authorization_code',
        'client_id': clientId,
        'code': code,
        'code_verifier': codeVerifier,
        'redirect_uri': redirectUri,
        'resource': resourceUri,
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      String message =
          'Token exchange failed with status ${response.statusCode}';
      try {
        final decoded = jsonDecode(response.body);
        if (decoded is Map && decoded['error_description'] != null) {
          message = decoded['error_description'] as String;
        } else if (decoded is Map && decoded['error'] != null) {
          message = decoded['error'] as String;
        }
      } catch (_) {}
      return ChatGPTAuthResult(success: false, errorMessage: message);
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    final accessToken = data['access_token'] as String?;
    final refreshToken = data['refresh_token'] as String?;
    final expiresIn = (data['expires_in'] as num?)?.toInt() ?? 3600;
    final idToken = data['id_token'] as String?;
    final scope = data['scope'] as String? ?? '';

    if (accessToken == null || accessToken.isEmpty) {
      return const ChatGPTAuthResult(
        success: false,
        errorMessage: 'ChatGPT response did not contain an access token.',
      );
    }

    final expiresAt = DateTime.now().add(Duration(seconds: expiresIn));
    final planSharingEnabled = scope.contains('chatgpt.tokens.use.direct');

    // Parse identity info from id_token
    String? userEmail;
    String? userName;
    if (idToken != null && idToken.isNotEmpty) {
      final payload = decodeJwtPayload(idToken);
      userEmail =
          payload['email'] as String? ??
          payload['preferred_username'] as String?;
      userName = payload['name'] as String?;
    }

    // Persist to settings
    await _settingsService.setRaw(
      SettingsKeys.aiChatGPTAccessToken,
      accessToken,
    );
    if (refreshToken != null) {
      await _settingsService.setRaw(
        SettingsKeys.aiChatGPTRefreshToken,
        refreshToken,
      );
    }
    await _settingsService.setRaw(
      SettingsKeys.aiChatGPTTokenExpiresAt,
      expiresAt.toIso8601String(),
    );
    if (userEmail != null) {
      await _settingsService.setRaw(SettingsKeys.aiChatGPTUserEmail, userEmail);
    }
    if (userName != null) {
      await _settingsService.setRaw(SettingsKeys.aiChatGPTUserName, userName);
    }
    await _settingsService.setRaw(
      SettingsKeys.aiChatGPTPlanEnabled,
      planSharingEnabled ? 'true' : 'false',
    );

    return ChatGPTAuthResult(
      success: true,
      accessToken: accessToken,
      refreshToken: refreshToken,
      expiresAt: expiresAt,
      userEmail: userEmail,
      userName: userName,
      clientId: clientId,
      planSharingEnabled: planSharingEnabled,
    );
  }

  /// Refreshes the OAuth access token using the saved refresh token.
  Future<ChatGPTAuthResult> refreshToken() async {
    final refreshToken = await _settingsService.getString(
      SettingsKeys.aiChatGPTRefreshToken,
      '',
    );
    final clientId = await _settingsService.getString(
      SettingsKeys.aiChatGPTClientId,
      defaultClientId,
    );

    if (refreshToken.isEmpty) {
      return const ChatGPTAuthResult(
        success: false,
        errorMessage:
            'No refresh token available. Please sign in with ChatGPT again.',
      );
    }

    try {
      final response = await _httpClient.post(
        Uri.parse(tokenEndpoint),
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: {
          'grant_type': 'refresh_token',
          'client_id': clientId.isNotEmpty ? clientId : defaultClientId,
          'refresh_token': refreshToken,
          'resource': resourceUri,
        },
      );

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return ChatGPTAuthResult(
          success: false,
          errorMessage:
              'Failed to refresh token (status ${response.statusCode}).',
        );
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final newAccessToken = data['access_token'] as String?;
      final newRefreshToken = data['refresh_token'] as String? ?? refreshToken;
      final expiresIn = (data['expires_in'] as num?)?.toInt() ?? 3600;
      final expiresAt = DateTime.now().add(Duration(seconds: expiresIn));

      if (newAccessToken == null || newAccessToken.isEmpty) {
        return const ChatGPTAuthResult(
          success: false,
          errorMessage: 'Refresh did not return a valid access token.',
        );
      }

      await _settingsService.setRaw(
        SettingsKeys.aiChatGPTAccessToken,
        newAccessToken,
      );
      await _settingsService.setRaw(
        SettingsKeys.aiChatGPTRefreshToken,
        newRefreshToken,
      );
      await _settingsService.setRaw(
        SettingsKeys.aiChatGPTTokenExpiresAt,
        expiresAt.toIso8601String(),
      );

      final userEmail = await _settingsService.getString(
        SettingsKeys.aiChatGPTUserEmail,
        '',
      );
      final userName = await _settingsService.getString(
        SettingsKeys.aiChatGPTUserName,
        '',
      );

      return ChatGPTAuthResult(
        success: true,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt: expiresAt,
        userEmail: userEmail.isNotEmpty ? userEmail : null,
        userName: userName.isNotEmpty ? userName : null,
        clientId: clientId,
        planSharingEnabled: true,
      );
    } catch (e) {
      return ChatGPTAuthResult(
        success: false,
        errorMessage: 'Refresh error: $e',
      );
    }
  }

  /// Disconnects the ChatGPT session and wipes stored credentials.
  Future<void> signOut() async {
    await _settingsService.delete(SettingsKeys.aiChatGPTAccessToken);
    await _settingsService.delete(SettingsKeys.aiChatGPTRefreshToken);
    await _settingsService.delete(SettingsKeys.aiChatGPTTokenExpiresAt);
    await _settingsService.delete(SettingsKeys.aiChatGPTUserEmail);
    await _settingsService.delete(SettingsKeys.aiChatGPTUserName);
    await _settingsService.delete(SettingsKeys.aiChatGPTPlanEnabled);
  }

  /// Opens the ChatGPT Settings -> Usage dashboard in the system browser.
  Future<bool> openManageUsage() async {
    return _urlLauncher(Uri.parse(manageUsageUrl));
  }

  // -- Helpers ----------------------------------------------------------------

  static void _respondHtml(
    HttpResponse response, {
    required bool success,
    required String title,
    required String message,
  }) {
    response.statusCode = success ? HttpStatus.ok : HttpStatus.badRequest;
    response.headers.contentType = ContentType.html;
    final color = success ? '#10A37F' : '#E02424';
    final icon = success ? '✓' : '✕';
    response.write('''
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>$title</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0E0F12;
      color: #F3F4F6;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: #18191E;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      padding: 40px;
      text-align: center;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgba(16, 163, 127, 0.15);
      color: $color;
      font-size: 28px;
      margin-bottom: 20px;
      border: 1px solid rgba(16, 163, 127, 0.3);
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      margin: 0 0 12px 0;
      color: #FFFFFF;
      letter-spacing: -0.02em;
    }
    p {
      font-size: 15px;
      color: #9CA3AF;
      line-height: 1.6;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">$icon</div>
    <h1>$title</h1>
    <p>$message</p>
  </div>
</body>
</html>
''');
    response.close();
  }

  static String generateRandomString(int length) {
    const charset =
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~';
    final random = Random.secure();
    return List.generate(
      length,
      (_) => charset[random.nextInt(charset.length)],
    ).join();
  }

  static String computeCodeChallenge(String codeVerifier) {
    final bytes = ascii.encode(codeVerifier);
    final digest = sha256.convert(bytes);
    return base64Url.encode(digest.bytes).replaceAll('=', '');
  }

  static String generateUuidV4() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant RFC 4122
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }

  static Map<String, dynamic> decodeJwtPayload(String jwt) {
    try {
      final parts = jwt.split('.');
      if (parts.length != 3) return const {};
      var normalized = base64Url.normalize(parts[1]);
      final payloadString = utf8.decode(base64Url.decode(normalized));
      final decoded = jsonDecode(payloadString);
      return decoded is Map<String, dynamic> ? decoded : const {};
    } catch (_) {
      return const {};
    }
  }
}
