/**
 * SmartPOS AI – Voice Command Button + Processing Modal
 * Animated microphone FAB with waveform visualization + processing states.
 * Uses built-in Animated API (web + native compatible).
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {colors, radius, shadows, spacing, typography} from '../../utils/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoiceState = 'idle' | 'listening' | 'processing' | 'success' | 'error';

export interface VoiceResult {
  transcript:  string;
  items:       VoiceBillItem[];
  confidence?: number;
}

export interface VoiceBillItem {
  product_name: string;
  quantity:     number;
  matched_id?:  number;
  unit_price?:  number;
}

interface VoiceButtonProps {
  onResult:  (result: VoiceResult) => void;
  onError?:  (msg: string) => void;
  style?:    object;
}

// ─── Voice Button FAB ─────────────────────────────────────────────────────────

export const VoiceButton: React.FC<VoiceButtonProps> = ({onResult, onError, style}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const startPulse = useCallback(() => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {toValue: 1.15, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease)}),
        Animated.timing(pulseAnim, {toValue: 1,    duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease)}),
      ]),
    );
    pulseLoop.current.start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseLoop.current?.stop();
    Animated.spring(pulseAnim, {toValue: 1, useNativeDriver: true, speed: 40}).start();
  }, [pulseAnim]);

  return (
    <>
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
        style={[styles.fab, style]}>
        <Animated.View style={[styles.fabInner, {transform: [{scale: pulseAnim}]}]}>
          <Text style={styles.fabMic}>🎙️</Text>
        </Animated.View>
        <View style={styles.fabRipple} />
      </TouchableOpacity>

      <VoiceModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onListeningStart={startPulse}
        onListeningStop={stopPulse}
        onResult={result => {
          setModalVisible(false);
          onResult(result);
        }}
        onError={msg => {
          setModalVisible(false);
          onError?.(msg);
        }}
      />
    </>
  );
};

// ─── Voice Modal ──────────────────────────────────────────────────────────────

interface VoiceModalProps {
  visible:           boolean;
  onClose:           () => void;
  onListeningStart:  () => void;
  onListeningStop:   () => void;
  onResult:          (r: VoiceResult) => void;
  onError:           (msg: string) => void;
}

const VoiceModal: React.FC<VoiceModalProps> = ({
  visible,
  onClose,
  onListeningStart,
  onListeningStop,
  onResult,
  onError,
}) => {
  const [voiceState,  setVoiceState]  = useState<VoiceState>('idle');
  const [transcript,  setTranscript]  = useState('');
  const [statusText,  setStatusText]  = useState('Tap the mic to start');

  const sheetSlide = useRef(new Animated.Value(400)).current;
  const bgOpacity  = useRef(new Animated.Value(0)).current;

  // Wave bar animations (5 bars)
  const waveBars = useRef(
    Array.from({length: 7}, () => new Animated.Value(0.2)),
  ).current;
  const waveLoop = useRef<Animated.CompositeAnimation | null>(null);

  const startWave = useCallback(() => {
    waveLoop.current = Animated.loop(
      Animated.stagger(80,
        waveBars.map(bar =>
          Animated.sequence([
            Animated.timing(bar, {toValue: 1,   duration: 350, useNativeDriver: true, easing: Easing.inOut(Easing.ease)}),
            Animated.timing(bar, {toValue: 0.2, duration: 350, useNativeDriver: true, easing: Easing.inOut(Easing.ease)}),
          ]),
        ),
      ),
    );
    waveLoop.current.start();
  }, [waveBars]);

  const stopWave = useCallback(() => {
    waveLoop.current?.stop();
    waveBars.forEach(bar => {
      Animated.spring(bar, {toValue: 0.2, useNativeDriver: true, speed: 40}).start();
    });
  }, [waveBars]);

  // Sheet enter/exit
  useEffect(() => {
    if (visible) {
      sheetSlide.setValue(400);
      bgOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(sheetSlide, {toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4}),
        Animated.timing(bgOpacity,  {toValue: 1, duration: 250, useNativeDriver: true}),
      ]).start();
    } else {
      stopWave();
      setVoiceState('idle');
      setTranscript('');
      setStatusText('Tap the mic to start');
    }
  }, [visible, sheetSlide, bgOpacity, stopWave]);

  // MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);

  const startListening = useCallback(async () => {
    setVoiceState('listening');
    setStatusText('Listening… speak your bill');
    setTranscript('');
    onListeningStart();
    startWave();

    const isWeb = typeof navigator !== 'undefined' && !!navigator.mediaDevices;
    if (!isWeb) {
      setVoiceState('error');
      setStatusText('Voice billing available on web build');
      stopWave();
      onListeningStop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      const mr     = new MediaRecorder(stream, {mimeType: 'audio/webm'});
      audioChunksRef.current = [];

      mr.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        stopWave();
        onListeningStop();
        setVoiceState('processing');
        setStatusText('Processing your voice…');

        const blob     = new Blob(audioChunksRef.current, {type: 'audio/webm'});
        const formData = new FormData();
        formData.append('audio', blob, 'voice.webm');

        try {
          const res  = await fetch('/api/v1/voice/transcribe', {method: 'POST', body: formData});
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Voice processing failed');

          setVoiceState('success');
          setTranscript(data.transcript ?? '');
          setStatusText('Got it! Review below');
          onResult(data as VoiceResult);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Voice processing failed';
          setVoiceState('error');
          setStatusText(msg);
          onError(msg);
        }
      };

      mr.start();
      mediaRecorderRef.current = mr;

      // Auto-stop after 12 seconds
      setTimeout(() => {
        if (mr.state === 'recording') mr.stop();
      }, 12000);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      stopWave();
      onListeningStop();
      setVoiceState('error');
      setStatusText(msg);
    }
  }, [onListeningStart, onListeningStop, startWave, stopWave, onResult, onError]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleMicPress = () => {
    if (voiceState === 'idle' || voiceState === 'error') {
      startListening();
    } else if (voiceState === 'listening') {
      stopListening();
    }
  };

  const micBgColor = {
    idle:       colors.primary,
    listening:  colors.error,
    processing: colors.warning,
    success:    colors.success,
    error:      colors.error,
  }[voiceState];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={() => { stopListening(); onClose(); }}
          activeOpacity={1}>
          <Animated.View style={[StyleSheet.absoluteFillObject, styles.modalBg, {opacity: bgOpacity}]} />
        </TouchableOpacity>

        <Animated.View style={[styles.sheet, {transform: [{translateY: sheetSlide}]}]}>
          <View style={styles.handle} />

          <Text style={styles.title}>Voice Billing</Text>
          <Text style={styles.subtitle}>Say what to add — e.g. "2 Maggi and 3 Parle G"</Text>

          {/* Waveform */}
          <View style={styles.waveContainer}>
            {voiceState === 'processing' ? (
              <ActivityIndicator color={colors.primary} size="large" />
            ) : (
              <View style={styles.waveBars}>
                {waveBars.map((bar, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.waveBar,
                      {
                        backgroundColor: voiceState === 'listening' ? colors.error : colors.border,
                        transform: [{scaleY: bar}],
                      },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>

          {/* Status */}
          <Text style={[styles.statusText, voiceState === 'error' && {color: colors.error}]}>
            {statusText}
          </Text>

          {/* Transcript preview */}
          {transcript.length > 0 && (
            <View style={styles.transcriptBox}>
              <Text style={styles.transcriptLabel}>Heard:</Text>
              <Text style={styles.transcriptText}>"{transcript}"</Text>
            </View>
          )}

          {/* Mic button */}
          <TouchableOpacity
            style={[styles.micBtn, {backgroundColor: micBgColor}, shadows.colored(micBgColor)]}
            onPress={handleMicPress}
            activeOpacity={0.85}
            disabled={voiceState === 'processing' || voiceState === 'success'}>
            <Text style={styles.micEmoji}>
              {voiceState === 'listening' ? '⏹' : voiceState === 'success' ? '✓' : '🎙️'}
            </Text>
            {voiceState === 'listening' && (
              <Text style={styles.micHint}>Tap to stop</Text>
            )}
          </TouchableOpacity>

          {/* Example phrases */}
          <View style={styles.examplesWrap}>
            <Text style={styles.examplesTitle}>Try saying:</Text>
            <View style={styles.exampleChips}>
              {['"2 Maggi"', '"1 kg sugar"', '"3 Parle G and 2 Frooti"'].map(ex => (
                <View key={ex} style={styles.exampleChip}>
                  <Text style={styles.exampleChipText}>{ex}</Text>
                </View>
              ))}
            </View>
          </View>

          <TouchableOpacity style={styles.cancelBtn} onPress={() => { stopListening(); onClose(); }} activeOpacity={0.8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // FAB
  fab: {
    width:          60,
    height:         60,
    borderRadius:   radius.full,
    backgroundColor: colors.primary,
    alignItems:     'center',
    justifyContent: 'center',
    ...shadows.colored(colors.primary),
    position:       'relative',
  },
  fabInner: {
    width:          60,
    height:         60,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
  },
  fabMic: {
    fontSize: 26,
  },
  fabRipple: {
    position:       'absolute',
    width:          60,
    height:         60,
    borderRadius:   radius.full,
    borderWidth:    2,
    borderColor:    colors.primary + '40',
    transform:      [{scale: 1.25}],
  },

  // Modal
  modalRoot: {
    flex:           1,
    justifyContent: 'flex-end',
  },
  modalBg: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor:      colors.surface,
    borderTopLeftRadius:  radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop:           spacing.sm,
    paddingHorizontal:    spacing.lg,
    paddingBottom:        spacing.xl + spacing.md,
    alignItems:           'center',
    gap:                  spacing.sm,
    ...shadows.xl,
  },
  handle: {
    width:           40,
    height:          4,
    backgroundColor: colors.border,
    borderRadius:    radius.full,
    marginBottom:    spacing.xs,
  },
  title:    {
    ...typography.h2,
    color: colors.text,
  },
  subtitle: {
    ...typography.body2,
    color:     colors.textMuted,
    textAlign: 'center',
  },

  // Waveform
  waveContainer: {
    height:          80,
    width:           '100%',
    alignItems:      'center',
    justifyContent:  'center',
    marginVertical:  spacing.sm,
  },
  waveBars: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            5,
    height:         60,
  },
  waveBar: {
    width:        5,
    height:       52,
    borderRadius: radius.full,
  },

  statusText: {
    ...typography.body2,
    color:      colors.textMuted,
    textAlign:  'center',
    fontWeight: '500',
  },

  // Transcript
  transcriptBox: {
    width:           '100%',
    backgroundColor: colors.primaryFaint,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    borderWidth:     1,
    borderColor:     colors.primary + '25',
    gap:             3,
  },
  transcriptLabel: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  transcriptText: {
    ...typography.body1,
    color:      colors.text,
    fontWeight: '600',
    fontStyle:  'italic',
  },

  // Mic button
  micBtn: {
    width:          88,
    height:         88,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            4,
    marginVertical: spacing.sm,
  },
  micEmoji: {fontSize: 36},
  micHint:  {...typography.caption, color: '#fff', fontWeight: '700'},

  // Examples
  examplesWrap: {
    width:     '100%',
    gap:       spacing.xs,
  },
  examplesTitle: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
  },
  exampleChips: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            spacing.xs,
    justifyContent: 'center',
  },
  exampleChip: {
    backgroundColor:   colors.surfaceAlt,
    borderRadius:      radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical:   5,
    borderWidth:       1,
    borderColor:       colors.border,
  },
  exampleChipText: {
    ...typography.caption,
    color:      colors.textSub,
    fontWeight: '600',
  },

  cancelBtn: {
    width:          '100%',
    height:         46,
    borderRadius:   radius.lg,
    borderWidth:    1,
    borderColor:    colors.border,
    alignItems:     'center',
    justifyContent: 'center',
    marginTop:      spacing.xs,
  },
  cancelText: {
    ...typography.button,
    color: colors.textMuted,
  },
});
