import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { isProTool } from '@/ads/pro';
import { useUnlock } from '@/ads/useUnlock';
import type { PdfTool } from '../catalog';

/**
 * One tool in the Arena grid.
 *
 * The icon is the only colour on the tile; the name does the work. Every tile
 * is the same size so the grid scans as a grid, not as a pile of cards.
 */
export function ToolTile({ tool, onPress }: { tool: PdfTool; onPress: () => void }) {
  const theme = useTheme();
  const { unlocked } = useUnlock();
  const pro = isProTool(tool.id);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${tool.name}. ${tool.tagline}`}
      style={({ pressed }) => ({
        flexBasis: '47%',
        flexGrow: 1,
        minHeight: 132,
        gap: theme.space.sm,
        padding: theme.space.lg,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: pressed ? theme.colors.accentBorder : theme.colors.separator,
        backgroundColor: pressed ? theme.colors.accentSubtle : theme.colors.surface,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: theme.radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.accentSubtle,
        }}
      >
        <Ionicons name={tool.icon} size={19} color={theme.colors.onAccentSubtle} />
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
  );
}
