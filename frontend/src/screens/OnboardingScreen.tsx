/**
 * SmartPOS AI – Premium Animated Onboarding
 * 5-slide walkthrough: Welcome → Billing → Credit → Analytics → Setup
 * Uses built-in Animated API (web + native compatible).
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {AnimatedPressable, AppButton} from '../components/ui';
import {colors, radius, shadows, spacing, typography, animation} from '../utils/theme';

const {width: SCREEN_W} = Dimensions.get('window');

// ─── Slide Data ───────────────────────────────────────────────────────────────

interface Slide {
  id:          string;
  emoji:       string;
  badge:       string;
  badgeColor:  string;
  title:       string;
  subtitle:    string;
  bullets:     string[];
  accentColor: string;
  bgColor:     string;
}

const SLIDES: Slide[] = [
  {
    id:          'welcome',
    emoji:       '🏪',
    badge:       'Welcome',
    badgeColor:  colors.primary,
    title:       'SmartPOS AI',
    subtitle:    'Your intelligent retail operating system',
    bullets:     [
      '⚡  Fastest billing in Indian retail',
      '📶  Works fully offline — no internet needed',
      '🤖  AI-powered insights and alerts',
    ],
    accentColor: colors.primary,
    bgColor:     colors.primaryFaint,
  },
  {
    id:          'billing',
    emoji:       '🧾',
    badge:       'Billing',
    badgeColor:  colors.success,
    title:       'Bill in seconds',
    subtitle:    'Tap, scan, or speak — your choice',
    bullets:     [
      '📷  Barcode scanner built in',
      '🎙️  Voice billing — just say what to add',
      '💳  Cash, UPI, card, or credit — all modes',
    ],
    accentColor: colors.success,
    bgColor:     colors.successFaint,
  },
  {
    id:          'credit',
    emoji:       '📒',
    badge:       'Credit Book',
    badgeColor:  colors.warning,
    title:       'Your digital udhar book',
    subtitle:    'Track every rupee, never forget a due',
    bullets:     [
      '👤  Per-customer credit tracking',
      '📱  WhatsApp reminders — one tap send',
      '⚠️  Overdue alerts — automatic',
    ],
    accentColor: colors.warning,
    bgColor:     colors.warningFaint,
  },
  {
    id:          'analytics',
    emoji:       '📊',
    badge:       'Insights',
    badgeColor:  colors.accent,
    title:       'Know your business cold',
    subtitle:    'AI spots trends before you can',
    bullets:     [
      '📈  Daily/weekly revenue trends',
      '🔔  Anomaly & fraud alerts',
      '📦  Stock level warnings — smart reorders',
    ],
    accentColor: colors.accent,
    bgColor:     colors.accentFaint,
  },
  {
    id:          'setup',
    emoji:       '🚀',
    badge:       "Let's go!",
    badgeColor:  '#7C3AED',
    title:       "Set up your store",
    subtitle:    'Takes less than 2 minutes',
    bullets:     [
      '🏪  Enter your store name',
      '📦  Add your first products',
      '💰  Start billing immediately',
    ],
    accentColor: '#7C3AED',
    bgColor:     '#F5F3FF',
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface OnboardingScreenProps {
  onComplete: (storeName?: string) => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({onComplete}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [storeName,    setStoreName]    = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const isLast = currentIndex === SLIDES.length - 1;

  const goTo = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, SLIDES.length - 1));
    setCurrentIndex(clamped);
    scrollRef.current?.scrollTo({x: clamped * SCREEN_W, animated: true});
  }, []);

  const handleNext = () => {
    if (isLast) {
      onComplete(storeName.trim() || undefined);
    } else {
      goTo(currentIndex + 1);
    }
  };

  const handleSkip = () => onComplete();

  return (
    <View style={styles.root}>
      {/* Skip button */}
      {!isLast && (
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slide carousel */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={styles.carousel}>
        {SLIDES.map((slide, index) => (
          <SlideView
            key={slide.id}
            slide={slide}
            index={index}
            active={index === currentIndex}
            storeName={storeName}
            onStoreNameChange={setStoreName}
          />
        ))}
      </ScrollView>

      {/* Dot indicator */}
      <DotIndicator
        total={SLIDES.length}
        current={currentIndex}
        accentColor={SLIDES[currentIndex].accentColor}
        onDotPress={goTo}
      />

      {/* Navigation buttons */}
      <View style={styles.navRow}>
        {currentIndex > 0 ? (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => goTo(currentIndex - 1)}
            activeOpacity={0.8}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtnPlaceholder} />
        )}

        <AnimatedPressable
          style={[
            styles.nextBtn,
            {backgroundColor: SLIDES[currentIndex].accentColor},
            shadows.colored(SLIDES[currentIndex].accentColor),
          ]}
          onPress={handleNext}
          scaleDown={0.97}>
          <Text style={styles.nextBtnText}>
            {isLast ? '🚀  Get Started' : 'Next  →'}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
};

// ─── Slide View ───────────────────────────────────────────────────────────────

const SlideView: React.FC<{
  slide:              Slide;
  index:              number;
  active:             boolean;
  storeName:          string;
  onStoreNameChange:  (v: string) => void;
}> = ({slide, index, active, storeName, onStoreNameChange}) => {
  const emojiScale   = useRef(new Animated.Value(0.5)).current;
  const emojiOpacity = useRef(new Animated.Value(0)).current;
  const contentY     = useRef(new Animated.Value(20)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (active) {
      emojiScale.setValue(0.5);
      emojiOpacity.setValue(0);
      contentY.setValue(20);
      contentOpacity.setValue(0);

      Animated.sequence([
        Animated.parallel([
          Animated.spring(emojiScale,   {toValue: 1,   useNativeDriver: true, speed: 14, bounciness: 12}),
          Animated.timing(emojiOpacity, {toValue: 1,   duration: 280,         useNativeDriver: true}),
        ]),
        Animated.parallel([
          Animated.timing(contentOpacity, {toValue: 1, duration: 280, useNativeDriver: true}),
          Animated.timing(contentY,       {toValue: 0, duration: 280, useNativeDriver: true}),
        ]),
      ]).start();
    }
  }, [active, emojiScale, emojiOpacity, contentY, contentOpacity]);

  return (
    <View style={[styles.slide]}>
      {/* Illustration circle */}
      <Animated.View
        style={[
          styles.illustrationWrap,
          {backgroundColor: slide.bgColor},
          {transform: [{scale: emojiScale}], opacity: emojiOpacity},
        ]}>
        <View style={[styles.illustrationCircle, {borderColor: slide.accentColor + '30'}]}>
          <Text style={styles.illustrationEmoji}>{slide.emoji}</Text>
        </View>
        {/* Decorative ring */}
        <View style={[styles.illustrationRing, {borderColor: slide.accentColor + '20'}]} />
      </Animated.View>

      {/* Badge chip */}
      <Animated.View style={{opacity: contentOpacity, transform: [{translateY: contentY}]}}>
        <View style={[styles.badge, {backgroundColor: slide.badgeColor + '18', borderColor: slide.badgeColor + '30'}]}>
          <Text style={[styles.badgeText, {color: slide.badgeColor}]}>{slide.badge}</Text>
        </View>
      </Animated.View>

      {/* Title + subtitle */}
      <Animated.View style={[styles.textBlock, {opacity: contentOpacity, transform: [{translateY: contentY}]}]}>
        <Text style={styles.slideTitle}>{slide.title}</Text>
        <Text style={styles.slideSubtitle}>{slide.subtitle}</Text>
      </Animated.View>

      {/* Bullet points */}
      <Animated.View style={[styles.bulletsWrap, {opacity: contentOpacity, transform: [{translateY: contentY}]}]}>
        {slide.bullets.map((bullet, i) => (
          <BulletRow
            key={i}
            text={bullet}
            accentColor={slide.accentColor}
            delay={i * 60}
            parentActive={active}
          />
        ))}
      </Animated.View>

      {/* Store setup input — only on last slide */}
      {index === SLIDES.length - 1 && (
        <Animated.View style={[styles.setupWrap, {opacity: contentOpacity}]}>
          <Text style={styles.setupLabel}>Store Name (optional)</Text>
          <TextInput
            style={[styles.setupInput, {borderColor: slide.accentColor + '50'}]}
            value={storeName}
            onChangeText={onStoreNameChange}
            placeholder="e.g. Raju Kirana Store"
            placeholderTextColor={colors.textMuted}
            maxLength={40}
          />
          <Text style={styles.setupHint}>You can change this anytime in Settings</Text>
        </Animated.View>
      )}
    </View>
  );
};

// ─── Bullet Row ───────────────────────────────────────────────────────────────

const BulletRow: React.FC<{
  text:        string;
  accentColor: string;
  delay:       number;
  parentActive: boolean;
}> = ({text, accentColor, delay, parentActive}) => {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    if (parentActive) {
      opacity.setValue(0);
      translateX.setValue(-12);
      Animated.parallel([
        Animated.timing(opacity,    {toValue: 1, duration: 240, delay: 280 + delay, useNativeDriver: true}),
        Animated.timing(translateX, {toValue: 0, duration: 240, delay: 280 + delay, useNativeDriver: true}),
      ]).start();
    }
  }, [parentActive, opacity, translateX, delay]);

  return (
    <Animated.View style={[styles.bulletRow, {opacity, transform: [{translateX}]}]}>
      <View style={[styles.bulletDot, {backgroundColor: accentColor}]} />
      <Text style={styles.bulletText}>{text}</Text>
    </Animated.View>
  );
};

// ─── Dot Indicator ────────────────────────────────────────────────────────────

const DotIndicator: React.FC<{
  total:       number;
  current:     number;
  accentColor: string;
  onDotPress:  (i: number) => void;
}> = ({total, current, accentColor, onDotPress}) => (
  <View style={styles.dots}>
    {Array.from({length: total}).map((_, i) => (
      <DotItem
        key={i}
        active={i === current}
        accentColor={accentColor}
        onPress={() => onDotPress(i)}
      />
    ))}
  </View>
);

const DotItem: React.FC<{active: boolean; accentColor: string; onPress: () => void}> = (
  {active, accentColor, onPress},
) => {
  const width   = useRef(new Animated.Value(active ? 24 : 8)).current;
  const opacity = useRef(new Animated.Value(active ? 1 : 0.35)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(width,   {toValue: active ? 24 : 8,  useNativeDriver: false, speed: 40, bounciness: 4}),
      Animated.timing(opacity, {toValue: active ? 1 : 0.35, duration: 180,          useNativeDriver: true}),
    ]).start();
  }, [active, width, opacity]);

  return (
    <TouchableOpacity onPress={onPress} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
      <Animated.View
        style={[
          styles.dot,
          {width, opacity, backgroundColor: active ? accentColor : colors.border},
        ]}
      />
    </TouchableOpacity>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: colors.background,
    paddingBottom:   spacing.xl,
  },

  skipBtn: {
    position:    'absolute',
    top:         spacing.lg,
    right:       spacing.lg,
    zIndex:      10,
    paddingVertical:   spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius:      radius.full,
    backgroundColor:   colors.surfaceAlt,
    borderWidth:       1,
    borderColor:       colors.border,
  },
  skipText: {
    ...typography.caption,
    color:      colors.textMuted,
    fontWeight: '600',
  },

  carousel: {
    flex: 1,
  },

  slide: {
    width:          SCREEN_W,
    flex:           1,
    alignItems:     'center',
    paddingTop:     spacing.xxl + spacing.lg,
    paddingHorizontal: spacing.xl,
    gap:            spacing.md,
  },

  illustrationWrap: {
    width:          160,
    height:         160,
    borderRadius:   radius.full,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   spacing.xs,
    position:       'relative',
  },
  illustrationCircle: {
    width:          128,
    height:         128,
    borderRadius:   radius.full,
    backgroundColor: colors.surface,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    2,
    ...shadows.md,
  },
  illustrationRing: {
    position:     'absolute',
    width:        150,
    height:       150,
    borderRadius: radius.full,
    borderWidth:  1.5,
  },
  illustrationEmoji: {
    fontSize: 60,
  },

  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical:   5,
    borderRadius:      radius.full,
    borderWidth:       1,
  },
  badgeText: {
    ...typography.overline,
    fontSize: 11,
  },

  textBlock: {
    alignItems: 'center',
    gap:        spacing.xs,
  },
  slideTitle: {
    fontSize:      28,
    fontWeight:    '800',
    color:         colors.text,
    textAlign:     'center',
    letterSpacing: -0.5,
  },
  slideSubtitle: {
    ...typography.body1,
    color:     colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
  },

  bulletsWrap: {
    width:     '100%',
    gap:       spacing.sm,
    marginTop: spacing.xs,
  },
  bulletRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing.sm,
    backgroundColor: colors.surface,
    borderRadius:   radius.lg,
    padding:        spacing.md,
    borderWidth:    1,
    borderColor:    colors.border,
    ...shadows.xs,
  },
  bulletDot: {
    width:        8,
    height:       8,
    borderRadius: radius.full,
    flexShrink:   0,
  },
  bulletText: {
    ...typography.body2,
    color:  colors.text,
    flex:   1,
    fontWeight: '500',
  },

  setupWrap: {
    width:     '100%',
    gap:       spacing.xs,
    marginTop: spacing.xs,
  },
  setupLabel: {
    ...typography.label,
    color: colors.textSub,
  },
  setupInput: {
    height:            52,
    backgroundColor:   colors.surface,
    borderRadius:      radius.lg,
    borderWidth:       1.5,
    paddingHorizontal: spacing.md,
    ...typography.body1,
    color:             colors.text,
    fontWeight:        '600',
    ...shadows.xs,
  },
  setupHint: {
    ...typography.caption,
    color: colors.textMuted,
  },

  dots: {
    flexDirection:  'row',
    justifyContent: 'center',
    alignItems:     'center',
    gap:            spacing.xs,
    paddingVertical: spacing.md,
  },
  dot: {
    height:       8,
    borderRadius: radius.full,
  },

  navRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: spacing.lg,
    gap:               spacing.md,
  },
  backBtn: {
    paddingVertical:   13,
    paddingHorizontal: spacing.md,
    borderRadius:      radius.lg,
    borderWidth:       1,
    borderColor:       colors.border,
    backgroundColor:   colors.surface,
  },
  backBtnText: {
    ...typography.button,
    color: colors.textMuted,
  },
  backBtnPlaceholder: {
    width: 80,
  },
  nextBtn: {
    flex:            1,
    height:          52,
    borderRadius:    radius.lg,
    alignItems:      'center',
    justifyContent:  'center',
  },
  nextBtnText: {
    ...typography.button,
    color:    '#fff',
    fontSize: 16,
  },
});
