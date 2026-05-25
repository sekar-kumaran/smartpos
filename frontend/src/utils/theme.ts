/**
 * SmartPOS AI – Design Tokens v2
 * Refined palette matching the premium startup visual identity.
 */

import {TextStyle} from 'react-native';

// ─── Colors ────────────────────────────────────────────────────────────────

export const colors = {
  // Brand — indigo-violet matching the design
  primary:      '#5B4CF5',
  primaryDark:  '#4338CA',
  primaryLight: '#8B7FF8',
  primaryFaint: '#EEEAFF',

  // KPI card accent colors
  sales:        '#5B4CF5',   // purple  — Total Sales
  profit:       '#3B82F6',   // blue    — Total Profit
  credit:       '#F43F5E',   // rose    — Total Credit / overdue
  alertColor:   '#F97316',   // orange  — Alerts

  // Semantic
  success:      '#22C55E',
  successDark:  '#16A34A',
  successFaint: '#F0FDF4',

  warning:      '#F59E0B',
  warningDark:  '#D97706',
  warningFaint: '#FFFBEB',

  error:        '#EF4444',
  errorDark:    '#DC2626',
  errorFaint:   '#FEF2F2',

  info:         '#3B82F6',
  infoDark:     '#2563EB',
  infoFaint:    '#EFF6FF',

  accent:       '#06B6D4',
  accentDark:   '#0891B2',
  accentFaint:  '#ECFEFF',

  // Backgrounds — subtle blue-white tint for premium feel
  background:   '#F4F6FB',
  surface:      '#FFFFFF',
  surfaceAlt:   '#F1F3F9',
  surfaceRaised:'#FFFFFF',

  // Text
  text:         '#1C1B4B',
  textSub:      '#3D3B6E',
  textMuted:    '#9B9BBF',
  textDisabled: '#C8C8E0',

  // Borders
  border:       '#E8EAF2',
  borderDark:   '#D0D3E8',
  borderFocus:  '#5B4CF5',

  // Skeleton shimmer
  skeletonBase:     '#EAEDF5',
  skeletonHighlight:'#F4F6FB',

  // Overlays
  overlay:      'rgba(28,27,75,0.5)',
  overlayLight: 'rgba(28,27,75,0.15)',
};

// ─── Gradients ──────────────────────────────────────────────────────────────

export const gradients = {
  primary:   [colors.primary, colors.primaryDark],
  brand:     ['#5B4CF5', '#7C3AED'],
  brandSoft: ['#EEEAFF', '#F5F3FF'],
  success:   [colors.success, colors.successDark],
  surface:   [colors.surface, colors.surfaceAlt],
  warm:      ['#F97316', '#EF4444'],
};

// ─── Typography ────────────────────────────────────────────────────────────

export const typography = {
  display: {
    fontSize:      36,
    fontWeight:    '800' as TextStyle['fontWeight'],
    lineHeight:    44,
    letterSpacing: -1,
  } as TextStyle,

  h1: {
    fontSize:      28,
    fontWeight:    '700' as TextStyle['fontWeight'],
    lineHeight:    36,
    letterSpacing: -0.5,
  } as TextStyle,

  h2: {
    fontSize:      22,
    fontWeight:    '700' as TextStyle['fontWeight'],
    lineHeight:    30,
    letterSpacing: -0.3,
  } as TextStyle,

  h3: {
    fontSize:      18,
    fontWeight:    '600' as TextStyle['fontWeight'],
    lineHeight:    26,
  } as TextStyle,

  body1: {
    fontSize:   16,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 24,
  } as TextStyle,

  body2: {
    fontSize:   14,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 20,
  } as TextStyle,

  label: {
    fontSize:      13,
    fontWeight:    '600' as TextStyle['fontWeight'],
    lineHeight:    18,
    letterSpacing: 0.1,
  } as TextStyle,

  caption: {
    fontSize:   12,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 16,
  } as TextStyle,

  overline: {
    fontSize:      10,
    fontWeight:    '700' as TextStyle['fontWeight'],
    lineHeight:    14,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as TextStyle['textTransform'],
  } as TextStyle,

  button: {
    fontSize:      15,
    fontWeight:    '600' as TextStyle['fontWeight'],
    lineHeight:    22,
    letterSpacing: 0.2,
  } as TextStyle,

  buttonSm: {
    fontSize:      13,
    fontWeight:    '600' as TextStyle['fontWeight'],
    lineHeight:    18,
    letterSpacing: 0.1,
  } as TextStyle,

  mono: {
    fontSize:      14,
    fontWeight:    '500' as TextStyle['fontWeight'],
    lineHeight:    20,
    fontVariant:   ['tabular-nums'] as TextStyle['fontVariant'],
  } as TextStyle,
};

// ─── Shadows ────────────────────────────────────────────────────────────────

export const shadows = {
  none: {},
  xs: {
    shadowColor:   '#1C1B4B',
    shadowOffset:  {width: 0, height: 1},
    shadowOpacity: 0.04,
    shadowRadius:  2,
    elevation:     1,
  },
  sm: {
    shadowColor:   '#1C1B4B',
    shadowOffset:  {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius:  4,
    elevation:     2,
  },
  md: {
    shadowColor:   '#1C1B4B',
    shadowOffset:  {width: 0, height: 4},
    shadowOpacity: 0.09,
    shadowRadius:  8,
    elevation:     4,
  },
  lg: {
    shadowColor:   '#1C1B4B',
    shadowOffset:  {width: 0, height: 8},
    shadowOpacity: 0.12,
    shadowRadius:  16,
    elevation:     8,
  },
  xl: {
    shadowColor:   '#1C1B4B',
    shadowOffset:  {width: 0, height: 12},
    shadowOpacity: 0.16,
    shadowRadius:  24,
    elevation:     12,
  },
  card: {
    shadowColor:   '#1C1B4B',
    shadowOffset:  {width: 0, height: 2},
    shadowOpacity: 0.07,
    shadowRadius:  8,
    elevation:     3,
  },
  colored: (color: string) => ({
    shadowColor:   color,
    shadowOffset:  {width: 0, height: 4},
    shadowOpacity: 0.28,
    shadowRadius:  8,
    elevation:     6,
  }),
};

// ─── Spacing ─────────────────────────────────────────────────────────────────

export const spacing = {
  xxs: 2,
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
  xxxl: 64,
};

// ─── Border Radius ──────────────────────────────────────────────────────────

export const radius = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  28,
  full: 9999,
};

// ─── Animation ──────────────────────────────────────────────────────────────

export const animation = {
  duration: {
    instant:  100,
    fast:     180,
    normal:   280,
    slow:     450,
    verySlow: 700,
  },
  easing: {
    standard:   'ease-in-out',
    decelerate: 'ease-out',
    accelerate: 'ease-in',
    spring:     'spring',
  },
  spring: {
    gentle: {tension: 40, friction: 7},
    snappy: {tension: 120, friction: 9},
    bouncy: {tension: 80, friction: 5},
  },
  stagger: {short: 50, normal: 80, long: 120},
};

// ─── Semantic Maps ────────────────────────────────────────────────────────────

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export const severityColor: Record<Severity, string> = {
  low:      colors.info,
  medium:   colors.warning,
  high:     '#FF6B35',
  critical: colors.error,
};

export const statusColor: Record<StatusVariant, {text: string; bg: string; border: string}> = {
  success: {text: colors.success,     bg: colors.successFaint, border: colors.success + '40'},
  warning: {text: colors.warningDark, bg: colors.warningFaint, border: colors.warning + '50'},
  error:   {text: colors.error,       bg: colors.errorFaint,   border: colors.error   + '40'},
  info:    {text: colors.info,        bg: colors.infoFaint,    border: colors.info    + '35'},
  neutral: {text: colors.textSub,     bg: colors.surfaceAlt,   border: colors.border},
};
