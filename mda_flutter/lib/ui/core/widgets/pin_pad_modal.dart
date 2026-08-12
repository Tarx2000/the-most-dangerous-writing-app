/// PinPadModal — 4-digit PIN bottom sheet (SPEC §12, §15).
/// Dots 14 px · 72 px dial buttons (glassSurfaceSubtle + glassBorderSubtle,
/// digits 28 px, pressed glassHighlight) · vibrate 30 per press · shake on
/// wrong PIN (±10 px, 5×50 ms) · 3 attempts → 30 s lockout banner.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart' show pinDotDelayMs;
import '../../../core/haptics.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/mdi.dart';
import '../../../data/security_providers.dart';
import '../../../domain/use_cases/security_controller.dart';
import 'animated_scale_button.dart';

class PinPadModal extends ConsumerStatefulWidget {
  const PinPadModal({super.key});

  @override
  ConsumerState<PinPadModal> createState() => _PinPadModalState();
}

class _PinPadModalState extends ConsumerState<PinPadModal> {
  String _pin = '';
  bool _shake = false;

  Future<void> _press(String digit) async {
    vibrate(HapticPatterns.dialPress);
    setState(() => _pin += digit);
    if (_pin.length < 4) return;

    // 150 ms delay so the fill animation plays (SPEC §12).
    final entered = _pin;
    await Future<void>.delayed(const Duration(milliseconds: pinDotDelayMs));
    final controller = ref.read(securityControllerProvider);
    final resolved = await controller.onDigit(entered);
    if (!mounted) return;
    if (resolved) {
      setState(() => _pin = '');
    } else if (controller.mode.value == PinPadMode.verify &&
        controller.isVisible.value) {
      _wrongPin();
    } else if (controller.isVisible.value) {
      setState(() => _pin = '');
    }
  }

  void _wrongPin() {
    vibrate(HapticPatterns.pinError);
    setState(() {
      _shake = true;
      _pin = '';
    });
    Future.delayed(const Duration(milliseconds: 500), () {
      if (mounted) setState(() => _shake = false);
    });
  }

  void _backspace() {
    vibrate(HapticPatterns.tick);
    if (_pin.isNotEmpty) setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  @override
  Widget build(BuildContext context) {
    final controller = ref.watch(securityControllerProvider);
    final mode = controller.mode.value;
    final prompt = controller.promptText.value;
    final lockedOut = controller.isLockedOut.value;

    if (mode == null && !lockedOut) return const SizedBox.shrink();

    return Positioned.fill(
      child: Material(
        color: Colors.transparent,
        child: Stack(
          children: [
            // Scrim
            Positioned.fill(
              child: GestureDetector(
                onTap: () => controller.cancel(),
                child: const ColoredBox(color: AppColors.overlayDark),
              ),
            ),
            // Sheet
            Align(
              alignment: Alignment.bottomCenter,
              child: Container(
                padding: const EdgeInsets.only(bottom: 40),
                decoration: const BoxDecoration(
                  color: AppColors.surfaceDark,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
                  border: Border(
                    top: BorderSide(color: AppColors.glassBorder),
                    left: BorderSide(color: AppColors.glassBorder),
                    right: BorderSide(color: AppColors.glassBorder),
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(height: 10),
                    Container(
                      width: 40,
                      height: 5,
                      decoration: BoxDecoration(
                        color: AppColors.grey,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                    const SizedBox(height: 18),
                    // Lockout banner
                    if (lockedOut) ...[
                      Container(
                        margin: const EdgeInsets.symmetric(horizontal: 32),
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        decoration: BoxDecoration(
                          color: AppColors.dangerTint,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppColors.dangerBorder, width: 1),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Mdi.get('lockClock'), color: AppColors.primaryAction, size: 18),
                            const SizedBox(width: 8),
                            Text(
                              'Too many attempts — wait ${controller.lockoutRemainingSeconds.value}s',
                              style: const TextStyle(
                                color: AppColors.primaryAction,
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                    Text(
                      prompt ?? 'Enter your PIN',
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 18,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 22),
                    // Dots
                    AnimatedBuilder(
                      animation: controller.shakeKey,
                      builder: (context, _) {
                        return Transform.translate(
                          offset: _shake ? const Offset(10, 0) : Offset.zero,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              for (var i = 0; i < 4; i++)
                                Container(
                                  width: 14,
                                  height: 14,
                                  margin: const EdgeInsets.symmetric(horizontal: 10),
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: i < _pin.length
                                        ? AppColors.textPrimary
                                        : Colors.transparent,
                                    border: Border.all(
                                      color: i < _pin.length
                                          ? AppColors.textPrimary
                                          : AppColors.textDim,
                                      width: 1.5,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        );
                      },
                    ),
                    const SizedBox(height: 26),
                    // Dial
                    Opacity(
                      opacity: lockedOut ? 0.4 : 1,
                      child: IgnorePointer(
                        ignoring: lockedOut,
                        child: Column(
                          children: [
                            for (var row = 0; row < 3; row++)
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  for (var col = 0; col < 3; col++)
                                    _DialButton(
                                      label: '${row * 3 + col + 1}',
                                      onPress: () => _press('${row * 3 + col + 1}'),
                                    ),
                                ],
                              ),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                _DialButton(
                                  label: 'CANCEL',
                                  small: true,
                                  onPress: () => controller.cancel(),
                                ),
                                _DialButton(label: '0', onPress: () => _press('0')),
                                _DialButton(
                                  icon: 'backspaceOutline',
                                  onPress: _backspace,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DialButton extends StatelessWidget {
  const _DialButton({
    this.label = '',
    this.icon,
    this.onPress,
    this.small = false,
  });

  final String label;
  final String? icon;
  final VoidCallback? onPress;
  final bool small;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(5),
      child: AnimatedScaleButton(
        onPress: onPress,
        child: Container(
          width: 72,
          height: 72,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.glassSurfaceSubtle,
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.glassBorderSubtle, width: 1),
          ),
          child: icon != null
              ? Icon(Mdi.get(icon!), color: AppColors.textPrimary, size: 26)
              : Text(
                  label,
                  style: TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: small ? 13 : 28,
                    fontWeight: small ? FontWeight.w700 : FontWeight.w400,
                  ),
                ),
        ),
      ),
    );
  }
}
