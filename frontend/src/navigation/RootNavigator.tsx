/**
 * SmartPOS AI – Navigation
 * Onboarding gate → Auth stack → Main app (5 primary tabs + More sheet).
 * Tab structure: Dashboard · Billing · Inventory · Analytics · More
 * More sheet: Credit · Alerts · Shifts · Prices · Backup · Settings
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage                         from '../shims/async-storage';
import {NavigationContainer}               from '@react-navigation/native';
import {createNativeStackNavigator}        from '@react-navigation/native-stack';
import {createBottomTabNavigator}          from '@react-navigation/bottom-tabs';

import {useAuth}               from '../store/AuthContext';
import {OnboardingScreen}      from '../screens/OnboardingScreen';
import {LoginScreen}           from '../screens/LoginScreen';
import {DashboardScreen}       from '../screens/DashboardScreen';
import {BillingScreen}         from '../screens/BillingScreen';
import {InventoryScreen}       from '../screens/InventoryScreen';
import {AnalyticsScreen}       from '../screens/AnalyticsScreen';
import {CreditScreen}          from '../screens/CreditScreen';
import {AlertsScreen}          from '../screens/AlertsScreen';
import {ShiftScreen}           from '../screens/ShiftScreen';
import {PriceCategoryScreen}   from '../screens/PriceCategoryScreen';
import {BackupScreen}          from '../screens/BackupScreen';
import {SettingsScreen}        from '../screens/SettingsScreen';
import {SupplierScreen}        from '../screens/SupplierScreen';
import {GSTRScreen}            from '../screens/GSTRScreen';
import {LoyaltyScreen}         from '../screens/LoyaltyScreen';
import {colors, radius, shadows, spacing, typography} from '../utils/theme';

const ONBOARDING_KEY = '@smartpos:onboarding_done';

// ─── Navigator Types ──────────────────────────────────────────────────────────

export type AuthStackParams = {Login: undefined};
export type MainTabParams = {
  Dashboard:  undefined;
  Billing:    undefined;
  Inventory:  undefined;
  Analytics:  undefined;
  More:       undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParams>();
const MainTab   = createBottomTabNavigator<MainTabParams>();

// ─── Primary Tab Config ───────────────────────────────────────────────────────

const PRIMARY_TABS: Record<
  keyof MainTabParams,
  {emoji: string; label: string; color: string; header: string}
> = {
  Dashboard:  {emoji: '⊞',  label: 'Home',     color: colors.primary,  header: 'SmartPOS AI'},
  Billing:    {emoji: '🧾', label: 'Bills',    color: '#059669',        header: 'New Bill'},
  Inventory:  {emoji: '📦', label: 'Stock',    color: colors.info,      header: 'Inventory'},
  Analytics:  {emoji: '📈', label: 'Reports',  color: colors.accent,    header: 'Analytics'},
  More:       {emoji: '⋯',  label: 'More',     color: '#7C3AED',        header: 'More'},
};

// ─── More Sheet Items ─────────────────────────────────────────────────────────

interface MoreItem {
  key:        string;
  emoji:      string;
  label:      string;
  subtitle:   string;
  color:      string;
  component:  React.ComponentType<any>;
  screen?:    string;
}

const MORE_ITEMS: MoreItem[] = [
  {key: 'Credit',    emoji: '📒', label: 'Credit Book',      subtitle: 'Udhar & customer dues',    color: colors.warning,  component: CreditScreen},
  {key: 'Loyalty',   emoji: '⭐', label: 'Loyalty Points',   subtitle: 'Rewards & leaderboard',    color: '#B8860B',       component: LoyaltyScreen},
  {key: 'Suppliers', emoji: '🏭', label: 'Suppliers & POs',  subtitle: 'Suppliers & purchase orders', color: colors.info,  component: SupplierScreen},
  {key: 'GSTR',      emoji: '🧾', label: 'GSTR-1 Export',    subtitle: 'Auto-fill GST returns',    color: '#059669',       component: GSTRScreen},
  {key: 'Alerts',    emoji: '🔔', label: 'Alerts',           subtitle: 'Business anomalies',       color: colors.error,    component: AlertsScreen},
  {key: 'Shifts',    emoji: '🔄', label: 'Shift Management', subtitle: 'Open / close shifts',      color: '#7C3AED',       component: ShiftScreen},
  {key: 'Prices',    emoji: '🏷️', label: 'Price Categories', subtitle: 'Customer tier pricing',    color: '#0891B2',       component: PriceCategoryScreen},
  {key: 'Backup',    emoji: '☁️', label: 'Cloud Backup',     subtitle: 'AES-256 encrypted backup', color: colors.success,  component: BackupScreen},
  {key: 'Settings',  emoji: '⚙️', label: 'Settings',         subtitle: 'Store & account settings', color: colors.textMuted, component: SettingsScreen},
];

// ─── Tab Icon ─────────────────────────────────────────────────────────────────

const TabIcon: React.FC<{name: keyof MainTabParams; focused: boolean}> = ({
  name,
  focused,
}: {name: keyof MainTabParams; focused: boolean}) => {
  const scale   = useRef(new Animated.Value(focused ? 1 : 0.85)).current;
  const opacity = useRef(new Animated.Value(focused ? 1 : 0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   {toValue: focused ? 1 : 0.85, useNativeDriver: true, speed: 30, bounciness: focused ? 6 : 0}),
      Animated.timing(opacity, {toValue: focused ? 1 : 0.5,  duration: 180,         useNativeDriver: true}),
    ]).start();
  }, [focused, scale, opacity]);

  const cfg = PRIMARY_TABS[name];

  return (
    <Animated.View
      style={[
        styles.tabIconWrap,
        focused && {backgroundColor: cfg.color + '18'},
        {transform: [{scale}], opacity},
      ]}>
      <Text style={[styles.tabIconEmoji, name === 'More' && styles.tabIconMore]}>
        {cfg.emoji}
      </Text>
    </Animated.View>
  );
};

// ─── More Screen (tab placeholder — opens bottom sheet) ──────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MoreTabScreen: React.FC<{navigation: any}> = ({navigation}: {navigation: any}) => {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [activeKey,    setActiveKey]    = useState<string | null>(null);

  const slideY   = useRef(new Animated.Value(500)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const openSheet = useCallback(() => {
    setSheetVisible(true);
    Animated.parallel([
      Animated.spring(slideY,    {toValue: 0,   useNativeDriver: true, speed: 20, bounciness: 4}),
      Animated.timing(bgOpacity, {toValue: 1,   duration: 250,         useNativeDriver: true}),
    ]).start();
  }, [slideY, bgOpacity]);

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideY,    {toValue: 500, duration: 280, useNativeDriver: true}),
      Animated.timing(bgOpacity, {toValue: 0,   duration: 250, useNativeDriver: true}),
    ]).start(() => setSheetVisible(false));
  }, [slideY, bgOpacity]);

  // Auto-open when this tab is focused
  useEffect(() => {
    const unsub = navigation.addListener('tabPress', (e: any) => {
      e.preventDefault();
      setActiveKey(null);
      openSheet();
    });
    return unsub;
  }, [navigation, openSheet]);

  const ActiveComponent = MORE_ITEMS.find(i => i.key === activeKey)?.component ?? null;

  if (activeKey && ActiveComponent) {
    return (
      <View style={{flex: 1}}>
        <View style={styles.moreHeaderBar}>
          <TouchableOpacity
            style={styles.moreBackBtn}
            onPress={() => setActiveKey(null)}
            activeOpacity={0.8}>
            <Text style={styles.moreBackText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.moreHeaderTitle}>
            {MORE_ITEMS.find(i => i.key === activeKey)?.label}
          </Text>
          <View style={{width: 60}} />
        </View>
        <ActiveComponent navigation={navigation} />
      </View>
    );
  }

  return (
    <View style={styles.morePlaceholder}>
      <Text style={styles.morePlaceholderText}>Tap "More" tab to open menu</Text>

      <Modal
        visible={sheetVisible}
        transparent
        animationType="none"
        onRequestClose={closeSheet}>
        <View style={styles.sheetRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={closeSheet}
            activeOpacity={1}>
            <Animated.View style={[StyleSheet.absoluteFillObject, styles.sheetBg, {opacity: bgOpacity}]} />
          </TouchableOpacity>

          <Animated.View style={[styles.sheet, {transform: [{translateY: slideY}]}]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>More Features</Text>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll}>
              <View style={styles.moreGrid}>
                {MORE_ITEMS.map(item => (
                  <MoreTile
                    key={item.key}
                    item={item}
                    onPress={() => {
                      closeSheet();
                      setTimeout(() => setActiveKey(item.key), 300);
                    }}
                  />
                ))}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
};

// ─── More Tile ────────────────────────────────────────────────────────────────

const MoreTile: React.FC<{item: MoreItem; onPress: () => void}> = (
  {item, onPress}: {item: MoreItem; onPress: () => void},
) => {
  const scale = useRef(new Animated.Value(1)).current;

  const press = () => {
    Animated.sequence([
      Animated.spring(scale, {toValue: 0.95, useNativeDriver: true, speed: 100}),
      Animated.spring(scale, {toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 8}),
    ]).start();
    setTimeout(onPress, 80);
  };

  return (
    <TouchableOpacity onPress={press} activeOpacity={1} style={styles.moreTileWrap}>
      <Animated.View style={[styles.moreTile, {transform: [{scale}]}]}>
        <View style={[styles.moreTileIcon, {backgroundColor: item.color + '15'}]}>
          <Text style={styles.moreTileEmoji}>{item.emoji}</Text>
        </View>
        <Text style={styles.moreTileLabel}>{item.label}</Text>
        <Text style={styles.moreTileSub} numberOfLines={1}>{item.subtitle}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

// ─── Main Navigator ───────────────────────────────────────────────────────────

const MainNavigator: React.FC = () => (
  <MainTab.Navigator
    screenOptions={({route}: {route: {name: string}}) => {
      const cfg = PRIMARY_TABS[route.name as keyof MainTabParams];
      return {
        tabBarIcon: ({focused}: {focused: boolean}) => (
          <TabIcon name={route.name as keyof MainTabParams} focused={focused} />
        ),
        tabBarLabel: ({focused}: {focused: boolean}) => (
          <Text
            style={[
              styles.tabLabel,
              {color: focused ? cfg.color : colors.textMuted},
              focused && styles.tabLabelActive,
            ]}>
            {cfg.label}
          </Text>
        ),
        tabBarStyle:             styles.tabBar,
        tabBarActiveTintColor:   cfg.color,
        tabBarInactiveTintColor: colors.textMuted,
        headerStyle:             styles.header,
        headerTitleStyle:        styles.headerTitle,
        headerTintColor:         colors.text,
        headerShadowVisible:     true,
      };
    }}>
    <MainTab.Screen name="Dashboard"  component={DashboardScreen}  options={{title: 'Home',      headerShown: false}} />
    <MainTab.Screen name="Billing"    component={BillingScreen}    options={{title: 'Bills',     headerTitle: 'New Bill', headerShown: false}} />
    <MainTab.Screen name="Inventory"  component={InventoryScreen}  options={{title: 'Stock',     headerTitle: 'Inventory'}} />
    <MainTab.Screen name="Analytics"  component={AnalyticsScreen}  options={{title: 'Reports',   headerTitle: 'Analytics'}} />
    <MainTab.Screen name="More"       component={MoreTabScreen}    options={{title: 'More',      headerShown: false}} />
  </MainTab.Navigator>
);

// ─── Root Navigator ───────────────────────────────────────────────────────────

export const RootNavigator: React.FC = () => {
  const {isAuthenticated, isLoading} = useAuth();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((val: string | null) => {
      setOnboardingDone(val === 'true');
    }).catch(() => setOnboardingDone(true));
  }, []);

  if (isLoading || onboardingDone === null) {
    return <SplashScreen />;
  }

  if (!onboardingDone) {
    const completeOnboarding = async () => {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
      setOnboardingDone(true);
    };
    return <OnboardingScreen onComplete={completeOnboarding} />;
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? (
        <MainNavigator />
      ) : (
        <AuthStack.Navigator screenOptions={{headerShown: false}}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
};

// ─── Animated Splash Screen ────────────────────────────────────────────────────

const SplashScreen: React.FC = () => {
  const logoScale   = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const dotAnim     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale,   {toValue: 1,   useNativeDriver: true, speed: 12, bounciness: 10}),
        Animated.timing(logoOpacity, {toValue: 1,   duration: 350,         useNativeDriver: true}),
      ]),
      Animated.timing(textOpacity, {toValue: 1, duration: 300, delay: 100, useNativeDriver: true}),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, {toValue: 1, duration: 600, useNativeDriver: true}),
        Animated.timing(dotAnim, {toValue: 0, duration: 600, useNativeDriver: true}),
      ]),
    );
    const t = setTimeout(() => loop.start(), 500);
    return () => { clearTimeout(t); loop.stop(); };
  }, [logoScale, logoOpacity, textOpacity, dotAnim]);

  const dotOpacity = dotAnim.interpolate({inputRange: [0, 1], outputRange: [0.4, 1]});

  return (
    <View style={styles.splash}>
      <Animated.View style={[styles.splashLogoWrap, {transform: [{scale: logoScale}], opacity: logoOpacity}]}>
        <View style={styles.splashLogoCircle}>
          <Text style={styles.splashLogoText}>POS</Text>
        </View>
      </Animated.View>
      <Animated.View style={[styles.splashTextWrap, {opacity: textOpacity}]}>
        <Text style={styles.splashName}>SmartPOS AI</Text>
        <Text style={styles.splashTagline}>Intelligent Retail OS</Text>
      </Animated.View>
      <Animated.View style={[styles.splashDots, {opacity: dotOpacity}]}>
        <View style={styles.splashDot} />
        <View style={[styles.splashDot, {opacity: 0.7}]} />
        <View style={[styles.splashDot, {opacity: 0.4}]} />
      </Animated.View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Splash
  splash: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: colors.background,
    gap:             spacing.md,
  },
  splashLogoWrap:   {marginBottom: spacing.sm},
  splashLogoCircle: {
    width:           88,
    height:          88,
    borderRadius:    radius.xxl,
    backgroundColor: colors.primary,
    justifyContent:  'center',
    alignItems:      'center',
    ...shadows.colored(colors.primary),
  },
  splashLogoText: {
    color:         '#fff',
    fontSize:      26,
    fontWeight:    '900',
    letterSpacing: -0.5,
  },
  splashTextWrap:  {alignItems: 'center', gap: spacing.xs},
  splashName: {
    fontSize:      30,
    fontWeight:    '800',
    color:         colors.text,
    letterSpacing: -1,
  },
  splashTagline: {
    ...typography.body2,
    color:         colors.textMuted,
    letterSpacing: 0.3,
  },
  splashDots: {
    flexDirection: 'row',
    gap:           6,
    marginTop:     spacing.xl,
  },
  splashDot: {
    width:           7,
    height:          7,
    borderRadius:    radius.full,
    backgroundColor: colors.primary,
  },

  // Tab bar
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor:  colors.border,
    borderTopWidth:  1,
    height:          60,
    paddingBottom:   6,
    paddingTop:      4,
    ...shadows.md,
    elevation:       12,
  },
  tabIconWrap: {
    width:        36,
    height:       28,
    borderRadius: radius.md,
    alignItems:   'center',
    justifyContent: 'center',
  },
  tabIconEmoji: {fontSize: 20},
  tabIconMore:  {fontSize: 22, fontWeight: '700'},
  tabLabel: {
    fontSize:  10,
    lineHeight: 14,
    marginTop:  1,
  },
  tabLabelActive: {fontWeight: '700'},

  // Header
  header: {
    backgroundColor: colors.surface,
    elevation:       3,
    shadowColor:     '#000',
    shadowOffset:    {width: 0, height: 1},
    shadowOpacity:   0.06,
    shadowRadius:    4,
  },
  headerTitle: {
    fontSize:   18,
    fontWeight: '700',
    color:      colors.text,
  },

  // More tab placeholder
  morePlaceholder: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    backgroundColor: colors.background,
  },
  morePlaceholderText: {
    ...typography.caption,
    color: colors.textMuted,
  },

  // More header bar (when a sub-screen is active)
  moreHeaderBar: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    ...shadows.xs,
  },
  moreBackBtn: {
    paddingVertical:   spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius:      radius.md,
    backgroundColor:   colors.surfaceAlt,
    borderWidth:       1,
    borderColor:       colors.border,
  },
  moreBackText: {
    ...typography.caption,
    color:      colors.primary,
    fontWeight: '700',
  },
  moreHeaderTitle: {
    ...typography.h3,
    color: colors.text,
  },

  // Sheet
  sheetRoot: {
    flex:           1,
    justifyContent: 'flex-end',
  },
  sheetBg: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor:      colors.surface,
    borderTopLeftRadius:  radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop:           spacing.sm,
    paddingBottom:        spacing.xl + spacing.md,
    ...shadows.xl,
    maxHeight:            '75%',
  },
  sheetHandle: {
    width:           40,
    height:          4,
    backgroundColor: colors.border,
    borderRadius:    radius.full,
    alignSelf:       'center',
    marginBottom:    spacing.md,
  },
  sheetTitle: {
    ...typography.h2,
    color:             colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom:      spacing.md,
  },
  sheetScroll: {
    paddingHorizontal: spacing.md,
  },

  // More grid
  moreGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
    paddingBottom: spacing.md,
  },
  moreTileWrap: {
    width: '47%',
  },
  moreTile: {
    backgroundColor: colors.surface,
    borderRadius:    radius.xl,
    padding:         spacing.md,
    borderWidth:     1,
    borderColor:     colors.border,
    gap:             spacing.xs,
    ...shadows.sm,
    minHeight:       110,
  },
  moreTileIcon: {
    width:        44,
    height:       44,
    borderRadius: radius.lg,
    alignItems:   'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  moreTileEmoji: {fontSize: 22},
  moreTileLabel: {
    ...typography.label,
    color:      colors.text,
    fontWeight: '700',
  },
  moreTileSub: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
