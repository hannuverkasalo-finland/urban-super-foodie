import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import CityPickerModal from '../components/CityPickerModal';
import MapMarker from '../components/MapMarker';
import PlaceCard from '../components/PlaceCard';
import PlaceDetailModal from '../components/PlaceDetailModal';
import StatusBanner from '../components/StatusBanner';
import { useContentStore } from '../store/contentStore';
import { useLocationStore } from '../store/locationStore';
import { progressKeyFor } from '../store/progressStore';
import { useUserStore } from '../store/userStore';
import { cityKeyFor, prefetchCity } from '../services/prefetchService';
import { colors, radius, spacing, typography } from '../theme';
import type { CuratedPlace, PlaceCategory } from '../types';
import { haversineKm } from '../utils/distance';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.78;

const FALLBACK_REGION: Region = {
  latitude: 35.6762,
  longitude: 139.6503,
  latitudeDelta: 0.18,
  longitudeDelta: 0.18,
};

interface Props {
  category: PlaceCategory;
}

const titles: Record<PlaceCategory, string> = {
  eat: 'Eat',
  drink: 'Drink',
  do: 'Do',
};

const subtitles: Record<PlaceCategory, string> = {
  eat: 'The best places to eat, ranked for you.',
  drink: 'Bars, wine, coffee — your kind of cup.',
  do: 'Things to do worth your time.',
};

const accents: Record<PlaceCategory, string> = {
  eat: colors.eat,
  drink: colors.drink,
  do: colors.do,
};

function placesForCategory(
  category: PlaceCategory,
  content:
    | ReturnType<typeof useContentStore.getState>['cityCache'][string]
    | undefined
): CuratedPlace[] {
  if (!content) return [];
  if (category === 'eat') return content.eatPlaces;
  if (category === 'drink') return content.drinkPlaces;
  return content.doPlaces;
}

function initialRegionFor(
  city: { lat: number; lng: number } | null,
  coords: { lat: number; lng: number } | null
): Region {
  if (city) {
    return {
      latitude: city.lat,
      longitude: city.lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }
  if (coords) {
    return {
      latitude: coords.lat,
      longitude: coords.lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }
  return FALLBACK_REGION;
}

export default function MapScreen({ category }: Props) {
  const city = useLocationStore((s) => s.city);
  const coords = useLocationStore((s) => s.coords);
  const permission = useLocationStore((s) => s.permission);
  const cityCache = useContentStore((s) => s.cityCache);
  const status = useContentStore((s) => s.status);
  const errors = useContentStore((s) => s.errors);
  const preferences = useUserStore((s) => s.preferences);

  const [region, setRegion] = useState<Region>(() =>
    initialRegionFor(city, coords)
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [detailPlace, setDetailPlace] = useState<CuratedPlace | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  // Track which city key we last animated to so a city change (via picker
  // or GPS) re-flies the camera. A boolean would block all future animations.
  const lastAnimatedCityKey = useRef<string | null>(null);
  const haveAnimatedToCoords = useRef(false);
  const locationError = useLocationStore((s) => s.lastError);

  const cityKey = city ? cityKeyFor(city.name, city.country) : null;
  const content = cityKey ? cityCache[cityKey] : undefined;
  const cityStatus = cityKey ? status[cityKey] ?? 'idle' : 'idle';
  const cityError = cityKey ? errors[cityKey] : null;
  const allPlaces = placesForCategory(category, content);

  useEffect(() => {
    if (!city || !cityKey) return;
    if (cityStatus === 'loading' || cityStatus === 'ready') return;
    prefetchCity(city.name, city.country, preferences);
  }, [city, cityKey, cityStatus, preferences]);

  useEffect(() => {
    if (!city || !cityKey) return;
    if (lastAnimatedCityKey.current === cityKey) return;
    lastAnimatedCityKey.current = cityKey;
    mapRef.current?.animateToRegion(
      {
        latitude: city.lat,
        longitude: city.lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      650
    );
  }, [city, cityKey]);

  useEffect(() => {
    if (city) return;
    if (!coords || haveAnimatedToCoords.current) return;
    haveAnimatedToCoords.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: coords.lat,
        longitude: coords.lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      650
    );
  }, [coords, city]);

  const visiblePlaces = useMemo(() => {
    if (!allPlaces.length) return [];
    const halfLat = region.latitudeDelta / 2;
    const halfLng = region.longitudeDelta / 2;
    const center = { lat: region.latitude, lng: region.longitude };
    const inBounds = allPlaces.filter(
      (p) =>
        p.lat >= region.latitude - halfLat &&
        p.lat <= region.latitude + halfLat &&
        p.lng >= region.longitude - halfLng &&
        p.lng <= region.longitude + halfLng
    );
    const ranked = (inBounds.length >= 5 ? inBounds : allPlaces)
      .map((p) => ({
        place: p,
        distanceKm: haversineKm(center, { lat: p.lat, lng: p.lng }),
      }))
      .sort((a, b) => {
        if (a.place.rank === b.place.rank) return a.distanceKm - b.distanceKm;
        return a.place.rank - b.place.rank;
      })
      .slice(0, 10);
    return ranked.map((r) => r.place);
  }, [region, allPlaces]);

  function focusPlace(p: CuratedPlace, index: number) {
    setSelectedId(p.id);
    mapRef.current?.animateToRegion(
      {
        latitude: p.lat,
        longitude: p.lng,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      },
      450
    );
    scrollRef.current?.scrollTo({
      x: index * (CARD_WIDTH + spacing.s),
      animated: true,
    });
  }

  // Tapping a marker or a card opens the full-screen detail modal.
  function openDetail(p: CuratedPlace) {
    setSelectedId(p.id);
    setDetailPlace(p);
  }

  const statusLine =
    locationError && !city
      ? locationError
      : !city && permission !== 'granted'
      ? 'Tap "Pick city" to choose where to explore.'
      : !city
      ? 'Locating you…'
      : cityStatus === 'loading'
      ? `Curating ${titles[category].toLowerCase()} picks for ${city.name}…`
      : cityStatus === 'error'
      ? cityError ?? 'Could not load picks.'
      : allPlaces.length === 0
      ? `No ${titles[category].toLowerCase()} picks yet for ${city.name}.`
      : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{titles[category]}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {city
              ? `${city.name}${city.country ? ', ' + city.country : ''}`
              : permission === 'granted'
              ? 'Locating…'
              : 'No city yet'}
          </Text>
        </View>
        <Pressable
          style={styles.cityButton}
          onPress={() => setPickerVisible(true)}
        >
          <Text style={styles.cityButtonText}>
            {city ? 'Change' : 'Pick city'}
          </Text>
        </Pressable>
      </View>

      {cityKey && (
        <StatusBanner
          scopeKey={progressKeyFor(cityKey, category)}
          accent={accents[category]}
        />
      )}

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegionFor(city, coords)}
          onRegionChangeComplete={setRegion}
          showsUserLocation={permission === 'granted'}
          showsMyLocationButton={false}
          showsPointsOfInterests={false}
          showsBuildings={false}
          showsIndoors={false}
          toolbarEnabled={false}
        >
          {coords && (
            <Marker
              coordinate={{
                latitude: coords.lat,
                longitude: coords.lng,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={true}
            >
              <View style={styles.userDotOuter}>
                <View style={styles.userDotInner} />
              </View>
            </Marker>
          )}
          {visiblePlaces.map((p, i) => (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => openDetail(p)}
              tracksViewChanges={true}
            >
              <MapMarker
                rank={i + 1}
                color={accents[category]}
                selected={selectedId === p.id}
              />
            </Marker>
          ))}
        </MapView>

        {statusLine && (
          <View
            style={[
              styles.statusBanner,
              cityStatus === 'error' && styles.statusError,
            ]}
          >
            <Text style={styles.statusText} numberOfLines={2}>
              {statusLine}
            </Text>
          </View>
        )}

        {!city && (
          <View style={styles.bigCTA}>
            <Pressable
              style={({ pressed }) => [
                styles.bigCTAButton,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => setPickerVisible(true)}
            >
              <Text style={styles.bigCTATitle}>Choose your city</Text>
              <Text style={styles.bigCTABody}>
                Pick where to explore. Picks load in seconds.
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerHeader}>
          {visiblePlaces.length
            ? `Top ${visiblePlaces.length} ${titles[category].toLowerCase()} picks here`
            : subtitles[category]}
        </Text>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH + spacing.s}
          contentContainerStyle={styles.cards}
        >
          {visiblePlaces.length === 0 && (
            <View style={[styles.emptyCard, { width: CARD_WIDTH }]}>
              <Text style={styles.emptyText}>
                {!city
                  ? 'Pick a city to see ranked picks.'
                  : cityStatus === 'loading'
                  ? `Curating picks for ${city.name}…`
                  : cityStatus === 'error'
                  ? cityError ?? 'Could not load picks.'
                  : 'No picks in this area. Pan or zoom out to see more.'}
              </Text>
            </View>
          )}
          {visiblePlaces.map((p, i) => (
            <View key={p.id} style={{ width: CARD_WIDTH }}>
              <PlaceCard
                place={{ ...p, rank: i + 1 }}
                distanceKm={haversineKm(
                  { lat: region.latitude, lng: region.longitude },
                  { lat: p.lat, lng: p.lng }
                )}
                onPress={() => openDetail(p)}
              />
            </View>
          ))}
        </ScrollView>
      </View>

      <CityPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
      />

      <PlaceDetailModal
        place={detailPlace}
        onClose={() => setDetailPlace(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.s,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: { ...typography.h1, color: colors.text },
  subtitle: { ...typography.small, color: colors.textMuted },
  cityButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.bgChip,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: spacing.s,
  },
  cityButtonText: { ...typography.small, color: colors.text },
  mapWrap: { flex: 1, overflow: 'hidden' },
  statusBanner: {
    position: 'absolute',
    top: spacing.m,
    left: spacing.m,
    right: spacing.m,
    padding: spacing.s,
    borderRadius: radius.m,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusError: {
    backgroundColor: 'rgba(120,20,40,0.85)',
    borderColor: colors.danger,
  },
  statusText: { ...typography.small, color: colors.text },
  bigCTA: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.l,
    paddingHorizontal: spacing.l,
  },
  bigCTAButton: {
    backgroundColor: colors.accent,
    padding: spacing.l,
    borderRadius: radius.l,
  },
  bigCTATitle: {
    ...typography.h2,
    color: '#0B0B12',
    marginBottom: 4,
  },
  bigCTABody: {
    ...typography.small,
    color: 'rgba(11,11,18,0.75)',
  },
  userDotOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(91,169,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userDotInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.info,
    borderWidth: 2,
    borderColor: '#fff',
  },
  footer: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.s,
    paddingBottom: spacing.l,
    backgroundColor: colors.bg,
  },
  footerHeader: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.s,
  },
  cards: { gap: spacing.s, paddingRight: spacing.l },
  emptyCard: {
    padding: spacing.l,
    backgroundColor: colors.bgCard,
    borderRadius: radius.l,
  },
  emptyText: { ...typography.body, color: colors.textMuted },
});
