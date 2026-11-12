import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, View } from 'react-native';

import { Text } from '@/ui/Text';
import { usePressScale } from '@/ui/motion';
import { useTheme } from '@/theme/ThemeProvider';
import { isProTool } from '@/ads/pro';
import { useUnlock } from '@/ads/useUnlock';
import type { PdfTool } from '../catalog';

/**
 * One tool in the Arena grid.
 *
 * Colour here is information, not decoration: every Edit tool is peacock, every
 * Optimise tool sage, every Secure tool plum, every Convert tool clay. After one
 * screen the person knows where a tool lives without reading the heading, and
 * the grid stops looking like twenty-one identical squares.
 *
 * Every tile is the same size so the grid scans as a grid, not a pile of cards.
 */
export function ToolTile({ tool, onPress }: { tool: PdfTool; onPress: () => void }) {
  const theme = useTheme();
  const { unlocked } = useUnlock();
  const pro = isProTool(tool.id);
  const tone = theme.categories[tool.category];
  const press = usePressScale(0.976);

  return (
    <Animated.View style={[{ flexBasis: '47%', flexGrow: 1 }, press.scaleStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={`${tool.name}. ${tool.tagline}`}
        style={({ pressed }) => ({
          minHeight: 136,
          gap: theme.space.sm,
          padding: theme.space.lg,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: pressed ? tone.edge : theme.colors.separator,
          backgroundColor: pressed ? tone.wash : theme.colors.surface,
        })}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: theme.radius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tone.wash,
          }}
        >
          <Ionicons name={tool.icon} size={19} color={tone.ink} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
          <Text variant="headline" numberOfLines={1} style={{ flexShrink: 1 }}>
            {tool.name}
          </Text>
          {/* Said on the tile, before the tap — never discovered halfway in. */}
          {pro ? (
            <View
              style={{
                paddingHorizontal: theme.space.sm,
                paddingVertical: 1,
                borderRadius: theme.radius.full,
                backgroundColor: unlocked ? theme.colors.successSubtle : theme.colors.brassSubtle,
              }}
            >
              <Text
                variant="caption"
                style={{ color: unlocked ? theme.colors.success : theme.colors.onBrassSubtle }}
              >
                {unlocked ? 'PRO · OPEN' : 'PRO'}
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="footnote" tone="tertiary" numberOfLines={2}>
          {tool.tagline}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
