/**
 * SmartPOS AI – Login Screen
 * Animated logo entry, JWT auth, demo mode.
 */

import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {demoAccount, useAuth} from '../store/AuthContext';
import {colors, radius, shadows, spacing, typography} from '../utils/theme';
import {AppButton} from '../components/ui';

export const LoginScreen: React.FC = () => {
  const {login, loginDemo} = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [emailErr, setEmailErr] = useState('');
  const [passErr,  setPassErr]  = useState('');
  const [apiErr,   setApiErr]   = useState('');

  // ─── Entry animations ─────────────────────────────────────────────
  const logoScale    = useRef(new Animated.Value(0.6)).current;
  const logoOpacity  = useRef(new Animated.Value(0)).current;
  const formOpacity  = useRef(new Animated.Value(0)).current;
  const formSlideY   = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale,  {toValue: 1, useNativeDriver: true, speed: 12, bounciness: 10}),
        Animated.timing(logoOpacity,{toValue: 1, duration: 350,         useNativeDriver: true}),
      ]),
      Animated.parallel([
        Animated.timing(formOpacity, {toValue: 1, duration: 300, delay: 50, useNativeDriver: true}),
        Animated.timing(formSlideY,  {toValue: 0, duration: 300, delay: 50, useNativeDriver: true}),
      ]),
    ]).start();
  }, [logoScale, logoOpacity, formOpacity, formSlideY]);

  const validate = (): boolean => {
    let valid = true;
    setEmailErr('');
    setPassErr('');
    setApiErr('');
    if (!email.trim()) {
      setEmailErr('Email is required');
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailErr('Enter a valid email address');
      valid = false;
    }
    if (!password) {
      setPassErr('Password is required');
      valid = false;
    } else if (password.length < 6) {
      setPassErr('Password must be at least 6 characters');
      valid = false;
    }
    return valid;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await login({email: email.trim().toLowerCase(), password});
    } catch (err: any) {
      setApiErr(err?.response?.data?.detail || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    setApiErr('');
    try {
      await loginDemo();
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        <View style={styles.content}>

          {/* ── Logo / Header ─────────────────────────────────────── */}
          <Animated.View
            style={[
              styles.header,
              {transform: [{scale: logoScale}], opacity: logoOpacity},
            ]}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>POS</Text>
            </View>
            <Text style={styles.appName}>SmartPOS AI</Text>
            <Text style={styles.tagline}>Decision Intelligence for Your Store</Text>
          </Animated.View>

          {/* ── Form ──────────────────────────────────────────────── */}
          <Animated.View
            style={[
              styles.formCard,
              {opacity: formOpacity, transform: [{translateY: formSlideY}]},
            ]}>

            {/* API error */}
            {apiErr ? (
              <View style={styles.apiError}>
                <Text style={styles.apiErrorText}>⚠️  {apiErr}</Text>
              </View>
            ) : null}

            {/* Email */}
            <View style={styles.field}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={[styles.input, emailErr ? styles.inputError : null]}
                value={email}
                onChangeText={t => { setEmail(t); setEmailErr(''); setApiErr(''); }}
                placeholder="owner@yourstore.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                editable={!loading}
              />
              {emailErr ? <Text style={styles.fieldError}>{emailErr}</Text> : null}
            </View>

            {/* Password */}
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputWrap, passErr ? styles.inputError : null]}>
                <TextInput
                  style={styles.inputInner}
                  value={password}
                  onChangeText={t => { setPassword(t); setPassErr(''); setApiErr(''); }}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPass}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  editable={!loading}
                />
                <Pressable onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                  <Text style={styles.eyeText}>{showPass ? '🙈' : '👁️'}</Text>
                </Pressable>
              </View>
              {passErr ? <Text style={styles.fieldError}>{passErr}</Text> : null}
            </View>

            {/* Sign in */}
            <AppButton
              label="Sign In"
              onPress={handleLogin}
              variant="primary"
              size="lg"
              loading={loading}
              fullWidth
              style={styles.loginBtn}
            />

            {/* Demo */}
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>

            <AppButton
              label="Use Demo Account"
              onPress={handleDemoLogin}
              variant="ghost"
              size="md"
              loading={loading}
              fullWidth
            />

            <Text style={styles.demoHint}>{demoAccount.email}</Text>
          </Animated.View>

          <Text style={styles.footer}>SmartPOS AI v1.0 · Offline-Ready · GST Compliant</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex:            1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow:          1,
    justifyContent:    'center',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.xl,
  },
  content: {
    width:     '100%',
    maxWidth:  440,
    alignSelf: 'center',
  },

  // Header
  header: {
    alignItems:   'center',
    marginBottom: spacing.xl,
    gap:          spacing.xs,
  },
  logoCircle: {
    width:           80,
    height:          80,
    borderRadius:    radius.xl,
    backgroundColor: colors.primary,
    justifyContent:  'center',
    alignItems:      'center',
    marginBottom:    spacing.sm,
    ...shadows.colored(colors.primary),
  },
  logoText:  {color: '#fff', fontSize: 24, fontWeight: '900'},
  appName: {
    ...typography.h1,
    color:         colors.text,
    textAlign:     'center',
    letterSpacing: -0.8,
  },
  tagline: {
    ...typography.body2,
    color:     colors.textMuted,
    textAlign: 'center',
  },

  // Form card
  formCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.xl,
    padding:         spacing.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    ...shadows.md,
    gap:             spacing.sm,
  },

  // API error
  apiError: {
    backgroundColor: colors.errorFaint,
    borderRadius:    radius.md,
    padding:         spacing.md,
    borderWidth:     1,
    borderColor:     colors.error + '40',
  },
  apiErrorText: {
    ...typography.body2,
    color: colors.error,
    fontWeight: '500',
  },

  // Fields
  field: {
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textSub,
  },
  input: {
    height:            52,
    backgroundColor:   colors.surfaceAlt,
    borderRadius:      radius.md,
    borderWidth:       1.5,
    borderColor:       colors.border,
    paddingHorizontal: spacing.md,
    ...typography.body1,
    color:             colors.text,
  },
  inputWrap: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius:    radius.md,
    borderWidth:     1.5,
    borderColor:     colors.border,
  },
  inputInner: {
    flex:              1,
    height:            52,
    paddingHorizontal: spacing.md,
    ...typography.body1,
    color:             colors.text,
  },
  inputError: {
    borderColor: colors.error,
  },
  eyeBtn:      {paddingHorizontal: spacing.md},
  eyeText:     {fontSize: 18},
  fieldError: {
    ...typography.caption,
    color:     colors.error,
    marginTop: 2,
  },

  // Login button (extra top margin)
  loginBtn: {
    marginTop: spacing.xs,
  },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  divider: {
    flex:            1,
    height:          1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.caption,
    color: colors.textMuted,
  },

  // Demo hint
  demoHint: {
    ...typography.caption,
    color:     colors.textMuted,
    textAlign: 'center',
  },

  // Footer
  footer: {
    textAlign:  'center',
    ...typography.caption,
    color:      colors.textMuted,
    marginTop:  spacing.xl,
  },
});
