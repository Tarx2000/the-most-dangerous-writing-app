/// Home shell types — shared between the nav and the home layers.
library;

/// The four home tabs (SPEC §14).
abstract final class HomeTab {
  static const journal = 'journal';
  static const circles = 'circles';
  static const vlog = 'vlog';
  static const checkin = 'checkin';
}
