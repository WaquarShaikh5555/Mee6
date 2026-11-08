import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';

import { CONTACT_URL, LEGAL_DOCUMENTS } from '@/legal/documents';
import { Badge } from '@/ui/Badge';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * One route for both documents. The text lives in `src/legal/documents.ts`,
 * so the app and the repository cannot disagree about what was agreed to.
 */
export default function LegalScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const document = LEGAL_DOCUMENTS[doc ?? 'privacy'];

  if (!document) {
    return (
      <Screen>
        <ScreenHeader title="Not found" />
        <Text variant="body" tone="secondary">
          That document does not exist.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={document.title} />

      <View style={{ gap: theme.space.lg }}>
        <View style={{ gap: theme.space.sm }}>
          <Text variant="title2">{document.title}</Text>
          <Text variant="body" tone="secondary">
            {document.summary}
          </Text>
          <Text variant="caption" tone="tertiary">
            Last updated {document.updated}
          </Text>
        </View>

        {document.sections.map((section) => (
          <View key={section.heading} style={{ gap: theme.space.sm }}>
            <Text variant="headline">{section.heading}</Text>

            {section.body?.map((paragraph) => (
              <Text key={paragraph} variant="callout" tone="secondary">
                {paragraph}
              </Text>
            ))}

            {section.points ? (
              <View style={{ gap: theme.space.xs }}>
                {section.points.map((point) => (
                  <View
                    key={point}
                    style={{ flexDirection: 'row', gap: theme.space.sm, paddingTop: 2 }}
                  >
                    <Text variant="callout" tone="tertiary">
                      •
                    </Text>
                    <Text variant="callout" tone="secondary" style={{ flex: 1 }}>
                      {point}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}

        <Card style={{ gap: theme.space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
            <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.textTertiary} />
            <Text variant="callout">Read the other one</Text>
          </View>
          <Pressable
            onPress={() => router.replace(`/legal/${document.id === 'privacy' ? 'terms' : 'privacy'}`)}
            accessibilityRole="link"
            style={{ paddingVertical: theme.space.xs }}
          >
            <Text variant="callout" tone="accent">
              {document.id === 'privacy' ? 'Terms of use' : 'Privacy policy'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void Linking.openURL(CONTACT_URL)}
            accessibilityRole="link"
            style={{ paddingVertical: theme.space.xs }}
          >
            <Text variant="callout" tone="accent">
              Contact
            </Text>
          </Pressable>
        </Card>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
          <Badge label="On device" tone="brass" />
          <Text variant="caption" tone="tertiary" style={{ flex: 1 }}>
            Focus Mode’s rules and counts never leave your phone.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
