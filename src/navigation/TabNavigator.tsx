import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import CraftScreen from '../screens/CraftScreen';
import InfoScreen from '../screens/InfoScreen';
import MapScreen from '../screens/MapScreen';
import MeScreen from '../screens/MeScreen';
import { colors, typography } from '../theme';

const Tab = createBottomTabNavigator();

const TAB_GLYPHS: Record<string, string> = {
  Me: '◉',
  Eat: '🍽',
  Drink: '🥂',
  Do: '✦',
  Craft: '✺',
  Info: 'ⓘ',
};

const TAB_COLORS: Record<string, string> = {
  Me: colors.accent,
  Eat: colors.eat,
  Drink: colors.drink,
  Do: colors.do,
  Craft: colors.craft,
  Info: colors.info,
};

function makeIcon(routeName: string) {
  return ({ focused }: { focused: boolean }) => (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text
        style={{
          fontSize: 18,
          color: focused ? TAB_COLORS[routeName] : colors.textDim,
        }}
      >
        {TAB_GLYPHS[routeName]}
      </Text>
    </View>
  );
}

const EatScreen = () => <MapScreen category="eat" />;
const DrinkScreen = () => <MapScreen category="drink" />;
const DoScreen = () => <MapScreen category="do" />;

export default function TabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Me"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          ...typography.micro,
          fontSize: 10,
        },
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: TAB_COLORS[route.name] ?? colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarIcon: makeIcon(route.name),
      })}
    >
      <Tab.Screen name="Me" component={MeScreen} />
      <Tab.Screen name="Eat" component={EatScreen} />
      <Tab.Screen name="Drink" component={DrinkScreen} />
      <Tab.Screen name="Do" component={DoScreen} />
      <Tab.Screen name="Craft" component={CraftScreen} />
      <Tab.Screen name="Info" component={InfoScreen} />
    </Tab.Navigator>
  );
}
