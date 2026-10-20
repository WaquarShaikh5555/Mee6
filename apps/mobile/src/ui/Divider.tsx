import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

/** Hairline rule. `inset` matches list rows that start after a leading icon. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 1,
        marginLeft: inset,
        backgroundColor: theme.colors.separator,
      }}
    />
  );
}
