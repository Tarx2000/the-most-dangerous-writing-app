/// Generated icon map for the bundled MaterialCommunityIcons font.
/// Curated subset containing only the glyphs used throughout the application.
/// NOTE: entries are keyed BOTH by kebab-case and camelCase aliases so callers
/// can use either convention.
library;

import 'package:flutter/widgets.dart';

/// MaterialCommunityIcons icon accessor — mirrors MDI glyph names 1:1.
abstract final class Mdi {
  Mdi._();

  static const String fontFamily = 'MaterialCommunityIcons';

  static const Map<String, int> _glyphs = <String, int>{
    'account-group': 985161,
    'account-plus-outline': 985089,
    'accountGroup': 985161,
    'accountPlusOutline': 985089,
    'alert-circle-outline': 984534,
    'alertCircleOutline': 984534,
    'archive-arrow-down-outline': 987738,
    'archive-off-outline': 989026,
    'archive-outline': 987662,
    'archiveArrowDownOutline': 987738,
    'archiveOffOutline': 989026,
    'archiveOutline': 987662,
    'arrow-left': 983117,
    'arrow-up': 983133,
    'arrowLeft': 983117,
    'arrowUp': 983133,
    'backspace-outline': 985948,
    'backspaceOutline': 985948,
    'backup-restore': 983151,
    'backupRestore': 983151,
    'blur': 983221,
    'bookmark': 983232,
    'brain': 985553,
    'check': 983340,
    'checkbox-marked-circle-outline': 983348,
    'checkboxMarkedCircleOutline': 983348,
    'chevron-down': 983360,
    'chevron-right': 983362,
    'chevronDown': 983360,
    'chevronRight': 983362,
    'clock-outline': 983376,
    'clockOutline': 983376,
    'close': 983382,
    'close-circle-outline': 983386,
    'closeCircleOutline': 983386,
    'cloud-outline': 983395,
    'cloudOutline': 983395,
    'code-braces': 983401,
    'codeBraces': 983401,
    'cog': 984211,
    'comment-outline': 983426,
    'commentOutline': 983426,
    'creation': 984692,
    'database-outline': 988722,
    'databaseOutline': 988722,
    'developer-board': 984727,
    'developerBoard': 984727,
    'dialpad': 984604,
    'export': 983559,
    'file-document-outline': 985582,
    'fileDocumentOutline': 985582,
    'fingerprint': 983607,
    'fire': 983608,
    'flask-outline': 983190,
    'flaskOutline': 983190,
    'format-letter-case': 985908,
    'format-text': 983684,
    'formatLetterCase': 985908,
    'formatText': 983684,
    'help-circle-outline': 984613,
    'helpCircleOutline': 984613,
    'import': 983802,
    'information-outline': 983805,
    'informationOutline': 983805,
    'key-variant': 983819,
    'keyVariant': 983819,
    'lan-connect': 983832,
    'lanConnect': 983832,
    'layers-triple-outline': 986969,
    'layersTripleOutline': 986969,
    'lightning-bolt': 988171,
    'lightningBolt': 988171,
    'loading': 984946,
    'lock-clock': 985471,
    'lock-outline': 983873,
    'lockClock': 985471,
    'lockOutline': 983873,
    'newspaper-variant-outline': 987140,
    'newspaperVariantOutline': 987140,
    'notebook-edit': 988391,
    'notebookEdit': 988391,
    'pencil-outline': 986294,
    'pencilOutline': 986294,
    'pillar': 984834,
    'play-circle-outline': 984077,
    'playCircleOutline': 984077,
    'plus': 984085,
    'routes': 984170,
    'scale-balance': 984529,
    'scaleBalance': 984529,
    'server-network': 984205,
    'serverNetwork': 984205,
    'shield-lock-outline': 986316,
    'shieldLockOutline': 986316,
    'sort': 984250,
    'sort-ascending': 984252,
    'sort-descending': 984253,
    'sortAscending': 984252,
    'sortDescending': 984253,
    'spellcheck': 984262,
    'star': 984270,
    'star-four-points': 985826,
    'star-outline': 984274,
    'starFourPoints': 985826,
    'starOutline': 984274,
    'stop': 984283,
    'stopwatch-outline': 984347,
    'stopwatchOutline': 984347,
    'text-box-outline': 985581,
    'textBoxOutline': 985581,
    'timer-lock-outline': 989911,
    'timer-off-outline': 984350,
    'timer-outline': 984347,
    'timer-sand-empty': 984749,
    'timer-sand-full': 984972,
    'timerLockOutline': 989911,
    'timerOffOutline': 984350,
    'timerOutline': 984347,
    'timerSandEmpty': 984749,
    'timerSandFull': 984972,
    'trash-can-outline': 985722,
    'trashCanOutline': 985722,
    'twitter': 984388,
    'vibrate': 984422,
    'video-outline': 986076,
    'videoOutline': 986076,
    'volume-high': 984446,
    'volume-off': 984449,
    'volumeHigh': 984446,
    'volumeOff': 984449,
    'web': 984479,
    'zip-box-outline': 987130,
    'zipBoxOutline': 987130,
  };

  static final Map<String, IconData> _cache = <String, IconData>{};

  /// Returns the [IconData] for a glyph name. Falls back to help-circle-outline if not mapped.
  static IconData get(String name) {
    final cached = _cache[name];
    if (cached != null) return cached;
    final code = _glyphs[name] ?? 984613;
    // ignore: non_const_argument_for_const_parameter
    final icon = IconData(code, fontFamily: fontFamily);
    _cache[name] = icon;
    return icon;
  }

  /// Whether [name] is known in this glyph map.
  static bool contains(String name) => _glyphs.containsKey(name);
}
