import re

with open('src/screens/PostWritingScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
new_lines = lines[:50] + lines[77:]
new_content = '\n'.join(new_lines)

new_content = re.sub(
    r"import \{\n[\s\S]*?type DimensionValue,[\s\S]*?\} from 'react-native';",
    "import { StyleSheet, Platform, ActivityIndicator, Vibration } from 'react-native';",
    new_content
)

new_content = re.sub(
    r"import ReanimatedAnimated, \{\n[\s\S]*?withTiming,[\s\S]*?\} from 'react-native-reanimated';",
    "",
    new_content
)

new_content = re.sub(
    r"(import \{ AnimatedScaleButton \} from '@/components/ui/AnimatedScaleButton';)",
    r"\1\nimport { ShimmerLine } from '@/components/ui/ShimmerLine';",
    new_content
)

with open('src/screens/PostWritingScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Done. New line count:', len(new_content.split('\n')))
