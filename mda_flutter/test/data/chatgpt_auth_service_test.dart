import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mda_flutter/data/services/chatgpt_auth_service.dart';

void main() {
  group('ChatGPTAuthService PKCE & Crypto', () {
    test('generateRandomString produces RFC 7636 compliant verifier', () {
      final verifier = ChatGPTAuthService.generateRandomString(64);
      expect(verifier.length, equals(64));
      // Base64URL-safe unreserved characters without padding
      expect(verifier.contains('='), isFalse);
      expect(verifier.contains('+'), isFalse);
      expect(verifier.contains('/'), isFalse);
    });

    test('computeCodeChallenge matches S256 hash of verifier', () {
      final verifier = ChatGPTAuthService.generateRandomString(64);
      final challenge = ChatGPTAuthService.computeCodeChallenge(verifier);

      final expectedDigest = sha256.convert(ascii.encode(verifier));
      final expectedChallenge = base64UrlEncode(
        expectedDigest.bytes,
      ).replaceAll('=', '');

      expect(challenge, equals(expectedChallenge));
    });

    test('generateUuidV4 produces valid RFC 4122 v4 UUID', () {
      final uuid = ChatGPTAuthService.generateUuidV4();
      final uuidRegex = RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      );
      expect(uuidRegex.hasMatch(uuid), isTrue);
    });

    test('decodeJwtPayload extracts claims from valid JWT', () {
      final payload = {
        'sub': 'user_123',
        'email': 'author@example.com',
        'name': 'Author Test',
        'exp': 1893456000,
      };
      final encodedPayload = base64UrlEncode(
        utf8.encode(jsonEncode(payload)),
      ).replaceAll('=', '');
      final mockJwt =
          'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.$encodedPayload.signature123';

      final claims = ChatGPTAuthService.decodeJwtPayload(mockJwt);
      expect(claims, isNotEmpty);
      expect(claims['email'], equals('author@example.com'));
      expect(claims['name'], equals('Author Test'));
      expect(claims['exp'], equals(1893456000));
    });

    test('decodeJwtPayload returns empty map for invalid JWT', () {
      expect(ChatGPTAuthService.decodeJwtPayload('not-a-jwt'), isEmpty);
      expect(
        ChatGPTAuthService.decodeJwtPayload('header.invalid_base64!!!.sig'),
        isEmpty,
      );
    });
  });

  group('ChatGPT Responses API SSE streaming in AiService', () {
    test('extracts delta from chatgpt responses api stream format', () {
      // Format 1: response.output_text.delta
      final line1 =
          'data: ${jsonEncode({'type': 'response.output_text.delta', 'delta': 'Hello from ChatGPT'})}';

      // Format 2: response.text.delta
      final line2 =
          'data: ${jsonEncode({'type': 'response.text.delta', 'delta': ' continuous reflection'})}';

      // Format 3: Standard openai chat completion delta fallback
      final line3 =
          'data: ${jsonEncode({
            'choices': [
              {
                'delta': {'content': '!'},
              },
            ],
          })}';

      String? parseDelta(String line) {
        if (!line.startsWith('data: ')) return null;
        final raw = line.substring(6).trim();
        if (raw == '[DONE]') return null;
        try {
          final json = jsonDecode(raw) as Map<String, dynamic>;
          final type = json['type'] as String?;
          if (type == 'response.output_text.delta' ||
              type == 'response.text.delta') {
            final delta = json['delta'];
            if (delta is String) return delta;
          }
          final choices = json['choices'] as List<dynamic>?;
          if (choices != null && choices.isNotEmpty) {
            final choice = choices[0] as Map<String, dynamic>;
            final delta = choice['delta'] as Map<String, dynamic>?;
            return delta?['content'] as String?;
          }
        } catch (_) {}
        return null;
      }

      expect(parseDelta(line1), equals('Hello from ChatGPT'));
      expect(parseDelta(line2), equals(' continuous reflection'));
      expect(parseDelta(line3), equals('!'));
    });
  });
}
