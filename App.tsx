import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { computeBalanceKm, nextResetBoundary, roundKm, RunEvent } from './src/balance';
import { MAX_RUN_KM, REWARD_COST_KM, REWARDS, ROLLOVER_CAP_KM } from './src/constants';
import { useEventLog } from './src/useEventLog';

const palettes = {
  light: {
    background: '#F5F6F8',
    card: '#FFFFFF',
    text: '#1A1D23',
    muted: '#6B7280',
    primary: '#2563EB',
    danger: '#DC2626',
    border: '#E5E7EB',
  },
  dark: {
    background: '#0F1115',
    card: '#1C1F26',
    text: '#F3F4F6',
    muted: '#9CA3AF',
    primary: '#3B82F6',
    danger: '#F87171',
    border: '#2D313B',
  },
};

function eventLabel(event: RunEvent): string {
  switch (event.type) {
    case 'run':
      return `Run +${roundKm(event.km).toFixed(1)} km`;
    case 'class':
      return `Fitness class −${roundKm(event.km).toFixed(1)} km`;
    case 'coffee':
      return `Coffee −${roundKm(event.km).toFixed(1)} km`;
    case 'meal':
      return `Meal out −${roundKm(event.km).toFixed(1)} km`;
  }
}

function formatDate(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCountdown(msRemaining: number): string {
  const totalMinutes = Math.max(0, Math.round(msRemaining / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function parseRunKm(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = parseFloat(trimmed);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_RUN_KM) return null;
  return value;
}

export default function App() {
  const scheme = useColorScheme();
  const colors = palettes[scheme === 'dark' ? 'dark' : 'light'];
  const { events, isLoaded, addEvent, deleteEvent, undoLast } = useEventLog();

  const [now, setNow] = useState(() => Date.now());
  const [runInput, setRunInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Refresh "now" periodically so the balance/countdown stay correct across a
  // Sunday-12:00 reset boundary even if the app is left open continuously.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(null), 2500);
    return () => clearTimeout(timeout);
  }, [message]);

  const balance = useMemo(() => roundKm(computeBalanceKm(events, now)), [events, now]);
  const msUntilReset = useMemo(() => nextResetBoundary(now) - now, [now]);
  const sortedEvents = useMemo(() => [...events].sort((a, b) => b.timestamp - a.timestamp), [events]);

  const handleAddRun = () => {
    const km = parseRunKm(runInput);
    if (km === null) {
      setInputError('Enter a positive number up to 100 km');
      return;
    }
    setInputError(null);
    addEvent('run', km);
    setRunInput('');
    setMessage(`Logged ${roundKm(km).toFixed(1)} km`);
  };

  const handleReward = (type: 'class' | 'coffee' | 'meal', label: string) => {
    const previewEvent: RunEvent = { id: 'preview', type, km: REWARD_COST_KM, timestamp: Date.now() };
    const resultingBalance = roundKm(computeBalanceKm([...events, previewEvent], previewEvent.timestamp));
    addEvent(type, REWARD_COST_KM);
    setMessage(
      resultingBalance < 0
        ? `${label} redeemed (-5 km) — you're now at ${resultingBalance.toFixed(1)} km (debt)`
        : `${label} redeemed (-5 km)`
    );
  };

  const handleDelete = (event: RunEvent) => {
    Alert.alert('Delete entry?', eventLabel(event), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteEvent(event.id) },
    ]);
  };

  if (!isLoaded) {
    return <View style={[styles.container, { backgroundColor: colors.background }]} />;
  }

  const isOverCap = balance > ROLLOVER_CAP_KM;
  const isNegative = balance < 0;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <FlatList
        data={sortedEvents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.balanceBlock}>
              <Text style={[styles.balanceLabel, { color: colors.muted }]}>Balance</Text>
              <Text
                style={[
                  styles.balanceValue,
                  { color: isNegative ? colors.danger : colors.text },
                ]}
              >
                {balance.toFixed(1)} km
              </Text>
              {isOverCap && (
                <Text style={[styles.balanceNote, { color: colors.muted }]}>
                  Anything above {ROLLOVER_CAP_KM} km is wiped Sunday 12:00 · resets in{' '}
                  {formatCountdown(msUntilReset)}
                </Text>
              )}
              {message && (
                <View style={[styles.banner, { backgroundColor: colors.primary }]}>
                  <Text style={styles.bannerText}>{message}</Text>
                </View>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Log a run</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[
                    styles.input,
                    { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
                  ]}
                  placeholder="km"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  value={runInput}
                  onChangeText={(text) => {
                    setRunInput(text);
                    setInputError(null);
                  }}
                  returnKeyType="done"
                  onSubmitEditing={handleAddRun}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.addButton,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                  ]}
                  onPress={handleAddRun}
                >
                  <Text style={styles.addButtonText}>Add run</Text>
                </Pressable>
              </View>
              {inputError && <Text style={[styles.errorText, { color: colors.danger }]}>{inputError}</Text>}
            </View>

            <View style={styles.rewardsBlock}>
              {REWARDS.map((reward) => (
                <Pressable
                  key={reward.type}
                  style={({ pressed }) => [
                    styles.rewardButton,
                    { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
                  ]}
                  onPress={() => handleReward(reward.type, reward.label)}
                >
                  <Text style={[styles.rewardButtonText, { color: colors.text }]}>
                    {reward.label} (-5 km)
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.historyHeader}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>History</Text>
              <Pressable disabled={events.length === 0} onPress={undoLast}>
                <Text
                  style={[
                    styles.undoText,
                    { color: events.length === 0 ? colors.muted : colors.primary },
                  ]}
                >
                  Undo last
                </Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.muted }]}>No activity yet — log your first run above.</Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.historyRow, { borderColor: colors.border }]}>
            <View style={styles.historyRowText}>
              <Text style={[styles.historyLabel, { color: colors.text }]}>{eventLabel(item)}</Text>
              <Text style={[styles.historyDate, { color: colors.muted }]}>{formatDate(item.timestamp)}</Text>
            </View>
            <Pressable onPress={() => handleDelete(item)} hitSlop={12}>
              <Text style={[styles.deleteText, { color: colors.danger }]}>Delete</Text>
            </Pressable>
          </View>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  balanceBlock: {
    alignItems: 'center',
    marginBottom: 24,
  },
  balanceLabel: {
    fontSize: 15,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceValue: {
    fontSize: 64,
    fontWeight: '700',
    marginTop: 4,
  },
  balanceNote: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
  },
  banner: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  bannerText: {
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    height: 52,
  },
  addButton: {
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
    height: 52,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
  },
  rewardsBlock: {
    gap: 12,
    marginBottom: 24,
  },
  rewardButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
  },
  rewardButtonText: {
    fontSize: 18,
    fontWeight: '700',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  undoText: {
    fontSize: 15,
    fontWeight: '600',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  historyRowText: {
    flex: 1,
  },
  historyLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  historyDate: {
    fontSize: 13,
    marginTop: 2,
  },
  deleteText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 15,
  },
});
